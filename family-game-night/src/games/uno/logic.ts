import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, shuffle, type RNG } from "@/games/rng";
import { advance, initTurn, isActive, reverse, activePlayer, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------
export type UnoColor = "red" | "yellow" | "green" | "blue";
export type CardColor = UnoColor | "wild";
export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  id: string;
  color: CardColor;
  kind: CardKind;
  value?: number; // for number cards 0-9
}

const COLORS: UnoColor[] = ["red", "yellow", "green", "blue"];

function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  let n = 0;
  const add = (c: CardColor, kind: CardKind, value?: number) =>
    deck.push({ id: `c${n++}`, color: c, kind, value });

  for (const color of COLORS) {
    add(color, "number", 0); // one 0
    for (let v = 1; v <= 9; v++) {
      add(color, "number", v);
      add(color, "number", v); // two of 1-9
    }
    for (let k = 0; k < 2; k++) {
      add(color, "skip");
      add(color, "reverse");
      add(color, "draw2");
    }
  }
  for (let k = 0; k < 4; k++) {
    add("wild", "wild");
    add("wild", "wild4");
  }
  return deck; // 108 cards
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export interface UnoState {
  deck: UnoCard[]; // draw pile (top = end)
  discard: UnoCard[]; // discard pile (top = end)
  hands: Record<string, UnoCard[]>;
  turn: TurnState;
  currentColor: UnoColor; // active color (wilds set this)
  pendingDraw: number; // accumulated +2/+4 to be drawn
  pendingKind: "draw2" | "draw4" | null;
  drewThisTurn: boolean; // active player drew and may now play that card or pass
  saidUno: Record<string, boolean>;
  config: { stacking: boolean };
  seed: number;
  rngCounter: number;
  log: string[];
  finished: boolean;
  winnerId: string | null;
  names: Record<string, string>;
}

function nextRng(state: UnoState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

function topCard(state: UnoState): UnoCard {
  return state.discard[state.discard.length - 1];
}

// Draw `n` cards for a player, reshuffling discard into deck if needed.
function drawForPlayer(state: UnoState, playerId: string, n: number) {
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) {
      const top = state.discard.pop()!;
      const reshuffled = shuffle(state.discard, nextRng(state));
      state.deck = reshuffled;
      state.discard = [top];
      if (state.deck.length === 0) return; // nothing left to draw
    }
    state.hands[playerId].push(state.deck.pop()!);
  }
}

function canPlayCard(state: UnoState, card: UnoCard): boolean {
  const top = topCard(state);
  if (card.color === "wild") return true; // wild / wild4 always playable (house rule: no draw4 challenge)
  if (card.color === state.currentColor) return true;
  if (card.kind === "number" && top.kind === "number" && card.value === top.value) return true;
  if (card.kind !== "number" && card.kind === top.kind) return true;
  return false;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const uno: GameModule<UnoState> = {
  type: "uno",
  name: "Uno",
  emoji: "🎴",
  blurb: "Match colors & numbers, dump your hand, shout UNO!",
  minPlayers: 2,
  maxPlayers: 10,
  config: [
    {
      key: "stacking",
      label: "Stacking (+2 / +4 pile up)",
      type: "boolean",
      default: false,
      help: "Let players stack Draw cards to pass the penalty along.",
    },
  ],

  initGame(players: PlayerInfo[], config): UnoState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const rng = mulberry32(seed);
    let deck = shuffle(buildDeck(), rng);

    const hands: Record<string, UnoCard[]> = {};
    const names: Record<string, string> = {};
    const saidUno: Record<string, boolean> = {};
    for (const p of players) {
      hands[p.id] = [];
      names[p.id] = p.name;
      saidUno[p.id] = false;
    }
    // deal 7 each
    for (let i = 0; i < 7; i++) {
      for (const p of players) hands[p.id].push(deck.pop()!);
    }

    // flip first non-wild-draw4 card as the starting discard
    let firstIdx = deck.length - 1;
    while (firstIdx >= 0 && deck[firstIdx].kind === "wild4") firstIdx--;
    const first = deck.splice(firstIdx, 1)[0];
    const discard = [first];

    const turn = initTurn(
      [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id)
    );

    const state: UnoState = {
      deck,
      discard,
      hands,
      turn,
      currentColor: first.color === "wild" ? COLORS[Math.floor(rng() * 4)] : (first.color as UnoColor),
      pendingDraw: 0,
      pendingKind: null,
      drewThisTurn: false,
      saidUno,
      config: { stacking: Boolean(config?.stacking) },
      seed,
      rngCounter: 0,
      log: ["Game started — deal 7."],
      finished: false,
      winnerId: null,
      names,
    };

    // apply the starting card's effect (skip/reverse/draw2 affect first player)
    applyStartEffect(state, first);
    return state;
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!isActive(state.turn, playerId)) {
      if (move.type === "callUno") return validateCallUno(state, move);
      return { ok: false, error: "Not your turn." };
    }

    switch (move.type) {
      case "play": {
        const card = state.hands[playerId]?.find((c) => c.id === move.cardId);
        if (!card) return { ok: false, error: "You don't have that card." };
        if (state.pendingDraw > 0) {
          if (!state.config.stacking) return { ok: false, error: "You must draw the penalty." };
          // may only stack a matching draw kind
          if (card.kind !== state.pendingKind) return { ok: false, error: `Stack a ${state.pendingKind} or draw.` };
          return { ok: true };
        }
        if (state.drewThisTurn) {
          // after drawing you may only play the card you just drew
          const drawn = state.hands[playerId][state.hands[playerId].length - 1];
          if (card.id !== drawn.id) return { ok: false, error: "Play the drawn card or pass." };
        }
        if (!canPlayCard(state, card)) return { ok: false, error: "That card doesn't match." };
        if (card.color === "wild") {
          const cc = move.chosenColor as UnoColor;
          if (!COLORS.includes(cc)) return { ok: false, error: "Choose a color." };
        }
        return { ok: true };
      }
      case "draw": {
        if (state.drewThisTurn && state.pendingDraw === 0)
          return { ok: false, error: "You already drew." };
        return { ok: true };
      }
      case "pass": {
        if (!state.drewThisTurn) return { ok: false, error: "Draw first before passing." };
        if (state.pendingDraw > 0) return { ok: false, error: "Resolve the penalty first." };
        return { ok: true };
      }
      case "uno": {
        const count = state.hands[playerId]?.length ?? 0;
        if (count > 2) return { ok: false, error: "Too early to call Uno." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): UnoState {
    const s: UnoState = structuredClone(state);
    switch (move.type) {
      case "play":
        playCard(s, playerId, move);
        break;
      case "draw":
        doDraw(s, playerId);
        break;
      case "pass":
        s.log.push(`${name(s, playerId)} passed.`);
        s.drewThisTurn = false;
        s.turn = advance(s.turn, 1);
        break;
      case "uno":
        s.saidUno[playerId] = true;
        s.log.push(`${name(s, playerId)} called UNO! ✋`);
        break;
      case "callUno":
        callUno(s, move.targetId as string);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished || !state.winnerId) return null;
    return { winners: [state.winnerId], reason: `${name(state, state.winnerId)} emptied their hand!` };
  },

  getPlayerView(state, playerId) {
    const pub = {
      type: "uno" as const,
      top: topCard(state),
      currentColor: state.currentColor,
      direction: state.turn.direction,
      activePlayerId: activePlayer(state.turn),
      drawPileCount: state.deck.length,
      discardCount: state.discard.length,
      pendingDraw: state.pendingDraw,
      pendingKind: state.pendingKind,
      drewThisTurn: state.drewThisTurn,
      stacking: state.config.stacking,
      finished: state.finished,
      winnerId: state.winnerId,
      log: state.log.slice(-6),
      players: state.turn.order.map((id) => ({
        id,
        name: state.names[id],
        handCount: state.hands[id]?.length ?? 0,
        saidUno: state.saidUno[id] ?? false,
      })),
    };
    if (playerId && state.hands[playerId]) {
      return {
        ...pub,
        you: playerId,
        hand: state.hands[playerId],
        playable: state.hands[playerId]
          .filter((c) => (state.pendingDraw > 0 ? c.kind === state.pendingKind : isActive(state.turn, playerId) && (!state.drewThisTurn || c.id === state.hands[playerId][state.hands[playerId].length - 1].id) && canPlayCard(state, c)))
          .map((c) => c.id),
      };
    }
    return { ...pub, you: null, hand: [] as UnoCard[], playable: [] as string[] };
  },
};

// ----------------------------------------------------------------------------
// Internal helpers (mutate a cloned state)
// ----------------------------------------------------------------------------
function name(s: UnoState, id: string) {
  return s.names[id] ?? "Player";
}

function applyStartEffect(state: UnoState, first: UnoCard) {
  // Effects of the very first flipped card, per standard rules.
  switch (first.kind) {
    case "skip":
      state.log.push("First card is Skip — first player skipped.");
      state.turn = advance(state.turn, 1);
      break;
    case "reverse":
      state.turn = reverse(state.turn);
      // with 2 players reverse acts like skip; otherwise play simply proceeds the other way
      state.log.push("First card is Reverse — direction flipped.");
      break;
    case "draw2":
      state.pendingDraw = 2;
      state.pendingKind = "draw2";
      state.log.push("First card is Draw Two!");
      break;
    default:
      break;
  }
}

function playCard(s: UnoState, playerId: string, move: Move) {
  const hand = s.hands[playerId];
  const idx = hand.findIndex((c) => c.id === move.cardId);
  const card = hand.splice(idx, 1)[0];
  s.discard.push(card);
  s.drewThisTurn = false;

  // set color
  if (card.color === "wild") {
    s.currentColor = move.chosenColor as UnoColor;
  } else {
    s.currentColor = card.color as UnoColor;
  }
  s.log.push(`${name(s, playerId)} played ${describe(card, s.currentColor)}.`);

  // auto-clear uno flag if they now have >1 card again somehow; set if at 1
  if (hand.length === 1 && !s.saidUno[playerId]) {
    // they didn't declare — they remain at risk of a callUno
  }
  if (hand.length !== 1) s.saidUno[playerId] = false;

  // win check
  if (hand.length === 0) {
    s.finished = true;
    s.winnerId = playerId;
    s.log.push(`🏆 ${name(s, playerId)} wins!`);
    return;
  }

  // apply card effects + advance turn
  switch (card.kind) {
    case "skip":
      s.turn = advance(s.turn, 1); // skip the next player
      s.turn = advance(s.turn, 1);
      break;
    case "reverse":
      s.turn = reverse(s.turn);
      if (s.turn.order.length === 2) s.turn = advance(s.turn, 1); // acts like skip in 2p... advance once more below
      s.turn = advance(s.turn, 1);
      break;
    case "draw2":
      s.pendingDraw += 2;
      s.pendingKind = "draw2";
      if (s.config.stacking) {
        s.turn = advance(s.turn, 1); // next player may stack or draw
      } else {
        s.turn = advance(s.turn, 1);
        resolvePending(s); // next player draws + is skipped
      }
      break;
    case "wild4":
      s.pendingDraw += 4;
      s.pendingKind = "draw4";
      if (s.config.stacking) {
        s.turn = advance(s.turn, 1);
      } else {
        s.turn = advance(s.turn, 1);
        resolvePending(s);
      }
      break;
    case "number":
    case "wild":
    default:
      s.turn = advance(s.turn, 1);
      break;
  }
}

// The player whose turn it now is must absorb the pending draw and lose the turn.
function resolvePending(s: UnoState) {
  const victim = activePlayer(s.turn);
  drawForPlayer(s, victim, s.pendingDraw);
  s.log.push(`${name(s, victim)} drew ${s.pendingDraw} and was skipped.`);
  s.pendingDraw = 0;
  s.pendingKind = null;
  s.turn = advance(s.turn, 1);
}

function doDraw(s: UnoState, playerId: string) {
  if (s.pendingDraw > 0) {
    // drawing to absorb a stacked penalty (stacking mode)
    drawForPlayer(s, playerId, s.pendingDraw);
    s.log.push(`${name(s, playerId)} drew ${s.pendingDraw}.`);
    s.pendingDraw = 0;
    s.pendingKind = null;
    s.drewThisTurn = false;
    s.turn = advance(s.turn, 1);
    return;
  }
  drawForPlayer(s, playerId, 1);
  const drawn = s.hands[playerId][s.hands[playerId].length - 1];
  if (drawn && canPlayCard(s, drawn)) {
    // Drew something playable — let them decide to play it or pass.
    s.drewThisTurn = true;
    s.log.push(`${name(s, playerId)} drew a card.`);
  } else {
    // Drew a dead card — auto-end the turn so nobody has to hunt for a Pass button.
    s.drewThisTurn = false;
    s.log.push(`${name(s, playerId)} drew and passed.`);
    s.turn = advance(s.turn, 1);
  }
}

function validateCallUno(state: UnoState, move: Move): ValidateResult {
  const target = move.targetId as string;
  if (!target || !(target in state.hands)) return { ok: false, error: "No such player." };
  if (state.hands[target].length !== 1) return { ok: false, error: "That player isn't at one card." };
  if (state.saidUno[target]) return { ok: false, error: "They already called Uno." };
  return { ok: true };
}

function callUno(s: UnoState, targetId: string) {
  drawForPlayer(s, targetId, 2);
  s.saidUno[targetId] = false;
  s.log.push(`${name(s, targetId)} forgot to say UNO — draws 2! 😈`);
}

function describe(card: UnoCard, color: UnoColor): string {
  const label =
    card.kind === "number"
      ? String(card.value)
      : card.kind === "draw2"
        ? "Draw Two"
        : card.kind === "wild4"
          ? "Wild Draw Four"
          : card.kind === "wild"
            ? "Wild"
            : card.kind.charAt(0).toUpperCase() + card.kind.slice(1);
  const c = card.color === "wild" ? color : card.color;
  return `${c} ${label}`;
}
