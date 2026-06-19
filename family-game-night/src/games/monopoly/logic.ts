import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, type RNG } from "@/games/rng";
import { advance, initTurn, isActive, activePlayer, removePlayer, type TurnState } from "@/games/turn";
import {
  BOARD,
  CHANCE_CARDS,
  CHEST_CARDS,
  GROUP_SIZE,
  HOUSE_COST,
  RAILROAD_RENT,
  JAIL_INDEX,
  GO_SALARY,
  type BoardSpace,
  type DeckCard,
  type CardAction,
} from "@/games/monopoly/data";

// ============================================================================
// Monopoly — faithful standard US edition.
//
// Phases model a multi-step turn:
//   "preRoll"   — active player must roll (or, if in jail, roll/pay/use-card)
//   "buy"       — landed on an unowned property: buy or decline (→ auction)
//   "auction"   — players bid for the declined property
//   "resolve"   — landed-space effect applied; player may build/mortgage/manage
//                 then must endTurn (or take a granted extra roll on doubles)
//   "debt"      — active player owes money they can't immediately pay; they must
//                 raise funds (mortgage/sell) or declareBankrupt
//   "gameOver"
// ============================================================================

export type Phase = "preRoll" | "buy" | "auction" | "resolve" | "debt" | "gameOver";

export interface PropertyState {
  owner: string | null; // player id or null (bank)
  houses: number; // 0..5 (5 = hotel); 0 for railroads/utilities
  mortgaged: boolean;
}

export interface MPlayer {
  id: string;
  name: string;
  emoji: string | null;
  cash: number;
  position: number; // 0..39
  inJail: boolean;
  jailTurns: number; // turns spent trying to roll out (0..3)
  getOutCards: number; // Get Out of Jail Free cards held
  bankrupt: boolean;
}

export interface AuctionState {
  propertyIndex: number;
  bidders: string[]; // ids still in the auction (in order)
  turnIdx: number; // index into bidders whose bid it is
  highBid: number;
  highBidder: string | null;
}

export interface DebtState {
  debtor: string;
  amount: number;
  creditor: string | null; // null = bank
}

export interface MonopolyState {
  players: Record<string, MPlayer>;
  turn: TurnState;
  properties: Record<number, PropertyState>; // keyed by board index (only ownable spaces)
  phase: Phase;
  // dice
  dice: [number, number] | null;
  doublesCount: number; // consecutive doubles this turn
  rolledThisTurn: boolean;
  // card decks (order is hidden in public view)
  chanceOrder: string[];
  chestOrder: string[];
  chanceIdx: number;
  chestIdx: number;
  // contextual sub-states
  pendingBuyIndex: number | null; // property awaiting buy/decline
  auction: AuctionState | null;
  debt: DebtState | null;
  seed: number;
  rngCounter: number;
  log: string[];
  finished: boolean;
  winnerId: string | null;
}

const STARTING_CASH = 1500;

// Derive a fresh rng per dice roll / card draw, like Uno's nextRng.
function nextRng(state: MonopolyState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

function space(index: number): BoardSpace {
  return BOARD[index];
}

function isOwnable(index: number): boolean {
  const t = space(index).type;
  return t === "street" || t === "railroad" || t === "utility";
}

function name(s: MonopolyState, id: string): string {
  return s.players[id]?.name ?? "Player";
}

// All board indices in a color group.
function groupIndices(group: string): number[] {
  return BOARD.filter((b) => b.group === group).map((b) => b.index);
}

// Does `owner` own every property in this group (regardless of mortgage)?
function ownsFullGroup(s: MonopolyState, owner: string, group: string): boolean {
  const idxs = groupIndices(group);
  return idxs.length > 0 && idxs.every((i) => s.properties[i]?.owner === owner);
}

function countRailroads(s: MonopolyState, owner: string): number {
  return groupIndices("railroad").filter((i) => s.properties[i]?.owner === owner).length;
}

function countUtilities(s: MonopolyState, owner: string): number {
  return groupIndices("utility").filter((i) => s.properties[i]?.owner === owner).length;
}

// ----------------------------------------------------------------------------
// Rent calculation
// ----------------------------------------------------------------------------
export function rentFor(s: MonopolyState, index: number, diceTotal: number): number {
  const sp = space(index);
  const prop = s.properties[index];
  if (!prop || !prop.owner || prop.mortgaged) return 0;
  const owner = prop.owner;

  if (sp.type === "street") {
    const rentTable = sp.rent!;
    if (prop.houses > 0) {
      return rentTable[prop.houses]; // 1..5 (5 = hotel)
    }
    // Unimproved: double rent if owner holds the full (any-mortgage) color set.
    const base = rentTable[0];
    return ownsFullGroup(s, owner, sp.group!) ? base * 2 : base;
  }

  if (sp.type === "railroad") {
    const count = countRailroads(s, owner);
    return RAILROAD_RENT[count];
  }

  if (sp.type === "utility") {
    const count = countUtilities(s, owner);
    // 4x dice for one utility, 10x for both.
    return (count >= 2 ? 10 : 4) * diceTotal;
  }

  return 0;
}

// Total houses + hotels a player owns (for repair cards).
function countBuildings(s: MonopolyState, owner: string): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const sp of BOARD) {
    const p = s.properties[sp.index];
    if (p && p.owner === owner) {
      if (p.houses === 5) hotels++;
      else houses += p.houses;
    }
  }
  return { houses, hotels };
}

// Net worth = cash + half-price of unmortgaged property + house resale value.
export function netWorth(s: MonopolyState, id: string): number {
  let total = s.players[id]?.cash ?? 0;
  for (const sp of BOARD) {
    const p = s.properties[sp.index];
    if (!p || p.owner !== id) continue;
    if (!p.mortgaged) total += (sp.price ?? 0) / 2;
    if (p.houses > 0 && sp.houseCost) total += (p.houses * sp.houseCost) / 2;
  }
  return Math.floor(total);
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const monopoly: GameModule<MonopolyState> = {
  type: "monopoly",
  name: "Monopoly",
  emoji: "🎩",
  blurb: "Buy, build, bankrupt — own it all on the classic board.",
  minPlayers: 2,
  maxPlayers: 6,

  initGame(playerInfos: PlayerInfo[], config): MonopolyState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const ordered = [...playerInfos].sort((a, b) => a.seat - b.seat);

    const players: Record<string, MPlayer> = {};
    for (const p of ordered) {
      players[p.id] = {
        id: p.id,
        name: p.name,
        emoji: p.emoji ?? null,
        cash: STARTING_CASH,
        position: 0,
        inJail: false,
        jailTurns: 0,
        getOutCards: 0,
        bankrupt: false,
      };
    }

    const properties: Record<number, PropertyState> = {};
    for (const sp of BOARD) {
      if (isOwnable(sp.index)) {
        properties[sp.index] = { owner: null, houses: 0, mortgaged: false };
      }
    }

    const turn = initTurn(ordered.map((p) => p.id));

    const state: MonopolyState = {
      players,
      turn,
      properties,
      phase: "preRoll",
      dice: null,
      doublesCount: 0,
      rolledThisTurn: false,
      chanceOrder: [],
      chestOrder: [],
      chanceIdx: 0,
      chestIdx: 0,
      pendingBuyIndex: null,
      auction: null,
      debt: null,
      seed,
      rngCounter: 0,
      log: ["Game started — everyone gets $1500."],
      finished: false,
      winnerId: null,
    };

    // Shuffle the two decks deterministically.
    state.chanceOrder = shuffleIds(state, CHANCE_CARDS.map((c) => c.id));
    state.chestOrder = shuffleIds(state, CHEST_CARDS.map((c) => c.id));
    return state;
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    const p = state.players[playerId];
    if (!p || p.bankrupt) return { ok: false, error: "You're not in the game." };

    // Auction bids may come from non-active players.
    if (state.phase === "auction") {
      return validateAuctionMove(state, playerId, move);
    }

    if (!isActive(state.turn, playerId)) {
      return { ok: false, error: "Not your turn." };
    }

    switch (move.type) {
      case "roll": {
        if (state.phase !== "preRoll") return { ok: false, error: "You can't roll now." };
        if (p.inJail) return { ok: false, error: "You're in jail — roll for doubles, pay, or use a card." };
        return { ok: true };
      }
      case "rollJail": {
        if (state.phase !== "preRoll" || !p.inJail) return { ok: false, error: "Not in jail." };
        return { ok: true };
      }
      case "payJail": {
        if (state.phase !== "preRoll" || !p.inJail) return { ok: false, error: "Not in jail." };
        if (p.cash < 50) return { ok: false, error: "Not enough cash for bail." };
        return { ok: true };
      }
      case "useJailCard": {
        if (state.phase !== "preRoll" || !p.inJail) return { ok: false, error: "Not in jail." };
        if (p.getOutCards < 1) return { ok: false, error: "No Get Out of Jail Free card." };
        return { ok: true };
      }
      case "buy": {
        if (state.phase !== "buy" || state.pendingBuyIndex === null)
          return { ok: false, error: "Nothing to buy." };
        const price = space(state.pendingBuyIndex).price!;
        if (p.cash < price) return { ok: false, error: "Not enough cash to buy." };
        return { ok: true };
      }
      case "declineBuy": {
        if (state.phase !== "buy" || state.pendingBuyIndex === null)
          return { ok: false, error: "Nothing to decline." };
        return { ok: true };
      }
      case "build": {
        return validateBuild(state, playerId, move.propertyId as number);
      }
      case "sellHouse": {
        return validateSellHouse(state, playerId, move.propertyId as number);
      }
      case "mortgage": {
        return validateMortgage(state, playerId, move.propertyId as number);
      }
      case "unmortgage": {
        return validateUnmortgage(state, playerId, move.propertyId as number);
      }
      case "endTurn": {
        if (state.phase !== "resolve") return { ok: false, error: "You can't end your turn now." };
        return { ok: true };
      }
      case "declareBankrupt": {
        if (state.phase !== "debt") return { ok: false, error: "You're not in debt." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): MonopolyState {
    const s: MonopolyState = structuredClone(state);
    switch (move.type) {
      case "roll":
        doRoll(s, playerId);
        break;
      case "rollJail":
        doRollJail(s, playerId);
        break;
      case "payJail":
        payJail(s, playerId);
        break;
      case "useJailCard":
        useJailCard(s, playerId);
        break;
      case "buy":
        doBuy(s, playerId);
        break;
      case "declineBuy":
        startAuction(s);
        break;
      case "bid":
        doBid(s, playerId, move.amount as number);
        break;
      case "passBid":
        passBid(s, playerId);
        break;
      case "build":
        doBuild(s, playerId, move.propertyId as number);
        break;
      case "sellHouse":
        doSellHouse(s, playerId, move.propertyId as number);
        break;
      case "mortgage":
        doMortgage(s, playerId, move.propertyId as number);
        break;
      case "unmortgage":
        doUnmortgage(s, playerId, move.propertyId as number);
        break;
      case "endTurn":
        endTurn(s);
        break;
      case "declareBankrupt":
        declareBankrupt(s, playerId);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished || !state.winnerId) return null;
    return {
      winners: [state.winnerId],
      scores: Object.fromEntries(
        Object.keys(state.players).map((id) => [id, netWorth(state, id)])
      ),
      reason: `${name(state, state.winnerId)} is the last tycoon standing!`,
    };
  },

  getPlayerView(state, playerId) {
    const board = BOARD.map((sp) => {
      const prop = state.properties[sp.index];
      return {
        index: sp.index,
        name: sp.name,
        type: sp.type,
        group: sp.group ?? null,
        price: sp.price ?? null,
        owner: prop?.owner ?? null,
        houses: prop?.houses ?? 0,
        mortgaged: prop?.mortgaged ?? false,
      };
    });

    const players = state.turn.order.map((id) => {
      const pl = state.players[id];
      return {
        id,
        name: pl.name,
        emoji: pl.emoji,
        cash: pl.cash,
        position: pl.position,
        inJail: pl.inJail,
        getOutCards: pl.getOutCards,
        bankrupt: pl.bankrupt,
        netWorth: netWorth(state, id),
        properties: BOARD.filter((sp) => state.properties[sp.index]?.owner === id).map((sp) => sp.index),
      };
    });

    const pub = {
      type: "monopoly" as const,
      board,
      players,
      activePlayerId: activePlayer(state.turn),
      phase: state.phase,
      dice: state.dice,
      doublesCount: state.doublesCount,
      pendingBuyIndex: state.pendingBuyIndex,
      auction: state.auction
        ? {
            propertyIndex: state.auction.propertyIndex,
            propertyName: space(state.auction.propertyIndex).name,
            highBid: state.auction.highBid,
            highBidder: state.auction.highBidder,
            currentBidder: state.auction.bidders[state.auction.turnIdx] ?? null,
            bidders: state.auction.bidders,
          }
        : null,
      debt: state.debt,
      finished: state.finished,
      winnerId: state.winnerId,
      log: state.log.slice(-8),
    };

    if (!playerId || !state.players[playerId]) {
      return { ...pub, you: null, actions: [] as string[] };
    }
    return {
      ...pub,
      you: playerId,
      actions: availableActions(state, playerId),
    };
  },
};

// ----------------------------------------------------------------------------
// Action discovery (what can `playerId` do right now)
// ----------------------------------------------------------------------------
function availableActions(s: MonopolyState, playerId: string): string[] {
  const acts: string[] = [];
  const p = s.players[playerId];
  if (!p || p.bankrupt || s.finished) return acts;

  if (s.phase === "auction") {
    const cur = s.auction!.bidders[s.auction!.turnIdx];
    if (cur === playerId) {
      acts.push("bid", "passBid");
    }
    return acts;
  }

  if (!isActive(s.turn, playerId)) return acts;

  switch (s.phase) {
    case "preRoll":
      if (p.inJail) {
        acts.push("rollJail");
        if (p.cash >= 50) acts.push("payJail");
        if (p.getOutCards >= 1) acts.push("useJailCard");
      } else {
        acts.push("roll");
      }
      break;
    case "buy":
      if (p.cash >= (space(s.pendingBuyIndex!).price ?? 0)) acts.push("buy");
      acts.push("declineBuy");
      break;
    case "resolve":
      acts.push("endTurn");
      if (canBuildAny(s, playerId)) acts.push("build");
      if (canSellAny(s, playerId)) acts.push("sellHouse");
      if (canMortgageAny(s, playerId)) acts.push("mortgage");
      if (canUnmortgageAny(s, playerId)) acts.push("unmortgage");
      break;
    case "debt":
      acts.push("declareBankrupt");
      if (canSellAny(s, playerId)) acts.push("sellHouse");
      if (canMortgageAny(s, playerId)) acts.push("mortgage");
      break;
  }
  return acts;
}

function canBuildAny(s: MonopolyState, id: string): boolean {
  return BOARD.some((sp) => normalizeValidateOk(validateBuild(s, id, sp.index)));
}
function canSellAny(s: MonopolyState, id: string): boolean {
  return BOARD.some((sp) => normalizeValidateOk(validateSellHouse(s, id, sp.index)));
}
function canMortgageAny(s: MonopolyState, id: string): boolean {
  return BOARD.some((sp) => normalizeValidateOk(validateMortgage(s, id, sp.index)));
}
function canUnmortgageAny(s: MonopolyState, id: string): boolean {
  return BOARD.some((sp) => normalizeValidateOk(validateUnmortgage(s, id, sp.index)));
}
function normalizeValidateOk(r: ValidateResult): boolean {
  return typeof r === "boolean" ? r : r.ok;
}

// ----------------------------------------------------------------------------
// Rolling & movement
// ----------------------------------------------------------------------------
function rollDice(s: MonopolyState): [number, number] {
  const rng = nextRng(s);
  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  return [d1, d2];
}

function doRoll(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  const [d1, d2] = rollDice(s);
  s.dice = [d1, d2];
  const doubles = d1 === d2;
  if (doubles) {
    s.doublesCount += 1;
    if (s.doublesCount >= 3) {
      s.log.push(`${name(s, playerId)} rolled doubles 3 times — off to Jail!`);
      sendToJail(s, p);
      s.doublesCount = 0;
      s.phase = "resolve";
      s.rolledThisTurn = true;
      return;
    }
  }
  s.rolledThisTurn = true;
  s.log.push(`${name(s, playerId)} rolled ${d1} + ${d2}${doubles ? " (doubles!)" : ""}.`);
  movePlayer(s, playerId, d1 + d2);
}

// Move forward `steps`, awarding GO salary if passing, then resolve landing.
function movePlayer(s: MonopolyState, playerId: string, steps: number) {
  const p = s.players[playerId];
  const newPos = (p.position + steps) % 40;
  if (p.position + steps >= 40 && steps > 0) {
    p.cash += GO_SALARY;
    s.log.push(`${name(s, playerId)} passed GO, collect $${GO_SALARY}.`);
  }
  p.position = newPos;
  resolveLanding(s, playerId);
}

// Move directly to an index (used by cards); award GO if collectGo & passed.
function advanceTo(s: MonopolyState, playerId: string, index: number, collectGo: boolean) {
  const p = s.players[playerId];
  if (collectGo && index < p.position) {
    p.cash += GO_SALARY;
    s.log.push(`${name(s, playerId)} passed GO, collect $${GO_SALARY}.`);
  }
  p.position = index;
  resolveLanding(s, playerId);
}

function resolveLanding(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  const sp = space(p.position);
  s.log.push(`${name(s, playerId)} landed on ${sp.name}.`);

  switch (sp.type) {
    case "go":
    case "jail": // just visiting
    case "freeParking":
      s.phase = "resolve";
      break;
    case "goToJail":
      sendToJail(s, p);
      s.phase = "resolve";
      break;
    case "tax":
      chargeTax(s, playerId, sp.taxAmount!);
      break;
    case "street":
    case "railroad":
    case "utility":
      resolveProperty(s, playerId);
      break;
    case "chance":
      drawCard(s, playerId, "chance");
      break;
    case "chest":
      drawCard(s, playerId, "chest");
      break;
  }
  // If a card/landing left an unresolved debt or buy/auction, the phase reflects it.
  if (s.phase === "resolve" || s.phase === "preRoll") {
    // no-op; settled
  }
}

function resolveProperty(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  const idx = p.position;
  const prop = s.properties[idx];
  if (!prop.owner) {
    // Unowned — offer to buy.
    s.pendingBuyIndex = idx;
    s.phase = "buy";
    return;
  }
  if (prop.owner === playerId) {
    s.phase = "resolve";
    return; // own property
  }
  if (prop.mortgaged) {
    s.log.push(`${space(idx).name} is mortgaged — no rent.`);
    s.phase = "resolve";
    return;
  }
  const diceTotal = s.dice ? s.dice[0] + s.dice[1] : 0;
  const rent = rentFor(s, idx, diceTotal);
  s.log.push(`${name(s, playerId)} owes $${rent} rent to ${name(s, prop.owner)}.`);
  payOrDebt(s, playerId, rent, prop.owner);
}

function chargeTax(s: MonopolyState, playerId: string, amount: number) {
  s.log.push(`${name(s, playerId)} pays $${amount} tax.`);
  payOrDebt(s, playerId, amount, null);
}

// Pay `amount` to creditor (null = bank). If insufficient cash, enter debt phase.
function payOrDebt(s: MonopolyState, debtorId: string, amount: number, creditor: string | null) {
  const p = s.players[debtorId];
  if (amount <= 0) {
    s.phase = "resolve";
    return;
  }
  if (p.cash >= amount) {
    p.cash -= amount;
    if (creditor) s.players[creditor].cash += amount;
    s.phase = "resolve";
    return;
  }
  // Can't pay outright — but maybe assets can cover it.
  s.debt = { debtor: debtorId, amount, creditor };
  s.phase = "debt";
}

// ----------------------------------------------------------------------------
// Jail
// ----------------------------------------------------------------------------
function sendToJail(s: MonopolyState, p: MPlayer) {
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  s.doublesCount = 0;
  s.log.push(`${p.name} was sent to Jail.`);
}

function doRollJail(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  const [d1, d2] = rollDice(s);
  s.dice = [d1, d2];
  s.rolledThisTurn = true;
  if (d1 === d2) {
    s.log.push(`${name(s, playerId)} rolled doubles (${d1}) and leaves Jail!`);
    p.inJail = false;
    p.jailTurns = 0;
    movePlayer(s, playerId, d1 + d2);
    // Doubles out of jail does NOT grant another roll.
  } else {
    p.jailTurns += 1;
    if (p.jailTurns >= 3) {
      s.log.push(`${name(s, playerId)} failed 3 times — pays $50 and moves.`);
      payOrDebt(s, playerId, 50, null);
      p.inJail = false;
      p.jailTurns = 0;
      if (s.phase !== "debt") movePlayer(s, playerId, d1 + d2);
    } else {
      s.log.push(`${name(s, playerId)} stays in Jail (${d1}+${d2}).`);
      s.phase = "resolve";
    }
  }
}

function payJail(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  p.cash -= 50;
  p.inJail = false;
  p.jailTurns = 0;
  s.log.push(`${name(s, playerId)} paid $50 bail.`);
  // After paying bail the player still rolls this turn.
  s.phase = "preRoll";
}

function useJailCard(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  p.getOutCards -= 1;
  p.inJail = false;
  p.jailTurns = 0;
  s.log.push(`${name(s, playerId)} used a Get Out of Jail Free card.`);
  s.phase = "preRoll";
}

// ----------------------------------------------------------------------------
// Buying & auctions
// ----------------------------------------------------------------------------
function doBuy(s: MonopolyState, playerId: string) {
  const idx = s.pendingBuyIndex!;
  const price = space(idx).price!;
  const p = s.players[playerId];
  p.cash -= price;
  s.properties[idx].owner = playerId;
  s.log.push(`${name(s, playerId)} bought ${space(idx).name} for $${price}.`);
  s.pendingBuyIndex = null;
  s.phase = "resolve";
}

function startAuction(s: MonopolyState) {
  const idx = s.pendingBuyIndex!;
  // Auction among all solvent players, starting with the active player.
  const solvent = s.turn.order.filter((id) => !s.players[id].bankrupt);
  const startId = activePlayer(s.turn);
  const startPos = solvent.indexOf(startId);
  const bidders = [...solvent.slice(startPos), ...solvent.slice(0, startPos)];
  s.auction = {
    propertyIndex: idx,
    bidders,
    turnIdx: 0,
    highBid: 0,
    highBidder: null,
  };
  s.pendingBuyIndex = null;
  s.phase = "auction";
  s.log.push(`${space(idx).name} goes to auction!`);
  // If only one solvent player, they win at $0 (or it stays with bank if they pass).
}

function validateAuctionMove(s: MonopolyState, playerId: string, move: Move): ValidateResult {
  const a = s.auction!;
  const cur = a.bidders[a.turnIdx];
  if (cur !== playerId) return { ok: false, error: "Not your turn to bid." };
  if (move.type === "passBid") return { ok: true };
  if (move.type === "bid") {
    const amount = move.amount as number;
    if (!Number.isFinite(amount) || amount <= a.highBid)
      return { ok: false, error: `Bid must exceed $${a.highBid}.` };
    if (s.players[playerId].cash < amount) return { ok: false, error: "Not enough cash to bid that." };
    return { ok: true };
  }
  return { ok: false, error: "Only bid or pass during an auction." };
}

function doBid(s: MonopolyState, playerId: string, amount: number) {
  const a = s.auction!;
  a.highBid = amount;
  a.highBidder = playerId;
  s.log.push(`${name(s, playerId)} bids $${amount}.`);
  advanceAuction(s);
}

function passBid(s: MonopolyState, playerId: string) {
  const a = s.auction!;
  s.log.push(`${name(s, playerId)} passes.`);
  a.bidders = a.bidders.filter((id) => id !== playerId);
  // turnIdx now points at the next bidder naturally (since we removed current).
  if (a.turnIdx >= a.bidders.length) a.turnIdx = 0;
  finishOrContinueAuction(s);
}

function advanceAuction(s: MonopolyState) {
  const a = s.auction!;
  a.turnIdx = (a.turnIdx + 1) % a.bidders.length;
  finishOrContinueAuction(s);
}

function finishOrContinueAuction(s: MonopolyState) {
  const a = s.auction!;
  // Auction ends when at most one active bidder remains AND there's a high bid,
  // or everyone passed.
  if (a.bidders.length === 0) {
    s.log.push(`No bids — ${space(a.propertyIndex).name} stays with the bank.`);
    endAuction(s, null);
    return;
  }
  if (a.bidders.length === 1) {
    if (a.highBidder) {
      endAuction(s, a.highBidder);
    } else {
      // Single remaining bidder, no bid yet — they may bid or pass.
      a.turnIdx = 0;
    }
    return;
  }
}

function endAuction(s: MonopolyState, winnerId: string | null) {
  const a = s.auction!;
  if (winnerId && a.highBid > 0) {
    s.players[winnerId].cash -= a.highBid;
    s.properties[a.propertyIndex].owner = winnerId;
    s.log.push(`${name(s, winnerId)} wins ${space(a.propertyIndex).name} for $${a.highBid}.`);
  }
  s.auction = null;
  s.phase = "resolve";
}

// ----------------------------------------------------------------------------
// Building / mortgaging
// ----------------------------------------------------------------------------
function validateBuild(s: MonopolyState, id: string, index: number): ValidateResult {
  if (!isActive(s.turn, id)) return { ok: false, error: "Not your turn." };
  if (s.phase !== "resolve") return { ok: false, error: "Manage properties after resolving your move." };
  const sp = space(index);
  const prop = s.properties[index];
  if (!prop || prop.owner !== id) return { ok: false, error: "You don't own that." };
  if (sp.type !== "street") return { ok: false, error: "Can't build there." };
  if (!ownsFullGroup(s, id, sp.group!)) return { ok: false, error: "You need the full color set." };
  // No building if any property in the group is mortgaged.
  if (groupIndices(sp.group!).some((i) => s.properties[i].mortgaged))
    return { ok: false, error: "Unmortgage the set first." };
  if (prop.houses >= 5) return { ok: false, error: "Already a hotel." };
  // Even-build: this property's house count must be the min in the group.
  const counts = groupIndices(sp.group!).map((i) => s.properties[i].houses);
  if (prop.houses > Math.min(...counts)) return { ok: false, error: "Build evenly across the set." };
  const p = s.players[id];
  if (p.cash < sp.houseCost!) return { ok: false, error: "Not enough cash to build." };
  return { ok: true };
}

function doBuild(s: MonopolyState, id: string, index: number) {
  const sp = space(index);
  s.players[id].cash -= sp.houseCost!;
  s.properties[index].houses += 1;
  const what = s.properties[index].houses === 5 ? "a hotel" : "a house";
  s.log.push(`${name(s, id)} built ${what} on ${sp.name}.`);
}

function validateSellHouse(s: MonopolyState, id: string, index: number): ValidateResult {
  if (!isActive(s.turn, id)) return { ok: false, error: "Not your turn." };
  if (s.phase !== "resolve" && s.phase !== "debt") return { ok: false, error: "Can't sell now." };
  const sp = space(index);
  const prop = s.properties[index];
  if (!prop || prop.owner !== id) return { ok: false, error: "You don't own that." };
  if (sp.type !== "street" || prop.houses < 1) return { ok: false, error: "No house to sell." };
  // Even-sell: this property's house count must be the max in the group.
  const counts = groupIndices(sp.group!).map((i) => s.properties[i].houses);
  if (prop.houses < Math.max(...counts)) return { ok: false, error: "Sell evenly across the set." };
  return { ok: true };
}

function doSellHouse(s: MonopolyState, id: string, index: number) {
  const sp = space(index);
  s.properties[index].houses -= 1;
  s.players[id].cash += sp.houseCost! / 2; // sell back at half price
  s.log.push(`${name(s, id)} sold a house on ${sp.name}.`);
  settleDebtIfPossible(s);
}

function validateMortgage(s: MonopolyState, id: string, index: number): ValidateResult {
  if (!isActive(s.turn, id)) return { ok: false, error: "Not your turn." };
  if (s.phase !== "resolve" && s.phase !== "debt") return { ok: false, error: "Can't mortgage now." };
  const sp = space(index);
  const prop = s.properties[index];
  if (!prop || prop.owner !== id) return { ok: false, error: "You don't own that." };
  if (prop.mortgaged) return { ok: false, error: "Already mortgaged." };
  // Must sell all houses in the group before mortgaging.
  if (sp.type === "street" && groupIndices(sp.group!).some((i) => s.properties[i].houses > 0))
    return { ok: false, error: "Sell the houses in this set first." };
  return { ok: true };
}

function doMortgage(s: MonopolyState, id: string, index: number) {
  const sp = space(index);
  s.properties[index].mortgaged = true;
  s.players[id].cash += sp.price! / 2;
  s.log.push(`${name(s, id)} mortgaged ${sp.name} for $${sp.price! / 2}.`);
  settleDebtIfPossible(s);
}

function validateUnmortgage(s: MonopolyState, id: string, index: number): ValidateResult {
  if (!isActive(s.turn, id)) return { ok: false, error: "Not your turn." };
  if (s.phase !== "resolve") return { ok: false, error: "Can't unmortgage now." };
  const sp = space(index);
  const prop = s.properties[index];
  if (!prop || prop.owner !== id) return { ok: false, error: "You don't own that." };
  if (!prop.mortgaged) return { ok: false, error: "Not mortgaged." };
  const cost = Math.ceil(sp.price! * 0.55); // half + 10% interest
  if (s.players[id].cash < cost) return { ok: false, error: "Not enough cash to lift the mortgage." };
  return { ok: true };
}

function doUnmortgage(s: MonopolyState, id: string, index: number) {
  const sp = space(index);
  const cost = Math.ceil(sp.price! * 0.55);
  s.players[id].cash -= cost;
  s.properties[index].mortgaged = false;
  s.log.push(`${name(s, id)} lifted the mortgage on ${sp.name} for $${cost}.`);
}

// If we're in debt and the debtor now has enough cash, auto-settle.
function settleDebtIfPossible(s: MonopolyState) {
  if (s.phase !== "debt" || !s.debt) return;
  const { debtor, amount, creditor } = s.debt;
  if (s.players[debtor].cash >= amount) {
    s.players[debtor].cash -= amount;
    if (creditor) s.players[creditor].cash += amount;
    s.log.push(`${name(s, debtor)} settled the $${amount} debt.`);
    s.debt = null;
    s.phase = "resolve";
  }
}

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------
function deckCard(id: string, which: "chance" | "chest"): DeckCard {
  const arr = which === "chance" ? CHANCE_CARDS : CHEST_CARDS;
  return arr.find((c) => c.id === id)!;
}

function drawCard(s: MonopolyState, playerId: string, which: "chance" | "chest") {
  const order = which === "chance" ? s.chanceOrder : s.chestOrder;
  let idx = which === "chance" ? s.chanceIdx : s.chestIdx;
  const cardId = order[idx % order.length];
  idx = (idx + 1) % order.length;
  if (which === "chance") s.chanceIdx = idx;
  else s.chestIdx = idx;
  const card = deckCard(cardId, which);
  s.log.push(`${which === "chance" ? "Chance" : "Community Chest"}: ${card.text}`);
  applyCard(s, playerId, card.action);
}

function applyCard(s: MonopolyState, playerId: string, action: CardAction) {
  const p = s.players[playerId];
  switch (action.kind) {
    case "advanceTo":
      advanceTo(s, playerId, action.index, action.collectGoIfPassed ?? action.index === 0);
      break;
    case "advanceToNearest": {
      const idxs = groupIndices(action.group);
      // nearest forward
      let target = idxs[0];
      let best = 40;
      for (const i of idxs) {
        const dist = (i - p.position + 40) % 40;
        const d = dist === 0 ? 40 : dist;
        if (d < best) {
          best = d;
          target = i;
        }
      }
      // Card sends you to nearest; collect GO if you pass it.
      const collectGo = target < p.position;
      if (collectGo) {
        p.cash += GO_SALARY;
        s.log.push(`${name(s, playerId)} passed GO, collect $${GO_SALARY}.`);
      }
      p.position = target;
      // Special: rent here is doubled (railroad) or 10x dice (utility) per rules,
      // but for simplicity we charge standard owned rent. (DOCUMENTED simplification.)
      resolveLanding(s, playerId);
      break;
    }
    case "move":
      // relative move; never passes GO backward for "back 3".
      p.position = (p.position + action.spaces + 40) % 40;
      resolveLanding(s, playerId);
      break;
    case "collect":
      p.cash += action.amount;
      s.phase = "resolve";
      break;
    case "pay":
      payOrDebt(s, playerId, action.amount, null);
      break;
    case "payEachPlayer": {
      const others = s.turn.order.filter((id) => id !== playerId && !s.players[id].bankrupt);
      const total = action.amount * others.length;
      if (p.cash >= total) {
        for (const id of others) {
          p.cash -= action.amount;
          s.players[id].cash += action.amount;
        }
        s.phase = "resolve";
      } else {
        // Owe the bank conceptually; simplified to a single bank debt.
        payOrDebt(s, playerId, total, null);
      }
      break;
    }
    case "collectEachPlayer": {
      const others = s.turn.order.filter((id) => id !== playerId && !s.players[id].bankrupt);
      for (const id of others) {
        const amt = Math.min(action.amount, s.players[id].cash);
        s.players[id].cash -= amt;
        p.cash += amt;
      }
      s.phase = "resolve";
      break;
    }
    case "goToJail":
      sendToJail(s, p);
      s.phase = "resolve";
      break;
    case "getOutOfJailFree":
      p.getOutCards += 1;
      s.phase = "resolve";
      break;
    case "repairs": {
      const { houses, hotels } = countBuildings(s, playerId);
      const bill = houses * action.perHouse + hotels * action.perHotel;
      if (bill > 0) s.log.push(`${name(s, playerId)} owes $${bill} in repairs.`);
      payOrDebt(s, playerId, bill, null);
      break;
    }
  }
}

// ----------------------------------------------------------------------------
// End of turn / bankruptcy / win
// ----------------------------------------------------------------------------
function endTurn(s: MonopolyState) {
  const cur = activePlayer(s.turn);
  const p = s.players[cur];
  // Doubles grant another roll (unless they were sent to jail this turn).
  if (s.dice && s.dice[0] === s.dice[1] && !p.inJail && s.doublesCount > 0 && s.doublesCount < 3) {
    s.log.push(`${name(s, cur)} rolled doubles — rolls again.`);
    s.phase = "preRoll";
    s.dice = null;
    return;
  }
  s.doublesCount = 0;
  s.dice = null;
  s.rolledThisTurn = false;
  s.turn = advance(s.turn, 1);
  // Skip bankrupt players.
  let guard = 0;
  while (s.players[activePlayer(s.turn)]?.bankrupt && guard++ < s.turn.order.length) {
    s.turn = advance(s.turn, 1);
  }
  s.phase = "preRoll";
}

function declareBankrupt(s: MonopolyState, playerId: string) {
  const p = s.players[playerId];
  const creditor = s.debt?.creditor ?? null;
  s.log.push(`${name(s, playerId)} declares bankruptcy!`);

  if (creditor && s.players[creditor] && !s.players[creditor].bankrupt) {
    // Transfer remaining cash and all properties to the creditor.
    s.players[creditor].cash += p.cash;
    for (const sp of BOARD) {
      const prop = s.properties[sp.index];
      if (prop && prop.owner === playerId) {
        prop.owner = creditor;
        // Houses are sold to the bank in real rules; we keep them but the new
        // owner must (per rules) immediately decide. Simplified: houses transfer.
      }
    }
    s.players[creditor].getOutCards += p.getOutCards;
  } else {
    // Owed the bank: properties return to the bank, houses removed.
    for (const sp of BOARD) {
      const prop = s.properties[sp.index];
      if (prop && prop.owner === playerId) {
        prop.owner = null;
        prop.houses = 0;
        prop.mortgaged = false;
      }
    }
  }
  p.cash = 0;
  p.bankrupt = true;
  p.getOutCards = 0;
  s.debt = null;

  // Remove from turn order.
  const wasActive = isActive(s.turn, playerId);
  s.turn = removePlayer(s.turn, playerId);

  // Win check: last solvent player.
  const solvent = s.turn.order.filter((id) => !s.players[id].bankrupt);
  if (solvent.length <= 1) {
    s.finished = true;
    s.winnerId = solvent[0] ?? null;
    s.phase = "gameOver";
    if (s.winnerId) s.log.push(`🏆 ${name(s, s.winnerId)} wins the game!`);
    return;
  }

  // Continue play with the next player.
  if (wasActive) {
    // removePlayer keeps activeIndex sane; ensure it points at a solvent player.
    let guard = 0;
    while (s.players[activePlayer(s.turn)]?.bankrupt && guard++ < s.turn.order.length) {
      s.turn = advance(s.turn, 1);
    }
    s.doublesCount = 0;
    s.dice = null;
    s.phase = "preRoll";
  } else {
    s.phase = "resolve"; // shouldn't normally happen (debtor is active)
  }
}

// ----------------------------------------------------------------------------
// Deterministic shuffle helper (Fisher-Yates with seeded rng).
// ----------------------------------------------------------------------------
function shuffleIds(s: MonopolyState, ids: string[]): string[] {
  const rng = nextRng(s);
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
