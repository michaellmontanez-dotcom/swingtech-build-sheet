import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createInitialState, processMove, viewFor } from "@/lib/gamePipeline";
import type { Move, PlayerInfo } from "@/games/types";

// The full authoritative state (including all secrets) is stored in the
// RLS-locked `hands` table under this reserved key. Anon phones cannot read it;
// only the service-role server can. `games.public_state` holds the redacted
// public projection that Realtime fans out to everyone.
const FULL_STATE_KEY = "__full__";

export interface MoveResult {
  ok: boolean;
  error?: string;
  conflict?: boolean;
  version?: number;
  view?: unknown;
  gameOver?: unknown | null;
}

async function loadFullState(gameId: string): Promise<{ state: unknown; version: number; gameType: string } | null> {
  const db = getServiceSupabase();
  const [{ data: game }, { data: hand }] = await Promise.all([
    db.from("games").select("game_type, version, status").eq("id", gameId).single(),
    db.from("hands").select("data").eq("game_id", gameId).eq("player_id", FULL_STATE_KEY).single(),
  ]);
  if (!game || !hand) return null;
  return { state: hand.data, version: game.version, gameType: game.game_type };
}

export async function createGame(
  roomId: string,
  gameType: string,
  players: PlayerInfo[],
  config?: Record<string, unknown>
): Promise<{ gameId: string } | { error: string }> {
  const init = createInitialState(gameType, players, config);
  if ("error" in init) return { error: init.error };
  const { state, publicView } = init;

  const db = getServiceSupabase();

  // finish any previous active game in this room
  await db.from("games").update({ status: "finished" }).eq("room_id", roomId).eq("status", "active");

  const { data: game, error } = await db
    .from("games")
    .insert({ room_id: roomId, game_type: gameType, public_state: publicView, version: 0, status: "active" })
    .select("id")
    .single();
  if (error || !game) return { error: error?.message ?? "Failed to create game." };

  const { error: handErr } = await db
    .from("hands")
    .insert({ game_id: game.id, player_id: FULL_STATE_KEY, data: state });
  if (handErr) return { error: handErr.message };

  await db
    .from("rooms")
    .update({ status: "playing", current_game: gameType })
    .eq("id", roomId);

  return { gameId: game.id };
}

export async function applyMove(gameId: string, playerId: string, move: Move): Promise<MoveResult> {
  const loaded = await loadFullState(gameId);
  if (!loaded) return { ok: false, error: "Game not found." };

  const outcome = processMove(loaded.gameType, loaded.state, playerId, move);
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const newVersion = loaded.version + 1;
  const db = getServiceSupabase();
  // Optimistic lock: only bump if the version is still what we loaded.
  const { data: updated, error } = await db
    .from("games")
    .update({
      public_state: outcome.publicView,
      version: newVersion,
      status: outcome.gameOver ? "finished" : "active",
      winner: outcome.gameOver ?? null,
    })
    .eq("id", gameId)
    .eq("version", loaded.version)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, conflict: true, error: "Someone else moved first — refresh." };

  // persist new full secret state
  await db.from("hands").update({ data: outcome.state, updated_at: new Date().toISOString() }).eq("game_id", gameId).eq("player_id", FULL_STATE_KEY);

  if (outcome.gameOver) {
    const { data: g } = await db.from("games").select("room_id").eq("id", gameId).single();
    if (g) await db.from("rooms").update({ status: "finished" }).eq("id", g.room_id);
  }

  return { ok: true, version: newVersion, view: outcome.viewFor!(playerId), gameOver: outcome.gameOver };
}

export async function getView(gameId: string, playerId: string | null): Promise<{ view: unknown; version: number } | null> {
  const loaded = await loadFullState(gameId);
  if (!loaded) return null;
  return { view: viewFor(loaded.gameType, loaded.state, playerId), version: loaded.version };
}
