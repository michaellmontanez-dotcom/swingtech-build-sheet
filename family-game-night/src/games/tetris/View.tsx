"use client";

import { useEffect, useRef } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { Cell, PieceType } from "@/games/tetris/logic";

// ----------------------------------------------------------------------------
// Colors per piece / garbage.
// ----------------------------------------------------------------------------
const CELL_COLOR: Record<string, string> = {
  I: "bg-cyan-400",
  O: "bg-yellow-400",
  T: "bg-purple-500",
  S: "bg-green-500",
  Z: "bg-red-500",
  J: "bg-blue-500",
  L: "bg-orange-500",
  G: "bg-stone-500",
  ghost: "bg-white/15",
};

interface PubPlayer {
  id: string;
  name: string;
  grid: Cell[][];
  score: number;
  lines: number;
  level: number;
  toppedOut: boolean;
  pendingGarbage: number;
}

interface TetrisViewModel {
  width: number;
  height: number;
  started: boolean;
  finished: boolean;
  winnerId: string | null;
  players: PubPlayer[];
  you: string | null;
  active: { type: PieceType; rot: number; row: number; col: number } | null;
  activeCells: [number, number][];
  next: PieceType | null;
  hold: PieceType | null;
  canHold: boolean;
  toppedOut: boolean;
  canAct: boolean;
  level: number;
}

function Mini({ p }: { p: PubPlayer }) {
  return (
    <div className={`rounded-2xl p-2 ${p.toppedOut ? "bg-rose-900/40" : "bg-white/5"}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-extrabold">
        <span className="truncate">{p.name}</span>
        {p.pendingGarbage > 0 && (
          <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-black text-white">
            +{p.pendingGarbage}
          </span>
        )}
      </div>
      <div
        className="grid gap-px rounded bg-black/40 p-0.5"
        style={{ gridTemplateColumns: `repeat(${p.grid[0].length}, minmax(0,1fr))` }}
      >
        {p.grid.flat().map((cell, i) => (
          <div
            key={i}
            className={`aspect-square ${cell === 0 ? "bg-white/5" : CELL_COLOR[cell as string]} rounded-[1px]`}
          />
        ))}
      </div>
      <div className="mt-1 text-[10px] text-white/60">
        {p.score} · {p.lines}L · Lv{p.level}
        {p.toppedOut && <span className="ml-1 font-black text-rose-300">OUT</span>}
      </div>
    </div>
  );
}

function PiecePreview({ type }: { type: PieceType | null }) {
  if (!type) return <div className="h-12 w-12" />;
  return (
    <div className={`grid h-12 w-12 place-items-center rounded-lg ${CELL_COLOR[type]} text-xl font-black text-black/70`}>
      {type}
    </div>
  );
}

export function TetrisView({ view, me, send, pending }: GameViewProps) {
  const v = view as TetrisViewModel;
  const sendRef = useRef(send);
  sendRef.current = send;

  const me_ = v?.players?.find((p) => p.id === me.id);
  const running = v?.started && !v?.finished && v?.canAct && !v?.toppedOut;
  const level = v?.level ?? 1;

  // Gravity: send a tick on an interval while alive + running. Faster as the
  // level rises. The View tolerates dropped/retried moves — it always renders
  // from the authoritative `view`.
  useEffect(() => {
    if (!running) return;
    const period = Math.max(120, 700 - (level - 1) * 60);
    const id = setInterval(() => {
      void sendRef.current({ type: "tick" });
    }, period);
    return () => clearInterval(id);
  }, [running, level]);

  // Keyboard controls (desktop convenience; touch buttons below for mobile).
  useEffect(() => {
    if (!running) return;
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft": sendRef.current({ type: "left" }); break;
        case "ArrowRight": sendRef.current({ type: "right" }); break;
        case "ArrowDown": sendRef.current({ type: "soft" }); break;
        case "ArrowUp": case "x": sendRef.current({ type: "rotate", dir: "cw" }); break;
        case "z": sendRef.current({ type: "rotate", dir: "ccw" }); break;
        case " ": e.preventDefault(); sendRef.current({ type: "hard" }); break;
        case "Shift": case "c": sendRef.current({ type: "hold" }); break;
        default: return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  if (!v?.players) return <div className="p-6 text-center text-white/70">Loading…</div>;

  const opponents = v.players.filter((p) => p.id !== me.id);

  // Render my big playfield, overlaying the active falling piece.
  const activeSet = new Set((v.activeCells ?? []).map(([r, c]) => `${r},${c}`));
  const grid = me_?.grid ?? [];

  function tap(move: Parameters<typeof send>[0]) {
    if (!running) return;
    void send(move);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* status banner */}
      {v.finished ? (
        <div className="rounded-2xl bg-sunny p-3 text-center text-lg font-black text-purple-900">
          {v.winnerId === me.id
            ? "🏆 You win! Last one standing!"
            : v.winnerId
              ? `🏆 ${v.players.find((p) => p.id === v.winnerId)?.name} wins!`
              : "Everyone topped out!"}
        </div>
      ) : v.toppedOut ? (
        <div className="rounded-2xl bg-rose-700/70 p-3 text-center font-extrabold">
          💥 You topped out — cheer them on!
        </div>
      ) : null}

      <div className="flex gap-3">
        {/* main playfield */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 text-xs font-bold text-white/80">
            <span>Score {me_?.score ?? 0}</span>
            <span>Lines {me_?.lines ?? 0}</span>
            <span>Lv {me_?.level ?? 1}</span>
            {(me_?.pendingGarbage ?? 0) > 0 && (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 font-black text-white animate-pop">
                ⚠ +{me_?.pendingGarbage} incoming
              </span>
            )}
          </div>
          <div
            className="grid gap-px rounded-lg bg-black/50 p-1 shadow-pop-sm"
            style={{
              gridTemplateColumns: `repeat(${v.width}, minmax(0,1fr))`,
              width: "min(60vw, 230px)",
            }}
          >
            {grid.map((rowArr, r) =>
              rowArr.map((cell, c) => {
                const isActive = activeSet.has(`${r},${c}`);
                const color = isActive
                  ? CELL_COLOR[v.active?.type ?? "I"]
                  : cell === 0
                    ? "bg-white/5"
                    : CELL_COLOR[cell as string];
                return <div key={`${r},${c}`} className={`aspect-square rounded-[1px] ${color}`} />;
              })
            )}
          </div>
        </div>

        {/* side panel: hold / next + opponents */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex gap-3">
            <div className="text-center">
              <div className="mb-1 text-[10px] font-bold uppercase text-white/50">Hold</div>
              <PiecePreview type={v.hold} />
            </div>
            <div className="text-center">
              <div className="mb-1 text-[10px] font-bold uppercase text-white/50">Next</div>
              <PiecePreview type={v.next} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {opponents.map((p) => (
              <Mini key={p.id} p={p} />
            ))}
          </div>
        </div>
      </div>

      {/* touch controls */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-ghost py-3 text-2xl" disabled={!running || pending} onClick={() => tap({ type: "left" })}>
            ←
          </button>
          <button
            className="btn-ghost py-3 text-xl"
            disabled={!running || pending}
            onClick={() => tap({ type: "rotate", dir: "cw" })}
          >
            ⟳
          </button>
          <button className="btn-ghost py-3 text-2xl" disabled={!running || pending} onClick={() => tap({ type: "right" })}>
            →
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-ghost py-3 font-bold" disabled={!running || pending} onClick={() => tap({ type: "soft" })}>
            ↓ Soft
          </button>
          <button className="btn-pink py-3 font-black" disabled={!running || pending} onClick={() => tap({ type: "hard" })}>
            ⤓ DROP
          </button>
          <button
            className="btn-ghost py-3 font-bold"
            disabled={!running || pending || !v.canHold}
            onClick={() => tap({ type: "hold" })}
          >
            ↺ Hold
          </button>
        </div>
      </div>
    </div>
  );
}
