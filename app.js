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
let lifetimeOfferStatus = null;
const STRIPE_PORTAL_LOGIN_URL = 'https://billing.stripe.com/p/login/14A5kE7C9fmoduWb5veQM00';
const FREE_LIMITS = {
  revenus: 1,
  envelopes: 5
};
const TRIAL_DAYS = 45;
let state = {
  revenus: [],
  envelopes: [],
  savings: [],
  adjustments: []
};

let editing = { type: null, id: null };
let selectedEmoji = '💼';
let selectedRecurrence = 'once';
let upcomingMonth = new Date();
upcomingMonth.setDate(1);
let selectedUpcomingDate = null;
let savingMove = { id: null, type: 'deposit' };
let savingAuto = { id: null };
let pushRegistrationInProgress = false;
let pushForegroundListenerAttached = false;
let cycleUndoSnapshot = null;
let cycleUndoTimer = null;
let cycleUndoInProgress = false;

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
    faqScreen: { slug: 'aide-faq', title: 'Aide FAQ' },
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
  ['loadingScreen', 'welcomeScreen', 'signupScreen', 'loginScreen', 'proScreen', 'billingScreen', 'faqScreen'].forEach(id => {
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
        : `🎉 Bienvenue dans PRO!\n\nTon essai de ${TRIAL_DAYS} jours est activé.\nTu peux gérer ton abonnement depuis Mon compte → Facturation et abonnement.`;
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

async function sendWelcomePushNotification() {
  const { data } = await supabaseClient.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Session manquante pour tester les rappels.');
  }

  const response = await fetch(`${API_URL}/api/send-test-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ reason: 'activation' })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || payload.errors?.[0] || 'Notification de test non envoyee.');
  }

  return payload;
}

function attachPushForegroundListener(messaging) {
  if (pushForegroundListenerAttached || !messaging) return;

  messaging.onMessage(payload => {
    const title = payload.notification?.title || payload.data?.title || 'Avant la Paie';
    const body = payload.notification?.body || payload.data?.body || 'Petit rappel bienveillant.';

    if (Notification.permission !== 'granted') return;

    const notificationOptions = {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png'
    };

    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then(registration => registration.showNotification(title, notificationOptions))
        .catch(() => new Notification(title, notificationOptions));
      return;
    }

    new Notification(title, notificationOptions);
  });

  pushForegroundListenerAttached = true;
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
    const registration = await navigator.serviceWorker.register('sw.js?v=54');
    const messaging = firebase.messaging();
    attachPushForegroundListener(messaging);

    const token = await messaging.getToken({
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      await savePushToken(token);
    } else {
      return { ok: false, message: 'Firebase n’a pas retourné de jeton de notification.' };
    }

    if (shouldAsk) {
      await sendWelcomePushNotification();
    }

    if (false && !pushForegroundListenerAttached) {
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

function getSignupSource() {
  const params = new URLSearchParams(window.location.search);
  const explicitSource = params.get('source') || params.get('utm_source');
  if (explicitSource) return explicitSource;

  if (document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      if (referrerUrl.hostname === window.location.hostname && referrerUrl.pathname.includes('presentation')) {
        return 'page de presentation';
      }
      return referrerUrl.hostname || document.referrer;
    } catch (error) {
      return document.referrer;
    }
  }

  return 'application';
}

function getSelectedSignupPlan() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get('plan') || params.get('forfait');
  if (plan) return plan;

  return localStorage.getItem('avantLaPaieSelectedPlan') || 'gratuit / non choisi';
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
          trial_started_at: new Date().toISOString(),
          signup_source: getSignupSource(),
          signup_path: `${window.location.pathname}${window.location.search}`,
          signup_referrer: document.referrer || '',
          selected_plan: getSelectedSignupPlan(),
          app_domain: window.location.hostname
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
  state = { revenus: [], envelopes: [], savings: [], adjustments: [] };
  showScreen('welcomeScreen');
}

function openDeleteAccountModal(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const modal = document.getElementById('deleteAccountModal');
  const step1 = document.getElementById('deleteAccountStep1');
  const step2 = document.getElementById('deleteAccountStep2');

  if (!modal || !step1 || !step2) {
    alert('La fenêtre de suppression n’est pas encore chargée. Recharge la page et réessaie.');
    return;
  }

  document.getElementById('userDropdown')?.classList.remove('show');
  step1.style.display = 'block';
  step2.style.display = 'none';
  const input = document.getElementById('deleteAccountConfirmInput');
  const btn = document.getElementById('deleteAccountConfirmBtn');
  if (input) input.value = '';
  if (btn) btn.disabled = true;
  modal.classList.add('show');
}

function closeDeleteAccountModal() {
  document.getElementById('deleteAccountModal')?.classList.remove('show');
  const input = document.getElementById('deleteAccountConfirmInput');
  const btn = document.getElementById('deleteAccountConfirmBtn');
  if (input) input.value = '';
  if (btn) {
    btn.disabled = true;
    btn.dataset.busy = '0';
    btn.textContent = 'Supprimer définitivement';
  }
}

function showDeleteAccountFinalStep() {
  document.getElementById('deleteAccountStep1').style.display = 'none';
  document.getElementById('deleteAccountStep2').style.display = 'block';
  setTimeout(() => document.getElementById('deleteAccountConfirmInput')?.focus(), 80);
}

function updateDeleteAccountConfirmState() {
  const input = document.getElementById('deleteAccountConfirmInput');
  const btn = document.getElementById('deleteAccountConfirmBtn');
  if (!input || !btn) return;
  btn.disabled = input.value.trim().toUpperCase() !== 'SUPPRIMER';
}

async function permanentlyDeleteAccount() {
  const input = document.getElementById('deleteAccountConfirmInput');
  const btn = document.getElementById('deleteAccountConfirmBtn');
  if (btn?.dataset.busy === '1') return;
  if (!input || !btn || input.value.trim().toUpperCase() !== 'SUPPRIMER') {
    alert('Pour confirmer, tu dois écrire SUPPRIMER.');
    return;
  }

  const originalText = btn.textContent;
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.textContent = 'Suppression...';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Session expirée. Reconnecte-toi avant de supprimer ton compte.');
    }

    const response = await fetch(`${API_URL}/api/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ confirmText: 'SUPPRIMER' })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Suppression impossible pour le moment.');
    }

    try {
      localStorage.removeItem(getSavingsMovementsKey());
    } catch (_) {}

    try {
      await supabaseClient.auth.signOut();
    } catch (_) {}

    currentUser = null;
    currentSubscription = null;
    state = { revenus: [], envelopes: [], savings: [], adjustments: [] };
    closeDeleteAccountModal();
    alert("Ton compte a été supprimé. Merci d'avoir essayé Avant la Paie 🧡 Tu peux toujours revenir si tu changes d'avis!");
    window.location.href = 'presentation.html';
  } catch (e) {
    console.error('Suppression compte echouee:', e);
    alert('Impossible de supprimer le compte : ' + e.message);
    btn.dataset.busy = '0';
    btn.disabled = false;
    btn.textContent = originalText;
  }
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
        date: s.date || '',
        recurring_deposit_enabled: Boolean(s.recurring_deposit_enabled),
        recurring_deposit_amount: parseFloat(s.recurring_deposit_amount) || 0,
        recurring_deposit_frequency: s.recurring_deposit_frequency || 'once',
        recurring_deposit_next_date: s.recurring_deposit_next_date || ''
      }));
      await applyDueRecurringSavingsDeposits();
    } else {
      state.savings = [];
    }
    // Charger ajustements manuels du reste a allouer
    const { data: adjustments, error: adjustErr } = await supabaseClient
      .from('budget_adjustments')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (!adjustErr && adjustments) {
      state.adjustments = adjustments.map(normalizeBudgetAdjustment);
    } else {
      state.adjustments = [];
      if (adjustErr && !String(adjustErr.message || '').includes('does not exist')) {
        console.warn('Erreur chargement ajustements:', adjustErr);
      }
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
async function saveSaving(saving, isNew, options = {}) {
  if (!currentUser) return null;
  try {
    const payload = {
      user_id: currentUser.id,
      emoji: saving.emoji || '💛',
      name: saving.name,
      amount: saving.amount || 0,
      target_amount: saving.target_amount || null,
      date: saving.date || null,
      recurring_deposit_enabled: Boolean(saving.recurring_deposit_enabled),
      recurring_deposit_amount: parseFloat(saving.recurring_deposit_amount) || 0,
      recurring_deposit_frequency: saving.recurring_deposit_frequency || 'once',
      recurring_deposit_next_date: saving.recurring_deposit_next_date || null
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
          recurring_deposit_enabled: payload.recurring_deposit_enabled,
          recurring_deposit_amount: payload.recurring_deposit_amount,
          recurring_deposit_frequency: payload.recurring_deposit_frequency,
          recurring_deposit_next_date: payload.recurring_deposit_next_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', saving.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      return saving;
    }
  } catch (e) {
    console.error('Erreur sauvegarde mise de côté:', e);
    if (!options.silent) {
      alert('Erreur de sauvegarde : ' + e.message);
    }
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
function normalizeBudgetAdjustment(a) {
  return {
    id: a.id,
    user_id: a.user_id,
    new_amount: parseFloat(a.new_amount) || 0,
    previous_amount: parseFloat(a.previous_amount) || 0,
    difference: parseFloat(a.difference) || 0,
    note: a.note || '',
    cycle_reset: Boolean(a.cycle_reset),
    created_at: a.created_at || new Date().toISOString()
  };
}

async function saveBudgetAdjustment(adjustment, options = {}) {
  if (!currentUser) return null;

  const payload = {
    user_id: currentUser.id,
    new_amount: adjustment.new_amount,
    previous_amount: adjustment.previous_amount,
    difference: adjustment.difference,
    note: adjustment.note || null,
    cycle_reset: Boolean(adjustment.cycle_reset)
  };

  try {
    const { data, error } = await supabaseClient
      .from('budget_adjustments')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    const normalized = normalizeBudgetAdjustment(data);
    state.adjustments = [normalized, ...(state.adjustments || [])].slice(0, 40);
    return normalized;
  } catch (e) {
    console.error('Erreur sauvegarde ajustement:', e);
    if (!options.silent) {
      alert('Erreur de sauvegarde : ' + e.message);
    }
    return null;
  }
}

function fmt(n) {
  if (isNaN(n)) n = 0;
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2
  }).format(n);
}

function fmtSigned(n) {
  const value = parseFloat(n) || 0;
  return `${value > 0 ? '+' : ''}${fmt(value)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function getSavingsMovementsKey() {
  return currentUser ? `avantLaPaieSavingsMovements:${currentUser.id}` : 'avantLaPaieSavingsMovements:guest';
}

function loadSavingsMovements() {
  try {
    const raw = localStorage.getItem(getSavingsMovementsKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveSavingsMovements(rows) {
  try {
    localStorage.setItem(getSavingsMovementsKey(), JSON.stringify(rows.slice(0, 80)));
  } catch (e) {
    console.warn('Historique fonds bonheur non sauvegardé:', e);
  }
}

function addSavingMovementHistory(row) {
  const rows = loadSavingsMovements();
  rows.unshift({
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
    saving_id: row.saving_id,
    type: row.type,
    amount: parseFloat(row.amount) || 0,
    previous_amount: parseFloat(row.previous_amount) || 0,
    new_amount: parseFloat(row.new_amount) || 0,
    note: row.note || '',
    created_at: new Date().toISOString()
  });
  saveSavingsMovements(rows);
}

function getSavingMovementHistory(savingId) {
  return loadSavingsMovements()
    .filter(row => row.saving_id === savingId)
    .slice(0, 2);
}

function formatMovementDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function formatDateShort(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr + 'T00:00:00');
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function getDailyThought() {
  const thoughts = Array.isArray(window.PENSEES) ? window.PENSEES : [];
  if (!thoughts.length) return null;

  const reference = new Date(2026, 0, 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysElapsed = Math.floor((today - reference) / 86400000);
  const index = ((daysElapsed % thoughts.length) + thoughts.length) % thoughts.length;

  return thoughts[index];
}

function renderDailyThought() {
  const thought = getDailyThought();
  if (!thought) return;

  const titleEl = document.getElementById('dailyThoughtTitle');
  const textEl = document.getElementById('dailyThoughtText');
  if (titleEl && thought.titre) titleEl.textContent = thought.titre;
  if (textEl && thought.texte) textEl.textContent = thought.texte;
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

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonthsClamped(date, months, anchorDay = date.getDate()) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(anchorDay, lastDay));
  return d;
}

function addRecurrenceInterval(date, recurrence, anchorDay = date.getDate()) {
  const d = new Date(date);
  switch (recurrence) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return d;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      return d;
    case 'monthly':
      return addMonthsClamped(d, 1, anchorDay);
    case 'quarterly':
      return addMonthsClamped(d, 3, anchorDay);
    case 'yearly':
      return addMonthsClamped(d, 12, anchorDay);
    default:
      return null;
  }
}

function subtractRecurrenceInterval(date, recurrence, anchorDay = date.getDate()) {
  const d = new Date(date);
  switch (recurrence) {
    case 'weekly':
      d.setDate(d.getDate() - 7);
      return d;
    case 'biweekly':
      d.setDate(d.getDate() - 14);
      return d;
    case 'monthly':
      return addMonthsClamped(d, -1, anchorDay);
    case 'quarterly':
      return addMonthsClamped(d, -3, anchorDay);
    case 'yearly':
      return addMonthsClamped(d, -12, anchorDay);
    default:
      return null;
  }
}

function getUpcomingLimitDate() {
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setMonth(limit.getMonth() + 12);
  return limit;
}

function buildUpcomingOccurrences(item, type, limitDate) {
  const start = parseLocalDate(item.date);
  if (!start) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recurrence = item.recurrence || 'once';
  const statusDone = type === 'revenu' ? item.received : item.allocated;
  const base = {
    ...item,
    type,
    sourceId: item.id,
    originalDate: item.date,
    emoji: item.emoji || (type === 'revenu' ? '💼' : '💸')
  };

  if (recurrence === 'once') {
    if (start > limitDate || statusDone) return [];
    return [{
      ...base,
      date: item.date,
      days: daysUntil(item.date),
      isRecurringOccurrence: false
    }];
  }

  const occurrences = [];
  let current = new Date(start);
  const anchorDay = start.getDate();
  let guard = 0;

  while (current < today && guard < 500) {
    const next = addRecurrenceInterval(current, recurrence, anchorDay);
    if (!next || next <= current) break;
    current = next;
    guard++;
  }

  while (current <= limitDate && guard < 500) {
    const dateStr = isoDate(current);
    const isOriginalDate = dateStr === item.date;

    if (!(isOriginalDate && statusDone)) {
      occurrences.push({
        ...base,
        date: dateStr,
        days: daysUntil(dateStr),
        isRecurringOccurrence: !isOriginalDate
      });
    }

    const next = addRecurrenceInterval(current, recurrence, anchorDay);
    if (!next || next <= current) break;
    current = next;
    guard++;
  }

  return occurrences;
}

function getUpcomingPayments() {
  const limitDate = getUpcomingLimitDate();
  const revenus = state.revenus.flatMap(rev => buildUpcomingOccurrences(rev, 'revenu', limitDate));
  const envelopes = state.envelopes.flatMap(env => buildUpcomingOccurrences(env, 'envelope', limitDate));

  return [...revenus, ...envelopes]
    .sort((a, b) => {
      if (a.days !== b.days) return a.days - b.days;
      if (a.type !== b.type) return a.type === 'revenu' ? -1 : 1;
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

function upcomingItemKey(item) {
  return `${item.type}:${item.sourceId || item.id}:${item.date}`;
}

function getSelectedDateList(upcoming, selectedDate, minCount = 3) {
  const selectedTime = parseLocalDate(selectedDate)?.getTime() || 0;
  const exactItems = upcoming.filter(item => item.date === selectedDate);
  const used = new Set(exactItems.map(upcomingItemKey));
  const targetCount = Math.max(minCount, exactItems.length);
  const list = [...exactItems];

  const fillFrom = candidates => {
    for (const item of candidates) {
      if (list.length >= targetCount) break;
      const key = upcomingItemKey(item);
      if (used.has(key)) continue;
      used.add(key);
      list.push(item);
    }
  };

  fillFrom(upcoming.filter(item => {
    const itemTime = parseLocalDate(item.date)?.getTime() || 0;
    return item.date !== selectedDate && itemTime >= selectedTime;
  }));

  if (list.length < targetCount) {
    fillFrom(upcoming.filter(item => item.date !== selectedDate));
  }

  return list;
}

function updateUpcomingButton() {
  const btn = document.getElementById('upcomingBtn');
  const sub = document.getElementById('upcomingCardSub');
  if (!btn) return;
  const upcoming = getUpcomingPayments();

  if (sub) {
    if (upcoming.length === 0) {
      sub.textContent = 'Ajoute une date à tes revenus ou dépenses';
    } else {
      const next = upcoming[0];
      sub.textContent = `${upcoming.length} élément${upcoming.length > 1 ? 's' : ''} · Prochain : ${next.name} ${getDateStatusLabel(next.date)}`;
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
  const dateTypes = upcoming.reduce((map, item) => {
    if (!map[item.date]) map[item.date] = { revenu: false, envelope: false };
    map[item.date][item.type] = true;
    return map;
  }, {});
  const selectedItems = upcoming.filter(item => item.date === selectedUpcomingDate);
  const displayedItems = getSelectedDateList(upcoming, selectedUpcomingDate, 3);
  const monthTitle = upcomingMonth.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });

  if (upcoming.length === 0) {
    list.innerHTML = `
      <div class="upcoming-empty">
        Aucun élément daté à venir.<br>
        Ajoute une date à tes revenus ou dépenses pour les voir ici.
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
    const types = dateTypes[dateStr];
    const dots = types
      ? `<span class="upcoming-day-dots">
          ${types.revenu ? '<span class="upcoming-dot income"></span>' : ''}
          ${types.envelope ? '<span class="upcoming-dot expense"></span>' : ''}
        </span>`
      : '<span class="upcoming-day-dots"></span>';
    const classes = [
      'upcoming-cal-day',
      types ? 'has-payment' : '',
      types?.revenu ? 'has-income' : '',
      types?.envelope ? 'has-expense' : '',
      dateStr === todayIso ? 'today' : '',
      dateStr === selectedUpcomingDate ? 'selected' : ''
    ].filter(Boolean).join(' ');
    grid += `<button type="button" class="${classes}" data-upcoming-date="${dateStr}">
      <span class="upcoming-day-number">${day}</span>
      ${dots}
    </button>`;
  }

  const dayTitle = selectedUpcomingDate
    ? formatDateLong(selectedUpcomingDate)
    : 'Sélectionne une date';
  const dayCount = selectedItems.length;
  const extraCount = Math.max(0, displayedItems.length - dayCount);
  const dayCountText = dayCount > 0
    ? `${dayCount} ce jour${extraCount > 0 ? ` · ${extraCount} à venir` : ''}`
    : `${displayedItems.length} prochain${displayedItems.length > 1 ? 's' : ''}`;
  const dayListIntro = dayCount === 0
    ? `<div class="upcoming-empty compact">Rien de prévu cette journée. Voici les prochains éléments à venir.</div>`
    : extraCount > 0
      ? `<div class="upcoming-empty compact">Et juste après, pour garder une vue d'ensemble.</div>`
      : '';
  const dayList = displayedItems.length > 0
    ? `${dayListIntro}${displayedItems.map(item => renderUpcomingItem(item)).join('')}`
    : `<div class="upcoming-empty">Aucun élément prévu pour le moment.</div>`;

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
      <span>${escapeHtml(dayCountText)}</span>
    </div>
    ${dayList}
  `;
}

function renderUpcomingItem(item) {
    const rec = item.recurrence && item.recurrence !== 'once'
      ? ` · ${getRecurrenceLabel(item.recurrence).replace('🔁 ', '')}`
      : '';
    const typeLabel = item.type === 'revenu' ? 'Revenu' : 'Dépense';
    const dateText = `${typeLabel} · ${formatDateShort(item.date)} · ${getDateStatusLabel(item.date)}${rec}`;
    const amountClass = item.type === 'revenu' ? 'income' : 'expense';
    return `
      <div class="upcoming-item ${item.type}${item.days < 0 ? ' overdue' : ''}">
      <div class="upcoming-emoji">${item.emoji}</div>
      <div class="upcoming-info">
        <div class="upcoming-name">${escapeHtml(item.name)}</div>
        <div class="upcoming-meta">${escapeHtml(dateText)}</div>
      </div>
      <div class="upcoming-amount ${amountClass}">${fmt(item.amount)}</div>
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
function getPayPeriodInfo() {
  const periods = {
    weekly: { rank: 1, label: 'hebdo' },
    biweekly: { rank: 2, label: 'aux 2 semaines' },
    monthly: { rank: 3, label: 'mensuel' },
    quarterly: { rank: 4, label: 'aux 3 mois' },
    yearly: { rank: 5, label: 'annuel' }
  };

  const recurringRevenues = state.revenus
    .filter(r => r.recurrence && r.recurrence !== 'once' && periods[r.recurrence] && parseLocalDate(r.date))
    .map(r => ({ ...periods[r.recurrence], recurrence: r.recurrence, revenu: r }))
    .sort((a, b) => a.rank - b.rank);

  return recurringRevenues[0] || { ...periods.monthly, recurrence: 'monthly', revenu: null };
}

function getCurrentPayPeriod() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const info = getPayPeriodInfo();

  if (!info.revenu || info.recurrence === 'monthly') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end, nextStart: null, source: info.revenu || null, recurrence: 'monthly', label: 'mensuel' };
  }

  const anchor = parseLocalDate(info.revenu.date);
  const anchorDay = anchor.getDate();
  let start = new Date(anchor);
  let guard = 0;

  while (today < start && guard < 500) {
    const previous = subtractRecurrenceInterval(start, info.recurrence, anchorDay);
    if (!previous || previous >= start) break;
    start = previous;
    guard++;
  }

  let nextStart = addRecurrenceInterval(start, info.recurrence, anchorDay);
  while (nextStart && nextStart <= today && guard < 500) {
    start = nextStart;
    nextStart = addRecurrenceInterval(start, info.recurrence, anchorDay);
    guard++;
  }

  const end = nextStart ? new Date(nextStart) : new Date(start);
  end.setDate(end.getDate() - 1);

  return { start, end, nextStart, source: info.revenu, recurrence: info.recurrence, label: info.label };
}

function getPayPeriodDisplayLabel(period) {
  switch (period?.recurrence) {
    case 'weekly': return 'Cette semaine';
    case 'biweekly': return 'Cette quinzaine';
    case 'monthly': return 'Ce mois';
    case 'quarterly': return 'Cette période de 3 mois';
    case 'yearly': return 'Cette année';
    default: return 'Période';
  }
}

function getNextPeriodStart(period) {
  if (!period?.end) return null;
  if (period.nextStart) return new Date(period.nextStart);

  const next = new Date(period.end);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getPeriodStartForFutureDate(dateStr, period) {
  const itemDate = parseLocalDate(dateStr);
  if (!itemDate || !period?.end) return null;

  const currentEnd = new Date(period.end);
  currentEnd.setHours(0, 0, 0, 0);
  if (itemDate <= currentEnd) return null;

  let start = getNextPeriodStart(period);
  if (!start) return null;

  const recurrence = period.recurrence || 'monthly';
  let guard = 0;

  while (start && guard < 500) {
    let nextStart = addRecurrenceInterval(start, recurrence, start.getDate());
    if (!nextStart || nextStart <= start) {
      nextStart = new Date(start);
      nextStart.setMonth(nextStart.getMonth() + 1);
    }

    const end = new Date(nextStart);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);

    if (itemDate >= start && itemDate <= end) return start;
    start = nextStart;
    guard++;
  }

  return getNextPeriodStart(period);
}

function getFuturePeriodBadge(dateStr, period) {
  const futureStart = getPeriodStartForFutureDate(dateStr, period);
  if (!futureStart) return '';

  return `<div class="future-period-badge">🔮 Sera comptée à partir du ${formatDateShort(isoDate(futureStart))}</div>`;
}

function getRemainingCalculationMessage() {
  const budget = getCurrentPeriodBudget();
  const adjustments = getManualAdjustmentOffset();
  const remain = budget.baseRemain + adjustments;
  const adjustmentSign = adjustments < 0 ? '-' : '+';
  const periodLabel = `${getPayPeriodDisplayLabel(budget.period)} : ${formatDateShort(isoDate(budget.period.start))} → ${formatDateShort(isoDate(budget.period.end))}`;
  const countedEnvelopes = budget.allocatedEnvelopes || [];
  const envelopeLines = countedEnvelopes.length
    ? countedEnvelopes.map(env => `  • ${env.emoji || '•'} ${env.name || 'Enveloppe'} : ${fmt(parseFloat(env.amount) || 0)}`)
    : ['  • Aucune enveloppe cochée comme faite dans cette période'];

  return [
    'Calcul réel du reste à allouer',
    '',
    periodLabel,
    '',
    `+ Revenus de la période : ${fmt(budget.totalRevenus)}`,
    `- Enveloppes faites de la période : ${fmt(budget.totalAlloc)}`,
    ...envelopeLines,
    `- Fonds bonheur de la période : ${fmt(budget.totalSavings)}`,
    `${adjustmentSign} Ajustements manuels : ${fmt(Math.abs(adjustments))}`,
    '--------------------------------',
    `= Reste à allouer : ${fmt(remain)}`,
    '',
    'Formule : revenus - enveloppes faites - fonds bonheur + ajustements manuels.',
    `Les éléments prévus après le ${formatDateShort(isoDate(budget.period.end))} seront comptés dans leur période.`
  ].join('\n');
}

function showPayPeriodHelp() {
  alert(getRemainingCalculationMessage());
}

function getFirstOccurrenceInPeriod(item, period) {
  if (!item.date) return { date: null, noDate: true };
  const recurrence = item.recurrence || 'once';
  const startDate = parseLocalDate(item.date);
  if (!startDate) return null;

  if (recurrence === 'once') {
    return startDate >= period.start && startDate <= period.end
      ? { date: isoDate(startDate), noDate: false }
      : null;
  }

  if (startDate > period.end) return null;

  let current = new Date(startDate);
  const anchorDay = startDate.getDate();
  let guard = 0;

  // Une recurrence commence a sa date originale. On avance seulement vers le futur,
  // sinon un revenu futur pourrait etre compte dans la periode courante.
  while (current < period.start && guard < 500) {
    const next = addRecurrenceInterval(current, recurrence, anchorDay);
    if (!next || next <= current) break;
    current = next;
    guard++;
  }

  return current >= period.start && current <= period.end
    ? { date: isoDate(current), noDate: false }
    : null;
}

function itemOccursInPeriod(item, period) {
  return Boolean(getFirstOccurrenceInPeriod(item, period));
}

function getCurrentPeriodBudget() {
  const period = getCurrentPayPeriod();
  const revenus = state.revenus.filter(item => itemOccursInPeriod(item, period));
  const envelopes = state.envelopes.filter(item => itemOccursInPeriod(item, period));
  const allocatedEnvelopes = envelopes.filter(env => env.allocated);
  const savings = state.savings.filter(item => itemOccursInPeriod(item, period));
  const totalRevenus = revenus.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalAlloc = allocatedEnvelopes.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const totalSavings = savings.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0);
  const totalReserved = totalAlloc + totalSavings;

  return {
    period,
    revenus,
    envelopes,
    allocatedEnvelopes,
    savings,
    totalRevenus,
    totalAlloc,
    totalSavings,
    totalReserved,
    baseRemain: totalRevenus - totalReserved
  };
}

function getBaseRemainingAmount() {
  return getCurrentPeriodBudget().baseRemain;
}

function getManualAdjustmentOffset() {
  return (state.adjustments || []).reduce((sum, item) => sum + (parseFloat(item.difference) || 0), 0);
}

function getAdjustedRemainingAmount() {
  return getBaseRemainingAmount() + getManualAdjustmentOffset();
}

function formatAdjustmentDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function renderAdjustmentsHistory() {
  const box = document.getElementById('adjustmentsHistory');
  const meta = document.getElementById('remainingAdjustMeta');
  if (!box || !meta) return;

  const offset = getManualAdjustmentOffset();
  if (Math.abs(offset) >= 0.005) {
    meta.style.display = 'block';
    meta.textContent = `Ajustement manuel actif : ${fmtSigned(offset)}`;
  } else {
    meta.style.display = 'none';
    meta.textContent = '';
  }

  const rows = (state.adjustments || [])
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);

  if (rows.length === 0) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  box.style.display = 'grid';
  box.innerHTML = rows.map(row => {
    const note = row.cycle_reset
      ? 'Nouveau cycle'
      : (row.note ? escapeHtml(row.note) : 'Ajustement manuel');
    const icon = row.cycle_reset ? '🔄' : '✏️';
    const amount = row.cycle_reset ? 'ajustement remis à zéro' : fmtSigned(row.difference);
    return `
      <div class="adjustment-row">
        <span>${icon}</span>
        <span><strong>${amount}</strong> (${note}) · ${formatAdjustmentDate(row.created_at)}</span>
      </div>
    `;
  }).join('');
}

function openAdjustmentModal() {
  const modal = document.getElementById('adjustModal');
  if (!modal) return;

  const current = getAdjustedRemainingAmount();
  document.getElementById('adjustCurrentAmount').textContent = fmt(current);
  document.getElementById('adjustAmount').value = current.toFixed(2);
  document.getElementById('adjustNote').value = '';
  modal.classList.add('show');
  setTimeout(() => document.getElementById('adjustAmount')?.focus(), 80);
}

function closeAdjustmentModal() {
  document.getElementById('adjustModal')?.classList.remove('show');
}

async function saveManualAdjustment() {
  const amountInput = document.getElementById('adjustAmount');
  const noteInput = document.getElementById('adjustNote');
  const newAmount = parseFloat(amountInput.value);

  if (Number.isNaN(newAmount)) {
    alert('Entre le nouveau montant exact du reste à allouer.');
    return;
  }

  const previousAmount = getAdjustedRemainingAmount();
  const difference = newAmount - previousAmount;
  const btn = document.getElementById('adjustSaveBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sauvegarde...';

  const saved = await saveBudgetAdjustment({
    new_amount: newAmount,
    previous_amount: previousAmount,
    difference,
    note: noteInput.value.trim(),
    cycle_reset: false
  });

  btn.disabled = false;
  btn.textContent = originalText;

  if (saved) {
    closeAdjustmentModal();
    render();
  }
}

function openSavingMoveModal(saving, type = 'deposit') {
  const modal = document.getElementById('savingMoveModal');
  if (!modal || !saving) return;

  const isWithdraw = type === 'withdraw';
  const current = parseFloat(saving.amount) || 0;
  savingMove = { id: saving.id, type };

  document.getElementById('savingMoveTitle').textContent = `${isWithdraw ? 'Retirer de' : 'Déposer dans'} ${saving.name}`;
  document.getElementById('savingMoveHelp').textContent = isWithdraw
    ? "Tape seulement le montant à retirer. L'app calcule le nouveau total pour toi."
    : "Tape seulement le montant à ajouter. L'app calcule le nouveau total pour toi.";
  document.getElementById('savingMoveAmountLabel').textContent = isWithdraw ? 'Montant à retirer' : 'Montant à ajouter';
  document.getElementById('savingMoveCurrent').textContent = fmt(current);
  document.getElementById('savingMoveAmount').value = '';
  document.getElementById('savingMoveNote').value = '';
  updateSavingMovePreview();

  modal.classList.add('show');
  setTimeout(() => document.getElementById('savingMoveAmount')?.focus(), 80);
}

function closeSavingMoveModal() {
  document.getElementById('savingMoveModal')?.classList.remove('show');
  savingMove = { id: null, type: 'deposit' };
}

function updateSavingMovePreview() {
  const saving = state.savings.find(s => s.id === savingMove.id);
  const totalEl = document.getElementById('savingMoveTotal');
  if (!saving || !totalEl) return;

  const input = document.getElementById('savingMoveAmount');
  const amount = parseFloat(input?.value) || 0;
  const current = parseFloat(saving.amount) || 0;
  const next = savingMove.type === 'withdraw'
    ? Math.max(0, current - amount)
    : current + amount;

  totalEl.textContent = fmt(next);
}

async function confirmSavingMove() {
  const saving = state.savings.find(s => s.id === savingMove.id);
  const input = document.getElementById('savingMoveAmount');
  const noteInput = document.getElementById('savingMoveNote');
  const amount = parseFloat(input?.value);

  if (!saving) return;
  if (Number.isNaN(amount) || amount <= 0) {
    alert('Entre un montant plus grand que 0 $.');
    return;
  }

  const current = parseFloat(saving.amount) || 0;
  if (savingMove.type === 'withdraw' && amount > current) {
    alert('Tu ne peux pas retirer plus que le montant déjà réservé.');
    return;
  }

  const next = savingMove.type === 'withdraw' ? current - amount : current + amount;
  const roundedNext = Math.round(next * 100) / 100;
  const btn = document.getElementById('savingMoveConfirmBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sauvegarde...';

  saving.amount = roundedNext;
  const saved = await saveSaving(saving, false);

  btn.disabled = false;
  btn.textContent = originalText;

  if (saved) {
    addSavingMovementHistory({
      saving_id: saving.id,
      type: savingMove.type,
      amount,
      previous_amount: current,
      new_amount: roundedNext,
      note: noteInput?.value.trim() || ''
    });
    closeSavingMoveModal();
    render();
  }
}

function getNextOccurrenceOnOrAfter(dateStr, recurrence, from = new Date()) {
  const start = parseLocalDate(dateStr);
  if (!start) return isoDate(new Date());

  const today = new Date(from);
  today.setHours(0, 0, 0, 0);

  let current = new Date(start);
  const anchorDay = start.getDate();
  let guard = 0;

  while (current < today && guard < 500) {
    const next = addRecurrenceInterval(current, recurrence, anchorDay);
    if (!next || next <= current) break;
    current = next;
    guard++;
  }

  return isoDate(current);
}

function getDefaultSavingAutoDate(frequency = null) {
  const payInfo = getPayPeriodInfo();
  if (payInfo?.revenu?.date) {
    return getNextOccurrenceOnOrAfter(payInfo.revenu.date, payInfo.recurrence || frequency || 'monthly');
  }
  return isoDate(new Date());
}

async function applyDueRecurringSavingsDeposits() {
  if (!currentUser || !Array.isArray(state.savings)) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let changed = false;

  for (const saving of state.savings) {
    if (!saving.recurring_deposit_enabled) continue;

    const amountEach = parseFloat(saving.recurring_deposit_amount) || 0;
    const frequency = saving.recurring_deposit_frequency || 'once';
    if (amountEach <= 0 || frequency === 'once') continue;

    let nextDate = parseLocalDate(saving.recurring_deposit_next_date);
    if (!nextDate) {
      saving.recurring_deposit_next_date = getDefaultSavingAutoDate(frequency);
      await saveSaving(saving, false, { silent: true });
      changed = true;
      continue;
    }

    const anchorDay = nextDate.getDate();
    let currentAmount = parseFloat(saving.amount) || 0;
    const previousAmount = currentAmount;
    let totalAdded = 0;
    let guard = 0;

    while (nextDate <= today && guard < 120) {
      let deposit = amountEach;
      const target = parseFloat(saving.target_amount) || 0;

      if (target > 0) {
        const room = Math.max(0, target - currentAmount);
        deposit = Math.min(deposit, room);
      }

      if (deposit > 0) {
        currentAmount = Math.round((currentAmount + deposit) * 100) / 100;
        totalAdded = Math.round((totalAdded + deposit) * 100) / 100;
      }

      const advanced = addRecurrenceInterval(nextDate, frequency, anchorDay);
      if (!advanced || advanced <= nextDate) break;
      nextDate = advanced;
      guard++;
    }

    const nextDateStr = isoDate(nextDate);
    if (totalAdded > 0 || nextDateStr !== saving.recurring_deposit_next_date) {
      saving.amount = currentAmount;
      saving.recurring_deposit_next_date = nextDateStr;
      const saved = await saveSaving(saving, false, { silent: true });

      if (saved) {
        changed = true;
        if (totalAdded > 0) {
          addSavingMovementHistory({
            saving_id: saving.id,
            type: 'deposit',
            amount: totalAdded,
            previous_amount: previousAmount,
            new_amount: currentAmount,
            note: 'Dépôt automatique',
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  if (changed) {
    console.log('Dépôts automatiques des fonds bonheur vérifiés.');
  }
  return changed;
}

function openSavingAutoModal(saving) {
  const modal = document.getElementById('savingAutoModal');
  if (!modal || !saving) return;

  const current = parseFloat(saving.amount) || 0;
  const payInfo = getPayPeriodInfo();
  const frequency = saving.recurring_deposit_frequency && saving.recurring_deposit_frequency !== 'once'
    ? saving.recurring_deposit_frequency
    : (payInfo?.recurrence || 'biweekly');

  savingAuto = { id: saving.id };

  document.getElementById('savingAutoTitle').textContent = `Dépôt automatique · ${saving.name}`;
  document.getElementById('savingAutoCurrent').textContent = fmt(current);
  document.getElementById('savingAutoAmount').value = saving.recurring_deposit_amount || '';
  document.getElementById('savingAutoFrequency').value = frequency;
  document.getElementById('savingAutoDate').value = saving.recurring_deposit_next_date || getDefaultSavingAutoDate(frequency);

  updateSavingAutoPreview();
  modal.classList.add('show');
  setTimeout(() => document.getElementById('savingAutoAmount')?.focus(), 80);
}

function closeSavingAutoModal() {
  document.getElementById('savingAutoModal')?.classList.remove('show');
  savingAuto = { id: null };
}

function updateSavingAutoPreview() {
  const saving = state.savings.find(s => s.id === savingAuto.id);
  const totalEl = document.getElementById('savingAutoPreview');
  if (!saving || !totalEl) return;

  const amount = parseFloat(document.getElementById('savingAutoAmount')?.value) || 0;
  const current = parseFloat(saving.amount) || 0;
  const target = parseFloat(saving.target_amount) || 0;
  const next = target > 0 ? Math.min(target, current + amount) : current + amount;
  totalEl.textContent = fmt(next);
}

async function saveSavingAutoSettings() {
  const saving = state.savings.find(s => s.id === savingAuto.id);
  if (!saving) return;

  const amount = parseFloat(document.getElementById('savingAutoAmount')?.value);
  const frequency = document.getElementById('savingAutoFrequency')?.value || 'biweekly';
  const nextDate = document.getElementById('savingAutoDate')?.value || '';

  if (Number.isNaN(amount) || amount <= 0) {
    alert('Entre un montant automatique plus grand que 0 $.');
    return;
  }
  if (!nextDate) {
    alert('Choisis la date du prochain dépôt automatique.');
    return;
  }

  const btn = document.getElementById('savingAutoSaveBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sauvegarde...';

  saving.recurring_deposit_enabled = true;
  saving.recurring_deposit_amount = Math.round(amount * 100) / 100;
  saving.recurring_deposit_frequency = frequency;
  saving.recurring_deposit_next_date = nextDate;

  const saved = await saveSaving(saving, false);

  btn.disabled = false;
  btn.textContent = originalText;

  if (saved) {
    closeSavingAutoModal();
    render();
  }
}

async function disableSavingAuto() {
  const saving = state.savings.find(s => s.id === savingAuto.id);
  if (!saving) return;

  saving.recurring_deposit_enabled = false;
  saving.recurring_deposit_amount = 0;
  saving.recurring_deposit_frequency = 'once';
  saving.recurring_deposit_next_date = '';

  const saved = await saveSaving(saving, false);
  if (saved) {
    closeSavingAutoModal();
    render();
  }
}

function countRecurrent() {
  const recRev = state.revenus.filter(r => r.recurrence && r.recurrence !== 'once').length;
  const recEnv = state.envelopes.filter(e => e.recurrence && e.recurrence !== 'once').length;
  return recRev + recEnv;
}

function cloneCycleItems(items) {
  return (items || []).map(item => ({ ...item }));
}

function createCycleSnapshot() {
  return {
    revenus: cloneCycleItems(state.revenus),
    envelopes: cloneCycleItems(state.envelopes),
    adjustmentOffset: getManualAdjustmentOffset(),
    createdAt: Date.now()
  };
}

function showCycleConfirmation() {
  return new Promise(resolve => {
    const previous = document.getElementById('cycleConfirmOverlay');
    if (previous) previous.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cycleConfirmOverlay';
    overlay.className = 'cycle-confirm-overlay';
    overlay.innerHTML = `
      <div class="cycle-confirm-card" role="dialog" aria-modal="true" aria-labelledby="cycleConfirmTitle">
        <h3 id="cycleConfirmTitle">Es-tu sûre de vouloir démarrer un nouveau cycle?</h3>
        <p>Cette action prépare ton prochain cycle sans supprimer tes données.</p>
        <ul>
          <li>Tes éléments récurrents seront conservés</li>
          <li>Leurs dates seront avancées à la prochaine occurrence</li>
          <li>Les cases cochées seront décochées</li>
          <li>Ton ajustement manuel sera remis à zéro</li>
        </ul>
        <div class="cycle-confirm-actions">
          <button type="button" class="cycle-confirm-cancel">Annuler</button>
          <button type="button" class="cycle-confirm-submit">Confirmer</button>
        </div>
      </div>
    `;

    const onKeydown = event => {
      if (event.key === 'Escape' && document.body.contains(overlay)) {
        close(false);
      }
    };

    const close = result => {
      document.removeEventListener('keydown', onKeydown);
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
      resolve(result);
    };

    overlay.querySelector('.cycle-confirm-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('.cycle-confirm-submit').addEventListener('click', () => close(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKeydown);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    setTimeout(() => overlay.querySelector('.cycle-confirm-submit')?.focus(), 80);
  });
}

function clearCycleUndoTimer() {
  if (cycleUndoTimer) {
    clearTimeout(cycleUndoTimer);
    cycleUndoTimer = null;
  }
}

function hideCycleToast() {
  const toast = document.getElementById('cycleUndoToast');
  if (!toast) return;
  toast.classList.remove('show');
  setTimeout(() => toast.remove(), 220);
}

function showCycleToast(title, body, undoHandler = null) {
  clearCycleUndoTimer();
  hideCycleToast();

  const toast = document.createElement('div');
  toast.id = 'cycleUndoToast';
  toast.className = 'cycle-toast';
  toast.innerHTML = `
    <div class="cycle-toast-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(body)}</span>
    </div>
    ${undoHandler ? '<button type="button" class="cycle-toast-undo">Annuler</button>' : ''}
  `;

  if (undoHandler) {
    toast.querySelector('.cycle-toast-undo').addEventListener('click', undoHandler);
    cycleUndoTimer = setTimeout(() => {
      cycleUndoSnapshot = null;
      hideCycleToast();
    }, 60000);
  } else {
    cycleUndoTimer = setTimeout(() => {
      hideCycleToast();
      clearCycleUndoTimer();
    }, 4500);
  }

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
}

async function undoRenewCycle(snapshot) {
  if (!snapshot || cycleUndoInProgress) return;
  cycleUndoInProgress = true;

  const undoBtn = document.querySelector('#cycleUndoToast .cycle-toast-undo');
  if (undoBtn) {
    undoBtn.disabled = true;
    undoBtn.textContent = 'Restauration...';
  }

  try {
    for (const rev of snapshot.revenus) {
      await saveRevenu({ ...rev }, false);
    }

    for (const env of snapshot.envelopes) {
      await saveEnvelope({ ...env }, false);
    }

    const currentOffset = getManualAdjustmentOffset();
    const difference = snapshot.adjustmentOffset - currentOffset;
    if (Math.abs(difference) >= 0.005) {
      const previousAmount = getAdjustedRemainingAmount();
      await saveBudgetAdjustment({
        previous_amount: previousAmount,
        new_amount: previousAmount + difference,
        difference,
        note: 'Annulation du nouveau cycle',
        cycle_reset: false
      }, { silent: true });
    }

    await loadUserData();
    render();
    cycleUndoSnapshot = null;
    showCycleToast('Nouveau cycle annulé', 'État restauré.', null);
  } catch (err) {
    alert('Impossible d’annuler le nouveau cycle : ' + err.message);
  } finally {
    cycleUndoInProgress = false;
  }
}

// Renouveler un cycle: ne jamais supprimer, seulement preparer le prochain cycle
async function renewCycle() {
  if (!canUseProFeature('Le nouveau cycle automatique')) return;

  const confirmed = await showCycleConfirmation();
  if (!confirmed) return;

  const btn = document.getElementById('newCycleBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Renouvellement...';
  const snapshot = createCycleSnapshot();

  try {
    // Les revenus restent tous en place. Les recurrents avancent, les autres sont seulement decoches.
    const previousAdjustedAmount = getAdjustedRemainingAmount();
    const activeAdjustmentOffset = getManualAdjustmentOffset();
    let updated = 0;
    for (const r of state.revenus) {
      const wasReceived = Boolean(r.received);
      const isRecurring = r.recurrence && r.recurrence !== 'once';
      r.received = false;
      if (isRecurring) {
        if (r.date) {
          r.date = advanceDate(r.date, r.recurrence);
        }
      }
      if (wasReceived || isRecurring) updated++;
      await saveRevenu(r, false);
    }
    // Les enveloppes restent toutes en place. Les recurrentes avancent, les autres sont seulement decochees.
    for (const e of state.envelopes) {
      const wasAllocated = Boolean(e.allocated);
      const isRecurring = e.recurrence && e.recurrence !== 'once';
      e.allocated = false;
      if (isRecurring) {
        if (e.date) {
          e.date = advanceDate(e.date, e.recurrence);
        }
      }
      if (wasAllocated || isRecurring) updated++;
      await saveEnvelope(e, false);
    }
    await saveBudgetAdjustment({
      previous_amount: previousAdjustedAmount,
      new_amount: previousAdjustedAmount - activeAdjustmentOffset,
      difference: -activeAdjustmentOffset,
      note: 'Nouveau cycle',
      cycle_reset: true
    }, { silent: true });
    render();
    cycleUndoSnapshot = snapshot;
    showCycleToast('✅ Nouveau cycle démarré!', `${updated} éléments mis à jour. Les dates ont été avancées.`, () => undoRenewCycle(cycleUndoSnapshot));
  } catch (err) {
    alert('Erreur : ' + err.message);
    cycleUndoSnapshot = null;
    await loadUserData();
    render();
  }
  btn.disabled = false;
  btn.textContent = `🔄 Nouveau cycle (${getPayPeriodInfo().label})`;
}

// Avancer une date selon la récurrence
function advanceDate(dateStr, recurrence) {
  const d = new Date(dateStr + 'T00:00:00');
  const next = addRecurrenceInterval(d, recurrence);
  return next ? isoDate(next) : dateStr;
}

// Calculer les jours restants de l'essai
function getTrialDaysLeft() {
  if (!currentUser || !currentUser.user_metadata || !currentUser.user_metadata.trial_started_at) {
    return TRIAL_DAYS;
  }
  const start = new Date(currentUser.user_metadata.trial_started_at);
  const now = new Date();
  const daysUsed = Math.floor((now - start) / 86400000);
  return Math.max(0, TRIAL_DAYS - daysUsed);
}

// ============================================================
// RENDU PRINCIPAL
// ============================================================
function render() {
  // Date
  const today = new Date();
  document.getElementById('todayDate').textContent =
    today.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
  renderDailyThought();
  updateUpcomingButton();

  // Barre "Nouveau cycle" si éléments récurrents
  const recCount = countRecurrent();
  const cycleBar = document.getElementById('cycleBar');
  const cycleText = document.getElementById('cycleBarText');
  const cycleBtn = document.getElementById('newCycleBtn');
  if (recCount > 0) {
    cycleBar.style.display = 'flex';
    if (cycleBtn && !cycleBtn.disabled) {
      cycleBtn.textContent = `🔄 Nouveau cycle (${getPayPeriodInfo().label})`;
    }
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

  // Total revenus de la periode de paie courante
  const periodBudget = getCurrentPeriodBudget();
  const totalRevenus = periodBudget.totalRevenus;
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
    const futureBadge = getFuturePeriodBadge(r.date, periodBudget.period);
    const div = document.createElement('div');
    div.className = 'item' + (r.received ? ' received' : '');
    div.innerHTML = `
      <div class="item-emoji">${r.emoji}</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(r.name)}${recBadge}</div>
        <div class="item-amount"><strong class="green">${fmt(r.amount)}</strong>${when}</div>
        ${futureBadge}
      </div>
      <div class="item-actions">
        <button class="icon-btn check ${r.received?'on':''}" data-rev-toggle="${r.id}">${r.received?'✓':'○'}</button>
        <button class="icon-btn" data-rev-edit="${r.id}">✎</button>
      </div>
    `;
    revBox.appendChild(div);
  });

  // Reste à allouer
  const totalAlloc = periodBudget.totalAlloc;
  const totalSavings = periodBudget.totalSavings;
  const totalReserved = periodBudget.totalReserved;
  const baseRemain = periodBudget.baseRemain;
  const remain = baseRemain + getManualAdjustmentOffset();

  const amountEl = document.getElementById('remainingAmount');
  const subEl = document.getElementById('remainingSub');
  const periodEl = document.getElementById('payPeriodMeta');
  if (periodEl) {
    periodEl.textContent = `${getPayPeriodDisplayLabel(periodBudget.period)} : ${formatDateShort(isoDate(periodBudget.period.start))} → ${formatDateShort(isoDate(periodBudget.period.end))}`;
  }
  const periodHintEl = document.getElementById('payPeriodHint');
  if (periodHintEl) {
    periodHintEl.textContent = `ⓘ Les paiements prévus après le ${formatDateShort(isoDate(periodBudget.period.end))} seront comptés à leur période`;
  }
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
  renderAdjustmentsHistory();

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
      const historyRows = getSavingMovementHistory(item.id);
      const history = historyRows.length
        ? `<div class="saving-history">${
            historyRows.map(row => {
              const sign = row.type === 'withdraw' ? '-' : '+';
              const note = row.note ? ` · ${escapeHtml(row.note)}` : '';
              return `<div><strong>${sign}${fmt(row.amount)}</strong>${note} · ${formatMovementDate(row.created_at)}</div>`;
            }).join('')
          }</div>`
        : '';
      const autoAmount = parseFloat(item.recurring_deposit_amount) || 0;
      const autoLabel = item.recurring_deposit_enabled && autoAmount > 0
        ? `<div class="saving-auto-note">Auto : ${fmt(autoAmount)} · ${getRecurrenceLabel(item.recurring_deposit_frequency).replace('🔁 ', '')}${item.recurring_deposit_next_date ? ` · prochain ${formatDateShort(item.recurring_deposit_next_date)}` : ''}</div>`
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
          ${autoLabel}
          ${history}
        </div>
        <div class="item-actions saving-actions">
          <button class="saving-mini-btn deposit" data-save-deposit="${item.id}">+ Déposer</button>
          <button class="saving-mini-btn withdraw" data-save-withdraw="${item.id}">- Retirer</button>
          <button class="saving-mini-btn auto" data-save-auto="${item.id}">Auto</button>
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
      const futureBadge = getFuturePeriodBadge(env.date, periodBudget.period);
      const div = document.createElement('div');
      div.className = 'item' + (env.allocated ? ' allocated' : '');
      div.innerHTML = `
        <div class="item-emoji">${env.emoji}</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(env.name)}${recBadge}</div>
          <div class="item-amount">${fmt(env.amount)}${when}</div>
          ${futureBadge}
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

document.getElementById('upgradeBtn').onclick = async () => {
  document.getElementById('userDropdown').classList.remove('show');
  await loadLifetimeOfferStatus();
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

document.getElementById('helpFaqBtn').onclick = () => {
  document.getElementById('userDropdown').classList.remove('show');
  showScreen('faqScreen');
};

Object.assign(window, {
  openDeleteAccountModal,
  closeDeleteAccountModal,
  showDeleteAccountFinalStep,
  updateDeleteAccountConfirmState,
  permanentlyDeleteAccount
});

document.getElementById('deleteAccountBtn')?.addEventListener('click', e => openDeleteAccountModal(e));
document.getElementById('deleteAccountCancelBtn')?.addEventListener('click', closeDeleteAccountModal);
document.getElementById('deleteAccountContinueBtn')?.addEventListener('click', showDeleteAccountFinalStep);
document.getElementById('deleteAccountBackBtn')?.addEventListener('click', closeDeleteAccountModal);
document.getElementById('deleteAccountConfirmInput')?.addEventListener('input', updateDeleteAccountConfirmState);
document.getElementById('deleteAccountConfirmBtn')?.addEventListener('click', permanentlyDeleteAccount);
document.getElementById('deleteAccountModal')?.addEventListener('click', e => {
  if (e.target.id === 'deleteAccountModal') closeDeleteAccountModal();
});

// Bouton retour sur la page PRO
document.getElementById('proBackBtn').onclick = () => {
  showScreen('main');
};

document.getElementById('billingBackBtn').onclick = () => {
  showScreen('main');
};

document.getElementById('faqBackBtn').onclick = () => {
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

function applyLifetimeOfferDisplay(status) {
  const badge = document.getElementById('subscribeLifetimeBadge');
  const was = document.getElementById('subscribeLifetimeWas');
  const price = document.getElementById('subscribeLifetimePrice');
  const text = document.getElementById('subscribeLifetimeOfferText');
  const billingBtn = document.getElementById('billingLifetimeBtn');

  const isEarlyBird = !status || status.isEarlyBird;
  const remaining = status ? Math.max(Number(status.remaining || 0), 0) : null;
  const limit = status ? Math.max(Number(status.limit || 100), 1) : 100;

  if (isEarlyBird) {
    if (badge) badge.textContent = 'EARLY BIRD';
    if (was) was.style.display = 'inline';
    if (price) price.textContent = '39,99 $';
    if (text) {
      text.textContent = remaining === null
        ? 'Offre de lancement · 100 premières places'
        : `Offre de lancement · ${remaining} places restantes sur ${limit}`;
    }
    if (billingBtn) billingBtn.textContent = 'Accès à vie · Early Bird 39,99 $ ✨';
  } else {
    if (badge) badge.textContent = 'PRIX RÉGULIER';
    if (was) was.style.display = 'none';
    if (price) price.textContent = '99 $';
    if (text) text.textContent = 'Paiement unique · sans renouvellement';
    if (billingBtn) billingBtn.textContent = 'Accès à vie · 99 $ une seule fois ✨';
  }
}

async function loadLifetimeOfferStatus() {
  try {
    const response = await fetch(`${API_URL}/api/lifetime-offer-status`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Compteur indisponible');
    lifetimeOfferStatus = await response.json();
  } catch (error) {
    console.warn('Compteur accès à vie indisponible:', error.message);
    lifetimeOfferStatus = null;
  }

  applyLifetimeOfferDisplay(lifetimeOfferStatus);
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
  applyLifetimeOfferDisplay(lifetimeOfferStatus);
}

async function openBillingOptions() {
  await loadSubscription();
  await loadLifetimeOfferStatus();
  renderBillingOptions();
  showScreen('billingScreen');
}

// Fonction pour démarrer un abonnement
async function startSubscription(plan, sourceButton = null) {
  if (!currentUser) {
    alert('Tu dois être connecté(e)');
    return;
  }

  if (plan === 'lifetime') {
    await loadLifetimeOfferStatus();
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
  if (t.dataset.action === 'open-adjustment') {
    openAdjustmentModal();
    return;
  } else if (t.dataset.action === 'show-pay-period-help') {
    showPayPeriodHelp();
    return;
  } else if (t.dataset.action === 'open-upcoming' || t.id === 'upcomingBtn') {
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
  } else if (t.dataset.saveDeposit) {
    const saving = state.savings.find(x => x.id === t.dataset.saveDeposit);
    if (saving) openSavingMoveModal(saving, 'deposit');
  } else if (t.dataset.saveWithdraw) {
    const saving = state.savings.find(x => x.id === t.dataset.saveWithdraw);
    if (saving) openSavingMoveModal(saving, 'withdraw');
  } else if (t.dataset.saveAuto) {
    const saving = state.savings.find(x => x.id === t.dataset.saveAuto);
    if (saving) openSavingAutoModal(saving);
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

document.getElementById('adjustCancelBtn')?.addEventListener('click', closeAdjustmentModal);
document.getElementById('adjustSaveBtn')?.addEventListener('click', saveManualAdjustment);
document.getElementById('adjustModal')?.addEventListener('click', e => {
  if (e.target.id === 'adjustModal') closeAdjustmentModal();
});

document.getElementById('savingMoveAmount')?.addEventListener('input', updateSavingMovePreview);
document.getElementById('savingMoveCancelBtn')?.addEventListener('click', closeSavingMoveModal);
document.getElementById('savingMoveConfirmBtn')?.addEventListener('click', confirmSavingMove);
document.getElementById('savingMoveModal')?.addEventListener('click', e => {
  if (e.target.id === 'savingMoveModal') closeSavingMoveModal();
});

document.getElementById('savingAutoAmount')?.addEventListener('input', updateSavingAutoPreview);
document.getElementById('savingAutoFrequency')?.addEventListener('change', updateSavingAutoPreview);
document.getElementById('savingAutoDate')?.addEventListener('change', updateSavingAutoPreview);
document.getElementById('savingAutoCancelBtn')?.addEventListener('click', closeSavingAutoModal);
document.getElementById('savingAutoSaveBtn')?.addEventListener('click', saveSavingAutoSettings);
document.getElementById('savingAutoDisableBtn')?.addEventListener('click', disableSavingAuto);
document.getElementById('savingAutoModal')?.addEventListener('click', e => {
  if (e.target.id === 'savingAutoModal') closeSavingAutoModal();
});

document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !currentUser) return;
  const changed = await applyDueRecurringSavingsDeposits();
  if (changed) render();
});

document.getElementById('resetBtn').onclick = async () => {
  if (!confirm('Effacer TOUTES tes données et recommencer à zéro? Cette action est irréversible.')) return;

  try {
    await supabaseClient.from('revenus').delete().eq('user_id', currentUser.id);
    await supabaseClient.from('envelopes').delete().eq('user_id', currentUser.id);
    await supabaseClient.from('savings').delete().eq('user_id', currentUser.id);
    await supabaseClient.from('budget_adjustments').delete().eq('user_id', currentUser.id);
    localStorage.removeItem(getSavingsMovementsKey());
    state = { revenus: [], envelopes: [], savings: [], adjustments: [] };
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
loadLifetimeOfferStatus();
checkAuth();
