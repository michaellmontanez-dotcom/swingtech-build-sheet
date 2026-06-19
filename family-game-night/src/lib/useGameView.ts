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
  const pendingRef = useRef(false);
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

  // Safety net: poll the authoritative view on a timer so a phone can never get
  // stuck on a stale turn if a realtime update is missed. The /view endpoint is
  // the source of truth (current state + this player's secret hand).
  useEffect(() => {
    if (!gameId) return;
    const id = setInterval(() => {
      if (!pendingRef.current) refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [gameId, refresh]);

  const send = useCallback(
    async (move: Move) => {
      if (!gameId) return;
      setPending(true);
      pendingRef.current = true;
      setError(null);
      try {
        const res = await apiSendMove(gameId, playerId, move);
        if (res.view) setView(res.view); // instant local update for the mover
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        // Any rejection (conflict, "not your turn", stale state) → re-sync from
        // the server so the screen matches reality and the player isn't stuck.
        refresh();
      } finally {
        setPending(false);
        pendingRef.current = false;
      }
    },
    [gameId, playerId, refresh]
  );

  return { view, error, pending, send, refresh, setError };
}
