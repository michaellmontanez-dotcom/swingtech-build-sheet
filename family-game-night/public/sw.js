// Minimal service worker — enough to make the app installable as a PWA and to
// give an offline-friendly shell. Game state is always live (Supabase Realtime),
// so we deliberately use network-first for navigations and never cache API calls.
const CACHE = "gamenight-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept API / Supabase / realtime traffic.
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;

  // Never cache-first the Next.js build output. These chunks are content-hashed
  // per deploy; serving a stale chunk against fresh HTML breaks hydration so no
  // event handlers attach and every tap silently does nothing. Always go to the
  // network for them (they're immutable per hash, so there's nothing to gain).
  if (url.pathname.startsWith("/_next/")) return;

  // Network-first for navigations so players always get fresh room state,
  // falling back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  // Cache-first for static assets (icons, etc.).
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((resp) => {
        if (resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      })
    )
  );
});
