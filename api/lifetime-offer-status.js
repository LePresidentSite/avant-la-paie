// ============================================================
// API /api/lifetime-offer-status
// Expose le compteur public de l'offre Early Bird "Acces a vie"
// ============================================================

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  try {
    const sold = await countLifetimeAccesses();
    const remaining = Math.max(LIFETIME_EARLY_BIRD_LIMIT - sold, 0);

    return res.status(200).json({
      limit: LIFETIME_EARLY_BIRD_LIMIT,
      sold,
      remaining,
      isEarlyBird: sold < LIFETIME_EARLY_BIRD_LIMIT,
      earlyBirdPrice: '39,99 $',
      regularPrice: '99 $'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
