// ============================================================
// API /api/notify-signup
// Recoit un webhook Supabase quand un compte est cree.
// ============================================================

const {
  escapeHtml,
  formatDateFr,
  sendAdminEmail
} = require('./_admin-email');

function getWebhookSecret(req) {
  const authorization = req.headers.authorization || req.headers.Authorization || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  return req.headers['x-webhook-secret']
    || req.headers['x-supabase-webhook-secret']
    || req.headers['x-signup-webhook-secret']
    || '';
}

function getRecord(payload) {
  return payload?.record
    || payload?.new
    || payload?.user
    || payload?.data?.record
    || payload?.data?.user
    || payload;
}

function normalizeSource(value) {
  const source = String(value || '').trim();
  if (!source) return 'Non precisee';

  const lower = source.toLowerCase();
  if (lower.includes('presentation')) return 'Page de presentation';
  if (lower.includes('facebook') || lower === 'fb') return 'Facebook';
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('google')) return 'Google';
  if (lower.includes('application') || lower.includes('index')) return 'Application';

  return source;
}

function normalizePlan(value) {
  const plan = String(value || '').trim().toLowerCase();
  if (!plan) return 'Gratuit / non choisi';
  if (plan.includes('month') || plan.includes('mensuel')) return 'PRO mensuel';
  if (plan.includes('year') || plan.includes('annuel')) return 'PRO annuel';
  if (plan.includes('life') || plan.includes('vie')) return 'Acces a vie';
  if (plan.includes('free') || plan.includes('gratuit')) return 'Gratuit';
  return value;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-secret, x-supabase-webhook-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const expectedSecret = process.env.SIGNUP_WEBHOOK_SECRET || process.env.SUPABASE_SIGNUP_WEBHOOK_SECRET;
  if (expectedSecret && getWebhookSecret(req) !== expectedSecret) {
    return res.status(401).json({ error: 'Secret webhook invalide' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const record = getRecord(payload) || {};
    const metadata = record.raw_user_meta_data || record.user_metadata || {};

    const email = record.email || metadata.email || 'courriel inconnu';
    const createdAt = record.created_at || metadata.created_at || new Date().toISOString();
    const source = normalizeSource(metadata.signup_source || metadata.source || metadata.signup_path || payload.source);
    const plan = normalizePlan(metadata.selected_plan || metadata.plan || payload.plan);
    const path = metadata.signup_path || 'Non precise';
    const referrer = metadata.signup_referrer || 'Aucun';

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <h2 style="margin: 0 0 16px;">Nouvelle inscription sur Avant la Paie</h2>
        <p><strong>Courriel :</strong> ${escapeHtml(email)}</p>
        <p><strong>Date :</strong> ${escapeHtml(formatDateFr(createdAt))}</p>
        <p><strong>Source :</strong> ${escapeHtml(source)}</p>
        <p><strong>Forfait au moment de l'inscription :</strong> ${escapeHtml(plan)}</p>
        <p><strong>Chemin :</strong> ${escapeHtml(path)}</p>
        <p><strong>Referent :</strong> ${escapeHtml(referrer)}</p>
      </div>
    `;

    await sendAdminEmail({
      subject: '🎉 Nouvelle inscription sur Avant la Paie',
      html,
      replyTo: email && email !== 'courriel inconnu' ? email : undefined
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erreur notification inscription:', error);
    return res.status(500).json({ error: error.message });
  }
};
