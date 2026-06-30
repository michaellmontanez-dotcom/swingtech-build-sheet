"use client";

// Tiny synthesized sound engine (Web Audio API — no audio files to download).
// iOS requires a user gesture to start audio, so call unlockSound() from the
// first tap; after that, event sounds play freely.

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let muted: boolean | null = null;

function getCtx(): Ctx | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function isMuted(): boolean {
  if (muted !== null) return muted;
  if (typeof localStorage === "undefined") return false;
  muted = localStorage.getItem("gn_muted") === "1";
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("gn_muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!m) unlockSound();
}

export function unlockSound() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// Play one tone with a short attack/release envelope (avoids clicks).
function tone(c: Ctx, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export type SoundName =
  | "play"      // ordinary card played
  | "special"   // skip / reverse / draw-two / wild-four
  | "draw"      // drew a card
  | "turn"      // it just became your turn
  | "uno"       // someone shouted UNO
  | "win"       // you won
  | "lose"      // someone else won
  | "error";    // illegal action

export function playSound(name: SoundName) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  switch (name) {
    case "play":
      tone(c, 700, 0, 0.1, "triangle", 0.16);
      break;
    case "special":
      tone(c, 880, 0, 0.09, "square", 0.13);
      tone(c, 1175, 0.08, 0.12, "square", 0.13);
      break;
    case "draw":
      tone(c, 240, 0, 0.12, "sine", 0.2);
      break;
    case "turn":
      tone(c, 523, 0, 0.1, "sine", 0.16);
      tone(c, 784, 0.09, 0.16, "sine", 0.16);
      break;
    case "uno":
      tone(c, 660, 0, 0.1, "sawtooth", 0.14);
      tone(c, 880, 0.1, 0.1, "sawtooth", 0.14);
      tone(c, 1320, 0.2, 0.22, "sawtooth", 0.14);
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.13, 0.28, "triangle", 0.18));
      break;
    case "lose":
      tone(c, 392, 0, 0.18, "sine", 0.16);
      tone(c, 294, 0.16, 0.3, "sine", 0.16);
      break;
    case "error":
      tone(c, 180, 0, 0.16, "square", 0.14);
      break;
  }
}
