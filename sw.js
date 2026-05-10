/* Service Worker — cache offline base */
const CACHE = "orsetto-v2";
const ASSETS = ["/suky-frontend/", "/suky-frontend/index.html", "/suky-frontend/style.css", "/suky-frontend/app.js", "/suky-frontend/manifest.json"];

self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)))
);

self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/")) return; // non cachare le API
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
