const CACHE = "acopio-v2";
const SHELL = [
  "/",
  "/index.html",
  "/crear.html",
  "/punto.html",
  "/lista.html",
  "/offline.html",
  "/css/app.css",
  "/css/leaflet.css",
  "/js/leaflet.js",
  "/js/api.js",
  "/js/categorias.js",
  "/js/map.js",
  "/js/crear.js",
  "/js/punto.js",
  "/js/lista.js",
  "/js/voz.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => caches.match("/offline.html"));
    }),
  );
});
