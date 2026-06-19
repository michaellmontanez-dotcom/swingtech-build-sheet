import assert from "node:assert/strict";
import test from "node:test";
import { mancala, type MancalaState, STORE_OF } from "@/games/mancala/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

function total(s: MancalaState): number {
  return s.board.reduce((n, v) => n + v, 0);
}

test("initial board has 48 stones, 4 per pit, empty stores", () => {
  const s = mancala.initGame(players);
  assert.equal(total(s), 48);
  for (let k = 0; k < 6; k++) {
    assert.equal(s.board[k], 4);
    assert.equal(s.board[7 + k], 4);
  }
  assert.equal(s.board[STORE_OF[0]], 0);
  assert.equal(s.board[STORE_OF[1]], 0);
  assert.equal(s.current, 0);
});

test("landing last stone in own store grants an extra turn", () => {
  // Player 0, pit index 2 holds 4 stones -> sows into 3,4,5,store(6). Last in own store.
  const s = mancala.initGame(players);
  const next = mancala.applyMove(s, "a", { type: "sow", pit: 2 });
  assert.equal(next.board[STORE_OF[0]], 1, "one stone in own store");
  assert.equal(next.lastMove?.extraTurn, true);
  assert.equal(next.current, 0, "still player 0's turn (go again)");
  assert.equal(total(next), 48);
});

test("sowing never adds to the opponent's store (skip rule)", () => {
  // Build a state where player 0 has a big pile that wraps past the opponent's store.
  let s = mancala.initGame(players);
  s = structuredClone(s);
  s.board = new Array(14).fill(0);
  s.board[0] = 20; // big pile in player 0 pit 0
  s.current = 0;
  const before = s.board[STORE_OF[1]];
  const next = mancala.applyMove(s, "a", { type: "sow", pit: 0 });
  assert.equal(next.board[STORE_OF[1]], before, "opponent store untouched");
  // 20 stones sown over 13 reachable slots (skipping opponent store) -> conserved
  assert.equal(total(next), 20);
});

test("capture: last stone in own empty pit captures opposite pit", () => {
  let s = mancala.initGame(players);
  s = structuredClone(s);
  s.board = new Array(14).fill(0);
  // Player 0 sows from pit 1 with exactly 1 stone -> lands in pit 2 (empty).
  s.board[1] = 1;
  s.board[2] = 0; // own landing pit is empty
  s.board[12 - 2] = 7; // opposite of pit 2 is index 10 -> opponent pit, 7 stones
  s.current = 0;
  const next = mancala.applyMove(s, "a", { type: "sow", pit: 1 });
  assert.equal(next.board[2], 0, "landing pit emptied into store");
  assert.equal(next.board[10], 0, "opposite pit captured");
  assert.equal(next.board[STORE_OF[0]], 8, "captured 7 + 1 = 8");
  assert.equal(next.lastMove?.captured, 8);
  assert.equal(total(next), 8);
});

test("no capture when opposite pit is empty", () => {
  let s = mancala.initGame(players);
  s = structuredClone(s);
  s.board = new Array(14).fill(0);
  s.board[1] = 1; // lands in pit 2 (empty), opposite (10) is empty
  s.board[8] = 3; // keep player 1 alive so the game doesn't end-sweep
  s.current = 0;
  const next = mancala.applyMove(s, "a", { type: "sow", pit: 1 });
  assert.equal(next.finished, false);
  assert.equal(next.board[2], 1, "stone stays in landing pit, no capture");
  assert.equal(next.board[STORE_OF[0]], 0);
});

test("game-end sweep moves remaining stones to correct stores, totals 48", () => {
  let s = mancala.initGame(players);
  s = structuredClone(s);
  s.board = new Array(14).fill(0);
  // Player 0 about to empty their side: only pit 5 has 1 stone -> lands in own store.
  s.board[5] = 1;
  s.board[STORE_OF[0]] = 20;
  // Player 1 still has stones scattered.
  s.board[7] = 5;
  s.board[9] = 3;
  s.board[STORE_OF[1]] = 19;
  s.current = 0;
  assert.equal(total(s), 48);
  const next = mancala.applyMove(s, "a", { type: "sow", pit: 5 });
  assert.equal(next.finished, true);
  // Player 0 side now empty -> player 1's remaining 5+3 swept into store 1.
  for (let k = 0; k < 6; k++) {
    assert.equal(next.board[k], 0);
    assert.equal(next.board[7 + k], 0);
  }
  assert.equal(next.board[STORE_OF[0]], 21, "20 + last stone in store");
  assert.equal(next.board[STORE_OF[1]], 19 + 8, "19 + swept 8");
  assert.equal(total(next), 48);
  const over = mancala.isGameOver(next);
  assert.ok(over);
  assert.equal((over!.scores!["a"] ?? 0) + (over!.scores!["b"] ?? 0), 48);
});

test("rejects illegal moves: empty pit, opponent pit, out of turn, out of range", () => {
  const s = mancala.initGame(players);

  // out of turn: player b acting while it's a's turn
  assert.equal(normalizeValidate(mancala.validateMove(s, "b", { type: "sow", pit: 0 })).ok, false);

  // out of range
  assert.equal(normalizeValidate(mancala.validateMove(s, "a", { type: "sow", pit: 6 })).ok, false);
  assert.equal(normalizeValidate(mancala.validateMove(s, "a", { type: "sow", pit: -1 })).ok, false);

  // empty pit
  const s2 = structuredClone(s);
  s2.board[0] = 0;
  assert.equal(normalizeValidate(mancala.validateMove(s2, "a", { type: "sow", pit: 0 })).ok, false);

  // valid baseline
  assert.equal(normalizeValidate(mancala.validateMove(s, "a", { type: "sow", pit: 0 })).ok, true);

  // "opponent pit": pit indices are per-player; b cannot move at all out of turn.
  // After a legal move by a (no extra turn), it becomes b's turn; a can't move.
  let s3 = mancala.applyMove(s, "a", { type: "sow", pit: 0 });
  if (s3.current === 1) {
    assert.equal(normalizeValidate(mancala.validateMove(s3, "a", { type: "sow", pit: 0 })).ok, false);
  }
});

test("a full simulated game ends with a winner/draw and scores summing to 48", () => {
  let s: MancalaState = mancala.initGame(players);
  let guard = 0;
  while (!s.finished && guard++ < 1000) {
    const pid = s.order[s.current];
    const view = mancala.getPlayerView(s, pid) as { legalPits: number[] };
    assert.ok(view.legalPits.length > 0, "active player must have a legal pit");
    const pit = view.legalPits[0];
    const verdict = normalizeValidate(mancala.validateMove(s, pid, { type: "sow", pit }));
    assert.ok(verdict.ok, `move should be legal: pit ${pit} — ${verdict.error}`);
    s = mancala.applyMove(s, pid, { type: "sow", pit });
    assert.equal(total(s), 48, "48 stones conserved every move");
  }
  assert.ok(s.finished, "game should finish");
  const over = mancala.isGameOver(s);
  assert.ok(over);
  assert.ok(over!.winners.length === 1 || over!.winners.length === 2, "winner or draw");
  const sum = (over!.scores!["a"] ?? 0) + (over!.scores!["b"] ?? 0);
  assert.equal(sum, 48, "final scores sum to 48");
});

test("public and private views both show the full board", () => {
  const s = mancala.initGame(players);
  const pub = mancala.getPlayerView(s, null) as any;
  const priv = mancala.getPlayerView(s, "b") as any;
  assert.deepEqual(pub.board, priv.board, "both see the whole board");
  assert.equal(pub.you, null);
  assert.equal(priv.you, "b");
  assert.equal(priv.youSeat, 1);
  assert.equal(priv.myTurn, false, "not b's turn at start");
});
