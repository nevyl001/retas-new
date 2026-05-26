// Service Worker para RivieraApp PWA — versión minimalista
const CACHE_NAME = "rivieraapp-v1.0.2";
const urlsToCache = [
  "/manifest.json",
  "/icon-192x192.png?v=8",
  "/icon-512x512.png?v=8",
  "/apple-touch-icon-180.png?v=8",
  "/logo-riviera.png?v=1",
  "/logo-source.png?v=1",
];

// Install event - solo cachear assets estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    }).then(() => self.skipWaiting())
  );
});

// Activate event - limpiar TODO
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - evitar interceptar requests no seguros/problema de CORS.
self.addEventListener("fetch", (event) => {
  // Solo manejar GET del mismo origen para no romper auth/API externas.
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
