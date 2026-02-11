// Service Worker para RetaPadel PWA - Versión minimalista
const CACHE_NAME = "retapadel-v5.0.0";
const urlsToCache = [
  "/manifest.json",
  "/favicon.svg",
  "/apple-touch-icon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
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

// Fetch event - NO CACHEAR NADA, solo pasar al network
self.addEventListener("fetch", (event) => {
  // Simplemente pasar todas las peticiones a la red sin cache
  event.respondWith(fetch(event.request));
});
