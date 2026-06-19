import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";

// ============================================================================
// Checkers / American Draughts
//
// CONVENTIONS (documented):
//  - 8x8 board, rows 0..7 top→bottom, cols 0..7 left→right.
//  - Pieces live only on DARK squares: a square is dark when (row + col) is odd.
//  - Seat 0 = RED.   Red moves "up" toward row 0   (forward = row - 1).
//  - Seat 1 = BLACK. Black moves "down" toward row 7 (forward = row + 1).
//  - Red's back row (where Black is crowned... no): a piece is crowned when it
//    reaches the opponent's far edge:
//       Red  reaches row 0 → becomes a Red King.
//       Black reaches row 7 → becomes a Black King.
//  - Men move/capture only FORWARD diagonally; Kings move/capture in BOTH
//    diagonal directions.
//  - FORCED CAPTURE: if any capture exists for the side to move, only capturing
//    moves are legal.
//  - MULTI-JUMP: a capturing piece must keep jumping while further jumps exist
//    (a move is a path of squares). A jump that lands on the back row crowns the
//    piece and ENDS the turn (no further jump even if one geometrically exists).
//
// State is pure & serializable. applyMove returns a fresh structuredClone.
// ============================================================================

export type Color = "red" | "black";

// A piece on the board.
export interface Piece {
  color: Color;
  king: boolean;
}

// board[row][col] is a Piece or null. Light squares are always null.
export type Board = (Piece | null)[][];

export type Coord = [number, number]; // [row, col]

export interface CheckersState {
  board: Board;
  turn: Color; // whose turn
  order: { red: string; black: string }; // playerId per color
  names: Record<string, string>;
  movesSinceCapture: number; // for the optional 40-move draw rule
  finished: boolean;
  winner: Color | null; // null while playing; set when finished (draw → null but finished true)
  draw: boolean;
  log: string[];
}

// A computed legal move: the full path plus the squares captured along the way.
export interface LegalMove {
  path: Coord[]; // squares the piece visits, starting at origin
  captures: Coord[]; // squares of captured pieces (empty for a simple move)
}

const SIZE = 8;

export function isDark(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function colorForSeat(seat: number): Color {
  return seat === 0 ? "red" : "black";
}

// Forward row delta for a man of this color.
function forwardDir(color: Color): number {
  return color === "red" ? -1 : 1;
}

// The row a man of this color is crowned upon reaching.
function backRow(color: Color): number {
  return color === "red" ? 0 : SIZE - 1;
}

function opponent(color: Color): Color {
  return color === "red" ? "black" : "red";
}

// Diagonal directions a piece may travel: men → forward only; kings → both.
function directions(piece: Piece): Coord[] {
  if (piece.king) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  const d = forwardDir(piece.color);
  return [
    [d, -1],
    [d, 1],
  ];
}

function makeEmptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Piece | null>(SIZE).fill(null));
}

// Deterministic starting position. Black (seat 1) on rows 0-2, Red (seat 0) on
// rows 5-7, on dark squares — so each side advances toward the other.
export function initBoard(): Board {
  const board = makeEmptyBoard();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (isDark(row, col)) board[row][col] = { color: "black", king: false };
    }
  }
  for (let row = SIZE - 3; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (isDark(row, col)) board[row][col] = { color: "red", king: false };
    }
  }
  return board;
}

// ----------------------------------------------------------------------------
// Legal-move generation (reusable helper)
// ----------------------------------------------------------------------------

// All capturing jump-paths starting from (r,c) for the piece sitting there.
// Recurses to build multi-jumps. A jump ending on the back row for a man stops
// (crowning ends the turn).
function jumpsFrom(
  board: Board,
  r: number,
  c: number,
  piece: Piece,
  captured: Coord[],
): LegalMove[] {
  const results: LegalMove[] = [];
  for (const [dr, dc] of directions(piece)) {
    const midR = r + dr;
    const midC = c + dc;
    const landR = r + 2 * dr;
    const landC = c + 2 * dc;
    if (!inBounds(landR, landC)) continue;
    if (!isDark(landR, landC)) continue;
    const mid = board[midR]?.[midC];
    if (!mid || mid.color !== opponent(piece.color)) continue;
    // can't jump a square already captured this turn
    if (captured.some(([cr, cc]) => cr === midR && cc === midC)) continue;
    if (board[landR][landC] !== null) continue;

    // Perform the jump on a scratch board to look further.
    const willCrown = !piece.king && landR === backRow(piece.color);
    const nextPiece: Piece = willCrown ? { ...piece, king: true } : piece;
    const newCaptured = [...captured, [midR, midC] as Coord];

    let continuations: LegalMove[] = [];
    if (!willCrown) {
      const scratch = board.map((row) => row.slice());
      scratch[r][c] = null;
      scratch[midR][midC] = null;
      scratch[landR][landC] = nextPiece;
      continuations = jumpsFrom(scratch, landR, landC, nextPiece, newCaptured);
    }

    if (continuations.length === 0) {
      results.push({ path: [[r, c], [landR, landC]], captures: newCaptured });
    } else {
      for (const cont of continuations) {
        results.push({
          path: [[r, c], ...cont.path],
          captures: cont.captures,
        });
      }
    }
  }
  return results;
}

// Simple (non-capturing) one-step moves from (r,c).
function simpleMovesFrom(board: Board, r: number, c: number, piece: Piece): LegalMove[] {
  const out: LegalMove[] = [];
  for (const [dr, dc] of directions(piece)) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc) || !isDark(nr, nc)) continue;
    if (board[nr][nc] !== null) continue;
    out.push({ path: [[r, c], [nr, nc]], captures: [] });
  }
  return out;
}

// All legal moves for `color`, honoring the forced-capture rule: if any capture
// exists, only captures are returned.
export function legalMoves(board: Board, color: Color): LegalMove[] {
  const captures: LegalMove[] = [];
  const simple: LegalMove[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      const js = jumpsFrom(board, r, c, piece, []);
      if (js.length > 0) captures.push(...js);
      else simple.push(...simpleMovesFrom(board, r, c, piece));
    }
  }
  // If ANY capture is available anywhere, only captures are legal.
  if (captures.length > 0) {
    // Some pieces may have had simple moves we collected before a capture was
    // found — recompute captures across the board (already complete) and drop
    // simples. captures here is already board-wide complete.
    return captures;
  }
  return simple;
}

// Legal moves originating at a given square (for highlighting in the View).
export function legalMovesFrom(board: Board, color: Color, r: number, c: number): LegalMove[] {
  return legalMoves(board, color).filter(
    (m) => m.path[0][0] === r && m.path[0][1] === c,
  );
}

function pathsEqual(a: Coord[], b: Coord[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);
}

function countPieces(board: Board, color: Color): number {
  let n = 0;
  for (const row of board) for (const p of row) if (p && p.color === color) n++;
  return n;
}

function hasAnyMove(board: Board, color: Color): boolean {
  return legalMoves(board, color).length > 0;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------

function name(s: CheckersState, color: Color): string {
  return s.names[s.order[color]] ?? (color === "red" ? "Red" : "Black");
}

function parsePath(move: Move): Coord[] | null {
  const raw = (move as { path?: unknown }).path;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const path: Coord[] = [];
  for (const step of raw) {
    if (!Array.isArray(step) || step.length !== 2) return null;
    const [r, c] = step;
    if (typeof r !== "number" || typeof c !== "number") return null;
    path.push([r, c]);
  }
  return path;
}

export const checkers: GameModule<CheckersState> = {
  type: "checkers",
  name: "Checkers",
  emoji: "⛀",
  blurb: "Jump your way across the board — kings rule, captures are forced!",
  minPlayers: 2,
  maxPlayers: 2,

  initGame(players: PlayerInfo[]): CheckersState {
    const sorted = [...players].sort((a, b) => a.seat - b.seat);
    const red = sorted[0];
    const black = sorted[1];
    const names: Record<string, string> = {};
    for (const p of players) names[p.id] = p.name;
    return {
      board: initBoard(),
      turn: "red",
      order: { red: red.id, black: black.id },
      names,
      movesSinceCapture: 0,
      finished: false,
      winner: null,
      draw: false,
      log: ["Game started — Red to move."],
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (move.type !== "move") return { ok: false, error: "Unknown move." };

    const color = state.turn;
    if (state.order[color] !== playerId) return { ok: false, error: "Not your turn." };

    const path = parsePath(move);
    if (!path) return { ok: false, error: "Malformed path." };

    const [sr, sc] = path[0];
    const piece = state.board[sr]?.[sc];
    if (!piece) return { ok: false, error: "No piece there." };
    if (piece.color !== color) return { ok: false, error: "That isn't your piece." };

    const legal = legalMoves(state.board, color);
    const captureAvailable = legal.some((m) => m.captures.length > 0);

    const match = legal.find((m) => pathsEqual(m.path, path));
    if (!match) {
      // Give a focused message when a non-capture was tried under forced capture.
      if (captureAvailable && path.length === 2 && Math.abs(path[1][0] - sr) === 1) {
        return { ok: false, error: "A capture is available — you must capture." };
      }
      return { ok: false, error: "Illegal move." };
    }
    return { ok: true };
  },

  applyMove(state, playerId, move): CheckersState {
    const s: CheckersState = structuredClone(state);
    const color = s.turn;
    const path = parsePath(move)!;
    const legal = legalMoves(s.board, color);
    const chosen = legal.find((m) => pathsEqual(m.path, path))!;

    const [sr, sc] = path[0];
    const [er, ec] = path[path.length - 1];
    const piece = s.board[sr][sc]!;

    // remove captured pieces
    for (const [cr, cc] of chosen.captures) s.board[cr][cc] = null;

    // move the piece
    s.board[sr][sc] = null;
    const crowned = !piece.king && er === backRow(piece.color);
    s.board[er][ec] = { color: piece.color, king: piece.king || crowned };

    if (chosen.captures.length > 0) {
      s.movesSinceCapture = 0;
      s.log.push(
        `${name(s, color)} captured ${chosen.captures.length} piece${chosen.captures.length > 1 ? "s" : ""}.`,
      );
    } else {
      s.movesSinceCapture += 1;
      s.log.push(`${name(s, color)} moved.`);
    }
    if (crowned) s.log.push(`${name(s, color)} crowned a King! 👑`);

    // turn passes to opponent
    const next = opponent(color);
    s.turn = next;

    // win / draw checks
    if (countPieces(s.board, next) === 0) {
      s.finished = true;
      s.winner = color;
      s.log.push(`🏆 ${name(s, color)} wins — opponent has no pieces!`);
    } else if (!hasAnyMove(s.board, next)) {
      s.finished = true;
      s.winner = color;
      s.log.push(`🏆 ${name(s, color)} wins — opponent has no legal move!`);
    } else if (s.movesSinceCapture >= 80) {
      // 40 full moves (both sides) with no capture → draw.
      s.finished = true;
      s.draw = true;
      s.winner = null;
      s.log.push("Draw — 40 moves without a capture.");
    }

    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    if (state.draw || !state.winner) {
      return { winners: [], reason: "Draw." };
    }
    return {
      winners: [state.order[state.winner]],
      reason: `${name(state, state.winner)} wins!`,
    };
  },

  getPlayerView(state, playerId) {
    const youColor: Color | null =
      playerId == null
        ? null
        : state.order.red === playerId
          ? "red"
          : state.order.black === playerId
            ? "black"
            : null;

    const moves = legalMoves(state.board, state.turn);

    // Your legal moves (for highlighting). Only meaningful when it's your turn.
    const myMoves =
      youColor && youColor === state.turn && !state.finished ? moves : [];

    return {
      type: "checkers" as const,
      board: state.board,
      turn: state.turn,
      activePlayerId: state.order[state.turn],
      you: playerId ?? null,
      youColor,
      red: { id: state.order.red, name: state.names[state.order.red] },
      black: { id: state.order.black, name: state.names[state.order.black] },
      counts: {
        red: countPieces(state.board, "red"),
        black: countPieces(state.board, "black"),
      },
      finished: state.finished,
      draw: state.draw,
      winner: state.winner,
      winnerId: state.winner ? state.order[state.winner] : null,
      legalMoves: myMoves,
      log: state.log.slice(-6),
    };
  },
};
