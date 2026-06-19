import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/roomCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/rooms — host creates a room. Body: { playerId, name, emoji }
export async function POST(req: Request) {
  try {
    const { playerId, name, emoji } = await req.json();
    if (!playerId || !name?.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    const db = getServiceSupabase();

    // generate a unique 4-letter code (retry on the rare collision)
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateRoomCode();
      const { data: existing } = await db.from("rooms").select("id").eq("code", candidate).maybeSingle();
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) return NextResponse.json({ error: "Could not allocate a room code." }, { status: 503 });

    const { data: room, error } = await db
      .from("rooms")
      .insert({ code, host_player_id: playerId, status: "lobby" })
      .select("id, code")
      .single();
    if (error || !room) return NextResponse.json({ error: error?.message ?? "Failed." }, { status: 500 });

    const { error: pErr } = await db.from("players").insert({
      id: playerId,
      room_id: room.id,
      name: name.trim().slice(0, 24),
      seat: 0,
      is_host: true,
      connected: true,
      emoji: emoji ?? "🎲",
    });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    return NextResponse.json({ code: room.code, roomId: room.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
