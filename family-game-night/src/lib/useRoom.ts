"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { GameRow, Player, Room } from "@/lib/types";

export interface RoomData {
  room: Room | null;
  players: Player[];
  game: GameRow | null; // the active game, if any
  online: Set<string>; // player ids currently present
  loading: boolean;
  error: string | null;
}

// Subscribes to a room: roster, room status, the active game row, and live
// presence. All reads use the anon client and only touch non-secret tables.
export function useRoom(code: string, me: { id: string; name: string; emoji: string } | null): RoomData {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;
    const sb = getBrowserSupabase();
    let channel: RealtimeChannel | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    async function loadPlayers(roomId: string) {
      const { data } = await sb.from("players").select("*").eq("room_id", roomId).order("seat");
      if (active && data) setPlayers(data as Player[]);
    }
    async function loadGame(roomId: string) {
      const { data } = await sb
        .from("games")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (active) setGame((data?.[0] as GameRow) ?? null);
    }
    async function loadRoom(roomId: string) {
      const { data } = await sb.from("rooms").select("*").eq("id", roomId).single();
      if (active && data) setRoom(data as Room);
    }

    (async () => {
      const { data: r, error: rErr } = await sb.from("rooms").select("*").eq("code", code).maybeSingle();
      if (!active) return;
      if (rErr || !r) {
        setError("Room not found.");
        setLoading(false);
        return;
      }
      const roomRow = r as Room;
      roomIdRef.current = roomRow.id;
      setRoom(roomRow);
      await Promise.all([loadPlayers(roomRow.id), loadGame(roomRow.id)]);
      setLoading(false);

      channel = sb
        .channel(`room:${code}`, { config: { presence: { key: me?.id || "anon" } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomRow.id}` }, () => loadRoom(roomRow.id))
        .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomRow.id}` }, () => loadPlayers(roomRow.id))
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `room_id=eq.${roomRow.id}` }, () => loadGame(roomRow.id))
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState();
          const ids = new Set<string>();
          Object.values(state).forEach((arr) => (arr as Array<{ playerId?: string }>).forEach((m) => m.playerId && ids.add(m.playerId)));
          setOnline(ids);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && me) {
            await channel!.track({ playerId: me.id, name: me.name, emoji: me.emoji });
          }
        });

      // Safety-net polling: if realtime drops or misses an event, this keeps the
      // room status, roster, and active-game version converging so the game
      // start, turn changes, and round transitions never get stuck.
      pollId = setInterval(() => {
        if (!active) return;
        loadRoom(roomRow.id);
        loadGame(roomRow.id);
        loadPlayers(roomRow.id);
      }, 3000);
    })();

    return () => {
      active = false;
      if (pollId) clearInterval(pollId);
      if (channel) getBrowserSupabase().removeChannel(channel);
    };
  }, [code, me?.id, me?.name, me?.emoji]);

  return { room, players, game, online, loading, error };
}
