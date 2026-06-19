"use client";

import { useState, useEffect } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { PawnPos } from "@/games/sorry/logic";

// ----------------------------------------------------------------------------
// Color palette (color index 0..3)
// ----------------------------------------------------------------------------
const COLOR_BG = ["bg-red-500", "bg-blue-500", "bg-yellow-400", "bg-green-500"];
const COLOR_TEXT = ["text-red-200", "text-blue-200", "text-yellow-100", "text-green-200"];
const COLOR_NAME = ["Red", "Blue", "Yellow", "Green"];

interface PlayerView {
  id: string;
  name: string;
  color: number;
  startExit: number;
  homeEntry: number;
  pawns: PawnPos[];
  home: number;
}
interface Slide {
  color: number;
  start: number;
  end: number;
}
interface PlayOption {
  kind: "out" | "forward" | "backward" | "split7" | "swap11" | "sorry";
  card: number | "sorry";
  pawn?: number;
  steps?: number;
  pawnA?: number;
  pawnB?: number;
  amtA?: number;
  amtB?: number;
  targetPlayer?: string;
  targetPawn?: number;
  label: string;
}
interface SorryViewData {
  type: "sorry";
  order: string[];
  activePlayerId: string;
  drawn: { id: string; value: number | "sorry" } | null;
  drawPileCount: number;
  discardCount: number;
  slides: Slide[];
  finished: boolean;
  winnerId: string | null;
  log: string[];
  trackLen: number;
  safetyLen: number;
  players: PlayerView[];
  you: string | null;
  yourColor: number | null;
  yourTurn: boolean;
  options: PlayOption[];
  canDraw: boolean;
}

// Square ring layout: map an absolute track index (0..trackLen-1) to an x/y on a
// (size x size) grid forming the perimeter of a square. trackLen must be
// divisible by 4.
function trackCoord(pos: number, trackLen: number): { x: number; y: number } {
  const side = trackLen / 4; // cells per side
  const seg = Math.floor(pos / side);
  const off = pos % side;
  // grid is (side) x (side); perimeter cells
  switch (seg) {
    case 0:
      return { x: off, y: 0 }; // top, left->right
    case 1:
      return { x: side - 1, y: off }; // right, top->bottom
    case 2:
      return { x: side - 1 - off, y: side - 1 }; // bottom, right->left
    default:
      return { x: 0, y: side - 1 - off }; // left, bottom->top
  }
}

function cardLabel(value: number | "sorry"): string {
  return value === "sorry" ? "Sorry!" : String(value);
}

export function SorryView({ view, me, send, pending }: GameViewProps) {
  const v = view as SorryViewData;
  const [selPawn, setSelPawn] = useState<number | null>(null);

  // reset selection when the drawn card or turn changes
  useEffect(() => {
    setSelPawn(null);
  }, [v?.drawn?.id, v?.activePlayerId]);

  if (!v?.players) return <div className="p-6 text-center text-white/70">Setting up the board…</div>;

  const side = v.trackLen / 4;
  const myTurn = v.yourTurn && !v.finished;
  const opts = v.options ?? [];

  // pawn lookup by absolute track pos for rendering bumps/highlights
  const pawnAtTrack = new Map<number, { color: number; pid: string }>();
  for (const p of v.players) {
    for (const pos of p.pawns) {
      if (pos.zone === "track") pawnAtTrack.set(pos.pos, { color: p.color, pid: p.id });
    }
  }

  // which of my pawns can act with the drawn card?
  const actionablePawns = new Set<number>();
  for (const o of opts) {
    if (o.pawn !== undefined) actionablePawns.add(o.pawn);
    if (o.pawnA !== undefined) actionablePawns.add(o.pawnA);
    if (o.pawnB !== undefined) actionablePawns.add(o.pawnB);
  }

  // Options available for the currently selected pawn (simple flows). For
  // split7/swap11 we surface every option as a button list instead.
  const simpleForSel =
    selPawn === null
      ? []
      : opts.filter(
          (o) =>
            (o.kind === "out" || o.kind === "forward" || o.kind === "backward" || o.kind === "sorry") &&
            o.pawn === selPawn
        );

  const me_ = v.players.find((p) => p.id === me.id);

  return (
    <div className="flex flex-col gap-4">
      {/* scoreboard */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {v.players.map((p) => (
          <div
            key={p.id}
            className={`flex-none rounded-2xl px-3 py-2 text-center ${
              p.id === v.activePlayerId ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10"
            }`}
          >
            <div className="flex items-center justify-center gap-1 text-sm font-extrabold">
              <span className={`h-3 w-3 rounded-full ${COLOR_BG[p.color]}`} />
              {p.name}
              {p.id === me.id && <span className="text-[10px] opacity-70">(you)</span>}
            </div>
            <div className="text-xs opacity-80">🏠 {p.home}/4</div>
          </div>
        ))}
      </div>

      {/* board */}
      <div className="card-surface flex items-center justify-center p-3">
        <div
          className="relative"
          style={{
            width: `min(92vw, ${side * 30}px)`,
            aspectRatio: "1 / 1",
          }}
        >
          {/* track cells */}
          {Array.from({ length: v.trackLen }).map((_, pos) => {
            const { x, y } = trackCoord(pos, v.trackLen);
            const slide = v.slides.find((sl) => sl.start === pos);
            const occ = pawnAtTrack.get(pos);
            // color tint for each side's home stretch (near that color's startExit)
            const ownerColor = Math.floor(pos / side);
            return (
              <div
                key={pos}
                className={`absolute grid place-items-center rounded-[4px] border border-white/10 ${
                  slide ? `${COLOR_BG[slide.color]} opacity-90` : "bg-white/5"
                }`}
                style={{
                  left: `${(x / side) * 100}%`,
                  top: `${(y / side) * 100}%`,
                  width: `${(1 / side) * 100}%`,
                  height: `${(1 / side) * 100}%`,
                }}
                title={slide ? `${COLOR_NAME[slide.color]} slide` : `space ${pos}`}
              >
                {slide && <span className="text-[8px] font-black text-white/80">▶</span>}
                {occ && (
                  <span
                    className={`h-3/4 w-3/4 rounded-full ${COLOR_BG[occ.color]} ring-2 ring-white/70 ${
                      occ.pid === me.id ? "ring-white" : ""
                    }`}
                  />
                )}
                {!occ && !slide && (
                  <span className={`text-[7px] ${COLOR_TEXT[ownerColor]} opacity-30`}>·</span>
                )}
              </div>
            );
          })}

          {/* center: START / SAFETY / HOME summary for each color */}
          <div className="absolute inset-[14%] grid grid-cols-2 grid-rows-2 gap-1">
            {[0, 1, 2, 3].map((c) => {
              const pv = v.players.find((p) => p.color === c);
              const startCount = pv?.pawns.filter((p) => p.zone === "start").length ?? 0;
              const safety = pv?.pawns.filter((p) => p.zone === "safety") ?? [];
              const homeCount = pv?.pawns.filter((p) => p.zone === "home").length ?? 0;
              return (
                <div
                  key={c}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-lg ${COLOR_BG[c]} bg-opacity-25 p-1 text-[9px] font-bold text-white`}
                >
                  <span className="opacity-80">{COLOR_NAME[c]}</span>
                  <span title="in START">S:{startCount}</span>
                  <span title="in SAFETY">Z:{safety.length}</span>
                  <span title="HOME">🏠{homeCount}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* drawn card + draw button */}
      <div className="flex items-center justify-center gap-6">
        <button
          className="flex flex-col items-center"
          disabled={!v.canDraw || pending}
          onClick={() => send({ type: "draw" })}
        >
          <div
            className={`grid h-24 w-16 place-items-center rounded-xl text-2xl font-black shadow-pop-sm ring-2 ${
              v.canDraw ? "bg-purple-800 text-white ring-white/40 hover:-translate-y-1" : "bg-purple-900/60 text-white/40 ring-white/10"
            }`}
          >
            🂠
          </div>
          <span className="mt-1 text-xs font-bold text-white/70">Draw ({v.drawPileCount})</span>
        </button>

        <div className="flex flex-col items-center">
          <div
            className={`grid h-28 w-20 place-items-center rounded-xl text-4xl font-extrabold text-white shadow-pop-sm ${
              v.drawn ? "bg-rose-600" : "bg-white/10 text-white/30"
            }`}
          >
            {v.drawn ? cardLabel(v.drawn.value) : "?"}
          </div>
          <span className="mt-1 text-xs font-bold text-white/70">Drawn card</span>
        </div>
      </div>

      {/* status */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            🏆 {v.players.find((p) => p.id === v.winnerId)?.name} wins!
          </span>
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">
            Your turn{v.drawn ? " — choose a move" : " — draw a card"}!
          </span>
        ) : (
          <span className="text-white/70">
            Waiting for {v.players.find((p) => p.id === v.activePlayerId)?.name}…
          </span>
        )}
      </div>

      {/* my pawns + actions */}
      {me_ && (
        <div className="card-surface p-3">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
            Your pawns · {me.emoji} {me.name}{" "}
            {v.yourColor !== null && <span className={COLOR_TEXT[v.yourColor]}>({COLOR_NAME[v.yourColor]})</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {me_.pawns.map((p, i) => {
              const canAct = myTurn && actionablePawns.has(i);
              const isSel = selPawn === i;
              const where =
                p.zone === "start"
                  ? "Start"
                  : p.zone === "home"
                    ? "Home 🏠"
                    : p.zone === "safety"
                      ? `Safety ${p.pos + 1}`
                      : `#${p.pos}`;
              return (
                <button
                  key={i}
                  disabled={!canAct || pending}
                  onClick={() => setSelPawn(isSel ? null : i)}
                  className={`flex flex-col items-center rounded-xl px-3 py-2 transition ${
                    isSel ? "bg-white/20 ring-2 ring-white" : canAct ? "bg-white/10 hover:-translate-y-1" : "opacity-50"
                  }`}
                >
                  <span className={`h-6 w-6 rounded-full ${COLOR_BG[me_.color]} ring-2 ring-white/70`} />
                  <span className="mt-1 text-[10px] font-bold text-white/80">{where}</span>
                </button>
              );
            })}
          </div>

          {/* action buttons for selected pawn (simple moves) */}
          {myTurn && selPawn !== null && simpleForSel.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {simpleForSel.map((o, idx) => (
                <button
                  key={idx}
                  className="btn-pink text-sm"
                  disabled={pending}
                  onClick={() => {
                    send({ type: "play", ...o });
                    setSelPawn(null);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {/* split-7 and 11-swap: list all such options as buttons */}
          {myTurn && opts.some((o) => o.kind === "split7" || o.kind === "swap11") && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="text-center text-[10px] font-bold uppercase tracking-wide text-white/50">
                Special moves
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {opts
                  .filter((o) => o.kind === "split7" || o.kind === "swap11")
                  .map((o, idx) => (
                    <button
                      key={idx}
                      className="btn-ghost text-xs"
                      disabled={pending}
                      onClick={() => {
                        send({ type: "play", ...o });
                        setSelPawn(null);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* forfeit when no legal move */}
          {myTurn && v.drawn && opts.length === 0 && (
            <div className="mt-3 text-center">
              <p className="mb-2 text-xs text-white/60">No legal move for this card.</p>
              <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "forfeit" })}>
                Forfeit turn ▶
              </button>
            </div>
          )}
        </div>
      )}

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
