// Logic registry: maps game_type -> GameModule. Safe to import on the server
// (no React). The authoritative move endpoint resolves modules from here.
import type { GameModule } from "@/games/types";
import { uno } from "@/games/uno/logic";

const MODULES: GameModule[] = [uno];

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
