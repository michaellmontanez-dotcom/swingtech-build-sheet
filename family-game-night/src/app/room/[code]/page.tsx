"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlayerId, getProfile } from "@/lib/identity";
import { normalizeRoomCode } from "@/lib/roomCode";
import { useRoom } from "@/lib/useRoom";
import { returnToPicker, startGame } from "@/lib/api";
import { InvitePanel } from "@/components/InvitePanel";
import { PlayerList } from "@/components/PlayerList";
import { GamePicker } from "@/components/GamePicker";
import { GameStage } from "@/components/GameStage";

export default function RoomPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const code = normalizeRoomCode(params.code);
  const [me, setMe] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showInvite, setShowInvite] = useState(true);

  useEffect(() => {
    const p = getProfile();
    setMe({ id: getPlayerId(), name: p.name, emoji: p.emoji });
  }, []);

  const { room, players, game, online, loading, error } = useRoom(code, me);
  const amMember = useMemo(() => !!me && players.some((p) => p.id === me.id), [players, me]);
  const isHost = !!room && !!me && room.host_player_id === me.id;

  // not yet joined? send to the join flow
  useEffect(() => {
    if (!loading && room && me && !amMember) router.replace(`/join/${code}`);
  }, [loading, room, me, amMember, code, router]);

  async function onStart(gameType: string, config: Record<string, unknown>) {
    if (!me) return;
    setActionError("");
    setBusy(true);
    try {
      await startGame(code, me.id, gameType, config);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onBackToPicker() {
    if (!me) return;
    try {
      await returnToPicker(code, me.id);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  if (loading || !me) {
    return <div className="grid min-h-full place-items-center text-xl text-white/70 animate-pulse">Loading room…</div>;
  }
  if (error || !room) {
    return (
      <div className="mx-auto grid min-h-full max-w-md place-items-center px-6 text-center">
        <div>
          <p className="mb-4 text-2xl font-extrabold">Room not found 🙈</p>
          <button className="btn-primary" onClick={() => router.push("/")}>Go home</button>
        </div>
      </div>
    );
  }

  const inGame = room.status === "playing" || room.status === "finished";
  const activeGame = game && game.status === "active" ? game : room.status === "finished" ? game : null;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/")} className="text-2xl">🏠</button>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-white/50">Room</div>
          <div className="text-xl font-extrabold tracking-[0.25em] text-sunny">{code}</div>
        </div>
        {isHost && inGame ? (
          <button onClick={onBackToPicker} className="btn-ghost px-3 py-2 text-sm">Games ▾</button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {actionError && <div className="rounded-2xl bg-rose-600/80 p-2 text-center text-sm font-bold">{actionError}</div>}

      {/* lobby / picking */}
      {!inGame && (
        <>
          <button className="text-center text-sm text-white/60 underline" onClick={() => setShowInvite((s) => !s)}>
            {showInvite ? "Hide invite ▲" : "Show invite / QR ▼"}
          </button>
          {showInvite && <InvitePanel code={code} />}
          <PlayerList players={players} online={online} hostId={room.host_player_id} />
          {isHost ? (
            <GamePicker playerCount={players.length} onStart={onStart} busy={busy} />
          ) : (
            <div className="card-surface p-6 text-center text-white/70">
              Waiting for the host to start a game… 🍿
            </div>
          )}
        </>
      )}

      {/* active game */}
      {inGame && activeGame && (
        <GameStage game={activeGame} me={me} players={players} isHost={isHost} />
      )}

      {inGame && room.status === "finished" && (
        <div className="card-surface p-4 text-center">
          {isHost ? (
            <button className="btn-primary w-full" onClick={onBackToPicker}>
              🔁 Play another game
            </button>
          ) : (
            <p className="text-white/70">Waiting for the host to pick the next game…</p>
          )}
        </div>
      )}
    </main>
  );
}
