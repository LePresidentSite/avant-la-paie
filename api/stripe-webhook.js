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

        if (userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await updateUserSubscription(userId, {
            status: subscription.status,
            stripe_customer_id: subscription.customer || session.customer,
            stripe_subscription_id: subscriptionId,
            current_period_end: getSubscriptionEnd(subscription)
          });
        }
        break;
      }

      // Quand l'abonnement est mis à jour (renouvellement, changement de plan)
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const userId = getSubscriptionUserId(subscription);

        if (userId) {
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
        const userId = subscription.metadata?.user_id;

        if (userId) {
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
