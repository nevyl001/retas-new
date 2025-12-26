// Service Worker para RetaPadel PWA
const CACHE_NAME = "retapadel-v1.3.0";
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
  
  // Para HTML, JS y CSS: siempre buscar en la red primero, nunca usar cache
  if (url.pathname === '/' || 
      url.pathname === '/index.html' || 
      url.pathname.includes('/static/js/') || 
      url.pathname.includes('/static/css/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          // Si la respuesta es exitosa, devolverla sin cachear
          if (response.status === 200) {
            return response;
          }
          // Si hay error 404, no intentar cache, lanzar error
          throw new Error('Resource not found');
        })
        .catch((error) => {
          // Si falla la red o hay 404, no usar cache para estos archivos
          // Dejar que el navegador maneje el error
          console.error('Failed to fetch:', event.request.url, error);
          return fetch(event.request);
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
          // Eliminar TODOS los caches antiguos, incluyendo versiones anteriores
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      ).then(() => {
        // Eliminar también cualquier cache de index.html o archivos JS/CSS
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.keys().then((keys) => {
            return Promise.all(
              keys.map((key) => {
                const url = new URL(key.url);
                // Eliminar cualquier cache de HTML, JS o CSS
                if (url.pathname === '/' || 
                    url.pathname === '/index.html' || 
                    url.pathname.includes('/static/js/') || 
                    url.pathname.includes('/static/css/')) {
                  console.log("Deleting cached resource:", url.pathname);
                  return cache.delete(key);
                }
              })
            );
          });
        });
      });
    })
  );
  // Tomar control inmediato de todas las páginas
  return self.clients.claim();
});
