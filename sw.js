/* Roomspin service worker — bump CACHE when you change any file to force an update */
const CACHE = "roomspin-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./js/constants.js",
  "./js/utils.js",
  "./js/icons.js",
  "./js/wheel.js",
  "./js/logic.js",
  "./js/state.js",
  "./js/app.js",
  "./js/spin.js",
  "./js/render-rooms.js",
  "./js/render-spin.js",
  "./js/render-week.js",
  "./js/render-progress.js",
  "./js/render-settings.js",
  "./js/io.js",
  "./js/wire.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Network-first for the page and the scripts, so a deploy lands as soon as you're online
  // instead of waiting for a cache bump to be noticed. Falls back to cache when offline.
  if (req.mode === "navigate" || /\.js$|\.css$/.test(new URL(req.url).pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "./index.html" : req, copy));
          return res;
        })
        .catch(() => caches.match(req.mode === "navigate" ? "./index.html" : req))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest).
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit)
    )
  );
});
