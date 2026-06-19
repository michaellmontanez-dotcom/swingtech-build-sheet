import assert from "node:assert/strict";
import test from "node:test";
import {
  yahtzee,
  scoreCategory,
  upperBonus,
  upperSubtotal,
  grandTotal,
  CATEGORIES,
  type YahtzeeState,
  type ScoreCard,
} from "@/games/yahtzee/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];

// ---------------------------------------------------------------------------
// Category scoring
// ---------------------------------------------------------------------------
test("upper-section categories sum matching dice", () => {
  assert.equal(scoreCategory("ones", [1, 1, 2, 3, 1]), 3);
  assert.equal(scoreCategory("twos", [2, 2, 2, 5, 6]), 6);
  assert.equal(scoreCategory("threes", [3, 3, 3, 3, 1]), 12);
  assert.equal(scoreCategory("sixes", [6, 6, 6, 6, 6]), 30);
  assert.equal(scoreCategory("fours", [1, 2, 3, 5, 6]), 0);
});

test("three / four of a kind sum all dice or zero", () => {
  assert.equal(scoreCategory("three_of_a_kind", [3, 3, 3, 4, 5]), 18);
  assert.equal(scoreCategory("three_of_a_kind", [1, 2, 3, 4, 5]), 0);
  assert.equal(scoreCategory("four_of_a_kind", [6, 6, 6, 6, 1]), 25);
  assert.equal(scoreCategory("four_of_a_kind", [6, 6, 6, 1, 1]), 0);
});

test("full house = 25 only for 3+2", () => {
  assert.equal(scoreCategory("full_house", [2, 2, 5, 5, 5]), 25);
  assert.equal(scoreCategory("full_house", [2, 2, 2, 2, 5]), 0);
  assert.equal(scoreCategory("full_house", [3, 3, 3, 3, 3]), 0);
});

test("small straight = 30, large straight = 40", () => {
  assert.equal(scoreCategory("small_straight", [1, 2, 3, 4, 4]), 30);
  assert.equal(scoreCategory("small_straight", [2, 3, 4, 5, 1]), 30);
  assert.equal(scoreCategory("small_straight", [1, 2, 3, 5, 6]), 0);
  assert.equal(scoreCategory("large_straight", [2, 3, 4, 5, 6]), 40);
  assert.equal(scoreCategory("large_straight", [1, 2, 3, 4, 6]), 0);
});

test("yahtzee = 50, chance = sum", () => {
  assert.equal(scoreCategory("yahtzee", [4, 4, 4, 4, 4]), 50);
  assert.equal(scoreCategory("yahtzee", [4, 4, 4, 4, 1]), 0);
  assert.equal(scoreCategory("chance", [1, 2, 3, 4, 5]), 15);
});

// ---------------------------------------------------------------------------
// Bonuses / totals
// ---------------------------------------------------------------------------
test("upper bonus triggers at >= 63", () => {
  const card = {} as ScoreCard;
  for (const c of CATEGORIES) card[c] = null;
  // Three of each upper face: 3+6+9+12+15+18 = 63
  card.ones = 3;
  card.twos = 6;
  card.threes = 9;
  card.fours = 12;
  card.fives = 15;
  card.sixes = 18;
  assert.equal(upperSubtotal(card), 63);
  assert.equal(upperBonus(card), 35);

  card.sixes = 12; // now 57 < 63
  assert.equal(upperBonus(card), 0);
});

test("grand total includes upper bonus and yahtzee bonus", () => {
  const card = {} as ScoreCard;
  for (const c of CATEGORIES) card[c] = 0;
  card.ones = 3;
  card.twos = 6;
  card.threes = 9;
  card.fours = 12;
  card.fives = 15;
  card.sixes = 18; // upper = 63 -> +35
  card.chance = 20;
  // base sum = 63 + 20 = 83, + 35 bonus + 100 yahtzee bonus = 218
  assert.equal(grandTotal(card, 100), 218);
});

// ---------------------------------------------------------------------------
// Move legality
// ---------------------------------------------------------------------------
test("rejects acting out of turn", () => {
  const s = yahtzee.initGame(players, { seed: 1 });
  const notActive = players.find((p) => p.id !== activePlayer(s.turn))!;
  const v = normalizeValidate(yahtzee.validateMove(s, notActive.id, { type: "roll", keep: [] }));
  assert.equal(v.ok, false);
});

test("rejects scoring before rolling", () => {
  const s = yahtzee.initGame(players, { seed: 1 });
  const pid = activePlayer(s.turn);
  const v = normalizeValidate(yahtzee.validateMove(s, pid, { type: "score", category: "chance" }));
  assert.equal(v.ok, false);
});

test("rejects a 4th roll", () => {
  let s = yahtzee.initGame(players, { seed: 5 });
  const pid = activePlayer(s.turn);
  for (let r = 0; r < 3; r++) {
    const keep = r === 0 ? [] : [];
    assert.ok(normalizeValidate(yahtzee.validateMove(s, pid, { type: "roll", keep })).ok);
    s = yahtzee.applyMove(s, pid, { type: "roll", keep });
  }
  assert.equal(s.rollsUsed, 3);
  const v = normalizeValidate(yahtzee.validateMove(s, pid, { type: "roll", keep: [] }));
  assert.equal(v.ok, false);
});

test("rejects scoring an already-used category", () => {
  let s = yahtzee.initGame(players, { seed: 9 });
  const pid = activePlayer(s.turn);
  s = yahtzee.applyMove(s, pid, { type: "roll", keep: [] });
  s = yahtzee.applyMove(s, pid, { type: "score", category: "chance" });
  // turn passed; force the same player active again is awkward, so just check the
  // filled flag persists and validateMove rejects re-scoring it for that player.
  assert.notEqual(s.cards[pid].chance, null);
  // Make it that player's turn-state again by checking validate directly:
  const fakeActive: YahtzeeState = { ...s, turn: { ...s.turn, activeIndex: s.turn.order.indexOf(pid) }, rollsUsed: 1 };
  const v = normalizeValidate(yahtzee.validateMove(fakeActive, pid, { type: "score", category: "chance" }));
  assert.equal(v.ok, false);
});

// ---------------------------------------------------------------------------
// Full simulated game
// ---------------------------------------------------------------------------
test("a full game ends with correct grand totals and winners", () => {
  let s: YahtzeeState = yahtzee.initGame(players, { seed: 42 });
  let guard = 0;
  while (!s.finished && guard++ < 10000) {
    const pid = activePlayer(s.turn);
    // Roll once, then score the first open category.
    const rollMove = { type: "roll", keep: [] };
    assert.ok(normalizeValidate(yahtzee.validateMove(s, pid, rollMove)).ok);
    s = yahtzee.applyMove(s, pid, rollMove);

    const view = yahtzee.getPlayerView(s, pid) as any;
    const openCat = CATEGORIES.find((c) => view.available[c] !== undefined);
    assert.ok(openCat, "should have an open category");
    const scoreMove = { type: "score", category: openCat };
    assert.ok(normalizeValidate(yahtzee.validateMove(s, pid, scoreMove)).ok);
    s = yahtzee.applyMove(s, pid, scoreMove);
  }
  assert.ok(s.finished, "game should finish");

  // Every player filled all 13 categories.
  for (const p of players) {
    assert.equal(CATEGORIES.every((c) => s.cards[p.id][c] !== null), true);
  }

  const over = yahtzee.isGameOver(s);
  assert.ok(over);
  // Scores match an independent grandTotal computation.
  for (const p of players) {
    assert.equal(over!.scores![p.id], grandTotal(s.cards[p.id], s.yahtzeeBonus[p.id]));
  }
  // Winner has the maximal score.
  const best = Math.max(...Object.values(over!.scores!));
  for (const w of over!.winners) assert.equal(over!.scores![w], best);
  assert.ok(over!.winners.length >= 1);
});

test("yahtzee bonus +100 applied for a second yahtzee", () => {
  // Build a state where player already scored yahtzee=50, then score another
  // five-of-a-kind in an open category.
  let s = yahtzee.initGame(players, { seed: 3 });
  const pid = activePlayer(s.turn);
  s.cards[pid].yahtzee = 50;
  s.dice = [5, 5, 5, 5, 5];
  s.kept = [true, true, true, true, true];
  s.rollsUsed = 1;
  const before = s.yahtzeeBonus[pid];
  s = yahtzee.applyMove(s, pid, { type: "score", category: "fives" });
  assert.equal(s.yahtzeeBonus[pid], before + 100);
  assert.equal(s.cards[pid].fives, 25); // 5+5+5+5+5
});

// ---------------------------------------------------------------------------
// View shape
// ---------------------------------------------------------------------------
test("public and private views expose dice + scorecards (no hidden info)", () => {
  let s = yahtzee.initGame(players, { seed: 11 });
  const pid = activePlayer(s.turn);
  s = yahtzee.applyMove(s, pid, { type: "roll", keep: [] });
  const pub = yahtzee.getPlayerView(s, null) as any;
  assert.equal(pub.you, null);
  assert.equal(pub.dice.length, 5);
  assert.ok(pub.players.every((p: any) => p.card));

  const priv = yahtzee.getPlayerView(s, pid) as any;
  assert.equal(priv.you, pid);
  assert.equal(priv.myTurn, true);
  assert.ok(priv.canScore);
});
