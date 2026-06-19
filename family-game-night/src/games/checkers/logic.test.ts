import assert from "node:assert/strict";
import test from "node:test";
import {
  checkers,
  legalMoves,
  initBoard,
  isDark,
  type Board,
  type CheckersState,
  type Piece,
  type Coord,
} from "@/games/checkers/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";

const players: PlayerInfo[] = [
  { id: "r", name: "Red", seat: 0 },
  { id: "b", name: "Black", seat: 1 },
];

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
}

function countAll(board: Board): { red: number; black: number } {
  let red = 0;
  let black = 0;
  for (const row of board) {
    for (const p of row) {
      if (p?.color === "red") red++;
      if (p?.color === "black") black++;
    }
  }
  return { red, black };
}

test("starting position has 12 vs 12 men on dark squares", () => {
  const s = checkers.initGame(players);
  const { red, black } = countAll(s.board);
  assert.equal(red, 12);
  assert.equal(black, 12);
  // all pieces on dark squares, no kings yet
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = s.board[r][c];
      if (p) {
        assert.ok(isDark(r, c), `piece at ${r},${c} must be on a dark square`);
        assert.equal(p.king, false);
      }
    }
  }
  assert.equal(s.turn, "red");
});

test("opening simple moves: Red has 7 legal forward moves, all non-capturing", () => {
  const s = checkers.initGame(players);
  const moves = legalMoves(s.board, "red");
  // Red occupies rows 5,6,7. Only row 5 men can advance to row 4. Standard
  // opening yields 7 distinct simple moves.
  assert.equal(moves.length, 7);
  for (const m of moves) {
    assert.equal(m.captures.length, 0);
    const [sr] = m.path[0];
    const [er] = m.path[1];
    assert.equal(er, sr - 1, "Red moves up (toward row 0)");
  }
});

test("forced capture: a non-capturing move is rejected when a capture exists", () => {
  const board = emptyBoard();
  // Red man at 5,2 ; Black man at 4,3 ; landing square 3,4 empty → capture available.
  board[5][2] = { color: "red", king: false };
  board[4][3] = { color: "black", king: false };
  // Another red man at 5,4 that could move simply but must not.
  board[5][4] = { color: "red", king: false };
  const s: CheckersState = {
    board,
    turn: "red",
    order: { red: "r", black: "b" },
    names: { r: "Red", b: "Black" },
    movesSinceCapture: 0,
    finished: false,
    winner: null,
    draw: false,
    log: [],
  };

  const moves = legalMoves(board, "red");
  // every legal move must be a capture
  assert.ok(moves.length > 0);
  for (const m of moves) assert.ok(m.captures.length > 0);

  // a plain forward move of the other piece is rejected
  const bad = normalizeValidate(
    checkers.validateMove(s, "r", { type: "move", path: [[5, 4], [4, 5]] }),
  );
  assert.equal(bad.ok, false);

  // the capture is accepted
  const good = normalizeValidate(
    checkers.validateMove(s, "r", { type: "move", path: [[5, 2], [3, 4]] }),
  );
  assert.equal(good.ok, true);
});

test("multi-jump path is accepted and removes all jumped pieces", () => {
  const board = emptyBoard();
  // Red man at 6,1 jumps black at 5,2 → 4,3, then black at 3,4 → 2,5.
  board[6][1] = { color: "red", king: false };
  board[5][2] = { color: "black", king: false };
  board[3][4] = { color: "black", king: false };
  const s: CheckersState = {
    board,
    turn: "red",
    order: { red: "r", black: "b" },
    names: { r: "Red", b: "Black" },
    movesSinceCapture: 0,
    finished: false,
    winner: null,
    draw: false,
    log: [],
  };

  const path: Coord[] = [[6, 1], [4, 3], [2, 5]];
  const v = normalizeValidate(checkers.validateMove(s, "r", { type: "move", path }));
  assert.equal(v.ok, true, v.error);

  const next = checkers.applyMove(s, "r", { type: "move", path });
  // both black pieces removed
  assert.equal(next.board[5][2], null);
  assert.equal(next.board[3][4], null);
  // red landed at 2,5
  assert.equal(next.board[2][5]?.color, "red");
  assert.equal(next.board[6][1], null);
  const { red, black } = countAll(next.board);
  assert.equal(red, 1);
  assert.equal(black, 0);

  // a partial path (stopping after one jump when another exists) is illegal
  const partial = normalizeValidate(
    checkers.validateMove(s, "r", { type: "move", path: [[6, 1], [4, 3]] }),
  );
  assert.equal(partial.ok, false);
});

test("kinging: a man reaching the back row is crowned and ends the turn", () => {
  const board = emptyBoard();
  // Red man one step from row 0.
  board[1][2] = { color: "red", king: false };
  const s: CheckersState = {
    board,
    turn: "red",
    order: { red: "r", black: "b" },
    names: { r: "Red", b: "Black" },
    movesSinceCapture: 0,
    finished: false,
    winner: null,
    draw: false,
    log: [],
  };
  const next = checkers.applyMove(s, "r", { type: "move", path: [[1, 2], [0, 3]] });
  assert.equal(next.board[0][3]?.king, true);
  assert.equal(next.turn, "black");
});

test("kings move and capture backward", () => {
  const board = emptyBoard();
  // Red KING at 4,3 (dark square) — can move in all four diagonal directions,
  // including backward (toward row 5, away from red's forward direction).
  board[4][3] = { color: "red", king: true };
  const moves = legalMoves(board, "red");
  const dests = moves.map((m) => m.path[1]);
  // backward destinations (row 5) must be present
  assert.ok(dests.some(([r, c]) => r === 5 && c === 2), "king moves backward");
  assert.ok(dests.some(([r, c]) => r === 3 && c === 2), "king moves forward too");

  // king capturing backward
  const cap = emptyBoard();
  cap[4][3] = { color: "red", king: true };
  cap[5][4] = { color: "black", king: false }; // behind the red king (dark sq)
  const capMoves = legalMoves(cap, "red");
  assert.ok(capMoves.every((m) => m.captures.length > 0), "forced capture");
  assert.ok(
    capMoves.some(
      (m) => m.path[m.path.length - 1][0] === 6 && m.path[m.path.length - 1][1] === 5,
    ),
    "king jumps backward to 6,5",
  );
});

test("a side with no pieces loses", () => {
  const board = emptyBoard();
  board[6][1] = { color: "red", king: false };
  board[5][2] = { color: "black", king: false }; // black's only piece, about to be captured
  const s: CheckersState = {
    board,
    turn: "red",
    order: { red: "r", black: "b" },
    names: { r: "Red", b: "Black" },
    movesSinceCapture: 0,
    finished: false,
    winner: null,
    draw: false,
    log: [],
  };
  const next = checkers.applyMove(s, "r", { type: "move", path: [[6, 1], [4, 3]] });
  assert.equal(next.finished, true);
  const result = checkers.isGameOver(next);
  assert.deepEqual(result?.winners, ["r"]);
});

test("a side with no legal move loses", () => {
  const board = emptyBoard();
  // Black man at 0,1 boxed: it's red's turn but black has no move. Black man
  // cornered so that after red passes it cannot move. We test from black's
  // perspective: black to move, fully blocked.
  board[7][0] = { color: "black", king: false }; // black man on red's back edge area
  // Surround so black (moves down, +1 row) cannot advance off the bottom edge.
  // At row 7, a non-king black man has no forward square at all.
  const moves = legalMoves(board, "black");
  assert.equal(moves.length, 0);

  // Drive it through applyMove: red moves, then black has no move → red wins.
  const board2 = emptyBoard();
  board2[6][1] = { color: "red", king: false };
  board2[7][0] = { color: "black", king: false }; // stuck black man (row 7, no forward)
  const s: CheckersState = {
    board: board2,
    turn: "red",
    order: { red: "r", black: "b" },
    names: { r: "Red", b: "Black" },
    movesSinceCapture: 0,
    finished: false,
    winner: null,
    draw: false,
    log: [],
  };
  const next = checkers.applyMove(s, "r", { type: "move", path: [[6, 1], [5, 2]] });
  assert.equal(next.finished, true);
  assert.equal(next.winner, "red");
});

test("piece-count integrity holds across a played sequence", () => {
  let s = checkers.initGame(players);
  // Play a handful of legal moves alternating sides, asserting conservation.
  for (let i = 0; i < 10 && !s.finished; i++) {
    const moves = legalMoves(s.board, s.turn);
    assert.ok(moves.length > 0);
    const pid = s.order[s.turn];
    const mv = { type: "move", path: moves[0].path };
    const v = normalizeValidate(checkers.validateMove(s, pid, mv));
    assert.ok(v.ok, v.error);
    const before = countAll(s.board);
    const beforeTotal = before.red + before.black;
    s = checkers.applyMove(s, pid, mv);
    const after = countAll(s.board);
    const capturedCount = moves[0].path.length > 0 ? before.red + before.black - (after.red + after.black) : 0;
    // total pieces only ever decreases (by number captured), never increases
    assert.ok(after.red + after.black <= beforeTotal);
    assert.ok(capturedCount >= 0);
  }
});

test("public view and player view both expose the full board", () => {
  const s = checkers.initGame(players);
  const pub = checkers.getPlayerView(s, null) as any;
  const priv = checkers.getPlayerView(s, "r") as any;
  assert.ok(Array.isArray(pub.board));
  assert.equal(countAll(pub.board).red, 12);
  assert.equal(countAll(priv.board).red, 12);
  assert.equal(priv.youColor, "red");
  assert.equal(pub.youColor, null);
  // red's view on red's turn surfaces its legal moves for highlighting
  assert.ok(priv.legalMoves.length > 0);
});
