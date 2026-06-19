import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, shuffle } from "@/games/rng";
import { advance, initTurn, isActive, activePlayer, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Suit = "♠" | "♥" | "♦" | "♣";

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
}

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ id: `c${n++}`, rank, suit });
    }
  }
  return deck; // 52 cards
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export interface GoFishState {
  pool: Card[]; // the ocean / draw pile (top = end)
  hands: Record<string, Card[]>;
  books: Record<string, Rank[]>; // completed sets of 4, by rank
  turn: TurnState;
  seed: number;
  log: string[];
  finished: boolean;
  names: Record<string, string>;
}

function name(s: GoFishState, id: string): string {
  return s.names[id] ?? "Player";
}

function handHasRank(hand: Card[], rank: Rank): boolean {
  return hand.some((c) => c.rank === rank);
}

// Move all cards of `rank` from `from` hand to the end of `to` hand. Returns count moved.
function transferRank(s: GoFishState, fromId: string, toId: string, rank: Rank): number {
  const from = s.hands[fromId];
  const moved = from.filter((c) => c.rank === rank);
  s.hands[fromId] = from.filter((c) => c.rank !== rank);
  s.hands[toId].push(...moved);
  return moved.length;
}

// Pull any completed books (4 of a rank) out of a player's hand into their book pile.
function collectBooks(s: GoFishState, playerId: string): Rank[] {
  const hand = s.hands[playerId];
  const counts: Record<string, number> = {};
  for (const c of hand) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
  const newBooks: Rank[] = [];
  for (const rank of RANKS) {
    if (counts[rank] === 4) {
      newBooks.push(rank);
      s.books[playerId].push(rank);
    }
  }
  if (newBooks.length > 0) {
    s.hands[playerId] = hand.filter((c) => !newBooks.includes(c.rank));
  }
  return newBooks;
}

function totalBooks(s: GoFishState): number {
  return Object.values(s.books).reduce((n, b) => n + b.length, 0);
}

// If the active player's hand is empty but the pool has cards, draw one up to their turn.
function refillIfEmpty(s: GoFishState) {
  const pid = activePlayer(s.turn);
  if (s.hands[pid].length === 0 && s.pool.length > 0) {
    const card = s.pool.pop()!;
    s.hands[pid].push(card);
    s.log.push(`${name(s, pid)} had an empty hand and drew a card 🌊.`);
    collectBooks(s, pid);
  }
}

// Check end-of-game and advance the turn to the next player who can act.
// A player can act if (after refill) they hold at least one card.
function passTurn(s: GoFishState) {
  s.turn = advance(s.turn, 1);
  // skip players who cannot act (empty hand AND empty pool)
  for (let i = 0; i < s.turn.order.length; i++) {
    refillIfEmpty(s);
    const pid = activePlayer(s.turn);
    if (s.hands[pid].length > 0) return;
    // this player can't act; move on
    s.turn = advance(s.turn, 1);
  }
}

function checkGameOver(s: GoFishState) {
  const allBooks = totalBooks(s) === RANKS.length;
  const allEmpty = s.pool.length === 0 && Object.values(s.hands).every((h) => h.length === 0);
  if (allBooks || allEmpty) {
    s.finished = true;
    s.log.push("🏁 Game over!");
  }
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const gofish: GameModule<GoFishState> = {
  type: "gofish",
  name: "Go Fish",
  emoji: "🐟",
  blurb: "Ask for ranks, reel in matches, collect books of four!",
  minPlayers: 2,
  maxPlayers: 6,

  initGame(players: PlayerInfo[], config): GoFishState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const rng = mulberry32(seed);
    const pool = shuffle(buildDeck(), rng);

    const hands: Record<string, Card[]> = {};
    const books: Record<string, Rank[]> = {};
    const names: Record<string, string> = {};
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    for (const p of ordered) {
      hands[p.id] = [];
      books[p.id] = [];
      names[p.id] = p.name;
    }

    const dealCount = players.length >= 4 ? 5 : 7;
    for (let i = 0; i < dealCount; i++) {
      for (const p of ordered) hands[p.id].push(pool.pop()!);
    }

    const state: GoFishState = {
      pool,
      hands,
      books,
      turn: initTurn(ordered.map((p) => p.id)),
      seed,
      log: [`Game started — dealt ${dealCount} cards each. 🐟`],
      finished: false,
      names,
    };

    // pull out any books that were dealt complete, and ensure starting player can act
    for (const p of ordered) collectBooks(state, p.id);
    refillIfEmpty(state);
    checkGameOver(state);
    return state;
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (move.type !== "ask") return { ok: false, error: "Unknown move." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };

    const targetId = move.targetId as string;
    const rank = move.rank as Rank;

    if (targetId === playerId) return { ok: false, error: "You can't ask yourself." };
    if (!(targetId in state.hands)) return { ok: false, error: "No such player." };
    if (!RANKS.includes(rank)) return { ok: false, error: "Pick a rank." };
    if (!handHasRank(state.hands[playerId], rank))
      return { ok: false, error: "You must hold a card of that rank to ask for it." };

    return { ok: true };
  },

  applyMove(state, playerId, move): GoFishState {
    const s: GoFishState = structuredClone(state);
    const targetId = move.targetId as string;
    const rank = move.rank as Rank;

    const moved = transferRank(s, targetId, playerId, rank);

    if (moved > 0) {
      s.log.push(
        `${name(s, playerId)} asked ${name(s, targetId)} for ${rank}s — got 'em! 🎣 (${moved})`
      );
      collectBooks(s, playerId);
      // asker takes another turn (does NOT advance); refill if their hand emptied via a book
      refillIfEmpty(s);
      checkGameOver(s);
      if (s.finished) return s;
      // if asker now has no cards and pool empty, they cannot ask again — pass on
      if (s.hands[playerId].length === 0) passTurn(s);
      return s;
    }

    // Go Fish!
    s.log.push(`${name(s, targetId)} says "Go Fish!" 🐟`);
    if (s.pool.length > 0) {
      const drawn = s.pool.pop()!;
      s.hands[playerId].push(drawn);
      const lucky = drawn.rank === rank;
      collectBooks(s, playerId);
      if (lucky) {
        s.log.push(`${name(s, playerId)} fished a ${rank} — go again! 🍀`);
        refillIfEmpty(s);
        checkGameOver(s);
        if (s.finished) return s;
        if (s.hands[playerId].length === 0) passTurn(s);
        return s;
      }
      s.log.push(`${name(s, playerId)} drew from the ocean.`);
      checkGameOver(s);
      if (s.finished) return s;
      passTurn(s);
      return s;
    }

    // pool empty: turn simply passes
    s.log.push("The ocean is empty — turn passes.");
    checkGameOver(s);
    if (s.finished) return s;
    passTurn(s);
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    const scores: Record<string, number> = {};
    let best = -1;
    for (const id of state.turn.order) {
      const n = state.books[id].length;
      scores[id] = n;
      if (n > best) best = n;
    }
    const winners = state.turn.order.filter((id) => scores[id] === best);
    return {
      winners,
      scores,
      reason:
        winners.length === 1
          ? `${name(state, winners[0])} collected the most books!`
          : "It's a tie!",
    };
  },

  getPlayerView(state, playerId) {
    const pub = {
      type: "gofish" as const,
      activePlayerId: activePlayer(state.turn),
      poolCount: state.pool.length,
      finished: state.finished,
      log: state.log.slice(-6),
      players: state.turn.order.map((id) => ({
        id,
        name: state.names[id],
        handCount: state.hands[id]?.length ?? 0,
        bookCount: state.books[id]?.length ?? 0,
        books: [...(state.books[id] ?? [])], // completed ranks are public (face-up)
      })),
    };
    if (playerId && state.hands[playerId]) {
      // ranks the player holds, so the View can build a rank picker
      const askable = RANKS.filter((r) => handHasRank(state.hands[playerId], r));
      return {
        ...pub,
        you: playerId,
        hand: [...state.hands[playerId]],
        myBooks: [...(state.books[playerId] ?? [])],
        askableRanks: askable,
      };
    }
    return {
      ...pub,
      you: null,
      hand: [] as Card[],
      myBooks: [] as Rank[],
      askableRanks: [] as Rank[],
    };
  },
};
