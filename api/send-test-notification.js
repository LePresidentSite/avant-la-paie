// ============================================================
// API /api/send-test-notification
// Envoie une notification de bienvenue/test a l'utilisateur connecte.
// Sert a verifier toute la chaine: app -> token -> Supabase -> FCM.
// ============================================================

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const APP_URL = 'https://avantlapaie.com/';
const APP_ICON = `${APP_URL}icon-192.png`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable Vercel manquante: ${name}`);
  return value;
}

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const privateKey = requireEnv('FIREBASE_PRIVATE_KEY')
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey
    })
  });
}

function getSupabaseAdmin() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function disableBadTokens(supabase, tokens, responses) {
  const invalidTokens = [];

  responses.forEach((response, index) => {
    const code = response.error?.code || '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    await supabase
      .from('push_tokens')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .in('token', invalidTokens);
  }
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  try {
    initFirebaseAdmin();
    const supabase = getSupabaseAdmin();

    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      return res.status(401).json({ error: 'Session manquante' });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Session invalide' });
    }

    const user = userData.user;
    const { data: tokenRows, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', user.id)
      .eq('enabled', true);

    if (tokenError) throw tokenError;

    const tokens = [...new Set((tokenRows || []).map(row => row.token).filter(Boolean))];
    if (!tokens.length) {
      return res.status(404).json({
        ok: false,
        error: 'Aucun appareil actif trouve pour ce compte.'
      });
    }

    const body = 'Tes rappels sont bien actives sur cet appareil. Tu peux respirer.';
    const message = {
      tokens,
      notification: {
        title: 'Avant la Paie',
        body
      },
      data: {
        type: 'test',
        title: 'Avant la Paie',
        body,
        url: APP_URL
      },
      webpush: {
        fcmOptions: {
          link: APP_URL
        },
        notification: {
          icon: APP_ICON,
          badge: APP_ICON,
          tag: `avant-la-paie-test-${user.id}`,
          renotify: false
        }
      }
    };

    const result = await admin.messaging().sendEachForMulticast(message);
    await disableBadTokens(supabase, tokens, result.responses);

    return res.status(200).json({
      ok: result.successCount > 0,
      tokenCount: tokens.length,
      sent: result.successCount,
      failed: result.failureCount,
      errors: result.responses
        .filter(response => !response.success)
        .map(response => response.error?.message || response.error?.code || 'Erreur inconnue')
    });
  } catch (error) {
    console.error('Erreur notification test:', error);
    return res.status(500).json({ error: error.message });
  }
};
