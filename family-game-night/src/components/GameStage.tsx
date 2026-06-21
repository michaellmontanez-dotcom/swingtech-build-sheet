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
  const { view, error, pending, send, info } = useGameView(game, me.id);
  const View = getGameView(game.game_type);

  if (!View) {
    return (
      <div className="card-surface p-6 text-center">
        Unknown game: <b>{game.game_type}</b>
      </div>
    );
  }
  if (!view) return <div className="p-8 text-center text-white/70 animate-pulse">Loading game…</div>;

  const seated = players.some((p) => p.id === me.id);

  return (
    <div>
      {!seated && (
        <div className="mb-3 rounded-2xl bg-amber-500/90 p-3 text-center text-sm font-bold text-amber-950">
          ⚠️ This phone isn’t seated in the game (your id isn’t in the player list).
          Go back to the room and rejoin with the code, then have the host restart.
        </div>
      )}
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
      {/* Diagnostic strip — shows exactly what each tap does. */}
      <div className="mt-3 break-all rounded-xl bg-black/30 px-3 py-2 text-center font-mono text-[11px] text-white/70">
        me …{me.id.slice(-5)} · seated:{seated ? "Y" : "N"} · {pending ? "SENDING" : "idle"} · {info}
      </div>
    </div>
  );
}
