import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32 } from "@/games/rng";

// ============================================================================
// Battle Tetris — real-time, head-to-head.
//
// Each player owns their own 10x20 board. validateMove/applyMove operate ONLY
// on the requesting player's board; a player can never touch another board.
// Gravity is authoritative via an explicit { type:"tick" } move the View sends
// on an interval. State is pure: randomness comes from a seeded 7-bag keyed by
// seed + a per-player pieceCounter, so the piece sequence is deterministic.
//
// GARBAGE ATTACK: clearing 2/3/4 lines sends 1/2/4 garbage rows to EVERY other
// living opponent (queued). Queued garbage is pushed onto the BOTTOM of the
// receiver's board — each garbage row is solid except for one random hole
// column (deterministic per receiver via their garbage rng) — at the moment
// that receiver's piece locks (before the next piece spawns).
// ============================================================================

export const WIDTH = 10;
export const HEIGHT = 20;

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
const PIECES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

// Cell value: 0 = empty, otherwise a piece letter (string) or "G" for garbage.
export type Cell = 0 | PieceType | "G";
export type Grid = Cell[][]; // [row][col], row 0 = top

// Each rotation state is a list of [row, col] offsets relative to the piece origin.
// Standard spawn orientations. Rotation is computed by rotating offsets 90°.
const SHAPES: Record<PieceType, [number, number][]> = {
  // Using 4x4 / 3x3 bounding-box coordinates (row, col) for spawn state.
  I: [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
  ],
  O: [
    [0, 1],
    [0, 2],
    [1, 1],
    [1, 2],
  ],
  T: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  S: [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  J: [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  L: [
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
};

// Bounding box size used for rotation (square). I and O use 4, others use 3.
const BOX: Record<PieceType, number> = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };

export interface ActivePiece {
  type: PieceType;
  rot: number; // 0..3
  row: number; // top of bounding box
  col: number; // left of bounding box
}

export interface PlayerBoard {
  grid: Grid;
  active: ActivePiece | null;
  next: PieceType;
  hold: PieceType | null;
  canHold: boolean; // one hold per piece
  bag: PieceType[]; // remaining pieces in current 7-bag
  pieceCounter: number; // how many bags drawn (used to key rng)
  garbageRng: number; // counter for deterministic hole columns
  score: number;
  lines: number;
  level: number;
  pendingGarbage: number; // garbage rows queued to drop on next lock
  toppedOut: boolean;
}

export interface TetrisState {
  seed: number;
  started: boolean;
  boards: Record<string, PlayerBoard>;
  names: Record<string, string>;
  order: string[]; // seat order
}

// ----------------------------------------------------------------------------
// Grid helpers
// ----------------------------------------------------------------------------
export function emptyGrid(): Grid {
  return Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => 0 as Cell));
}

// Absolute cells occupied by a piece in a given rotation/position.
export function pieceCells(p: ActivePiece): [number, number][] {
  const box = BOX[p.type];
  let cells = SHAPES[p.type];
  // rotate clockwise `rot` times within the bounding box.
  for (let r = 0; r < p.rot; r++) {
    cells = cells.map(([row, col]) => [col, box - 1 - row]);
  }
  return cells.map(([row, col]) => [p.row + row, p.col + col]);
}

// Is this piece position legal (in bounds, no overlap)?
export function isValidPosition(grid: Grid, p: ActivePiece): boolean {
  for (const [r, c] of pieceCells(p)) {
    if (c < 0 || c >= WIDTH || r >= HEIGHT) return false;
    if (r < 0) continue; // allow above the top (spawn buffer)
    if (grid[r][c] !== 0) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// 7-bag generator — deterministic from seed + counter.
// ----------------------------------------------------------------------------
export function makeBag(seed: number, counter: number): PieceType[] {
  const rng = mulberry32((seed + counter * 2654435761) >>> 0);
  const bag = [...PIECES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// Pull the next piece from a board's bag, refilling deterministically.
function drawPiece(b: PlayerBoard, seed: number): PieceType {
  if (b.bag.length === 0) {
    b.bag = makeBag(seed, b.pieceCounter);
    b.pieceCounter += 1;
  }
  return b.bag.shift()!;
}

function spawnPiece(type: PieceType): ActivePiece {
  // Center the bounding box near the top.
  const box = BOX[type];
  const col = Math.floor((WIDTH - box) / 2);
  return { type, rot: 0, row: 0, col };
}

// ----------------------------------------------------------------------------
// Core mechanics (pure-ish: mutate the passed board).
// ----------------------------------------------------------------------------

// Try to move/rotate the active piece; returns true if applied.
export function tryMove(grid: Grid, p: ActivePiece, dRow: number, dCol: number): ActivePiece | null {
  const moved: ActivePiece = { ...p, row: p.row + dRow, col: p.col + dCol };
  return isValidPosition(grid, moved) ? moved : null;
}

export function tryRotate(grid: Grid, p: ActivePiece, dir: "cw" | "ccw"): ActivePiece | null {
  const nextRot = dir === "cw" ? (p.rot + 1) % 4 : (p.rot + 3) % 4;
  const rotated: ActivePiece = { ...p, rot: nextRot };
  // SRS-lite wall kicks: try base, then small left/right/up nudges.
  const kicks: [number, number][] = [
    [0, 0],
    [0, -1],
    [0, 1],
    [0, -2],
    [0, 2],
    [-1, 0],
  ];
  for (const [kr, kc] of kicks) {
    const cand: ActivePiece = { ...rotated, row: rotated.row + kr, col: rotated.col + kc };
    if (isValidPosition(grid, cand)) return cand;
  }
  return null;
}

// Stamp the piece into the grid.
export function lockPiece(grid: Grid, p: ActivePiece): void {
  for (const [r, c] of pieceCells(p)) {
    if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH) grid[r][c] = p.type;
  }
}

// Remove full rows, shift everything above down. Returns number cleared.
export function clearLines(grid: Grid): number {
  let cleared = 0;
  for (let r = HEIGHT - 1; r >= 0; r--) {
    if (grid[r].every((cell) => cell !== 0)) {
      grid.splice(r, 1);
      grid.unshift(Array.from({ length: WIDTH }, () => 0 as Cell));
      cleared++;
      r++; // re-check the same row index after shift
    }
  }
  return cleared;
}

// How many garbage rows a clear of n lines sends to each opponent.
function garbageForClear(n: number): number {
  if (n === 2) return 1;
  if (n === 3) return 2;
  if (n >= 4) return 4;
  return 0;
}

// Apply queued garbage to the bottom of a board (one random hole per row).
function applyGarbage(b: PlayerBoard, seed: number): void {
  const n = b.pendingGarbage;
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32((seed + b.pieceCounter * 13 + b.garbageRng * 2654435761) >>> 0);
    b.garbageRng += 1;
    const hole = Math.floor(rng() * WIDTH);
    const row: Cell[] = Array.from({ length: WIDTH }, (_, c) => (c === hole ? 0 : ("G" as Cell)));
    b.grid.shift(); // drop the top row off
    b.grid.push(row);
  }
  b.pendingGarbage = 0;
}

// Score table for line clears (×level).
function lineScore(n: number): number {
  return n === 1 ? 100 : n === 2 ? 300 : n === 3 ? 500 : n >= 4 ? 800 : 0;
}

// Lock the active piece, clear lines, send garbage, apply incoming garbage,
// then spawn the next piece. Sets toppedOut if the spawn is blocked.
function settlePiece(state: TetrisState, pid: string): void {
  const b = state.boards[pid];
  if (!b.active) return;
  lockPiece(b.grid, b.active);
  const cleared = clearLines(b.grid);
  if (cleared > 0) {
    b.lines += cleared;
    b.score += lineScore(cleared) * b.level;
    const newLevel = Math.floor(b.lines / 10) + 1;
    if (newLevel > b.level) b.level = newLevel;
    const attack = garbageForClear(cleared);
    if (attack > 0) {
      for (const other of state.order) {
        if (other === pid) continue;
        const ob = state.boards[other];
        if (ob.toppedOut) continue;
        ob.pendingGarbage += attack;
      }
    }
  }
  // Incoming garbage lands on lock.
  applyGarbage(b, state.seed);
  b.active = null;
  b.canHold = true;
  // Spawn next.
  const type = b.next;
  b.next = drawPiece(b, state.seed);
  const piece = spawnPiece(type);
  if (!isValidPosition(b.grid, piece)) {
    b.toppedOut = true;
    b.active = null;
    return;
  }
  b.active = piece;
}

function aliveCount(state: TetrisState): number {
  return state.order.filter((id) => !state.boards[id].toppedOut).length;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const tetris: GameModule<TetrisState> = {
  type: "tetris",
  name: "Battle Tetris",
  emoji: "🟦",
  blurb: "Stack, clear, and bury your rivals in garbage — last one standing wins!",
  minPlayers: 2,
  maxPlayers: 4,
  realtime: true,

  initGame(players: PlayerInfo[], config): TetrisState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id);
    const boards: Record<string, PlayerBoard> = {};
    const names: Record<string, string> = {};
    for (const p of players) {
      const b: PlayerBoard = {
        grid: emptyGrid(),
        active: null,
        next: "I",
        hold: null,
        canHold: true,
        bag: [],
        pieceCounter: 0,
        garbageRng: 0,
        score: 0,
        lines: 0,
        level: 1,
        pendingGarbage: 0,
        toppedOut: false,
      };
      // Prime first + next piece deterministically.
      const first = drawPiece(b, seed);
      b.next = drawPiece(b, seed);
      b.active = spawnPiece(first);
      boards[p.id] = b;
      names[p.id] = p.name;
    }
    return { seed, started: true, boards, names, order };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (!state.started) return { ok: false, error: "Game hasn't started." };
    const b = state.boards[playerId];
    if (!b) return { ok: false, error: "You're not in this game." };
    if (b.toppedOut) return { ok: false, error: "You've topped out." };
    if (aliveCount(state) <= 1) return { ok: false, error: "Game over." };
    // A target board id, if ever supplied, must be the mover's own board.
    if (typeof move.target === "string" && move.target !== playerId) {
      return { ok: false, error: "You can only act on your own board." };
    }
    switch (move.type) {
      case "tick":
      case "left":
      case "right":
      case "rotate":
      case "soft":
      case "hard":
      case "hold":
        return { ok: true };
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): TetrisState {
    const s: TetrisState = structuredClone(state);
    const b = s.boards[playerId];
    if (!b || b.toppedOut || !s.started) return s;
    if (aliveCount(s) <= 1) return s;

    switch (move.type) {
      case "left":
      case "right": {
        if (!b.active) break;
        const moved = tryMove(b.grid, b.active, 0, move.type === "left" ? -1 : 1);
        if (moved) b.active = moved;
        break;
      }
      case "rotate": {
        if (!b.active) break;
        const dir = move.dir === "ccw" ? "ccw" : "cw";
        const rotated = tryRotate(b.grid, b.active, dir);
        if (rotated) b.active = rotated;
        break;
      }
      case "soft": {
        if (!b.active) break;
        const moved = tryMove(b.grid, b.active, 1, 0);
        if (moved) {
          b.active = moved;
          b.score += 1;
        } else {
          settlePiece(s, playerId);
        }
        break;
      }
      case "tick": {
        if (!b.active) break;
        const moved = tryMove(b.grid, b.active, 1, 0);
        if (moved) {
          b.active = moved;
        } else {
          settlePiece(s, playerId);
        }
        break;
      }
      case "hard": {
        if (!b.active) break;
        let dist = 0;
        let cur = b.active;
        for (;;) {
          const moved = tryMove(b.grid, cur, 1, 0);
          if (!moved) break;
          cur = moved;
          dist++;
        }
        b.active = cur;
        b.score += dist * 2;
        settlePiece(s, playerId);
        break;
      }
      case "hold": {
        if (!b.active || !b.canHold) break;
        const cur = b.active.type;
        if (b.hold === null) {
          b.hold = cur;
          const type = b.next;
          b.next = drawPiece(b, s.seed);
          const piece = spawnPiece(type);
          if (!isValidPosition(b.grid, piece)) {
            b.toppedOut = true;
            b.active = null;
          } else {
            b.active = piece;
          }
        } else {
          const swap = b.hold;
          b.hold = cur;
          const piece = spawnPiece(swap);
          if (!isValidPosition(b.grid, piece)) {
            b.toppedOut = true;
            b.active = null;
          } else {
            b.active = piece;
          }
        }
        b.canHold = false;
        break;
      }
    }
    return s;
  },

  isGameOver(state): Winner | null {
    const alive = state.order.filter((id) => !state.boards[id].toppedOut);
    if (alive.length <= 1 && state.order.length >= 2) {
      const winners = alive.length === 1 ? [alive[0]] : [];
      const scores: Record<string, number> = {};
      for (const id of state.order) scores[id] = state.boards[id].score;
      return {
        winners,
        scores,
        reason:
          winners.length === 1
            ? `${state.names[winners[0]] ?? "Player"} is the last one standing!`
            : "Everyone topped out!",
      };
    }
    return null;
  },

  getPlayerView(state, playerId) {
    const alive = state.order.filter((id) => !state.boards[id].toppedOut);
    const finished = alive.length <= 1 && state.order.length >= 2;
    const players = state.order.map((id) => {
      const b = state.boards[id];
      return {
        id,
        name: state.names[id],
        // Public board: opponents see your stack but NOT your falling piece.
        grid: b.grid,
        score: b.score,
        lines: b.lines,
        level: b.level,
        toppedOut: b.toppedOut,
        pendingGarbage: b.pendingGarbage,
      };
    });

    const pub = {
      type: "tetris" as const,
      width: WIDTH,
      height: HEIGHT,
      started: state.started,
      finished,
      winnerId: finished && alive.length === 1 ? alive[0] : null,
      players,
    };

    if (playerId && state.boards[playerId]) {
      const b = state.boards[playerId];
      return {
        ...pub,
        you: playerId,
        active: b.active,
        activeCells: b.active ? pieceCells(b.active) : [],
        next: b.next,
        hold: b.hold,
        canHold: b.canHold,
        toppedOut: b.toppedOut,
        canAct: !b.toppedOut && !finished,
        level: b.level,
      };
    }
    return { ...pub, you: null, active: null, activeCells: [], next: null, hold: null, canHold: false, toppedOut: false, canAct: false, level: 1 };
  },
};
