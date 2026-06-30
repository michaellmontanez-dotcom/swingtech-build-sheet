import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isPushConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/push/subscribe — save a device's push subscription.
// Body: { playerId, roomId?, name?, subscription }
export async function POST(req: Request) {
  if (!isPushConfigured) return NextResponse.json({ error: "Push not configured." }, { status: 503 });
  try {
    const { playerId, roomId, name, subscription } = await req.json();
    if (!playerId || !subscription?.endpoint) {
      return NextResponse.json({ error: "Missing playerId/subscription." }, { status: 400 });
    }
    const db = getServiceSupabase();
    const { error } = await db.from("push_subscriptions").upsert(
      {
        player_id: playerId,
        endpoint: subscription.endpoint,
        room_id: roomId ?? null,
        data: subscription,
        name: name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,endpoint" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE /api/push/subscribe — remove a device's subscription.
// Body: { playerId, endpoint }
export async function DELETE(req: Request) {
  try {
    const { playerId, endpoint } = await req.json();
    if (!playerId || !endpoint) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    const db = getServiceSupabase();
    await db.from("push_subscriptions").delete().eq("player_id", playerId).eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
