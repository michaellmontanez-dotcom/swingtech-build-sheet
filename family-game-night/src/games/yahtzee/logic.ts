import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, rollDie, type RNG } from "@/games/rng";
import { advance, initTurn, isActive, activePlayer, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Categories
// ----------------------------------------------------------------------------
export type Category =
  | "ones"
  | "twos"
  | "threes"
  | "fours"
  | "fives"
  | "sixes"
  | "three_of_a_kind"
  | "four_of_a_kind"
  | "full_house"
  | "small_straight"
  | "large_straight"
  | "yahtzee"
  | "chance";

export const CATEGORIES: Category[] = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "three_of_a_kind",
  "four_of_a_kind",
  "full_house",
  "small_straight",
  "large_straight",
  "yahtzee",
  "chance",
];

export const UPPER_CATEGORIES: Category[] = ["ones", "twos", "threes", "fours", "fives", "sixes"];

export const CATEGORY_LABELS: Record<Category, string> = {
  ones: "Ones",
  twos: "Twos",
  threes: "Threes",
  fours: "Fours",
  fives: "Fives",
  sixes: "Sixes",
  three_of_a_kind: "Three of a Kind",
  four_of_a_kind: "Four of a Kind",
  full_house: "Full House",
  small_straight: "Small Straight",
  large_straight: "Large Straight",
  yahtzee: "Yahtzee",
  chance: "Chance",
};

// A scorecard maps each category to its scored value, or null if still open.
export type ScoreCard = Record<Category, number | null>;

function emptyCard(): ScoreCard {
  const c = {} as ScoreCard;
  for (const cat of CATEGORIES) c[cat] = null;
  return c;
}

// ----------------------------------------------------------------------------
// Pure scoring helpers (exported so the View can preview available scores)
// ----------------------------------------------------------------------------
function counts(dice: number[]): number[] {
  // counts[face] = how many dice show `face` (faces 1..6, index 0 unused)
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d] += 1;
  return c;
}

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);

function hasStraight(dice: number[], len: number): boolean {
  const present = new Set(dice);
  let run = 0;
  for (let f = 1; f <= 6; f++) {
    if (present.has(f)) {
      run += 1;
      if (run >= len) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

// Score a single category for a given set of 5 dice (the raw value, no bonuses).
export function scoreCategory(category: Category, dice: number[]): number {
  const c = counts(dice);
  switch (category) {
    case "ones":
      return c[1] * 1;
    case "twos":
      return c[2] * 2;
    case "threes":
      return c[3] * 3;
    case "fours":
      return c[4] * 4;
    case "fives":
      return c[5] * 5;
    case "sixes":
      return c[6] * 6;
    case "three_of_a_kind":
      return c.some((n) => n >= 3) ? sum(dice) : 0;
    case "four_of_a_kind":
      return c.some((n) => n >= 4) ? sum(dice) : 0;
    case "full_house": {
      const hasThree = c.some((n) => n === 3);
      const hasTwo = c.some((n) => n === 2);
      // Five-of-a-kind also counts as a full house in many rulesets; we keep
      // the strict 3+2 definition here (a yahtzee scored as full house = 0).
      return hasThree && hasTwo ? 25 : 0;
    }
    case "small_straight":
      return hasStraight(dice, 4) ? 30 : 0;
    case "large_straight":
      return hasStraight(dice, 5) ? 40 : 0;
    case "yahtzee":
      return c.some((n) => n === 5) ? 50 : 0;
    case "chance":
      return sum(dice);
  }
}

export function isYahtzee(dice: number[]): boolean {
  return counts(dice).some((n) => n === 5);
}

export function upperSubtotal(card: ScoreCard): number {
  let t = 0;
  for (const cat of UPPER_CATEGORIES) t += card[cat] ?? 0;
  return t;
}

export function upperBonus(card: ScoreCard): number {
  return upperSubtotal(card) >= 63 ? 35 : 0;
}

// Grand total = all scored categories + upper bonus + yahtzee bonus points.
export function grandTotal(card: ScoreCard, yahtzeeBonus: number): number {
  let t = 0;
  for (const cat of CATEGORIES) t += card[cat] ?? 0;
  return t + upperBonus(card) + yahtzeeBonus;
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export interface YahtzeeState {
  turn: TurnState;
  cards: Record<string, ScoreCard>;
  yahtzeeBonus: Record<string, number>; // accumulated +100 bonuses per player
  dice: number[]; // current 5 dice (1..6); all 0 before the first roll of a turn
  kept: boolean[]; // length 5 — which dice are kept (carried into next roll)
  rollsUsed: number; // rolls used this turn (0..3)
  seed: number;
  rngCounter: number;
  names: Record<string, string>;
  log: string[];
  finished: boolean;
}

const MAX_ROLLS = 3;

function nextRng(state: YahtzeeState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

function name(s: YahtzeeState, id: string): string {
  return s.names[id] ?? "Player";
}

function allFilled(card: ScoreCard): boolean {
  return CATEGORIES.every((cat) => card[cat] !== null);
}

function gameFinished(s: YahtzeeState): boolean {
  return Object.values(s.cards).every(allFilled);
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const yahtzee: GameModule<YahtzeeState> = {
  type: "yahtzee",
  name: "Yahtzee",
  emoji: "🎲",
  blurb: "Roll five dice up to three times, chase the perfect combo.",
  minPlayers: 2,
  maxPlayers: 8,

  initGame(players: PlayerInfo[], config): YahtzeeState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id);

    const cards: Record<string, ScoreCard> = {};
    const yahtzeeBonus: Record<string, number> = {};
    const names: Record<string, string> = {};
    for (const p of players) {
      cards[p.id] = emptyCard();
      yahtzeeBonus[p.id] = 0;
      names[p.id] = p.name;
    }

    return {
      turn: initTurn(order),
      cards,
      yahtzeeBonus,
      dice: [0, 0, 0, 0, 0],
      kept: [false, false, false, false, false],
      rollsUsed: 0,
      seed,
      rngCounter: 0,
      names,
      log: ["Game started — roll the dice!"],
      finished: false,
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };

    switch (move.type) {
      case "roll": {
        if (state.rollsUsed >= MAX_ROLLS) return { ok: false, error: "No rolls left — pick a category." };
        const keep = (move.keep as number[]) ?? [];
        if (!Array.isArray(keep)) return { ok: false, error: "keep must be an array of indices." };
        for (const i of keep) {
          if (typeof i !== "number" || i < 0 || i > 4 || !Number.isInteger(i)) {
            return { ok: false, error: "keep indices must be 0–4." };
          }
        }
        // Can't keep dice that haven't been rolled yet (first roll keeps nothing).
        if (state.rollsUsed === 0 && keep.length > 0) {
          return { ok: false, error: "Nothing to keep before the first roll." };
        }
        return { ok: true };
      }
      case "score": {
        if (state.rollsUsed === 0) return { ok: false, error: "Roll before scoring." };
        const category = move.category as Category;
        if (!CATEGORIES.includes(category)) return { ok: false, error: "Unknown category." };
        if (state.cards[playerId][category] !== null) {
          return { ok: false, error: "That category is already filled." };
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): YahtzeeState {
    const s: YahtzeeState = structuredClone(state);
    switch (move.type) {
      case "roll":
        doRoll(s, playerId, ((move.keep as number[]) ?? []));
        break;
      case "score":
        doScore(s, playerId, move.category as Category);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    const scores: Record<string, number> = {};
    for (const id of state.turn.order) {
      scores[id] = grandTotal(state.cards[id], state.yahtzeeBonus[id]);
    }
    const best = Math.max(...Object.values(scores));
    const winners = state.turn.order.filter((id) => scores[id] === best);
    return { winners, scores };
  },

  getPlayerView(state, playerId) {
    const activeId = activePlayer(state.turn);
    const scores: Record<string, number> = {};
    for (const id of state.turn.order) {
      scores[id] = grandTotal(state.cards[id], state.yahtzeeBonus[id]);
    }

    const pub = {
      type: "yahtzee" as const,
      activePlayerId: activeId,
      dice: [...state.dice],
      kept: [...state.kept],
      rollsUsed: state.rollsUsed,
      rollsLeft: MAX_ROLLS - state.rollsUsed,
      maxRolls: MAX_ROLLS,
      finished: state.finished,
      log: state.log.slice(-6),
      players: state.turn.order.map((id) => ({
        id,
        name: state.names[id],
        card: state.cards[id],
        upperSubtotal: upperSubtotal(state.cards[id]),
        upperBonus: upperBonus(state.cards[id]),
        yahtzeeBonus: state.yahtzeeBonus[id],
        total: scores[id],
      })),
      winners: state.finished ? Object.values(scores).length ? winnersOf(scores) : [] : [],
    };

    // No hidden info in Yahtzee — dice & cards are public. The private view just
    // flags "you", whether it's your turn, and the score preview for open boxes.
    const you = playerId;
    const myTurn = !!you && you === activeId && !state.finished;
    const canScore = myTurn && state.rollsUsed > 0;
    const available: Partial<Record<Category, number>> = {};
    if (you && state.cards[you]) {
      for (const cat of CATEGORIES) {
        if (state.cards[you][cat] === null) {
          available[cat] = state.rollsUsed > 0 ? scoreCategory(cat, state.dice) : 0;
        }
      }
    }

    return {
      ...pub,
      you,
      myTurn,
      canRoll: myTurn && state.rollsUsed < MAX_ROLLS,
      canScore,
      available,
    };
  },
};

function winnersOf(scores: Record<string, number>): string[] {
  const best = Math.max(...Object.values(scores));
  return Object.keys(scores).filter((id) => scores[id] === best);
}

// ----------------------------------------------------------------------------
// Internal helpers (mutate a cloned state)
// ----------------------------------------------------------------------------
function doRoll(s: YahtzeeState, playerId: string, keep: number[]) {
  const keepSet = new Set(keep);
  const rng = nextRng(s);
  if (s.rollsUsed === 0) {
    // First roll of the turn: roll all five fresh.
    s.dice = [0, 0, 0, 0, 0].map(() => rollDie(rng));
    s.kept = [false, false, false, false, false];
  } else {
    // Re-roll only the dice NOT in the keep set.
    for (let i = 0; i < 5; i++) {
      if (!keepSet.has(i)) s.dice[i] = rollDie(rng);
    }
    s.kept = [0, 1, 2, 3, 4].map((i) => keepSet.has(i));
  }
  s.rollsUsed += 1;
  s.log.push(`${name(s, playerId)} rolled [${s.dice.join(" ")}] (roll ${s.rollsUsed}/${MAX_ROLLS}).`);
}

function doScore(s: YahtzeeState, playerId: string, category: Category) {
  const card = s.cards[playerId];
  const dice = s.dice;
  let value = scoreCategory(category, dice);

  // Yahtzee bonus & joker handling.
  if (isYahtzee(dice) && card.yahtzee === 50) {
    // The player already scored a yahtzee (50). Each additional yahtzee earns a
    // +100 bonus. Joker rule (simplified): the bonus applies whenever scoring
    // any open category with a 5-of-a-kind here. We do not force the matching
    // upper box; the player may place this roll in ANY open category and still
    // collect the +100 bonus, which keeps the move/UI simple.
    s.yahtzeeBonus[playerId] += 100;
    s.log.push(`${name(s, playerId)} rolled another YAHTZEE — +100 bonus! 🎉`);
    // Joker scoring: lower-section categories score at their full "joker" value
    // (full house 25, straights 30/40) even though the dice are five of a kind.
    if (category === "full_house") value = 25;
    else if (category === "small_straight") value = 30;
    else if (category === "large_straight") value = 40;
  }

  card[category] = value;
  s.log.push(`${name(s, playerId)} scored ${CATEGORY_LABELS[category]} for ${value}.`);

  // Reset dice for the next player's turn and pass it on.
  s.dice = [0, 0, 0, 0, 0];
  s.kept = [false, false, false, false, false];
  s.rollsUsed = 0;
  s.turn = advance(s.turn, 1);

  if (gameFinished(s)) {
    s.finished = true;
    s.log.push("🏁 Final scorecard complete!");
  }
}
