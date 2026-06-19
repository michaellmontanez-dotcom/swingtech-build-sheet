import assert from "node:assert/strict";
import test from "node:test";
import {
  sorry,
  legalOptions,
  computeTarget,
  startExit,
  homeEntry,
  TRACK_LEN,
  PAWNS_PER_PLAYER,
  type SorryState,
  type SorryCard,
  type PawnPos,
} from "@/games/sorry/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
];

function fresh(seed = 1): SorryState {
  return sorry.initGame(players, { seed });
}

// Force a specific drawn card (value) into the active player's hand for testing.
function setDrawn(s: SorryState, value: SorryCard["value"]): SorryState {
  return { ...s, drawn: { id: "test", value }, drawAgain: value === 2 };
}

function pawnsHomeCount(s: SorryState, pid: string): number {
  return s.pawns[pid].filter((p) => p.zone === "home").length;
}

function totalPawns(s: SorryState, pid: string): number {
  return s.pawns[pid].length;
}

test("init: 4 pawns per player, all in START, 45-card deck", () => {
  const s = fresh();
  assert.equal(s.deck.length, 45);
  for (const p of players) {
    assert.equal(s.pawns[p.id].length, PAWNS_PER_PLAYER);
    assert.ok(s.pawns[p.id].every((pos) => pos.zone === "start"));
  }
});

test("only a 1 or 2 moves a pawn out of START", () => {
  const s = fresh();
  const pid = activePlayer(s.turn);
  for (const v of [3, 4, 5, 7, 8, 10, 11, 12] as const) {
    const st = setDrawn(s, v);
    const opts = legalOptions(st, pid);
    assert.ok(
      !opts.some((o) => o.kind === "out"),
      `card ${v} must not move a pawn out of START`
    );
  }
  for (const v of [1, 2] as const) {
    const st = setDrawn(s, v);
    const opts = legalOptions(st, pid);
    assert.ok(opts.some((o) => o.kind === "out"), `card ${v} should allow moving out`);
  }
  // Sorry! from all-START has no opponents on track => no options
  assert.equal(legalOptions(setDrawn(s, "sorry"), pid).length, 0);
});

test("forward move works", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  const exit = startExit(s.colorOf[pid]);
  // place one pawn on the track at its exit, others stay in start
  s.pawns[pid][0] = { zone: "track", pos: exit };
  s = setDrawn(s, 5);
  const opts = legalOptions(s, pid);
  const fwd = opts.find((o) => o.kind === "forward" && o.pawn === 0);
  assert.ok(fwd, "forward option should exist");
  const next = sorry.applyMove(s, pid, { type: "play", ...fwd! });
  const pos = next.pawns[pid][0] as Extract<PawnPos, { zone: "track" }>;
  assert.equal(pos.zone, "track");
  assert.equal(pos.pos, (exit + 5) % TRACK_LEN);
});

test("4 moves a pawn backward four", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  const startAt = 30;
  s.pawns[pid][0] = { zone: "track", pos: startAt };
  s = setDrawn(s, 4);
  const opts = legalOptions(s, pid);
  const back = opts.find((o) => o.kind === "backward" && o.pawn === 0);
  assert.ok(back, "backward option should exist for a 4");
  const next = sorry.applyMove(s, pid, { type: "play", ...back! });
  const pos = next.pawns[pid][0] as Extract<PawnPos, { zone: "track" }>;
  assert.equal(pos.pos, ((startAt - 4) % TRACK_LEN + TRACK_LEN) % TRACK_LEN);
});

test("7 can be split between two pawns totaling 7", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  s.pawns[pid][0] = { zone: "track", pos: 20 };
  s.pawns[pid][1] = { zone: "track", pos: 40 };
  s = setDrawn(s, 7);
  const opts = legalOptions(s, pid);
  const splits = opts.filter((o) => o.kind === "split7");
  assert.ok(splits.length > 0, "split options should exist");
  for (const sp of splits) {
    assert.equal(sp.amtA! + sp.amtB!, 7, "split amounts must total 7");
  }
  // apply a 3/4 split
  const split = splits.find((o) => o.amtA === 3 && o.amtB === 4)!;
  assert.ok(split);
  const next = sorry.applyMove(s, pid, { type: "play", ...split });
  const p0 = next.pawns[pid][split.pawnA!] as Extract<PawnPos, { zone: "track" }>;
  const p1 = next.pawns[pid][split.pawnB!] as Extract<PawnPos, { zone: "track" }>;
  const a0 = split.pawnA === 0 ? 20 : 40;
  const a1 = split.pawnB === 0 ? 20 : 40;
  assert.equal(p0.pos, (a0 + 3) % TRACK_LEN);
  assert.equal(p1.pos, (a1 + 4) % TRACK_LEN);
});

test("11 swap exchanges positions with an opponent", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  const opp = players.find((p) => p.id !== pid)!.id;
  s.pawns[pid][0] = { zone: "track", pos: 12 };
  s.pawns[opp][0] = { zone: "track", pos: 33 };
  s = setDrawn(s, 11);
  const opts = legalOptions(s, pid);
  const swap = opts.find((o) => o.kind === "swap11" && o.targetPlayer === opp);
  assert.ok(swap, "an 11-swap option should exist");
  const next = sorry.applyMove(s, pid, { type: "play", ...swap! });
  const mine = next.pawns[pid][0] as Extract<PawnPos, { zone: "track" }>;
  const theirs = next.pawns[opp][0] as Extract<PawnPos, { zone: "track" }>;
  // pawns exchanged positions (slides may further move ours; assert opponent
  // got our original square, which had no slide-start at 12... verify directly)
  assert.equal(theirs.pos, 12);
  // our pawn went to where theirs was (33) unless a slide diverted it; 33 has
  // no slide start in this geometry
  assert.equal(mine.pos, 33);
});

test("Sorry! card bumps an opponent pawn back to START", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  const opp = players.find((p) => p.id !== pid)!.id;
  // we must have a pawn in START (default) and an opponent on the track
  const target = 25;
  s.pawns[opp][0] = { zone: "track", pos: target };
  s = setDrawn(s, "sorry");
  const opts = legalOptions(s, pid);
  const sorryOpt = opts.find((o) => o.kind === "sorry" && o.targetPlayer === opp);
  assert.ok(sorryOpt, "a Sorry! option should exist");
  const next = sorry.applyMove(s, pid, { type: "play", ...sorryOpt! });
  // opponent bumped home
  assert.equal(next.pawns[opp][0].zone, "start");
  // our pawn now occupies the target square
  const mine = next.pawns[pid][sorryOpt!.pawn!] as Extract<PawnPos, { zone: "track" }>;
  assert.equal(mine.pos, target);
});

test("landing on an opponent bumps them home", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  const opp = players.find((p) => p.id !== pid)!.id;
  s.pawns[pid][0] = { zone: "track", pos: 20 };
  s.pawns[opp][0] = { zone: "track", pos: 23 };
  s = setDrawn(s, 3);
  const opts = legalOptions(s, pid);
  const fwd = opts.find((o) => o.kind === "forward" && o.pawn === 0)!;
  const next = sorry.applyMove(s, pid, { type: "play", ...fwd });
  assert.equal(next.pawns[opp][0].zone, "start", "bumped opponent goes to START");
  const mine = next.pawns[pid][0] as Extract<PawnPos, { zone: "track" }>;
  assert.equal(mine.pos, 23);
});

test("win requires all 4 pawns home", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  // 3 pawns home, one pawn one step from home in safety
  s.pawns[pid][0] = { zone: "home" };
  s.pawns[pid][1] = { zone: "home" };
  s.pawns[pid][2] = { zone: "home" };
  s.pawns[pid][3] = { zone: "safety", pos: 3 }; // needs exactly 2 to reach home
  // not over yet
  assert.equal(sorry.isGameOver(s), null);
  // move the last pawn home with an exact 2
  s = setDrawn(s, 2);
  const opts = legalOptions(s, pid);
  const win = opts.find(
    (o) => o.kind === "forward" && o.pawn === 3 && o.steps === 2
  )!;
  assert.ok(win, "exact-count move into home should exist");
  const next = sorry.applyMove(s, pid, { type: "play", ...win });
  assert.equal(next.pawns[pid][3].zone, "home");
  assert.equal(pawnsHomeCount(next, pid), 4);
  const over = sorry.isGameOver(next);
  assert.ok(over && over.winners.length === 1 && over.winners[0] === pid);
});

test("overshooting HOME is illegal (no option)", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  s.pawns[pid][0] = { zone: "safety", pos: 3 }; // needs exactly 2 to home
  s = setDrawn(s, 5); // would overshoot
  const opts = legalOptions(s, pid).filter((o) => o.pawn === 0);
  assert.equal(opts.length, 0, "cannot overshoot home with a 5 from safety[3]");
});

test("computeTarget: forward into safety and exact home", () => {
  const color = 0;
  const entry = homeEntry(color);
  // a pawn ON homeEntry moving forward 1 -> safety[0]
  const r1 = computeTarget({ zone: "track", pos: entry }, color, 1);
  assert.deepEqual(r1, { zone: "safety", pos: 0 });
  // moving forward 6 from homeEntry -> exact home (1 to safety[0]..safety[4], 6th into home)
  const r2 = computeTarget({ zone: "track", pos: entry }, color, 6);
  assert.deepEqual(r2, { zone: "home" });
  // forward 7 from homeEntry overshoots -> null
  const r3 = computeTarget({ zone: "track", pos: entry }, color, 7);
  assert.equal(r3, null);
});

test("validateMove enforces two-step flow & forfeit", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  // can't play before drawing
  assert.equal(
    normalizeValidate(sorry.validateMove(s, pid, { type: "play", kind: "out", pawn: 0 })).ok,
    false
  );
  // wrong player can't draw
  const other = players.find((p) => p.id !== pid)!.id;
  assert.equal(normalizeValidate(sorry.validateMove(s, other, { type: "draw" })).ok, false);
  // draw is legal for active
  assert.ok(normalizeValidate(sorry.validateMove(s, pid, { type: "draw" })).ok);
});

test("a full simulated game terminates with a winner and pawn integrity holds", () => {
  let s = fresh(12345);
  let guard = 0;
  while (!s.finished && guard++ < 100000) {
    const pid = activePlayer(s.turn);
    if (!s.drawn) {
      s = sorry.applyMove(s, pid, { type: "draw" });
      // drawing may auto-forfeit (advancing the turn) — loop again
      // integrity check
      for (const p of players) assert.equal(totalPawns(s, p.id), PAWNS_PER_PLAYER);
      continue;
    }
    const view = sorry.getPlayerView(s, pid) as any;
    const opts = view.options as any[];
    if (opts.length === 0) {
      // no legal move: forfeit (drawing should already have handled this, but
      // be defensive)
      s = sorry.applyMove(s, pid, { type: "forfeit" });
    } else {
      // pick a move that makes progress: prefer moving toward home; just take
      // the first legal option (deterministic)
      const opt = opts[0];
      const v = normalizeValidate(sorry.validateMove(s, pid, { type: "play", ...opt }));
      assert.ok(v.ok, `chosen play must be legal: ${v.error}`);
      s = sorry.applyMove(s, pid, { type: "play", ...opt });
    }
    // pawn-count integrity after every action
    for (const p of players) assert.equal(totalPawns(s, p.id), PAWNS_PER_PLAYER);
  }
  assert.ok(s.finished, "game should terminate with a winner");
  const winner = sorry.isGameOver(s);
  assert.ok(winner && winner.winners.length === 1);
  // winner truly has all 4 home
  assert.equal(pawnsHomeCount(s, winner!.winners[0]), 4);
});

test("public and player views both expose the drawn card", () => {
  let s = fresh();
  const pid = activePlayer(s.turn);
  s = setDrawn(s, 7);
  const pub = sorry.getPlayerView(s, null) as any;
  const priv = sorry.getPlayerView(s, pid) as any;
  assert.ok(pub.drawn && pub.drawn.value === 7);
  assert.ok(priv.drawn && priv.drawn.value === 7);
  assert.equal(priv.you, pid);
  assert.ok(Array.isArray(priv.options));
});
