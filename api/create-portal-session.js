// ============================================================
// API /api/create-portal-session
// Ouvre le portail client Stripe pour gerer/annuler l'abonnement
// ============================================================

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findCustomerByEmail(email) {
  if (!email) return null;

  const customers = await stripe.customers.list({
    email,
    limit: 10
  });

  return customers.data.find(customer => !customer.deleted) || null;
}

async function saveCustomerId(userId, customerId) {
  if (!userId || !customerId) return;

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.warn('Impossible de mettre a jour le client Stripe:', error.message);
  }
}

async function createPortalSession(customerId, returnUrl) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  try {
    const { userId, userEmail } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Utilisateur manquant' });
    }

    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (error || !subscription || !subscription.stripe_customer_id) {
      return res.status(404).json({
        error: 'Aucun abonnement Stripe trouve pour ce compte'
      });
    }

    const returnUrl = 'https://avantlapaie.com/';
    let customerId = subscription.stripe_customer_id;

    try {
      const session = await createPortalSession(customerId, returnUrl);
      return res.status(200).json({ url: session.url });
    } catch (portalError) {
      if (portalError.code !== 'resource_missing') {
        throw portalError;
      }

      console.warn('Client Stripe introuvable, recherche par courriel:', customerId);
    }

    const customer = await findCustomerByEmail(userEmail);
    if (!customer?.id) {
      return res.status(404).json({
        code: 'customer_not_found',
        error: 'Aucun client Stripe actif trouve pour ce courriel'
      });
    }

    customerId = customer.id;
    await saveCustomerId(userId, customerId);

    const session = await createPortalSession(customerId, returnUrl);
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Erreur portail Stripe:', error);
    return res.status(500).json({ error: error.message });
  }
};
