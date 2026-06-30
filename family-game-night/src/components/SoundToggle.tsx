"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted, unlockSound } from "@/lib/sound";

// Small speaker button to mute/unmute game sounds (persists per device).
export function SoundToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(!isMuted());
    // unlock audio on the first interaction anywhere on the page
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <button
      onClick={() => {
        const next = !on;
        setOn(next);
        setMuted(!next);
      }}
      aria-label={on ? "Mute sounds" : "Unmute sounds"}
      className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg active:translate-y-0.5"
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}
