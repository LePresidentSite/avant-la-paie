// ============================================================
// API /api/stripe-webhook
// Reçoit les notifications de Stripe (paiements, annulations)
// et met à jour le statut PRO dans Supabase
// ============================================================

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Pour Supabase
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vercel doit recevoir le corps brut (pas parsé) pour vérifier la signature Stripe
module.exports.config = {
  api: {
    bodyParser: false
  }
};

// Helper pour lire le corps brut
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function stripeTimestampToIso(value) {
  if (!value || typeof value !== 'number') return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getSubscriptionEnd(subscription) {
  return stripeTimestampToIso(subscription.current_period_end)
    || stripeTimestampToIso(subscription.trial_end)
    || stripeTimestampToIso(subscription.items?.data?.[0]?.current_period_end)
    || stripeTimestampToIso(subscription.items?.data?.[0]?.current_period?.end);
}

function getSubscriptionUserId(subscription) {
  return subscription.metadata?.user_id
    || subscription.items?.data?.[0]?.metadata?.user_id;
}

function formatMoneyFromCents(amount, currency) {
  const dollars = (amount || 0) / 100;
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: (currency || 'cad').toUpperCase()
  }).format(dollars);
}

function getSubscriptionPlanLabel(subscription) {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const interval = price?.recurring?.interval;
  const amount = price?.unit_amount;
  const currency = price?.currency || 'cad';

  if (interval === 'year') return `Annuel - ${formatMoneyFromCents(amount, currency)}`;
  if (interval === 'month') return `Mensuel - ${formatMoneyFromCents(amount, currency)}`;

  return price?.nickname || price?.id || 'Plan inconnu';
}

async function getCustomerEmail(customerId, fallbackEmail) {
  if (fallbackEmail) return fallbackEmail;
  if (!customerId || typeof customerId !== 'string') return 'courriel inconnu';

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer.email || 'courriel inconnu';
  } catch (error) {
    console.error('Impossible de recuperer le client Stripe:', error.message);
    return 'courriel inconnu';
  }
}

async function getStoredSubscription(userId) {
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Erreur lecture abonnement Supabase:', error.message);
    return null;
  }

  return data || null;
}

async function sendOwnerSms(message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.OWNER_PHONE_NUMBER;

  if (!sid || !token || !from || !to) {
    console.log('SMS non envoye: variables Twilio manquantes.');
    return;
  }

  try {
    const body = new URLSearchParams({
      From: from,
      To: to,
      Body: message
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Erreur SMS Twilio:', response.status, text);
      return;
    }

    console.log('SMS proprietaire envoye.');
  } catch (error) {
    console.error('Erreur envoi SMS Twilio:', error.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Erreur signature webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Webhook reçu:', event.type);

  try {
    switch (event.type) {
      // Quand la session de paiement est complétée
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.user_id;
        const subscriptionId = session.subscription;
        const isLifetime = session.mode === 'payment' || session.metadata?.plan === 'lifetime';

        if (userId && isLifetime) {
          await updateUserSubscription(userId, {
            status: 'lifetime',
            stripe_customer_id: session.customer,
            stripe_subscription_id: null,
            current_period_end: null
          });

          const previousSubscriptionId = session.metadata?.previous_subscription_id;
          if (previousSubscriptionId) {
            try {
              const previousSubscription = await stripe.subscriptions.retrieve(previousSubscriptionId);
              if (!['canceled', 'incomplete_expired'].includes(previousSubscription.status)) {
                await stripe.subscriptions.cancel(previousSubscriptionId, {
                  invoice_now: false,
                  prorate: false
                });
                console.log('Ancien abonnement annule apres acces a vie:', previousSubscriptionId);
              }
            } catch (cancelError) {
              if (cancelError.code === 'resource_missing') {
                console.log('Ancien abonnement deja absent:', previousSubscriptionId);
              } else {
                throw cancelError;
              }
            }
          }

          const email = await getCustomerEmail(
            session.customer,
            session.customer_details?.email || session.customer_email
          );
          const amount = formatMoneyFromCents(session.amount_total, session.currency);

          await sendOwnerSms(`Avant la Paie\nAcces a vie active\nClient: ${email}\nMontant: ${amount}`);
        } else if (userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await updateUserSubscription(userId, {
            status: subscription.status,
            stripe_customer_id: subscription.customer || session.customer,
            stripe_subscription_id: subscriptionId,
            current_period_end: getSubscriptionEnd(subscription)
          });

          const email = await getCustomerEmail(
            subscription.customer || session.customer,
            session.customer_details?.email || session.customer_email
          );
          const plan = getSubscriptionPlanLabel(subscription);
          const statusLabel = subscription.status === 'trialing'
            ? 'Essai PRO commence'
            : 'Nouvel abonnement PRO';

          await sendOwnerSms(`Avant la Paie\n${statusLabel}\nClient: ${email}\nPlan: ${plan}`);
        }
        break;
      }

      // Quand l'abonnement est mis à jour (renouvellement, changement de plan)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;

        if ((invoice.amount_paid || 0) <= 0) {
          console.log('Facture a 0 $, SMS paiement ignore.');
          break;
        }

        const email = await getCustomerEmail(invoice.customer, invoice.customer_email);
        const amount = formatMoneyFromCents(invoice.amount_paid, invoice.currency);

        await sendOwnerSms(`Avant la Paie\nPaiement recu: ${amount}\nClient: ${email}`);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const userId = getSubscriptionUserId(subscription);

        if (userId) {
          const stored = await getStoredSubscription(userId);
          if (stored?.status === 'lifetime') {
            console.log('Mise a jour abonnement ignoree: acces a vie deja actif.');
            break;
          }

          let status = subscription.status; // 'active', 'trialing', 'past_due', 'canceled'

          await updateUserSubscription(userId, {
            status: status,
            stripe_customer_id: subscription.customer,
            stripe_subscription_id: subscription.id,
            current_period_end: getSubscriptionEnd(subscription)
          });
        }
        break;
      }

      // Quand l'abonnement est annulé / expire
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = getSubscriptionUserId(subscription);

        if (userId) {
          const stored = await getStoredSubscription(userId);
          if (stored?.status === 'lifetime') {
            console.log('Annulation abonnement ignoree: acces a vie deja actif.');
            break;
          }

          await updateUserSubscription(userId, {
            status: 'canceled'
          });
        }
        break;
      }
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Erreur traitement webhook:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Helper: mettre à jour le statut dans Supabase
async function updateUserSubscription(userId, data) {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Erreur Supabase:', error);
    throw error;
  }
}
