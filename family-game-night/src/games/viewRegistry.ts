"use client";

// Client-side registry: game_type -> View component. Kept separate from the
// logic registry so React components never get pulled into the server bundle.
import type { GameView } from "@/games/viewTypes";
import { UnoView } from "@/games/uno/View";

export const gameViews: Record<string, GameView> = {
  uno: UnoView,
};

export function getGameView(type: string): GameView | undefined {
  return gameViews[type];
}
