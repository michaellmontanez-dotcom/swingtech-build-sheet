"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { PlacedTile, Tile } from "@/games/dominoes/logic";

// Pip layouts (3x3 grid positions filled for each value 0-6).
const PIPS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

function Face({ value, vertical }: { value: number; vertical?: boolean }) {
  // A single half-tile: a 3x3 grid of pip slots.
  const filled = new Set(PIPS[value].map(([r, c]) => `${r}-${c}`));
  return (
    <div
      className={`grid h-9 w-9 ${vertical ? "" : ""} grid-cols-3 grid-rows-3 gap-[1px] p-0.5`}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        return (
          <span
            key={i}
            className={`m-auto h-1.5 w-1.5 rounded-full ${
              filled.has(`${r}-${c}`) ? "bg-purple-900" : "bg-transparent"
            }`}
          />
        );
      })}
    </div>
  );
}

function DominoTile({
  a,
  b,
  vertical,
}: {
  a: number;
  b: number;
  vertical?: boolean;
}) {
  return (
    <div
      className={`flex ${
        vertical ? "flex-col" : "flex-row"
      } items-center rounded-lg bg-ivory bg-white shadow-pop-sm ring-1 ring-black/10`}
    >
      <Face value={a} />
      <div className={`${vertical ? "h-[1px] w-7" : "h-7 w-[1px]"} bg-purple-900/40`} />
      <Face value={b} />
    </div>
  );
}

export function DominoesView({ view, me, send, pending }: GameViewProps) {
  const [selected, setSelected] = useState<{ id: string; ends: ("left" | "right")[] } | null>(null);

  const v = view as {
    chain: PlacedTile[];
    leftEnd: number | null;
    rightEnd: number | null;
    boneyardCount: number;
    variant: "block" | "draw";
    activePlayerId: string;
    finished: boolean;
    winnerIds: string[];
    scores: Record<string, number>;
    log: string[];
    players: { id: string; name: string; tileCount: number }[];
    you: string | null;
    hand: Tile[];
    playable: { id: string; ends: ("left" | "right")[] }[];
    canDraw: boolean;
    mustPass: boolean;
  };

  if (!v?.players) return <div className="p-6 text-center text-white/70">Dealing…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;
  const playMap = new Map(v.playable.map((p) => [p.id, p.ends]));

  function tapTile(t: Tile) {
    const ends = playMap.get(t.id) ?? [];
    if (!myTurn || ends.length === 0) return;
    if (ends.length === 1) {
      send({ type: "play", tile: t.id, end: ends[0] });
      setSelected(null);
    } else {
      setSelected({ id: t.id, ends });
    }
  }
  function chooseEnd(end: "left" | "right") {
    if (!selected) return;
    send({ type: "play", tile: selected.id, end });
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* opponents */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {v.players
          .filter((p) => p.id !== me.id)
          .map((p) => (
            <div
              key={p.id}
              className={`flex-none rounded-2xl px-3 py-2 text-center ${
                p.id === v.activePlayerId ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10"
              }`}
            >
              <div className="text-sm font-extrabold">{p.name}</div>
              <div className="text-xs opacity-80">🁢 {p.tileCount}</div>
            </div>
          ))}
      </div>

      {/* played chain with both open ends */}
      <div className="card-surface p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-white/60">
          <span>Left end: {v.leftEnd ?? "—"}</span>
          <span>Boneyard 🁢 {v.boneyardCount}</span>
          <span>Right end: {v.rightEnd ?? "—"}</span>
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto py-2">
          {v.chain.length === 0 && (
            <div className="w-full py-4 text-center text-white/50">Empty board — lead a tile.</div>
          )}
          {v.chain.map((pt) => (
            <div key={pt.id} className="flex-none">
              <DominoTile a={pt.left} b={pt.right} />
            </div>
          ))}
        </div>
      </div>

      {/* status banner */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            🏆{" "}
            {v.winnerIds.map((id) => v.players.find((p) => p.id === id)?.name).join(" & ")} win
            {v.winnerIds.length > 1 ? " (tie)" : "s"}!
          </span>
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">Your turn!</span>
        ) : (
          <span className="text-white/70">
            Waiting for {v.players.find((p) => p.id === v.activePlayerId)?.name}…
          </span>
        )}
      </div>

      {/* final scores */}
      {v.finished && (
        <div className="card-surface p-3 text-sm">
          {v.players.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{p.name}</span>
              <span className={v.scores[p.id] >= 0 ? "text-mint" : "text-white/60"}>
                {v.scores[p.id] > 0 ? `+${v.scores[p.id]}` : v.scores[p.id]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* my actions: draw / pass */}
      {myTurn && (
        <div className="flex flex-wrap justify-center gap-2">
          {v.canDraw && (
            <button className="btn-pink" onClick={() => send({ type: "draw" })} disabled={pending}>
              Draw 🁢 ({v.boneyardCount})
            </button>
          )}
          {v.mustPass && (
            <button className="btn-ghost" onClick={() => send({ type: "pass" })} disabled={pending}>
              Pass ▶
            </button>
          )}
        </div>
      )}

      {/* my hand */}
      <div className="card-surface p-3">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          Your hand · {me.emoji} {me.name}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {v.hand.map((t) => {
            const ends = playMap.get(t.id) ?? [];
            const canPlay = myTurn && ends.length > 0;
            return (
              <button
                key={t.id}
                disabled={!canPlay || pending}
                onClick={() => tapTile(t)}
                className={`flex-none transition ${
                  canPlay ? "-translate-y-1 hover:-translate-y-2" : "opacity-60"
                }`}
              >
                <DominoTile a={t.a} b={t.b} vertical />
              </button>
            );
          })}
          {v.hand.length === 0 && <div className="py-6 text-white/60">No tiles 🎉</div>}
        </div>
      </div>

      {/* choose-end picker (tile matches both open ends) */}
      {selected && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6"
          onClick={() => setSelected(null)}
        >
          <div className="card-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-lg font-extrabold">Play on which end?</p>
            <div className="flex gap-3">
              <button className="btn-pink" onClick={() => chooseEnd("left")}>
                Left ({v.leftEnd})
              </button>
              <button className="btn-pink" onClick={() => chooseEnd("right")}>
                Right ({v.rightEnd})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
