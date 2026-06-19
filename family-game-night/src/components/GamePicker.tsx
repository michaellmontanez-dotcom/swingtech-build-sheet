"use client";

import { useState } from "react";
import { gameCatalog, type GameCatalogEntry } from "@/games/registry";

// Host-only game chooser. Lists every implemented game; greys out ones that
// don't fit the current player count; shows per-game config (e.g. Uno stacking).
export function GamePicker({
  playerCount,
  onStart,
  busy,
}: {
  playerCount: number;
  onStart: (gameType: string, config: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<GameCatalogEntry | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});

  function choose(g: GameCatalogEntry) {
    setSelected(g);
    const initial: Record<string, unknown> = {};
    for (const f of g.config) initial[f.key] = f.default;
    setConfig(initial);
  }

  return (
    <div className="card-surface p-4">
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">Pick a game</p>
      <div className="grid grid-cols-2 gap-3">
        {gameCatalog.map((g) => {
          const fits = playerCount >= g.minPlayers && playerCount <= g.maxPlayers;
          const active = selected?.type === g.type;
          return (
            <button
              key={g.type}
              disabled={!fits}
              onClick={() => choose(g)}
              className={`rounded-2xl p-3 text-left transition ${
                active ? "bg-sunny text-purple-900 scale-[1.02]" : "bg-white/10"
              } ${!fits ? "opacity-40" : "active:translate-y-0.5"}`}
            >
              <div className="text-3xl">{g.emoji}</div>
              <div className="font-extrabold">{g.name}</div>
              <div className="text-xs opacity-80">{g.blurb}</div>
              <div className="mt-1 text-[10px] font-bold opacity-70">
                {g.minPlayers}–{g.maxPlayers} players
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-2xl bg-white/10 p-4">
          <p className="mb-2 font-extrabold">
            {selected.emoji} {selected.name}
          </p>
          {selected.config.map((f) => (
            <label key={f.key} className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span>
                {f.label}
                {f.help && <span className="block text-xs text-white/50">{f.help}</span>}
              </span>
              {f.type === "boolean" ? (
                <input
                  type="checkbox"
                  className="h-6 w-6 accent-pink-500"
                  checked={Boolean(config[f.key])}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.checked })}
                />
              ) : (
                <select
                  className="rounded-xl px-2 py-1 text-purple-900"
                  value={String(config[f.key])}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
          <button
            className="btn-primary mt-2 w-full"
            disabled={busy}
            onClick={() => onStart(selected.type, config)}
          >
            {busy ? "Starting…" : `Start ${selected.name} ▶`}
          </button>
        </div>
      )}
    </div>
  );
}
