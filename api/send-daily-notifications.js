// ============================================================
// API /api/send-daily-notifications
// Cron quotidien: envoie les rappels bienveillants FCM
// pour les paiements prevus dans les 24 prochaines heures.
// ============================================================

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const APP_URL = 'https://avantlapaie.com/';
const APP_ICON = `${APP_URL}icon-192.png`;
const TIME_ZONE = 'America/Toronto';

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

function dateInZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function money(value) {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function labelForDate(date, today, tomorrow) {
  if (date === today) return 'aujourd\'hui';
  if (date === tomorrow) return 'demain';
  return 'bientot';
}

function buildBody(item, type, today, tomorrow) {
  const when = labelForDate(item.date, today, tomorrow);
  const emoji = item.emoji || (type === 'saving' ? '✨' : '💛');
  const name = item.name || (type === 'saving' ? 'ton fonds bonheur' : 'ton enveloppe');

  if (type === 'saving') {
    const reserved = money(item.amount);
    const target = item.target_amount ? ` / ${money(item.target_amount)}` : '';
    return `${emoji} ${name} arrive ${when} — ${reserved}${target} deja reserve.`;
  }

  return `${emoji} ${name} de ${money(item.amount)} arrive ${when} — tu es prete ?`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonthUTC(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsPreservingDay(date, months, anchorDay) {
  const monthIndex = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(anchorDay, daysInMonthUTC(year, normalizedMonth));
  return new Date(Date.UTC(year, normalizedMonth, day));
}

function addRecurrenceInterval(date, recurrence, anchorDay) {
  const next = new Date(date.getTime());

  if (recurrence === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (recurrence === 'biweekly') {
    next.setUTCDate(next.getUTCDate() + 14);
    return next;
  }
  if (recurrence === 'monthly') return addMonthsPreservingDay(date, 1, anchorDay);
  if (recurrence === 'quarterly') return addMonthsPreservingDay(date, 3, anchorDay);
  if (recurrence === 'yearly') return addMonthsPreservingDay(date, 12, anchorDay);

  return null;
}

function normalizeRecurrence(value) {
  return ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(value)
    ? value
    : 'once';
}

function expandItemsForReminderWindow(items, today, tomorrow) {
  const start = parseDateOnly(today);
  const end = parseDateOnly(tomorrow);
  if (!start || !end) return [];

  const reminders = [];

  (items || []).forEach(item => {
    const original = parseDateOnly(item.date);
    if (!original) return;

    const recurrence = normalizeRecurrence(item.recurrence);
    if (recurrence === 'once') {
      if (original >= start && original <= end) {
        reminders.push({ ...item, date: formatDateOnly(original) });
      }
      return;
    }

    const anchorDay = original.getUTCDate();
    let occurrence = new Date(original.getTime());
    let guard = 0;

    while (occurrence < start && guard < 1200) {
      const next = addRecurrenceInterval(occurrence, recurrence, anchorDay);
      if (!next || next <= occurrence) return;
      occurrence = next;
      guard += 1;
    }

    while (occurrence <= end && guard < 1300) {
      if (occurrence >= start) {
        reminders.push({ ...item, date: formatDateOnly(occurrence) });
      }

      const next = addRecurrenceInterval(occurrence, recurrence, anchorDay);
      if (!next || next <= occurrence) break;
      occurrence = next;
      guard += 1;
    }
  });

  return reminders;
}

async function notificationAlreadyLogged(supabase, item, type) {
  const { data, error } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('user_id', item.user_id)
    .eq('item_type', type)
    .eq('item_id', item.id)
    .eq('notify_for_date', item.date)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function logAfterSuccessfulSend(supabase, item, type) {
  const { error } = await supabase
    .from('notification_logs')
    .insert({
      user_id: item.user_id,
      item_type: type,
      item_id: item.id,
      notify_for_date: item.date
    });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
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

async function sendForItem(supabase, item, type, tokens, today, tomorrow) {
  const alreadyLogged = await notificationAlreadyLogged(supabase, item, type);
  if (alreadyLogged) return { sent: 0, skipped: 1 };

  const body = buildBody(item, type, today, tomorrow);
  const message = {
    tokens,
    notification: {
      title: 'Avant la Paie',
      body
    },
    data: {
      type,
      itemId: String(item.id),
      itemDate: String(item.date),
      title: 'Avant la Paie',
      body
    },
    webpush: {
      fcmOptions: {
        link: APP_URL
      },
      notification: {
        icon: APP_ICON,
        badge: APP_ICON,
        tag: `avant-la-paie-${type}-${item.id}-${item.date}`,
        renotify: false
      }
    }
  };

  const result = await admin.messaging().sendEachForMulticast(message);
  await disableBadTokens(supabase, tokens, result.responses);

  if (result.successCount > 0) {
    await logAfterSuccessfulSend(supabase, item, type);
  }

  return {
    sent: result.successCount,
    failed: result.failureCount,
    skipped: 0
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  try {
    initFirebaseAdmin();
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const today = dateInZone(now);
    const tomorrow = dateInZone(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    const { data: tokenRows, error: tokenError } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .eq('enabled', true);

    if (tokenError) throw tokenError;
    if (!tokenRows || tokenRows.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, reason: 'Aucun token push' });
    }

    const tokensByUser = tokenRows.reduce((map, row) => {
      if (!map[row.user_id]) map[row.user_id] = [];
      map[row.user_id].push(row.token);
      return map;
    }, {});

    const userIds = Object.keys(tokensByUser);

    const { data: envelopes, error: envelopesError } = await supabase
      .from('envelopes')
      .select('id, user_id, emoji, name, amount, date, recurrence, allocated')
      .in('user_id', userIds)
      .not('date', 'is', null)
      .eq('allocated', false);

    if (envelopesError) throw envelopesError;

    const { data: savings, error: savingsError } = await supabase
      .from('savings')
      .select('id, user_id, emoji, name, amount, target_amount, date')
      .in('user_id', userIds)
      .not('date', 'is', null);

    if (savingsError) throw savingsError;

    const reminderEnvelopes = expandItemsForReminderWindow(envelopes || [], today, tomorrow);
    const reminderSavings = expandItemsForReminderWindow(savings || [], today, tomorrow)
        .filter(item => !item.target_amount || Number(item.amount || 0) < Number(item.target_amount || 0))
        .map(item => ({ ...item, recurrence: 'once' }));

    const items = [
      ...reminderEnvelopes.map(item => ({ type: 'envelope', item })),
      ...reminderSavings.map(item => ({ type: 'saving', item }))
    ];

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of items) {
      const tokens = tokensByUser[entry.item.user_id] || [];
      if (!tokens.length) continue;

      const result = await sendForItem(supabase, entry.item, entry.type, tokens, today, tomorrow);
      sent += result.sent || 0;
      failed += result.failed || 0;
      skipped += result.skipped || 0;
    }

    return res.status(200).json({
      ok: true,
      today,
      tomorrow,
      checked: items.length,
      sent,
      failed,
      skipped
    });
  } catch (error) {
    console.error('Erreur notifications quotidiennes:', error);
    return res.status(500).json({ error: error.message });
  }
};
