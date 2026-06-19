import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { initTurn, activePlayer, isActive, advance, type TurnState } from "@/games/turn";

// ----------------------------------------------------------------------------
// Connect Four — 7 columns x 6 rows, drop a disc, get 4 in a row.
// Exactly 2 players. Player 1 (seat 0) = red, player 2 (seat 1) = yellow.
// No hidden information, so public and private views are essentially the same.
// ----------------------------------------------------------------------------
export const COLS = 7;
export const ROWS = 6;

export type Disc = "red" | "yellow";
// A cell is the owning player's id, or null when empty.
export type Cell = string | null;

export interface WinLine {
  // the four [row, col] coordinates of the winning discs
  cells: [number, number][];
}

export interface Connect4State {
  // board[row][col]; row 0 is the TOP, row ROWS-1 is the BOTTOM.
  board: Cell[][];
  turn: TurnState;
  names: Record<string, string>;
  discs: Record<string, Disc>; // playerId -> color
  moves: number; // discs dropped so far
  finished: boolean;
  winnerId: string | null; // null = no winner yet or draw
  draw: boolean;
  winLine: WinLine | null;
  log: string[];
}

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

// Lowest empty row in a column, or -1 if the column is full.
function dropRow(board: Cell[][], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;
}

// Check whether the disc just placed at (row, col) completes a 4-in-a-row.
function findWin(board: Cell[][], row: number, col: number): WinLine | null {
  const owner = board[row][col];
  if (owner === null) return null;
  const dirs: [number, number][] = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal down-left
  ];
  for (const [dr, dc] of dirs) {
    const cells: [number, number][] = [[row, col]];
    // extend forward
    for (let k = 1; k < 4; k++) {
      const r = row + dr * k;
      const c = col + dc * k;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== owner) break;
      cells.push([r, c]);
    }
    // extend backward
    for (let k = 1; k < 4; k++) {
      const r = row - dr * k;
      const c = col - dc * k;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== owner) break;
      cells.unshift([r, c]);
    }
    if (cells.length >= 4) {
      return { cells: cells.slice(0, 4) };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------
export const connect4: GameModule<Connect4State> = {
  type: "connect4",
  name: "Connect Four",
  emoji: "🔴",
  blurb: "Drop discs, line up four in a row to win!",
  minPlayers: 2,
  maxPlayers: 2,

  initGame(players: PlayerInfo[]): Connect4State {
    const seated = [...players].sort((a, b) => a.seat - b.seat);
    const order = seated.map((p) => p.id);
    const names: Record<string, string> = {};
    const discs: Record<string, Disc> = {};
    for (const p of seated) names[p.id] = p.name;
    discs[order[0]] = "red";
    discs[order[1]] = "yellow";

    return {
      board: emptyBoard(),
      turn: initTurn(order),
      names,
      discs,
      moves: 0,
      finished: false,
      winnerId: null,
      draw: false,
      winLine: null,
      log: ["Red goes first — drop a disc!"],
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };
    if (move.type !== "drop") return { ok: false, error: "Unknown move." };
    const col = move.col;
    if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col >= COLS) {
      return { ok: false, error: "Invalid column." };
    }
    if (dropRow(state.board, col) === -1) return { ok: false, error: "That column is full." };
    return { ok: true };
  },

  applyMove(state, playerId, move): Connect4State {
    const s: Connect4State = structuredClone(state);
    const col = move.col as number;
    const row = dropRow(s.board, col);
    s.board[row][col] = playerId;
    s.moves += 1;
    s.log.push(`${name(s, playerId)} dropped into column ${col + 1}.`);

    const win = findWin(s.board, row, col);
    if (win) {
      s.finished = true;
      s.winnerId = playerId;
      s.winLine = win;
      s.log.push(`🏆 ${name(s, playerId)} connected four!`);
    } else if (s.moves >= ROWS * COLS) {
      s.finished = true;
      s.draw = true;
      s.log.push("Board full — it's a draw!");
    } else {
      s.turn = advance(s.turn, 1);
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    if (state.winnerId) {
      return { winners: [state.winnerId], reason: `${name(state, state.winnerId)} connected four!` };
    }
    return { winners: [], reason: "Draw" };
  },

  getPlayerView(state, playerId) {
    return {
      type: "connect4" as const,
      cols: COLS,
      rows: ROWS,
      board: state.board,
      discs: state.discs,
      activePlayerId: activePlayer(state.turn),
      finished: state.finished,
      winnerId: state.winnerId,
      draw: state.draw,
      winLine: state.winLine,
      log: state.log.slice(-6),
      you: playerId,
      players: state.turn.order.map((id) => ({
        id,
        name: state.names[id],
        disc: state.discs[id],
      })),
    };
  },
};

function name(s: Connect4State, id: string) {
  return s.names[id] ?? "Player";
}
