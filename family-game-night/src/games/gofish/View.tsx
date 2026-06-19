"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { Card, Rank } from "@/games/gofish/logic";

const RED_SUITS = new Set(["♥", "♦"]);

function CardFace({ card }: { card: Card }) {
  const red = RED_SUITS.has(card.suit);
  return (
    <div
      className={`grid h-20 w-14 place-items-center rounded-xl bg-white shadow-pop-sm ${
        red ? "text-rose-500" : "text-slate-800"
      }`}
    >
      <div className="text-center leading-none">
        <div className="text-lg font-extrabold">{card.rank}</div>
        <div className="text-xl">{card.suit}</div>
      </div>
    </div>
  );
}

export function GoFishView({ view, me, send, pending }: GameViewProps) {
  const [target, setTarget] = useState<string | null>(null);

  const v = view as {
    activePlayerId: string;
    poolCount: number;
    finished: boolean;
    log: string[];
    players: { id: string; name: string; handCount: number; bookCount: number; books: Rank[] }[];
    you: string | null;
    hand: Card[];
    myBooks: Rank[];
    askableRanks: Rank[];
  };

  if (!v?.players) return <div className="p-6 text-center text-white/70">Dealing…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;

  // group my hand by rank for display + picker
  const byRank = new Map<Rank, Card[]>();
  for (const c of v.hand) {
    const list = byRank.get(c.rank) ?? [];
    list.push(c);
    byRank.set(c.rank, list);
  }

  function ask(rank: Rank) {
    if (!target) return;
    send({ type: "ask", targetId: target, rank });
    setTarget(null);
  }

  const lastLog = v.log[v.log.length - 1];

  return (
    <div className="flex flex-col gap-4">
      {/* ocean / pool */}
      <div className="card-surface flex items-center justify-center gap-3 py-4">
        <div className="grid h-20 w-14 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-2xl shadow-pop-sm ring-2 ring-white/20">
          🌊
        </div>
        <div className="text-sm font-bold text-white/80">
          Ocean · {v.poolCount} {v.poolCount === 1 ? "card" : "cards"} left
        </div>
      </div>

      {/* opponents as tappable ask-targets */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {v.players
          .filter((p) => p.id !== me.id)
          .map((p) => {
            const selected = target === p.id;
            return (
              <button
                key={p.id}
                disabled={!myTurn || pending}
                onClick={() => setTarget(selected ? null : p.id)}
                className={`flex-none rounded-2xl px-3 py-2 text-center transition ${
                  selected
                    ? "bg-mint text-purple-900 animate-pop"
                    : p.id === v.activePlayerId
                      ? "bg-sunny text-purple-900"
                      : "bg-white/10"
                } ${myTurn ? "" : "opacity-70"}`}
              >
                <div className="text-sm font-extrabold">{p.name}</div>
                <div className="text-xs opacity-80">🃏 {p.handCount}</div>
                <div className="text-xs opacity-80">📚 {p.bookCount}</div>
                {p.books.length > 0 && (
                  <div className="mt-0.5 text-[10px] font-black tracking-wide">{p.books.join(" ")}</div>
                )}
              </button>
            );
          })}
      </div>

      {/* status */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">🏁 Game over!</span>
        ) : myTurn ? (
          target ? (
            <span className="text-mint animate-pop inline-block">
              Pick a rank to ask {v.players.find((p) => p.id === target)?.name} for…
            </span>
          ) : (
            <span className="text-mint animate-pop inline-block">Your turn — tap a player!</span>
          )
        ) : (
          <span className="text-white/70">
            Waiting for {v.players.find((p) => p.id === v.activePlayerId)?.name}…
          </span>
        )}
      </div>

      {/* rank picker (only ranks I hold) */}
      {myTurn && target && (
        <div className="card-surface p-3">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
            Ask for…
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {v.askableRanks.map((rank) => (
              <button
                key={rank}
                disabled={pending}
                onClick={() => ask(rank)}
                className="grid h-12 w-12 place-items-center rounded-xl bg-white text-lg font-extrabold text-slate-800 shadow-pop-sm active:translate-y-1"
              >
                {rank}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* my books */}
      {v.myBooks.length > 0 && (
        <div className="rounded-2xl bg-emerald-600/70 p-2 text-center text-sm font-bold">
          Your books 📚 {v.myBooks.join(" · ")}
        </div>
      )}

      {/* my hand, grouped by rank */}
      <div className="card-surface p-3">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          Your hand · {me.emoji} {me.name}
        </div>
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
          {[...byRank.entries()].map(([rank, cards]) => (
            <div key={rank} className="flex flex-none flex-col items-center gap-1">
              <div className="flex">
                {cards.map((c, i) => (
                  <div key={c.id} className={i > 0 ? "-ml-8" : ""}>
                    <CardFace card={c} />
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-bold text-white/60">
                {rank}
                {cards.length > 1 ? ` ×${cards.length}` : ""}
              </div>
            </div>
          ))}
          {v.hand.length === 0 && <div className="py-6 text-white/60">No cards 🌊</div>}
        </div>
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/60">{lastLog}</div>
    </div>
  );
}
