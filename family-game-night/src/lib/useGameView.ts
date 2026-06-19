"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchView, sendMove as apiSendMove } from "@/lib/api";
import type { GameRow } from "@/lib/types";
import type { Move } from "@/games/types";

// Owns a player's private, redacted view of the active game. The public version
// (from the realtime `games` row) is the trigger: whenever it changes, we pull a
// fresh private view from the server (which contains this player's secret hand).
export function useGameView(game: GameRow | null, playerId: string) {
  const [view, setView] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lastVersion = useRef<number>(-1);
  const gameId = game?.id ?? null;

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      const { view } = await fetchView(gameId, playerId);
      setView(view);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gameId, playerId]);

  // refetch whenever the public version advances (or the game changes)
  useEffect(() => {
    if (!game) {
      setView(null);
      lastVersion.current = -1;
      return;
    }
    if (game.version !== lastVersion.current) {
      lastVersion.current = game.version;
      refresh();
    }
  }, [game, game?.id, game?.version, refresh]);

  const send = useCallback(
    async (move: Move) => {
      if (!gameId) return;
      setPending(true);
      setError(null);
      try {
        const res = await apiSendMove(gameId, playerId, move);
        if (res.view) setView(res.view); // instant local update for the mover
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        // on optimistic-lock conflict, re-sync
        if (/refresh|moved first|409/i.test(msg)) refresh();
      } finally {
        setPending(false);
      }
    },
    [gameId, playerId, refresh]
  );

  return { view, error, pending, send, refresh, setError };
}
