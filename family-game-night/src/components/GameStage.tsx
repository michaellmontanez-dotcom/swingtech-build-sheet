"use client";

import { useGameView } from "@/lib/useGameView";
import { getGameView } from "@/games/viewRegistry";
import type { GameRow, Player } from "@/lib/types";

// Renders the active game's view, wiring it to the authoritative move endpoint.
export function GameStage({
  game,
  me,
  players,
  isHost,
}: {
  game: GameRow;
  me: { id: string; name: string; emoji: string };
  players: Player[];
  isHost: boolean;
}) {
  const { view, error, pending, send } = useGameView(game, me.id);
  const View = getGameView(game.game_type);

  if (!View) {
    return (
      <div className="card-surface p-6 text-center">
        Unknown game: <b>{game.game_type}</b>
      </div>
    );
  }
  if (!view) return <div className="p-8 text-center text-white/70 animate-pulse">Loading game…</div>;

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-2xl bg-rose-600/80 p-2 text-center text-sm font-bold">{error}</div>
      )}
      <View
        view={view}
        me={me}
        players={players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, emoji: p.emoji }))}
        send={send}
        pending={pending}
        error={error}
        isHost={isHost}
      />
    </div>
  );
}
