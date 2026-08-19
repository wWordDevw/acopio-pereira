// Service worker.
//
// El fallo que motivó esta versión: la estrategia era cache-first sin
// revalidar, así que un archivo ya cacheado no se volvía a pedir nunca. Cada
// despliegue de front dependía de que alguien recordara subir CACHE a mano; el
// día que se olvidó, la gente siguió viendo la versión vieja aunque el
// servidor ya tuviera la nueva.
//
// Ahora:
//   · navegación (HTML) → red primero, caché como respaldo. Un despliegue se
//     ve en la siguiente carga, sin depender de la versión.
//   · estáticos        → se sirve la caché al instante y se refresca por
//     detrás (stale-while-revalidate). Sigue abriendo sin señal.
//   · /api/            → siempre red. El inventario nunca se sirve viejo.
const CACHE = "insumos-v8";
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

function esNavegacion(req) {
  return (
    req.mode === "navigate" ||
    (req.method === "GET" && (req.headers.get("accept") || "").includes("text/html"))
  );
}

async function redPrimero(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match("/offline.html"));
  }
}

async function cacheYRefresca(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const red = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    // No esperamos a la red: la respuesta sale ya y la caché queda al día
    // para la próxima carga.
    return cached;
  }
  return (await red) || (await caches.match("/offline.html"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(esNavegacion(req) ? redPrimero(req) : cacheYRefresca(req));
});
