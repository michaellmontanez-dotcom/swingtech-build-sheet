import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";

// ============================================================================
// Chess — full standard rules.
//
// CONVENTIONS (documented):
//  - 8x8 board, rows 0..7 top→bottom, cols 0..7 left→right.
//  - Row 0 is Black's back rank (top), row 7 is White's back rank (bottom).
//  - Seat 0 = WHITE (moves first). Seat 1 = BLACK.
//  - White pawns move "up" toward row 0 (forward = row - 1).
//    Black pawns move "down" toward row 7 (forward = row + 1).
//  - Pieces are { color, type } where type is one of P,N,B,R,Q,K.
//  - Moves carry { type:"move", from:[r,c], to:[r,c], promotion?:"Q"|"R"|"B"|"N" }.
//
// Logic is pure & serializable. applyMove returns a fresh structuredClone.
// legalMoves(state) generates only fully-legal moves (no move that leaves your
// own king in check). The View uses these for highlighting.
// ============================================================================

export type Color = "white" | "black";
export type PieceType = "P" | "N" | "B" | "R" | "Q" | "K";

export interface Piece {
  color: Color;
  type: PieceType;
}

// board[row][col] is a Piece or null.
export type Board = (Piece | null)[][];

export type Coord = [number, number]; // [row, col]

export type PromotionType = "Q" | "R" | "B" | "N";

// A generated legal move.
export interface ChessMove {
  from: Coord;
  to: Coord;
  // True for the two-square pawn advance (sets the en-passant target).
  doubleStep?: boolean;
  // The square of the captured pawn for an en-passant capture.
  enPassant?: Coord;
  // "K" (king-side) or "Q" (queen-side) for castling moves.
  castle?: "K" | "Q";
  // Promotion piece if this move promotes a pawn.
  promotion?: PromotionType;
}

export interface CastlingRights {
  whiteK: boolean; // white may still castle king-side
  whiteQ: boolean;
  blackK: boolean;
  blackQ: boolean;
}

export interface ChessState {
  board: Board;
  turn: Color; // whose turn
  order: { white: string; black: string }; // playerId per color
  names: Record<string, string>;
  castling: CastlingRights;
  // En-passant target square (the square a pawn skipped over), or null.
  enPassant: Coord | null;
  halfmoveClock: number; // plies since last capture or pawn move (50-move rule)
  fullmove: number;
  // Position keys seen, for threefold repetition (nice-to-have).
  positionCounts: Record<string, number>;
  finished: boolean;
  winner: Color | null; // null while playing; null + draw=true on a draw
  draw: boolean;
  drawReason: string | null;
  log: string[];
}

const SIZE = 8;

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function colorForSeat(seat: number): Color {
  return seat === 0 ? "white" : "black";
}

export function opponent(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function makeEmptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Piece | null>(SIZE).fill(null));
}

// Deterministic standard starting position.
export function initBoard(): Board {
  const board = makeEmptyBoard();
  const backRank: PieceType[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < SIZE; c++) {
    board[0][c] = { color: "black", type: backRank[c] };
    board[1][c] = { color: "black", type: "P" };
    board[6][c] = { color: "white", type: "P" };
    board[7][c] = { color: "white", type: backRank[c] };
  }
  return board;
}

// Forward row delta for a pawn of this color.
function pawnDir(color: Color): number {
  return color === "white" ? -1 : 1;
}

// The starting row for pawns of this color.
function pawnStartRow(color: Color): number {
  return color === "white" ? 6 : 1;
}

// The promotion row for pawns of this color.
function promotionRow(color: Color): number {
  return color === "white" ? 0 : 7;
}

const KNIGHT_DELTAS: Coord[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const KING_DELTAS: Coord[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const BISHOP_DIRS: Coord[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRS: Coord[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ----------------------------------------------------------------------------
// Attack detection
// ----------------------------------------------------------------------------

// Find the king of `color`.
function findKing(board: Board, color: Color): Coord | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === "K") return [r, c];
    }
  }
  return null;
}

// Is square (r,c) attacked by any piece of `by`?
export function isSquareAttacked(board: Board, r: number, c: number, by: Color): boolean {
  // Pawn attacks: a pawn of color `by` attacks diagonally in its forward
  // direction. The square (r,c) is attacked if a `by` pawn sits one step back
  // diagonally — i.e. at (r - dir, c ± 1).
  const dir = pawnDir(by);
  for (const dc of [-1, 1]) {
    const pr = r - dir;
    const pc = c + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === by && p.type === "P") return true;
    }
  }

  // Knight attacks.
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === by && p.type === "N") return true;
    }
  }

  // King attacks.
  for (const [dr, dc] of KING_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === by && p.type === "K") return true;
    }
  }

  // Sliding: bishops/queens along diagonals.
  for (const [dr, dc] of BISHOP_DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === by && (p.type === "B" || p.type === "Q")) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Sliding: rooks/queens along ranks/files.
  for (const [dr, dc] of ROOK_DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === by && (p.type === "R" || p.type === "Q")) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return false;
}

export function inCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king[0], king[1], opponent(color));
}

// ----------------------------------------------------------------------------
// Pseudo-legal move generation (ignores leaving own king in check)
// ----------------------------------------------------------------------------

function pseudoMovesFrom(
  state: ChessState,
  r: number,
  c: number,
): ChessMove[] {
  const board = state.board;
  const piece = board[r][c];
  if (!piece) return [];
  const out: ChessMove[] = [];
  const color = piece.color;

  const addPromotions = (from: Coord, to: Coord, extra: Partial<ChessMove> = {}) => {
    const promos: PromotionType[] = ["Q", "R", "B", "N"];
    for (const promotion of promos) out.push({ from, to, promotion, ...extra });
  };

  switch (piece.type) {
    case "P": {
      const dir = pawnDir(color);
      const fr = r + dir;
      // Forward one.
      if (inBounds(fr, c) && board[fr][c] === null) {
        if (fr === promotionRow(color)) addPromotions([r, c], [fr, c]);
        else out.push({ from: [r, c], to: [fr, c] });
        // Forward two from start.
        const fr2 = r + 2 * dir;
        if (r === pawnStartRow(color) && board[fr2][c] === null) {
          out.push({ from: [r, c], to: [fr2, c], doubleStep: true });
        }
      }
      // Captures (including en passant).
      for (const dc of [-1, 1]) {
        const tr = r + dir;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = board[tr][tc];
        if (target && target.color === opponent(color)) {
          if (tr === promotionRow(color)) addPromotions([r, c], [tr, tc]);
          else out.push({ from: [r, c], to: [tr, tc] });
        } else if (
          target === null &&
          state.enPassant &&
          state.enPassant[0] === tr &&
          state.enPassant[1] === tc
        ) {
          // En passant: captured pawn sits on (r, tc).
          out.push({ from: [r, c], to: [tr, tc], enPassant: [r, tc] });
        }
      }
      break;
    }
    case "N": {
      for (const [dr, dc] of KNIGHT_DELTAS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const t = board[nr][nc];
        if (!t || t.color !== color) out.push({ from: [r, c], to: [nr, nc] });
      }
      break;
    }
    case "K": {
      for (const [dr, dc] of KING_DELTAS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const t = board[nr][nc];
        if (!t || t.color !== color) out.push({ from: [r, c], to: [nr, nc] });
      }
      // Castling — geometric conditions here; check-related conditions filtered
      // in legalMoves via the king-path checks below.
      out.push(...castlingMoves(state, color));
      break;
    }
    case "B":
    case "R":
    case "Q": {
      const dirs =
        piece.type === "B" ? BISHOP_DIRS : piece.type === "R" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const t = board[nr][nc];
          if (!t) {
            out.push({ from: [r, c], to: [nr, nc] });
          } else {
            if (t.color !== color) out.push({ from: [r, c], to: [nr, nc] });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }
  }
  return out;
}

// Geometric + check-safe castling moves for the king of `color`.
function castlingMoves(state: ChessState, color: Color): ChessMove[] {
  const board = state.board;
  const out: ChessMove[] = [];
  const homeRow = color === "white" ? 7 : 0;
  const king = board[homeRow][4];
  if (!king || king.type !== "K" || king.color !== color) return out;
  // King may not castle while in check.
  if (isSquareAttacked(board, homeRow, 4, opponent(color))) return out;

  const kingSide = color === "white" ? state.castling.whiteK : state.castling.blackK;
  const queenSide = color === "white" ? state.castling.whiteQ : state.castling.blackQ;

  // King-side: rook on col 7; squares 5,6 empty; king passes through 5,6.
  if (kingSide) {
    const rook = board[homeRow][7];
    if (
      rook &&
      rook.type === "R" &&
      rook.color === color &&
      board[homeRow][5] === null &&
      board[homeRow][6] === null &&
      !isSquareAttacked(board, homeRow, 5, opponent(color)) &&
      !isSquareAttacked(board, homeRow, 6, opponent(color))
    ) {
      out.push({ from: [homeRow, 4], to: [homeRow, 6], castle: "K" });
    }
  }

  // Queen-side: rook on col 0; squares 1,2,3 empty; king passes through 3,2.
  if (queenSide) {
    const rook = board[homeRow][0];
    if (
      rook &&
      rook.type === "R" &&
      rook.color === color &&
      board[homeRow][1] === null &&
      board[homeRow][2] === null &&
      board[homeRow][3] === null &&
      !isSquareAttacked(board, homeRow, 3, opponent(color)) &&
      !isSquareAttacked(board, homeRow, 2, opponent(color))
    ) {
      out.push({ from: [homeRow, 4], to: [homeRow, 2], castle: "Q" });
    }
  }

  return out;
}

// Apply a generated move to a scratch board (mutates the given board). Returns
// nothing — used to test whether the mover's king ends in check.
function applyMoveToBoard(board: Board, mv: ChessMove): void {
  const [fr, fc] = mv.from;
  const [tr, tc] = mv.to;
  const piece = board[fr][fc]!;
  board[fr][fc] = null;

  if (mv.enPassant) {
    board[mv.enPassant[0]][mv.enPassant[1]] = null;
  }

  if (mv.castle) {
    // Move the rook too.
    if (mv.castle === "K") {
      board[fr][5] = board[fr][7];
      board[fr][7] = null;
    } else {
      board[fr][3] = board[fr][0];
      board[fr][0] = null;
    }
  }

  if (mv.promotion) {
    board[tr][tc] = { color: piece.color, type: mv.promotion };
  } else {
    board[tr][tc] = piece;
  }
}

// Does this pseudo-legal move leave the mover's own king in check?
function leavesKingInCheck(state: ChessState, mv: ChessMove): boolean {
  const piece = state.board[mv.from[0]][mv.from[1]]!;
  const scratch = state.board.map((row) => row.slice());
  applyMoveToBoard(scratch, mv);
  return inCheck(scratch, piece.color);
}

// ----------------------------------------------------------------------------
// Fully-legal move generation
// ----------------------------------------------------------------------------

// All fully-legal moves for the side to move.
export function legalMoves(state: ChessState): ChessMove[] {
  const color = state.turn;
  const out: ChessMove[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = state.board[r][c];
      if (!p || p.color !== color) continue;
      for (const mv of pseudoMovesFrom(state, r, c)) {
        if (!leavesKingInCheck(state, mv)) out.push(mv);
      }
    }
  }
  return out;
}

// Legal moves originating at a given square (for highlighting in the View).
export function legalMovesFrom(state: ChessState, r: number, c: number): ChessMove[] {
  return legalMoves(state).filter((m) => m.from[0] === r && m.from[1] === c);
}

// ----------------------------------------------------------------------------
// Draw detection helpers
// ----------------------------------------------------------------------------

function listPieces(board: Board): { color: Color; type: PieceType; r: number; c: number }[] {
  const out: { color: Color; type: PieceType; r: number; c: number }[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (p) out.push({ color: p.color, type: p.type, r, c });
    }
  }
  return out;
}

// Insufficient material: K vs K, K+minor vs K, K+B vs K+B same-color bishops.
export function insufficientMaterial(board: Board): boolean {
  const pieces = listPieces(board);
  const nonKings = pieces.filter((p) => p.type !== "K");
  if (nonKings.length === 0) return true; // K vs K
  if (nonKings.length === 1) {
    const t = nonKings[0].type;
    return t === "B" || t === "N"; // K + single minor vs K
  }
  if (nonKings.length === 2) {
    // Two bishops, one each side, on the same color square → draw.
    if (nonKings.every((p) => p.type === "B")) {
      const [a, b] = nonKings;
      if (a.color !== b.color) {
        const sqA = (a.r + a.c) % 2;
        const sqB = (b.r + b.c) % 2;
        if (sqA === sqB) return true;
      }
    }
  }
  return false;
}

// A position key for repetition: pieces + side to move + castling + ep file.
function positionKey(state: ChessState): string {
  let s = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = state.board[r][c];
      s += p ? (p.color === "white" ? p.type : p.type.toLowerCase()) : ".";
    }
  }
  s += `|${state.turn}`;
  s += `|${state.castling.whiteK ? "K" : ""}${state.castling.whiteQ ? "Q" : ""}${state.castling.blackK ? "k" : ""}${state.castling.blackQ ? "q" : ""}`;
  s += `|${state.enPassant ? `${state.enPassant[0]},${state.enPassant[1]}` : "-"}`;
  return s;
}

// ----------------------------------------------------------------------------
// Move resolution / matching
// ----------------------------------------------------------------------------

function coordsEqual(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function parseMove(move: Move): { from: Coord; to: Coord; promotion?: PromotionType } | null {
  const from = (move as { from?: unknown }).from;
  const to = (move as { to?: unknown }).to;
  if (!Array.isArray(from) || from.length !== 2) return null;
  if (!Array.isArray(to) || to.length !== 2) return null;
  const [fr, fc] = from;
  const [tr, tc] = to;
  if ([fr, fc, tr, tc].some((n) => typeof n !== "number")) return null;
  const promRaw = (move as { promotion?: unknown }).promotion;
  let promotion: PromotionType | undefined;
  if (promRaw !== undefined && promRaw !== null) {
    if (promRaw !== "Q" && promRaw !== "R" && promRaw !== "B" && promRaw !== "N") return null;
    promotion = promRaw;
  }
  return { from: [fr, fc], to: [tr, tc], promotion };
}

// Find the generated legal move matching from/to (and promotion if relevant).
// Defaults promotion to Queen when omitted on a promoting move.
export function matchLegalMove(
  state: ChessState,
  from: Coord,
  to: Coord,
  promotion?: PromotionType,
): ChessMove | null {
  const candidates = legalMoves(state).filter(
    (m) => coordsEqual(m.from, from) && coordsEqual(m.to, to),
  );
  if (candidates.length === 0) return null;
  // Promotion moves carry a promotion type; non-promotion moves don't.
  if (candidates[0].promotion) {
    const want = promotion ?? "Q";
    return candidates.find((m) => m.promotion === want) ?? null;
  }
  return candidates[0];
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------

function name(s: ChessState, color: Color): string {
  return s.names[s.order[color]] ?? (color === "white" ? "White" : "Black");
}

function pieceWord(t: PieceType): string {
  return { P: "Pawn", N: "Knight", B: "Bishop", R: "Rook", Q: "Queen", K: "King" }[t];
}

function updateCastlingRights(s: ChessState, mv: ChessMove, mover: Piece): void {
  const [fr, fc] = mv.from;
  const [tr, tc] = mv.to;
  // King moved → lose both rights for that color.
  if (mover.type === "K") {
    if (mover.color === "white") {
      s.castling.whiteK = false;
      s.castling.whiteQ = false;
    } else {
      s.castling.blackK = false;
      s.castling.blackQ = false;
    }
  }
  // Rook moved from its home corner → lose that side.
  const loseRook = (r: number, c: number) => {
    if (r === 7 && c === 0) s.castling.whiteQ = false;
    if (r === 7 && c === 7) s.castling.whiteK = false;
    if (r === 0 && c === 0) s.castling.blackQ = false;
    if (r === 0 && c === 7) s.castling.blackK = false;
  };
  if (mover.type === "R") loseRook(fr, fc);
  // A rook captured on its home corner → opponent loses that right.
  loseRook(tr, tc);
}

function settleGameEnd(s: ChessState): void {
  const mover = opponent(s.turn); // the side that just moved
  const sideToMove = s.turn;
  const moves = legalMoves(s);
  if (moves.length === 0) {
    if (inCheck(s.board, sideToMove)) {
      // Checkmate — the mover wins.
      s.finished = true;
      s.winner = mover;
      s.log.push(`Checkmate! ${name(s, mover)} wins. 🏆`);
    } else {
      // Stalemate — draw.
      s.finished = true;
      s.draw = true;
      s.winner = null;
      s.drawReason = "Stalemate (draw)";
      s.log.push("Stalemate — draw.");
    }
    return;
  }
  if (insufficientMaterial(s.board)) {
    s.finished = true;
    s.draw = true;
    s.winner = null;
    s.drawReason = "Insufficient material (draw)";
    s.log.push("Draw — insufficient material.");
    return;
  }
  if (s.halfmoveClock >= 100) {
    // 50 full moves by each side = 100 plies without capture or pawn move.
    s.finished = true;
    s.draw = true;
    s.winner = null;
    s.drawReason = "50-move rule (draw)";
    s.log.push("Draw — 50-move rule.");
    return;
  }
  const key = positionKey(s);
  if ((s.positionCounts[key] ?? 0) >= 3) {
    s.finished = true;
    s.draw = true;
    s.winner = null;
    s.drawReason = "Threefold repetition (draw)";
    s.log.push("Draw — threefold repetition.");
  }
}

export const chess: GameModule<ChessState> = {
  type: "chess",
  name: "Chess",
  emoji: "♟️",
  blurb: "The classic — checkmate the king. Castling, en passant, promotion and all.",
  minPlayers: 2,
  maxPlayers: 2,

  initGame(players: PlayerInfo[]): ChessState {
    const sorted = [...players].sort((a, b) => a.seat - b.seat);
    const white = sorted[0];
    const black = sorted[1];
    const names: Record<string, string> = {};
    for (const p of players) names[p.id] = p.name;
    const state: ChessState = {
      board: initBoard(),
      turn: "white",
      order: { white: white.id, black: black.id },
      names,
      castling: { whiteK: true, whiteQ: true, blackK: true, blackQ: true },
      enPassant: null,
      halfmoveClock: 0,
      fullmove: 1,
      positionCounts: {},
      finished: false,
      winner: null,
      draw: false,
      drawReason: null,
      log: ["Game started — White to move."],
    };
    state.positionCounts[positionKey(state)] = 1;
    return state;
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (move.type !== "move") return { ok: false, error: "Unknown move." };

    const color = state.turn;
    if (state.order[color] !== playerId) return { ok: false, error: "Not your turn." };

    const parsed = parseMove(move);
    if (!parsed) return { ok: false, error: "Malformed move." };

    const [fr, fc] = parsed.from;
    if (!inBounds(fr, fc)) return { ok: false, error: "Off the board." };
    const piece = state.board[fr][fc];
    if (!piece) return { ok: false, error: "No piece there." };
    if (piece.color !== color) return { ok: false, error: "That isn't your piece." };

    const match = matchLegalMove(state, parsed.from, parsed.to, parsed.promotion);
    if (!match) {
      // Distinguish "would leave king in check" for a friendlier message.
      const piecePseudo = pseudoMovesFrom(state, fr, fc).some(
        (m) => coordsEqual(m.to, parsed.to),
      );
      if (piecePseudo) {
        return { ok: false, error: "That move would leave your king in check." };
      }
      return { ok: false, error: "Illegal move." };
    }
    return { ok: true };
  },

  applyMove(state, playerId, move): ChessState {
    const s: ChessState = structuredClone(state);
    const color = s.turn;
    const parsed = parseMove(move)!;
    const mv = matchLegalMove(s, parsed.from, parsed.to, parsed.promotion)!;

    const [fr, fc] = mv.from;
    const [tr, tc] = mv.to;
    const piece = s.board[fr][fc]!;
    const captured = mv.enPassant
      ? s.board[mv.enPassant[0]][mv.enPassant[1]]
      : s.board[tr][tc];

    // Halfmove clock: reset on capture or pawn move.
    if (piece.type === "P" || captured) s.halfmoveClock = 0;
    else s.halfmoveClock += 1;

    // Update castling rights before mutating the board.
    updateCastlingRights(s, mv, piece);

    // Apply the move to the board.
    applyMoveToBoard(s.board, mv);

    // En-passant target: only after a double pawn step.
    s.enPassant = mv.doubleStep ? [(fr + tr) / 2, fc] : null;

    // Logging.
    if (mv.castle) {
      s.log.push(`${name(s, color)} castled ${mv.castle === "K" ? "king-side" : "queen-side"}.`);
    } else {
      const what = pieceWord(piece.type);
      const tail = mv.promotion ? ` and promoted to ${pieceWord(mv.promotion)}` : "";
      const verb = captured ? "captured a piece with" : "moved";
      s.log.push(`${name(s, color)} ${verb} ${what}${tail}.`);
    }

    if (color === "black") s.fullmove += 1;

    // Turn passes.
    s.turn = opponent(color);

    // Repetition bookkeeping.
    const key = positionKey(s);
    s.positionCounts[key] = (s.positionCounts[key] ?? 0) + 1;

    // Check / end-of-game detection.
    if (inCheck(s.board, s.turn)) {
      s.log.push(`${name(s, s.turn)} is in check!`);
    }
    settleGameEnd(s);

    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    if (state.draw || !state.winner) {
      return { winners: [], reason: state.drawReason ?? "Draw" };
    }
    return {
      winners: [state.order[state.winner]],
      reason: "Checkmate",
    };
  },

  getPlayerView(state, playerId) {
    const youColor: Color | null =
      playerId == null
        ? null
        : state.order.white === playerId
          ? "white"
          : state.order.black === playerId
            ? "black"
            : null;

    const check = inCheck(state.board, state.turn);

    // Your legal moves (for highlighting). Only meaningful when it's your turn.
    const myMoves =
      youColor && youColor === state.turn && !state.finished ? legalMoves(state) : [];

    return {
      type: "chess" as const,
      board: state.board,
      turn: state.turn,
      activePlayerId: state.order[state.turn],
      you: playerId ?? null,
      youColor,
      white: { id: state.order.white, name: state.names[state.order.white] },
      black: { id: state.order.black, name: state.names[state.order.black] },
      inCheck: check,
      finished: state.finished,
      draw: state.draw,
      drawReason: state.drawReason,
      winner: state.winner,
      winnerId: state.winner ? state.order[state.winner] : null,
      legalMoves: myMoves,
      capturedByWhite: capturedPieces(state.board, "white"),
      capturedByBlack: capturedPieces(state.board, "black"),
      log: state.log.slice(-6),
    };
  },
};

// Pieces of `color` that have been captured = full starting set minus what's
// still on the board. (Promotions can make this approximate, but it's a tray.)
function capturedPieces(board: Board, color: Color): PieceType[] {
  const start: Record<PieceType, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
  const present: Record<PieceType, number> = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 };
  for (const p of listPieces(board)) {
    if (p.color === color) present[p.type] += 1;
  }
  const out: PieceType[] = [];
  for (const t of ["Q", "R", "B", "N", "P"] as PieceType[]) {
    const missing = Math.max(0, start[t] - present[t]);
    for (let i = 0; i < missing; i++) out.push(t);
  }
  return out;
}
