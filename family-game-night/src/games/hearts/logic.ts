import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, shuffle } from "@/games/rng";

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------
export type Suit = "C" | "D" | "S" | "H"; // clubs, diamonds, spades, hearts
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J 12=Q 13=K 14=A

export interface Card {
  id: string; // e.g. "C2", "SH" not used — id is `${suit}${rank}` like "C2","SQ"...
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ["C", "D", "S", "H"];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const TWO_OF_CLUBS = "C2";
export const QUEEN_OF_SPADES = "SQ";

function rankLabel(r: Rank): string {
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  if (r === 14) return "A";
  return String(r);
}

function cardId(suit: Suit, rank: Rank): string {
  return `${suit}${rankLabel(rank)}`;
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: cardId(suit, rank), suit, rank });
    }
  }
  return deck; // 52 cards
}

function isHeart(c: Card): boolean {
  return c.suit === "H";
}

function isQueenOfSpades(c: Card): boolean {
  return c.id === QUEEN_OF_SPADES;
}

function cardPoints(c: Card): number {
  if (isQueenOfSpades(c)) return 13;
  if (isHeart(c)) return 1;
  return 0;
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export type Phase = "passing" | "playing" | "handEnd" | "gameOver";
export type PassDirection = "left" | "right" | "across" | "none";

const PASS_CYCLE: PassDirection[] = ["left", "right", "across", "none"];

export interface TrickPlay {
  playerId: string;
  card: Card;
}

export interface HeartsState {
  order: string[]; // player ids in seat order (exactly 4)
  names: Record<string, string>;
  hands: Record<string, Card[]>;
  scores: Record<string, number>; // cumulative across hands
  phase: Phase;
  handNumber: number; // 0-based; pass direction derives from this
  passDirection: PassDirection;
  pendingPasses: Record<string, Card[]>; // playerId -> 3 cards they chose to pass (before resolve)
  passedBy: string[]; // who has submitted a pass this hand
  heartsBroken: boolean;
  leaderId: string | null; // who leads the current trick
  currentTrick: TrickPlay[]; // plays in this trick, in play order
  activeIndex: number; // index into order whose turn it is (during play)
  tricksTaken: Record<string, number>; // tricks won this hand (for info)
  pointsThisHand: Record<string, number>; // points accumulated this hand
  lastTrickWinner: string | null; // for banner
  lastTrickPoints: number;
  handResult: Record<string, number> | null; // per-hand points after scoring (for banner)
  shotTheMoon: string | null; // player id who shot the moon last hand
  winners: string[]; // final winners when gameOver
  seed: number;
  rngCounter: number;
  targetScore: number; // game ends when someone reaches this
  log: string[];
}

function name(s: HeartsState, id: string): string {
  return s.names[id] ?? "Player";
}

function activePlayer(s: HeartsState): string {
  return s.order[s.activeIndex];
}

// Sort helper: clubs, diamonds, spades, hearts; ascending rank.
function suitOrder(suit: Suit): number {
  return SUITS.indexOf(suit);
}
export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) =>
    suitOrder(a.suit) - suitOrder(b.suit) || a.rank - b.rank
  );
}

// ----------------------------------------------------------------------------
// Dealing
// ----------------------------------------------------------------------------
function deal(s: HeartsState): void {
  s.rngCounter += 1;
  const rng = mulberry32(s.seed + s.rngCounter * 2654435761);
  const deck = shuffle(buildDeck(), rng);
  for (const id of s.order) s.hands[id] = [];
  for (let i = 0; i < deck.length; i++) {
    s.hands[s.order[i % 4]].push(deck[i]);
  }
  for (const id of s.order) s.hands[id] = sortHand(s.hands[id]);
}

function passDirectionForHand(handNumber: number): PassDirection {
  return PASS_CYCLE[handNumber % PASS_CYCLE.length];
}

// Resolve simultaneous passing: rotate the chosen cards per direction.
function resolvePasses(s: HeartsState): void {
  const dir = s.passDirection;
  // map giver seat index -> receiver seat index
  const targetOffset =
    dir === "left" ? 1 : dir === "right" ? 3 : dir === "across" ? 2 : 0;
  // remove passed cards from each giver's hand, then add to receivers
  const incoming: Record<string, Card[]> = {};
  for (const id of s.order) incoming[id] = [];
  for (let i = 0; i < 4; i++) {
    const giver = s.order[i];
    const receiver = s.order[(i + targetOffset) % 4];
    const passed = s.pendingPasses[giver] ?? [];
    const passedIds = new Set(passed.map((c) => c.id));
    s.hands[giver] = s.hands[giver].filter((c) => !passedIds.has(c.id));
    incoming[receiver].push(...passed);
  }
  for (const id of s.order) {
    s.hands[id].push(...incoming[id]);
    s.hands[id] = sortHand(s.hands[id]);
  }
  s.pendingPasses = {};
  s.passedBy = [];
}

function startPlay(s: HeartsState): void {
  s.phase = "playing";
  s.heartsBroken = false;
  s.currentTrick = [];
  for (const id of s.order) {
    s.pointsThisHand[id] = 0;
    s.tricksTaken[id] = 0;
  }
  // player holding 2♣ leads
  const leader = s.order.find((id) =>
    s.hands[id].some((c) => c.id === TWO_OF_CLUBS)
  )!;
  s.leaderId = leader;
  s.activeIndex = s.order.indexOf(leader);
}

function beginHand(s: HeartsState): void {
  s.passDirection = passDirectionForHand(s.handNumber);
  deal(s);
  s.handResult = null;
  s.shotTheMoon = null;
  if (s.passDirection === "none") {
    startPlay(s);
  } else {
    s.phase = "passing";
    s.pendingPasses = {};
    s.passedBy = [];
  }
}

// ----------------------------------------------------------------------------
// Legality of a play
// ----------------------------------------------------------------------------
function hand(s: HeartsState, id: string): Card[] {
  return s.hands[id] ?? [];
}

function isFirstTrick(s: HeartsState): boolean {
  // first trick of the hand: nobody has taken a trick yet and we are still
  // within the opening trick (13 cards each at start; <13 once any played out).
  return Object.values(s.tricksTaken).reduce((a, b) => a + b, 0) === 0;
}

// Returns null if legal, otherwise an error string.
function playError(s: HeartsState, playerId: string, card: Card): string | null {
  const h = hand(s, playerId);
  if (!h.some((c) => c.id === card.id)) return "You don't have that card.";

  const leading = s.currentTrick.length === 0;
  const firstTrick = isFirstTrick(s);

  if (leading) {
    if (firstTrick) {
      // must lead the 2 of clubs
      if (card.id !== TWO_OF_CLUBS) return "You must lead the 2♣.";
      return null;
    }
    // hearts cannot be led until broken, unless the leader has only hearts
    if (isHeart(card) && !s.heartsBroken) {
      const onlyHearts = h.every((c) => isHeart(c));
      if (!onlyHearts) return "Hearts have not been broken.";
    }
    return null;
  }

  // following: must follow the led suit if able
  const ledSuit = s.currentTrick[0].card.suit;
  const hasLed = h.some((c) => c.suit === ledSuit);
  if (hasLed && card.suit !== ledSuit) return "You must follow suit.";

  // first trick: cannot dump hearts or Q♠ (unless you have nothing else)
  if (firstTrick && (isHeart(card) || isQueenOfSpades(card))) {
    const hasSafe = h.some((c) => !isHeart(c) && !isQueenOfSpades(c));
    if (hasSafe) return "No hearts or Q♠ on the first trick.";
  }
  return null;
}

// ----------------------------------------------------------------------------
// Trick resolution
// ----------------------------------------------------------------------------
function trickWinner(trick: TrickPlay[]): string {
  const ledSuit = trick[0].card.suit;
  let best = trick[0];
  for (const tp of trick) {
    if (tp.card.suit === ledSuit && tp.card.rank > best.card.rank) best = tp;
  }
  return best.playerId;
}

function scoreHand(s: HeartsState): void {
  // pointsThisHand already accumulated during play. Check shoot the moon.
  const shooter = s.order.find((id) => s.pointsThisHand[id] === 26);
  if (shooter) {
    s.shotTheMoon = shooter;
    for (const id of s.order) {
      s.scores[id] += id === shooter ? 0 : 26;
    }
    s.handResult = {};
    for (const id of s.order) s.handResult[id] = id === shooter ? 0 : 26;
  } else {
    s.handResult = {};
    for (const id of s.order) {
      s.scores[id] += s.pointsThisHand[id];
      s.handResult[id] = s.pointsThisHand[id];
    }
  }
}

function checkGameOver(s: HeartsState): boolean {
  const reached = s.order.some((id) => s.scores[id] >= s.targetScore);
  if (!reached) return false;
  const min = Math.min(...s.order.map((id) => s.scores[id]));
  s.winners = s.order.filter((id) => s.scores[id] === min);
  s.phase = "gameOver";
  return true;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const hearts: GameModule<HeartsState> = {
  type: "hearts",
  name: "Hearts",
  emoji: "♥️",
  blurb: "Dodge the hearts and the Queen of Spades — lowest score wins!",
  minPlayers: 4,
  maxPlayers: 4,

  initGame(players: PlayerInfo[], config): HeartsState {
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    const order = ordered.map((p) => p.id);
    const names: Record<string, string> = {};
    const scores: Record<string, number> = {};
    for (const p of ordered) {
      names[p.id] = p.name;
      scores[p.id] = 0;
    }
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const targetScore = (config?.targetScore as number) ?? 100;

    const s: HeartsState = {
      order,
      names,
      hands: {},
      scores,
      phase: "passing",
      handNumber: 0,
      passDirection: "left",
      pendingPasses: {},
      passedBy: [],
      heartsBroken: false,
      leaderId: null,
      currentTrick: [],
      activeIndex: 0,
      tricksTaken: {},
      pointsThisHand: {},
      lastTrickWinner: null,
      lastTrickPoints: 0,
      handResult: null,
      shotTheMoon: null,
      winners: [],
      seed,
      rngCounter: 0,
      targetScore,
      log: ["Game started."],
    };
    for (const id of order) {
      s.pointsThisHand[id] = 0;
      s.tricksTaken[id] = 0;
    }
    beginHand(s);
    return s;
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.phase === "gameOver") return { ok: false, error: "Game over." };
    if (!(playerId in state.hands)) return { ok: false, error: "Not in this game." };

    switch (move.type) {
      case "pass": {
        if (state.phase !== "passing") return { ok: false, error: "Not the passing phase." };
        if (state.passedBy.includes(playerId)) return { ok: false, error: "You already passed." };
        const ids = move.cards as unknown;
        if (!Array.isArray(ids) || ids.length !== 3)
          return { ok: false, error: "Pass exactly 3 cards." };
        const distinct = new Set(ids);
        if (distinct.size !== 3) return { ok: false, error: "Pass 3 distinct cards." };
        const h = state.hands[playerId];
        for (const id of ids) {
          if (!h.some((c) => c.id === id))
            return { ok: false, error: "You don't hold one of those cards." };
        }
        return { ok: true };
      }
      case "play": {
        if (state.phase !== "playing") return { ok: false, error: "Not the play phase." };
        if (activePlayer(state) !== playerId) return { ok: false, error: "Not your turn." };
        const card = state.hands[playerId].find((c) => c.id === move.card);
        if (!card) return { ok: false, error: "You don't have that card." };
        const err = playError(state, playerId, card);
        if (err) return { ok: false, error: err };
        return { ok: true };
      }
      case "nextHand": {
        if (state.phase !== "handEnd") return { ok: false, error: "Hand is not over." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): HeartsState {
    const s: HeartsState = structuredClone(state);
    switch (move.type) {
      case "pass":
        applyPass(s, playerId, move);
        break;
      case "play":
        applyPlay(s, playerId, move);
        break;
      case "nextHand":
        s.handNumber += 1;
        beginHand(s);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (state.phase !== "gameOver") return null;
    return {
      winners: state.winners,
      scores: { ...state.scores },
      reason:
        state.winners.length === 1
          ? `${name(state, state.winners[0])} wins with the lowest score!`
          : "Tie for the lowest score!",
    };
  },

  getPlayerView(state, playerId) {
    const pub = {
      type: "hearts" as const,
      phase: state.phase,
      handNumber: state.handNumber,
      passDirection: state.passDirection,
      heartsBroken: state.heartsBroken,
      activePlayerId: state.phase === "playing" ? activePlayer(state) : null,
      leaderId: state.leaderId,
      currentTrick: state.currentTrick.map((tp) => ({
        playerId: tp.playerId,
        card: tp.card,
      })),
      lastTrickWinner: state.lastTrickWinner,
      lastTrickPoints: state.lastTrickPoints,
      handResult: state.handResult,
      shotTheMoon: state.shotTheMoon,
      winners: state.winners,
      log: state.log.slice(-6),
      players: state.order.map((id) => ({
        id,
        name: state.names[id],
        handCount: state.hands[id]?.length ?? 0,
        score: state.scores[id],
        pointsThisHand: state.pointsThisHand[id] ?? 0,
        tricksTaken: state.tricksTaken[id] ?? 0,
        hasPassed: state.passedBy.includes(id),
      })),
    };
    if (playerId && state.hands[playerId]) {
      const myHand = sortHand(state.hands[playerId]);
      return {
        ...pub,
        you: playerId,
        hand: myHand,
        myPass: state.pendingPasses[playerId] ?? null,
        hasPassed: state.passedBy.includes(playerId),
        // ids of cards currently legal to play (empty unless it's a play turn for you)
        playable:
          state.phase === "playing" && activePlayer(state) === playerId
            ? myHand.filter((c) => playError(state, playerId, c) === null).map((c) => c.id)
            : [],
      };
    }
    return { ...pub, you: null, hand: [] as Card[], myPass: null, hasPassed: false, playable: [] as string[] };
  },
};

// ----------------------------------------------------------------------------
// Internal apply helpers (mutate a cloned state)
// ----------------------------------------------------------------------------
function applyPass(s: HeartsState, playerId: string, move: Move): void {
  const ids = move.cards as string[];
  const h = s.hands[playerId];
  const cards = ids.map((id) => h.find((c) => c.id === id)!).filter(Boolean);
  s.pendingPasses[playerId] = cards;
  if (!s.passedBy.includes(playerId)) s.passedBy.push(playerId);
  s.log.push(`${name(s, playerId)} passed 3 cards.`);
  if (s.passedBy.length === 4) {
    resolvePasses(s);
    s.log.push("All passes exchanged.");
    startPlay(s);
  }
}

function applyPlay(s: HeartsState, playerId: string, move: Move): void {
  const h = s.hands[playerId];
  const idx = h.findIndex((c) => c.id === move.card);
  const card = h.splice(idx, 1)[0];
  s.currentTrick.push({ playerId, card });
  if (isHeart(card) || isQueenOfSpades(card)) s.heartsBroken = true;
  s.log.push(`${name(s, playerId)} played ${card.id}.`);

  if (s.currentTrick.length < 4) {
    s.activeIndex = (s.activeIndex + 1) % 4;
    return;
  }

  // trick complete
  const winner = trickWinner(s.currentTrick);
  const pts = s.currentTrick.reduce((sum, tp) => sum + cardPoints(tp.card), 0);
  s.pointsThisHand[winner] += pts;
  s.tricksTaken[winner] += 1;
  s.lastTrickWinner = winner;
  s.lastTrickPoints = pts;
  s.log.push(`${name(s, winner)} took the trick (+${pts}).`);
  s.currentTrick = [];
  s.leaderId = winner;
  s.activeIndex = s.order.indexOf(winner);

  // hand over when all hands empty
  const handDone = s.order.every((id) => s.hands[id].length === 0);
  if (handDone) {
    scoreHand(s);
    if (s.shotTheMoon) {
      s.log.push(`🌙 ${name(s, s.shotTheMoon)} shot the moon!`);
    }
    if (!checkGameOver(s)) {
      s.phase = "handEnd";
    }
  }
}
