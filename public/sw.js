/* Culturosity service worker.
 * Caches ONLY the static app shell and public brand assets.
 * Never caches /api/* (catalogue data, promo codes, member credentials, admin research, redemption tokens).
 * Navigations fall back to the cached shell, then to /offline.html when offline.
 */
const VERSION = "cul-shell-v2"; // bump whenever cached static images change
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/brand/culturosity-logo.webp", "/brand/culturosity-logo.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network only, never cached

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(async () => (await caches.match("/")) || (await caches.match("/offline.html"))),
    );
    return;
  }
  // Hashed build assets and brand files: cache-first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/") || /\.(png|webp|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(e.request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
