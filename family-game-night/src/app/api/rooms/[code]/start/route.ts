import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/roomCode";
import { createGame } from "@/lib/gameStore";
import type { PlayerInfo } from "@/games/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/rooms/[code]/start — host launches a game.
// Body: { playerId, gameType, config? }
export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = normalizeRoomCode(params.code);
    const { playerId, gameType, config } = await req.json();
    const db = getServiceSupabase();

    const { data: room } = await db.from("rooms").select("id, host_player_id").eq("code", code).maybeSingle();
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (room.host_player_id !== playerId) {
      return NextResponse.json({ error: "Only the host can start a game." }, { status: 403 });
    }

    const { data: players } = await db
      .from("players")
      .select("id, name, seat, emoji")
      .eq("room_id", room.id)
      .order("seat", { ascending: true });
    if (!players || players.length < 2) {
      return NextResponse.json({ error: "Need at least 2 players." }, { status: 400 });
    }

    const playerInfos: PlayerInfo[] = players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, emoji: p.emoji }));
    const result = await createGame(room.id, gameType, playerInfos, config);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ gameId: result.gameId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
