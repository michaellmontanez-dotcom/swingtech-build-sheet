import assert from "node:assert/strict";
import test from "node:test";
import { uno, type UnoState } from "@/games/uno/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
];

test("deck is 108 cards and deals 7 each", () => {
  const s = uno.initGame(players, { seed: 1 });
  const total = s.deck.length + s.discard.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0);
  assert.equal(total, 108);
  for (const p of players) assert.equal(s.hands[p.id].length, 7);
});

test("public view hides other hands, private view shows own", () => {
  const s = uno.initGame(players, { seed: 2 });
  const pub = uno.getPlayerView(s, null) as any;
  assert.equal(pub.hand.length, 0);
  assert.ok(pub.players.every((p: any) => typeof p.handCount === "number"));
  const priv = uno.getPlayerView(s, "a") as any;
  assert.equal(priv.hand.length, 7);
  assert.equal(priv.you, "a");
});

test("a full random game reaches a winner without illegal states", () => {
  let s: UnoState = uno.initGame(players, { seed: 42 });
  let guard = 0;
  while (!s.finished && guard++ < 5000) {
    const pid = activePlayer(s.turn);
    const view = uno.getPlayerView(s, pid) as any;
    let move: any;
    if (view.playable.length > 0) {
      const cardId = view.playable[0];
      const card = view.hand.find((c: any) => c.id === cardId);
      move = card.color === "wild" ? { type: "play", cardId, chosenColor: "red" } : { type: "play", cardId };
    } else if (view.drewThisTurn) {
      move = { type: "pass" };
    } else {
      move = { type: "draw" };
    }
    const verdict = normalizeValidate(uno.validateMove(s, pid, move));
    assert.ok(verdict.ok, `move should be legal: ${JSON.stringify(move)} — ${verdict.error}`);
    s = uno.applyMove(s, pid, move);
    // invariant: card conservation
    const total = s.deck.length + s.discard.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0);
    assert.equal(total, 108, "cards must be conserved");
  }
  assert.ok(s.finished, "game should finish");
  const winner = uno.isGameOver(s);
  assert.ok(winner && winner.winners.length === 1);
});

test("rejects a move from the wrong player", () => {
  const s = uno.initGame(players, { seed: 7 });
  const notActive = players.find((p) => p.id !== activePlayer(s.turn))!;
  const v = normalizeValidate(uno.validateMove(s, notActive.id, { type: "draw" }));
  assert.equal(v.ok, false);
});
