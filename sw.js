/* Service Worker — cache offline base */
const CACHE = "orsetto-v1";
const ASSETS = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];

self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)))
);

self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/")) return; // non cachare le API
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
