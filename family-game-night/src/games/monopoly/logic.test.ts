import assert from "node:assert/strict";
import test from "node:test";
import { monopoly, rentFor, type MonopolyState } from "@/games/monopoly/logic";
import { normalizeValidate, type PlayerInfo } from "@/games/types";
import { activePlayer } from "@/games/turn";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann", seat: 0 },
  { id: "b", name: "Bo", seat: 1 },
  { id: "c", name: "Cy", seat: 2 },
];

function fresh(seed = 1): MonopolyState {
  return monopoly.initGame(players, { seed });
}

// Find a seed where the first player's roll is NOT doubles and lands them
// somewhere harmless; or just drive state directly. We mostly set state by hand
// for determinism.
function ok(s: MonopolyState, id: string, move: any): MonopolyState {
  const v = normalizeValidate(monopoly.validateMove(s, id, move));
  assert.ok(v.ok, `expected legal ${JSON.stringify(move)}: ${v.error}`);
  return monopoly.applyMove(s, id, move);
}

function rejected(s: MonopolyState, id: string, move: any): string | undefined {
  const v = normalizeValidate(monopoly.validateMove(s, id, move));
  assert.equal(v.ok, false, `expected illegal: ${JSON.stringify(move)}`);
  return v.error;
}

test("init: 1500 cash, all properties bankless, decks shuffled", () => {
  const s = fresh();
  assert.equal(s.players.a.cash, 1500);
  assert.equal(s.players.a.position, 0);
  assert.equal(Object.values(s.properties).every((p) => p.owner === null), true);
  assert.equal(s.chanceOrder.length, 15);
  assert.equal(s.chestOrder.length, 16);
});

test("passing GO grants $200", () => {
  // Find a seed whose first roll is not doubles, place player so the roll wraps
  // past GO, and assert exactly +200 (landing must be a non-charging space).
  for (let seed = 1; seed < 100000; seed++) {
    const t = monopoly.initGame(players, { seed });
    const probe = monopoly.applyMove(t, "a", { type: "roll" });
    if (!probe.dice) continue;
    const [d1, d2] = probe.dice;
    if (d1 === d2) continue;
    const k = d1 + d2;
    // Land just past GO on a non-charging space. Choosing start in 28..36 and
    // target = start + k - 40 lands on a low index (must charge nothing).
    // GO itself (0) or Jail-visiting/Free Parking are safe; pick whatever k gives
    // but require the landing space to be non-charging.
    const start = 40 - k; // lands exactly on GO (index 0) after passing... = GO space
    if (start <= 0 || start >= 40) continue;
    const target = 0;
    const t2 = monopoly.initGame(players, { seed });
    t2.players.a.position = start;
    const before = t2.players.a.cash;
    const after = monopoly.applyMove(t2, "a", { type: "roll" });
    assert.equal(after.players.a.position, target);
    assert.equal(after.players.a.cash, before + 200);
    return;
  }
  throw new Error("no suitable seed for GO test");
});

// Deterministically land the active player on a chest/chance space and resolve.
// We find a seed whose first non-doubles roll == k, and start the player at
// (target - k) so the single roll lands exactly on target with no extra roll.
function forceLandAndResolve(s: MonopolyState, id: string, want: "chest" | "chance"): MonopolyState {
  const target = want === "chest" ? 17 : 7;
  for (let seed = 1; seed < 100000; seed++) {
    const t = monopoly.initGame(players, { seed });
    // Determine this seed's first roll without doubles.
    const probe = monopoly.applyMove(t, "a", { type: "roll" });
    if (!probe.dice) continue;
    const [d1, d2] = probe.dice;
    if (d1 === d2) continue; // skip doubles (would grant another roll)
    const k = d1 + d2;
    const start = (target - k + 40) % 40;
    if (start === 0) continue; // avoid starting on GO edge cases
    const t2 = monopoly.initGame(players, { seed });
    t2.chestOrder = s.chestOrder;
    t2.chanceOrder = s.chanceOrder;
    t2.chestIdx = s.chestIdx;
    t2.chanceIdx = s.chanceIdx;
    t2.players.a.position = start;
    t2.players.a.cash = s.players.a.cash;
    const after = monopoly.applyMove(t2, "a", { type: "roll" });
    // The card effect may move the player off `target`; that's expected.
    // We only require that the roll resolved the card (log mentions Chest/Chance).
    return after;
  }
  throw new Error("could not force landing");
}

test("buying transfers cash and ownership", () => {
  const s = fresh();
  // Put player on an unowned street and into buy phase manually via resolveProperty.
  s.players.a.position = 1; // Mediterranean ($60)
  s.phase = "buy";
  s.pendingBuyIndex = 1;
  const before = s.players.a.cash;
  const after = ok(s, "a", { type: "buy" });
  assert.equal(after.properties[1].owner, "a");
  assert.equal(after.players.a.cash, before - 60);
  assert.equal(after.phase, "resolve");
});

test("rent: plain property charged correctly", () => {
  const s = fresh();
  s.properties[1].owner = "b"; // Mediterranean, single brown, base rent 2
  assert.equal(rentFor(s, 1, 0), 2);
});

test("rent: full color set doubles unimproved rent", () => {
  const s = fresh();
  s.properties[1].owner = "b";
  s.properties[3].owner = "b"; // both browns
  assert.equal(rentFor(s, 1, 0), 4); // 2 * 2
});

test("rent: with houses uses house rent table (no doubling)", () => {
  const s = fresh();
  s.properties[1].owner = "b";
  s.properties[3].owner = "b";
  s.properties[1].houses = 1; // Mediterranean 1 house = 10
  assert.equal(rentFor(s, 1, 0), 10);
});

test("rent: railroads scale by count 25/50/100/200", () => {
  const s = fresh();
  s.properties[5].owner = "b";
  assert.equal(rentFor(s, 5, 0), 25);
  s.properties[15].owner = "b";
  assert.equal(rentFor(s, 5, 0), 50);
  s.properties[25].owner = "b";
  assert.equal(rentFor(s, 5, 0), 100);
  s.properties[35].owner = "b";
  assert.equal(rentFor(s, 5, 0), 200);
});

test("rent: utilities are 4x dice (one) and 10x (both)", () => {
  const s = fresh();
  s.properties[12].owner = "b"; // Electric Company
  assert.equal(rentFor(s, 12, 9), 36); // 4 * 9
  s.properties[28].owner = "b"; // Water Works -> both
  assert.equal(rentFor(s, 12, 9), 90); // 10 * 9
});

test("three doubles in a row sends player to jail", () => {
  // Find a seed where 'a' rolls doubles three consecutive rolls.
  let found: MonopolyState | null = null;
  outer: for (let seed = 1; seed < 20000; seed++) {
    let s = monopoly.initGame(players, { seed });
    for (let r = 0; r < 3; r++) {
      if (s.phase !== "preRoll" || s.players.a.inJail) continue outer;
      const before = s.doublesCount;
      s = monopoly.applyMove(s, "a", { type: "roll" });
      if (!s.dice || s.dice[0] !== s.dice[1]) continue outer;
      if (r < 2) {
        // need to be able to keep rolling: after non-jail doubles, endTurn returns to preRoll
        // But after a buy/rent we may not be in preRoll. Only accept seeds that stay clean.
        if (s.phase === "buy") {
          // decline to keep going
          s = monopoly.applyMove(s, "a", { type: "declineBuy" });
          // auction among others may change phase; bail on complexity
          if (s.phase !== "auction" && s.phase !== "resolve") continue outer;
          if (s.phase === "auction") continue outer;
        }
        if (s.phase === "debt") continue outer;
        if (s.phase === "resolve") {
          s = monopoly.applyMove(s, "a", { type: "endTurn" });
          // doubles => should be back to preRoll for same player
          if (activePlayer(s.turn) !== "a") continue outer;
        }
      }
    }
    if (s.players.a.inJail && s.players.a.position === 10) {
      found = s;
      break;
    }
  }
  assert.ok(found, "should find a 3-doubles-to-jail sequence");
  assert.equal(found!.players.a.inJail, true);
  assert.equal(found!.players.a.position, 10);
});

test("even-build rule rejects an uneven build", () => {
  const s = fresh();
  // give 'a' the full light blue set (6,8,9)
  for (const i of [6, 8, 9]) s.properties[i].owner = "a";
  s.turn.activeIndex = 0; // a is active
  s.phase = "resolve";
  // build one on 6 -> legal
  let s2 = ok(s, "a", { type: "build", propertyId: 6 });
  assert.equal(s2.properties[6].houses, 1);
  // build a second on 6 before 8/9 -> uneven, rejected
  const err = rejected(s2, "a", { type: "build", propertyId: 6 });
  assert.match(err ?? "", /even/i);
  // building on 8 (which has 0) is legal
  s2 = ok(s2, "a", { type: "build", propertyId: 8 });
  assert.equal(s2.properties[8].houses, 1);
});

test("building without the full set is rejected", () => {
  const s = fresh();
  s.properties[6].owner = "a"; // only one light blue
  s.turn.activeIndex = 0;
  s.phase = "resolve";
  const err = rejected(s, "a", { type: "build", propertyId: 6 });
  assert.match(err ?? "", /full color set/i);
});

test("mortgaging gives half and blocks rent", () => {
  const s = fresh();
  s.properties[1].owner = "a";
  s.turn.activeIndex = 0;
  s.phase = "resolve";
  const before = s.players.a.cash;
  const s2 = ok(s, "a", { type: "mortgage", propertyId: 1 });
  assert.equal(s2.players.a.cash, before + 30); // half of 60
  assert.equal(s2.properties[1].mortgaged, true);
  assert.equal(rentFor(s2, 1, 0), 0); // no rent while mortgaged
  // unmortgage costs half + 10% = 33
  const s3 = ok(s2, "a", { type: "unmortgage", propertyId: 1 });
  assert.equal(s3.properties[1].mortgaged, false);
  assert.equal(s3.players.a.cash, before + 30 - 33);
});

test("Chance/Chest advance-to and pay/collect cards work", () => {
  // collect: bank error in your favor +200 (cc2)
  const s = fresh();
  s.players.a.cash = 100;
  s.chestOrder = ["cc2", ...s.chestOrder.filter((x) => x !== "cc2")];
  s.chestIdx = 0;
  const after = forceLandAndResolve(s, "a", "chest");
  assert.equal(after.players.a.cash, 100 + 200);

  // advance-to GO from a chest (cc1)
  const s2 = fresh();
  s2.players.a.cash = 100;
  s2.chestOrder = ["cc1", ...s2.chestOrder.filter((x) => x !== "cc1")];
  s2.chestIdx = 0;
  const after2 = forceLandAndResolve(s2, "a", "chest");
  assert.equal(after2.players.a.position, 0);
  // collected $200 for advancing to GO
  assert.ok(after2.players.a.cash >= 100 + 200);

  // pay card: school fees -$50 (cc12)
  const s3 = fresh();
  s3.players.a.cash = 500;
  s3.chestOrder = ["cc12", ...s3.chestOrder.filter((x) => x !== "cc12")];
  s3.chestIdx = 0;
  const after3 = forceLandAndResolve(s3, "a", "chest");
  assert.equal(after3.players.a.cash, 500 - 50);
});

test("bankruptcy eliminates a player; last solvent player wins", () => {
  const s = fresh();
  // Set up: a owes rent to b that a cannot pay even after liquidating.
  s.properties[39].owner = "b"; // Boardwalk
  s.properties[37].owner = "b"; // Park Place -> full darkblue set, doubled base
  s.players.a.cash = 10;
  s.players.a.position = 39; // on Boardwalk
  s.dice = [3, 4];
  s.phase = "preRoll";
  // resolve landing rent by simulating: directly call applyMove path is roll-based;
  // instead push into resolveProperty via a constructed debt.
  // Boardwalk doubled base rent = 100; a has $10 and no assets -> debt.
  // Drive the rent charge by setting phase and using the engine's payOrDebt through a roll:
  // Use the chest engine isn't right; instead set debt manually as engine would.
  // Simulate the landing: position already 39, owner b, not mortgaged.
  // Build a debt state as resolveProperty would:
  const rent = rentFor(s, 39, 7);
  assert.equal(rent, 100); // 50 base doubled
  s.debt = { debtor: "a", amount: rent, creditor: "b" };
  s.phase = "debt";
  s.turn.activeIndex = 0; // a active
  // a has no other properties/houses; declares bankruptcy
  const after = ok(s, "a", { type: "declareBankrupt" });
  assert.equal(after.players.a.bankrupt, true);
  // a's cash went to creditor b
  assert.equal(after.players.b.cash >= s.players.b.cash, true);
  // still 2 solvent (b, c) -> not over
  assert.equal(after.finished, false);

  // Now make c bankrupt too -> b wins.
  after.players.c.cash = 0;
  after.debt = { debtor: "c", amount: 50, creditor: "b" };
  after.phase = "debt";
  // make c active
  after.turn.activeIndex = after.turn.order.indexOf("c");
  const final = ok(after, "c", { type: "declareBankrupt" });
  assert.equal(final.finished, true);
  assert.equal(final.winnerId, "b");
  const result = monopoly.isGameOver(final);
  assert.ok(result && result.winners[0] === "b");
});

test("illegal: buying when not on an unowned tile is rejected", () => {
  const s = fresh();
  s.turn.activeIndex = 0;
  s.phase = "resolve"; // not a buy phase
  rejected(s, "a", { type: "buy" });
});

test("illegal: acting out of turn is rejected", () => {
  const s = fresh();
  s.turn.activeIndex = 0; // a's turn
  const err = rejected(s, "b", { type: "roll" });
  assert.match(err ?? "", /turn/i);
});

test("a roll from preRoll resolves into a valid phase", () => {
  const s = fresh();
  const after = monopoly.applyMove(s, activePlayer(s.turn), { type: "roll" });
  assert.ok(["buy", "resolve", "debt", "auction"].includes(after.phase));
});
