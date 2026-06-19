// ============================================================================
// The pluggable game-module contract.
//
// EVERY game implements `GameModule`. The shell knows nothing about any game's
// rules — it only calls these functions. Logic modules MUST be pure (no React,
// no DOM, no randomness outside of initGame's seeding) so the authoritative
// server endpoint can run validateMove / applyMove / isGameOver / getPlayerView.
// ============================================================================

export interface PlayerInfo {
  id: string;
  name: string;
  seat: number;
  emoji?: string | null;
}

// A move is any JSON object with a discriminating `type`.
export type Move = { type: string; [k: string]: unknown };

export interface Winner {
  // player ids of the winner(s). Empty array allowed for a draw.
  winners: string[];
  // optional final scores keyed by player id
  scores?: Record<string, number>;
  reason?: string;
}

export type ValidateResult = boolean | { ok: boolean; error?: string };

// Host-configurable options shown before a game starts (e.g. Uno stacking).
export interface ConfigField {
  key: string;
  label: string;
  type: "boolean" | "select";
  default: boolean | string;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface GameMeta {
  type: string; // stable id, e.g. "uno"
  name: string; // display name, e.g. "Uno"
  emoji: string; // 🎴
  blurb: string; // one-line description for the picker
  minPlayers: number;
  maxPlayers: number;
  // Some games (Battleship, Tetris duel) want all players acting at once.
  realtime?: boolean;
  config?: ConfigField[];
}

export interface GameModule<S = unknown, V = unknown> extends GameMeta {
  // Build the initial authoritative state. May use randomness here only.
  initGame(players: PlayerInfo[], config?: Record<string, unknown>): S;

  // Pure check: is this move legal for this player right now?
  validateMove(state: S, playerId: string, move: Move): ValidateResult;

  // Pure transition: produce the next state. Assumes validateMove passed.
  applyMove(state: S, playerId: string, move: Move): S;

  // Null while the game continues, otherwise the winner payload.
  isGameOver(state: S): Winner | null;

  // Redact the authoritative state down to what `playerId` is allowed to see.
  // Pass null for the public / spectator projection (this is what gets stored
  // in games.public_state and broadcast to every phone).
  getPlayerView(state: S, playerId: string | null): V;
}

export function normalizeValidate(r: ValidateResult): { ok: boolean; error?: string } {
  return typeof r === "boolean" ? { ok: r } : r;
}
