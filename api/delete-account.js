// ============================================================
// API /api/delete-account
// Supprime completement un compte utilisateur et ses donnees.
// ============================================================

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const {
  escapeHtml,
  formatDateFr,
  sendAdminEmail
} = require('./_admin-email');

const USER_DATA_TABLES = [
  'notification_logs',
  'push_tokens',
  'budget_adjustments',
  'revenus',
  'envelopes',
  'savings',
  'subscriptions'
];

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function shouldIgnoreMissingStripeResource(error) {
  return error?.code === 'resource_missing'
    || error?.message?.toLowerCase().includes('no such');
}

function shouldIgnoreMissingTable(error) {
  return error?.code === '42P01'
    || error?.message?.toLowerCase().includes('could not find the table');
}

async function cancelStripeSubscription(subscriptionId) {
  if (!subscriptionId) return;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      await stripe.subscriptions.cancel(subscriptionId, {
        invoice_now: false,
        prorate: false
      });
    }
  } catch (error) {
    if (!shouldIgnoreMissingStripeResource(error)) throw error;
    console.warn('Abonnement Stripe introuvable ou deja supprime:', subscriptionId);
  }
}

async function deleteStripeCustomer(customerId) {
  if (!customerId) return;

  try {
    await stripe.customers.del(customerId);
  } catch (error) {
    if (!shouldIgnoreMissingStripeResource(error)) throw error;
    console.warn('Client Stripe introuvable ou deja supprime:', customerId);
  }
}

async function deleteRowsForUser(table, userId) {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('user_id', userId);

  if (error && !shouldIgnoreMissingTable(error)) {
    throw error;
  }

  if (error) {
    console.warn(`Table ignoree pendant la suppression (${table}):`, error.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  try {
    const token = getBearerToken(req);
    const { confirmText } = req.body || {};

    if (confirmText !== 'SUPPRIMER') {
      return res.status(400).json({ error: 'Confirmation invalide' });
    }

    if (!token) {
      return res.status(401).json({ error: 'Session manquante' });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return res.status(401).json({ error: 'Session invalide ou expiree' });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || 'courriel inconnu';

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (subscriptionError && !shouldIgnoreMissingTable(subscriptionError)) {
      throw subscriptionError;
    }

    if (subscription?.stripe_subscription_id && subscription.status !== 'lifetime') {
      await cancelStripeSubscription(subscription.stripe_subscription_id);
    }

    if (subscription?.stripe_customer_id) {
      await deleteStripeCustomer(subscription.stripe_customer_id);
    }

    for (const table of USER_DATA_TABLES) {
      await deleteRowsForUser(table, userId);
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    try {
      await sendAdminEmail({
        subject: '🗑️ Compte supprime - Avant la Paie',
        html: `
          <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <h2 style="margin: 0 0 16px;">Compte supprime</h2>
            <p><strong>Courriel :</strong> ${escapeHtml(userEmail)}</p>
            <p><strong>Date :</strong> ${escapeHtml(formatDateFr(new Date()))}</p>
            <p><strong>Statut abonnement avant suppression :</strong> ${escapeHtml(subscription?.status || 'aucun')}</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Erreur email suppression compte:', emailError.message);
    }

    return res.status(200).json({
      ok: true,
      message: "Ton compte a ete supprime. Merci d'avoir essaye Avant la Paie. Tu peux toujours revenir si tu changes d'avis!"
    });
  } catch (error) {
    console.error('Erreur suppression compte:', error);
    return res.status(500).json({ error: error.message });
  }
};
