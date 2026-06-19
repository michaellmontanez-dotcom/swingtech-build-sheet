import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/roomCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/rooms/[code]/pick — host sends everyone back to the game picker.
// Body: { playerId }
export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = normalizeRoomCode(params.code);
    const { playerId } = await req.json();
    const db = getServiceSupabase();

    const { data: room } = await db.from("rooms").select("id, host_player_id").eq("code", code).maybeSingle();
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (room.host_player_id !== playerId) {
      return NextResponse.json({ error: "Only the host can do that." }, { status: 403 });
    }

    await db.from("games").update({ status: "finished" }).eq("room_id", room.id).eq("status", "active");
    await db.from("rooms").update({ status: "picking", current_game: null }).eq("id", room.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
