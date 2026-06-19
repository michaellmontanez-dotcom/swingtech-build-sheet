// Shared shell-level types (game-agnostic).

export type RoomStatus = "lobby" | "picking" | "playing" | "finished";
export type GameStatus = "active" | "finished";

export interface Room {
  id: string;
  code: string;
  host_player_id: string;
  status: RoomStatus;
  current_game: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  seat: number;
  is_host: boolean;
  connected: boolean;
  emoji: string | null;
  joined_at: string;
}

export interface GameRow {
  id: string;
  room_id: string;
  game_type: string;
  public_state: unknown;
  version: number;
  status: GameStatus;
  winner: unknown | null;
  created_at: string;
  updated_at: string;
}
