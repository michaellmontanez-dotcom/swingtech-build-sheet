// Pure move pipeline shared by the authoritative endpoint AND the integration
// tests. NO Supabase, NO "server-only" import — just the game-agnostic
// validate -> apply -> game-over -> redact steps. gameStore.ts wraps this with
// persistence; the tests wrap it with an in-memory fake DB. Keeping both on the
// exact same code path is the point: if a game works here, it works in prod.

import { getGameModule } from "@/games/registry";
import { normalizeValidate, type Move, type PlayerInfo } from "@/games/types";

export interface InitResult {
  state: unknown;
  publicView: unknown;
}

export function createInitialState(
  gameType: string,
  players: PlayerInfo[],
  config?: Record<string, unknown>
): InitResult | { error: string } {
  const mod = getGameModule(gameType);
  if (!mod) return { error: `Unknown game: ${gameType}` };
  if (players.length < mod.minPlayers) return { error: `${mod.name} needs at least ${mod.minPlayers} players.` };
  if (players.length > mod.maxPlayers) return { error: `${mod.name} allows at most ${mod.maxPlayers} players.` };
  const state = mod.initGame(players, config);
  return { state, publicView: mod.getPlayerView(state, null) };
}

export interface MoveOutcome {
  ok: boolean;
  error?: string;
  state?: unknown;
  publicView?: unknown;
  gameOver?: unknown | null;
  viewFor?: (playerId: string | null) => unknown;
}

export function processMove(
  gameType: string,
  state: unknown,
  playerId: string,
  move: Move
): MoveOutcome {
  const mod = getGameModule(gameType);
  if (!mod) return { ok: false, error: "Unknown game." };

  const verdict = normalizeValidate(mod.validateMove(state as never, playerId, move));
  if (!verdict.ok) return { ok: false, error: verdict.error ?? "Illegal move." };

  const next = mod.applyMove(state as never, playerId, move);
  const gameOver = mod.isGameOver(next);
  return {
    ok: true,
    state: next,
    publicView: mod.getPlayerView(next, null),
    gameOver,
    viewFor: (pid) => mod.getPlayerView(next, pid),
  };
}

export function viewFor(gameType: string, state: unknown, playerId: string | null): unknown {
  const mod = getGameModule(gameType);
  if (!mod) return null;
  return mod.getPlayerView(state as never, playerId);
}
