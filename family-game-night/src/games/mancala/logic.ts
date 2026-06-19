import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";

// ----------------------------------------------------------------------------
// Board representation
// ----------------------------------------------------------------------------
// Mancala / Kalah for exactly 2 players.
//
// We use a single flat 14-slot array, indexed counterclockwise:
//
//   index:   0  1  2  3  4  5   <- player 0's six pits
//   index:   6                  <- player 0's store (Kalah)
//   index:   7  8  9 10 11 12   <- player 1's six pits
//   index:  13                  <- player 1's store (Kalah)
//
// Sowing proceeds in increasing index order (counterclockwise), wrapping
// 13 -> 0. Player p owns pits [p*7 .. p*7+5] and store at p*7+6.
//
// The pit directly OPPOSITE pit i (for capture) is mirrored across the board:
//   opposite(i) = 12 - i   (only meaningful for the 12 playing pits, not stores)
// e.g. pit 0 <-> pit 12, pit 5 <-> pit 7, pit 6/13 are stores (no opposite).

export const PITS_PER_PLAYER = 6;
export const STORE_OF = [6, 13] as const; // store index for player 0 / player 1
const STONES_PER_PIT = 4;
const TOTAL_STONES = 48;

export interface MancalaState {
  board: number[]; // length 14, stone counts per slot
  order: string[]; // player ids, index === seat 0/1
  current: 0 | 1; // whose turn (index into order)
  names: Record<string, string>;
  finished: boolean;
  // winners filled at game end ([] never used here: draw => both ids)
  winners: string[];
  lastMove: { player: 0 | 1; pit: number; extraTurn: boolean; captured: number } | null;
  log: string[];
}

// store index for player p
function storeIndex(p: 0 | 1): number {
  return STORE_OF[p];
}
// opponent store index for player p (the one to SKIP while sowing)
function opponentStore(p: 0 | 1): number {
  return STORE_OF[p === 0 ? 1 : 0];
}
// is slot i one of player p's own playing pits?
function ownsPit(p: 0 | 1, i: number): boolean {
  return i >= p * 7 && i <= p * 7 + (PITS_PER_PLAYER - 1);
}
// the pit physically opposite to playing-pit i
function oppositePit(i: number): number {
  return 12 - i;
}

function name(s: MancalaState, p: 0 | 1): string {
  return s.names[s.order[p]] ?? `Player ${p + 1}`;
}

// Are all six of player p's pits empty?
function sideEmpty(board: number[], p: 0 | 1): boolean {
  for (let k = 0; k < PITS_PER_PLAYER; k++) {
    if (board[p * 7 + k] > 0) return false;
  }
  return true;
}

// If the game has ended, sweep each player's remaining pit stones into their own
// store. Standard Kalah: the player whose side is NOT empty keeps their stones.
function sweepIfOver(s: MancalaState): boolean {
  const p0empty = sideEmpty(s.board, 0);
  const p1empty = sideEmpty(s.board, 1);
  if (!p0empty && !p1empty) return false;

  for (const p of [0, 1] as const) {
    let swept = 0;
    for (let k = 0; k < PITS_PER_PLAYER; k++) {
      const idx = p * 7 + k;
      swept += s.board[idx];
      s.board[idx] = 0;
    }
    if (swept > 0) {
      s.board[storeIndex(p)] += swept;
    }
  }

  s.finished = true;
  const a = s.board[storeIndex(0)];
  const b = s.board[storeIndex(1)];
  if (a > b) s.winners = [s.order[0]];
  else if (b > a) s.winners = [s.order[1]];
  else s.winners = [s.order[0], s.order[1]]; // draw
  s.log.push(`Game over — ${a} : ${b}.`);
  return true;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const mancala: GameModule<MancalaState> = {
  type: "mancala",
  name: "Mancala",
  emoji: "🪨",
  blurb: "Sow stones counterclockwise, capture, and fill your store.",
  minPlayers: 2,
  maxPlayers: 2,

  // Deterministic fixed start; seed is intentionally ignored.
  initGame(players: PlayerInfo[]): MancalaState {
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    const order = ordered.map((p) => p.id);
    const names: Record<string, string> = {};
    for (const p of ordered) names[p.id] = p.name;

    const board = new Array<number>(14).fill(0);
    for (const p of [0, 1] as const) {
      for (let k = 0; k < PITS_PER_PLAYER; k++) board[p * 7 + k] = STONES_PER_PIT;
    }

    return {
      board,
      order,
      current: 0,
      names,
      finished: false,
      winners: [],
      lastMove: null,
      log: ["Game started — 4 stones per pit."],
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    const p = state.order.indexOf(playerId);
    if (p === -1) return { ok: false, error: "Not a player." };
    if (p !== state.current) return { ok: false, error: "Not your turn." };
    if (move.type !== "sow") return { ok: false, error: "Unknown move." };

    const pit = move.pit;
    if (typeof pit !== "number" || !Number.isInteger(pit) || pit < 0 || pit > PITS_PER_PLAYER - 1) {
      return { ok: false, error: "Pit out of range." };
    }
    const idx = (p as 0 | 1) * 7 + pit;
    if (state.board[idx] === 0) return { ok: false, error: "That pit is empty." };
    return { ok: true };
  },

  applyMove(state, playerId, move): MancalaState {
    const s: MancalaState = structuredClone(state);
    const p = s.order.indexOf(playerId) as 0 | 1;
    const pit = move.pit as number;
    const start = p * 7 + pit;

    let stones = s.board[start];
    s.board[start] = 0;

    let i = start;
    while (stones > 0) {
      i = (i + 1) % 14;
      if (i === opponentStore(p)) continue; // skip opponent's store
      s.board[i] += 1;
      stones -= 1;
    }
    // `i` is now the slot where the last stone landed.

    let extraTurn = false;
    let captured = 0;

    if (i === storeIndex(p)) {
      // landed in own store -> go again
      extraTurn = true;
    } else if (ownsPit(p, i) && s.board[i] === 1) {
      // landed in a previously-empty pit on own side -> capture
      const opp = oppositePit(i);
      const grabbed = s.board[opp];
      if (grabbed > 0) {
        captured = grabbed + 1;
        s.board[opp] = 0;
        s.board[i] = 0;
        s.board[storeIndex(p)] += captured;
      }
    }

    s.lastMove = { player: p, pit, extraTurn, captured };
    s.log.push(
      `${name(s, p)} sowed pit ${pit + 1}` +
        (captured > 0 ? ` — captured ${captured}!` : extraTurn ? " — go again!" : "."),
    );

    const over = sweepIfOver(s);
    if (!over && !extraTurn) {
      s.current = (p === 0 ? 1 : 0) as 0 | 1;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    const scores: Record<string, number> = {
      [state.order[0]]: state.board[storeIndex(0)],
      [state.order[1]]: state.board[storeIndex(1)],
    };
    return {
      winners: state.winners,
      scores,
      reason:
        state.winners.length === 2
          ? "Draw!"
          : `${state.names[state.winners[0]] ?? "Player"} wins!`,
    };
  },

  // No hidden info: both null and per-player views show the full board.
  // The per-player view adds whose-turn / "you" / which side you own + legal pits.
  getPlayerView(state, playerId) {
    const scores: Record<string, number> = {
      [state.order[0]]: state.board[storeIndex(0)],
      [state.order[1]]: state.board[storeIndex(1)],
    };
    const pub = {
      type: "mancala" as const,
      board: [...state.board],
      stores: [state.board[storeIndex(0)], state.board[storeIndex(1)]] as [number, number],
      pits: [
        state.board.slice(0, PITS_PER_PLAYER),
        state.board.slice(7, 7 + PITS_PER_PLAYER),
      ] as [number[], number[]],
      current: state.current,
      activePlayerId: state.order[state.current],
      players: state.order.map((id, seat) => ({ id, name: state.names[id], seat })),
      finished: state.finished,
      winners: state.winners,
      scores,
      lastMove: state.lastMove,
      log: state.log.slice(-6),
    };

    const seat = playerId ? state.order.indexOf(playerId) : -1;
    if (playerId && seat !== -1) {
      const p = seat as 0 | 1;
      const myTurn = !state.finished && state.current === p;
      const legal: number[] = [];
      if (myTurn) {
        for (let k = 0; k < PITS_PER_PLAYER; k++) {
          if (state.board[p * 7 + k] > 0) legal.push(k);
        }
      }
      return {
        ...pub,
        you: playerId,
        youSeat: p,
        yourPits: state.board.slice(p * 7, p * 7 + PITS_PER_PLAYER),
        yourStore: state.board[storeIndex(p)],
        myTurn,
        legalPits: legal,
      };
    }
    return {
      ...pub,
      you: null,
      youSeat: null,
      yourPits: [] as number[],
      yourStore: 0,
      myTurn: false,
      legalPits: [] as number[],
    };
  },
};
