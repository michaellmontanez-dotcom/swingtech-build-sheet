import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, rollDie, type RNG } from "@/games/rng";
import { initTurn, isActive, activePlayer, advance, type TurnState } from "@/games/turn";

// ============================================================================
// Trouble — pop-o-matic peg race.
//
// Board geometry:
//   - A shared main track of TRACK = 28 spaces (a loop, indices 0..27).
//   - Up to 4 players, each with a distinct START entry space evenly spaced
//     around the loop (player seat k starts at k * (TRACK / maxSeats)).
//   - Each peg has a "relative" position measured from its own START:
//       rel === -1            -> peg is in HOME (off the board)
//       0 <= rel <= 27        -> peg is on the main track
//       28 <= rel <= 31       -> peg is in this player's FINISH lane (slot rel-28)
//     A finished/safe peg sits in FINISH (rel 28..31). rel === FINISH_END (31)
//     is the last finish slot.
//
//   absolute track space = (start + rel) % TRACK   (only meaningful for rel 0..27)
//
// The full loop is exactly TRACK steps: a peg entering the board at rel 0 reaches
// rel 27 (one space before its own start again) and then steps into FINISH.
// ============================================================================

export const TRACK = 28;
const MAX_SEATS = 4;
const PEGS_PER_PLAYER = 4;
const HOME = -1;
const FINISH_START = TRACK; // rel 28 == first finish slot
const FINISH_END = TRACK + PEGS_PER_PLAYER - 1; // rel 31 == last finish slot

export interface Peg {
  rel: number; // -1 home, 0..27 track, 28..31 finish
}

export interface TroublePlayer {
  id: string;
  name: string;
  start: number; // absolute track index of this player's START space
  pegs: Peg[]; // 4 pegs
}

export type Phase = "roll" | "move";

export interface TroubleState {
  turn: TurnState;
  players: Record<string, TroublePlayer>;
  phase: Phase; // "roll" = awaiting a die roll, "move" = awaiting a peg move
  lastRoll: number | null; // result of the most recent roll (this turn)
  movablePegs: number[]; // peg indices the active player may legally move now
  seed: number;
  rngCounter: number;
  log: string[];
  finished: boolean;
  winnerId: string | null;
}

// ----------------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------------

// Map a player's relative peg position to an absolute main-track space.
// Returns null when the peg is in HOME or FINISH (not on the shared track).
export function relToAbsolute(start: number, rel: number): number | null {
  if (rel < 0 || rel >= TRACK) return null;
  return (start + rel) % TRACK;
}

function nextRng(state: TroubleState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

function name(s: TroubleState, id: string): string {
  return s.players[id]?.name ?? "Player";
}

// Where would peg `i` of `player` land with roll `roll`? Returns the target rel,
// or null if the move is illegal (no 6 to leave home, overshoots finish, etc.).
function targetRel(player: TroublePlayer, pegIndex: number, roll: number): number | null {
  const peg = player.pegs[pegIndex];
  if (peg.rel === HOME) {
    // Must roll a 6 to leave home; lands on START (rel 0).
    return roll === 6 ? 0 : null;
  }
  const dest = peg.rel + roll;
  if (dest > FINISH_END) return null; // overshoots the finish lane — exact count required
  return dest;
}

// Is moving peg `i` legal for `player` given `roll`, considering self-blocking?
function isLegalMove(state: TroubleState, player: TroublePlayer, pegIndex: number, roll: number): boolean {
  const dest = targetRel(player, pegIndex, roll);
  if (dest === null) return false;

  // Cannot land on your OWN peg.
  if (dest <= FINISH_END) {
    for (let j = 0; j < player.pegs.length; j++) {
      if (j === pegIndex) continue;
      if (player.pegs[j].rel === dest) {
        // Two pegs in HOME share rel -1 but that's not a landing space; only
        // block when dest is an actual occupied square (track or finish slot).
        if (dest >= 0) return false;
      }
    }
  }
  return true;
}

function computeMovable(state: TroubleState, playerId: string, roll: number): number[] {
  const player = state.players[playerId];
  const out: number[] = [];
  for (let i = 0; i < player.pegs.length; i++) {
    if (isLegalMove(state, player, i, roll)) out.push(i);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const trouble: GameModule<TroubleState> = {
  type: "trouble",
  name: "Trouble",
  emoji: "🎲",
  blurb: "Pop the die, race your 4 pegs home — and bump rivals back to start!",
  minPlayers: 2,
  maxPlayers: 4,

  initGame(players: PlayerInfo[], config): TroubleState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    const spacing = TRACK / MAX_SEATS; // 7 spaces between starts

    const playerMap: Record<string, TroublePlayer> = {};
    ordered.forEach((p, seatIdx) => {
      playerMap[p.id] = {
        id: p.id,
        name: p.name,
        start: (seatIdx * spacing) % TRACK,
        pegs: Array.from({ length: PEGS_PER_PLAYER }, () => ({ rel: HOME })),
      };
    });

    return {
      turn: initTurn(ordered.map((p) => p.id)),
      players: playerMap,
      phase: "roll",
      lastRoll: null,
      movablePegs: [],
      seed,
      rngCounter: 0,
      log: ["Game started — pop the die!"],
      finished: false,
      winnerId: null,
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };

    switch (move.type) {
      case "roll": {
        if (state.phase !== "roll") return { ok: false, error: "Already rolled — move a peg." };
        return { ok: true };
      }
      case "move": {
        if (state.phase !== "move") return { ok: false, error: "Roll the die first." };
        const peg = move.peg;
        if (typeof peg !== "number" || peg < 0 || peg >= PEGS_PER_PLAYER) {
          return { ok: false, error: "Invalid peg." };
        }
        if (!state.movablePegs.includes(peg)) return { ok: false, error: "That peg can't move." };
        return { ok: true };
      }
      case "pass": {
        // Only legal when a roll produced no legal move.
        if (state.phase !== "move") return { ok: false, error: "Roll the die first." };
        if (state.movablePegs.length > 0) return { ok: false, error: "You have a legal move." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): TroubleState {
    const s: TroubleState = structuredClone(state);
    switch (move.type) {
      case "roll":
        doRoll(s, playerId);
        break;
      case "move":
        doMove(s, playerId, move.peg as number);
        break;
      case "pass":
        s.log.push(`${name(s, playerId)} had no move and passed.`);
        endTurn(s, false);
        break;
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished || !state.winnerId) return null;
    return {
      winners: [state.winnerId],
      reason: `${name(state, state.winnerId)} got all four pegs home!`,
    };
  },

  getPlayerView(state, playerId) {
    const pub = {
      type: "trouble" as const,
      track: TRACK,
      finishSlots: PEGS_PER_PLAYER,
      activePlayerId: activePlayer(state.turn),
      phase: state.phase,
      lastRoll: state.lastRoll,
      finished: state.finished,
      winnerId: state.winnerId,
      log: state.log.slice(-6),
      players: state.turn.order.map((id) => {
        const p = state.players[id];
        return {
          id,
          name: p.name,
          start: p.start,
          // each peg with its relative pos + absolute track square (null if home/finish)
          pegs: p.pegs.map((peg) => ({
            rel: peg.rel,
            abs: relToAbsolute(p.start, peg.rel),
            home: peg.rel === HOME,
            finished: peg.rel >= FINISH_START,
            finishSlot: peg.rel >= FINISH_START ? peg.rel - FINISH_START : null,
          })),
          homeCount: p.pegs.filter((pg) => pg.rel === HOME).length,
          finishedCount: p.pegs.filter((pg) => pg.rel >= FINISH_START).length,
        };
      }),
    };

    if (playerId && state.players[playerId]) {
      const isYou = isActive(state.turn, playerId);
      return {
        ...pub,
        you: playerId,
        yourTurn: isYou && !state.finished,
        // which of YOUR pegs you may move right now (only in the move phase)
        movablePegs: isYou && state.phase === "move" ? [...state.movablePegs] : [],
        canRoll: isYou && state.phase === "roll" && !state.finished,
        canPass: isYou && state.phase === "move" && state.movablePegs.length === 0,
      };
    }
    return { ...pub, you: null, yourTurn: false, movablePegs: [] as number[], canRoll: false, canPass: false };
  },
};

// ----------------------------------------------------------------------------
// Transition helpers (mutate a cloned state)
// ----------------------------------------------------------------------------

function doRoll(s: TroubleState, playerId: string) {
  const roll = rollDie(nextRng(s));
  s.lastRoll = roll;
  s.movablePegs = computeMovable(s, playerId, roll);
  s.log.push(`${name(s, playerId)} rolled a ${roll}.`);

  if (s.movablePegs.length === 0) {
    // No legal move. A 6 still does NOT grant another roll if you can't use it
    // here — the turn passes (the player must submit a "pass", or a client may
    // auto-pass). We keep the explicit pass: stay in "move" phase with no pegs.
    s.phase = "move";
    s.log.push(`${name(s, playerId)} has no legal move.`);
    return;
  }
  s.phase = "move";
}

function doMove(s: TroubleState, playerId: string, pegIndex: number) {
  const player = s.players[playerId];
  const roll = s.lastRoll!;
  const dest = targetRel(player, pegIndex, roll)!;
  const peg = player.pegs[pegIndex];
  const fromHome = peg.rel === HOME;

  // Capture: if this lands on the shared track and an opponent peg sits there,
  // send that opponent's peg back to its HOME.
  if (dest >= 0 && dest < TRACK) {
    const absLanding = relToAbsolute(player.start, dest)!;
    for (const oppId of s.turn.order) {
      if (oppId === playerId) continue;
      const opp = s.players[oppId];
      for (const opeg of opp.pegs) {
        const oabs = relToAbsolute(opp.start, opeg.rel);
        if (oabs === absLanding) {
          opeg.rel = HOME;
          s.log.push(`${name(s, playerId)} bumped ${name(s, oppId)}'s peg back home! 💥`);
        }
      }
    }
  }

  peg.rel = dest;
  if (fromHome) {
    s.log.push(`${name(s, playerId)} moved a peg out of home onto start.`);
  } else if (dest >= FINISH_START) {
    s.log.push(`${name(s, playerId)} advanced a peg into the finish lane. 🏁`);
  } else {
    s.log.push(`${name(s, playerId)} moved a peg ${roll}.`);
  }

  // Win check: all pegs in finish lane.
  if (player.pegs.every((pg) => pg.rel >= FINISH_START)) {
    s.finished = true;
    s.winnerId = playerId;
    s.log.push(`🏆 ${name(s, playerId)} wins!`);
    return;
  }

  endTurn(s, roll === 6);
}

// End the active player's turn. If `extraRoll` (rolled a 6) the SAME player rolls
// again; otherwise turn advances to the next player.
function endTurn(s: TroubleState, extraRoll: boolean) {
  if (extraRoll) {
    s.phase = "roll";
    s.movablePegs = [];
    // lastRoll left as-is for display; next roll overwrites it.
    return;
  }
  s.turn = advance(s.turn, 1);
  s.phase = "roll";
  s.movablePegs = [];
}
