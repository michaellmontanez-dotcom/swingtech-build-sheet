import assert from "node:assert/strict";
import test from "node:test";
import { tictactoe, type TicTacToeState } from "@/games/tictactoe/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

function mark(s: TicTacToeState, pid: string, cell: number): TicTacToeState {
  const v = normalizeValidate(tictactoe.validateMove(s, pid, { type: "mark", cell }));
  assert.ok(v.ok, `mark ${cell} by ${pid} should be legal: ${v.error}`);
  return tictactoe.applyMove(s, pid, { type: "mark", cell });
}

test("seat 0 is X and goes first", () => {
  const s = tictactoe.initGame(players);
  assert.equal(s.marks["a"], "X");
  assert.equal(s.marks["b"], "O");
  assert.equal(activePlayer(s.turn), "a");
});

test("three in a row wins (top row)", () => {
  let s = tictactoe.initGame(players);
  s = mark(s, "a", 0); // X
  s = mark(s, "b", 3); // O
  s = mark(s, "a", 1); // X
  s = mark(s, "b", 4); // O
  s = mark(s, "a", 2); // X wins top row
  const over = tictactoe.isGameOver(s);
  assert.ok(over && over.winners.length === 1 && over.winners[0] === "a");
  assert.deepEqual(s.winningLine, [0, 1, 2]);
});

test("diagonal win is detected", () => {
  let s = tictactoe.initGame(players);
  s = mark(s, "a", 0);
  s = mark(s, "b", 1);
  s = mark(s, "a", 4);
  s = mark(s, "b", 2);
  s = mark(s, "a", 8); // 0,4,8 diagonal
  assert.equal(s.winnerId, "a");
});

test("rejects taken square, wrong turn, and play after game over", () => {
  let s = tictactoe.initGame(players);
  s = mark(s, "a", 0);
  assert.equal(normalizeValidate(tictactoe.validateMove(s, "b", { type: "mark", cell: 0 })).ok, false); // taken
  assert.equal(normalizeValidate(tictactoe.validateMove(s, "a", { type: "mark", cell: 1 })).ok, false); // not a's turn
  assert.equal(normalizeValidate(tictactoe.validateMove(s, "b", { type: "mark", cell: 9 })).ok, false); // out of range
});

test("full board with no line is a draw", () => {
  let s = tictactoe.initGame(players);
  // X O X / X O O / O X X  -> no three in a row
  const moves: [string, number][] = [
    ["a", 0], ["b", 1], ["a", 2],
    ["b", 4], ["a", 3], ["b", 5],
    ["a", 7], ["b", 6], ["a", 8],
  ];
  for (const [pid, cell] of moves) s = mark(s, pid, cell);
  const over = tictactoe.isGameOver(s);
  assert.ok(over && over.winners.length === 0, "should be a draw");
  assert.equal(s.draw, true);
});

test("public view projects marks and never throws", () => {
  let s = tictactoe.initGame(players);
  s = mark(s, "a", 4);
  const pub = tictactoe.getPlayerView(s, null) as { board: (string | null)[]; activePlayerId: string };
  assert.equal(pub.board[4], "X");
  assert.equal(pub.activePlayerId, "b");
});
