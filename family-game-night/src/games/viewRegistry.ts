"use client";

// Client-side registry: game_type -> View component. Kept separate from the
// logic registry so React components never get pulled into the server bundle.
import type { GameView } from "@/games/viewTypes";
import { UnoView } from "@/games/uno/View";
import { ConnectFourView } from "@/games/connect4/View";
import { YahtzeeView } from "@/games/yahtzee/View";
import { GoFishView } from "@/games/gofish/View";
import { CheckersView } from "@/games/checkers/View";
import { BattleshipView } from "@/games/battleship/View";
import { MancalaView } from "@/games/mancala/View";

export const gameViews: Record<string, GameView> = {
  uno: UnoView,
  gofish: GoFishView,
  yahtzee: YahtzeeView,
  connect4: ConnectFourView,
  checkers: CheckersView,
  battleship: BattleshipView,
  mancala: MancalaView,
};

export function getGameView(type: string): GameView | undefined {
  return gameViews[type];
}
