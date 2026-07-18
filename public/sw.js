// Service worker: offline app shell for the door iPads.
// - Navigations: network-first (fresh deploys win), cached shell when offline.
// - Hashed /assets/*: cache-first (immutable by name).
// - /api/* is NEVER cached — data correctness lives in IndexedDB + the outbox.
const CACHE = "eventreg-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put("/__shell", copy)));
          return r;
        })
        .catch(() => caches.match("/__shell"))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (r.ok) {
            const copy = r.clone();
            e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
          }
          return r;
        })
    )
  );
});
