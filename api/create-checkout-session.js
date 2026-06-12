// ============================================================
// API /api/create-checkout-session
// Crée une session Stripe Checkout pour un abonnement
// ============================================================

// Importer Stripe
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LIFETIME_EARLY_BIRD_LIMIT = 100;

async function countLifetimeAccesses() {
  const { count, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id', { count: 'exact', head: true })
    .eq('status', 'lifetime');

  if (error) {
    console.error('Erreur compteur acces a vie:', error.message);
    throw error;
  }

  return count || 0;
}

async function getLifetimeOfferStatus() {
  const sold = await countLifetimeAccesses();
  const remaining = Math.max(LIFETIME_EARLY_BIRD_LIMIT - sold, 0);

  return {
    limit: LIFETIME_EARLY_BIRD_LIMIT,
    sold,
    remaining,
    isEarlyBird: sold < LIFETIME_EARLY_BIRD_LIMIT
  };
}

async function validateStripeCustomer(customerId) {
  if (!customerId) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer && !customer.deleted ? customer : null;
  } catch (error) {
    if (error.code === 'resource_missing' || error.param === 'customer') {
      console.warn('Client Stripe perime ignore:', customerId);
      return null;
    }
    throw error;
  }
}

async function updateStoredCustomer(userId, customerId) {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (error) {
    console.warn('Mise a jour du client Stripe impossible:', error.message);
  }
}

async function findExistingBillingProfile(userId, userEmail) {
  let profile = {
    customerId: null,
    subscriptionId: null,
    status: null
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      profile = {
        customerId: data.stripe_customer_id || null,
        subscriptionId: data.stripe_subscription_id || null,
        status: data.status || null
      };
    }
  } catch (error) {
    console.warn('Recherche client Supabase impossible:', error.message);
  }

  const storedCustomer = await validateStripeCustomer(profile.customerId);
  if (storedCustomer) return profile;

  const customers = await stripe.customers.list({
    email: userEmail,
    limit: 10
  });
  const matchingCustomer = customers.data.find((customer) => !customer.deleted) || null;

  if (matchingCustomer) {
    await updateStoredCustomer(userId, matchingCustomer.id);
    return {
      ...profile,
      customerId: matchingCustomer.id
    };
  }

  if (profile.customerId) {
    await updateStoredCustomer(userId, null);
  }

  return {
    ...profile,
    customerId: null
  };
}

module.exports = async (req, res) => {
  // CORS - permettre l'app web à appeler ce serveur
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Pré-vol CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Seulement POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { plan, userId, userEmail } = req.body;

    if (!plan || !userId || !userEmail) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    let priceId;
    const isLifetime = plan === 'lifetime';
    let lifetimeOffer = null;

    if (plan === 'monthly') {
      priceId = process.env.STRIPE_PRICE_MONTHLY;
    } else if (plan === 'yearly') {
      priceId = process.env.STRIPE_PRICE_YEARLY;
    } else if (isLifetime) {
      lifetimeOffer = await getLifetimeOfferStatus();
      priceId = lifetimeOffer.isEarlyBird
        ? process.env.STRIPE_PRICE_LIFETIME
        : process.env.STRIPE_PRICE_LIFETIME_REGULAR;
    } else {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    if (!priceId) {
      const message = isLifetime && lifetimeOffer && !lifetimeOffer.isEarlyBird
        ? 'Price ID manquant pour Acces a vie regulier (STRIPE_PRICE_LIFETIME_REGULAR)'
        : `Price ID manquant pour le plan ${plan}`;
      return res.status(500).json({ error: message });
    }

    // URL de retour après paiement
    const appUrl = 'https://avantlapaie.com';
    const successUrl = `${appUrl}/?paiement=success`;
    const cancelUrl = `${appUrl}/?paiement=annule`;
    const billingProfile = await findExistingBillingProfile(userId, userEmail);

    if (isLifetime && billingProfile.status === 'lifetime') {
      return res.status(400).json({ error: 'Ton acces a vie est deja actif pour ce compte.' });
    }

    // Créer la session Stripe Checkout
    const checkoutParams = {
      mode: isLifetime ? 'payment' : 'subscription',
      allow_promotion_codes: true,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        plan: plan,
        access_type: isLifetime ? 'lifetime' : 'subscription',
        previous_subscription_id: isLifetime && billingProfile.subscriptionId
          ? billingProfile.subscriptionId
          : '',
        lifetime_offer: lifetimeOffer
          ? (lifetimeOffer.isEarlyBird ? 'early_bird' : 'regular')
          : '',
        lifetime_sold_before_checkout: lifetimeOffer ? String(lifetimeOffer.sold) : '',
        lifetime_limit: lifetimeOffer ? String(lifetimeOffer.limit) : ''
      },
      success_url: `${successUrl}&plan=${plan}`,
      cancel_url: cancelUrl,
      locale: 'fr-CA'
    };

    if (!isLifetime) {
      checkoutParams.subscription_data = {
        trial_period_days: 45,
        metadata: {
          user_id: userId,
          plan: plan
        }
      };
    }

    if (billingProfile.customerId) {
      checkoutParams.customer = billingProfile.customerId;
    } else {
      checkoutParams.customer_email = userEmail;
      if (isLifetime) {
        checkoutParams.customer_creation = 'always';
      }
    }

    const session = await stripe.checkout.sessions.create(checkoutParams);

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      lifetimeOffer
    });

  } catch (error) {
    console.error('Erreur Stripe:', error);
    return res.status(500).json({ error: error.message });
  }
};
