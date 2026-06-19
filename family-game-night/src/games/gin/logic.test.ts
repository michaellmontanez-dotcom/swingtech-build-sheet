import assert from "node:assert/strict";
import test from "node:test";
import {
  gin,
  bestMelds,
  deadwoodValue,
  layOffDeadwood,
  type GinState,
  type Card,
  type Suit,
  type Rank,
} from "@/games/gin/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

function C(suit: Suit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank };
}

function totalCards(s: GinState): number {
  return s.stock.length + s.discard.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0);
}

test("deck deals 10 each, flips one discard, and conserves 52 cards", () => {
  const s = gin.initGame(players, { seed: 1 });
  assert.equal(s.hands["a"].length, 10);
  assert.equal(s.hands["b"].length, 10);
  assert.equal(s.discard.length, 1);
  assert.equal(totalCards(s), 52);
  // every card unique
  const ids = new Set<string>();
  for (const h of Object.values(s.hands)) for (const c of h) ids.add(c.id);
  for (const c of s.stock) ids.add(c.id);
  for (const c of s.discard) ids.add(c.id);
  assert.equal(ids.size, 52);
});

test("only 2 players allowed", () => {
  assert.throws(() => gin.initGame([...players, { id: "c", name: "Cy", seat: 2 }], { seed: 1 }));
});

test("deadwood minimizer: run + set computes correct deadwood", () => {
  // run 4-5-6 hearts, set of 9s (3), leftovers: K spade (10), 2 club (2)
  const hand: Card[] = [
    C("H", 4), C("H", 5), C("H", 6),
    C("S", 9), C("H", 9), C("D", 9),
    C("S", 13), C("C", 2),
  ];
  const g = bestMelds(hand);
  assert.equal(g.melds.length, 2);
  // deadwood = K(10) + 2(2) = 12
  assert.equal(g.deadwoodValue, 12);
});

test("a card usable in run OR set is assigned to minimize deadwood", () => {
  // 7H 8H 9H run; also 9S 9D — the 9H could complete the set, but using it in the
  // run keeps 7H+8H melded. Best: run 7-8-9H (melds 7+8+9) and 9S/9D leftover (18),
  // OR set 9H9S9D melded + 7H8H deadwood (15). Optimal keeps deadwood low.
  const hand: Card[] = [
    C("H", 7), C("H", 8), C("H", 9),
    C("S", 9), C("D", 9),
  ];
  // Option A: run 7-8-9H melds 24, deadwood = 9+9 = 18
  // Option B: set 9H9S9D melds 27, deadwood = 7+8 = 15  -> better
  const g = bestMelds(hand);
  assert.equal(g.deadwoodValue, 15);
  // verify chosen melds cover the set, not the run
  const meldedIds = new Set(g.melds.flat().map((c) => c.id));
  assert.ok(meldedIds.has("S9") && meldedIds.has("D9") && meldedIds.has("H9"));
});

test("deadwoodValue matches a fully-melded gin hand (0)", () => {
  // 10 cards, all melded: 1-2-3-4 spades run, 5-6-7 hearts run, 8s set
  const hand: Card[] = [
    C("S", 1), C("S", 2), C("S", 3), C("S", 4),
    C("H", 5), C("H", 6), C("H", 7),
    C("S", 8), C("H", 8), C("D", 8),
  ];
  assert.equal(deadwoodValue(hand), 0);
});

test("aces are low (no wraparound run Q-K-A)", () => {
  const hand: Card[] = [C("S", 12), C("S", 13), C("S", 1)];
  const g = bestMelds(hand);
  assert.equal(g.melds.length, 0);
  assert.equal(g.deadwoodValue, 10 + 10 + 1);
});

test("layoff: opponent extends knocker's run and set", () => {
  const knockerMelds: Card[][] = [
    [C("H", 4), C("H", 5), C("H", 6)], // run
    [C("S", 9), C("H", 9), C("D", 9)], // set
  ];
  // deadwood: 7H extends run (off), 9C extends set (off), KS stays
  const deadwood: Card[] = [C("H", 7), C("C", 9), C("S", 13)];
  const residual = layOffDeadwood(deadwood, knockerMelds);
  assert.equal(residual, 10); // only the King remains
});

test("validate: cannot discard before drawing", () => {
  const s = gin.initGame(players, { seed: 5 });
  const pid = activePlayer(s.turn);
  const card = s.hands[pid][0];
  const v = normalizeValidate(gin.validateMove(s, pid, { type: "discard", card }));
  assert.equal(v.ok, false);
});

test("validate: cannot discard the card just taken from discard", () => {
  let s = gin.initGame(players, { seed: 6 });
  const pid = activePlayer(s.turn);
  const taken = s.discard[s.discard.length - 1];
  s = gin.applyMove(s, pid, { type: "draw", source: "discard" });
  assert.equal(s.justTookFromDiscard, taken.id);
  const v = normalizeValidate(gin.validateMove(s, pid, { type: "discard", card: taken }));
  assert.equal(v.ok, false);
  // discarding a different card is fine
  const other = s.hands[pid].find((c) => c.id !== taken.id)!;
  const v2 = normalizeValidate(gin.validateMove(s, pid, { type: "discard", card: other }));
  assert.equal(v2.ok, true);
});

test("knock rejected when deadwood > 10, allowed at <= 10", () => {
  // Build a known state by hand. Active player will have a hand whose deadwood
  // after discarding is controlled.
  const s = gin.initGame(players, { seed: 9 });
  const pid = activePlayer(s.turn);
  // After a draw, set phase to discard with a custom 11-card hand.
  s.phase = "discard";
  // High-deadwood hand: all unconnected high cards (11 cards)
  s.hands[pid] = [
    C("S", 13), C("H", 13), C("D", 12), C("C", 11),
    C("S", 10), C("H", 8), C("D", 6), C("C", 4),
    C("S", 2), C("H", 1), C("D", 9),
  ];
  // knock discarding one card -> remaining 10 cards still > 10 deadwood
  const high = normalizeValidate(gin.validateMove(s, pid, { type: "knock", card: C("D", 9) }));
  assert.equal(high.ok, false);

  // Low-deadwood hand: 9 melded + 2 low cards, discard one to reach <=10
  s.hands[pid] = [
    C("S", 1), C("S", 2), C("S", 3), // run
    C("H", 5), C("H", 6), C("H", 7), // run
    C("D", 8), C("C", 8), C("S", 8), // set
    C("D", 3), C("C", 2), // deadwood 3 + 2 = 5
  ];
  // discard the 3 (D3) -> remaining deadwood = 2 (<=10) knock ok
  const low = normalizeValidate(gin.validateMove(s, pid, { type: "knock", card: C("D", 3) }));
  assert.equal(low.ok, true);
});

test("gin requires zero deadwood", () => {
  const s = gin.initGame(players, { seed: 11 });
  const pid = activePlayer(s.turn);
  s.phase = "discard";
  // 11 cards: 3 melds (9 cards) + 2 leftovers; discard one leftover -> 1 deadwood left -> NOT gin
  s.hands[pid] = [
    C("S", 1), C("S", 2), C("S", 3),
    C("H", 5), C("H", 6), C("H", 7),
    C("D", 8), C("C", 8), C("S", 8),
    C("D", 4), C("C", 4),
  ];
  // discard C4 -> remaining has D4 deadwood (4) -> not gin
  const notGin = normalizeValidate(gin.validateMove(s, pid, { type: "gin", card: C("C", 4) }));
  assert.equal(notGin.ok, false);

  // Make a true gin: 10 melded cards + 1 extra to discard
  s.hands[pid] = [
    C("S", 1), C("S", 2), C("S", 3), C("S", 4), // run of 4
    C("H", 5), C("H", 6), C("H", 7), // run
    C("D", 8), C("C", 8), C("S", 8), // set
    C("D", 13), // extra to discard
  ];
  const realGin = normalizeValidate(gin.validateMove(s, pid, { type: "gin", card: C("D", 13) }));
  assert.equal(realGin.ok, true);
});

test("undercut scoring: opponent scores difference + 25", () => {
  const s = gin.initGame(players, { seed: 13 });
  const pid = activePlayer(s.turn);
  const opp = s.turn.order.find((p) => p !== pid)!;
  s.phase = "discard";
  // Knocker: deadwood 8 after discard (one unconnected 8)
  s.hands[pid] = [
    C("S", 1), C("S", 2), C("S", 3),
    C("H", 5), C("H", 6), C("H", 7),
    C("D", 9), C("C", 9), C("S", 9),
    C("C", 8), // deadwood 8
    C("D", 13), // discard this
  ];
  // Opponent: deadwood 5 (<= 8), no layoff possible onto knocker's melds
  s.hands[opp] = [
    C("D", 1), C("D", 2), C("D", 3),
    C("H", 10), C("C", 10), C("S", 10),
    C("H", 11), C("C", 11), C("S", 11),
    C("H", 5), // value 5  (note: would NOT lay off — knocker melds are S123/H567/9s)
  ];
  const verdict = normalizeValidate(gin.validateMove(s, pid, { type: "knock", card: C("D", 13) }));
  assert.equal(verdict.ok, true);
  const after = gin.applyMove(s, pid, { type: "knock", card: C("D", 13) });
  assert.ok(after.lastRound);
  assert.equal(after.lastRound!.undercut, true);
  assert.equal(after.lastRound!.scorer, opp);
  // knockerDw=8, oppDw=5 -> opp scores (5-8) is negative... difference + 25:
  // points = oppDw - knockerDw + 25 = 5 - 8 + 25 = 22
  assert.equal(after.lastRound!.points, 22);
  assert.equal(after.scores[opp], 22);
});

test("gin bonus: knocker scores opponent deadwood + 25, no layoff", () => {
  const s = gin.initGame(players, { seed: 17 });
  const pid = activePlayer(s.turn);
  const opp = s.turn.order.find((p) => p !== pid)!;
  s.phase = "discard";
  s.hands[pid] = [
    C("S", 1), C("S", 2), C("S", 3), C("S", 4),
    C("H", 5), C("H", 6), C("H", 7),
    C("D", 8), C("C", 8), C("S", 8),
    C("D", 13), // discard -> gin (0 deadwood)
  ];
  // opponent deadwood includes a 7H that COULD lay off onto knocker's H567 run,
  // but gin forbids layoff, so it counts.
  s.hands[opp] = [
    C("D", 1), C("D", 2), C("D", 3),
    C("C", 10), C("H", 10), C("S", 10),
    C("H", 8), // matches knocker's 8-set but no layoff on gin -> 8 deadwood
    C("H", 7), // would extend H567 but no layoff -> 7 deadwood
    C("C", 5), C("D", 6), // 5 + 6
  ];
  const after = gin.applyMove(s, pid, { type: "gin", card: C("D", 13) });
  assert.ok(after.lastRound);
  assert.equal(after.lastRound!.gin, true);
  const oppDw = deadwoodValue(s.hands[opp]); // computed without layoff
  assert.equal(after.lastRound!.opponentDeadwood, oppDw);
  assert.equal(after.lastRound!.points, oppDw + 25);
  assert.equal(after.scores[pid], oppDw + 25);
});

test("public view hides hands; private view shows own hand + melds", () => {
  const s = gin.initGame(players, { seed: 19 });
  const pub = gin.getPlayerView(s, null) as any;
  assert.equal(pub.hand.length, 0);
  assert.ok(pub.players.every((p: any) => typeof p.handCount === "number"));
  assert.equal(pub.topDiscard.id, s.discard[s.discard.length - 1].id);
  const priv = gin.getPlayerView(s, "a") as any;
  assert.equal(priv.hand.length, 10);
  assert.equal(priv.you, "a");
  assert.ok(Array.isArray(priv.melds));
  assert.equal(typeof priv.deadwoodValue, "number");
});

test("a full simulated game reaches 100 and returns a winner", () => {
  let s: GinState = gin.initGame(players, { seed: 4242 });
  let guard = 0;
  while (!s.finished && guard++ < 20000) {
    if (s.phase === "roundOver") {
      s = gin.applyMove(s, activePlayer(s.turn), { type: "nextRound" });
      continue;
    }
    const pid = activePlayer(s.turn);
    if (s.phase === "draw") {
      // prefer discard if it lowers our deadwood, else stock
      const topD = s.discard[s.discard.length - 1];
      const cur = deadwoodValue(s.hands[pid]);
      const withTop = deadwoodValue([...s.hands[pid], topD]);
      const source = withTop < cur ? "discard" : "stock";
      const mv = { type: "draw", source };
      assert.ok(normalizeValidate(gin.validateMove(s, pid, mv)).ok);
      s = gin.applyMove(s, pid, mv);
      assert.equal(totalCards(s), 52, "cards conserved after draw");
      continue;
    }
    // discard phase: pick the discard minimizing our resulting deadwood
    const hand = s.hands[pid];
    let bestCard = hand[0];
    let bestDw = Infinity;
    for (const c of hand) {
      if (s.justTookFromDiscard && c.id === s.justTookFromDiscard) continue;
      const dw = deadwoodValue(hand.filter((x) => x.id !== c.id));
      if (dw < bestDw) {
        bestDw = dw;
        bestCard = c;
      }
    }
    let mv: any;
    if (bestDw === 0) mv = { type: "gin", card: bestCard };
    else if (bestDw <= 10) mv = { type: "knock", card: bestCard };
    else mv = { type: "discard", card: bestCard };
    assert.ok(normalizeValidate(gin.validateMove(s, pid, mv)).ok, `move legal: ${JSON.stringify(mv)}`);
    s = gin.applyMove(s, pid, mv);
    assert.equal(totalCards(s), 52, "cards conserved after discard/knock");
  }
  assert.ok(s.finished, "game should finish");
  const result = gin.isGameOver(s);
  assert.ok(result && result.winners.length === 1);
  assert.ok((result!.scores?.[result!.winners[0]] ?? 0) >= 100);
});
