"use client";

// Per-browser player identity. Players are not authenticated accounts — each
// phone gets a stable random id stored in localStorage, plus a chosen name/emoji.

const ID_KEY = "gn_player_id";
const NAME_KEY = "gn_player_name";
const EMOJI_KEY = "gn_player_emoji";

export const EMOJIS = ["🦊", "🐼", "🐸", "🦄", "🐙", "🐲", "🦁", "🐯", "🐧", "🐳", "🌟", "🚀", "🎸", "🍕", "🎩", "👾"];

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getProfile(): { name: string; emoji: string } {
  if (typeof window === "undefined") return { name: "", emoji: "🎲" };
  return {
    name: localStorage.getItem(NAME_KEY) ?? "",
    emoji: localStorage.getItem(EMOJI_KEY) ?? EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
  };
}

export function saveProfile(name: string, emoji: string) {
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(EMOJI_KEY, emoji);
}
