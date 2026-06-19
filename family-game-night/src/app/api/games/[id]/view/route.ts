import { NextResponse } from "next/server";
import { getView } from "@/lib/gameStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/games/[id]/view?playerId=... — returns this player's redacted view.
// Secrets (own hand) are delivered ONLY here, never via Realtime. Phones call
// this on load and whenever the public version changes.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const playerId = new URL(req.url).searchParams.get("playerId");
  const result = await getView(params.id, playerId || null);
  if (!result) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  return NextResponse.json(result);
}
