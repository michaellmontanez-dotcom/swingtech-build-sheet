import assert from "node:assert/strict";
import test from "node:test";
import { connect4, COLS, ROWS, type Connect4State } from "@/games/connect4/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

function drop(s: Connect4State, pid: string, col: number): Connect4State {
  const verdict = normalizeValidate(connect4.validateMove(s, pid, { type: "drop", col }));
  assert.ok(verdict.ok, `drop should be legal (col ${col}): ${verdict.error}`);
  return connect4.applyMove(s, pid, { type: "drop", col });
}

// Count discs on the board + verify each player's count matches alternation.
function boardCounts(s: Connect4State): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of s.board) {
    for (const cell of row) {
      if (cell) counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return counts;
}

test("initGame seats red first, yellow second", () => {
  const s = connect4.initGame(players);
  assert.equal(s.discs.a, "red");
  assert.equal(s.discs.b, "yellow");
  assert.equal(activePlayer(s.turn), "a");
  assert.equal(s.moves, 0);
});

test("detects a forced vertical win", () => {
  let s = connect4.initGame(players);
  // a stacks column 0; b dumps into column 1. a wins on the 4th stack.
  s = drop(s, "a", 0); // a
  s = drop(s, "b", 1); // b
  s = drop(s, "a", 0); // a
  s = drop(s, "b", 1); // b
  s = drop(s, "a", 0); // a
  s = drop(s, "b", 1); // b
  assert.equal(s.finished, false, "should not be over before the 4th disc");
  s = drop(s, "a", 0); // a — 4 in a column
  assert.equal(s.finished, true);
  const over = connect4.isGameOver(s);
  assert.ok(over);
  assert.deepEqual(over!.winners, ["a"]);
  assert.ok(s.winLine && s.winLine.cells.length === 4);
});

test("detects a horizontal win", () => {
  let s = connect4.initGame(players);
  // a plays cols 0,1,2,3 on the bottom row; b stacks col 6.
  s = drop(s, "a", 0);
  s = drop(s, "b", 6);
  s = drop(s, "a", 1);
  s = drop(s, "b", 6);
  s = drop(s, "a", 2);
  s = drop(s, "b", 6);
  s = drop(s, "a", 3); // four across the bottom
  assert.equal(s.finished, true);
  assert.deepEqual(connect4.isGameOver(s)!.winners, ["a"]);
});

test("rejects illegal moves: wrong turn and full column", () => {
  let s = connect4.initGame(players);
  // wrong turn: b can't move first
  assert.equal(normalizeValidate(connect4.validateMove(s, "b", { type: "drop", col: 0 })).ok, false);
  // invalid column
  assert.equal(normalizeValidate(connect4.validateMove(s, "a", { type: "drop", col: COLS })).ok, false);
  assert.equal(normalizeValidate(connect4.validateMove(s, "a", { type: "drop", col: -1 })).ok, false);

  // fill column 0 (6 discs) by alternating, then assert it is full.
  // a,b,a,b,a,b -> column 0 has 6 discs, whoever is active can't drop there.
  for (let i = 0; i < ROWS; i++) {
    const pid = activePlayer(s.turn);
    s = drop(s, pid, 0);
  }
  const active = activePlayer(s.turn);
  assert.equal(
    normalizeValidate(connect4.validateMove(s, active, { type: "drop", col: 0 })).ok,
    false,
    "full column must be rejected"
  );
});

test("a full board with no winner is a draw", () => {
  // Drive a greedy filler: for the active player, always pick the lowest-index
  // legal column whose resulting position does NOT create a win. This fills all
  // 42 cells under strict alternation without ever forming a 4-in-a-row, so the
  // final disc ends the game as a draw. If only winning moves remained the test
  // would correctly fail at the draw assertions below.
  let s = connect4.initGame(players);
  let placed = 0;
  while (!s.finished && placed < ROWS * COLS) {
    const pid = activePlayer(s.turn);
    const legal: number[] = [];
    for (let c = 0; c < COLS; c++) {
      if (normalizeValidate(connect4.validateMove(s, pid, { type: "drop", col: c })).ok) legal.push(c);
    }
    assert.ok(legal.length > 0, "should always have a legal column until the board fills");
    // prefer a column that does NOT finish the game with a win
    let chosen = legal[0];
    for (const c of legal) {
      const next = connect4.applyMove(s, pid, { type: "drop", col: c });
      if (!(next.finished && next.winnerId)) {
        chosen = c;
        break;
      }
    }
    s = connect4.applyMove(s, pid, { type: "drop", col: chosen });
    placed++;
    // until the board is full, no winner should have been forced
    if (placed < ROWS * COLS) {
      assert.equal(s.winnerId, null, `unexpected forced win at move ${placed}`);
    }
  }

  assert.equal(s.finished, true);
  assert.equal(s.draw, true);
  assert.equal(s.winnerId, null);
  const over = connect4.isGameOver(s);
  assert.ok(over);
  assert.deepEqual(over!.winners, []);
  assert.equal(over!.reason, "Draw");
});

test("token conservation / board integrity invariant holds across a game", () => {
  let s = connect4.initGame(players);
  let guard = 0;
  while (!s.finished && guard++ < 100) {
    const pid = activePlayer(s.turn);
    // pick first open column
    let col = -1;
    for (let c = 0; c < COLS; c++) {
      if (normalizeValidate(connect4.validateMove(s, pid, { type: "drop", col: c })).ok) {
        col = c;
        break;
      }
    }
    assert.notEqual(col, -1, "there should always be a legal move until finished");
    s = drop(s, pid, col);

    // invariant: moves equals total discs on board, and each player's count is
    // within 1 of the other (strict alternation).
    const counts = boardCounts(s);
    const total = (counts.a ?? 0) + (counts.b ?? 0);
    assert.equal(total, s.moves, "moves counter must equal discs on board");
    assert.ok(Math.abs((counts.a ?? 0) - (counts.b ?? 0)) <= 1, "disc counts must stay balanced");
    // no floating discs: a filled cell must have a filled cell below it
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS - 1; r++) {
        if (s.board[r][c] !== null) {
          assert.notEqual(s.board[r + 1][c], null, `floating disc at ${r},${c}`);
        }
      }
    }
  }
  assert.ok(s.finished, "game should finish within the cell budget");
});

test("public and private views agree on the board (no hidden info)", () => {
  let s = connect4.initGame(players);
  s = drop(s, "a", 3);
  const pub = connect4.getPlayerView(s, null) as any;
  const priv = connect4.getPlayerView(s, "a") as any;
  assert.equal(pub.you, null);
  assert.equal(priv.you, "a");
  assert.deepEqual(pub.board, priv.board);
});
