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
    const { userId } = req.body;

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

    const origin = req.headers.origin || 'https://lepresidentsite.github.io';
    const returnUrl = `${origin}/avant-la-paie/`;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Erreur portail Stripe:', error);
    return res.status(500).json({ error: error.message });
  }
};
