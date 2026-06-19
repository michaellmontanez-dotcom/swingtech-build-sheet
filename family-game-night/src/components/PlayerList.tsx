"use client";

import type { Player } from "@/lib/types";

export function PlayerList({ players, online, hostId }: { players: Player[]; online: Set<string>; hostId: string }) {
  return (
    <div className="card-surface p-4">
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">
        Players · {players.length}
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {players.map((p) => {
          const isOnline = online.has(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2">
              <span className="text-2xl">{p.emoji ?? "🎲"}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              {p.id === hostId && <span className="text-xs">👑</span>}
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${isOnline ? "bg-mint" : "bg-white/30"}`} title={isOnline ? "online" : "away"} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
