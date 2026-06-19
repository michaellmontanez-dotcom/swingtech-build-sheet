import assert from "node:assert/strict";
import test from "node:test";
import {
  chess,
  legalMoves,
  inCheck,
  matchLegalMove,
  type ChessState,
  type Board,
  type Piece,
  type PieceType,
  type Color,
} from "@/games/chess/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";

const players: PlayerInfo[] = [
  { id: "w", name: "Wendy", seat: 0 },
  { id: "b", name: "Bob", seat: 1 },
];

function fresh(): ChessState {
  return chess.initGame(players);
}

// Build a board with only the given pieces. `spec` maps "r,c" -> "Wx"/"Bx".
function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
}

function put(board: Board, r: number, c: number, color: Color, type: PieceType) {
  board[r][c] = { color, type };
}

// Apply a from/to (defaulting promotion to queen) by id of active color.
function play(s: ChessState, from: [number, number], to: [number, number], promotion?: string): ChessState {
  const pid = s.order[s.turn];
  const move = { type: "move", from, to, ...(promotion ? { promotion } : {}) };
  const verdict = normalizeValidate(chess.validateMove(s, pid, move));
  assert.ok(verdict.ok, `expected legal ${JSON.stringify(move)} — ${verdict.error}`);
  return chess.applyMove(s, pid, move);
}

test("starting position has exactly 20 legal moves", () => {
  const s = fresh();
  assert.equal(legalMoves(s).length, 20);
});

test("Fool's Mate is detected as checkmate, Black wins", () => {
  let s = fresh();
  // 1. f3
  s = play(s, [6, 5], [5, 5]);
  // 1... e5
  s = play(s, [1, 4], [3, 4]);
  // 2. g4
  s = play(s, [6, 6], [4, 6]);
  // 2... Qh4#  (black queen d8 -> h4)
  s = play(s, [0, 3], [4, 7]);

  assert.ok(s.finished, "game should be finished");
  const result = chess.isGameOver(s);
  assert.ok(result, "isGameOver returns a result");
  assert.deepEqual(result!.winners, ["b"]);
  assert.equal(result!.reason, "Checkmate");
});

test("king-side castling works", () => {
  const board = emptyBoard();
  put(board, 7, 4, "white", "K");
  put(board, 7, 7, "white", "R");
  put(board, 0, 4, "black", "K");
  const s: ChessState = {
    ...fresh(),
    board,
    turn: "white",
    castling: { whiteK: true, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  const mv = matchLegalMove(s, [7, 4], [7, 6]);
  assert.ok(mv, "king-side castle should be legal");
  const after = chess.applyMove(s, "w", { type: "move", from: [7, 4], to: [7, 6] });
  assert.deepEqual(after.board[7][6], { color: "white", type: "K" });
  assert.deepEqual(after.board[7][5], { color: "white", type: "R" });
  assert.equal(after.board[7][7], null);
});

test("castling is rejected when king passes through check", () => {
  const board = emptyBoard();
  put(board, 7, 4, "white", "K");
  put(board, 7, 7, "white", "R");
  put(board, 0, 4, "black", "K");
  // Black rook on f-file (col 5) attacks square (7,5) the king would cross.
  put(board, 0, 5, "black", "R");
  const s: ChessState = {
    ...fresh(),
    board,
    turn: "white",
    castling: { whiteK: true, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  const mv = matchLegalMove(s, [7, 4], [7, 6]);
  assert.equal(mv, null, "cannot castle through check");
  const verdict = normalizeValidate(
    chess.validateMove(s, "w", { type: "move", from: [7, 4], to: [7, 6] }),
  );
  assert.equal(verdict.ok, false);
});

test("en passant capture works", () => {
  const board = emptyBoard();
  put(board, 7, 4, "white", "K");
  put(board, 0, 4, "black", "K");
  // White pawn on row 3 col 4; black pawn just played d7-d5 (row1->row3 col3).
  put(board, 3, 4, "white", "P");
  put(board, 3, 3, "black", "P");
  const s: ChessState = {
    ...fresh(),
    board,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: [2, 3], // the square the black pawn skipped over
  };
  const mv = matchLegalMove(s, [3, 4], [2, 3]);
  assert.ok(mv, "en passant should be legal");
  const after = chess.applyMove(s, "w", { type: "move", from: [3, 4], to: [2, 3] });
  assert.deepEqual(after.board[2][3], { color: "white", type: "P" });
  assert.equal(after.board[3][3], null, "captured pawn removed");
  assert.equal(after.board[3][4], null, "moving pawn left origin");
});

test("promotion to queen works (and defaults to queen)", () => {
  const board = emptyBoard();
  put(board, 7, 0, "white", "K");
  put(board, 0, 7, "black", "K");
  put(board, 1, 0, "white", "P"); // one step from promotion
  const s: ChessState = {
    ...fresh(),
    board,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  // Default (no promotion field) → queen.
  const after = chess.applyMove(s, "w", { type: "move", from: [1, 0], to: [0, 0] });
  assert.deepEqual(after.board[0][0], { color: "white", type: "Q" });

  // Explicit knight promotion.
  const afterN = chess.applyMove(s, "w", { type: "move", from: [1, 0], to: [0, 0], promotion: "N" });
  assert.deepEqual(afterN.board[0][0], { color: "white", type: "N" });
});

test("a move that leaves own king in check is rejected", () => {
  const board = emptyBoard();
  put(board, 7, 4, "white", "K");
  put(board, 0, 4, "black", "K");
  // White bishop pinned on the e-file in front of king; black rook behind it.
  put(board, 6, 4, "white", "B");
  put(board, 0, 4 + 0, "black", "K"); // already there
  put(board, 4, 4, "black", "R"); // rook on e-file pinning the bishop
  const s: ChessState = {
    ...fresh(),
    board,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  // Moving the pinned bishop off the e-file exposes the king → illegal.
  const verdict = normalizeValidate(
    chess.validateMove(s, "w", { type: "move", from: [6, 4], to: [5, 3] }),
  );
  assert.equal(verdict.ok, false, "pinned bishop may not move off the file");
  // And legalMoves must not contain it.
  const has = legalMoves(s).some(
    (m) => m.from[0] === 6 && m.from[1] === 4 && m.to[0] === 5 && m.to[1] === 3,
  );
  assert.equal(has, false);
});

test("stalemate is detected as a draw", () => {
  // Classic stalemate: Black king a8 (0,0), White king c6 (2,2)? Use the
  // well-known one: Black Kh8, White Kf7 + Qg6 → stalemate, Black to move.
  const board = emptyBoard();
  put(board, 0, 7, "black", "K"); // h8
  put(board, 1, 5, "white", "K"); // f7
  put(board, 2, 6, "white", "Q"); // g6
  const s: ChessState = {
    ...fresh(),
    board,
    turn: "black",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  assert.equal(inCheck(s.board, "black"), false, "black not in check");
  assert.equal(legalMoves(s).length, 0, "black has no legal move");

  // settleGameEnd runs inside applyMove; simulate by checking via a white move
  // that yields this position. Instead, assert the module reports it through a
  // constructed game-over: make White play a null-ish waiting move is not
  // possible, so directly verify the draw classification using isGameOver after
  // forcing finished via the engine's own end detection.
  // Drive it: have White just have moved to create this; we reach it by playing
  // a move that lands here. Simplest: apply a White move into the position.
  const setup = emptyBoard();
  put(setup, 0, 7, "black", "K"); // h8
  put(setup, 1, 5, "white", "K"); // f7
  put(setup, 3, 6, "white", "Q"); // g5 → will move to g6
  const pre: ChessState = {
    ...fresh(),
    board: setup,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  const post = chess.applyMove(pre, "w", { type: "move", from: [3, 6], to: [2, 6] }); // Qg5-g6
  assert.ok(post.finished, "should be finished after stalemating move");
  const result = chess.isGameOver(post);
  assert.ok(result);
  assert.deepEqual(result!.winners, []);
  assert.match(result!.reason ?? "", /stalemate/i);
});

test("insufficient material (K vs K) is a draw", () => {
  const board = emptyBoard();
  put(board, 7, 4, "white", "K");
  put(board, 0, 4, "black", "K");
  // Reach it via a capture that leaves only kings.
  put(board, 1, 4, "black", "Q"); // will be captured
  const setup = emptyBoard();
  put(setup, 7, 4, "white", "K");
  put(setup, 0, 4, "black", "K");
  put(setup, 6, 4, "white", "R"); // white rook captures lone black piece below
  put(setup, 5, 4, "black", "Q");
  const pre: ChessState = {
    ...fresh(),
    board: setup,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  // Rook takes queen → K+R vs K, not insufficient. Instead test directly:
  const kvk: ChessState = {
    ...fresh(),
    board,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  // White rook (none here) — just capture the black queen with king is illegal
  // (adjacent). Build a clean K+B vs K capture instead:
  const b2 = emptyBoard();
  put(b2, 7, 4, "white", "K");
  put(b2, 0, 0, "black", "K");
  put(b2, 5, 2, "white", "B");
  put(b2, 4, 1, "black", "N"); // bishop captures knight → K+B vs K
  const pre2: ChessState = {
    ...fresh(),
    board: b2,
    turn: "white",
    castling: { whiteK: false, whiteQ: false, blackK: false, blackQ: false },
    enPassant: null,
  };
  const post2 = chess.applyMove(pre2, "w", { type: "move", from: [5, 2], to: [4, 1] });
  assert.ok(post2.finished, "K+B vs K is a draw by insufficient material");
  const r = chess.isGameOver(post2);
  assert.deepEqual(r!.winners, []);
  assert.match(r!.reason ?? "", /insufficient/i);
  void pre;
  void kvk;
});

test("rejects moving when it is not your turn", () => {
  const s = fresh();
  // Black tries to move while White is to move.
  const verdict = normalizeValidate(
    chess.validateMove(s, "b", { type: "move", from: [1, 4], to: [3, 4] }),
  );
  assert.equal(verdict.ok, false);
});

test("public and player views both show the full board", () => {
  const s = fresh();
  const pub = chess.getPlayerView(s, null) as any;
  const priv = chess.getPlayerView(s, "w") as any;
  assert.ok(pub.board[0][0], "public view shows pieces");
  assert.ok(priv.board[0][0], "player view shows pieces");
  assert.equal(priv.youColor, "white");
  assert.ok(priv.legalMoves.length === 20, "white's view carries legal moves");
  assert.equal(pub.legalMoves.length, 0, "spectator gets no highlight moves");
});
