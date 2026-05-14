const CACHE = 'avantlapaie-v44';
const ASSETS = [
  './',
  './index.html',
  './presentation.html',
  './confidentialite.html',
  './app.js',
  './config.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apercu-facebook.jpg',
  './apercu-application-reelle.jpeg'
];

try {
  importScripts('./firebase-config.js?v=2');

  if (self.FIREBASE_CONFIG && self.FIREBASE_CONFIG.apiKey) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

    firebase.initializeApp(self.FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(payload => {
      const appUrl = self.AVANTLAPAIE_APP_URL || './';
      const title = payload.notification?.title || payload.data?.title || 'Avant la Paie';
      const body = payload.notification?.body || payload.data?.body || 'Petit rappel bienveillant.';

      self.registration.showNotification(title, {
        body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: payload.data?.itemId ? `avant-la-paie-${payload.data.itemId}` : 'avant-la-paie-rappel',
        renotify: false,
        data: {
          url: payload.fcmOptions?.link || payload.data?.url || appUrl
        }
      });
    });
  }
} catch (e) {
  console.warn('Firebase Messaging non initialise dans le service worker:', e);
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Ne pas mettre en cache les appels API
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('vercel.app')) return;
  if (e.request.url.includes('stripe.com')) return;

  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.AVANTLAPAIE_APP_URL || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return null;
    })
  );
});
