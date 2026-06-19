import { NextResponse } from "next/server";
import { applyMove } from "@/lib/gameStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/games/[id]/move — the ONE authoritative move endpoint.
// Body: { playerId, move }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { playerId, move } = await req.json();
    if (!playerId || !move?.type) {
      return NextResponse.json({ error: "Bad move." }, { status: 400 });
    }
    const result = await applyMove(params.id, playerId, move);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.conflict ? 409 : 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
