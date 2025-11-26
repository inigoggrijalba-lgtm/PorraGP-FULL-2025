// Importar scripts de Firebase para el Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuración de Firebase (Debe coincidir con la de src/services/firebase.ts)
const firebaseConfig = {
  apiKey: "AIzaSyCUYthQS5ocNb2WXJYHnB8nlLPC714yHnc",
  authDomain: "porragp-notificaciones.firebaseapp.com",
  projectId: "porragp-notificaciones",
  storageBucket: "porragp-notificaciones.firebasestorage.app",
  messagingSenderId: "564026965242",
  appId: "1:564026965242:web:f72d2aada939dfff6f9d43",
  measurementId: "G-R0GGSTBBR9"
};

firebase.initializeApp(firebaseConfig);

// Inicializar mensajería en segundo plano
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/PorraGP-FULL-2025/icons/android/android-launchericon-192-192.png',
    badge: '/PorraGP-FULL-2025/icons/android/android-launchericon-192-192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- Lógica existente de Caché ---
const CACHE_NAME = 'porragp-cache-v4-fcm'; // Actualizado para forzar recarga
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Ignorar peticiones a Google Sheets, API de MotoGP o Firebase
  const url = event.request.url;
  if (url.includes('docs.google.com') || url.includes('motogp.pulselive.com') || url.includes('googleapis.com') || url.includes('firebase')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
