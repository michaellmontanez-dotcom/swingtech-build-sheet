"use client";

import type { GameViewProps } from "@/games/viewTypes";

// Peg color per seat order (0..3).
const PEG_BG = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-400"];
const PEG_RING = ["ring-red-300", "ring-blue-300", "ring-green-300", "ring-yellow-200"];
const PEG_TEXT = ["text-red-300", "text-blue-300", "text-green-300", "text-yellow-200"];

const TRACK = 28;

interface PegView {
  rel: number;
  abs: number | null;
  home: boolean;
  finished: boolean;
  finishSlot: number | null;
}
interface PlayerView {
  id: string;
  name: string;
  start: number;
  pegs: PegView[];
  homeCount: number;
  finishedCount: number;
}
interface View {
  track: number;
  finishSlots: number;
  activePlayerId: string;
  phase: "roll" | "move";
  lastRoll: number | null;
  finished: boolean;
  winnerId: string | null;
  log: string[];
  players: PlayerView[];
  you: string | null;
  yourTurn: boolean;
  movablePegs: number[];
  canRoll: boolean;
  canPass: boolean;
}

const DIE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function TroubleView({ view, me, send, pending }: GameViewProps) {
  const v = view as View;
  if (!v?.players) return <div className="p-6 text-center text-white/70">Setting up the board…</div>;

  const seatOf: Record<string, number> = {};
  v.players.forEach((p, i) => (seatOf[p.id] = i));
  const mySeat = v.you != null ? seatOf[v.you] : -1;

  // Build a map of absolute track square -> occupant {seat, pegIndex} for rendering.
  const occupants: Record<number, { seat: number; pegIndex: number }[]> = {};
  v.players.forEach((p, seat) => {
    p.pegs.forEach((peg, pegIndex) => {
      if (peg.abs != null) {
        (occupants[peg.abs] ||= []).push({ seat, pegIndex });
      }
    });
  });

  // Lay the 28 track squares out on a circle.
  const radius = 44; // percent
  const squares = Array.from({ length: TRACK }, (_, i) => {
    const angle = (i / TRACK) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    const isStart = v.players.find((p) => p.start === i);
    return { i, x, y, startSeat: isStart ? seatOf[isStart.id] : -1, occ: occupants[i] || [] };
  });

  const movableSet = new Set(v.movablePegs);

  function movePeg(pegIndex: number) {
    if (!v.yourTurn || v.phase !== "move" || !movableSet.has(pegIndex)) return;
    send({ type: "move", peg: pegIndex });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* player status row */}
      <div className="flex flex-wrap justify-center gap-2">
        {v.players.map((p, seat) => (
          <div
            key={p.id}
            className={`rounded-2xl px-3 py-1 text-center ${
              p.id === v.activePlayerId ? "bg-white/20 ring-2 ring-white/50" : "bg-white/5"
            }`}
          >
            <div className={`text-sm font-extrabold ${PEG_TEXT[seat]}`}>
              {p.name}
              {p.id === v.you ? " (you)" : ""}
            </div>
            <div className="text-[11px] text-white/70">
              🏁 {p.finishedCount}/4 · 🏠 {p.homeCount}
            </div>
          </div>
        ))}
      </div>

      {/* circular track */}
      <div className="relative mx-auto aspect-square w-full max-w-sm rounded-full bg-white/5">
        {squares.map((sq) => (
          <div
            key={sq.i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${sq.x}%`, top: `${sq.y}%` }}
          >
            <div
              className={`grid h-7 w-7 place-items-center rounded-full border text-[10px] ${
                sq.startSeat >= 0
                  ? `border-white/70 ${PEG_BG[sq.startSeat]}/30`
                  : "border-white/20 bg-white/10"
              }`}
            >
              {sq.occ.length > 0 ? (
                <button
                  disabled={pending || !(sq.occ[0].seat === mySeat && movableSet.has(sq.occ[0].pegIndex))}
                  onClick={() => movePeg(sq.occ[0].pegIndex)}
                  className={`h-5 w-5 rounded-full ring-2 ${PEG_BG[sq.occ[0].seat]} ${
                    PEG_RING[sq.occ[0].seat]
                  } ${
                    sq.occ[0].seat === mySeat && movableSet.has(sq.occ[0].pegIndex)
                      ? "animate-pulse ring-4 ring-white"
                      : ""
                  }`}
                />
              ) : (
                <span className="text-white/30">{sq.startSeat >= 0 ? "▸" : ""}</span>
              )}
            </div>
          </div>
        ))}

        {/* center: pop-o-matic die */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <button
            disabled={!v.canRoll || pending}
            onClick={() => send({ type: "roll" })}
            className={`grid h-24 w-24 place-items-center rounded-full text-5xl font-black shadow-lg ${
              v.canRoll
                ? "bg-pink-500 text-white active:translate-y-1"
                : "bg-white/10 text-white/50"
            }`}
          >
            {v.lastRoll ? DIE_FACE[v.lastRoll] : "🎲"}
          </button>
          <div className="mt-1 text-xs font-bold text-white/70">
            {v.canRoll ? "POP!" : v.lastRoll ? `Rolled ${v.lastRoll}` : ""}
          </div>
        </div>
      </div>

      {/* each player's HOME (4 pegs) + FINISH lane */}
      <div className="grid grid-cols-2 gap-2">
        {v.players.map((p, seat) => (
          <div key={p.id} className="rounded-2xl bg-white/5 p-2">
            <div className={`mb-1 text-xs font-bold ${PEG_TEXT[seat]}`}>{p.name}</div>
            <div className="flex items-center gap-2">
              {/* HOME */}
              <div className="flex flex-col items-center">
                <div className="text-[9px] uppercase text-white/40">Home</div>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/20 p-1">
                  {p.pegs.map((peg, i) =>
                    peg.home ? (
                      <button
                        key={i}
                        disabled={pending || !(seat === mySeat && movableSet.has(i))}
                        onClick={() => movePeg(i)}
                        className={`h-4 w-4 rounded-full ${PEG_BG[seat]} ${
                          seat === mySeat && movableSet.has(i) ? "animate-pulse ring-2 ring-white" : "opacity-90"
                        }`}
                      />
                    ) : (
                      <div key={i} className="h-4 w-4 rounded-full border border-white/20" />
                    ),
                  )}
                </div>
              </div>
              {/* FINISH lane */}
              <div className="flex flex-col items-center">
                <div className="text-[9px] uppercase text-white/40">Finish</div>
                <div className="flex gap-1 rounded-lg bg-black/20 p-1">
                  {Array.from({ length: v.finishSlots }, (_, slot) => {
                    const peg = p.pegs.find((pg) => pg.finishSlot === slot);
                    const pegIndex = p.pegs.findIndex((pg) => pg.finishSlot === slot);
                    return peg ? (
                      <button
                        key={slot}
                        disabled={pending || !(seat === mySeat && movableSet.has(pegIndex))}
                        onClick={() => movePeg(pegIndex)}
                        className={`h-4 w-4 rounded-full ${PEG_BG[seat]} ring-1 ring-white/50 ${
                          seat === mySeat && movableSet.has(pegIndex) ? "animate-pulse ring-2 ring-white" : ""
                        }`}
                      />
                    ) : (
                      <div key={slot} className="h-4 w-4 rounded-full border border-dashed border-white/30" />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* status / actions */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-yellow-300">
            🏆 {v.players.find((p) => p.id === v.winnerId)?.name} wins!
          </span>
        ) : v.yourTurn ? (
          v.phase === "roll" ? (
            <span className="text-emerald-300">Your turn — pop the die!</span>
          ) : v.canPass ? (
            <span className="text-white/80">No legal move…</span>
          ) : (
            <span className="text-emerald-300">Tap a glowing peg to move it.</span>
          )
        ) : (
          <span className="text-white/70">
            Waiting for {v.players.find((p) => p.id === v.activePlayerId)?.name}…
          </span>
        )}
      </div>

      {v.canPass && !v.finished && (
        <div className="flex justify-center">
          <button
            className="rounded-full bg-white/10 px-4 py-2 font-bold text-white active:translate-y-1"
            onClick={() => send({ type: "pass" })}
            disabled={pending}
          >
            Pass ▶
          </button>
        </div>
      )}

      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
