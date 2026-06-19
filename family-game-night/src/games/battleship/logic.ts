import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { mulberry32, type RNG } from "@/games/rng";
import { initTurn, activePlayer, isActive, advance, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Constants — board + fleet
// ----------------------------------------------------------------------------
export const BOARD_SIZE = 10;

export interface ShipSpec {
  name: string;
  size: number;
}

// Standard fleet. Order matters for placement helpers / auto-place.
export const FLEET: ShipSpec[] = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

const FLEET_BY_NAME: Record<string, number> = Object.fromEntries(
  FLEET.map((s) => [s.name, s.size])
);

export type Cell = [number, number]; // [row, col]

// ----------------------------------------------------------------------------
// State (AUTHORITATIVE — contains every player's full ship layout. NEVER ship
// this whole object to a client; always go through getPlayerView.)
// ----------------------------------------------------------------------------
export interface Ship {
  name: string;
  cells: Cell[]; // SECRET until hit
  hits: boolean[]; // parallel to cells; true once that cell is hit
}

export interface Shot {
  r: number;
  c: number;
  hit: boolean;
}

export interface PlayerBoard {
  ships: Ship[]; // SECRET layout
  shots: Shot[]; // incoming shots fired AT this board (public)
  ready: boolean;
}

export type Phase = "placement" | "firing" | "finished";

export interface BattleshipState {
  phase: Phase;
  boards: Record<string, PlayerBoard>; // keyed by playerId (this player's OWN board)
  turn: TurnState;
  order: string[]; // playerIds in seat order (always length 2)
  names: Record<string, string>;
  seed: number;
  rngCounter: number;
  finished: boolean;
  winnerId: string | null;
  log: string[];
}

// ----------------------------------------------------------------------------
// RNG — derived deterministically from seed + a per-call counter.
// ----------------------------------------------------------------------------
function nextRng(state: BattleshipState): RNG {
  state.rngCounter += 1;
  return mulberry32(state.seed + state.rngCounter * 2654435761);
}

// ----------------------------------------------------------------------------
// Geometry / validation helpers
// ----------------------------------------------------------------------------
function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function isStraightLine(cells: Cell[]): boolean {
  if (cells.length < 1) return false;
  const sameRow = cells.every(([r]) => r === cells[0][0]);
  const sameCol = cells.every(([, c]) => c === cells[0][1]);
  if (!sameRow && !sameCol) return false;
  // must be contiguous with no gaps and no duplicates
  const sorted = [...cells].sort((a, b) => (sameRow ? a[1] - b[1] : a[0] - b[0]));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const delta = sameRow ? cur[1] - prev[1] : cur[0] - prev[0];
    if (delta !== 1) return false;
  }
  return true;
}

// Validate a complete fleet placement. Returns an error string or null if OK.
export function validateFleet(ships: { name: string; cells: Cell[] }[]): string | null {
  if (!Array.isArray(ships)) return "Fleet must be a list of ships.";
  if (ships.length !== FLEET.length) return `Place exactly ${FLEET.length} ships.`;

  const expected = new Set(FLEET.map((s) => s.name));
  const seenNames = new Set<string>();
  const occupied = new Set<string>();

  for (const ship of ships) {
    if (!ship || typeof ship.name !== "string") return "Ship is missing a name.";
    if (!expected.has(ship.name)) return `Unknown ship "${ship.name}".`;
    if (seenNames.has(ship.name)) return `Duplicate ship "${ship.name}".`;
    seenNames.add(ship.name);

    const cells = ship.cells;
    if (!Array.isArray(cells)) return `${ship.name} has no cells.`;
    const expectedSize = FLEET_BY_NAME[ship.name];
    if (cells.length !== expectedSize)
      return `${ship.name} must occupy ${expectedSize} cells (got ${cells.length}).`;

    for (const cell of cells) {
      if (!Array.isArray(cell) || cell.length !== 2) return `${ship.name} has a malformed cell.`;
      const [r, c] = cell;
      if (!Number.isInteger(r) || !Number.isInteger(c))
        return `${ship.name} has a non-integer cell.`;
      if (!inBounds(r, c)) return `${ship.name} is out of bounds.`;
    }

    if (!isStraightLine(cells))
      return `${ship.name} must be a straight, contiguous horizontal or vertical line.`;

    for (const [r, c] of cells) {
      const key = `${r},${c}`;
      if (occupied.has(key)) return "Ships may not overlap.";
      occupied.add(key);
    }
  }

  if (seenNames.size !== expected.size) return "Fleet is missing a ship.";
  return null;
}

// ----------------------------------------------------------------------------
// Random fleet helper — deterministic given the supplied rng.
// Returns a legal, non-overlapping fleet of the correct sizes.
// ----------------------------------------------------------------------------
export function randomFleet(rng: RNG): { name: string; cells: Cell[] }[] {
  const occupied = new Set<string>();
  const result: { name: string; cells: Cell[] }[] = [];

  for (const spec of FLEET) {
    let placed = false;
    // bounded attempts; with a 10x10 board this always succeeds quickly.
    for (let attempt = 0; attempt < 1000 && !placed; attempt++) {
      const horizontal = rng() < 0.5;
      const maxR = horizontal ? BOARD_SIZE : BOARD_SIZE - spec.size;
      const maxC = horizontal ? BOARD_SIZE - spec.size : BOARD_SIZE;
      const r0 = Math.floor(rng() * maxR);
      const c0 = Math.floor(rng() * maxC);
      const cells: Cell[] = [];
      let collision = false;
      for (let i = 0; i < spec.size; i++) {
        const r = horizontal ? r0 : r0 + i;
        const c = horizontal ? c0 + i : c0;
        const key = `${r},${c}`;
        if (occupied.has(key)) {
          collision = true;
          break;
        }
        cells.push([r, c]);
      }
      if (collision) continue;
      for (const [r, c] of cells) occupied.add(`${r},${c}`);
      result.push({ name: spec.name, cells });
      placed = true;
    }
    if (!placed) {
      // Extremely unlikely on a 10x10 board; restart from scratch with same rng.
      return randomFleet(rng);
    }
  }
  return result;
}

function buildShips(fleet: { name: string; cells: Cell[] }[]): Ship[] {
  return fleet.map((s) => ({
    name: s.name,
    cells: s.cells.map(([r, c]) => [r, c] as Cell),
    hits: s.cells.map(() => false),
  }));
}

// ----------------------------------------------------------------------------
// Sunk / win helpers
// ----------------------------------------------------------------------------
function shipIsSunk(ship: Ship): boolean {
  return ship.hits.every(Boolean);
}

function allSunk(board: PlayerBoard): boolean {
  return board.ships.length > 0 && board.ships.every(shipIsSunk);
}

function opponentOf(state: BattleshipState, playerId: string): string {
  return state.order.find((id) => id !== playerId)!;
}

function name(s: BattleshipState, id: string): string {
  return s.names[id] ?? "Player";
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const battleship: GameModule<BattleshipState> = {
  type: "battleship",
  name: "Battleship",
  emoji: "🚢",
  blurb: "Hide your fleet, hunt theirs — sink every ship to win.",
  minPlayers: 2,
  maxPlayers: 2,
  realtime: true,

  initGame(players: PlayerInfo[], config): BattleshipState {
    const seed = (config?.seed as number) ?? Math.floor(Math.random() * 2 ** 31);
    const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id);

    const boards: Record<string, PlayerBoard> = {};
    const names: Record<string, string> = {};
    for (const p of players) {
      boards[p.id] = { ships: [], shots: [], ready: false };
      names[p.id] = p.name;
    }

    return {
      phase: "placement",
      boards,
      turn: initTurn(order),
      order,
      names,
      seed,
      rngCounter: 0,
      finished: false,
      winnerId: null,
      log: ["Place your fleets!"],
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!state.boards[playerId]) return { ok: false, error: "You're not in this game." };

    switch (move.type) {
      case "place": {
        if (state.phase !== "placement") return { ok: false, error: "Placement is over." };
        if (state.boards[playerId].ready)
          return { ok: false, error: "Your fleet is already placed." };
        const ships = move.ships as { name: string; cells: Cell[] }[];
        const err = validateFleet(ships);
        if (err) return { ok: false, error: err };
        return { ok: true };
      }
      case "autoplace": {
        if (state.phase !== "placement") return { ok: false, error: "Placement is over." };
        if (state.boards[playerId].ready)
          return { ok: false, error: "Your fleet is already placed." };
        return { ok: true };
      }
      case "fire": {
        if (state.phase !== "firing") return { ok: false, error: "You can't fire yet." };
        if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };
        const r = move.r as number;
        const c = move.c as number;
        if (!Number.isInteger(r) || !Number.isInteger(c) || !inBounds(r, c))
          return { ok: false, error: "Pick a cell on the grid." };
        const target = state.boards[opponentOf(state, playerId)];
        if (target.shots.some((s) => s.r === r && s.c === c))
          return { ok: false, error: "You already fired there." };
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown move." };
    }
  },

  applyMove(state, playerId, move): BattleshipState {
    const s: BattleshipState = structuredClone(state);
    switch (move.type) {
      case "place": {
        s.boards[playerId].ships = buildShips(move.ships as { name: string; cells: Cell[] }[]);
        s.boards[playerId].ready = true;
        s.log.push(`${name(s, playerId)} is ready.`);
        maybeStartFiring(s);
        break;
      }
      case "autoplace": {
        const fleet = randomFleet(nextRng(s));
        s.boards[playerId].ships = buildShips(fleet);
        s.boards[playerId].ready = true;
        s.log.push(`${name(s, playerId)} auto-placed their fleet.`);
        maybeStartFiring(s);
        break;
      }
      case "fire": {
        applyFire(s, playerId, move.r as number, move.c as number);
        break;
      }
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished || !state.winnerId) return null;
    return {
      winners: [state.winnerId],
      reason: `${name(state, state.winnerId)} sank the entire enemy fleet!`,
    };
  },

  getPlayerView(state, playerId) {
    return projectView(state, playerId);
  },
};

// ----------------------------------------------------------------------------
// Internal transition helpers (mutate a cloned state)
// ----------------------------------------------------------------------------
function maybeStartFiring(s: BattleshipState) {
  if (s.order.every((id) => s.boards[id].ready)) {
    s.phase = "firing";
    s.turn = initTurn(s.order); // first seat fires first
    s.log.push("All fleets placed — open fire!");
  }
}

function applyFire(s: BattleshipState, playerId: string, r: number, c: number) {
  const oppId = opponentOf(s, playerId);
  const board = s.boards[oppId];

  let hit = false;
  let sunkName: string | null = null;
  for (const ship of board.ships) {
    const idx = ship.cells.findIndex(([sr, sc]) => sr === r && sc === c);
    if (idx >= 0) {
      ship.hits[idx] = true;
      hit = true;
      if (shipIsSunk(ship)) sunkName = ship.name;
      break;
    }
  }

  board.shots.push({ r, c, hit });

  if (sunkName) {
    s.log.push(`${name(s, playerId)} fired at ${coord(r, c)} — HIT! Sank the ${sunkName}! 💥`);
  } else if (hit) {
    s.log.push(`${name(s, playerId)} fired at ${coord(r, c)} — HIT! 🔥`);
  } else {
    s.log.push(`${name(s, playerId)} fired at ${coord(r, c)} — miss. 🌊`);
  }

  if (allSunk(board)) {
    s.finished = true;
    s.phase = "finished";
    s.winnerId = playerId;
    s.log.push(`🏆 ${name(s, playerId)} wins — enemy fleet destroyed!`);
    return;
  }

  // standard rules: one shot per turn, then pass.
  s.turn = advance(s.turn, 1);
}

function coord(r: number, c: number): string {
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}

// ----------------------------------------------------------------------------
// View projection — THE SECURITY-CRITICAL PART.
//
// We NEVER copy a ship's `cells` into any projection unless the cell has been
// hit. The only thing a board ever exposes about its ships is:
//   - the list of incoming shots (hit/miss markers, already public knowledge),
//   - the names + cells of ships that are FULLY SUNK (revealed by the rules),
//   - a sunk-count summary.
// For the requesting player's OWN board we additionally include their full
// ship layout. We build opponent boards via redactBoard (no secret cells) and
// only the viewer's own board via revealOwnBoard.
// ----------------------------------------------------------------------------
export interface PublicShipSummary {
  name: string;
  size: number;
  sunk: boolean;
  // cells ONLY present when the ship is fully sunk (rules reveal it).
  cells: Cell[] | null;
}

export interface PublicBoardView {
  playerId: string;
  name: string;
  ready: boolean;
  shots: Shot[];
  ships: PublicShipSummary[]; // NEVER includes un-hit cell coords
  shipsRemaining: number;
}

export interface OwnBoardView extends PublicBoardView {
  // The viewer's own full fleet — safe because it's their own board.
  ownShips: { name: string; cells: Cell[]; hits: boolean[] }[];
}

function redactBoard(s: BattleshipState, boardOwnerId: string): PublicBoardView {
  const board = s.boards[boardOwnerId];
  return {
    playerId: boardOwnerId,
    name: name(s, boardOwnerId),
    ready: board.ready,
    shots: board.shots.map((shot) => ({ r: shot.r, c: shot.c, hit: shot.hit })),
    ships: board.ships.map((ship) => {
      const sunk = shipIsSunk(ship);
      return {
        name: ship.name,
        size: ship.cells.length,
        sunk,
        // Reveal positions ONLY once the whole ship is sunk.
        cells: sunk ? ship.cells.map(([r, c]) => [r, c] as Cell) : null,
      };
    }),
    shipsRemaining: board.ships.filter((ship) => !shipIsSunk(ship)).length,
  };
}

function revealOwnBoard(s: BattleshipState, ownerId: string): OwnBoardView {
  const pub = redactBoard(s, ownerId);
  const board = s.boards[ownerId];
  return {
    ...pub,
    ownShips: board.ships.map((ship) => ({
      name: ship.name,
      cells: ship.cells.map(([r, c]) => [r, c] as Cell),
      hits: [...ship.hits],
    })),
  };
}

export interface BattleshipView {
  type: "battleship";
  phase: Phase;
  activePlayerId: string | null;
  finished: boolean;
  winnerId: string | null;
  you: string | null;
  fleet: ShipSpec[];
  boardSize: number;
  log: string[];
  players: { id: string; name: string; ready: boolean }[];
  // Every board, redacted (no un-hit ship cells). Viewer's own board, if any,
  // is replaced with the revealed variant below via `myBoard`.
  boards: PublicBoardView[];
  myBoard: OwnBoardView | null; // viewer's own board with full fleet
  opponentBoard: PublicBoardView | null; // opponent board, redacted
}

function projectView(state: BattleshipState, playerId: string | null): BattleshipView {
  const base: BattleshipView = {
    type: "battleship",
    phase: state.phase,
    activePlayerId: state.phase === "firing" ? activePlayer(state.turn) : null,
    finished: state.finished,
    winnerId: state.winnerId,
    you: playerId,
    fleet: FLEET.map((s) => ({ ...s })),
    boardSize: BOARD_SIZE,
    log: state.log.slice(-8),
    players: state.order.map((id) => ({
      id,
      name: name(state, id),
      ready: state.boards[id].ready,
    })),
    // Public projection: ALL boards redacted, never any un-hit ship cell.
    boards: state.order.map((id) => redactBoard(state, id)),
    myBoard: null,
    opponentBoard: null,
  };

  if (playerId && state.boards[playerId]) {
    base.myBoard = revealOwnBoard(state, playerId);
    const oppId = opponentOf(state, playerId);
    // opponentBoard is redacted — opponent ships stay secret.
    base.opponentBoard = redactBoard(state, oppId);
  }

  return base;
}
