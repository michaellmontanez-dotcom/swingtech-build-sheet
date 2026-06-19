import assert from "node:assert/strict";
import test from "node:test";
import {
  battleship,
  randomFleet,
  validateFleet,
  FLEET,
  BOARD_SIZE,
  type BattleshipState,
  type Cell,
} from "@/games/battleship/logic";
import { mulberry32 } from "@/games/rng";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

// A simple legal fleet: each ship in its own row, all horizontal from col 0.
function simpleFleet(): { name: string; cells: Cell[] }[] {
  return FLEET.map((spec, row) => ({
    name: spec.name,
    cells: Array.from({ length: spec.size }, (_, i) => [row, i] as Cell),
  }));
}

// ---------------------------------------------------------------------------
// Placement validation
// ---------------------------------------------------------------------------
test("validateFleet accepts a legal fleet", () => {
  assert.equal(validateFleet(simpleFleet()), null);
});

test("validateFleet rejects overlapping ships", () => {
  const fleet = simpleFleet();
  // Move the Destroyer (size 2) onto the Carrier's row 0.
  fleet[4].cells = [
    [0, 0],
    [0, 1],
  ];
  assert.notEqual(validateFleet(fleet), null);
});

test("validateFleet rejects out-of-bounds ships", () => {
  const fleet = simpleFleet();
  fleet[0].cells = [
    [0, 8],
    [0, 9],
    [0, 10], // off the board
    [0, 11],
    [0, 12],
  ];
  assert.notEqual(validateFleet(fleet), null);
});

test("validateFleet rejects a ship of the wrong size", () => {
  const fleet = simpleFleet();
  fleet[0].cells = [
    [0, 0],
    [0, 1],
    [0, 2], // Carrier should be 5, this is 3
  ];
  assert.notEqual(validateFleet(fleet), null);
});

test("validateFleet rejects a non-contiguous / diagonal ship", () => {
  const fleet = simpleFleet();
  fleet[2].cells = [
    [2, 0],
    [3, 1],
    [4, 2], // diagonal
  ];
  assert.notEqual(validateFleet(fleet), null);
});

test("validateFleet rejects an incomplete fleet", () => {
  const fleet = simpleFleet().slice(0, 4);
  assert.notEqual(validateFleet(fleet), null);
});

// ---------------------------------------------------------------------------
// Autoplace / randomFleet
// ---------------------------------------------------------------------------
test("randomFleet produces a legal, non-overlapping fleet of the right sizes", () => {
  for (let seed = 0; seed < 50; seed++) {
    const fleet = randomFleet(mulberry32(seed));
    assert.equal(validateFleet(fleet), null, `seed ${seed} should be legal`);
    // sizes match spec
    for (const spec of FLEET) {
      const ship = fleet.find((f) => f.name === spec.name)!;
      assert.equal(ship.cells.length, spec.size);
    }
  }
});

test("autoplace move is deterministic for a given state seed", () => {
  const s1 = battleship.initGame(players, { seed: 99 });
  const s2 = battleship.initGame(players, { seed: 99 });
  const after1 = battleship.applyMove(s1, "a", { type: "autoplace" });
  const after2 = battleship.applyMove(s2, "a", { type: "autoplace" });
  assert.deepEqual(after1.boards.a.ships, after2.boards.a.ships);
});

// ---------------------------------------------------------------------------
// SECURITY: no opponent un-hit ship cells may ever leak into a projection.
// ---------------------------------------------------------------------------
function placeBoth(seed = 1): BattleshipState {
  let s = battleship.initGame(players, { seed });
  s = battleship.applyMove(s, "a", { type: "place", ships: simpleFleet() });
  s = battleship.applyMove(s, "b", { type: "autoplace" });
  return s;
}

// Recursively collect every [r,c] pair found anywhere in a projection that
// could plausibly be a leaked coordinate.
function collectCoordKeys(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) {
    // Is this a [number, number] coordinate pair?
    if (
      node.length === 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number" &&
      Number.isInteger(node[0]) &&
      Number.isInteger(node[1])
    ) {
      out.add(`${node[0]},${node[1]}`);
    }
    for (const child of node) collectCoordKeys(child, out);
  } else if (node && typeof node === "object") {
    for (const val of Object.values(node)) collectCoordKeys(val, out);
  }
}

function unhitCellKeys(state: BattleshipState, playerId: string): Set<string> {
  const set = new Set<string>();
  for (const ship of state.boards[playerId].ships) {
    ship.cells.forEach(([r, c], i) => {
      if (!ship.hits[i]) set.add(`${r},${c}`);
    });
  }
  return set;
}

test("SECURITY: spectator view never leaks any un-hit ship cell", () => {
  const s = placeBoth();
  const pub = battleship.getPlayerView(s, null);
  const leaked = new Set<string>();
  collectCoordKeys(pub, leaked);
  for (const owner of ["a", "b"]) {
    for (const cellKey of unhitCellKeys(s, owner)) {
      assert.ok(
        !leaked.has(cellKey),
        `spectator view leaked un-hit cell ${cellKey} of player ${owner}`
      );
    }
  }
});

test("SECURITY: opponent's view never leaks my un-hit ship cells", () => {
  let s = placeBoth();
  // Fire a couple of shots so there are hit markers in play too.
  s = battleship.applyMove(s, "a", { type: "fire", r: 0, c: 0 }); // a fires at b
  // b's view must not expose a's un-hit ships. We exclude b's OWN board
  // (`myBoard`), which legitimately contains b's own cells — those may
  // coincidentally share coordinates with a's secret cells, but that is b's
  // own information, not a leak of a's fleet.
  const bView = battleship.getPlayerView(s, "b") as any;
  const { myBoard, ...rest } = bView;
  assert.ok(myBoard, "b should have their own board");
  assert.equal(myBoard.playerId, "b", "myBoard must be b's own board");
  const leaked = new Set<string>();
  collectCoordKeys(rest, leaked); // scan everything about the OPPONENT / public
  for (const cellKey of unhitCellKeys(s, "a")) {
    assert.ok(!leaked.has(cellKey), `opponent (b) view leaked a's un-hit cell ${cellKey}`);
  }
});

test("SECURITY: a player DOES see their own full fleet, but opponent board is redacted", () => {
  const s = placeBoth();
  const aView = battleship.getPlayerView(s, "a") as any;
  // own board reveals all of a's ship cells
  const ownKeys = new Set<string>();
  for (const ship of aView.myBoard.ownShips) for (const [r, c] of ship.cells) ownKeys.add(`${r},${c}`);
  for (const ship of s.boards.a.ships) for (const [r, c] of ship.cells) {
    assert.ok(ownKeys.has(`${r},${c}`), "own fleet should be fully visible to its owner");
  }
  // opponent board exposes no un-hit ship cells (redacted summaries only)
  for (const summary of aView.opponentBoard.ships) {
    assert.equal(summary.cells, null, "un-sunk opponent ships must not expose cells");
  }
});

// ---------------------------------------------------------------------------
// Firing mechanics: hits, misses, sinking, winning
// ---------------------------------------------------------------------------
test("firing records hits and misses; sinks a ship when fully hit", () => {
  let s = placeBoth();
  // a fires at b? we need a deterministic target. Instead test a's board being
  // fired at by b (a uses the simple fleet, known coords).
  // It's b's turn? seat 0 (a) fires first. Let a miss far away.
  assert.equal(activePlayer(s.turn), "a");
  // a fires somewhere on b's board (miss or hit, just exercise the path)
  s = battleship.applyMove(s, "a", { type: "fire", r: 9, c: 9 });
  assert.equal(activePlayer(s.turn), "b", "turn passes after a shot");

  // Now b sinks a's Destroyer (row 4, cols 0-1) over two turns.
  s = battleship.applyMove(s, "b", { type: "fire", r: 4, c: 0 });
  let aBoard = s.boards.a;
  const destroyer = aBoard.ships.find((sh) => sh.name === "Destroyer")!;
  assert.ok(destroyer.hits[0], "first destroyer cell hit");
  assert.ok(!destroyer.hits.every(Boolean), "destroyer not yet sunk");
  // a's turn now; a fires a throwaway, then b finishes the destroyer.
  s = battleship.applyMove(s, "a", { type: "fire", r: 8, c: 8 });
  s = battleship.applyMove(s, "b", { type: "fire", r: 4, c: 1 });
  aBoard = s.boards.a;
  const sunkDestroyer = aBoard.ships.find((sh) => sh.name === "Destroyer")!;
  assert.ok(sunkDestroyer.hits.every(Boolean), "destroyer fully hit -> sunk");
  // The shot is recorded as a hit on a's board.
  assert.ok(aBoard.shots.some((shot) => shot.r === 4 && shot.c === 1 && shot.hit));
});

test("a player wins when all 5 opponent ships are sunk", () => {
  let s = placeBoth();
  // b will sink a's entire (known) fleet. a takes harmless shots in between.
  const targets: Cell[] = [];
  for (const ship of s.boards.a.ships) for (const cell of ship.cells) targets.push(cell);

  let aFiller = 0;
  for (const [r, c] of targets) {
    // a's filler shot first (a is seat 0 and fires first each round)
    if (s.finished) break;
    if (activePlayer(s.turn) === "a") {
      // pick an empty filler cell in the bottom-right that isn't a target
      const fr = 9;
      const fc = 9 - (aFiller % 5);
      aFiller++;
      const already = s.boards.b.shots.some((sh) => sh.r === fr && sh.c === fc);
      s = battleship.applyMove(s, "a", { type: "fire", r: fr, c: already ? fc - 1 : fc });
    }
    if (s.finished) break;
    s = battleship.applyMove(s, "b", { type: "fire", r, c });
  }

  assert.ok(s.finished, "game should be finished");
  const winner = battleship.isGameOver(s);
  assert.ok(winner, "isGameOver returns a winner");
  assert.deepEqual(winner!.winners, ["b"]);
  assert.ok(typeof winner!.reason === "string" && winner!.reason.length > 0);
});

// ---------------------------------------------------------------------------
// Illegal moves
// ---------------------------------------------------------------------------
test("rejects firing before both players are ready", () => {
  let s = battleship.initGame(players, { seed: 5 });
  s = battleship.applyMove(s, "a", { type: "place", ships: simpleFleet() });
  // b not ready yet -> still placement phase
  const v = normalizeValidate(battleship.validateMove(s, "a", { type: "fire", r: 0, c: 0 }));
  assert.equal(v.ok, false);
});

test("rejects firing out of turn", () => {
  const s = placeBoth();
  assert.equal(activePlayer(s.turn), "a");
  const v = normalizeValidate(battleship.validateMove(s, "b", { type: "fire", r: 0, c: 0 }));
  assert.equal(v.ok, false);
});

test("rejects firing the same cell twice", () => {
  let s = placeBoth();
  s = battleship.applyMove(s, "a", { type: "fire", r: 5, c: 5 });
  // back to a after a full round
  s = battleship.applyMove(s, "b", { type: "fire", r: 0, c: 0 });
  const v = normalizeValidate(battleship.validateMove(s, "a", { type: "fire", r: 5, c: 5 }));
  assert.equal(v.ok, false);
});

test("rejects an out-of-bounds shot", () => {
  const s = placeBoth();
  const v = normalizeValidate(battleship.validateMove(s, "a", { type: "fire", r: 10, c: 0 }));
  assert.equal(v.ok, false);
});

test("rejects placing a fleet after already ready", () => {
  let s = placeBoth();
  const v = normalizeValidate(battleship.validateMove(s, "a", { type: "place", ships: simpleFleet() }));
  assert.equal(v.ok, false);
});

test("placement validation rejects an illegal fleet via the module", () => {
  const s = battleship.initGame(players, { seed: 3 });
  const bad = simpleFleet();
  bad[4].cells = [
    [0, 0],
    [0, 1],
  ]; // overlap with Carrier
  const v = normalizeValidate(battleship.validateMove(s, "a", { type: "place", ships: bad }));
  assert.equal(v.ok, false);
});
