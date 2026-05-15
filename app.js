// ============================================================
// Avant la Paie - v3
// Authentification Supabase + données dans le nuage
// ============================================================

// PRESETS pour enveloppes (dépenses)
const PRESETS_ENV = [
  { emoji: '🏠', name: 'Loyer / Hypothèque' },
  { emoji: '🛒', name: 'Épicerie' },
  { emoji: '⚡', name: 'Électricité' },
  { emoji: '📱', name: 'Téléphone' },
  { emoji: '🌐', name: 'Internet' },
  { emoji: '🚗', name: 'Transport' },
  { emoji: '⛽', name: 'Essence' },
  { emoji: '💊', name: 'Médicaments' },
  { emoji: '🏥', name: 'Santé' },
  { emoji: '🎉', name: 'Plaisir' },
  { emoji: '☕', name: 'Café / Resto' },
  { emoji: '💰', name: 'Épargne' },
  { emoji: '🎁', name: 'Cadeaux' },
  { emoji: '👶', name: 'Enfants' },
  { emoji: '🐾', name: 'Animaux' }
];

const PRESETS_REV = [
  { emoji: '💼', name: 'Paie principale' },
  { emoji: '💵', name: 'Paie secondaire' },
  { emoji: '🏛️', name: 'Allocation famille' },
  { emoji: '👶', name: 'Soutien aux enfants' },
  { emoji: '📊', name: 'Aide sociale' },
  { emoji: '🤝', name: 'Pension alimentaire' },
  { emoji: '💸', name: 'Travail à côté' },
  { emoji: '🎯', name: 'Contrat ponctuel' },
  { emoji: '🎁', name: 'Cadeau / Remboursement' },
  { emoji: '📈', name: 'Placement / Dividende' },
  { emoji: '🏖️', name: 'Pension / Retraite' }
];

const EMOJIS_ENV = ['🏠','🛒','⚡','💧','📱','🌐','🚗','⛽','💊','🏥','🎉','☕','💰','🎁','👶','🐾','📚','👕','🎮','✈️','🍕','🧾'];
const EMOJIS_REV = ['💼','💵','💰','🏛️','📊','🤝','💸','🎯','🎁','📈','🏖️','👶','📱','🏠','🎨','✨','💎','🪙'];

// État global
let currentUser = null;
let currentSubscription = null;
let state = {
  revenus: [],
  envelopes: []
};

let editing = { type: null, id: null };
let selectedEmoji = '💼';
let selectedRecurrence = 'once';

// ============================================================
// GESTION DES ÉCRANS
// ============================================================
function showScreen(screenId) {
  ['loadingScreen', 'welcomeScreen', 'signupScreen', 'loginScreen', 'proScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('mainApp').classList.remove('show');

  if (screenId === 'main') {
    document.getElementById('mainApp').classList.add('show');
  } else {
    document.getElementById(screenId).style.display = 'flex';
  }
}

// ============================================================
// AUTHENTIFICATION
// ============================================================

// Vérifier si l'utilisateur est déjà connecté au démarrage
async function checkAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      await loadSubscription();
      await loadUserData();
      showScreen('main');
      render();
      // Vérifier si retour de paiement
      checkPaymentReturn();
    } else {
      showScreen('welcomeScreen');
    }
  } catch (e) {
    console.error('Erreur auth:', e);
    showScreen('welcomeScreen');
  }
}

// Vérifier le statut d'abonnement
async function loadSubscription() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();

    if (!error && data) {
      currentSubscription = data;
    } else {
      currentSubscription = null;
    }
  } catch (e) {
    currentSubscription = null;
  }
}

// Vérifier si on revient d'un paiement
function checkPaymentReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  const paiement = urlParams.get('paiement');

  if (paiement === 'success') {
    // Nettoyer l'URL
    window.history.replaceState({}, document.title, window.location.pathname);
    // Recharger le statut après quelques secondes (le temps que le webhook arrive)
    setTimeout(async () => {
      await loadSubscription();
      render();
      alert('🎉 Bienvenue dans PRO!\n\nTon essai de 30 jours est activé.\nTu peux annuler à tout moment.');
    }, 2000);
  } else if (paiement === 'annule') {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Statut PRO?
function isProUser() {
  if (!currentSubscription) return false;
  const status = currentSubscription.status;
  return status === 'active' || status === 'trialing';
}

// Inscription
async function signUp(email, password) {
  const errorEl = document.getElementById('signupError');
  const successEl = document.getElementById('signupSuccess');
  const btn = document.getElementById('signupSubmitBtn');

  errorEl.classList.remove('show');
  successEl.classList.remove('show');

  if (!email || !password) {
    errorEl.textContent = 'Remplis tous les champs';
    errorEl.classList.add('show');
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = 'Le mot de passe doit avoir au moins 8 caractères';
    errorEl.classList.add('show');
    return;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    errorEl.textContent = 'Le mot de passe doit contenir : 1 minuscule, 1 majuscule et 1 chiffre';
    errorEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Création en cours…';

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          trial_started_at: new Date().toISOString()
        }
      }
    });

    if (error) {
      errorEl.textContent = traduireErreur(error.message);
      errorEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Créer mon compte';
      return;
    }

    if (data.user) {
      // Si confirmation email désactivée, connexion immédiate
      if (data.session) {
        currentUser = data.user;
        await initUserProfile();
        await loadSubscription();
        await loadUserData();
        showScreen('main');
        render();
      } else {
        // Confirmation par email activée
        successEl.textContent = '✓ Compte créé! Vérifie ton courriel pour confirmer.';
        successEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Créer mon compte';
      }
    }
  } catch (e) {
    errorEl.textContent = 'Erreur : ' + (e.message || 'inconnue');
    errorEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Créer mon compte';
  }
}

// Connexion
async function signIn(email, password) {
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginSubmitBtn');
  errorEl.classList.remove('show');

  if (!email || !password) {
    errorEl.textContent = 'Remplis tous les champs';
    errorEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connexion…';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      errorEl.textContent = traduireErreur(error.message);
      errorEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Se connecter';
      return;
    }

    currentUser = data.user;
    await loadSubscription();
    await loadUserData();
    showScreen('main');
    render();
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  } catch (e) {
    errorEl.textContent = 'Erreur : ' + (e.message || 'inconnue');
    errorEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
}

// Déconnexion
async function signOut() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentSubscription = null;
  state = { revenus: [], envelopes: [] };
  showScreen('welcomeScreen');
}

// Traduire les erreurs Supabase
function traduireErreur(msg) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Courriel ou mot de passe incorrect';
  if (m.includes('user already registered')) return 'Ce courriel a déjà un compte. Connecte-toi.';
  if (m.includes('email not confirmed')) return 'Tu dois confirmer ton courriel d\'abord.';
  if (m.includes('password should be')) return 'Mot de passe trop faible (min 8 caractères avec maj/min/chiffres)';
  if (m.includes('rate limit')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (m.includes('network')) return 'Pas de connexion Internet. Vérifie ta connexion.';
  return msg;
}

// ============================================================
// DONNÉES UTILISATEUR (Supabase)
// ============================================================

// Initialiser le profil après inscription
async function initUserProfile() {
  if (!currentUser) return;
  // Pour l'instant, rien à faire — on créera les tables plus tard
}

// Charger les données depuis Supabase
async function loadUserData() {
  if (!currentUser) return;

  try {
    // Charger revenus
    const { data: revs, error: revErr } = await supabaseClient
      .from('revenus')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: true });

    if (!revErr && revs) {
      state.revenus = revs.map(r => ({
        id: r.id,
        emoji: r.emoji,
        name: r.name,
        amount: parseFloat(r.amount),
        date: r.date || '',
        received: r.received,
        recurrence: r.recurrence || 'once'
      }));
    }

    // Charger enveloppes
    const { data: envs, error: envErr } = await supabaseClient
      .from('envelopes')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });

    if (!envErr && envs) {
      state.envelopes = envs.map(e => ({
        id: e.id,
        emoji: e.emoji,
        name: e.name,
        amount: parseFloat(e.amount),
        allocated: e.allocated,
        date: e.date || '',
        recurrence: e.recurrence || 'once'
      }));
    }
  } catch (e) {
    console.error('Erreur chargement données:', e);
  }
}

// Sauvegarder un revenu
async function saveRevenu(rev, isNew) {
  if (!currentUser) return null;
  try {
    if (isNew) {
      const { data, error } = await supabaseClient
        .from('revenus')
        .insert({
          user_id: currentUser.id,
          emoji: rev.emoji,
          name: rev.name,
          amount: rev.amount,
          date: rev.date || null,
          received: rev.received || false,
          recurrence: rev.recurrence || 'once'
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { error } = await supabaseClient
        .from('revenus')
        .update({
          emoji: rev.emoji,
          name: rev.name,
          amount: rev.amount,
          date: rev.date || null,
          received: rev.received,
          recurrence: rev.recurrence || 'once'
        })
        .eq('id', rev.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      return rev;
    }
  } catch (e) {
    console.error('Erreur sauvegarde revenu:', e);
    alert('Erreur de sauvegarde : ' + e.message);
    return null;
  }
}

async function deleteRevenu(id) {
  if (!currentUser) return;
  try {
    await supabaseClient.from('revenus').delete().eq('id', id).eq('user_id', currentUser.id);
  } catch (e) {
    console.error('Erreur suppression revenu:', e);
  }
}

// Sauvegarder une enveloppe
async function saveEnvelope(env, isNew) {
  if (!currentUser) return null;
  try {
    if (isNew) {
      const { data, error } = await supabaseClient
        .from('envelopes')
        .insert({
          user_id: currentUser.id,
          emoji: env.emoji,
          name: env.name,
          amount: env.amount,
          allocated: env.allocated || false,
          date: env.date || null,
          recurrence: env.recurrence || 'once'
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { error } = await supabaseClient
        .from('envelopes')
        .update({
          emoji: env.emoji,
          name: env.name,
          amount: env.amount,
          allocated: env.allocated,
          date: env.date || null,
          recurrence: env.recurrence || 'once'
        })
        .eq('id', env.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      return env;
    }
  } catch (e) {
    console.error('Erreur sauvegarde enveloppe:', e);
    alert('Erreur de sauvegarde : ' + e.message);
    return null;
  }
}

async function deleteEnvelope(id) {
  if (!currentUser) return;
  try {
    await supabaseClient.from('envelopes').delete().eq('id', id).eq('user_id', currentUser.id);
  } catch (e) {
    console.error('Erreur suppression enveloppe:', e);
  }
}

// ============================================================
// UTILITAIRES
// ============================================================
function fmt(n) {
  if (isNaN(n)) n = 0;
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2
  }).format(n);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function formatDateShort(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr + 'T00:00:00');
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function daysUntil(dStr) {
  if (!dStr) return null;
  const target = new Date(dStr + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target - now) / 86400000);
}

// Étiquettes des récurrences
function getRecurrenceLabel(rec) {
  switch (rec) {
    case 'weekly': return '🔁 Hebdo';
    case 'biweekly': return '🔁 Aux 2 sem';
    case 'monthly': return '🔁 Mensuel';
    case 'quarterly': return '🔁 Trim';
    case 'yearly': return '🔁 Annuel';
    default: return '';
  }
}

// Compte combien d'éléments sont récurrents
function countRecurrent() {
  const recRev = state.revenus.filter(r => r.recurrence && r.recurrence !== 'once').length;
  const recEnv = state.envelopes.filter(e => e.recurrence && e.recurrence !== 'once').length;
  return recRev + recEnv;
}

// Renouveler un cycle: décocher reçus/déposés ET avancer les dates
async function renewCycle() {
  if (!confirm('Démarrer un nouveau cycle?\n\nÇa va :\n• Décocher toutes les enveloppes récurrentes\n• Avancer les dates des revenus récurrents\n• Garder les éléments "une seule fois" tels quels\n\nContinuer?')) return;

  const btn = document.getElementById('newCycleBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Renouvellement...';

  try {
    // Renouveler revenus récurrents
    for (const r of state.revenus) {
      if (r.recurrence && r.recurrence !== 'once') {
        r.received = false;
        if (r.date) {
          r.date = advanceDate(r.date, r.recurrence);
        }
        await saveRevenu(r, false);
      }
    }
    // Renouveler enveloppes récurrentes
    for (const e of state.envelopes) {
      if (e.recurrence && e.recurrence !== 'once') {
        e.allocated = false;
        await saveEnvelope(e, false);
      }
    }
    render();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }

  btn.disabled = false;
  btn.textContent = '🔄 Nouveau cycle';
}

// Avancer une date selon la récurrence
function advanceDate(dateStr, recurrence) {
  const d = new Date(dateStr + 'T00:00:00');
  switch (recurrence) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Calculer les jours restants de l'essai
function getTrialDaysLeft() {
  if (!currentUser || !currentUser.user_metadata || !currentUser.user_metadata.trial_started_at) {
    return 30;
  }
  const start = new Date(currentUser.user_metadata.trial_started_at);
  const now = new Date();
  const daysUsed = Math.floor((now - start) / 86400000);
  return Math.max(0, 30 - daysUsed);
}

// ============================================================
// RENDU PRINCIPAL
// ============================================================
function render() {
  // Date
  const today = new Date();
  document.getElementById('todayDate').textContent =
    today.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });

  // Barre "Nouveau cycle" si éléments récurrents
  const recCount = countRecurrent();
  const cycleBar = document.getElementById('cycleBar');
  const cycleText = document.getElementById('cycleBarText');
  if (recCount > 0) {
    cycleBar.style.display = 'flex';
    cycleText.textContent = recCount === 1
      ? `Tu as 1 élément récurrent`
      : `Tu as ${recCount} éléments récurrents`;
  } else {
    cycleBar.style.display = 'none';
  }

  // Avatar utilisateur
  if (currentUser) {
    const email = currentUser.email || '';
    const initial = email[0] ? email[0].toUpperCase() : 'U';
    document.getElementById('userBtn').textContent = initial;
    document.getElementById('userEmail').textContent = email;

    // Statut PRO vs Essai
    const planEl = document.getElementById('userPlan');
    const upgradeBtn = document.getElementById('upgradeBtn');

    if (currentSubscription) {
      const status = currentSubscription.status;
      if (status === 'trialing') {
        const periodEnd = currentSubscription.current_period_end;
        if (periodEnd) {
          const daysLeft = Math.ceil((new Date(periodEnd) - new Date()) / 86400000);
          planEl.textContent = daysLeft > 0 ? `⏳ Essai PRO · ${daysLeft}j restants` : '✨ PRO actif';
        } else {
          planEl.textContent = '⏳ Essai PRO actif';
        }
        upgradeBtn.style.display = 'none';
      } else if (status === 'active') {
        planEl.textContent = '✨ PRO actif';
        planEl.style.color = 'var(--good)';
        upgradeBtn.style.display = 'none';
      } else if (status === 'past_due') {
        planEl.textContent = '⚠️ Paiement en attente';
        planEl.style.color = 'var(--warn)';
        upgradeBtn.style.display = 'block';
      } else {
        // canceled, etc
        const daysLeft = getTrialDaysLeft();
        planEl.textContent = daysLeft > 0 ? `⏳ Essai · ${daysLeft}j restants` : '⚠️ Essai terminé';
        upgradeBtn.style.display = 'block';
      }
    } else {
      // Pas d'abonnement = en essai gratuit (calculé depuis la date d'inscription)
      const daysLeft = getTrialDaysLeft();
      planEl.textContent = daysLeft > 0 ? `⏳ Essai · ${daysLeft}j restants` : '⚠️ Essai terminé';
      upgradeBtn.style.display = 'block';
    }
  }

  // Total revenus
  const totalRevenus = state.revenus.reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
  const receivedCount = state.revenus.filter(r => r.received).length;

  document.getElementById('revenusCount').textContent =
    `${receivedCount} / ${state.revenus.length} reçus`;

  const totalBox = document.getElementById('totalRevenusBox');
  if (state.revenus.length > 0) {
    totalBox.style.display = 'block';
    document.getElementById('totalRevenusAmount').textContent = fmt(totalRevenus);

    const upcoming = state.revenus
      .filter(r => r.date && !r.received)
      .map(r => ({ ...r, days: daysUntil(r.date) }))
      .filter(r => r.days !== null && r.days >= 0)
      .sort((a,b) => a.days - b.days);

    const cd = document.getElementById('countdown');
    if (upcoming.length > 0) {
      const next = upcoming[0];
      if (next.days > 0) {
        cd.innerHTML = `Prochain revenu : ${escapeHtml(next.name)} dans <b>${next.days} jour${next.days>1?'s':''}</b>`;
      } else {
        cd.innerHTML = `<b>${escapeHtml(next.name)} est prévu aujourd'hui!</b>`;
      }
    } else if (state.revenus.every(r => r.received)) {
      cd.innerHTML = `Tous les revenus sont reçus 🎉`;
    } else {
      cd.innerHTML = `Ajoute une date pour suivre les paies à venir`;
    }
  } else {
    totalBox.style.display = 'none';
  }

  // Liste revenus
  const revBox = document.getElementById('revenusList');
  revBox.innerHTML = '';
  state.revenus.forEach(r => {
    const days = daysUntil(r.date);
    let when = '';
    if (r.date) {
      if (days === 0) when = `<span class="when">aujourd'hui</span>`;
      else if (days > 0) when = `<span class="when">dans ${days}j</span>`;
      else when = `<span class="when">${formatDateShort(r.date)}</span>`;
    }
    const recBadge = (r.recurrence && r.recurrence !== 'once')
      ? `<span class="rec-badge green">${getRecurrenceLabel(r.recurrence)}</span>` : '';
    const div = document.createElement('div');
    div.className = 'item' + (r.received ? ' received' : '');
    div.innerHTML = `
      <div class="item-emoji">${r.emoji}</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(r.name)}${recBadge}</div>
        <div class="item-amount"><strong class="green">${fmt(r.amount)}</strong>${when}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn check ${r.received?'on':''}" data-rev-toggle="${r.id}">${r.received?'✓':'○'}</button>
        <button class="icon-btn" data-rev-edit="${r.id}">✎</button>
      </div>
    `;
    revBox.appendChild(div);
  });

  // Reste à allouer
  const totalAlloc = state.envelopes.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const remain = totalRevenus - totalAlloc;

  const amountEl = document.getElementById('remainingAmount');
  const subEl = document.getElementById('remainingSub');
  amountEl.textContent = fmt(remain);
  amountEl.classList.remove('good','warn','over');

  if (state.revenus.length === 0) {
    subEl.textContent = 'Commence par ajouter tes revenus ci-dessus';
  } else if (remain < 0) {
    amountEl.classList.add('over');
    subEl.textContent = `Tu dépasses tes revenus de ${fmt(-remain)} — réduis une enveloppe`;
  } else if (remain === 0) {
    amountEl.classList.add('good');
    subEl.textContent = 'Chaque dollar a une mission. Bravo. 🎯';
  } else if (totalRevenus > 0 && remain < totalRevenus * 0.1) {
    amountEl.classList.add('good');
    subEl.textContent = 'Presque tout est attribué — il reste un petit coussin';
  } else {
    amountEl.classList.add('warn');
    subEl.textContent = 'Continue à répartir avant que la paie arrive';
  }

  const pct = totalRevenus > 0 ? Math.min(100, (totalAlloc / totalRevenus) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';

  // Enveloppes
  const envBox = document.getElementById('envelopesList');
  envBox.innerHTML = '';

  if (state.envelopes.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:18px;text-align:center;color:var(--ink-soft);font-style:italic;font-size:13px;';
    empty.textContent = 'Aucune enveloppe encore.';
    envBox.appendChild(empty);
  } else {
    state.envelopes.forEach(env => {
      const recBadge = (env.recurrence && env.recurrence !== 'once')
        ? `<span class="rec-badge">${getRecurrenceLabel(env.recurrence)}</span>` : '';
      const div = document.createElement('div');
      div.className = 'item' + (env.allocated ? ' allocated' : '');
      div.innerHTML = `
        <div class="item-emoji">${env.emoji}</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(env.name)}${recBadge}</div>
          <div class="item-amount">${fmt(env.amount)}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn check ${env.allocated?'on':''}" data-env-toggle="${env.id}">${env.allocated?'✓':'○'}</button>
          <button class="icon-btn" data-env-edit="${env.id}">✎</button>
        </div>
      `;
      envBox.appendChild(div);
    });
  }

  const allocCount = state.envelopes.filter(e => e.allocated).length;
  document.getElementById('envCount').textContent =
    `${allocCount} / ${state.envelopes.length} déposées`;
}

// ============================================================
// MODAL D'ÉDITION
// ============================================================
function openModal(type, item = null) {
  editing = { type, id: item ? item.id : null };

  const isRev = type === 'revenu';
  const emojis = isRev ? EMOJIS_REV : EMOJIS_ENV;
  const presets = isRev ? PRESETS_REV : PRESETS_ENV;

  selectedEmoji = item ? item.emoji : (isRev ? '💼' : '🏠');

  const title = item ? (isRev ? 'Modifier le revenu' : 'Modifier l\'enveloppe')
                     : (isRev ? 'Nouveau revenu' : 'Nouvelle enveloppe');
  const badge = isRev ? '<span class="badge green">Revenu</span>' : '<span class="badge">Dépense</span>';
  document.getElementById('modalTitle').innerHTML = title + ' ' + badge;

  document.getElementById('nameLabel').textContent = isRev ? 'Source du revenu' : 'Nom de l\'enveloppe';
  document.getElementById('amountLabel').textContent = isRev ? 'Montant prévu' : 'Montant à mettre de côté';
  document.getElementById('dateField').style.display = isRev ? 'block' : 'none';
  document.getElementById('presetsLabel').textContent = isRev ? 'Sources rapides' : 'Suggestions rapides';
  document.getElementById('itemName').placeholder = isRev ? 'ex. Paie principale' : 'ex. Épicerie';

  const primary = document.getElementById('saveBtn');
  primary.classList.toggle('green', isRev);

  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemAmount').value = item ? item.amount : '';
  document.getElementById('itemDate').value = item && item.date ? item.date : '';
  document.getElementById('deleteBtn').style.display = item ? 'block' : 'none';

  selectedRecurrence = item ? (item.recurrence || 'once') : 'once';
  renderRecurrencePick(isRev);

  renderEmojiPick(emojis, isRev);
  renderPresets(presets);
  updateDateButton();

  document.getElementById('modal').classList.add('show');
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
  editing = { type: null, id: null };
}

function renderEmojiPick(emojis, isRev) {
  const box = document.getElementById('emojiPick');
  box.innerHTML = '';
  emojis.forEach(em => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    if (em === selectedEmoji) {
      b.classList.add('sel');
      if (isRev) b.classList.add('green');
    }
    b.onclick = (e) => {
      e.preventDefault();
      selectedEmoji = em;
      renderEmojiPick(emojis, isRev);
    };
    box.appendChild(b);
  });
}

function renderPresets(presets) {
  const row = document.getElementById('presetRow');
  row.innerHTML = '';
  presets.forEach(p => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'preset-chip';
    c.textContent = `${p.emoji} ${p.name}`;
    c.onclick = (e) => {
      e.preventDefault();
      document.getElementById('itemName').value = p.name;
      selectedEmoji = p.emoji;
      const isRev = editing.type === 'revenu';
      const emojis = isRev ? EMOJIS_REV : EMOJIS_ENV;
      renderEmojiPick(emojis, isRev);
    };
    row.appendChild(c);
  });
}

function renderRecurrencePick(isRev) {
  const buttons = document.querySelectorAll('#recurrencePick .rec-btn');
  buttons.forEach(btn => {
    const rec = btn.dataset.rec;
    btn.classList.toggle('sel', rec === selectedRecurrence);
    btn.classList.toggle('green', isRev);
    btn.onclick = (e) => {
      e.preventDefault();
      selectedRecurrence = rec;
      renderRecurrencePick(isRev);
    };
  });
}

// ============================================================
// CALENDRIER
// ============================================================
let calCurrentMonth = new Date();
calCurrentMonth.setDate(1);

function updateDateButton() {
  const val = document.getElementById('itemDate').value;
  const btn = document.getElementById('itemDateBtn');
  const lbl = document.getElementById('itemDateLabel');
  if (val) {
    const d = new Date(val + 'T00:00:00');
    lbl.textContent = d.toLocaleDateString('fr-CA', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
    });
    btn.classList.remove('empty');
  } else {
    lbl.textContent = 'Choisir une date';
    btn.classList.add('empty');
  }
}

function openCalendar() {
  const val = document.getElementById('itemDate').value;
  if (val) {
    const d = new Date(val + 'T00:00:00');
    calCurrentMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  } else {
    const today = new Date();
    calCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  renderCalendar();
  document.getElementById('calOverlay').classList.add('show');
}

function closeCalendar() {
  document.getElementById('calOverlay').classList.remove('show');
}

function renderCalendar() {
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const year = calCurrentMonth.getFullYear();
  const month = calCurrentMonth.getMonth();
  document.getElementById('calTitle').textContent = `${months[month]} ${year}`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'cal-day other';
    d.textContent = prevMonthLastDay - i;
    d.disabled = true;
    grid.appendChild(d);
  }

  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const selectedVal = document.getElementById('itemDate').value;
  const selected = selectedVal ? new Date(selectedVal + 'T00:00:00') : null;

  for (let d = 1; d <= lastDay; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = d;

    const thisDate = new Date(year, month, d);
    if (thisDate.getTime() === today.getTime()) btn.classList.add('today');
    if (selected && thisDate.getTime() === selected.getTime()) btn.classList.add('selected');

    btn.onclick = () => {
      const yyyy = year;
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      document.getElementById('itemDate').value = `${yyyy}-${mm}-${dd}`;
      updateDateButton();
      closeCalendar();
    };
    grid.appendChild(btn);
  }

  const totalCells = grid.children.length;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'cal-day other';
    d.textContent = i;
    d.disabled = true;
    grid.appendChild(d);
  }
}

// ============================================================
// EVENTS
// ============================================================

// Écrans d'authentification
document.getElementById('goSignupBtn').onclick = () => showScreen('signupScreen');
document.getElementById('goLoginBtn').onclick = () => showScreen('loginScreen');
document.getElementById('switchToLogin').onclick = () => showScreen('loginScreen');
document.getElementById('switchToSignup').onclick = () => showScreen('signupScreen');

document.getElementById('signupSubmitBtn').onclick = () => {
  signUp(
    document.getElementById('signupEmail').value.trim(),
    document.getElementById('signupPassword').value
  );
};

document.getElementById('loginSubmitBtn').onclick = () => {
  signIn(
    document.getElementById('loginEmail').value.trim(),
    document.getElementById('loginPassword').value
  );
};

// Enter key dans les champs
['signupEmail','signupPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('signupSubmitBtn').click();
  });
});
['loginEmail','loginPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('loginSubmitBtn').click();
  });
});

document.getElementById('forgotPassword').onclick = async () => {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    alert('Entre ton courriel dans le champ ci-dessus d\'abord');
    return;
  }
  try {
    await supabaseClient.auth.resetPasswordForEmail(email);
    alert('Si ce courriel a un compte, tu vas recevoir un lien pour réinitialiser ton mot de passe.');
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
};

// Menu utilisateur
document.getElementById('userBtn').onclick = (e) => {
  e.stopPropagation();
  document.getElementById('userDropdown').classList.toggle('show');
};
document.addEventListener('click', () => {
  document.getElementById('userDropdown').classList.remove('show');
});

document.getElementById('logoutBtn').onclick = () => {
  if (confirm('Te déconnecter?')) signOut();
};

document.getElementById('upgradeBtn').onclick = () => {
  document.getElementById('userDropdown').classList.remove('show');
  showScreen('proScreen');
};

// Bouton retour sur la page PRO
document.getElementById('proBackBtn').onclick = () => {
  showScreen('main');
};

// Fonction pour démarrer un abonnement
async function startSubscription(plan) {
  if (!currentUser) {
    alert('Tu dois être connecté(e)');
    return;
  }

  const btn = plan === 'yearly' ? document.getElementById('subscribeYearlyBtn') : document.getElementById('subscribeMonthlyBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Redirection vers Stripe…';

  try {
    const response = await fetch(`${API_URL}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: plan,
        userId: currentUser.id,
        userEmail: currentUser.email
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.url) {
      // Rediriger vers Stripe Checkout
      window.location.href = data.url;
    } else {
      throw new Error('Pas d\'URL de paiement reçue');
    }
  } catch (e) {
    alert('Erreur : ' + e.message + '\n\nVérifie ta connexion Internet et réessaie.');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('subscribeMonthlyBtn').onclick = () => startSubscription('monthly');
document.getElementById('subscribeYearlyBtn').onclick = () => startSubscription('yearly');

// App
document.getElementById('addRevenuBtn').onclick = () => openModal('revenu');
document.getElementById('addEnvBtn').onclick = () => openModal('envelope');

// Bouton "Nouveau cycle"
document.getElementById('newCycleBtn').onclick = renewCycle;
document.getElementById('cancelBtn').onclick = closeModal;

document.getElementById('saveBtn').onclick = async () => {
  const name = document.getElementById('itemName').value.trim();
  const amount = parseFloat(document.getElementById('itemAmount').value) || 0;
  const date = document.getElementById('itemDate').value;
  if (!name) { alert('Donne un nom'); return; }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Sauvegarde…';

  if (editing.type === 'revenu') {
    if (editing.id) {
      const r = state.revenus.find(x => x.id === editing.id);
      if (r) {
        r.name = name; r.amount = amount; r.emoji = selectedEmoji; r.date = date;
        r.recurrence = selectedRecurrence;
        await saveRevenu(r, false);
      }
    } else {
      const newRev = {
        emoji: selectedEmoji, name, amount, date,
        received: false,
        recurrence: selectedRecurrence
      };
      const saved = await saveRevenu(newRev, true);
      if (saved) {
        state.revenus.push({
          id: saved.id,
          emoji: saved.emoji,
          name: saved.name,
          amount: parseFloat(saved.amount),
          date: saved.date || '',
          received: saved.received,
          recurrence: saved.recurrence || 'once'
        });
      }
    }
  } else {
    if (editing.id) {
      const e = state.envelopes.find(x => x.id === editing.id);
      if (e) {
        e.name = name; e.amount = amount; e.emoji = selectedEmoji;
        e.date = date;
        e.recurrence = selectedRecurrence;
        await saveEnvelope(e, false);
      }
    } else {
      const newEnv = {
        emoji: selectedEmoji, name, amount, allocated: false,
        date,
        recurrence: selectedRecurrence
      };
      const saved = await saveEnvelope(newEnv, true);
      if (saved) {
        state.envelopes.push({
          id: saved.id,
          emoji: saved.emoji,
          name: saved.name,
          amount: parseFloat(saved.amount),
          allocated: saved.allocated,
          date: saved.date || '',
          recurrence: saved.recurrence || 'once'
        });
      }
    }
  }

  btn.disabled = false;
  btn.textContent = 'Enregistrer';
  closeModal();
  render();
};

document.getElementById('deleteBtn').onclick = async () => {
  if (!editing.id) return;
  if (!confirm('Supprimer cet élément?')) return;
  if (editing.type === 'revenu') {
    await deleteRevenu(editing.id);
    state.revenus = state.revenus.filter(r => r.id !== editing.id);
  } else {
    await deleteEnvelope(editing.id);
    state.envelopes = state.envelopes.filter(e => e.id !== editing.id);
  }
  closeModal();
  render();
};

document.body.addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.revToggle) {
    const r = state.revenus.find(x => x.id === t.dataset.revToggle);
    if (r) {
      r.received = !r.received;
      await saveRevenu(r, false);
      render();
    }
  } else if (t.dataset.revEdit) {
    const r = state.revenus.find(x => x.id === t.dataset.revEdit);
    if (r) openModal('revenu', r);
  } else if (t.dataset.envToggle) {
    const e2 = state.envelopes.find(x => x.id === t.dataset.envToggle);
    if (e2) {
      e2.allocated = !e2.allocated;
      await saveEnvelope(e2, false);
      render();
    }
  } else if (t.dataset.envEdit) {
    const e2 = state.envelopes.find(x => x.id === t.dataset.envEdit);
    if (e2) openModal('envelope', e2);
  }
});

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.getElementById('resetBtn').onclick = async () => {
  if (!confirm('Effacer TOUTES tes données et recommencer à zéro? Cette action est irréversible.')) return;

  try {
    await supabaseClient.from('revenus').delete().eq('user_id', currentUser.id);
    await supabaseClient.from('envelopes').delete().eq('user_id', currentUser.id);
    state = { revenus: [], envelopes: [] };
    render();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
};

// Calendrier events
document.getElementById('itemDateBtn').addEventListener('click', function(e) {
  e.preventDefault(); e.stopPropagation();
  openCalendar();
});
document.getElementById('calOverlay').addEventListener('click', function(e) {
  if (e.target.id === 'calOverlay') closeCalendar();
});
document.getElementById('calClose').addEventListener('click', closeCalendar);
document.getElementById('calPrev').addEventListener('click', function(e) {
  e.preventDefault();
  calCurrentMonth.setMonth(calCurrentMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', function(e) {
  e.preventDefault();
  calCurrentMonth.setMonth(calCurrentMonth.getMonth() + 1);
  renderCalendar();
});
document.getElementById('calToday').addEventListener('click', function(e) {
  e.preventDefault();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('itemDate').value = `${yyyy}-${mm}-${dd}`;
  updateDateButton();
  closeCalendar();
});
document.getElementById('calClear').addEventListener('click', function(e) {
  e.preventDefault();
  document.getElementById('itemDate').value = '';
  updateDateButton();
  closeCalendar();
});

// ============================================================
// VUE CALENDRIER (nouvelle)
// ============================================================
let currentView = 'main'; // 'main' ou 'calendar'
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let calSelectedDate = null; // 'YYYY-MM-DD' ou null

// Basculer entre vue principale et calendrier
document.getElementById('viewToggleBtn').onclick = () => {
  if (currentView === 'main') {
    showCalendarView();
  } else {
    showMainView();
  }
};

function showMainView() {
  currentView = 'main';
  document.getElementById('viewMain').style.display = 'block';
  document.getElementById('viewCalendar').style.display = 'none';
  document.getElementById('viewToggleBtn').textContent = '📅';
  document.getElementById('viewToggleBtn').classList.remove('active');
}

function showCalendarView() {
  currentView = 'calendar';
  document.getElementById('viewMain').style.display = 'none';
  document.getElementById('viewCalendar').style.display = 'block';
  document.getElementById('viewToggleBtn').textContent = '📋';
  document.getElementById('viewToggleBtn').classList.add('active');
  // Forcer aujourd'hui sélectionné par défaut
  if (!calSelectedDate) {
    const t = new Date();
    calSelectedDate = formatDateISO(t);
    calMonth = t.getMonth();
    calYear = t.getFullYear();
  }
  renderCalendarView();
}

// Format date en YYYY-MM-DD
function formatDateISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Navigation mois précédent/suivant
document.getElementById('calPrevBtn').onclick = () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendarView();
};

document.getElementById('calNextBtn').onclick = () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendarView();
};

// Calculer toutes les occurrences pour un item
function getOccurrences(item, fromDate, toDate) {
  if (!item.date) return [];

  const startDate = new Date(item.date + 'T00:00:00');
  const occurrences = [];

  // Si pas récurrent: une seule occurrence
  if (!item.recurrence || item.recurrence === 'once') {
    if (startDate >= fromDate && startDate <= toDate) {
      occurrences.push({ ...item, occDate: formatDateISO(startDate) });
    }
    return occurrences;
  }

  // Avancer date jusqu'à fromDate
  let current = new Date(startDate);

  // Si date originale est dans le passé, avancer jusqu'au présent
  const MAX_ITERATIONS = 1000;
  let iter = 0;

  // Inclure toutes les occurrences dans la plage [fromDate, toDate]
  // On part de la date originale et on avance
  while (current <= toDate && iter < MAX_ITERATIONS) {
    if (current >= fromDate) {
      occurrences.push({ ...item, occDate: formatDateISO(current) });
    }
    // Avancer selon récurrence
    switch (item.recurrence) {
      case 'weekly': current.setDate(current.getDate() + 7); break;
      case 'biweekly': current.setDate(current.getDate() + 14); break;
      case 'monthly': current.setMonth(current.getMonth() + 1); break;
      case 'quarterly': current.setMonth(current.getMonth() + 3); break;
      case 'yearly': current.setFullYear(current.getFullYear() + 1); break;
      default: return occurrences;
    }
    iter++;
  }

  return occurrences;
}

// Récupérer toutes les occurrences (revenus + enveloppes) pour une plage
function getAllOccurrences(fromDate, toDate) {
  const result = [];

  state.revenus.forEach(r => {
    const occs = getOccurrences(r, fromDate, toDate);
    occs.forEach(o => result.push({ ...o, kind: 'revenu' }));
  });

  state.envelopes.forEach(e => {
    // Pour les enveloppes, on utilise leur date si elle existe (la date originale)
    // Sinon on utilise leur date de création comme date de référence
    if (e.date) {
      const occs = getOccurrences(e, fromDate, toDate);
      occs.forEach(o => result.push({ ...o, kind: 'envelope' }));
    }
  });

  return result;
}

// Rendre la vue calendrier
function renderCalendarView() {
  // Titre du mois
  const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  document.getElementById('calMonthTitle').textContent = `${monthNames[calMonth]} ${calYear}`;

  // Calculer les jours du mois
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startWeekday = firstDay.getDay(); // 0=dim, 6=sam
  const daysInMonth = lastDay.getDate();

  // Plage pour calculer occurrences (1 mois entier)
  const fromDate = new Date(calYear, calMonth, 1);
  const toDate = new Date(calYear, calMonth + 1, 0);
  toDate.setHours(23, 59, 59, 999);

  const allOccs = getAllOccurrences(fromDate, toDate);

  // Grouper par date
  const occsByDate = {};
  allOccs.forEach(o => {
    if (!occsByDate[o.occDate]) occsByDate[o.occDate] = [];
    occsByDate[o.occDate].push(o);
  });

  // Aujourd'hui
  const today = new Date();
  const todayISO = formatDateISO(today);

  // Construire la grille
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Cases vides au début
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // Jours du mois
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(calYear, calMonth, day);
    const iso = formatDateISO(d);
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = day;

    if (iso === todayISO) btn.classList.add('today');
    if (iso === calSelectedDate) btn.classList.add('selected');

    // Points colorés
    const occs = occsByDate[iso] || [];
    if (occs.length > 0) {
      const dotsBox = document.createElement('div');
      dotsBox.className = 'cal-dots';
      const hasIncome = occs.some(o => o.kind === 'revenu');
      const hasExpense = occs.some(o => o.kind === 'envelope');
      if (hasIncome) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot income';
        dotsBox.appendChild(dot);
      }
      if (hasExpense) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot expense';
        dotsBox.appendChild(dot);
      }
      btn.appendChild(dotsBox);
    }

    btn.onclick = () => {
      calSelectedDate = iso;
      renderCalendarView();
    };

    grid.appendChild(btn);
  }

  // Liste sous le calendrier — afficher prochains paiements à partir de la date sélectionnée
  renderCalendarList();
}

// Rendre la liste des paiements à venir
function renderCalendarList() {
  const list = document.getElementById('calList');
  const titleEl = document.getElementById('calSelectedTitle');

  // Date de départ: sélectionnée, ou aujourd'hui
  const startDate = calSelectedDate
    ? new Date(calSelectedDate + 'T00:00:00')
    : new Date();
  startDate.setHours(0, 0, 0, 0);

  // Plage: 60 jours à venir depuis la date de départ
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 60);

  const allOccs = getAllOccurrences(startDate, endDate);

  // Trier par date
  allOccs.sort((a, b) => a.occDate.localeCompare(b.occDate));

  // Titre
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = calSelectedDate === formatDateISO(today);
  if (isToday) {
    titleEl.textContent = 'Prochains paiements';
  } else if (calSelectedDate) {
    const d = new Date(calSelectedDate + 'T00:00:00');
    const days = ['dim','lun','mar','mer','jeu','ven','sam'];
    const months = ['jan','fév','mar','avr','mai','juin','juil','août','sept','oct','nov','déc'];
    titleEl.textContent = `À partir du ${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  } else {
    titleEl.textContent = 'Prochains paiements';
  }

  list.innerHTML = '';

  if (allOccs.length === 0) {
    list.innerHTML = '<div class="cal-empty">Aucun paiement prévu sur les 60 prochains jours.<br><span style="font-size:12px;">Ajoute des éléments récurrents dans la vue principale.</span></div>';
    return;
  }

  // Grouper par date
  const byDate = {};
  allOccs.forEach(o => {
    if (!byDate[o.occDate]) byDate[o.occDate] = [];
    byDate[o.occDate].push(o);
  });

  // Afficher chaque groupe
  Object.keys(byDate).sort().forEach(dateISO => {
    const items = byDate[dateISO];
    const d = new Date(dateISO + 'T00:00:00');
    const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const dayLabel = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;

    const groupEl = document.createElement('div');
    groupEl.className = 'cal-day-group';
    groupEl.innerHTML = `
      <div class="cal-day-group-title">${dayLabel}</div>
      <div class="cal-day-group-count">${items.length} paiement${items.length>1?'s':''}</div>
    `;
    list.appendChild(groupEl);

    items.forEach(item => {
      const daysFromNow = Math.round((d - today) / 86400000);
      let when;
      if (daysFromNow === 0) when = 'aujourd\'hui';
      else if (daysFromNow === 1) when = 'demain';
      else if (daysFromNow > 1) when = `dans ${daysFromNow} jours`;
      else when = `il y a ${-daysFromNow}j`;

      const meta = [];
      meta.push(`${d.getDate()} ${months[d.getMonth()].substring(0,3)}`.toUpperCase());
      meta.push(when.toUpperCase());
      if (item.recurrence && item.recurrence !== 'once') {
        meta.push(getRecurrenceLabel(item.recurrence).replace('🔁 ', '').toUpperCase());
      }

      const itemEl = document.createElement('div');
      itemEl.className = 'cal-item ' + (item.kind === 'revenu' ? 'income' : '');
      itemEl.innerHTML = `
        <div class="cal-item-emoji">${item.emoji}</div>
        <div class="cal-item-info">
          <div class="cal-item-name">${escapeHtml(item.name)}</div>
          <div class="cal-item-meta">${meta.join(' · ')}</div>
        </div>
        <div class="cal-item-amount">${fmt(item.amount)}</div>
      `;
      list.appendChild(itemEl);
    });
  });
}

// Quand on revient sur la vue principale ou qu'on update les données, rafraîchir le calendrier aussi
const originalRender = render;
render = function() {
  originalRender.apply(this, arguments);
  if (currentView === 'calendar') {
    renderCalendarView();
  }
};

// ============================================================
// INIT
// ============================================================
checkAuth();
