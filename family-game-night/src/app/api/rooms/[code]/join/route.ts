import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/roomCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/rooms/[code]/join — Body: { playerId, name, emoji }
export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = normalizeRoomCode(params.code);
    const { playerId, name, emoji } = await req.json();
    if (!playerId || !name?.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    const db = getServiceSupabase();

    const { data: room } = await db.from("rooms").select("id, status").eq("code", code).maybeSingle();
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    // already in the room? just mark connected (rejoin / refresh)
    const { data: existing } = await db
      .from("players")
      .select("id, seat")
      .eq("room_id", room.id)
      .eq("id", playerId)
      .maybeSingle();
    if (existing) {
      await db.from("players").update({ connected: true, name: name.trim().slice(0, 24) }).eq("room_id", room.id).eq("id", playerId);
      return NextResponse.json({ roomId: room.id, rejoined: true });
    }

    if (room.status !== "lobby") {
      return NextResponse.json({ error: "This game has already started." }, { status: 409 });
    }

    // next free seat
    const { data: seats } = await db.from("players").select("seat").eq("room_id", room.id).order("seat", { ascending: false }).limit(1);
    const nextSeat = (seats?.[0]?.seat ?? -1) + 1;
    if (nextSeat >= 12) return NextResponse.json({ error: "Room is full." }, { status: 409 });

    const { error } = await db.from("players").insert({
      id: playerId,
      room_id: room.id,
      name: name.trim().slice(0, 24),
      seat: nextSeat,
      is_host: false,
      connected: true,
      emoji: emoji ?? "🎯",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ roomId: room.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
