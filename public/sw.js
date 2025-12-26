// Service Worker para RetaPadel PWA
const CACHE_NAME = "retapadel-v1.2.0";
const urlsToCache = [
  "/manifest.json",
  "/favicon.svg",
  "/apple-touch-icon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/imgmeta-optimized.jpg",
  "/ios-pwa.css",
];

// Install event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
  // Forzar activación inmediata del nuevo Service Worker
  self.skipWaiting();
});

// Fetch event - Network First para archivos JS/CSS con hash y HTML
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // No cachear HTML, JS ni CSS con hash (siempre buscar versión más reciente del servidor)
  if (url.pathname === '/' || 
      url.pathname === '/index.html' || 
      url.pathname.includes('/static/js/') || 
      url.pathname.includes('/static/css/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // No cachear estos archivos, siempre usar la versión más reciente
          return response;
        })
        .catch(() => {
          // Si falla la red, intentar desde cache solo como último recurso
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Para otros recursos estáticos (imágenes, iconos, etc.), usar cache primero
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((response) => {
        // Cachear solo si es exitoso
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});

// Activate event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tomar control inmediato de todas las páginas
  return self.clients.claim();
});
