"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/pushClient";

// Bell toggle that subscribes this device to "it's your turn" push notifications.
export function TurnAlerts({ playerId, roomId, name }: { playerId: string; roomId: string | null; name: string }) {
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  if (state === "unsupported") return null;

  async function toggle() {
    setHint("");
    if (state === "needs-install") {
      setHint("On iPhone: open in Safari → Share → Add to Home Screen, then open that icon to enable alerts.");
      return;
    }
    if (state === "denied") {
      setHint("Notifications are blocked in your phone settings for this app.");
      return;
    }
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush(playerId);
        setState("off");
      } else {
        setState(await enablePush(playerId, roomId, name));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        disabled={busy}
        aria-label="Turn alerts"
        title="Get a notification when it's your turn"
        className={`grid h-9 w-9 place-items-center rounded-full text-lg active:translate-y-0.5 ${
          state === "on" ? "bg-sunny text-purple-900" : "bg-white/10"
        }`}
      >
        {state === "on" ? "🔔" : "🔕"}
      </button>
      {hint && (
        <div className="absolute left-1/2 top-11 z-30 w-56 -translate-x-1/2 rounded-xl bg-black/85 p-2 text-center text-xs text-white shadow-pop">
          {hint}
        </div>
      )}
    </div>
  );
}
