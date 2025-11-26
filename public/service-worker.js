// Un Service Worker simple con estrategia "cache-first"
const CACHE_NAME = 'porragp-cache-v3';
// No podemos conocer los nombres de los archivos de compilación, así que cacheamos lo esencial.
// Idealmente, el proceso de compilación inyectaría una lista más completa.
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
];

self.addEventListener('install', event => {
  // Realiza los pasos de la instalación
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta');
        // AddAll fallará si alguno de los recursos no se puede obtener.
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Para la hoja de Google Sheets, siempre ir a la red.
  if (event.request.url.includes('docs.google.com/spreadsheets')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Para otras peticiones, intentar primero la caché, y si no, la red.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - devolver la respuesta de la caché
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