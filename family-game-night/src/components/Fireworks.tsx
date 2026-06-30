"use client";

import { useMemo } from "react";

const COLORS = ["#f43f5e", "#facc15", "#10b981", "#0ea5e9", "#a855f7", "#f97316", "#ec4899"];

// Full-screen celebration: confetti rain + a few firework bursts. Pure CSS
// animation (keyframes in globals.css), pointer-events-none so it never blocks
// taps on the banner underneath.
export function Fireworks() {
  const confetti = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        dur: 2.4 + Math.random() * 2.2,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 8,
        h: 8 + Math.random() * 10,
        rot: Math.random() * 360,
      })),
    []
  );
  const bursts = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        left: 12 + Math.random() * 76,
        top: 12 + Math.random() * 45,
        delay: i * 0.5 + Math.random() * 0.4,
        color: COLORS[(i * 3) % COLORS.length],
      })),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {confetti.map((p, i) => (
        <span
          key={`c${i}`}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-6vh",
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rot}deg)`,
            animation: `confetti-fall ${p.dur}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      {bursts.map((b, i) => (
        <span
          key={`b${i}`}
          style={{
            position: "absolute",
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: 10,
            height: 10,
            borderRadius: "9999px",
            boxShadow: `0 0 0 2px ${b.color}`,
            animation: `firework-burst 1.1s ease-out ${b.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
