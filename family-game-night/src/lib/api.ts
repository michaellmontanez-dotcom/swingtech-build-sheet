"use client";

// Thin client wrappers around the authoritative server endpoints.

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  // Abort if the server hangs so the UI never gets stuck in a "pending" state.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error((e as Error).name === "AbortError" ? "Server timed out — try again." : "Network error — check your connection.");
  }
  clearTimeout(timer);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function createRoom(playerId: string, name: string, emoji: string) {
  return postJSON<{ code: string; roomId: string }>("/api/rooms", { playerId, name, emoji });
}

export function joinRoom(code: string, playerId: string, name: string, emoji: string) {
  return postJSON<{ roomId: string; rejoined?: boolean }>(`/api/rooms/${code}/join`, { playerId, name, emoji });
}

export function startGame(code: string, playerId: string, gameType: string, config?: Record<string, unknown>) {
  return postJSON<{ gameId: string }>(`/api/rooms/${code}/start`, { playerId, gameType, config });
}

export function returnToPicker(code: string, playerId: string) {
  return postJSON<{ ok: true }>(`/api/rooms/${code}/pick`, { playerId });
}

export function sendMove(gameId: string, playerId: string, move: { type: string; [k: string]: unknown }) {
  return postJSON<{ ok: boolean; version: number; view: unknown; gameOver: unknown }>(
    `/api/games/${gameId}/move`,
    { playerId, move }
  );
}

export async function fetchView(gameId: string, playerId: string) {
  const res = await fetch(`/api/games/${gameId}/view?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load view");
  return (await res.json()) as { view: unknown; version: number };
}
