import type { ComponentType } from "react";
import type { Move, PlayerInfo } from "@/games/types";

// Props every game's View component receives from the shell.
export interface GameViewProps {
  // the player's redacted view (shape is game-specific)
  view: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  me: { id: string; name: string; emoji: string };
  players: PlayerInfo[];
  send: (move: Move) => void | Promise<void>;
  pending: boolean;
  error: string | null;
  isHost: boolean;
}

export type GameView = ComponentType<GameViewProps>;
