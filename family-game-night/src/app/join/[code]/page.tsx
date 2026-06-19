"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EMOJIS, getPlayerId, getProfile, saveProfile } from "@/lib/identity";
import { joinRoom } from "@/lib/api";
import { normalizeRoomCode } from "@/lib/roomCode";

export default function JoinPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const code = normalizeRoomCode(params.code);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🐼");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = getProfile();
    setName(p.name);
    setEmoji(p.emoji);
  }, []);

  async function go() {
    setError("");
    if (!name.trim()) return setError("Enter your name first!");
    setBusy(true);
    try {
      saveProfile(name.trim(), emoji);
      await joinRoom(code, getPlayerId(), name.trim(), emoji);
      router.push(`/room/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 py-10">
      <div className="card-surface p-6 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-white/60">Joining room</p>
        <p className="my-2 text-5xl font-extrabold tracking-[0.3em] text-sunny">{code}</p>

        <input
          className="input my-4"
          value={name}
          maxLength={24}
          placeholder="Your name"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`grid h-11 w-11 flex-none place-items-center rounded-2xl text-2xl ${
                emoji === e ? "scale-110 bg-sunny" : "bg-white/10"
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 font-bold text-rose-200">{error}</p>}

        <button className="btn-primary w-full text-xl" onClick={go} disabled={busy}>
          {busy ? "Joining…" : `Join as ${emoji}`}
        </button>
      </div>
      <button className="btn-ghost mt-4" onClick={() => router.push("/")}>
        ← Back
      </button>
    </main>
  );
}
