import assert from "node:assert/strict";
import test from "node:test";
import { gofish, RANKS, type GoFishState, type Rank, type Card } from "@/games/gofish/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players3: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
];
const players4: PlayerInfo[] = [
  ...players3,
  { id: "d", name: "Di", seat: 3 },
];

// total cards accounted for: hands + pool + books*4 must always equal 52
function totalCards(s: GoFishState): number {
  const inHands = Object.values(s.hands).reduce((n, h) => n + h.length, 0);
  const inBooks = Object.values(s.books).reduce((n, b) => n + b.length, 0) * 4;
  return inHands + s.pool.length + inBooks;
}

function uniqueIds(s: GoFishState): boolean {
  const ids = new Set<string>();
  for (const h of Object.values(s.hands)) for (const c of h) ids.add(c.id);
  for (const c of s.pool) ids.add(c.id);
  // hands + pool ids should be unique; books removed their 4 cards (not tracked by id)
  const count = Object.values(s.hands).reduce((n, h) => n + h.length, 0) + s.pool.length;
  return ids.size === count;
}

test("deals correctly and conserves 52 cards", () => {
  const s3 = gofish.initGame(players3, { seed: 1 });
  for (const p of players3) assert.equal(s3.hands[p.id].length, 7, "2-3 players → 7 each");
  assert.equal(totalCards(s3), 52);
  assert.ok(uniqueIds(s3));

  const s4 = gofish.initGame(players4, { seed: 1 });
  for (const p of players4) assert.equal(s4.hands[p.id].length, 5, "4+ players → 5 each");
  assert.equal(totalCards(s4), 52);
});

test("asking a held rank the target has transfers ALL of them and grants another turn", () => {
  // construct a deterministic state
  const s = gofish.initGame(players3, { seed: 5 });
  const ask = activePlayer(s.turn);
  const other = s.turn.order.find((id) => id !== ask)!;
  const third = s.turn.order.find((id) => id !== ask && id !== other)!;

  // give ask one 7, other three 7s (so transferring won't immediately book)
  s.hands[ask] = [{ id: "x0", rank: "7", suit: "♠" }];
  s.hands[other] = [
    { id: "x1", rank: "7", suit: "♥" },
    { id: "x2", rank: "7", suit: "♦" },
    { id: "x3", rank: "3", suit: "♣" },
  ];
  s.hands[third] = [{ id: "x4", rank: "9", suit: "♠" }];

  const before = totalCards(s);
  const v = normalizeValidate(gofish.validateMove(s, ask, { type: "ask", targetId: other, rank: "7" }));
  assert.ok(v.ok, v.error);
  const next = gofish.applyMove(s, ask, { type: "ask", targetId: other, rank: "7" });

  // all three 7s transferred -> asker holds three 7s, other holds none
  assert.equal(next.hands[ask].filter((c: Card) => c.rank === "7").length, 3);
  assert.equal(next.hands[other].filter((c: Card) => c.rank === "7").length, 0);
  // asker keeps the turn (success grants another turn)
  assert.equal(activePlayer(next.turn), ask, "asker should go again after a successful ask");
  assert.equal(totalCards(next), before, "no cards created/destroyed");
});

test("a successful 4th card is booked and scored", () => {
  const s = gofish.initGame(players3, { seed: 6 });
  const ask = activePlayer(s.turn);
  const other = s.turn.order.find((id) => id !== ask)!;

  s.hands[ask] = [
    { id: "k0", rank: "K", suit: "♠" },
    { id: "k1", rank: "K", suit: "♥" },
    { id: "k2", rank: "K", suit: "♦" },
  ];
  s.hands[other] = [{ id: "k3", rank: "K", suit: "♣" }];
  for (const id of s.turn.order) if (id !== ask && id !== other) s.hands[id] = [];
  s.pool = [];

  const before = totalCards(s);
  const next = gofish.applyMove(s, ask, { type: "ask", targetId: other, rank: "K" });
  assert.deepEqual(next.books[ask], ["K"], "four Kings form a book");
  assert.equal(next.hands[ask].filter((c: Card) => c.rank === "K").length, 0, "booked cards leave hand");
  assert.equal(totalCards(next), before, "cards conserved (4 cards: 0 hand + 1 book*4)");
});

test("go fish path: target lacks rank → draw from pool, turn usually passes", () => {
  const s = gofish.initGame(players3, { seed: 9 });
  const ask = activePlayer(s.turn);
  const other = s.turn.order.find((id) => id !== ask)!;

  // ask holds an Ace; other has no Aces; pool top is forced to NOT be an Ace
  s.hands[ask] = [{ id: "a0", rank: "A", suit: "♠" }];
  s.hands[other] = [{ id: "a1", rank: "3", suit: "♥" }];
  s.hands[s.turn.order.find((id) => id !== ask && id !== other)!] = [{ id: "a2", rank: "9", suit: "♣" }];
  s.pool = [{ id: "p0", rank: "5", suit: "♦" }]; // not an Ace → turn should pass

  const before = totalCards(s);
  const poolBefore = s.pool.length;
  const next = gofish.applyMove(s, ask, { type: "ask", targetId: other, rank: "A" });
  assert.equal(next.pool.length, poolBefore - 1, "drew one from the pool");
  assert.equal(next.hands[ask].some((c: Card) => c.id === "p0"), true, "drew card lands in hand");
  assert.notEqual(activePlayer(next.turn), ask, "non-matching draw passes the turn");
  assert.equal(totalCards(next), before, "cards conserved");
});

test("go fish but you draw the rank you asked for → go again", () => {
  const s = gofish.initGame(players3, { seed: 11 });
  const ask = activePlayer(s.turn);
  const other = s.turn.order.find((id) => id !== ask)!;
  s.hands[ask] = [{ id: "a0", rank: "A", suit: "♠" }];
  s.hands[other] = [{ id: "a1", rank: "3", suit: "♥" }];
  s.hands[s.turn.order.find((id) => id !== ask && id !== other)!] = [{ id: "a2", rank: "9", suit: "♣" }];
  s.pool = [{ id: "p0", rank: "A", suit: "♦" }]; // drawing an Ace = lucky

  const next = gofish.applyMove(s, ask, { type: "ask", targetId: other, rank: "A" });
  assert.equal(activePlayer(next.turn), ask, "lucky draw of asked rank grants another turn");
});

test("getPlayerView(null) NEVER leaks card arrays; getPlayerView(pid) shows only own hand", () => {
  const s = gofish.initGame(players3, { seed: 13 });

  const pub = gofish.getPlayerView(s, null) as any;
  assert.equal(pub.you, null);
  assert.equal(pub.hand.length, 0, "public view has no hand");
  // public players entries expose counts but NO card array
  for (const p of pub.players) {
    assert.equal(typeof p.handCount, "number");
    assert.equal(typeof p.bookCount, "number");
    assert.equal(Array.isArray(p.books), true);
    // books are just ranks (strings), never Card objects
    for (const b of p.books) assert.equal(typeof b, "string");
    assert.equal((p as any).hand, undefined, "no per-player hand array in public view");
    assert.equal((p as any).cards, undefined);
  }
  // deep scan: no Card-shaped object (with .suit) anywhere except none expected
  const json = JSON.stringify(pub);
  assert.equal(json.includes('"suit"'), false, "public view must not contain any card with a suit");

  const priv = gofish.getPlayerView(s, "a") as any;
  assert.equal(priv.you, "a");
  assert.equal(priv.hand.length, s.hands["a"].length);
  // private view's hand is exactly player a's hand
  const privIds = new Set(priv.hand.map((c: Card) => c.id));
  const realIds = new Set(s.hands["a"].map((c) => c.id));
  assert.deepEqual([...privIds].sort(), [...realIds].sort());
  // it must NOT contain another player's cards
  const otherIds = new Set(s.hands["b"].map((c) => c.id));
  for (const id of privIds) assert.equal(otherIds.has(id as string), false, "no leak of other hands");
  // askableRanks only contains ranks the player holds
  for (const r of priv.askableRanks as Rank[]) {
    assert.ok(s.hands["a"].some((c) => c.rank === r));
  }
});

test("a full simulated game ends with a winner and conserves cards throughout", () => {
  let s: GoFishState = gofish.initGame(players4, { seed: 42 });
  let guard = 0;
  while (!gofish.isGameOver(s) && guard++ < 10000) {
    const pid = activePlayer(s.turn);
    const view = gofish.getPlayerView(s, pid) as any;

    // active player must always be able to act (hold >=1 card) unless game is over
    assert.ok(view.hand.length > 0, "active player should hold cards");
    const askable: Rank[] = view.askableRanks;
    assert.ok(askable.length > 0, "active player must have an askable rank");

    // pick a random-ish rank we hold and a random other player
    const rank = askable[guard % askable.length];
    const others = view.players.filter((p: any) => p.id !== pid);
    const target = others[guard % others.length].id;

    const verdict = normalizeValidate(gofish.validateMove(s, pid, { type: "ask", targetId: target, rank }));
    assert.ok(verdict.ok, `move should be legal: ${verdict.error}`);
    s = gofish.applyMove(s, pid, { type: "ask", targetId: target, rank });
    assert.equal(totalCards(s), 52, "cards conserved every step");
    assert.ok(uniqueIds(s), "no duplicate card ids");
  }
  assert.ok(gofish.isGameOver(s), "game should finish");
  const result = gofish.isGameOver(s)!;
  assert.ok(result.winners.length >= 1, "at least one winner");
  assert.ok(result.scores, "scores present");
  // total books across players == 13
  const booked = Object.values(result.scores!).reduce((n, v) => n + v, 0);
  assert.equal(booked, RANKS.length, "all 13 books collected");
});

test("validateMove rejects illegal asks", () => {
  const s = gofish.initGame(players3, { seed: 3 });
  const ask = activePlayer(s.turn);
  const other = s.turn.order.find((id) => id !== ask)!;

  // not your turn
  assert.equal(normalizeValidate(gofish.validateMove(s, other, { type: "ask", targetId: ask, rank: "A" })).ok, false);
  // target == self
  assert.equal(normalizeValidate(gofish.validateMove(s, ask, { type: "ask", targetId: ask, rank: s.hands[ask][0].rank })).ok, false);
  // target not in game
  assert.equal(normalizeValidate(gofish.validateMove(s, ask, { type: "ask", targetId: "zzz", rank: s.hands[ask][0].rank })).ok, false);
  // rank not held: find a rank the asker does NOT hold
  const heldRanks = new Set(s.hands[ask].map((c) => c.rank));
  const notHeld = RANKS.find((r) => !heldRanks.has(r))!;
  assert.equal(normalizeValidate(gofish.validateMove(s, ask, { type: "ask", targetId: other, rank: notHeld })).ok, false);
});
