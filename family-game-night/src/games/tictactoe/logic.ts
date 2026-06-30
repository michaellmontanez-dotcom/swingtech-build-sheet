import type { GameModule, Move, PlayerInfo, ValidateResult, Winner } from "@/games/types";
import { activePlayer, initTurn, isActive, advance, type TurnState } from "@/games/turn";

export type Mark = "X" | "O";

export interface TicTacToeState {
  board: (string | null)[]; // 9 cells; playerId who owns it, or null
  turn: TurnState;
  marks: Record<string, Mark>; // playerId -> X/O
  names: Record<string, string>;
  finished: boolean;
  winnerId: string | null;
  winningLine: number[] | null;
  draw: boolean;
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6], // diagonals
];

function winningLineFor(board: (string | null)[], pid: string): number[] | null {
  for (const line of LINES) {
    if (line.every((i) => board[i] === pid)) return line;
  }
  return null;
}

export const tictactoe: GameModule<TicTacToeState> = {
  type: "tictactoe",
  name: "Tic-Tac-Toe",
  emoji: "⭕",
  blurb: "Three in a row wins. Quick classic for two.",
  minPlayers: 2,
  maxPlayers: 2,

  initGame(players: PlayerInfo[]): TicTacToeState {
    const ordered = [...players].sort((a, b) => a.seat - b.seat).slice(0, 2);
    const marks: Record<string, Mark> = {};
    const names: Record<string, string> = {};
    ordered.forEach((p, i) => {
      marks[p.id] = i === 0 ? "X" : "O";
      names[p.id] = p.name;
    });
    return {
      board: Array(9).fill(null),
      turn: initTurn(ordered.map((p) => p.id)),
      marks,
      names,
      finished: false,
      winnerId: null,
      winningLine: null,
      draw: false,
    };
  },

  validateMove(state, playerId, move): ValidateResult {
    if (state.finished) return { ok: false, error: "Game over." };
    if (!isActive(state.turn, playerId)) return { ok: false, error: "Not your turn." };
    if (move.type !== "mark") return { ok: false, error: "Unknown move." };
    const cell = move.cell as number;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { ok: false, error: "Bad square." };
    if (state.board[cell] !== null) return { ok: false, error: "That square is taken." };
    return { ok: true };
  },

  applyMove(state, playerId, move: Move): TicTacToeState {
    const s: TicTacToeState = structuredClone(state);
    const cell = move.cell as number;
    s.board[cell] = playerId;

    const line = winningLineFor(s.board, playerId);
    if (line) {
      s.finished = true;
      s.winnerId = playerId;
      s.winningLine = line;
    } else if (s.board.every((c) => c !== null)) {
      s.finished = true;
      s.draw = true;
    } else {
      s.turn = advance(s.turn, 1);
    }
    return s;
  },

  isGameOver(state): Winner | null {
    if (!state.finished) return null;
    if (state.winnerId) {
      return { winners: [state.winnerId], reason: `${state.names[state.winnerId]} got three in a row!` };
    }
    return { winners: [], reason: "Cat's game — it's a draw." };
  },

  getPlayerView(state, playerId) {
    return {
      type: "tictactoe" as const,
      // project each cell to its mark (X/O) for rendering
      board: state.board.map((owner) => (owner ? state.marks[owner] : null)),
      activePlayerId: activePlayer(state.turn),
      finished: state.finished,
      winnerId: state.winnerId,
      winningLine: state.winningLine,
      draw: state.draw,
      players: state.turn.order.map((id) => ({ id, name: state.names[id], mark: state.marks[id] })),
      you: playerId,
      yourMark: playerId ? state.marks[playerId] ?? null : null,
    };
  },
};
