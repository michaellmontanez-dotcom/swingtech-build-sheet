import assert from "node:assert/strict";
import test from "node:test";
import {
  hearts,
  sortHand,
  TWO_OF_CLUBS,
  QUEEN_OF_SPADES,
  type HeartsState,
  type Card,
} from "@/games/hearts/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
  { id: "d", name: "Di", seat: 3 },
];

function totalCards(s: HeartsState): number {
  // cards still in hands + on the table + already won into completed tricks
  const inHands = Object.values(s.hands).reduce((n, h) => n + h.length, 0);
  const completedTricks = Object.values(s.tricksTaken).reduce((a, b) => a + b, 0);
  return inHands + s.currentTrick.length + completedTricks * 4;
}

function priv(s: HeartsState, pid: string) {
  return hearts.getPlayerView(s, pid) as any;
}

// Submit a pass for every player. Each passes their first 3 cards by sorted order.
function passAll(s: HeartsState): HeartsState {
  for (const p of players) {
    const view = priv(s, p.id);
    if (view.hasPassed) continue;
    const cards = view.hand.slice(0, 3).map((c: Card) => c.id);
    const verdict = normalizeValidate(hearts.validateMove(s, p.id, { type: "pass", cards }));
    assert.ok(verdict.ok, `pass should be legal: ${verdict.error}`);
    s = hearts.applyMove(s, p.id, { type: "pass", cards });
  }
  return s;
}

// Play a full hand by always picking the active player's first legal card.
function playHand(s: HeartsState): HeartsState {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 1000) {
    const pid = s.order[s.activeIndex];
    const view = priv(s, pid);
    assert.ok(view.playable.length > 0, "active player must have a legal play");
    const card = view.playable[0];
    const verdict = normalizeValidate(hearts.validateMove(s, pid, { type: "play", card }));
    assert.ok(verdict.ok, `play should be legal: ${verdict.error}`);
    s = hearts.applyMove(s, pid, { type: "play", card });
    assert.equal(totalCards(s), 52, "card conservation during play");
  }
  return s;
}

test("52-card conservation at deal and across a hand", () => {
  let s = hearts.initGame(players, { seed: 1 });
  assert.equal(totalCards(s), 52);
  for (const p of players) assert.equal(s.hands[p.id].length, 13);
  s = passAll(s);
  assert.equal(totalCards(s), 52, "conserved after passing");
  s = playHand(s);
  assert.equal(totalCards(s), 52, "conserved after the hand");
});

test("pass direction rotates left, right, across, none", () => {
  const expected = ["left", "right", "across", "none", "left"];
  let s = hearts.initGame(players, { seed: 5 });
  for (let i = 0; i < expected.length; i++) {
    assert.equal(s.passDirection, expected[i], `hand ${i} direction`);
    if (s.passDirection !== "none") s = passAll(s);
    s = playHand(s);
    if (s.phase === "handEnd") s = hearts.applyMove(s, "a", { type: "nextHand" });
  }
});

test("'none' hand skips passing and goes straight to play", () => {
  let s = hearts.initGame(players, { seed: 9 });
  // advance to hand index 3 (none)
  for (let i = 0; i < 3; i++) {
    if (s.passDirection !== "none") s = passAll(s);
    s = playHand(s);
    s = hearts.applyMove(s, "a", { type: "nextHand" });
  }
  assert.equal(s.passDirection, "none");
  assert.equal(s.phase, "playing", "no-pass hand starts in play immediately");
});

test("2 of clubs leads the first trick", () => {
  let s = hearts.initGame(players, { seed: 2 });
  s = passAll(s);
  const leader = s.order[s.activeIndex];
  assert.ok(s.hands[leader].some((c) => c.id === TWO_OF_CLUBS), "leader holds 2♣");
  // any non-2♣ lead is rejected
  const otherLead = s.hands[leader].find((c) => c.id !== TWO_OF_CLUBS)!;
  const bad = normalizeValidate(hearts.validateMove(s, leader, { type: "play", card: otherLead.id }));
  assert.equal(bad.ok, false, "must lead 2♣");
  const good = normalizeValidate(hearts.validateMove(s, leader, { type: "play", card: TWO_OF_CLUBS }));
  assert.equal(good.ok, true);
});

test("follow-suit enforced; off-suit rejected when you can follow", () => {
  // Build a controlled state.
  let s = hearts.initGame(players, { seed: 3 });
  s = passAll(s);
  const leader = s.order[s.activeIndex];
  s = hearts.applyMove(s, leader, { type: "play", card: TWO_OF_CLUBS });
  const next = s.order[s.activeIndex];
  const h = s.hands[next];
  const club = h.find((c) => c.suit === "C");
  const nonClub = h.find((c) => c.suit !== "C");
  if (club && nonClub) {
    const bad = normalizeValidate(hearts.validateMove(s, next, { type: "play", card: nonClub.id }));
    assert.equal(bad.ok, false, "must follow clubs");
    const good = normalizeValidate(hearts.validateMove(s, next, { type: "play", card: club.id }));
    assert.equal(good.ok, true, "following clubs is legal");
  } else {
    // void in clubs: any non-heart/non-Q♠ is fine on first trick
    const safe = h.find((c) => c.suit !== "H" && c.id !== QUEEN_OF_SPADES)!;
    const good = normalizeValidate(hearts.validateMove(s, next, { type: "play", card: safe.id }));
    assert.equal(good.ok, true);
  }
});

test("hearts cannot be led until broken", () => {
  // Construct a minimal mid-hand state where it's a new trick, hearts not broken,
  // and the leader has both hearts and non-hearts.
  const s = hearts.initGame(players, { seed: 11 }) as HeartsState;
  // Force into a play-phase trick-lead position with crafted hands.
  s.phase = "playing";
  s.passDirection = "none";
  s.heartsBroken = false;
  s.currentTrick = [];
  s.tricksTaken = { a: 1, b: 0, c: 0, d: 0 }; // not the first trick
  s.activeIndex = 0;
  s.leaderId = "a";
  const heartCard: Card = { id: "HK", suit: "H", rank: 13 };
  const clubCard: Card = { id: "C5", suit: "C", rank: 5 };
  s.hands = {
    a: [heartCard, clubCard],
    b: [{ id: "D5", suit: "D", rank: 5 }],
    c: [{ id: "S5", suit: "S", rank: 5 }],
    d: [{ id: "D9", suit: "D", rank: 9 }],
  };
  const bad = normalizeValidate(hearts.validateMove(s, "a", { type: "play", card: "HK" }));
  assert.equal(bad.ok, false, "cannot lead hearts before broken");
  const good = normalizeValidate(hearts.validateMove(s, "a", { type: "play", card: "C5" }));
  assert.equal(good.ok, true);

  // but if leader has ONLY hearts, leading a heart is allowed
  s.hands.a = [heartCard];
  const onlyHearts = normalizeValidate(hearts.validateMove(s, "a", { type: "play", card: "HK" }));
  assert.equal(onlyHearts.ok, true, "may lead hearts when holding only hearts");
});

test("scoring: each heart = 1, Q♠ = 13", () => {
  const s = hearts.initGame(players, { seed: 1 }) as HeartsState;
  // craft a finished hand: player 'a' takes Q♠ + 3 hearts, others zero.
  s.phase = "playing";
  s.pointsThisHand = { a: 0, b: 0, c: 0, d: 0 };
  s.tricksTaken = { a: 12, b: 0, c: 0, d: 0 };
  s.scores = { a: 0, b: 0, c: 0, d: 0 };
  s.heartsBroken = true;
  s.leaderId = "a";
  s.activeIndex = 0;
  // last trick: a leads Q♠, everyone follows spades; a wins -> 13 + nothing else
  s.hands = {
    a: [{ id: "SQ", suit: "S", rank: 12 }],
    b: [{ id: "S2", suit: "S", rank: 2 }],
    c: [{ id: "H4", suit: "H", rank: 4 }],
    d: [{ id: "H7", suit: "H", rank: 7 }],
  };
  let st: HeartsState = s;
  st = hearts.applyMove(st, "a", { type: "play", card: "SQ" });
  st = hearts.applyMove(st, "b", { type: "play", card: "S2" });
  st = hearts.applyMove(st, "c", { type: "play", card: "H4" });
  st = hearts.applyMove(st, "d", { type: "play", card: "H7" });
  // a wins spade trick taking Q♠(13) + 2 hearts(2) = 15
  assert.equal(st.handResult!.a, 15);
  assert.equal(st.scores.a, 15);
  assert.equal(st.scores.b, 0);
});

test("shooting the moon flips to 0 / 26", () => {
  const s = hearts.initGame(players, { seed: 1 }) as HeartsState;
  s.phase = "playing";
  s.pointsThisHand = { a: 24, b: 0, c: 0, d: 0 };
  s.scores = { a: 10, b: 5, c: 5, d: 5 };
  s.tricksTaken = { a: 12, b: 0, c: 0, d: 0 };
  s.heartsBroken = true;
  s.leaderId = "a";
  s.activeIndex = 0;
  s.hands = {
    a: [{ id: "HA", suit: "H", rank: 14 }],
    b: [{ id: "HK", suit: "H", rank: 13 }],
    c: [{ id: "C3", suit: "C", rank: 3 }],
    d: [{ id: "C4", suit: "C", rank: 4 }],
  };
  let st: HeartsState = s;
  st = hearts.applyMove(st, "a", { type: "play", card: "HA" });
  st = hearts.applyMove(st, "b", { type: "play", card: "HK" });
  st = hearts.applyMove(st, "c", { type: "play", card: "C3" });
  st = hearts.applyMove(st, "d", { type: "play", card: "C4" });
  // a wins taking 2 hearts -> 24 + 2 = 26 -> moon
  assert.equal(st.shotTheMoon, "a");
  assert.equal(st.handResult!.a, 0);
  assert.equal(st.handResult!.b, 26);
  assert.equal(st.scores.a, 10); // unchanged
  assert.equal(st.scores.b, 31); // 5 + 26
});

test("a full simulated game reaches a winner under the 100-point rule", () => {
  let s = hearts.initGame(players, { seed: 77, targetScore: 100 });
  let guard = 0;
  while (hearts.isGameOver(s) === null && guard++ < 200) {
    if (s.phase === "passing") s = passAll(s);
    if (s.phase === "playing") s = playHand(s);
    if (s.phase === "handEnd") s = hearts.applyMove(s, "a", { type: "nextHand" });
  }
  const result = hearts.isGameOver(s);
  assert.ok(result, "game should finish");
  assert.ok(result!.winners.length >= 1, "has at least one winner");
  assert.ok(result!.scores, "reports cumulative scores");
  const min = Math.min(...players.map((p) => result!.scores![p.id]));
  for (const w of result!.winners) assert.equal(result!.scores![w], min, "winner has lowest score");
  assert.ok(players.some((p) => result!.scores![p.id] >= 100), "someone reached 100");
});

test("illegal moves are rejected", () => {
  let s = hearts.initGame(players, { seed: 4 });
  // passing wrong count
  const wrongCount = normalizeValidate(
    hearts.validateMove(s, "a", { type: "pass", cards: [s.hands.a[0].id, s.hands.a[1].id] })
  );
  assert.equal(wrongCount.ok, false);
  // passing duplicate cards
  const dup = normalizeValidate(
    hearts.validateMove(s, "a", { type: "pass", cards: [s.hands.a[0].id, s.hands.a[0].id, s.hands.a[1].id] })
  );
  assert.equal(dup.ok, false);
  // passing a card you don't hold
  const notHeld = normalizeValidate(
    hearts.validateMove(s, "a", { type: "pass", cards: ["ZZ", s.hands.a[0].id, s.hands.a[1].id] })
  );
  assert.equal(notHeld.ok, false);
  // play during passing phase
  const wrongPhase = normalizeValidate(hearts.validateMove(s, "a", { type: "play", card: TWO_OF_CLUBS }));
  assert.equal(wrongPhase.ok, false);
  // unknown move
  const unknown = normalizeValidate(hearts.validateMove(s, "a", { type: "foo" }));
  assert.equal(unknown.ok, false);

  // after passing resolves: playing out of turn is rejected
  s = passAll(s);
  const leader = s.order[s.activeIndex];
  const notLeader = players.find((p) => p.id !== leader)!.id;
  const outOfTurn = normalizeValidate(
    hearts.validateMove(s, notLeader, { type: "play", card: s.hands[notLeader][0].id })
  );
  assert.equal(outOfTurn.ok, false);
});

test("hidden hands: public view shows counts only, private shows own hand", () => {
  const s = hearts.initGame(players, { seed: 8 });
  const pub = hearts.getPlayerView(s, null) as any;
  assert.equal(pub.hand.length, 0);
  assert.ok(pub.players.every((p: any) => typeof p.handCount === "number" && p.handCount === 13));
  assert.equal(pub.you, null);
  const mine = hearts.getPlayerView(s, "a") as any;
  assert.equal(mine.hand.length, 13);
  assert.equal(mine.you, "a");
  // sorted by suit
  const sorted = sortHand(mine.hand);
  assert.deepEqual(mine.hand.map((c: Card) => c.id), sorted.map((c) => c.id));
});
