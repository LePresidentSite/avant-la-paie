// ============================================================
// Configuration publique Firebase Cloud Messaging
// Remplir ces valeurs apres la creation du projet Firebase.
// Ces valeurs sont publiques, mais elles doivent correspondre
// exactement a ton app Web Firebase.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD32lFpvKZQ1OCf0sgftAxz-r2cGAjTiNU',
  authDomain: 'avant-la-paie.firebaseapp.com',
  projectId: 'avant-la-paie',
  storageBucket: 'avant-la-paie.firebasestorage.app',
  messagingSenderId: '918977665853',
  appId: '1:918977665853:web:1b8f7dcb318dd2ba2fc354'
};

// Firebase Console > Project settings > Cloud Messaging
// > Web Push certificates > Generate key pair
const FIREBASE_VAPID_KEY = 'BHc03Yq4nTVZntaZuZecqrTOpys958uKKr3qzN-hZEc2TyD3g-ccOLewPF-KE4m8kn7r2xIAaStBLrGYWTxktW4';

if (typeof self !== 'undefined') {
  self.FIREBASE_CONFIG = FIREBASE_CONFIG;
  self.FIREBASE_VAPID_KEY = FIREBASE_VAPID_KEY;
}
