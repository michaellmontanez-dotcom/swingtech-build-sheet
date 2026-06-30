import { NextResponse } from "next/server";
import { getView } from "@/lib/gameStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// Headers that defeat EVERY layer of caching (browser, iOS, and the Vercel/CDN
// edge). Without these, polled GETs were being served a stale snapshot of the
// game, so phones stayed frozen on the opening deal even though moves persisted.
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
};

// GET /api/games/[id]/view?playerId=... — returns this player's redacted view.
// Secrets (own hand) are delivered ONLY here, never via Realtime. Phones call
// this on load and whenever the public version changes.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const playerId = new URL(req.url).searchParams.get("playerId");
  const result = await getView(params.id, playerId || null);
  if (!result) return NextResponse.json({ error: "Game not found." }, { status: 404, headers: NO_STORE });
  return NextResponse.json(result, { headers: NO_STORE });
}
