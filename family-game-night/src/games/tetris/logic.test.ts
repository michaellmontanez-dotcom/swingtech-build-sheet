import assert from "node:assert/strict";
import test from "node:test";
import {
  tetris,
  makeBag,
  emptyGrid,
  tryMove,
  tryRotate,
  isValidPosition,
  lockPiece,
  clearLines,
  pieceCells,
  WIDTH,
  HEIGHT,
  type TetrisState,
  type Grid,
  type ActivePiece,
  type PieceType,
} from "@/games/tetris/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

const ALL: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

test("7-bag yields each piece exactly once with no repeats within the bag", () => {
  for (let c = 0; c < 20; c++) {
    const bag = makeBag(1234, c);
    assert.equal(bag.length, 7);
    const sorted = [...bag].sort();
    assert.deepEqual(sorted, [...ALL].sort(), `bag ${c} must contain each piece once`);
    assert.equal(new Set(bag).size, 7, "no repeats within a bag");
  }
});

test("deterministic piece sequence given a seed", () => {
  const s1 = tetris.initGame(players, { seed: 99 }) as TetrisState;
  const s2 = tetris.initGame(players, { seed: 99 }) as TetrisState;
  // Same seed -> same first/next pieces for each player.
  assert.equal(s1.boards.a.active!.type, s2.boards.a.active!.type);
  assert.equal(s1.boards.a.next, s2.boards.a.next);
  // Drive a deterministic sequence of ticks and compare resulting board JSON.
  let A = s1;
  let B = s2;
  for (let i = 0; i < 100; i++) {
    A = tetris.applyMove(A, "a", { type: "tick" }) as TetrisState;
    B = tetris.applyMove(B, "a", { type: "tick" }) as TetrisState;
  }
  assert.deepEqual(A.boards.a.grid, B.boards.a.grid);
  assert.equal(A.boards.a.score, B.boards.a.score);
});

test("pieces move within bounds and respect collisions", () => {
  const grid = emptyGrid();
  const p: ActivePiece = { type: "O", rot: 0, row: 0, col: 4 };
  // Move left until it can't.
  let cur = p;
  let moves = 0;
  for (;;) {
    const m = tryMove(grid, cur, 0, -1);
    if (!m) break;
    cur = m;
    moves++;
    assert.ok(moves < 50, "should stop at wall");
  }
  // leftmost O occupies cols col+1,col+2 -> col can reach -1 so cells are 0,1
  assert.ok(pieceCells(cur).every(([, c]) => c >= 0));
  // place a block and confirm collision stops movement.
  const grid2 = emptyGrid();
  grid2[1][3] = "T";
  const piece: ActivePiece = { type: "O", rot: 0, row: 0, col: 1 }; // cells at rows0-1 cols2-3
  const blocked = tryMove(grid2, piece, 0, 1); // would move into col3 occupied at row1
  assert.equal(blocked, null);
});

test("rotation stays within bounds and never produces invalid positions", () => {
  const grid = emptyGrid();
  for (const type of ALL) {
    let p: ActivePiece = { type, rot: 0, row: 0, col: 3 };
    for (let r = 0; r < 8; r++) {
      const rotated = tryRotate(grid, p, "cw");
      if (rotated) {
        assert.ok(isValidPosition(grid, rotated), `${type} rotation must be valid`);
        p = rotated;
      }
    }
  }
});

test("hard drop locks the piece at the lowest legal position", () => {
  const s0 = tetris.initGame(players, { seed: 5 }) as TetrisState;
  const before = s0.boards.a.active!;
  // Compute expected landing manually.
  let cur = before;
  let dist = 0;
  for (;;) {
    const m = tryMove(s0.boards.a.grid, cur, 1, 0);
    if (!m) break;
    cur = m;
    dist++;
  }
  const landed = cur;
  const s1 = tetris.applyMove(s0, "a", { type: "hard" }) as TetrisState;
  // The piece is locked into the grid at the landed cells.
  for (const [r, c] of pieceCells(landed)) {
    if (r >= 0) assert.notEqual(s1.boards.a.grid[r][c], 0, "landed cells must be filled");
  }
  // A new active piece should have spawned.
  assert.ok(s1.boards.a.active);
  // hard drop scored dist*2.
  assert.ok(s1.boards.a.score >= dist * 2);
});

test("a completed row clears and rows above shift down", () => {
  const grid: Grid = emptyGrid();
  // Fill bottom row completely, put a marker block above it.
  for (let c = 0; c < WIDTH; c++) grid[HEIGHT - 1][c] = "G";
  grid[HEIGHT - 2][0] = "T";
  const cleared = clearLines(grid);
  assert.equal(cleared, 1);
  // The bottom row is now empty (the full row was removed)...
  // and the marker that was at row HEIGHT-2 shifted down to HEIGHT-1.
  assert.equal(grid[HEIGHT - 1][0], "T", "block above shifted down");
  // top row should be empty.
  assert.ok(grid[0].every((c) => c === 0));
});

// Build a state where player "a" is guaranteed to clear lines on next lock,
// then assert garbage is queued for "b" and applied on b's next lock.
test("clearing lines queues garbage for opponents, applied with a hole on next lock", () => {
  let s = tetris.initGame(players, { seed: 3 }) as TetrisState;
  const a = s.boards.a;
  // Manually set up board a: fill the bottom 4 rows except one column, then
  // drop an I piece vertically into that column to clear (set up a double).
  // Simpler: directly construct a near-clear and force a settle by locking.
  // Fill bottom two rows except column 0.
  for (let r = HEIGHT - 2; r < HEIGHT; r++) {
    for (let c = 1; c < WIDTH; c++) a.grid[r][c] = "G";
  }
  // Place an I piece vertical in column 0 about to lock: put active so that a
  // hard drop fills column 0 rows for the bottom -> clears 2 rows.
  a.active = { type: "I", rot: 1, row: HEIGHT - 4, col: 0 };
  // Vertical I (rot 1) occupies a single column. Find which column it lands in
  // and align it to column 0.
  // Ensure the vertical I's filled column is 0:
  const cells = pieceCells(a.active);
  const cols = new Set(cells.map(([, c]) => c));
  assert.equal(cols.size, 1, "vertical I occupies one column");
  const icol = [...cols][0];
  a.active.col += 0 - icol; // shift so it sits in column 0

  const before = s.boards.b.pendingGarbage;
  s = tetris.applyMove(s, "a", { type: "hard" }) as TetrisState;
  // Player a cleared 2 lines -> sends 1 garbage row to b.
  assert.equal(s.boards.b.pendingGarbage, before + 1, "double clear sends 1 garbage");
  assert.ok(s.boards.a.lines >= 2);

  // Now make b lock a piece -> garbage applies to bottom with a hole.
  const sBefore = s;
  s = tetris.applyMove(s, "b", { type: "hard" }) as TetrisState;
  assert.equal(s.boards.b.pendingGarbage, 0, "garbage consumed on lock");
  // Bottom row should be a garbage row with exactly one hole.
  const bottom = s.boards.b.grid[HEIGHT - 1];
  const holes = bottom.filter((c) => c === 0).length;
  // The bottom-most rows include the freshly added garbage. At least one row
  // has exactly one hole.
  let foundGarbageRow = false;
  for (let r = HEIGHT - 1; r >= 0; r--) {
    const row = s.boards.b.grid[r];
    const g = row.filter((c) => c === "G").length;
    const h = row.filter((c) => c === 0).length;
    if (g === WIDTH - 1 && h === 1) {
      foundGarbageRow = true;
      break;
    }
  }
  assert.ok(foundGarbageRow, "a garbage row with a single hole was added");
  assert.ok(sBefore !== s);
  void holes;
});

test("topping out eliminates a player and the last standing wins", () => {
  let s = tetris.initGame(players, { seed: 8 }) as TetrisState;
  // Fill player b's board to the top (leaving column 0 empty so no row clears)
  // so the next spawn fails.
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 1; c < WIDTH; c++) s.boards.b.grid[r][c] = "G";
  }
  // Force b's piece to lock -> spawn blocked -> topped out.
  s = tetris.applyMove(s, "b", { type: "hard" }) as TetrisState;
  assert.equal(s.boards.b.toppedOut, true, "b topped out");
  const over = tetris.isGameOver(s);
  assert.ok(over, "game is over when only one player remains");
  assert.deepEqual(over!.winners, ["a"], "a wins as last standing");
});

test("a player cannot move another player's board", () => {
  const s = tetris.initGame(players, { seed: 11 }) as TetrisState;
  // Move with explicit target of someone else's board -> rejected.
  const v = normalizeValidate(tetris.validateMove(s, "a", { type: "left", target: "b" }));
  assert.equal(v.ok, false, "cannot target another board");

  // applyMove for player a must never mutate b's board.
  const bBefore = JSON.stringify(s.boards.b);
  const s2 = tetris.applyMove(s, "a", { type: "hard" }) as TetrisState;
  assert.equal(JSON.stringify(s2.boards.b), bBefore, "a's move leaves b's board untouched");
});

test("validateMove rejects moves before start and from topped-out players", () => {
  const s = tetris.initGame(players, { seed: 2 }) as TetrisState;
  const notStarted = { ...s, started: false } as TetrisState;
  assert.equal(normalizeValidate(tetris.validateMove(notStarted, "a", { type: "tick" })).ok, false);

  const out = structuredClone(s);
  out.boards.a.toppedOut = true;
  assert.equal(normalizeValidate(tetris.validateMove(out, "a", { type: "left" })).ok, false);
});

test("public view hides falling piece; private view exposes it and right to act", () => {
  const s = tetris.initGame(players, { seed: 4 }) as TetrisState;
  const pub = tetris.getPlayerView(s, null) as any;
  assert.equal(pub.you, null);
  assert.equal(pub.active, null);
  assert.ok(Array.isArray(pub.players) && pub.players.length === 2);
  assert.ok(pub.players[0].grid && typeof pub.players[0].score === "number");

  const priv = tetris.getPlayerView(s, "a") as any;
  assert.equal(priv.you, "a");
  assert.ok(priv.active && priv.active.type);
  assert.equal(priv.canAct, true);
  assert.ok(priv.next);
});
