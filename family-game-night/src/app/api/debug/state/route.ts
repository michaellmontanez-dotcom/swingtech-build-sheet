import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Temporary diagnostic: dump the live server-side truth for a room so we can see
// whether moves persist, whose turn the server thinks it is, whether both phones
// are in the SAME game, and whether duplicate game rows exist. Returns only
// public/shared info (never the hidden `hands.__full__` secret state).
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase();
  const db = getServiceSupabase();

  try {
    let roomsQ = db.from("rooms").select("*").order("created_at", { ascending: false }).limit(10);
    if (code) roomsQ = db.from("rooms").select("*").eq("code", code).limit(1);
    const { data: rooms, error } = await roomsQ;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const out = [];
    for (const room of rooms ?? []) {
      const [{ data: players }, { data: games }] = await Promise.all([
        db.from("players").select("id,name,seat,is_host,connected").eq("room_id", room.id).order("seat"),
        db.from("games").select("id,game_type,version,status,public_state,created_at").eq("room_id", room.id).order("created_at", { ascending: false }),
      ]);
      const latest = games?.[0];
      const ps = (latest?.public_state ?? {}) as Record<string, unknown>;
      out.push({
        code: room.code,
        roomStatus: room.status,
        currentGame: room.current_game,
        hostIdTail: String(room.host_player_id).slice(-5),
        players: (players ?? []).map((p) => ({
          idTail: String(p.id).slice(-5),
          name: p.name,
          seat: p.seat,
          host: p.is_host,
          connected: p.connected,
        })),
        gameCount: games?.length ?? 0,
        allGameVersions: (games ?? []).map((g) => ({ type: g.game_type, v: g.version, status: g.status })),
        latestGame: latest
          ? {
              id: latest.id.slice(-6),
              type: latest.game_type,
              version: latest.version,
              status: latest.status,
              // expose just the turn-relevant bits if present
              activePlayerIdTail: ps.activePlayerId ? String(ps.activePlayerId).slice(-5) : undefined,
              turnHint: ps.turn ?? ps.phase ?? undefined,
            }
          : null,
      });
    }
    return NextResponse.json({ now: new Date().toISOString(), rooms: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
