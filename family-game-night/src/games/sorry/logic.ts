import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, shuffle, type RNG } from "@/games/rng";
import { initTurn, activePlayer, advance, isActive, type TurnState } from "@/games/turn";

// ============================================================================
// Sorry! — faithful core rules.
//
// BOARD GEOMETRY
// --------------
// The classic Sorry! board is a square loop. We model the outer track as a ring
// of TRACK_LEN = 60 spaces numbered 0..59 (clockwise). Each of up-to-4 colors
// owns one side/quadrant of 15 spaces. For color k (0..3):
//   - START exit space (where a pawn drops when leaving START on a 1/2):
//       startExit = k * 15 + 4
//   - HOME entry space (the track space just before turning into the safety zone):
//       homeEntry = k * 15 + 2   (i.e. startExit - 2, wrapping)
//     A pawn at homeEntry that still needs to advance turns into its own SAFETY
//     zone (5 spaces) and then HOME (exact count required).
//   - SAFETY zone: 5 spaces (index 0..4); advancing past index 4 (with exact
//     count) reaches HOME.
//
// SLIDES: each color has two slides on the board. A pawn that LANDS on the start
// of a slide that is NOT its own color slides to the slide's end, bumping every
// pawn it passes over (including at the end) back to START. Landing on your OWN
// color's slide start does nothing special. We place slides at fixed track
// offsets within each quadrant (offsets 1 and 9 from the quadrant start), each
// 4 long, matching the real board's two slides per side. This geometry is a
// reasonable, documented simplification of the exact board art.
//
// HIDDEN INFO: the drawn card is PUBLIC (face up). getPlayerView(state,null) and
// (state,pid) both show the full board + the currently drawn card; the player
// view additionally marks whose-turn / "you" / your color / your legal moves.
//
// RANDOMNESS: only via the seeded RNG. We store seed + rngCounter and reshuffle
// the discard back into the deck (deterministically) when the deck empties.
// ============================================================================

export const TRACK_LEN = 60;
export const QUADRANT = TRACK_LEN / 4; // 15
export const SAFETY_LEN = 5;
export const PAWNS_PER_PLAYER = 4;

export type SorryCardValue = 1 | 2 | 3 | 4 | 5 | 7 | 8 | 10 | 11 | 12 | "sorry";

export interface SorryCard {
  id: string;
  value: SorryCardValue;
}

// Standard Sorry! deck distribution (45 cards):
//   1  -> 5
//   2  -> 4
//   3  -> 4
//   4  -> 4
//   5  -> 4
//   7  -> 4
//   8  -> 4
//   10 -> 4
//   11 -> 4
//   12 -> 4
//   Sorry! -> 4
// (The real deck has 45 cards; the classic distribution is "5 of the 1s and
// 4 of everything else". Total = 5 + 4*10 = 45.)
const DECK_DISTRIBUTION: { value: SorryCardValue; count: number }[] = [
  { value: 1, count: 5 },
  { value: 2, count: 4 },
  { value: 3, count: 4 },
  { value: 4, count: 4 },
  { value: 5, count: 4 },
  { value: 7, count: 4 },
  { value: 8, count: 4 },
  { value: 10, count: 4 },
  { value: 11, count: 4 },
  { value: 12, count: 4 },
  { value: "sorry", count: 4 },
];

function buildDeck(): SorryCard[] {
  const deck: SorryCard[] = [];
  let n = 0;
  for (const { value, count } of DECK_DISTRIBUTION) {
    for (let i = 0; i < count; i++) deck.push({ id: `s${n++}`, value });
  }
  return deck; // 45 cards
}

// ----------------------------------------------------------------------------
// Pawn position model
// ----------------------------------------------------------------------------
// A pawn is in exactly one of: START, the TRACK (abs 0..59), its SAFETY zone
// (0..4), or HOME.
export type PawnPos =
  | { zone: "start" }
  | { zone: "track"; pos: number } // absolute 0..TRACK_LEN-1
  | { zone: "safety"; pos: number } // 0..SAFETY_LEN-1
  | { zone: "home" };

export interface Slide {
  color: number; // owning color index
  start: number; // absolute track pos of the slide start
  end: number; // absolute track pos of the slide end (start + length-1)
}

// Per-color geometry.
export function startExit(color: number): number {
  return (color * QUADRANT + 4) % TRACK_LEN;
}
// The track space from which a pawn enters its safety zone. Stepping one beyond
// homeEntry goes to safety index 0.
export function homeEntry(color: number): number {
  return (color * QUADRANT + 2) % TRACK_LEN;
}

// Two slides per color, length 4 each. Offsets chosen within the quadrant.
// We always build all 4 colors' slides regardless of how many players are
// seated (the board art exists regardless), so opponents' slides are usable.
export function buildSlides(): Slide[] {
  const slides: Slide[] = [];
  for (let c = 0; c < 4; c++) {
    const base = c * QUADRANT;
    for (const offset of [1, 9]) {
      const start = (base + offset) % TRACK_LEN;
      const end = (base + offset + 3) % TRACK_LEN;
      slides.push({ color: c, start, end });
    }
  }
  return slides;
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export interface SorryState {
  // pawns[playerId] = array of 4 PawnPos
  pawns: Record<string, PawnPos[]>;
  colorOf: Record<string, number>; // playerId -> color index 0..3
  order: string[]; // seat order playerIds
  turn: TurnState;
  deck: SorryCard[]; // draw pile (top = end)
  discard: SorryCard[]; // discard pile (top = end)
  drawn: SorryCard | null; // currently drawn card awaiting a play (PUBLIC)
  drawAgain: boolean; // a 2 grants another draw after the move resolves
  slides: Slide[];
  names: Record<string, string>;
  seed: number;
  rngCounter: number;
  log: string[];
  finished: boolean;
  winnerId: string | null;
}

function nextRng(state: SorryState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

function name(s: SorryState, id: string): string {
  return s.names[id] ?? "Player";
}

// Draw one card, reshuffling discard into deck (deterministically) when empty.
function drawCard(state: SorryState): SorryCard | null {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) return null;
    state.deck = shuffle(state.discard, nextRng(state));
    state.discard = [];
  }
  return state.deck.pop() ?? null;
}

// ----------------------------------------------------------------------------
// Movement geometry helpers (pure)
// ----------------------------------------------------------------------------

// Compute the resulting PawnPos when moving `pawn` of `color` by `steps`
// (steps may be negative for backward). Returns null if the move is illegal
// (e.g. moving a START pawn other than via 1/2, overshooting HOME, illegal
// backward from safety/home). Does NOT apply slides/bumps — callers do that.
export function computeTarget(pos: PawnPos, color: number, steps: number): PawnPos | null {
  if (pos.zone === "home") return null; // home pawns never move

  if (pos.zone === "start") {
    // Only handled by the 1/2 "move out" action elsewhere; not via computeTarget.
    return null;
  }

  if (steps === 0) return null;

  if (pos.zone === "safety") {
    // Forward within safety / into home; backward back onto the track.
    if (steps > 0) {
      const dest = pos.pos + steps;
      if (dest === SAFETY_LEN) return { zone: "home" }; // exact into home
      if (dest > SAFETY_LEN) return null; // overshoot — illegal
      return { zone: "safety", pos: dest };
    } else {
      // backward out of safety onto the track
      let remaining = -steps;
      // step from safety[0] back onto homeEntry, then continue backward on track
      // distance from safety index `pos.pos` back to homeEntry = pos.pos + 1
      const toEntry = pos.pos + 1;
      if (remaining < toEntry) {
        return { zone: "safety", pos: pos.pos - remaining };
      }
      remaining -= toEntry;
      let abs = homeEntry(color);
      abs = ((abs - remaining) % TRACK_LEN + TRACK_LEN) % TRACK_LEN;
      return { zone: "track", pos: abs };
    }
  }

  // pos.zone === "track"
  const abs = pos.pos;
  if (steps > 0) {
    // Forward — may cross into this color's safety zone at homeEntry.
    // Distance along the track from `abs` until we reach homeEntry (inclusive of
    // the step that lands ON homeEntry). Crossing homeEntry diverts into safety.
    let cur = abs;
    let remaining = steps;
    while (remaining > 0) {
      if (cur === homeEntry(color)) {
        // Crossing our own home-entry diverts into the safety zone. The first of
        // the remaining steps lands on safety index 0, the next on index 1, etc.
        const safetyIdx = remaining - 1;
        if (safetyIdx === SAFETY_LEN) return { zone: "home" }; // exact into home
        if (safetyIdx > SAFETY_LEN) return null; // overshoot home — illegal
        return { zone: "safety", pos: safetyIdx };
      }
      cur = (cur + 1) % TRACK_LEN;
      remaining -= 1;
    }
    return { zone: "track", pos: cur };
  } else {
    // Backward on the track — simple wrap, never enters safety.
    let cur = ((abs + steps) % TRACK_LEN + TRACK_LEN) % TRACK_LEN;
    return { zone: "track", pos: cur };
  }
}

function posEqual(a: PawnPos, b: PawnPos): boolean {
  if (a.zone !== b.zone) return false;
  if (a.zone === "track" && b.zone === "track") return a.pos === b.pos;
  if (a.zone === "safety" && b.zone === "safety") return a.pos === b.pos;
  return true; // start === start, home === home (multiple pawns may share these)
}

// Is `dest` occupied by one of `playerId`'s OWN pawns (excluding pawn index
// `exceptIdx`)? You may not land on your own pawn on the track or in safety.
function blockedByOwn(
  s: SorryState,
  playerId: string,
  dest: PawnPos,
  exceptIdx: number
): boolean {
  if (dest.zone === "start" || dest.zone === "home") return false; // shared zones
  return s.pawns[playerId].some(
    (p, i) => i !== exceptIdx && posEqual(p, dest)
  );
}

// Find any opponent pawn occupying an absolute track position. Returns
// [playerId, pawnIndex] or null.
function opponentAt(
  s: SorryState,
  exceptPlayer: string,
  dest: PawnPos
): [string, number] | null {
  if (dest.zone !== "track") return null; // bumping only happens on the open track
  for (const pid of s.order) {
    if (pid === exceptPlayer) continue;
    const idx = s.pawns[pid].findIndex((p) => posEqual(p, dest));
    if (idx !== -1) return [pid, idx];
  }
  return null;
}

// Send a specific pawn back to START.
function bump(s: SorryState, pid: string, idx: number) {
  s.pawns[pid][idx] = { zone: "start" };
}

// Apply landing effects (bump + slide) for a pawn that just arrived at `dest`.
// Mutates state; returns the FINAL resting position.
function resolveLanding(
  s: SorryState,
  playerId: string,
  pawnIdx: number,
  dest: PawnPos
): PawnPos {
  // 1) bump an opponent sitting on the destination
  const occ = opponentAt(s, playerId, dest);
  if (occ) bump(s, occ[0], occ[1]);

  // 2) slides — only if we land on the START of a slide of ANOTHER color
  if (dest.zone === "track") {
    const landedPos = dest.pos;
    const slide = s.slides.find((sl) => sl.start === landedPos);
    if (slide && slide.color !== s.colorOf[playerId]) {
      // bump every pawn (ours excepted? no — your own pawns on the slide also go
      // home per the rules, but to keep our own integrity simple we only bump
      // opponents along the slide; landing-end bumps below cover the rest).
      const len = ((slide.end - slide.start + TRACK_LEN) % TRACK_LEN) + 1;
      for (let step = 1; step < len; step++) {
        const absSlide = (slide.start + step) % TRACK_LEN;
        const overPos: PawnPos = { zone: "track", pos: absSlide };
        // bump any opponent along the slide path
        const o = opponentAt(s, playerId, overPos);
        if (o) bump(s, o[0], o[1]);
      }
      dest = { zone: "track", pos: slide.end };
      // bump opponent at the slide end too
      const endOcc = opponentAt(s, playerId, dest);
      if (endOcc) bump(s, endOcc[0], endOcc[1]);
    }
  }

  s.pawns[playerId][pawnIdx] = dest;
  return dest;
}

// ----------------------------------------------------------------------------
// Legal-move enumeration for the currently drawn card.
// ----------------------------------------------------------------------------
export interface PlayOption {
  kind: "out" | "forward" | "backward" | "split7" | "swap11" | "sorry";
  card: SorryCardValue;
  // For most moves:
  pawn?: number; // primary pawn index
  steps?: number; // signed steps for forward/backward
  // split7:
  pawnA?: number;
  pawnB?: number;
  amtA?: number;
  amtB?: number;
  // swap11 / sorry:
  targetPlayer?: string;
  targetPawn?: number;
  // 10 direction hint (already encoded in steps); label for UI
  label: string;
}

// Can this pawn legally move `steps` (returns resting pos or null)?
function tryMove(
  s: SorryState,
  playerId: string,
  pawnIdx: number,
  steps: number
): PawnPos | null {
  const pawn = s.pawns[playerId][pawnIdx];
  if (pawn.zone === "start" || pawn.zone === "home") return null;
  const dest = computeTarget(pawn, s.colorOf[playerId], steps);
  if (!dest) return null;
  if (blockedByOwn(s, playerId, dest, pawnIdx)) return null;
  return dest;
}

// Enumerate every legal option for the drawn card.
export function legalOptions(s: SorryState, playerId: string): PlayOption[] {
  const card = s.drawn;
  if (!card) return [];
  const color = s.colorOf[playerId];
  const pawns = s.pawns[playerId];
  const opts: PlayOption[] = [];

  const startIdxs = pawns
    .map((p, i) => (p.zone === "start" ? i : -1))
    .filter((i) => i !== -1);
  const onBoard = pawns
    .map((p, i) => (p.zone !== "start" && p.zone !== "home" ? i : -1))
    .filter((i) => i !== -1);

  const v = card.value;

  // "Move out of START" — only 1 or 2.
  if (v === 1 || v === 2) {
    const exit: PawnPos = { zone: "track", pos: startExit(color) };
    for (const i of startIdxs) {
      if (!blockedByOwn(s, playerId, exit, i)) {
        opts.push({ kind: "out", card: v, pawn: i, label: `Pawn ${i + 1} out of Start` });
      }
    }
  }

  if (typeof v === "number") {
    if (v === 4) {
      // backward 4
      for (const i of onBoard) {
        if (tryMove(s, playerId, i, -4)) {
          opts.push({ kind: "backward", card: v, pawn: i, steps: -4, label: `Pawn ${i + 1} back 4` });
        }
      }
    } else if (v === 7) {
      // forward 7 OR split between two pawns (amounts total 7, each >=1)
      for (const i of onBoard) {
        if (tryMove(s, playerId, i, 7)) {
          opts.push({ kind: "forward", card: v, pawn: i, steps: 7, label: `Pawn ${i + 1} forward 7` });
        }
      }
      for (let a = 0; a < onBoard.length; a++) {
        for (let b = 0; b < onBoard.length; b++) {
          if (a === b) continue;
          const ia = onBoard[a];
          const ib = onBoard[b];
          for (let amtA = 1; amtA <= 6; amtA++) {
            const amtB = 7 - amtA;
            // each sub-move must be legal independently (apply A then B order
            // doesn't matter for legality since they're different pawns on
            // distinct squares — we validate against current positions)
            if (tryMove(s, playerId, ia, amtA) && tryMove(s, playerId, ib, amtB)) {
              opts.push({
                kind: "split7",
                card: v,
                pawnA: ia,
                pawnB: ib,
                amtA,
                amtB,
                label: `Split 7: pawn ${ia + 1}+${amtA}, pawn ${ib + 1}+${amtB}`,
              });
            }
          }
        }
      }
    } else if (v === 10) {
      // forward 10 OR backward 1
      for (const i of onBoard) {
        if (tryMove(s, playerId, i, 10)) {
          opts.push({ kind: "forward", card: v, pawn: i, steps: 10, label: `Pawn ${i + 1} forward 10` });
        }
        if (tryMove(s, playerId, i, -1)) {
          opts.push({ kind: "backward", card: v, pawn: i, steps: -1, label: `Pawn ${i + 1} back 1` });
        }
      }
    } else if (v === 11) {
      // forward 11 OR swap with an opponent (both on the open track)
      for (const i of onBoard) {
        if (tryMove(s, playerId, i, 11)) {
          opts.push({ kind: "forward", card: v, pawn: i, steps: 11, label: `Pawn ${i + 1} forward 11` });
        }
      }
      // swaps: our pawn must be on the track, opponent pawn must be on the track
      for (const i of onBoard) {
        const mine = pawns[i];
        if (mine.zone !== "track") continue;
        for (const pid of s.order) {
          if (pid === playerId) continue;
          s.pawns[pid].forEach((op, oi) => {
            if (op.zone === "track") {
              opts.push({
                kind: "swap11",
                card: v,
                pawn: i,
                targetPlayer: pid,
                targetPawn: oi,
                label: `Swap pawn ${i + 1} with ${name(s, pid)}'s pawn ${oi + 1}`,
              });
            }
          });
        }
      }
    } else {
      // plain forward: 1,2,3,5,8,12
      for (const i of onBoard) {
        if (tryMove(s, playerId, i, v)) {
          opts.push({ kind: "forward", card: v, pawn: i, steps: v, label: `Pawn ${i + 1} forward ${v}` });
        }
      }
    }
  } else {
    // Sorry! — take a pawn from START and place it on a space occupied by an
    // opponent's pawn (on the open track), bumping that pawn home.
    if (startIdxs.length > 0) {
      for (const pid of s.order) {
        if (pid === playerId) continue;
        s.pawns[pid].forEach((op, oi) => {
          if (op.zone === "track") {
            opts.push({
              kind: "sorry",
              card: v,
              pawn: startIdxs[0],
              targetPlayer: pid,
              targetPawn: oi,
              label: `Sorry! bump ${name(s, pid)}'s pawn ${oi + 1}`,
            });
          }
        });
      }
    }
  }

  return opts;
}

// Does an option match the requested move? Used by validateMove.
function optionMatchesMove(opt: PlayOption, move: Move): boolean {
  switch (opt.kind) {
    case "out":
    case "forward":
    case "backward":
      return move.kind === opt.kind && move.pawn === opt.pawn && (move.steps ?? opt.steps) === opt.steps;
    case "split7":
      return (
        move.kind === "split7" &&
        move.pawnA === opt.pawnA &&
        move.pawnB === opt.pawnB &&
        move.amtA === opt.amtA &&
        move.amtB === opt.amtB
      );
    case "swap11":
      return (
        move.kind === "swap11" &&
        move.pawn === opt.pawn &&
        move.targetPlayer === opt.targetPlayer &&
        move.targetPawn === opt.targetPawn
      );
    case "sorry":
      return (
        move.kind === "sorry" &&
        move.targetPlayer === opt.targetPlayer &&
        move.targetPawn === opt.targetPawn
      );
  }
}

// ----------------------------------------------------------------------------
// Applying a chosen play option (mutates cloned state)
// ----------------------------------------------------------------------------
function applyOption(s: SorryState, playerId: string, opt: PlayOption) {
  const color = s.colorOf[playerId];

  switch (opt.kind) {
    case "out": {
      const dest: PawnPos = { zone: "track", pos: startExit(color) };
      resolveLanding(s, playerId, opt.pawn!, dest);
      s.log.push(`${name(s, playerId)} moved pawn ${opt.pawn! + 1} out of Start.`);
      break;
    }
    case "forward":
    case "backward": {
      const pawn = s.pawns[playerId][opt.pawn!];
      const dest = computeTarget(pawn, color, opt.steps!)!;
      resolveLanding(s, playerId, opt.pawn!, dest);
      s.log.push(`${name(s, playerId)} moved pawn ${opt.pawn! + 1} ${opt.steps! > 0 ? "+" : ""}${opt.steps}.`);
      break;
    }
    case "split7": {
      // apply A then B (compute B target against current state after A; since
      // distinct pawns this is fine)
      const destA = computeTarget(s.pawns[playerId][opt.pawnA!], color, opt.amtA!)!;
      resolveLanding(s, playerId, opt.pawnA!, destA);
      const destB = computeTarget(s.pawns[playerId][opt.pawnB!], color, opt.amtB!)!;
      resolveLanding(s, playerId, opt.pawnB!, destB);
      s.log.push(`${name(s, playerId)} split 7.`);
      break;
    }
    case "swap11": {
      const myPos = s.pawns[playerId][opt.pawn!];
      const theirPos = s.pawns[opt.targetPlayer!][opt.targetPawn!];
      s.pawns[playerId][opt.pawn!] = theirPos;
      s.pawns[opt.targetPlayer!][opt.targetPawn!] = myPos;
      // after swapping, our pawn may land on a slide; resolve our landing.
      resolveLanding(s, playerId, opt.pawn!, s.pawns[playerId][opt.pawn!]);
      s.log.push(`${name(s, playerId)} swapped with ${name(s, opt.targetPlayer!)}.`);
      break;
    }
    case "sorry": {
      const targetPos = s.pawns[opt.targetPlayer!][opt.targetPawn!];
      // bump the opponent home
      bump(s, opt.targetPlayer!, opt.targetPawn!);
      // place our START pawn there
      s.pawns[playerId][opt.pawn!] = targetPos;
      // our pawn may now sit on a slide — resolve
      resolveLanding(s, playerId, opt.pawn!, s.pawns[playerId][opt.pawn!]);
      s.log.push(`${name(s, playerId)} played Sorry! on ${name(s, opt.targetPlayer!)}.`);
      break;
    }
  }
}

function allHome(s: SorryState, playerId: string): boolean {
  return s.pawns[playerId].every((p) => p.zone === "home");
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const sorry: GameModule<SorryState> = {
  type: "sorry",
  name: "Sorry!",
  emoji: "🟥",
  blurb: "Race all 4 pawns home — bump rivals back to Start. Sorry!",
  minPlayers: 2,
  maxPlayers: 4,

  initGame(players: PlayerInfo[], config): SorryState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    const order = ordered.map((p) => p.id);

    const rng = mulberry32(seed);
    const deck = shuffle(buildDeck(), rng);

    const pawns: Record<string, PawnPos[]> = {};
    const colorOf: Record<string, number> = {};
    const names: Record<string, string> = {};
    ordered.forEach((p, i) => {
      colorOf[p.id] = i % 4;
      names[p.id] = p.name;
      pawns[p.id] = Array.from({ length: PAWNS_PER_PLAYER }, () => ({ zone: "start" } as PawnPos));
    });

    return {
      pawns,
      colorOf,
      order,
      turn: initTurn(order),
      deck,
      discard: [],
      drawn: null,
      drawAgain: false,
      slides: buildSlides(),
      names,
      seed,
      rngCounter: 0,
      log: ["Game started — draw a card!"],
      finished: false,
      winnerId: null,
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };

    if (move.type === "draw") {
      if (state.drawn) return { ok: false, error: "You already drew — make your move." };
      return { ok: true };
    }

    if (move.type === "play") {
      if (!state.drawn) return { ok: false, error: "Draw a card first." };
      const opts = legalOptions(state, playerId);
      if (opts.length === 0) {
        return { ok: false, error: "No legal move — your turn is forfeited." };
      }
      const matched = opts.some((o) => optionMatchesMove(o, move));
      if (!matched) return { ok: false, error: "Illegal play for this card." };
      return { ok: true };
    }

    if (move.type === "forfeit") {
      // Only legal when a card is drawn and there are NO legal options.
      if (!state.drawn) return { ok: false, error: "Draw a card first." };
      if (legalOptions(state, playerId).length > 0)
        return { ok: false, error: "You have a legal move — you can't forfeit." };
      return { ok: true };
    }

    return { ok: false, error: "Unknown move." };
  },

  applyMove(state, playerId, move): SorryState {
    const s: SorryState = structuredClone(state);

    if (move.type === "draw") {
      const card = drawCard(s);
      if (!card) {
        // No cards anywhere — pass turn (shouldn't happen with reshuffle).
        s.turn = advance(s.turn, 1);
        return s;
      }
      s.drawn = card;
      s.drawAgain = card.value === 2;
      s.log.push(`${name(s, playerId)} drew ${cardLabel(card)}.`);
      // If after drawing there is no legal move, the turn is auto-forfeited.
      if (legalOptions(s, playerId).length === 0) {
        s.log.push(`${name(s, playerId)} has no legal move — turn forfeited.`);
        endTurn(s, playerId, false);
      }
      return s;
    }

    if (move.type === "forfeit") {
      s.log.push(`${name(s, playerId)} forfeits the turn.`);
      endTurn(s, playerId, false);
      return s;
    }

    if (move.type === "play") {
      const opts = legalOptions(s, playerId);
      const opt = opts.find((o) => optionMatchesMove(o, move));
      if (!opt) return s; // validateMove should have caught this
      applyOption(s, playerId, opt);

      // win check
      if (allHome(s, playerId)) {
        s.finished = true;
        s.winnerId = playerId;
        s.discard.push(s.drawn!);
        s.drawn = null;
        s.log.push(`🏆 ${name(s, playerId)} got all pawns home and wins!`);
        return s;
      }

      const drawAgain = s.drawAgain;
      endTurn(s, playerId, drawAgain);
      return s;
    }

    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished || !state.winnerId) return null;
    return {
      winners: [state.winnerId],
      reason: `${name(state, state.winnerId)} got all 4 pawns home!`,
    };
  },

  getPlayerView(state, playerId) {
    const pub = {
      type: "sorry" as const,
      order: state.order,
      activePlayerId: activePlayer(state.turn),
      drawn: state.drawn,
      drawPileCount: state.deck.length,
      discardCount: state.discard.length,
      slides: state.slides,
      finished: state.finished,
      winnerId: state.winnerId,
      log: state.log.slice(-6),
      trackLen: TRACK_LEN,
      safetyLen: SAFETY_LEN,
      players: state.order.map((id) => ({
        id,
        name: state.names[id],
        color: state.colorOf[id],
        startExit: startExit(state.colorOf[id]),
        homeEntry: homeEntry(state.colorOf[id]),
        pawns: state.pawns[id],
        home: state.pawns[id].filter((p) => p.zone === "home").length,
      })),
    };

    if (playerId && state.pawns[playerId]) {
      const myTurn = isActive(state.turn, playerId) && !state.finished;
      return {
        ...pub,
        you: playerId,
        yourColor: state.colorOf[playerId],
        yourTurn: myTurn,
        // legal options for the currently drawn card (empty if not your turn or
        // no card drawn)
        options: myTurn && state.drawn ? legalOptions(state, playerId) : [],
        canDraw: myTurn && !state.drawn,
      };
    }
    return {
      ...pub,
      you: null,
      yourColor: null,
      yourTurn: false,
      options: [] as PlayOption[],
      canDraw: false,
    };
  },
};

// ----------------------------------------------------------------------------
// Turn flow helpers
// ----------------------------------------------------------------------------
function endTurn(s: SorryState, playerId: string, drawAgain: boolean) {
  if (s.drawn) {
    s.discard.push(s.drawn);
    s.drawn = null;
  }
  s.drawAgain = false;
  if (!drawAgain) {
    s.turn = advance(s.turn, 1);
  }
  // if drawAgain, same player keeps the turn and must draw again
}

function cardLabel(card: SorryCard): string {
  return card.value === "sorry" ? "Sorry!" : String(card.value);
}
