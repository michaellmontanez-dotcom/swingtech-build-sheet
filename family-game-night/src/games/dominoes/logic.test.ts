import assert from "node:assert/strict";
import test from "node:test";
import { dominoes, type DominoesState, type Tile } from "@/games/dominoes/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players2: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
];
const players3: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
];

function totalTiles(s: DominoesState): number {
  return (
    s.boneyard.length +
    s.chain.length +
    Object.values(s.hands).reduce((n, h) => n + h.length, 0)
  );
}

function pip(t: Tile): number {
  return t.a + t.b;
}

test("28 tiles conserved across hands + chain + boneyard at deal", () => {
  const s = dominoes.initGame(players2, { seed: 1 });
  assert.equal(totalTiles(s), 28);
  for (const p of players2) assert.equal(s.hands[p.id].length, 7);
  // 2*7 = 14 dealt, 14 in boneyard
  assert.equal(s.boneyard.length, 14);
});

test("deals 5 each for 3 players", () => {
  const s = dominoes.initGame(players3, { seed: 1 });
  for (const p of players3) assert.equal(s.hands[p.id].length, 5);
  assert.equal(totalTiles(s), 28);
});

test("public view hides tiles, private view shows own", () => {
  const s = dominoes.initGame(players2, { seed: 2 });
  const pub = dominoes.getPlayerView(s, null) as any;
  assert.equal(pub.hand.length, 0);
  assert.ok(pub.players.every((p: any) => typeof p.tileCount === "number"));
  // public view must expose counts, ends, boneyard count, turn, scores — not tiles
  assert.ok("boneyardCount" in pub && "leftEnd" in pub && "rightEnd" in pub);
  assert.equal(pub.you, null);
  const priv = dominoes.getPlayerView(s, "a") as any;
  assert.equal(priv.hand.length, 7);
  assert.equal(priv.you, "a");
});

test("only matching tiles are playable and open ends update after each play", () => {
  // Hand-craft a deterministic mid-game state via initGame then drive moves.
  const s = dominoes.initGame(players2, { seed: 5 });
  const starter = activePlayer(s.turn);
  // opening: any tile is legal and both ends become its pips
  const view = dominoes.getPlayerView(s, starter) as any;
  const opener = view.playable[0];
  assert.ok(opener.ends.length === 2, "opening move matches both ends");
  const tile = view.hand.find((t: Tile) => t.id === opener.id)!;
  const s2 = dominoes.applyMove(s, starter, { type: "play", tile: tile.id, end: "left" });
  assert.equal(s2.leftEnd, tile.a);
  assert.equal(s2.rightEnd, tile.b);
  assert.equal(s2.chain.length, 1);
  assert.equal(totalTiles(s2), 28);

  // Now the next player's playable tiles must each actually match an open end.
  const next = activePlayer(s2.turn);
  const nv = dominoes.getPlayerView(s2, next) as any;
  for (const t of nv.hand as Tile[]) {
    const entry = nv.playable.find((p: any) => p.id === t.id)!;
    const matches = t.a === s2.leftEnd || t.b === s2.leftEnd || t.a === s2.rightEnd || t.b === s2.rightEnd;
    assert.equal(entry.ends.length > 0, matches, `playability of ${t.id} should reflect ends`);
  }
});

test("playing a tile sets the new open end to the non-matching pip", () => {
  const s = dominoes.initGame(players2, { seed: 5 });
  const starter = activePlayer(s.turn);
  const v0 = dominoes.getPlayerView(s, starter) as any;
  const tile = v0.hand[0] as Tile;
  const s1 = dominoes.applyMove(s, starter, { type: "play", tile: tile.id, end: "left" });
  // find a follow-up tile that matches exactly one end and verify the update
  const next = activePlayer(s1.turn);
  const nv = dominoes.getPlayerView(s1, next) as any;
  const playable = nv.playable.find((p: any) => p.ends.length > 0);
  if (playable) {
    const t = nv.hand.find((x: Tile) => x.id === playable.id)!;
    const end = playable.ends[0] as "left" | "right";
    const matched = end === "left" ? s1.leftEnd : s1.rightEnd;
    const expectedOpen = t.a === matched ? t.b : t.a;
    const s2 = dominoes.applyMove(s1, next, { type: "play", tile: t.id, end });
    const newOpen = end === "left" ? s2.leftEnd : s2.rightEnd;
    assert.equal(newOpen, expectedOpen);
    assert.equal(totalTiles(s2), 28);
  }
});

test("illegal moves are rejected", () => {
  const s = dominoes.initGame(players2, { seed: 9 });
  const active = activePlayer(s.turn);
  const other = players2.find((p) => p.id !== active)!.id;
  // wrong player
  assert.equal(
    normalizeValidate(dominoes.validateMove(s, other, { type: "play", tile: s.hands[other][0].id, end: "left" })).ok,
    false,
  );
  // tile not in hand
  assert.equal(
    normalizeValidate(dominoes.validateMove(s, active, { type: "play", tile: "x-x", end: "left" })).ok,
    false,
  );
  // cannot pass when you have a legal play (opening = any tile is legal)
  assert.equal(normalizeValidate(dominoes.validateMove(s, active, { type: "pass" })).ok, false);
  // cannot draw when you have a legal play
  assert.equal(normalizeValidate(dominoes.validateMove(s, active, { type: "draw" })).ok, false);
});

test("draw variant: drawing pulls from boneyard when stuck", () => {
  // Construct a state where the active player cannot play and must draw.
  const s = dominoes.initGame(players2, { seed: 3 });
  const starter = activePlayer(s.turn);
  const v = dominoes.getPlayerView(s, starter) as any;
  // Play the opener so ends are set.
  const opener = v.hand[0] as Tile;
  let st = dominoes.applyMove(s, starter, { type: "play", tile: opener.id, end: "left" });

  // Force a known stuck state by replacing the next player's hand with tiles
  // that cannot match either open end.
  const next = activePlayer(st.turn);
  const ends = new Set([st.leftEnd, st.rightEnd]);
  const nonMatching: Tile[] = [];
  for (let a = 0; a <= 6 && nonMatching.length < 3; a++) {
    for (let b = a; b <= 6; b++) {
      if (!ends.has(a) && !ends.has(b)) {
        nonMatching.push({ id: `${a}-${b}`, a, b });
        break;
      }
    }
  }
  st = structuredClone(st);
  st.hands[next] = nonMatching;
  // ensure boneyard has at least one tile
  assert.ok(st.boneyard.length > 0);

  const before = st.hands[next].length;
  assert.equal(normalizeValidate(dominoes.validateMove(st, next, { type: "draw" })).ok, true);
  const boneBefore = st.boneyard.length;
  const after = dominoes.applyMove(st, next, { type: "draw" });
  assert.equal(after.hands[next].length, before + 1, "drew exactly one tile");
  // exactly one tile moved from boneyard into the hand
  assert.equal(after.boneyard.length, boneBefore - 1);
  // turn did not advance on draw
  assert.equal(activePlayer(after.turn), next);
});

test("block variant: pass when stuck (no draw allowed)", () => {
  const s = dominoes.initGame(players2, { seed: 3, variant: "block" });
  const starter = activePlayer(s.turn);
  const v = dominoes.getPlayerView(s, starter) as any;
  let st = dominoes.applyMove(s, starter, { type: "play", tile: v.hand[0].id, end: "left" });

  const next = activePlayer(st.turn);
  const ends = new Set([st.leftEnd, st.rightEnd]);
  const nonMatching: Tile[] = [];
  for (let a = 0; a <= 6 && nonMatching.length < 2; a++) {
    for (let b = a; b <= 6; b++) {
      if (!ends.has(a) && !ends.has(b)) {
        nonMatching.push({ id: `${a}-${b}`, a, b });
        break;
      }
    }
  }
  st = structuredClone(st);
  st.hands[next] = nonMatching;

  // drawing is illegal in block
  assert.equal(normalizeValidate(dominoes.validateMove(st, next, { type: "draw" })).ok, false);
  // passing is legal because no play and block variant
  assert.equal(normalizeValidate(dominoes.validateMove(st, next, { type: "pass" })).ok, true);
});

test("domino! emptying a hand ends the round with pip scoring", () => {
  // Build a contrived near-win: active player has one playable tile left.
  let s = dominoes.initGame(players2, { seed: 11 });
  s = structuredClone(s);
  // give 'a' a single tile [3|3], 'b' some leftover pips, set ends so [3|3] plays
  s.turn.activeIndex = s.turn.order.indexOf("a");
  s.hands["a"] = [{ id: "3-3", a: 3, b: 3 }];
  s.hands["b"] = [
    { id: "1-2", a: 1, b: 2 },
    { id: "4-5", a: 4, b: 5 },
  ];
  s.chain = [{ id: "0-3", left: 0, right: 3 }];
  s.leftEnd = 0;
  s.rightEnd = 3;
  s.boneyard = [];
  // re-deal boneyard padding so total stays 28? assert conservation explicitly
  const expectTotal = totalTiles(s);

  assert.equal(normalizeValidate(dominoes.validateMove(s, "a", { type: "play", tile: "3-3", end: "right" })).ok, true);
  const done = dominoes.applyMove(s, "a", { type: "play", tile: "3-3", end: "right" });
  assert.equal(done.finished, true);
  const over = dominoes.isGameOver(done)!;
  assert.deepEqual(over.winners, ["a"]);
  // winner scores sum of opponents' pips: (1+2) + (4+5) = 12
  assert.equal(over.scores!["a"], 12);
  // opponent reported as negative deadwood
  assert.equal(over.scores!["b"], -12);
  assert.equal(totalTiles(done), expectTotal);
});

test("blocked board ends round and scores by fewest pips", () => {
  // Two players, both stuck, both pass -> blocked. Lowest pip count wins.
  let s = dominoes.initGame(players2, { seed: 13, variant: "block" });
  s = structuredClone(s);
  s.turn.activeIndex = s.turn.order.indexOf("a");
  // ends are 6/6; give both players non-matching tiles. 'a' lighter than 'b'.
  s.chain = [{ id: "6-6", left: 6, right: 6 }];
  s.leftEnd = 6;
  s.rightEnd = 6;
  s.hands["a"] = [{ id: "0-1", a: 0, b: 1 }]; // 1 pip
  s.hands["b"] = [{ id: "4-5", a: 4, b: 5 }]; // 9 pips
  s.boneyard = [];

  // a passes (no play)
  assert.equal(normalizeValidate(dominoes.validateMove(s, "a", { type: "pass" })).ok, true);
  const s1 = dominoes.applyMove(s, "a", { type: "pass" });
  assert.equal(s1.finished, false);
  const b = activePlayer(s1.turn);
  assert.equal(b, "b");
  assert.equal(normalizeValidate(dominoes.validateMove(s1, "b", { type: "pass" })).ok, true);
  const s2 = dominoes.applyMove(s1, "b", { type: "pass" });
  assert.equal(s2.finished, true);
  const over = dominoes.isGameOver(s2)!;
  assert.deepEqual(over.winners, ["a"]);
  // winner gets opponent's pips
  assert.equal(over.scores!["a"], 9);
});

test("blocked board with tied pips → multiple winners", () => {
  let s = dominoes.initGame(players2, { seed: 17, variant: "block" });
  s = structuredClone(s);
  s.turn.activeIndex = s.turn.order.indexOf("a");
  s.chain = [{ id: "6-6", left: 6, right: 6 }];
  s.leftEnd = 6;
  s.rightEnd = 6;
  s.hands["a"] = [{ id: "0-2", a: 0, b: 2 }]; // 2 pips
  s.hands["b"] = [{ id: "1-1", a: 1, b: 1 }]; // 2 pips
  s.boneyard = [];
  const s1 = dominoes.applyMove(s, "a", { type: "pass" });
  const s2 = dominoes.applyMove(s1, "b", { type: "pass" });
  const over = dominoes.isGameOver(s2)!;
  assert.equal(over.winners.length, 2);
  assert.ok(over.winners.includes("a") && over.winners.includes("b"));
});

test("a full simulated draw game terminates with a winner", () => {
  let s: DominoesState = dominoes.initGame(players2, { seed: 42 });
  let guard = 0;
  while (!s.finished && guard++ < 2000) {
    const pid = activePlayer(s.turn);
    const view = dominoes.getPlayerView(s, pid) as any;
    let move: any;
    const playable = view.playable.find((p: any) => p.ends.length > 0);
    if (playable) {
      move = { type: "play", tile: playable.id, end: playable.ends[0] };
    } else if (view.canDraw) {
      move = { type: "draw" };
    } else {
      move = { type: "pass" };
    }
    const verdict = normalizeValidate(dominoes.validateMove(s, pid, move));
    assert.ok(verdict.ok, `move should be legal: ${JSON.stringify(move)} — ${verdict.error}`);
    s = dominoes.applyMove(s, pid, move);
    assert.equal(totalTiles(s), 28, "tiles must be conserved");
  }
  assert.ok(s.finished, "game should finish");
  const over = dominoes.isGameOver(s)!;
  assert.ok(over.winners.length >= 1, "there is at least one winner");
});

test("a full simulated 3-player block game terminates", () => {
  let s: DominoesState = dominoes.initGame(players3, { seed: 99, variant: "block" });
  let guard = 0;
  while (!s.finished && guard++ < 2000) {
    const pid = activePlayer(s.turn);
    const view = dominoes.getPlayerView(s, pid) as any;
    const playable = view.playable.find((p: any) => p.ends.length > 0);
    const move = playable
      ? { type: "play", tile: playable.id, end: playable.ends[0] }
      : { type: "pass" };
    const verdict = normalizeValidate(dominoes.validateMove(s, pid, move));
    assert.ok(verdict.ok, `legal: ${JSON.stringify(move)} — ${verdict.error}`);
    s = dominoes.applyMove(s, pid, move);
    assert.equal(totalTiles(s), 28);
  }
  assert.ok(s.finished);
});
