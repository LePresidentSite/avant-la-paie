// ============================================================
// API /api/change-subscription-plan
// Change un abonnement Stripe recurrent entre mensuel et annuel
// ============================================================

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

function getPlanPriceId(plan) {
  if (plan === 'monthly') return process.env.STRIPE_PRICE_MONTHLY;
  if (plan === 'yearly') return process.env.STRIPE_PRICE_YEARLY;
  return null;
}

function getPlanLabel(plan) {
  if (plan === 'monthly') return 'PRO mensuel';
  if (plan === 'yearly') return 'PRO annuel';
  return 'PRO';
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
    const { userId, plan } = req.body;

    if (!userId || !plan) {
      return res.status(400).json({ error: 'Donnees manquantes' });
    }

    const priceId = getPlanPriceId(plan);
    if (!priceId) {
      return res.status(400).json({ error: 'Plan invalide ou Price ID manquant' });
    }

    const { data: subscriptionRecord, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!subscriptionRecord?.stripe_subscription_id) {
      return res.status(404).json({
        error: 'Aucun abonnement actif a modifier'
      });
    }

    if (subscriptionRecord.status === 'lifetime') {
      return res.status(400).json({
        error: "Ce compte a deja l'acces a vie"
      });
    }

    const subscription = await stripe.subscriptions.retrieve(
      subscriptionRecord.stripe_subscription_id
    );

    if (['canceled', 'incomplete_expired'].includes(subscription.status)) {
      return res.status(400).json({
        error: 'Cet abonnement ne peut plus etre modifie'
      });
    }

    const item = subscription.items?.data?.[0];
    if (!item?.id) {
      return res.status(400).json({
        error: "Impossible de trouver le plan actuel dans l'abonnement Stripe"
      });
    }

    if (item.price?.id === priceId) {
      return res.status(200).json({
        ok: true,
        unchanged: true,
        message: `Tu es deja sur le plan ${getPlanLabel(plan)}.`
      });
    }

    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      payment_behavior: 'allow_incomplete',
      items: [{
        id: item.id,
        price: priceId
      }],
      metadata: {
        ...subscription.metadata,
        user_id: userId,
        plan
      }
    });

    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status: updated.status,
        stripe_customer_id: updated.customer || subscriptionRecord.stripe_customer_id,
        stripe_subscription_id: updated.id,
        current_period_end: getSubscriptionEnd(updated),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    return res.status(200).json({
      ok: true,
      status: updated.status,
      message: `Ton abonnement est maintenant sur ${getPlanLabel(plan)}.`
    });
  } catch (error) {
    console.error('Erreur changement abonnement:', error);
    return res.status(500).json({ error: error.message });
  }
};
