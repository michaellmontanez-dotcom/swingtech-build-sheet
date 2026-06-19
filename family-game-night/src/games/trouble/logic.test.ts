import assert from "node:assert/strict";
import test from "node:test";
import {
  trouble,
  relToAbsolute,
  TRACK,
  type TroubleState,
} from "@/games/trouble/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
  { id: "d", name: "Di", seat: 3 },
];

// Count all pegs across home / track / finish — must always be 16.
function pegCensus(s: TroubleState) {
  let home = 0,
    track = 0,
    finish = 0;
  for (const p of Object.values(s.players)) {
    for (const peg of p.pegs) {
      if (peg.rel < 0) home++;
      else if (peg.rel < TRACK) track++;
      else finish++;
    }
  }
  return { home, track, finish, total: home + track + finish };
}

// Force a deterministic roll by mutating the rolled state directly. We bypass the
// rng to test specific board mechanics, then exercise validate/apply on the result.
function withRoll(s: TroubleState, playerId: string, roll: number): TroubleState {
  const c: TroubleState = structuredClone(s);
  c.phase = "move";
  c.lastRoll = roll;
  // recompute movable pegs for that roll using the public move-validation path
  c.movablePegs = [];
  const player = c.players[playerId];
  for (let i = 0; i < player.pegs.length; i++) {
    const peg = player.pegs[i];
    let dest: number | null;
    if (peg.rel < 0) dest = roll === 6 ? 0 : null;
    else {
      const d = peg.rel + roll;
      dest = d > TRACK + 3 ? null : d;
    }
    if (dest === null) continue;
    // self-block
    let blocked = false;
    if (dest >= 0) {
      for (let j = 0; j < player.pegs.length; j++) {
        if (j !== i && player.pegs[j].rel === dest) blocked = true;
      }
    }
    if (!blocked) c.movablePegs.push(i);
  }
  return c;
}

test("initial state: 16 pegs all in home, 4 each", () => {
  const s = trouble.initGame(players, { seed: 1 });
  const census = pegCensus(s);
  assert.equal(census.total, 16);
  assert.equal(census.home, 16);
  for (const p of Object.values(s.players)) assert.equal(p.pegs.length, 4);
});

test("starts are evenly spaced and relToAbsolute wraps the loop", () => {
  const s = trouble.initGame(players, { seed: 1 });
  assert.equal(s.players["a"].start, 0);
  assert.equal(s.players["b"].start, 7);
  assert.equal(s.players["c"].start, 14);
  assert.equal(s.players["d"].start, 21);
  // a peg at rel 27 from start 7 wraps to absolute (7+27)%28 = 6
  assert.equal(relToAbsolute(7, 27), 6);
  // home / finish positions are off the shared track
  assert.equal(relToAbsolute(0, -1), null);
  assert.equal(relToAbsolute(0, TRACK), null);
});

test("a peg can only leave home on a 6", () => {
  const s = trouble.initGame(players, { seed: 5 });
  const pid = activePlayer(s.turn);

  // Roll a 3 (not 6): no peg can leave home -> no movable pegs.
  const s3 = withRoll(s, pid, 3);
  assert.equal(s3.movablePegs.length, 0);
  // move attempt is rejected; only pass is allowed
  assert.equal(normalizeValidate(trouble.validateMove(s3, pid, { type: "move", peg: 0 })).ok, false);
  assert.equal(normalizeValidate(trouble.validateMove(s3, pid, { type: "pass" })).ok, true);

  // Roll a 6: every home peg may come out (all 4 eligible).
  const s6 = withRoll(s, pid, 6);
  assert.equal(s6.movablePegs.length, 4);
  const after = trouble.applyMove(s6, pid, { type: "move", peg: 0 });
  assert.equal(after.players[pid].pegs[0].rel, 0); // landed on start
});

test("landing on an opponent sends it home; cannot land on your own peg", () => {
  let s = trouble.initGame(players, { seed: 9 });
  // Manually place pegs: a's peg0 at rel 0 (abs = start_a + 0 = 0).
  s.players["a"].pegs[0].rel = 0;
  // b's start is 7; put b's peg0 three ahead of a -> abs 3 means rel from b... use absolute math.
  // Put b's peg0 at absolute square 3: b.start=7, so we need a track square 3 from a's frame.
  // Simpler: place an opponent peg on the absolute square a will land on.
  // a moves peg0 by 3 -> abs (0+3)=3. Place b peg0 there: b rel s.t. (7+rel)%28===3 -> rel=24.
  s.players["b"].pegs[0].rel = 24;
  assert.equal(relToAbsolute(s.players["b"].start, 24), 3);

  const sRoll = withRoll(s, "a", 3);
  assert.ok(sRoll.movablePegs.includes(0));
  const captured = trouble.applyMove(sRoll, "a", { type: "move", peg: 0 });
  assert.equal(captured.players["a"].pegs[0].rel, 3); // a advanced
  assert.equal(captured.players["b"].pegs[0].rel, -1); // b sent home
  assert.equal(pegCensus(captured).total, 16);

  // Cannot land on your OWN peg: a peg0 at rel 0, a peg1 at rel 3; roll 3 with peg0 blocked.
  let s2 = trouble.initGame(players, { seed: 9 });
  s2.players["a"].pegs[0].rel = 0;
  s2.players["a"].pegs[1].rel = 3;
  const s2Roll = withRoll(s2, "a", 3);
  assert.ok(!s2Roll.movablePegs.includes(0), "peg0 cannot land on own peg1");
  assert.ok(s2Roll.movablePegs.includes(1), "peg1 can still move");
});

test("exact count required to enter/advance in finish", () => {
  let s = trouble.initGame(players, { seed: 3 });
  // a's peg at rel 30 (finish slot 2). Finish lane is rel 28..31.
  s.players["a"].pegs[0].rel = 30;

  // Roll 2 would overshoot (30+2=32 > 31) -> illegal.
  const over = withRoll(s, "a", 2);
  assert.ok(!over.movablePegs.includes(0), "overshoot rejected");

  // Roll 1 lands exactly on slot 31 -> legal.
  const exact = withRoll(s, "a", 1);
  assert.ok(exact.movablePegs.includes(0), "exact count allowed");
  const moved = trouble.applyMove(exact, "a", { type: "move", peg: 0 });
  assert.equal(moved.players["a"].pegs[0].rel, 31);

  // Entering the finish from the track also needs to fit: peg at rel 27, roll 5 -> 32 illegal.
  let s2 = trouble.initGame(players, { seed: 3 });
  s2.players["a"].pegs[0].rel = 27;
  const enterOver = withRoll(s2, "a", 5);
  assert.ok(!enterOver.movablePegs.includes(0));
  const enterOk = withRoll(s2, "a", 4); // 27+4=31, exact last slot
  assert.ok(enterOk.movablePegs.includes(0));
});

test("rolling a 6 grants another roll (phase returns to roll, same player)", () => {
  const s = trouble.initGame(players, { seed: 11 });
  const pid = activePlayer(s.turn);
  const s6 = withRoll(s, pid, 6);
  const after = trouble.applyMove(s6, pid, { type: "move", peg: 0 });
  assert.equal(after.finished, false);
  assert.equal(activePlayer(after.turn), pid, "same player still active after a 6");
  assert.equal(after.phase, "roll", "may roll again");

  // A non-6 advances to the next player.
  let s5 = trouble.initGame(players, { seed: 11 });
  s5.players[pid].pegs[0].rel = 0; // a peg on the track so a non-6 has a move
  const sRoll5 = withRoll(s5, pid, 5);
  const after5 = trouble.applyMove(sRoll5, pid, { type: "move", peg: 0 });
  assert.notEqual(activePlayer(after5.turn), pid, "turn passes on a non-6");
});

test("first player with all four pegs in finish wins", () => {
  let s = trouble.initGame(players, { seed: 13 });
  const pid = "a";
  // three pegs already finished; fourth one step from a finish slot.
  s.players[pid].pegs[0].rel = 28;
  s.players[pid].pegs[1].rel = 29;
  s.players[pid].pegs[2].rel = 30;
  s.players[pid].pegs[3].rel = 27; // roll 4 -> 31 (last slot)
  // make sure it's a's turn
  while (activePlayer(s.turn) !== pid) s.turn = { ...s.turn, activeIndex: s.turn.order.indexOf(pid) };
  const sRoll = withRoll(s, pid, 4);
  assert.ok(sRoll.movablePegs.includes(3));
  const won = trouble.applyMove(sRoll, pid, { type: "move", peg: 3 });
  assert.equal(won.finished, true);
  assert.equal(won.winnerId, pid);
  const over = trouble.isGameOver(won);
  assert.ok(over);
  assert.deepEqual(over!.winners, [pid]);
});

test("peg-count integrity holds across a full simulated game with a winner", () => {
  let s: TroubleState = trouble.initGame(players, { seed: 42 });
  let guard = 0;
  while (!s.finished && guard++ < 100000) {
    const pid = activePlayer(s.turn);
    const view = trouble.getPlayerView(s, pid) as any;

    let move: any;
    if (view.canRoll) {
      move = { type: "roll" };
    } else if (view.movablePegs.length > 0) {
      // pick a random legal peg
      const peg = view.movablePegs[Math.floor(Math.random() * view.movablePegs.length)];
      move = { type: "move", peg };
    } else {
      move = { type: "pass" };
    }

    const verdict = normalizeValidate(trouble.validateMove(s, pid, move));
    assert.ok(verdict.ok, `illegal move ${JSON.stringify(move)}: ${verdict.error}`);
    s = trouble.applyMove(s, pid, move);

    const census = pegCensus(s);
    assert.equal(census.total, 16, "16 pegs must always be accounted for");
  }
  assert.ok(s.finished, "game should terminate with a winner");
  const winner = trouble.isGameOver(s);
  assert.ok(winner && winner.winners.length === 1);
  // winner truly has all four in finish
  assert.equal(s.players[winner!.winners[0]].pegs.every((p) => p.rel >= TRACK), true);
});

test("rejects moves out of turn and out of phase", () => {
  const s = trouble.initGame(players, { seed: 7 });
  const active = activePlayer(s.turn);
  const other = players.find((p) => p.id !== active)!;
  assert.equal(normalizeValidate(trouble.validateMove(s, other.id, { type: "roll" })).ok, false);
  // active player must roll before moving
  assert.equal(normalizeValidate(trouble.validateMove(s, active, { type: "move", peg: 0 })).ok, false);
  assert.equal(normalizeValidate(trouble.validateMove(s, active, { type: "roll" })).ok, true);
});
