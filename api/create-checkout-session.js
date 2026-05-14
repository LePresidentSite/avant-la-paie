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

async function findExistingCustomerId(userId, userEmail) {
  try {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (data?.stripe_customer_id) {
      return data.stripe_customer_id;
    }
  } catch (error) {
    console.warn('Recherche client Supabase impossible:', error.message);
  }

  const customers = await stripe.customers.list({
    email: userEmail,
    limit: 1
  });

  return customers.data[0]?.id || null;
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

    if (plan === 'monthly') {
      priceId = process.env.STRIPE_PRICE_MONTHLY;
    } else if (plan === 'yearly') {
      priceId = process.env.STRIPE_PRICE_YEARLY;
    } else if (isLifetime) {
      priceId = process.env.STRIPE_PRICE_LIFETIME;
    } else {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    if (!priceId) {
      return res.status(500).json({ error: `Price ID manquant pour le plan ${plan}` });
    }

    // URL de retour après paiement
    const appUrl = 'https://avantlapaie.com';
    const successUrl = `${appUrl}/?paiement=success`;
    const cancelUrl = `${appUrl}/?paiement=annule`;
    const existingCustomerId = await findExistingCustomerId(userId, userEmail);

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
        access_type: isLifetime ? 'lifetime' : 'subscription'
      },
      success_url: `${successUrl}&plan=${plan}`,
      cancel_url: cancelUrl,
      locale: 'fr-CA'
    };

    if (!isLifetime) {
      checkoutParams.subscription_data = {
        trial_period_days: 30,
        metadata: {
          user_id: userId,
          plan: plan
        }
      };
    }

    if (existingCustomerId) {
      checkoutParams.customer = existingCustomerId;
    } else {
      checkoutParams.customer_email = userEmail;
      if (isLifetime) {
        checkoutParams.customer_creation = 'always';
      }
    }

    const session = await stripe.checkout.sessions.create(checkoutParams);

    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (error) {
    console.error('Erreur Stripe:', error);
    return res.status(500).json({ error: error.message });
  }
};
