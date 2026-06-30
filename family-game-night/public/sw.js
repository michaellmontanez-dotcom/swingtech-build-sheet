// Minimal service worker — enough to make the app installable as a PWA and to
// give an offline-friendly shell. Game state is always live (Supabase Realtime),
// so we deliberately use network-first for navigations and never cache API calls.
const CACHE = "gamenight-v4";

// --- Push notifications ----------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    (async () => {
      // Don't buzz the player if they're already looking at the app.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = wins.some((w) => w.visibilityState === "visible");
      if (visible) return;
      await self.registration.showNotification(data.title || "Game Night", {
        body: data.body || "It's your turn!",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag || "gamenight",
        renotify: true,
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Force any already-open page to reload under THIS fresh worker so it runs
      // the latest chunks. This is what actually breaks iOS's stale-PWA grip:
      // the new worker drives the reload, so it works even when the page's own
      // JavaScript is the old, broken version that never updates on its own.
      const wins = await self.clients.matchAll({ type: "window" });
      for (const win of wins) {
        // only reload pages that were already controlled (an UPDATE), so the
        // very first install of the app doesn't double-load.
        if (win.url) win.navigate(win.url).catch(() => {});
      }
    })()
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
