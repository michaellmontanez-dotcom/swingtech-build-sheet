import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, shuffle, type RNG } from "@/games/rng";
import { activePlayer, advance, initTurn, isActive, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Tiles — double-six set: 28 tiles [0|0] .. [6|6].
// A tile has two pip values a <= b. id is stable, e.g. "3-5".
// ----------------------------------------------------------------------------
export interface Tile {
  id: string;
  a: number; // pip value, a <= b
  b: number;
}

export type DominoesVariant = "block" | "draw";

function buildSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      tiles.push({ id: `${a}-${b}`, a, b });
    }
  }
  return tiles; // 28 tiles
}

function pipValue(t: Tile): number {
  return t.a + t.b;
}

// ----------------------------------------------------------------------------
// State
//
// The played chain is stored as an ordered list of placed tiles, each carrying
// the orientation actually used so we can render pips. `leftEnd` / `rightEnd`
// are the two currently-open pip values. The very first tile sets both ends.
// ----------------------------------------------------------------------------
export interface PlacedTile {
  id: string;
  // values as laid out left-to-right along the chain
  left: number;
  right: number;
}

export interface DominoesState {
  hands: Record<string, Tile[]>;
  boneyard: Tile[];
  chain: PlacedTile[];
  leftEnd: number | null; // open pip value at the left end (null before first play)
  rightEnd: number | null; // open pip value at the right end
  turn: TurnState;
  config: { variant: DominoesVariant };
  seed: number;
  rngCounter: number;
  consecutivePasses: number; // for detecting a blocked board
  log: string[];
  finished: boolean;
  // Round scoring result (see isGameOver / SCORING note below).
  winnerIds: string[];
  scores: Record<string, number>;
  names: Record<string, string>;
}

// Deterministic per-draw RNG: every boneyard draw bumps rngCounter so applyMove
// stays pure (no Math.random) — same recipe Uno uses for reshuffles.
function nextRng(state: DominoesState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

function name(s: DominoesState, id: string): string {
  return s.names[id] ?? "Player";
}

// Which open ends does this tile match? (before first play, anything matches)
function matchingEnds(state: DominoesState, tile: Tile): ("left" | "right")[] {
  if (state.leftEnd === null) return ["left", "right"]; // opening move
  const ends: ("left" | "right")[] = [];
  if (tile.a === state.leftEnd || tile.b === state.leftEnd) ends.push("left");
  if (tile.a === state.rightEnd || tile.b === state.rightEnd) ends.push("right");
  return ends;
}

function canPlayTile(state: DominoesState, tile: Tile): boolean {
  return matchingEnds(state, tile).length > 0;
}

function hasAnyPlay(state: DominoesState, playerId: string): boolean {
  return (state.hands[playerId] ?? []).some((t) => canPlayTile(state, t));
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const dominoes: GameModule<DominoesState> = {
  type: "dominoes",
  name: "Dominoes",
  emoji: "🁢",
  blurb: "Match the pips, chain your tiles, be first to call Domino!",
  minPlayers: 2,
  maxPlayers: 4,
  config: [
    {
      key: "variant",
      label: "Variant",
      type: "select",
      default: "draw",
      options: [
        { value: "draw", label: "Draw (pull from boneyard)" },
        { value: "block", label: "Block (pass if stuck)" },
      ],
      help: "Draw: pull tiles from the boneyard until you can play. Block: just pass.",
    },
  ],

  initGame(players: PlayerInfo[], config): DominoesState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const rng = mulberry32(seed);
    const boneyard = shuffle(buildSet(), rng);

    const ordered = [...players].sort((p, q) => p.seat - q.seat);
    const hands: Record<string, Tile[]> = {};
    const names: Record<string, string> = {};
    for (const p of ordered) {
      hands[p.id] = [];
      names[p.id] = p.name;
    }

    // Deal: 7 each for 2 players, 5 each for 3-4.
    const perHand = players.length === 2 ? 7 : 5;
    for (let i = 0; i < perHand; i++) {
      for (const p of ordered) hands[p.id].push(boneyard.pop()!);
    }

    // Starting player holds the highest double, else the highest tile overall.
    const startId = pickStarter(hands, ordered.map((p) => p.id));
    const order = ordered.map((p) => p.id);
    const turn = initTurn(order, order.indexOf(startId));

    const variant: DominoesVariant = config?.variant === "block" ? "block" : "draw";

    return {
      hands,
      boneyard,
      chain: [],
      leftEnd: null,
      rightEnd: null,
      turn,
      config: { variant },
      seed,
      rngCounter: 0,
      consecutivePasses: 0,
      log: [`Game started — ${names[startId]} leads.`],
      finished: false,
      winnerIds: [],
      scores: {},
      names,
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Round over." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };
    const hand = state.hands[playerId] ?? [];

    switch (move.type) {
      case "play": {
        const tile = hand.find((t) => t.id === move.tile);
        if (!tile) return { ok: false, error: "You don't have that tile." };
        const end = move.end as "left" | "right";
        if (end !== "left" && end !== "right") return { ok: false, error: "Choose an end." };
        const ends = matchingEnds(state, tile);
        if (!ends.includes(end)) return { ok: false, error: "That tile doesn't match that end." };
        return { ok: true };
      }
      case "draw": {
        if (state.config.variant !== "draw") return { ok: false, error: "No drawing in Block." };
        if (hasAnyPlay(state, playerId)) return { ok: false, error: "You have a legal play." };
        if (state.boneyard.length === 0) return { ok: false, error: "Boneyard is empty." };
        return { ok: true };
      }
      case "pass": {
        if (hasAnyPlay(state, playerId)) return { ok: false, error: "You have a legal play." };
        if (state.config.variant === "draw" && state.boneyard.length > 0)
          return { ok: false, error: "Draw from the boneyard first." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): DominoesState {
    const s: DominoesState = structuredClone(state);
    switch (move.type) {
      case "play":
        playTile(s, playerId, move);
        break;
      case "draw":
        drawTile(s, playerId);
        break;
      case "pass":
        s.log.push(`${name(s, playerId)} passed.`);
        s.consecutivePasses += 1;
        endTurnOrBlock(s);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    return {
      winners: state.winnerIds,
      scores: state.scores,
      reason: state.log[state.log.length - 1],
    };
  },

  getPlayerView(state, playerId) {
    // PUBLIC projection: tile COUNTS only, the played chain with both open ends,
    // boneyard count, whose turn, scores. Never anyone's actual tiles.
    const pub = {
      type: "dominoes" as const,
      chain: state.chain,
      leftEnd: state.leftEnd,
      rightEnd: state.rightEnd,
      boneyardCount: state.boneyard.length,
      variant: state.config.variant,
      activePlayerId: activePlayer(state.turn),
      finished: state.finished,
      winnerIds: state.winnerIds,
      scores: state.scores,
      log: state.log.slice(-6),
      players: state.turn.order.map((id) => ({
        id,
        name: state.names[id],
        tileCount: state.hands[id]?.length ?? 0,
      })),
    };
    if (playerId && state.hands[playerId]) {
      const myTurn = isActive(state.turn, playerId);
      const canDraw =
        myTurn && state.config.variant === "draw" && !hasAnyPlay(state, playerId) && state.boneyard.length > 0;
      const mustPass = myTurn && !hasAnyPlay(state, playerId) && !canDraw;
      return {
        ...pub,
        you: playerId,
        hand: state.hands[playerId],
        // for each of your tiles, which ends it can attach to (empty = unplayable)
        playable: state.hands[playerId].map((t) => ({
          id: t.id,
          ends: myTurn ? matchingEnds(state, t) : [],
        })),
        canDraw,
        mustPass,
      };
    }
    return {
      ...pub,
      you: null,
      hand: [] as Tile[],
      playable: [] as { id: string; ends: ("left" | "right")[] }[],
      canDraw: false,
      mustPass: false,
    };
  },
};

// ----------------------------------------------------------------------------
// Internal helpers (mutate a cloned state)
// ----------------------------------------------------------------------------

// Highest double wins the lead; otherwise the heaviest tile (pip sum, then max
// single pip as a deterministic tiebreaker).
function pickStarter(hands: Record<string, Tile[]>, order: string[]): string {
  let bestId = order[0];
  let bestKey = -1;
  let bestDouble = -1;
  for (const id of order) {
    for (const t of hands[id]) {
      if (t.a === t.b && t.a > bestDouble) {
        bestDouble = t.a;
        bestId = id;
      }
    }
  }
  if (bestDouble >= 0) return bestId;
  // no doubles dealt — fall back to heaviest tile
  for (const id of order) {
    for (const t of hands[id]) {
      const key = pipValue(t) * 10 + Math.max(t.a, t.b);
      if (key > bestKey) {
        bestKey = key;
        bestId = id;
      }
    }
  }
  return bestId;
}

function playTile(s: DominoesState, playerId: string, move: Move) {
  const hand = s.hands[playerId];
  const idx = hand.findIndex((t) => t.id === move.tile);
  const tile = hand.splice(idx, 1)[0];
  const end = move.end as "left" | "right";
  s.consecutivePasses = 0;

  if (s.leftEnd === null) {
    // opening move: lay the tile flat; both pip values become the open ends.
    s.chain.push({ id: tile.id, left: tile.a, right: tile.b });
    s.leftEnd = tile.a;
    s.rightEnd = tile.b;
  } else if (end === "left") {
    // The matched pip touches the chain; the other pip becomes the new open end.
    const matched = s.leftEnd;
    const open = tile.a === matched ? tile.b : tile.a;
    // place so the tile's `right` (inner) value equals the matched end
    s.chain.unshift({ id: tile.id, left: open, right: matched });
    s.leftEnd = open;
  } else {
    const matched = s.rightEnd!;
    const open = tile.a === matched ? tile.b : tile.a;
    s.chain.push({ id: tile.id, left: matched, right: open });
    s.rightEnd = open;
  }

  s.log.push(`${name(s, playerId)} played [${tile.a}|${tile.b}] on the ${end}.`);

  if (hand.length === 0) {
    // Domino! — this player emptied their hand and wins the round.
    finishRound(s, [playerId], `🏆 ${name(s, playerId)} called Domino!`);
    return;
  }
  s.turn = advance(s.turn, 1);
}

function drawTile(s: DominoesState, playerId: string) {
  // Draw repeatedly until the player can play or the boneyard is empty.
  // We draw one tile per `draw` move so each transition is a discrete step.
  if (s.boneyard.length === 0) return;
  // shuffle remaining boneyard deterministically before pulling (keeps draws
  // reproducible from seed+counter even though order was already random).
  const rng = nextRng(s);
  s.boneyard = shuffle(s.boneyard, rng);
  const tile = s.boneyard.pop()!;
  s.hands[playerId].push(tile);
  s.log.push(`${name(s, playerId)} drew from the boneyard.`);
  // turn does NOT advance — player may draw again or now play/pass.
}

// After a pass, advance the turn and check whether the whole board is blocked
// (every player passed in a row with no possible play).
function endTurnOrBlock(s: DominoesState) {
  if (s.consecutivePasses >= s.turn.order.length) {
    resolveBlocked(s);
    return;
  }
  s.turn = advance(s.turn, 1);
}

// Blocked board: winner is the player with the fewest pips in hand (ties → all
// tied players win). Score = sum of opponents' remaining pips (see note below).
function resolveBlocked(s: DominoesState) {
  let min = Infinity;
  for (const id of s.turn.order) {
    const pips = handPips(s, id);
    if (pips < min) min = pips;
  }
  const winners = s.turn.order.filter((id) => handPips(s, id) === min);
  finishRound(s, winners, `Board blocked — fewest pips wins.`);
}

function handPips(s: DominoesState, id: string): number {
  return (s.hands[id] ?? []).reduce((n, t) => n + pipValue(t), 0);
}

// SCORING CHOICE (documented):
//   scores[winner]   = sum of pips remaining in ALL opponents' hands (positive).
//                      For a blocked board with tied winners, each tied winner
//                      receives the sum of pips held by every NON-winner.
//   scores[opponent] = that opponent's own remaining pip count, reported as a
//                      NEGATIVE number (their "deadwood" still in hand).
// This makes the winner's gain explicit while still surfacing each loser's
// leftover pips, satisfying both reporting styles requested.
function finishRound(s: DominoesState, winners: string[], reason: string) {
  s.finished = true;
  s.winnerIds = winners;
  const winnerSet = new Set(winners);
  const opponentPipTotal = s.turn.order
    .filter((id) => !winnerSet.has(id))
    .reduce((n, id) => n + handPips(s, id), 0);

  const scores: Record<string, number> = {};
  for (const id of s.turn.order) {
    if (winnerSet.has(id)) scores[id] = opponentPipTotal;
    else scores[id] = -handPips(s, id);
  }
  s.scores = scores;
  s.log.push(reason);
}
