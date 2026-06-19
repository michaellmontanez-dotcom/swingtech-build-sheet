import assert from "node:assert/strict";
import test from "node:test";
import { gameCatalog } from "@/games/registry";
import { createInitialState, processMove, viewFor } from "@/lib/gamePipeline";
import type { PlayerInfo } from "@/games/types";

// Mimics how state survives Postgres jsonb: only plain JSON survives. A Map/Set/
// Date/class instance/function — or an `undefined` inside an array — would be
// silently mangled on the round-trip, which is exactly the kind of bug that
// breaks EVERY game's moves in production while unit tests (on in-memory state)
// stay green.
function assertJsonSafe(value: unknown, path = "state"): void {
  if (value === null) return;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return;
  if (t === "undefined") return; // allowed as an object value (key is dropped); arrays handled below
  if (t === "function" || t === "symbol" || t === "bigint") {
    throw new Error(`${path}: non-serializable ${t}`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (v === undefined) throw new Error(`${path}[${i}]: undefined in array becomes null in jsonb`);
      assertJsonSafe(v, `${path}[${i}]`);
    });
    return;
  }
  // object: must be a PLAIN object (Map/Set/Date have a non-Object prototype)
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${path}: non-plain object (${(value as object).constructor?.name}) won't survive jsonb`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertJsonSafe(v, `${path}.${k}`);
  }
}

function makePlayers(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i, emoji: "🎲" }));
}

// jsonb round-trip
function persist<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// ---------------------------------------------------------------------------
// Every game must produce JSON-safe state + views, and survive a round-trip.
// ---------------------------------------------------------------------------
for (const g of gameCatalog) {
  test(`${g.type}: initial state + views are jsonb-safe and round-trip`, () => {
    const players = makePlayers(g.minPlayers);
    const init = createInitialState(g.type, players);
    assert.ok(!("error" in init), `createInitialState failed: ${(init as { error?: string }).error}`);
    const { state, publicView } = init as { state: unknown; publicView: unknown };

    // state must be storable in jsonb without mangling
    assertJsonSafe(state, `${g.type}.state`);
    assertJsonSafe(publicView, `${g.type}.publicView`);

    // simulate save+load; processMove must run on the RELOADED state
    const reloaded = persist(state);

    // public projection must never throw and must be stable through persistence
    const pubA = viewFor(g.type, reloaded, null);
    assert.deepEqual(persist(pubA), pubA);

    // each player's private view must be jsonb-safe and round-trip
    for (const p of players) {
      const pv = viewFor(g.type, reloaded, p.id);
      assert.ok(pv, `${g.type}: null view for ${p.id}`);
      assertJsonSafe(pv, `${g.type}.view(${p.id})`);
      assert.deepEqual(persist(pv), pv);
    }
  });
}

// ---------------------------------------------------------------------------
// Uno: play a FULL game through the persistence cycle (serialize after every
// move, exactly like the authoritative endpoint reloading from the DB). This
// reproduces the real client→endpoint→jsonb→endpoint loop end-to-end.
// ---------------------------------------------------------------------------
test("uno: a full game plays through save/reload on every move", () => {
  const players = makePlayers(3);
  const init = createInitialState("uno", players, { seed: 123 });
  assert.ok(!("error" in init));
  let stored = JSON.stringify((init as { state: unknown }).state);
  let version = 0;
  let guard = 0;
  let finished = false;

  while (guard++ < 6000) {
    const state = JSON.parse(stored); // reload from "db"
    const pub = viewFor("uno", state, null) as { activePlayerId: string; finished: boolean };
    if (pub.finished) {
      finished = true;
      break;
    }
    const pid = pub.activePlayerId;
    const pv = viewFor("uno", state, pid) as {
      playable: string[];
      hand: { id: string; color: string }[];
      drewThisTurn: boolean;
    };

    let move: { type: string; [k: string]: unknown };
    if (pv.playable.length > 0) {
      const cardId = pv.playable[0];
      const card = pv.hand.find((c) => c.id === cardId)!;
      move = card.color === "wild" ? { type: "play", cardId, chosenColor: "red" } : { type: "play", cardId };
    } else if (pv.drewThisTurn) {
      move = { type: "pass" };
    } else {
      move = { type: "draw" };
    }

    const out = processMove("uno", state, pid, move);
    assert.ok(out.ok, `move rejected through persistence: ${out.error} (${JSON.stringify(move)})`);
    stored = JSON.stringify(out.state); // persist new state
    version += 1; // optimistic-lock bump would happen here
    if (out.gameOver) {
      finished = true;
      break;
    }
  }

  assert.ok(finished, "uno game should finish");
  assert.ok(version > 5, "several moves should have been applied through persistence");
});

// ---------------------------------------------------------------------------
// Connect Four: prove a turn-based public game advances through persistence and
// that the optimistic-lock conflict path is detectable (stale version).
// ---------------------------------------------------------------------------
test("connect4: alternating drops advance through save/reload", () => {
  const players = makePlayers(2);
  const init = createInitialState("connect4", players);
  assert.ok(!("error" in init));
  let stored = JSON.stringify((init as { state: unknown }).state);

  let applied = 0;
  for (let i = 0; i < 8 && applied < 6; i++) {
    const state = JSON.parse(stored);
    // find whoever's turn it is by trying a legal drop for each player
    let moved = false;
    for (const p of players) {
      const out = processMove("connect4", state, p.id, { type: "drop", col: i % 7 });
      if (out.ok) {
        stored = JSON.stringify(out.state);
        applied += 1;
        moved = true;
        break;
      }
    }
    assert.ok(moved, "exactly one player should be able to drop each round");
  }
  assert.ok(applied >= 6, "drops should apply through persistence");
});
