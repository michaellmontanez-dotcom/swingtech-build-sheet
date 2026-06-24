"use client";
import { useEffect } from "react";

// Registers the service worker so the app qualifies as an installable PWA, and
// auto-reloads ONCE when a new version takes control so phones running stale
// cached code self-heal without anyone deleting/re-adding the home-screen icon.
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let updateTimer: ReturnType<typeof setInterval> | null = null;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
          // Re-check for a new deploy periodically so an app left OPEN still
          // picks up fixes (and auto-reloads via controllerchange) without the
          // user having to close and reopen it.
          updateTimer = setInterval(() => reg.update().catch(() => {}), 60000);
        })
        .catch(() => {
          /* ignore — app still works without it, just not installable offline */
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);

    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (updateTimer) clearInterval(updateTimer);
    };
  }, []);
  return null;
}
