"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchView, sendMove as apiSendMove } from "@/lib/api";
import type { GameRow } from "@/lib/types";
import type { Move } from "@/games/types";

// Owns a player's private, redacted view of the active game.
//
// Sync model: every render of the view is the result of a numbered operation
// (a poll, a version-triggered refresh, or a move). We only apply a result if it
// belongs to the NEWEST operation issued. This makes the newest request always
// win and makes it IMPOSSIBLE to permanently freeze the view — there is no
// version gate that can get "stuck high" across games. A response that lost the
// race is simply dropped; the next 1s poll re-pulls the freshest server state.
export function useGameView(game: GameRow | null, playerId: string) {
  const [view, setView] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<string>("ready");
  const opSeq = useRef(0); // monotonic; newest issued operation wins
  const gameId = game?.id ?? null;

  const refresh = useCallback(async () => {
    if (!gameId) return;
    const op = ++opSeq.current;
    try {
      const { view } = await fetchView(gameId, playerId);
      if (op === opSeq.current) setView(view); // apply only if still the newest op
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gameId, playerId]);

  // Pull fresh state whenever the game changes or its public version advances.
  useEffect(() => {
    if (!game) {
      setView(null);
      return;
    }
    refresh();
  }, [game, game?.id, game?.version, refresh]);

  // Always-on safety poll: the source of truth is the server, fetched every
  // second, so a phone can never get stuck on a stale turn even if realtime
  // never delivers a single event.
  useEffect(() => {
    if (!gameId) return;
    const id = setInterval(() => refresh(), 1000);
    return () => clearInterval(id);
  }, [gameId, refresh]);

  const send = useCallback(
    async (move: Move) => {
      if (!gameId) {
        setInfo(`no gameId (move ${move.type})`);
        return;
      }
      const op = ++opSeq.current;
      setPending(true);
      setError(null);
      setInfo(`sending ${move.type}…`);
      try {
        const res = await apiSendMove(gameId, playerId, move);
        if (res.view && op === opSeq.current) setView(res.view); // instant update for the mover
        setInfo(`ok ${move.type} → v${res.version}`);
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        setInfo(`ERR ${move.type}: ${msg}`);
        refresh(); // re-sync from the server on any rejection
      } finally {
        setPending(false);
      }
    },
    [gameId, playerId, refresh]
  );

  return { view, error, pending, send, refresh, setError, info };
}
