import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Temporary diagnostic: pretty-printed, focused on rooms that are currently
// playing, so we can see at a glance whether both phones are in the SAME room
// and whether the latest move persisted. Public/shared info only.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase();
  const db = getServiceSupabase();

  try {
    let roomsQ = db.from("rooms").select("*").order("created_at", { ascending: false }).limit(6);
    if (code) roomsQ = db.from("rooms").select("*").eq("code", code).limit(1);
    const { data: rooms, error } = await roomsQ;
    if (error) return json({ error: error.message });

    const out = [];
    for (const room of rooms ?? []) {
      const [{ data: players }, { data: games }] = await Promise.all([
        db.from("players").select("id,name,seat,is_host,connected").eq("room_id", room.id).order("seat"),
        db.from("games").select("id,game_type,version,status,public_state,created_at").eq("room_id", room.id).order("created_at", { ascending: false }),
      ]);
      const latest = games?.[0];
      const ps = (latest?.public_state ?? {}) as Record<string, unknown>;
      const playerIds = new Set((players ?? []).map((p) => String(p.id)));
      out.push({
        CODE: room.code,
        status: room.status,
        host_in_players: playerIds.has(String(room.host_player_id)),
        players: (players ?? []).map((p) => `seat${p.seat} ${p.name} …${String(p.id).slice(-5)}${p.is_host ? " (host)" : ""}${p.connected ? "" : " [away]"}`),
        latestGame: latest
          ? `${latest.game_type} v${latest.version} ${latest.status} active=…${ps.activePlayerId ? String(ps.activePlayerId).slice(-5) : "?"}`
          : "none",
        games: (games ?? []).map((g) => `${g.game_type} v${g.version} ${g.status}`),
      });
    }
    return json({ now: new Date().toISOString(), rooms: out });
  } catch (e) {
    return json({ error: (e as Error).message });
  }
}

function json(obj: unknown) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
