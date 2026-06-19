// Logic registry: maps game_type -> GameModule. Safe to import on the server
// (no React). The authoritative move endpoint resolves modules from here.
import type { GameModule } from "@/games/types";
import { uno } from "@/games/uno/logic";
import { connect4 } from "@/games/connect4/logic";
import { yahtzee } from "@/games/yahtzee/logic";
import { gofish } from "@/games/gofish/logic";
import { checkers } from "@/games/checkers/logic";
import { battleship } from "@/games/battleship/logic";
import { mancala } from "@/games/mancala/logic";

const MODULES: GameModule[] = [uno, gofish, yahtzee, connect4, checkers, battleship, mancala];

export const gameModules: Record<string, GameModule> = Object.fromEntries(
  MODULES.map((m) => [m.type, m])
) as Record<string, GameModule>;

export function getGameModule(type: string): GameModule | undefined {
  return gameModules[type];
}

// Lightweight metadata for the game-picker (no logic needed client-side).
export const gameCatalog = MODULES.map((m) => ({
  type: m.type,
  name: m.name,
  emoji: m.emoji,
  blurb: m.blurb,
  minPlayers: m.minPlayers,
  maxPlayers: m.maxPlayers,
  config: m.config ?? [],
  realtime: m.realtime ?? false,
}));

export type GameCatalogEntry = (typeof gameCatalog)[number];
