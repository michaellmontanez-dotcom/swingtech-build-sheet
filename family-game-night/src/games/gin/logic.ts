import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, shuffle } from "@/games/rng";
import { initTurn, activePlayer, isActive, advance, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------
export type Suit = "S" | "H" | "D" | "C";
// rank 1 = Ace (low), 11 = J, 12 = Q, 13 = K
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  id: string; // e.g. "S1" (Ace of spades)
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ["S", "H", "D", "C"];

export function cardValue(card: Card): number {
  // A=1, 2-10 face value, J/Q/K=10
  return card.rank >= 10 ? 10 : card.rank;
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let r = 1 as number; r <= 13; r++) {
      deck.push({ id: `${suit}${r}`, suit, rank: r as Rank });
    }
  }
  return deck; // 52 cards
}

// ----------------------------------------------------------------------------
// Meld / deadwood engine
// ----------------------------------------------------------------------------
export interface MeldGrouping {
  melds: Card[][]; // each is a valid set or run
  deadwood: Card[]; // cards not in any meld
  deadwoodValue: number;
}

// Enumerate all candidate melds (sets of 3-4, runs of 3+) present in a hand.
function candidateMelds(hand: Card[]): Card[][] {
  const melds: Card[][] = [];

  // Sets: 3 or 4 of the same rank.
  const byRank = new Map<number, Card[]>();
  for (const c of hand) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  for (const arr of byRank.values()) {
    if (arr.length >= 3) {
      // full set
      melds.push([...arr]);
      // every 3-subset when there are 4 (so the engine can leave one out for a run)
      if (arr.length === 4) {
        for (let skip = 0; skip < 4; skip++) {
          melds.push(arr.filter((_, i) => i !== skip));
        }
      }
    }
  }

  // Runs: 3+ consecutive same suit. Aces low only (no wraparound).
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    const arr = bySuit.get(c.suit) ?? [];
    arr.push(c);
    bySuit.set(c.suit, arr);
  }
  for (const arr of bySuit.values()) {
    const sorted = [...arr].sort((a, b) => a.rank - b.rank);
    // find maximal consecutive stretches, then enumerate all sub-runs of length>=3
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].rank === sorted[j].rank + 1) j++;
      // stretch sorted[i..j] is consecutive
      for (let start = i; start <= j; start++) {
        for (let end = start + 2; end <= j; end++) {
          melds.push(sorted.slice(start, end + 1));
        }
      }
      i = j + 1;
    }
  }
  return melds;
}

// Find the non-overlapping selection of melds minimizing deadwood value.
// Branch-and-bound over candidate melds; hands are <=11 cards so this is fast.
export function bestMelds(hand: Card[]): MeldGrouping {
  const cands = candidateMelds(hand);
  const totalValue = hand.reduce((s, c) => s + cardValue(c), 0);

  let bestUsedValue = 0; // max value of cards covered by chosen melds
  let bestChoice: Card[][] = [];

  // Try selecting melds in order; each card used by at most one meld.
  function search(idx: number, used: Set<string>, chosen: Card[][], usedValue: number) {
    if (usedValue > bestUsedValue) {
      bestUsedValue = usedValue;
      bestChoice = chosen.map((m) => [...m]);
    }
    if (idx >= cands.length) return;

    // Upper-bound prune: even covering all remaining-uncovered cards can't beat best.
    if (usedValue + (totalValue - sumValue(hand, used)) <= bestUsedValue) {
      // still continue: skipping path explored below, but no improvement possible
    }

    for (let k = idx; k < cands.length; k++) {
      const meld = cands[k];
      if (meld.some((c) => used.has(c.id))) continue;
      for (const c of meld) used.add(c.id);
      const v = meld.reduce((s, c) => s + cardValue(c), 0);
      chosen.push(meld);
      search(k + 1, used, chosen, usedValue + v);
      chosen.pop();
      for (const c of meld) used.delete(c.id);
    }
  }

  search(0, new Set(), [], 0);

  const usedIds = new Set<string>();
  for (const m of bestChoice) for (const c of m) usedIds.add(c.id);
  const deadwood = hand.filter((c) => !usedIds.has(c.id));
  return {
    melds: bestChoice,
    deadwood,
    deadwoodValue: deadwood.reduce((s, c) => s + cardValue(c), 0),
  };
}

function sumValue(hand: Card[], used: Set<string>): number {
  let s = 0;
  for (const c of hand) if (used.has(c.id)) s += cardValue(c);
  return s;
}

export function deadwoodValue(hand: Card[]): number {
  return bestMelds(hand).deadwoodValue;
}

// Can `card` be laid off onto any of `melds` (extending a set or run)?
function canLayOff(card: Card, melds: Card[][]): boolean {
  for (const meld of melds) {
    if (meld.length < 3) continue;
    const isSet = meld.every((c) => c.rank === meld[0].rank);
    if (isSet) {
      if (card.rank === meld[0].rank && meld.length < 4) return true;
    } else {
      // run: same suit, consecutive — extend at either end
      const suit = meld[0].suit;
      if (card.suit !== suit) continue;
      const ranks = meld.map((c) => c.rank).sort((a, b) => a - b);
      const low = ranks[0];
      const high = ranks[ranks.length - 1];
      if (card.rank === low - 1 && card.rank >= 1) return true;
      if (card.rank === high + 1 && card.rank <= 13) return true;
    }
  }
  return false;
}

// Lay off as much opponent deadwood as possible onto knocker's melds.
// Greedy repeated passes; returns the residual deadwood value.
export function layOffDeadwood(deadwood: Card[], knockerMelds: Card[][]): number {
  const melds = knockerMelds.map((m) => [...m]);
  const remaining = [...deadwood].sort((a, b) => cardValue(b) - cardValue(a));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < remaining.length; i++) {
      const card = remaining[i];
      for (const meld of melds) {
        if (meld.length < 3) continue;
        const isSet = meld.every((c) => c.rank === meld[0].rank);
        if (isSet) {
          if (card.rank === meld[0].rank && meld.length < 4) {
            meld.push(card);
            remaining.splice(i, 1);
            i--;
            changed = true;
            break;
          }
        } else {
          const suit = meld[0].suit;
          if (card.suit !== suit) continue;
          const ranks = meld.map((c) => c.rank).sort((a, b) => a - b);
          const low = ranks[0];
          const high = ranks[ranks.length - 1];
          if (card.rank === low - 1 && card.rank >= 1) {
            meld.push(card);
            remaining.splice(i, 1);
            i--;
            changed = true;
            break;
          }
          if (card.rank === high + 1 && card.rank <= 13) {
            meld.push(card);
            remaining.splice(i, 1);
            i--;
            changed = true;
            break;
          }
        }
      }
    }
  }
  return remaining.reduce((s, c) => s + cardValue(c), 0);
}

const HAND_SIZE = 10;
const GAME_TARGET = 100;
const GIN_BONUS = 25;
const UNDERCUT_BONUS = 25;

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export type Phase = "draw" | "discard" | "roundOver" | "gameOver";

export interface RoundResult {
  knocker: string;
  gin: boolean;
  undercut: boolean;
  knockerDeadwood: number;
  opponentDeadwood: number; // after layoffs
  points: number;
  scorer: string;
}

export interface GinState {
  stock: Card[]; // draw pile, top = end
  discard: Card[]; // discard pile, top = end
  hands: Record<string, Card[]>;
  turn: TurnState;
  phase: Phase;
  // id of card just taken from discard this turn (cannot be re-discarded same turn)
  justTookFromDiscard: string | null;
  scores: Record<string, number>; // cumulative game scores
  names: Record<string, string>;
  seed: number;
  rngCounter: number;
  lastRound: RoundResult | null;
  log: string[];
  finished: boolean;
  winnerId: string | null;
}

function topDiscard(state: GinState): Card | null {
  return state.discard.length ? state.discard[state.discard.length - 1] : null;
}

function name(s: GinState, id: string): string {
  return s.names[id] ?? "Player";
}

function opponentOf(s: GinState, id: string): string {
  return s.turn.order.find((p) => p !== id)!;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const gin: GameModule<GinState> = {
  type: "gin",
  name: "Gin Rummy",
  emoji: "🃏",
  blurb: "Form sets & runs, knock with low deadwood, race to 100.",
  minPlayers: 2,
  maxPlayers: 2,

  initGame(players: PlayerInfo[], config): GinState {
    if (players.length !== 2) throw new Error("Gin Rummy requires exactly 2 players.");
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const rng = mulberry32(seed);
    const deck = shuffle(buildDeck(), rng);

    const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id);
    const hands: Record<string, Card[]> = {};
    const names: Record<string, string> = {};
    const scores: Record<string, number> = {};
    for (const p of players) {
      hands[p.id] = [];
      names[p.id] = p.name;
      scores[p.id] = 0;
    }
    // deal 10 each, alternating
    for (let i = 0; i < HAND_SIZE; i++) {
      for (const id of order) hands[id].push(deck.pop()!);
    }
    // flip top of stock to start the discard pile
    const discard = [deck.pop()!];

    return {
      stock: deck,
      discard,
      hands,
      turn: initTurn(order),
      phase: "draw",
      justTookFromDiscard: null,
      scores,
      names,
      seed,
      rngCounter: 0,
      lastRound: null,
      log: ["New round — deal 10 each."],
      finished: false,
      winnerId: null,
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished || state.phase === "gameOver") return { ok: false, error: "Game over." };
    if (state.phase === "roundOver") {
      if (move.type === "nextRound") return { ok: true };
      return { ok: false, error: "Round over — start the next round." };
    }
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };

    switch (move.type) {
      case "draw": {
        if (state.phase !== "draw") return { ok: false, error: "You already drew." };
        const source = move.source;
        if (source !== "stock" && source !== "discard")
          return { ok: false, error: "Draw from stock or discard." };
        if (source === "stock" && state.stock.length === 0)
          return { ok: false, error: "Stock is empty." };
        if (source === "discard" && state.discard.length === 0)
          return { ok: false, error: "Discard pile is empty." };
        return { ok: true };
      }
      case "discard":
      case "knock":
      case "gin": {
        if (state.phase !== "discard") return { ok: false, error: "Draw before discarding." };
        const hand = state.hands[playerId];
        const cardId = (move.card as Card | undefined)?.id ?? (move.card as unknown as string);
        const card = hand.find((c) => c.id === cardId);
        if (!card) return { ok: false, error: "You don't have that card." };
        if (state.justTookFromDiscard && card.id === state.justTookFromDiscard)
          return { ok: false, error: "Can't discard the card you just took from the discard pile." };

        if (move.type === "discard") return { ok: true };

        // knock / gin: evaluate resulting deadwood after removing the discarded card
        const remaining = hand.filter((c) => c.id !== card.id);
        const dw = deadwoodValue(remaining);
        if (move.type === "knock") {
          if (dw > 10) return { ok: false, error: `Deadwood ${dw} > 10 — can't knock.` };
          return { ok: true };
        }
        // gin
        if (dw !== 0) return { ok: false, error: "Gin requires zero deadwood." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): GinState {
    const s: GinState = structuredClone(state);
    switch (move.type) {
      case "draw":
        doDraw(s, playerId, move.source as "stock" | "discard");
        break;
      case "discard":
        doDiscard(s, playerId, cardIdOf(move));
        break;
      case "knock":
        doKnockOrGin(s, playerId, cardIdOf(move), false);
        break;
      case "gin":
        doKnockOrGin(s, playerId, cardIdOf(move), true);
        break;
      case "nextRound":
        startNextRound(s);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished || !state.winnerId) return null;
    return {
      winners: [state.winnerId],
      scores: { ...state.scores },
      reason: `${name(state, state.winnerId)} reached ${GAME_TARGET}.`,
    };
  },

  getPlayerView(state, playerId) {
    const top = topDiscard(state);
    const pub = {
      type: "gin" as const,
      topDiscard: top,
      stockCount: state.stock.length,
      discardCount: state.discard.length,
      activePlayerId: activePlayer(state.turn),
      phase: state.phase,
      scores: { ...state.scores },
      target: GAME_TARGET,
      lastRound: state.lastRound,
      finished: state.finished,
      winnerId: state.winnerId,
      log: state.log.slice(-6),
      players: state.turn.order.map((id) => ({
        id,
        name: state.names[id],
        handCount: state.hands[id]?.length ?? 0,
        score: state.scores[id] ?? 0,
      })),
    };
    if (playerId && state.hands[playerId]) {
      const hand = state.hands[playerId];
      const grouping = bestMelds(hand);
      const justTook =
        isActive(state.turn, playerId) ? state.justTookFromDiscard : null;
      return {
        ...pub,
        you: playerId,
        hand,
        melds: grouping.melds,
        deadwood: grouping.deadwood,
        deadwoodValue: grouping.deadwoodValue,
        canKnock: state.phase === "discard" && isActive(state.turn, playerId),
        justTookFromDiscard: justTook,
      };
    }
    return {
      ...pub,
      you: null,
      hand: [] as Card[],
      melds: [] as Card[][],
      deadwood: [] as Card[],
      deadwoodValue: 0,
      canKnock: false,
      justTookFromDiscard: null,
    };
  },
};

// ----------------------------------------------------------------------------
// Internal transitions (mutate a cloned state)
// ----------------------------------------------------------------------------
function cardIdOf(move: Move): string {
  const c = move.card as Card | string | undefined;
  if (c && typeof c === "object") return c.id;
  return c as string;
}

function doDraw(s: GinState, playerId: string, source: "stock" | "discard") {
  if (source === "stock") {
    const card = s.stock.pop()!;
    s.hands[playerId].push(card);
    s.justTookFromDiscard = null;
    s.log.push(`${name(s, playerId)} drew from the stock.`);
  } else {
    const card = s.discard.pop()!;
    s.hands[playerId].push(card);
    s.justTookFromDiscard = card.id;
    s.log.push(`${name(s, playerId)} took ${cardLabel(card)} from the discard.`);
  }
  s.phase = "discard";
}

function doDiscard(s: GinState, playerId: string, cardId: string) {
  const hand = s.hands[playerId];
  const idx = hand.findIndex((c) => c.id === cardId);
  const card = hand.splice(idx, 1)[0];
  s.discard.push(card);
  s.justTookFromDiscard = null;
  s.log.push(`${name(s, playerId)} discarded ${cardLabel(card)}.`);
  s.phase = "draw";
  s.turn = advance(s.turn, 1);

  // If the stock is exhausted (only the non-drawable bottom remains), the round
  // is a wash — standard rule: when 2 cards remain in the stock undrawn, no score.
  if (s.stock.length <= 2 && s.phase === "draw") {
    // round drawn, deal again with no points
    s.log.push("Stock nearly exhausted — round is a wash.");
    startNextRound(s);
  }
}

function doKnockOrGin(s: GinState, playerId: string, cardId: string, gin: boolean) {
  const hand = s.hands[playerId];
  const idx = hand.findIndex((c) => c.id === cardId);
  const card = hand.splice(idx, 1)[0];
  s.discard.push(card);
  s.justTookFromDiscard = null;

  const opp = opponentOf(s, playerId);
  const knockerGroup = bestMelds(s.hands[playerId]);
  const oppGroup = bestMelds(s.hands[opp]);
  const knockerDw = knockerGroup.deadwoodValue;

  let oppDw = oppGroup.deadwoodValue;
  if (!gin) {
    // opponent may lay off deadwood onto knocker's melds
    oppDw = layOffDeadwood(oppGroup.deadwood, knockerGroup.melds);
  }

  let scorer = playerId;
  let points = 0;
  let undercut = false;

  if (gin) {
    points = oppDw + GIN_BONUS;
    s.log.push(`${name(s, playerId)} went GIN! +${points}.`);
  } else if (oppDw <= knockerDw) {
    // undercut: opponent scores
    undercut = true;
    scorer = opp;
    points = oppDw - knockerDw + UNDERCUT_BONUS;
    s.log.push(`${name(s, opp)} undercut ${name(s, playerId)}! +${points}.`);
  } else {
    points = oppDw - knockerDw;
    s.log.push(`${name(s, playerId)} knocked. +${points}.`);
  }

  s.scores[scorer] += points;
  s.lastRound = {
    knocker: playerId,
    gin,
    undercut,
    knockerDeadwood: knockerDw,
    opponentDeadwood: oppDw,
    points,
    scorer,
  };

  if (s.scores[scorer] >= GAME_TARGET) {
    s.finished = true;
    s.winnerId = scorer;
    s.phase = "gameOver";
    s.log.push(`🏆 ${name(s, scorer)} wins the game with ${s.scores[scorer]}!`);
  } else {
    s.phase = "roundOver";
  }
}

function startNextRound(s: GinState) {
  if (s.finished) return;
  s.rngCounter += 1;
  const rng = mulberry32(s.seed + s.rngCounter * 2654435761);
  const deck = shuffle(buildDeck(), rng);
  const order = s.turn.order;
  for (const id of order) s.hands[id] = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    for (const id of order) s.hands[id].push(deck.pop()!);
  }
  s.stock = deck;
  s.discard = [deck.pop()!];
  // loser of last round (or seat order) leads; keep it simple: rotate dealer.
  s.turn = { ...s.turn, activeIndex: (s.turn.activeIndex + 1) % order.length };
  s.phase = "draw";
  s.justTookFromDiscard = null;
  s.lastRound = s.lastRound; // keep for banner until next move
  s.log.push("New round — deal 10 each.");
}

function cardLabel(card: Card): string {
  const r =
    card.rank === 1 ? "A" : card.rank === 11 ? "J" : card.rank === 12 ? "Q" : card.rank === 13 ? "K" : String(card.rank);
  const suit = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit];
  return `${r}${suit}`;
}
