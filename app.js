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

const PRESETS_SAVE = [
  { emoji: '🛟', name: 'Sécurité' },
  { emoji: '✈️', name: 'Voyage' },
  { emoji: '🛋️', name: 'Sofa' },
  { emoji: '🎄', name: 'Noël' },
  { emoji: '🚗', name: 'Auto' },
  { emoji: '🏠', name: 'Maison' },
  { emoji: '🦷', name: 'Dentiste' },
  { emoji: '🎓', name: 'Études' },
  { emoji: '✨', name: 'Projet perso' }
];

const EMOJIS_SAVE = ['🛟','💛','✨','✈️','🛋️','🎄','🚗','🏠','🦷','🎓','💰','🌱','🎁','💎','☂️','🔒','🧘','🧡'];

// État global
let currentUser = null;
let currentSubscription = null;
const STRIPE_PORTAL_LOGIN_URL = 'https://billing.stripe.com/p/login/14A5kE7C9fmoduWb5veQM00';
const FREE_LIMITS = {
  revenus: 1,
  envelopes: 5
};
let state = {
  revenus: [],
  envelopes: [],
  savings: []
};

let editing = { type: null, id: null };
let selectedEmoji = '💼';
let selectedRecurrence = 'once';
let upcomingMonth = new Date();
upcomingMonth.setDate(1);
let selectedUpcomingDate = null;
let pushRegistrationInProgress = false;
let pushForegroundListenerAttached = false;

// ============================================================
// GESTION DES ÉCRANS
// ============================================================
function trackVirtualPage(screenId) {
  if (typeof gtag !== 'function') return;

  const pages = {
    welcomeScreen: { slug: 'accueil', title: 'Accueil' },
    signupScreen: { slug: 'inscription', title: 'Inscription' },
    loginScreen: { slug: 'connexion', title: 'Connexion' },
    proScreen: { slug: 'pro', title: 'Passer à PRO' },
    billingScreen: { slug: 'facturation', title: 'Facturation et abonnement' },
    main: { slug: 'application', title: 'Application' }
  };

  const page = pages[screenId];
  if (!page) return;

  const basePath = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.replace(/\/[^/]*$/, '/');
  const pagePath = `${basePath}${page.slug}`;

  gtag('event', 'page_view', {
    page_title: `Avant la Paie - ${page.title}`,
    page_location: `${window.location.origin}${pagePath}`,
    page_path: pagePath
  });
}

function showScreen(screenId) {
  ['loadingScreen', 'welcomeScreen', 'signupScreen', 'loginScreen', 'proScreen', 'billingScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('mainApp').classList.remove('show');

  if (screenId === 'main') {
    document.getElementById('mainApp').classList.add('show');
  } else {
    document.getElementById(screenId).style.display = 'flex';
  }

  trackVirtualPage(screenId);
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
      ensurePushNotifications({ ask: false });
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
  const plan = urlParams.get('plan');

  if (paiement === 'success') {
    // Nettoyer l'URL
    window.history.replaceState({}, document.title, window.location.pathname);
    // Recharger le statut après quelques secondes (le temps que le webhook arrive)
    setTimeout(async () => {
      await loadSubscription();
      render();
      const message = plan === 'lifetime'
        ? '🎉 Bienvenue dans PRO!\n\nTon accès à vie est activé. Même accès que PRO, sans date d’expiration.'
        : '🎉 Bienvenue dans PRO!\n\nTon essai de 30 jours est activé.\nTu peux gérer ton abonnement depuis Mon compte → Facturation et abonnement.';
      alert(message);
    }, 2000);
  } else if (paiement === 'annule') {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Statut PRO?
function isProUser() {
  if (!currentSubscription) return false;
  const status = currentSubscription.status;
  if (status === 'lifetime') return true;
  if (status === 'active') return true;
  if (status !== 'trialing') return false;

  if (!currentSubscription.current_period_end) return true;
  return new Date(currentSubscription.current_period_end) > new Date();
}

function getStripeTrialDaysLeft() {
  if (!currentSubscription || currentSubscription.status !== 'trialing' || !currentSubscription.current_period_end) {
    return null;
  }
  return Math.max(0, Math.ceil((new Date(currentSubscription.current_period_end) - new Date()) / 86400000));
}

function showProPrompt(title, message) {
  alert(`${title}\n\n${message}\n\nPRO débloque les revenus illimités, les enveloppes illimitées, les récurrences et le calendrier complet.`);
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  showScreen('proScreen');
}

function canCreateRevenu() {
  if (isProUser()) return true;
  if (state.revenus.length < FREE_LIMITS.revenus) return true;
  showProPrompt(
    'Limite gratuite atteinte',
    `Le plan gratuit permet ${FREE_LIMITS.revenus} source de revenu. Passe à PRO pour ajouter plusieurs revenus.`
  );
  return false;
}

function canCreateEnvelope() {
  if (isProUser()) return true;
  if (state.envelopes.length < FREE_LIMITS.envelopes) return true;
  showProPrompt(
    'Limite gratuite atteinte',
    `Le plan gratuit permet ${FREE_LIMITS.envelopes} enveloppes de dépenses. Passe à PRO pour en ajouter autant que nécessaire.`
  );
  return false;
}

function canUseProFeature(featureName) {
  if (isProUser()) return true;
  showProPrompt('Fonction PRO', `${featureName} fait partie de la version PRO.`);
  return false;
}

// ============================================================
// NOTIFICATIONS PUSH (Firebase Cloud Messaging)
// ============================================================

function hasFirebasePushConfig() {
  return typeof FIREBASE_CONFIG !== 'undefined'
    && FIREBASE_CONFIG
    && FIREBASE_CONFIG.apiKey
    && typeof FIREBASE_VAPID_KEY !== 'undefined'
    && FIREBASE_VAPID_KEY;
}

function isIOSDevice() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalonePWA() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function getUnsupportedPushMessage() {
  if (isIOSDevice()) {
    if (!isStandalonePWA()) {
      return "Sur iPhone, les rappels fonctionnent seulement quand l'app est installee sur l'ecran d'accueil. Ouvre avantlapaie.com dans Safari, touche Partager, puis Ajouter a l'ecran d'accueil.";
    }

    return "Les rappels ne sont pas disponibles avec ce navigateur sur iPhone. Ouvre l'app depuis son icone sur l'ecran d'accueil.";
  }

  return 'Ce navigateur ne supporte pas les notifications push pour cette app. Essaie avec Chrome ou Edge.';
}

async function isPushSupported() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  if (typeof firebase === 'undefined' || !firebase.messaging) return false;
  if (!hasFirebasePushConfig()) return false;

  try {
    if (typeof firebase.messaging.isSupported === 'function') {
      return await firebase.messaging.isSupported();
    }
  } catch (e) {
    console.warn('Notifications push non supportees:', e);
    return false;
  }

  return true;
}

function initFirebaseAppOnce() {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
}

async function savePushToken(token) {
  if (!currentUser || !token) return;

  const { error } = await supabaseClient
    .from('push_tokens')
    .upsert({
      user_id: currentUser.id,
      email: currentUser.email || null,
      token,
      platform: 'web',
      enabled: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'token'
    });

  if (error) throw error;
}

async function ensurePushNotifications(options = {}) {
  if (!currentUser) {
    return { ok: false, message: 'Tu dois être connectée pour activer les rappels.' };
  }
  if (pushRegistrationInProgress) {
    return { ok: false, message: 'Activation déjà en cours. Réessaie dans quelques secondes.' };
  }

  if (!(await isPushSupported())) {
    return { ok: false, message: getUnsupportedPushMessage() };
  }

  const shouldAsk = options.ask === true;
  if (Notification.permission === 'denied') {
    return { ok: false, message: 'Les notifications sont bloquées dans ton navigateur. Il faut les réactiver dans les paramètres du site.' };
  }
  if (Notification.permission === 'default' && !shouldAsk) {
    return { ok: false, message: 'Permission de notification pas encore demandée.' };
  }

  pushRegistrationInProgress = true;

  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') {
      return { ok: false, message: 'Permission refusée. Les rappels ne seront pas envoyés sur cet appareil.' };
    }

    initFirebaseAppOnce();
    const registration = await navigator.serviceWorker.register('sw.js?v=41');
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      await savePushToken(token);
    } else {
      return { ok: false, message: 'Firebase n’a pas retourné de jeton de notification.' };
    }

    if (!pushForegroundListenerAttached) {
      messaging.onMessage(payload => {
        const title = payload.notification?.title || payload.data?.title || 'Avant la Paie';
        const body = payload.notification?.body || payload.data?.body || 'Petit rappel bienveillant.';

        if (Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: 'icon-192.png',
            badge: 'icon-192.png'
          });
        }
      });
      pushForegroundListenerAttached = true;
    }

    return { ok: true, message: 'Rappels activés sur cet appareil.' };
  } catch (e) {
    console.warn('Notifications push non activees:', e);
    if (isIOSDevice() && /push service error|registration failed|not supported|unsupported/i.test(e.message || '')) {
      return { ok: false, message: getUnsupportedPushMessage() };
    }
    return { ok: false, message: e.message || 'Impossible d’activer les rappels pour le moment.' };
  } finally {
    pushRegistrationInProgress = false;
  }
}

// Inscription
async function signUp(email, password, passwordConfirm) {
  const errorEl = document.getElementById('signupError');
  const successEl = document.getElementById('signupSuccess');
  const btn = document.getElementById('signupSubmitBtn');

  errorEl.classList.remove('show');
  successEl.classList.remove('show');

  if (!email || !password || !passwordConfirm) {
    errorEl.textContent = 'Remplis tous les champs';
    errorEl.classList.add('show');
    return;
  }
  if (password !== passwordConfirm) {
    errorEl.textContent = 'Les deux mots de passe ne sont pas identiques';
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
        ensurePushNotifications({ ask: true });
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
    ensurePushNotifications({ ask: true });
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
  state = { revenus: [], envelopes: [], savings: [] };
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
        target_amount: e.target_amount !== null && e.target_amount !== undefined ? parseFloat(e.target_amount) : null,
        allocated: e.allocated,
        date: e.date || '',
        recurrence: e.recurrence || 'once'
      }));
    }

    // Charger mises de côté
    const { data: saves, error: saveErr } = await supabaseClient
      .from('savings')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });

    if (!saveErr && saves) {
      state.savings = saves.map(s => ({
        id: s.id,
        emoji: s.emoji || '💛',
        name: s.name,
        amount: parseFloat(s.amount) || 0,
        target_amount: s.target_amount !== null && s.target_amount !== undefined ? parseFloat(s.target_amount) : null,
        date: s.date || ''
      }));
    } else {
      state.savings = [];
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
          target_amount: env.target_amount || null,
          date: env.date || null,
          allocated: env.allocated || false,
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
          target_amount: env.target_amount || null,
          date: env.date || null,
          allocated: env.allocated,
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

// Sauvegarder une mise de côté
async function saveSaving(saving, isNew) {
  if (!currentUser) return null;
  try {
    const payload = {
      user_id: currentUser.id,
      emoji: saving.emoji || '💛',
      name: saving.name,
      amount: saving.amount || 0,
      target_amount: saving.target_amount || null,
      date: saving.date || null
    };

    if (isNew) {
      const { data, error } = await supabaseClient
        .from('savings')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { error } = await supabaseClient
        .from('savings')
        .update({
          emoji: payload.emoji,
          name: payload.name,
          amount: payload.amount,
          target_amount: payload.target_amount,
          date: payload.date,
          updated_at: new Date().toISOString()
        })
        .eq('id', saving.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      return saving;
    }
  } catch (e) {
    console.error('Erreur sauvegarde mise de côté:', e);
    alert('Erreur de sauvegarde : ' + e.message);
    return null;
  }
}

async function deleteSaving(id) {
  if (!currentUser) return;
  try {
    await supabaseClient.from('savings').delete().eq('id', id).eq('user_id', currentUser.id);
  } catch (e) {
    console.error('Erreur suppression mise de côté:', e);
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

function getDateStatusLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return '';
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  if (d > 1) return `dans ${d}j`;
  return `en retard ${Math.abs(d)}j`;
}

function getUpcomingPayments() {
  return state.envelopes
    .filter(env => env.date && !env.allocated)
    .map(env => ({ ...env, days: daysUntil(env.date) }))
    .sort((a, b) => {
      if (a.days !== b.days) return a.days - b.days;
      return String(a.name).localeCompare(String(b.name), 'fr-CA');
    });
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLong(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr + 'T00:00:00');
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function selectFirstUpcomingDateInVisibleMonth() {
  const match = getUpcomingPayments().find(item => {
    const itemDate = new Date(item.date + 'T00:00:00');
    return sameMonth(itemDate, upcomingMonth);
  });
  selectedUpcomingDate = match
    ? match.date
    : isoDate(new Date(upcomingMonth.getFullYear(), upcomingMonth.getMonth(), 1));
}

function updateUpcomingButton() {
  const btn = document.getElementById('upcomingBtn');
  const sub = document.getElementById('upcomingCardSub');
  if (!btn) return;
  const upcoming = getUpcomingPayments();

  if (sub) {
    if (upcoming.length === 0) {
      sub.textContent = 'Ajoute une date à tes enveloppes';
    } else {
      const next = upcoming[0];
      sub.textContent = `${upcoming.length} paiement${upcoming.length > 1 ? 's' : ''} · Prochain : ${next.name} ${getDateStatusLabel(next.date)}`;
    }
  }
}

function openUpcomingPopup() {
  const upcoming = getUpcomingPayments();
  if (upcoming.length > 0) {
    const firstDate = selectedUpcomingDate || upcoming[0].date;
    selectedUpcomingDate = firstDate;
    upcomingMonth = new Date(firstDate + 'T00:00:00');
    upcomingMonth.setDate(1);
  } else {
    selectedUpcomingDate = isoDate(new Date());
    upcomingMonth = new Date();
    upcomingMonth.setDate(1);
  }
  renderUpcomingPopup();
  const overlay = document.getElementById('upcomingOverlay');
  if (overlay) overlay.classList.add('show');
}

function closeUpcomingPopup() {
  const overlay = document.getElementById('upcomingOverlay');
  if (overlay) overlay.classList.remove('show');
}

function renderUpcomingPopup() {
  const list = document.getElementById('upcomingList');
  if (!list) return;

  const upcoming = getUpcomingPayments();
  const todayIso = isoDate(new Date());
  const paymentDates = new Set(upcoming.map(item => item.date));
  const selectedItems = upcoming.filter(item => item.date === selectedUpcomingDate);
  const monthTitle = upcomingMonth.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });

  if (upcoming.length === 0) {
    list.innerHTML = `
      <div class="upcoming-empty">
        Aucun paiement à venir avec une date.<br>
        Ajoute une date à tes enveloppes pour les voir ici.
      </div>
    `;
    return;
  }

  const firstDay = new Date(upcomingMonth.getFullYear(), upcomingMonth.getMonth(), 1);
  const lastDay = new Date(upcomingMonth.getFullYear(), upcomingMonth.getMonth() + 1, 0);
  const startOffset = firstDay.getDay(); // dimanche = 0
  const weekdays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  let grid = weekdays.map(day => `<div class="upcoming-cal-weekday">${day}</div>`).join('');

  for (let i = 0; i < startOffset; i++) {
    grid += `<button type="button" class="upcoming-cal-day empty" tabindex="-1"></button>`;
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(upcomingMonth.getFullYear(), upcomingMonth.getMonth(), day);
    const dateStr = isoDate(d);
    const classes = [
      'upcoming-cal-day',
      paymentDates.has(dateStr) ? 'has-payment' : '',
      dateStr === todayIso ? 'today' : '',
      dateStr === selectedUpcomingDate ? 'selected' : ''
    ].filter(Boolean).join(' ');
    grid += `<button type="button" class="${classes}" data-upcoming-date="${dateStr}">${day}</button>`;
  }

  const dayTitle = selectedUpcomingDate
    ? formatDateLong(selectedUpcomingDate)
    : 'Sélectionne une date';
  const dayCount = selectedItems.length;
  const dayList = dayCount > 0
    ? selectedItems.map(item => renderUpcomingItem(item)).join('')
    : `<div class="upcoming-empty">Aucun paiement prévu cette journée.</div>`;

  list.innerHTML = `
    <div class="upcoming-calendar">
      <div class="upcoming-cal-nav">
        <button type="button" class="upcoming-cal-btn" data-action="upcoming-prev" aria-label="Mois précédent">‹</button>
        <div class="upcoming-cal-title">${escapeHtml(monthTitle)}</div>
        <button type="button" class="upcoming-cal-btn" data-action="upcoming-next" aria-label="Mois suivant">›</button>
      </div>
      <div class="upcoming-cal-grid">${grid}</div>
    </div>
    <div class="upcoming-day-title">
      <h4>${escapeHtml(dayTitle)}</h4>
      <span>${dayCount} paiement${dayCount > 1 ? 's' : ''}</span>
    </div>
    ${dayList}
  `;
}

function renderUpcomingItem(item) {
    const rec = item.recurrence && item.recurrence !== 'once'
      ? ` · ${getRecurrenceLabel(item.recurrence).replace('🔁 ', '')}`
      : '';
    const dateText = `${formatDateShort(item.date)} · ${getDateStatusLabel(item.date)}${rec}`;
    return `
      <div class="upcoming-item${item.days < 0 ? ' overdue' : ''}">
      <div class="upcoming-emoji">${item.emoji}</div>
      <div class="upcoming-info">
        <div class="upcoming-name">${escapeHtml(item.name)}</div>
        <div class="upcoming-meta">${escapeHtml(dateText)}</div>
      </div>
      <div class="upcoming-amount">${fmt(item.amount)}</div>
      </div>
    `;
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
  if (!canUseProFeature('Le nouveau cycle automatique')) return;

  if (!confirm('Démarrer un nouveau cycle?\n\nÇa va :\n• Décocher toutes les enveloppes récurrentes\n• Avancer les dates des revenus et dépenses récurrents\n• Garder les éléments "une seule fois" tels quels\n\nContinuer?')) return;

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
        if (e.date) {
          e.date = advanceDate(e.date, e.recurrence);
        }
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
  updateUpcomingButton();

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
    const manageBillingBtn = document.getElementById('manageBillingBtn');

    if (currentSubscription) {
      const status = currentSubscription.status;
      const stripeTrialDaysLeft = getStripeTrialDaysLeft();
      if (status === 'lifetime') {
        planEl.textContent = '✨ Accès à vie actif';
        planEl.style.color = 'var(--good)';
        upgradeBtn.style.display = 'none';
        manageBillingBtn.style.display = 'block';
      } else if (status === 'trialing' && isProUser()) {
        planEl.textContent = stripeTrialDaysLeft !== null
          ? `⏳ Essai PRO · ${stripeTrialDaysLeft}j restants`
          : '⏳ Essai PRO actif';
        planEl.style.color = 'var(--accent)';
        upgradeBtn.style.display = 'none';
        manageBillingBtn.style.display = 'block';
      } else if (status === 'active') {
        planEl.textContent = '✨ PRO actif';
        planEl.style.color = 'var(--good)';
        upgradeBtn.style.display = 'none';
        manageBillingBtn.style.display = 'block';
      } else if (status === 'past_due') {
        planEl.textContent = '⚠️ Paiement en attente';
        planEl.style.color = 'var(--warn)';
        upgradeBtn.style.display = 'block';
        manageBillingBtn.style.display = 'block';
      } else {
        // canceled, etc
        planEl.textContent = 'Plan gratuit';
        planEl.style.color = 'var(--ink-soft)';
        upgradeBtn.style.display = 'block';
        manageBillingBtn.style.display = 'block';
      }
    } else {
      // Pas d'abonnement = plan gratuit permanent avec limites douces.
      planEl.textContent = 'Plan gratuit';
      planEl.style.color = 'var(--ink-soft)';
      upgradeBtn.style.display = 'block';
      manageBillingBtn.style.display = 'block';
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
  const totalSavings = state.savings.reduce((s,item) => s + (parseFloat(item.amount)||0), 0);
  const totalReserved = totalAlloc + totalSavings;
  const remain = totalRevenus - totalReserved;

  const amountEl = document.getElementById('remainingAmount');
  const subEl = document.getElementById('remainingSub');
  amountEl.textContent = fmt(remain);
  amountEl.classList.remove('good','warn','over');

  if (state.revenus.length === 0) {
    subEl.textContent = 'Commence par ajouter tes revenus ci-dessus';
  } else if (remain < 0) {
    amountEl.classList.add('over');
    subEl.textContent = `Tu dépasses tes revenus de ${fmt(-remain)} — réduis une enveloppe ou ton Fonds bonheur`;
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

  const pct = totalRevenus > 0 ? Math.min(100, (totalReserved / totalRevenus) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';

  // Fonds bonheur
  const savingsBox = document.getElementById('savingsList');
  savingsBox.innerHTML = '';
  document.getElementById('savingsCount').textContent = `${fmt(totalSavings)} réservé`;

  if (state.savings.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:18px;text-align:center;color:var(--ink-soft);font-style:italic;font-size:13px;';
    empty.textContent = 'Aucun fonds bonheur encore.';
    savingsBox.appendChild(empty);
  } else {
    state.savings.forEach(item => {
      const target = parseFloat(item.target_amount) || 0;
      const savedAmount = parseFloat(item.amount) || 0;
      const pctSaved = target > 0 ? Math.min(100, (savedAmount / target) * 100) : 0;
      const savedPercent = Math.round(pctSaved);
      let when = '';
      if (item.date) {
        const d = daysUntil(item.date);
        if (d === 0) when = `<span class="when">aujourd'hui</span>`;
        else if (d === 1) when = `<span class="when">demain</span>`;
        else if (d > 1) when = `<span class="when">dans ${d}j</span>`;
        else when = `<span class="when">${formatDateShort(item.date)}</span>`;
      }
      const progress = target > 0
        ? `
          <div class="item-progress-meta">
            <span>${savedPercent} %</span>
            <span>${fmt(savedAmount)} / ${fmt(target)}</span>
          </div>
          <div class="item-progress"><div style="width:${pctSaved}%"></div></div>
        `
        : '';
      const goalText = target > 0 ? `<span> / ${fmt(target)}</span>` : '';
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="item-emoji">${item.emoji || '💛'}</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-amount"><strong class="saving">${fmt(savedAmount)}</strong>${goalText}${when}</div>
          ${progress}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-save-edit="${item.id}">✎</button>
        </div>
      `;
      savingsBox.appendChild(div);
    });
  }

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
      const allocatedAmount = parseFloat(env.amount) || 0;
      const targetAmount = parseFloat(env.target_amount) || allocatedAmount;
      const pctEnv = targetAmount > 0 ? Math.min(100, (allocatedAmount / targetAmount) * 100) : 0;
      const pctEnvLabel = Math.round(pctEnv);
      const progress = targetAmount > 0
        ? `
          <div class="item-progress-meta">
            <span>${pctEnvLabel} %</span>
            <span>${fmt(allocatedAmount)} / ${fmt(targetAmount)}</span>
          </div>
          <div class="item-progress"><div style="width:${pctEnv}%"></div></div>
        `
        : '';
      let when = '';
      if (env.date) {
        const d = daysUntil(env.date);
        if (d === 0) when = `<span class="when">aujourd'hui</span>`;
        else if (d === 1) when = `<span class="when">demain</span>`;
        else if (d > 1) when = `<span class="when">dans ${d}j</span>`;
        else when = `<span class="when">en retard ${Math.abs(d)}j</span>`;
      }
      const div = document.createElement('div');
      div.className = 'item' + (env.allocated ? ' allocated' : '');
      div.innerHTML = `
        <div class="item-emoji">${env.emoji}</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(env.name)}${recBadge}</div>
          <div class="item-amount">${fmt(env.amount)}${when}</div>
          ${progress}
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
  if (!item) {
    if (type === 'revenu' && !canCreateRevenu()) return;
    if (type === 'envelope' && !canCreateEnvelope()) return;
  }

  editing = { type, id: item ? item.id : null };

  const isRev = type === 'revenu';
  const isSaving = type === 'saving';
  const emojis = isRev ? EMOJIS_REV : (isSaving ? EMOJIS_SAVE : EMOJIS_ENV);
  const presets = isRev ? PRESETS_REV : (isSaving ? PRESETS_SAVE : PRESETS_ENV);

  selectedEmoji = item ? item.emoji : (isRev ? '💼' : '🏠');

  if (!item && isSaving) selectedEmoji = '💛';

  const title = item ? (isRev ? 'Modifier le revenu' : 'Modifier l\'enveloppe')
                     : (isRev ? 'Nouveau revenu' : 'Nouvelle enveloppe');
  const badge = isRev ? '<span class="badge green">Revenu</span>' : '<span class="badge">Dépense</span>';
  document.getElementById('modalTitle').innerHTML = title + ' ' + badge;
  if (isSaving) {
    const savingTitle = item ? 'Modifier un fonds bonheur' : 'Nouveau fonds bonheur';
    document.getElementById('modalTitle').innerHTML = savingTitle + ' <span class="badge">Fonds bonheur</span>';
  }

  document.getElementById('nameLabel').textContent = isRev ? 'Source du revenu' : 'Nom de l\'enveloppe';
  document.getElementById('amountLabel').textContent = isRev ? 'Montant prévu' : 'Montant alloué';
  document.getElementById('dateField').style.display = 'block';
  document.getElementById('dateLabel').textContent = isRev ? 'Date prévue' : 'Date de la dépense';
  document.getElementById('presetsLabel').textContent = isRev ? 'Sources rapides' : 'Suggestions rapides';
  document.getElementById('itemName').placeholder = isRev ? 'ex. Paie principale' : 'ex. Épicerie';
  if (isSaving) {
    document.getElementById('nameLabel').textContent = 'Nom du fonds';
    document.getElementById('amountLabel').textContent = 'Montant réservé';
    document.getElementById('dateLabel').textContent = 'Date cible';
    document.getElementById('presetsLabel').textContent = 'Idées rapides';
    document.getElementById('itemName').placeholder = 'ex. Sécurité, Voyage, Sofa';
  }

  const primary = document.getElementById('saveBtn');
  primary.classList.toggle('green', isRev);

  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemAmount').value = item ? item.amount : '';
  document.getElementById('targetField').style.display = (isSaving || (!isRev && !isSaving)) ? 'block' : 'none';
  document.getElementById('targetLabel').textContent = isSaving ? 'Objectif total' : 'Montant cible';
  document.getElementById('itemTarget').placeholder = isSaving ? 'Optionnel' : 'ex. montant total à atteindre';
  document.getElementById('itemTarget').value = item && item.target_amount ? item.target_amount : (!isRev && item ? item.amount : '');
  document.getElementById('itemDate').value = item && item.date ? item.date : '';
  document.getElementById('deleteBtn').style.display = item ? 'block' : 'none';

  selectedRecurrence = item ? (item.recurrence || 'once') : 'once';
  document.getElementById('recurrenceField').style.display = isSaving ? 'none' : 'block';
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
      const isSaving = editing.type === 'saving';
      const emojis = isRev ? EMOJIS_REV : (isSaving ? EMOJIS_SAVE : EMOJIS_ENV);
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
      if (rec !== 'once' && !isProUser()) {
        canUseProFeature('Les revenus et dépenses récurrents');
        return;
      }
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
    document.getElementById('signupPassword').value,
    document.getElementById('signupPasswordConfirm').value
  );
};

document.getElementById('loginSubmitBtn').onclick = () => {
  signIn(
    document.getElementById('loginEmail').value.trim(),
    document.getElementById('loginPassword').value
  );
};

// Enter key dans les champs
['signupEmail','signupPassword','signupPasswordConfirm'].forEach(id => {
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

document.getElementById('manageBillingBtn').onclick = () => {
  document.getElementById('userDropdown').classList.remove('show');
  openBillingOptions();
};

document.getElementById('enableNotificationsBtn').onclick = async () => {
  document.getElementById('userDropdown').classList.remove('show');
  const result = await ensurePushNotifications({ ask: true });
  if (result?.ok) {
    alert('✅ ' + result.message);
  } else {
    alert('Notifications : ' + (result?.message || 'Impossible d’activer les rappels.'));
  }
};

// Bouton retour sur la page PRO
document.getElementById('proBackBtn').onclick = () => {
  showScreen('main');
};

document.getElementById('billingBackBtn').onclick = () => {
  showScreen('main');
};

function getBillingStatusText() {
  if (!currentSubscription) {
    return 'Tu es sur le plan gratuit.';
  }

  const status = currentSubscription.status;
  if (status === 'lifetime') return 'Accès à vie actif ✨';
  if (status === 'trialing') {
    const days = getStripeTrialDaysLeft();
    return days !== null
      ? `Essai PRO actif · ${days}j restants`
      : 'Essai PRO actif';
  }
  if (status === 'active') return 'Abonnement PRO actif.';
  if (status === 'past_due') return 'Paiement en attente.';
  if (status === 'canceled') return 'Abonnement annulé. Tu peux choisir un nouvel accès.';

  return 'Statut de facturation : ' + status;
}

function renderBillingOptions() {
  const currentPlanEl = document.getElementById('billingCurrentPlan');
  const monthlyBtn = document.getElementById('billingMonthlyBtn');
  const yearlyBtn = document.getElementById('billingYearlyBtn');
  const lifetimeBtn = document.getElementById('billingLifetimeBtn');
  const portalBtn = document.getElementById('billingPortalBtn');

  currentPlanEl.textContent = getBillingStatusText();

  const isLifetime = currentSubscription?.status === 'lifetime';
  const hasStripeCustomer = Boolean(currentSubscription?.stripe_customer_id);

  monthlyBtn.style.display = isLifetime ? 'none' : 'block';
  yearlyBtn.style.display = isLifetime ? 'none' : 'block';
  lifetimeBtn.style.display = isLifetime ? 'none' : 'block';
  portalBtn.style.display = hasStripeCustomer ? 'block' : 'none';
}

async function openBillingOptions() {
  await loadSubscription();
  renderBillingOptions();
  showScreen('billingScreen');
}

// Fonction pour démarrer un abonnement
async function startSubscription(plan, sourceButton = null) {
  if (!currentUser) {
    alert('Tu dois être connecté(e)');
    return;
  }

  const buttonsByPlan = {
    monthly: document.getElementById('subscribeMonthlyBtn'),
    yearly: document.getElementById('subscribeYearlyBtn'),
    lifetime: document.getElementById('subscribeLifetimeBtn')
  };
  const btn = sourceButton || buttonsByPlan[plan];
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
document.getElementById('subscribeLifetimeBtn').onclick = () => startSubscription('lifetime');

async function changeRecurringPlan(plan, sourceButton) {
  if (!currentUser) {
    alert('Tu dois être connecté(e)');
    return;
  }

  if (!currentSubscription || !currentSubscription.stripe_subscription_id || currentSubscription.status === 'canceled') {
    startSubscription(plan, sourceButton);
    return;
  }

  if (currentSubscription.status === 'lifetime') {
    alert("Tu as déjà l'accès à vie ✨");
    return;
  }

  const label = plan === 'yearly' ? 'PRO annuel à 29,99 $/an' : 'PRO mensuel à 4,99 $/mois';
  const ok = confirm(
    `Changer ton abonnement vers ${label}?\n\nStripe ajustera l'abonnement. S'il y a un prorata, il sera géré avec ton moyen de paiement.`
  );
  if (!ok) return;

  const btn = sourceButton;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Mise à jour...';

  try {
    const response = await fetch(`${API_URL}/api/change-subscription-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        plan
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    await loadSubscription();
    render();
    renderBillingOptions();
    alert(data.message || 'Ton abonnement a été mis à jour.');
  } catch (e) {
    alert("Impossible de changer l'abonnement : " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('billingMonthlyBtn').onclick = (e) => changeRecurringPlan('monthly', e.currentTarget);
document.getElementById('billingYearlyBtn').onclick = (e) => changeRecurringPlan('yearly', e.currentTarget);
document.getElementById('billingLifetimeBtn').onclick = (e) => {
  if (currentSubscription?.status === 'lifetime') {
    alert("Tu as déjà l'accès à vie ✨");
    return;
  }

  const hasActiveSubscription = Boolean(currentSubscription?.stripe_subscription_id);
  const ok = hasActiveSubscription
    ? confirm("Passer à l'accès à vie?\n\nAprès le paiement unique, ton abonnement actuel sera annulé automatiquement.")
    : true;

  if (ok) startSubscription('lifetime', e.currentTarget);
};
document.getElementById('billingPortalBtn').onclick = () => openCustomerPortal();

async function openCustomerPortal() {
  if (!currentUser) {
    alert('Tu dois être connecté(e)');
    return;
  }

  if (!currentSubscription || !currentSubscription.stripe_customer_id) {
    window.location.href = STRIPE_PORTAL_LOGIN_URL;
    return;
  }

  const btn = document.getElementById('manageBillingBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Ouverture du portail...';

  try {
    const response = await fetch(`${API_URL}/api/create-portal-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        userEmail: currentUser.email
      })
    });

    const data = await response.json();

    if (data.code === 'customer_not_found') {
      window.location.href = STRIPE_PORTAL_LOGIN_URL;
      return;
    }

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('Pas d\'URL de gestion reçue');
    }
  } catch (e) {
    alert('Impossible d\'ouvrir la gestion de l\'abonnement : ' + e.message);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// App
document.getElementById('addRevenuBtn').onclick = () => openModal('revenu');
document.getElementById('addEnvBtn').onclick = () => openModal('envelope');
document.getElementById('addSavingBtn').onclick = () => openModal('saving');

// Bouton "Nouveau cycle"
document.getElementById('newCycleBtn').onclick = renewCycle;
document.getElementById('cancelBtn').onclick = closeModal;

document.getElementById('saveBtn').onclick = async () => {
  const name = document.getElementById('itemName').value.trim();
  const amount = parseFloat(document.getElementById('itemAmount').value) || 0;
  const targetAmount = parseFloat(document.getElementById('itemTarget').value) || 0;
  const date = document.getElementById('itemDate').value;
  if (!name) { alert('Donne un nom'); return; }
  if (editing.type !== 'saving' && selectedRecurrence !== 'once' && !canUseProFeature('Les revenus et dépenses récurrents')) return;
  if (!editing.id && editing.type === 'revenu' && !canCreateRevenu()) return;
  if (!editing.id && editing.type === 'envelope' && !canCreateEnvelope()) return;

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
  } else if (editing.type === 'saving') {
    if (editing.id) {
      const saving = state.savings.find(x => x.id === editing.id);
      if (saving) {
        saving.name = name;
        saving.amount = amount;
        saving.target_amount = targetAmount || null;
        saving.emoji = selectedEmoji;
        saving.date = date;
        await saveSaving(saving, false);
      }
    } else {
      const newSaving = {
        emoji: selectedEmoji,
        name,
        amount,
        target_amount: targetAmount || null,
        date
      };
      const saved = await saveSaving(newSaving, true);
      if (saved) {
        state.savings.push({
          id: saved.id,
          emoji: saved.emoji || '💛',
          name: saved.name,
          amount: parseFloat(saved.amount) || 0,
          target_amount: saved.target_amount !== null && saved.target_amount !== undefined ? parseFloat(saved.target_amount) : null,
          date: saved.date || ''
        });
      }
    }
  } else {
    if (editing.id) {
      const e = state.envelopes.find(x => x.id === editing.id);
      if (e) {
        e.name = name; e.amount = amount; e.emoji = selectedEmoji;
        e.target_amount = targetAmount || amount || null;
        e.date = date;
        e.recurrence = selectedRecurrence;
        await saveEnvelope(e, false);
      }
    } else {
      const newEnv = {
        emoji: selectedEmoji, name, amount, allocated: false,
        target_amount: targetAmount || amount || null,
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
          target_amount: saved.target_amount !== null && saved.target_amount !== undefined ? parseFloat(saved.target_amount) : null,
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
  } else if (editing.type === 'saving') {
    await deleteSaving(editing.id);
    state.savings = state.savings.filter(s => s.id !== editing.id);
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
  if (t.dataset.action === 'open-upcoming' || t.id === 'upcomingBtn') {
    openUpcomingPopup();
    return;
  } else if (t.dataset.action === 'upcoming-prev') {
    upcomingMonth.setMonth(upcomingMonth.getMonth() - 1);
    if (!selectedUpcomingDate || !sameMonth(new Date(selectedUpcomingDate + 'T00:00:00'), upcomingMonth)) {
      selectFirstUpcomingDateInVisibleMonth();
    }
    renderUpcomingPopup();
    return;
  } else if (t.dataset.action === 'upcoming-next') {
    upcomingMonth.setMonth(upcomingMonth.getMonth() + 1);
    if (!selectedUpcomingDate || !sameMonth(new Date(selectedUpcomingDate + 'T00:00:00'), upcomingMonth)) {
      selectFirstUpcomingDateInVisibleMonth();
    }
    renderUpcomingPopup();
    return;
  } else if (t.dataset.upcomingDate) {
    selectedUpcomingDate = t.dataset.upcomingDate;
    renderUpcomingPopup();
    return;
  } else if (t.dataset.revToggle) {
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
  } else if (t.dataset.saveEdit) {
    const saving = state.savings.find(x => x.id === t.dataset.saveEdit);
    if (saving) openModal('saving', saving);
  }
});

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.getElementById('upcomingClose').addEventListener('click', closeUpcomingPopup);
document.getElementById('upcomingOverlay').addEventListener('click', e => {
  if (e.target.id === 'upcomingOverlay') closeUpcomingPopup();
});

document.getElementById('resetBtn').onclick = async () => {
  if (!confirm('Effacer TOUTES tes données et recommencer à zéro? Cette action est irréversible.')) return;

  try {
    await supabaseClient.from('revenus').delete().eq('user_id', currentUser.id);
    await supabaseClient.from('envelopes').delete().eq('user_id', currentUser.id);
    await supabaseClient.from('savings').delete().eq('user_id', currentUser.id);
    state = { revenus: [], envelopes: [], savings: [] };
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
// INIT
// ============================================================
checkAuth();
