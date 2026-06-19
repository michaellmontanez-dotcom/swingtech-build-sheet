"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EMOJIS, getPlayerId, getProfile, saveProfile } from "@/lib/identity";
import { createRoom } from "@/lib/api";
import { normalizeRoomCode, isValidRoomCode } from "@/lib/roomCode";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🦊");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    const p = getProfile();
    setName(p.name);
    setEmoji(p.emoji);
    setConfigured(isSupabaseConfigured);
  }, []);

  async function host() {
    setError("");
    if (!name.trim()) return setError("Enter your name first!");
    setBusy(true);
    try {
      saveProfile(name.trim(), emoji);
      const { code } = await createRoom(getPlayerId(), name.trim(), emoji);
      router.push(`/room/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function join() {
    setError("");
    if (!name.trim()) return setError("Enter your name first!");
    const c = normalizeRoomCode(code);
    if (!isValidRoomCode(c)) return setError("Room codes are 4 letters.");
    saveProfile(name.trim(), emoji);
    router.push(`/join/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 py-8">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 grid h-24 w-24 place-items-center rounded-3xl bg-white/10 text-6xl shadow-pop">
          🎲
        </div>
        <h1 className="text-4xl font-extrabold drop-shadow">Family Game Night</h1>
        <p className="mt-1 text-white/80">Everyone plays on their own phone.</p>
      </header>

      {!configured && (
        <div className="card-surface mb-5 p-4 text-sm text-amber-100">
          ⚠️ Supabase isn’t configured yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (plus the server keys) to play. See the README.
        </div>
      )}

      <section className="card-surface mb-5 p-5">
        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-white/70">
          Your name
        </label>
        <input
          className="input mb-4"
          value={name}
          maxLength={24}
          placeholder="e.g. Mom, Leo, Grandpa"
          onChange={(e) => setName(e.target.value)}
        />
        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-white/70">
          Pick your token
        </label>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`grid h-12 w-12 flex-none place-items-center rounded-2xl text-2xl transition ${
                emoji === e ? "scale-110 bg-sunny shadow-pop-sm" : "bg-white/10"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="mb-3 text-center font-bold text-rose-200">{error}</p>}

      <button className="btn-primary mb-6 w-full text-xl" onClick={host} disabled={busy}>
        {busy ? "Creating…" : "🎉 Host a Game Night"}
      </button>

      <div className="card-surface p-5">
        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-white/70">
          Join with a room code
        </label>
        <div className="flex gap-2">
          <input
            className="input tracking-[0.4em] text-center uppercase"
            value={code}
            placeholder="ABCD"
            maxLength={4}
            inputMode="text"
            autoCapitalize="characters"
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          />
          <button className="btn-mint flex-none" onClick={join}>
            Join
          </button>
        </div>
      </div>

      <footer className="mt-auto pt-8 text-center text-xs text-white/50">
        Tip: add this to your home screen for the full-screen experience.
      </footer>
    </main>
  );
}
