"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { Board, ChessMove, Color, Piece, PieceType, PromotionType } from "@/games/chess/logic";

// Unicode glyphs. We use the solid (black) glyphs for both colors and tint with
// CSS so they read clearly on light/dark squares of a mobile board.
const GLYPH: Record<PieceType, string> = {
  K: "♚",
  Q: "♛",
  R: "♜",
  B: "♝",
  N: "♞",
  P: "♟",
};

type ChessViewModel = {
  type: "chess";
  board: Board;
  turn: Color;
  activePlayerId: string;
  you: string | null;
  youColor: Color | null;
  white: { id: string; name: string };
  black: { id: string; name: string };
  inCheck: boolean;
  finished: boolean;
  draw: boolean;
  drawReason: string | null;
  winner: Color | null;
  winnerId: string | null;
  legalMoves: ChessMove[];
  capturedByWhite: PieceType[];
  capturedByBlack: PieceType[];
  log: string[];
};

function key(r: number, c: number) {
  return `${r},${c}`;
}

function Glyph({ piece }: { piece: Piece }) {
  return (
    <span
      className={`select-none leading-none ${
        piece.color === "white" ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]" : "text-gray-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.3)]"
      }`}
      style={{ fontSize: "min(8vw, 2.25rem)" }}
    >
      {GLYPH[piece.type]}
    </span>
  );
}

function Tray({ label, pieces }: { label: string; pieces: PieceType[] }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-0.5 rounded-xl bg-white/10 px-2 py-1">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-white/60">{label}</span>
      {pieces.length === 0 ? (
        <span className="text-xs text-white/40">—</span>
      ) : (
        pieces.map((t, i) => (
          <span key={i} className="text-lg leading-none text-white/80">
            {GLYPH[t]}
          </span>
        ))
      )}
    </div>
  );
}

export function ChessView({ view, me, send, pending }: GameViewProps) {
  const v = view as ChessViewModel;
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [promo, setPromo] = useState<{ from: [number, number]; to: [number, number] } | null>(null);

  if (!v?.board) return <div className="p-6 text-center text-white/70">Setting up…</div>;

  const myColor = v.youColor;
  const myTurn = !v.finished && myColor != null && v.turn === myColor;

  // Legal targets from the selected square (only present when it's your turn).
  const targets = new Map<string, ChessMove>();
  if (selected) {
    for (const m of v.legalMoves) {
      if (m.from[0] === selected[0] && m.from[1] === selected[1]) {
        targets.set(key(m.to[0], m.to[1]), m);
      }
    }
  }
  // Squares that have any legal move (for the pick-a-piece highlight).
  const movableFrom = new Set<string>();
  for (const m of v.legalMoves) movableFrom.add(key(m.from[0], m.from[1]));

  // Locate the king in check for a red ring.
  let checkSquare: string | null = null;
  if (v.inCheck) {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = v.board[r][c];
        if (p && p.type === "K" && p.color === v.turn) checkSquare = key(r, c);
      }
  }

  function isPromotion(from: [number, number], to: [number, number]): boolean {
    const m = v.legalMoves.find(
      (mv) => mv.from[0] === from[0] && mv.from[1] === from[1] && mv.to[0] === to[0] && mv.to[1] === to[1] && mv.promotion,
    );
    return Boolean(m);
  }

  function commit(from: [number, number], to: [number, number], promotion?: PromotionType) {
    send({ type: "move", from, to, ...(promotion ? { promotion } : {}) });
    setSelected(null);
  }

  function onSquare(r: number, c: number) {
    if (!myTurn || pending) return;
    const k = key(r, c);
    // Tapping a legal target completes the move.
    if (selected && targets.has(k)) {
      if (isPromotion(selected, [r, c])) {
        setPromo({ from: selected, to: [r, c] });
        return;
      }
      commit(selected, [r, c]);
      return;
    }
    // Tapping one of your movable pieces selects it.
    const piece = v.board[r][c];
    if (piece && piece.color === myColor && movableFrom.has(k)) {
      setSelected([r, c]);
      return;
    }
    // Otherwise clear selection.
    setSelected(null);
  }

  const status = v.finished
    ? v.draw
      ? `Draw — ${v.drawReason ?? "draw"}`
      : `Checkmate — ${v.winner === "white" ? v.white.name : v.black.name} wins! 🏆`
    : myTurn
      ? v.inCheck
        ? "Your turn — you're in check!"
        : "Your turn"
      : `Waiting for ${v.turn === "white" ? v.white.name : v.black.name}…`;

  return (
    <div className="flex flex-col gap-3">
      {/* Opponent tray (top) */}
      <Tray label={`${v.black.name} took`} pieces={v.capturedByWhite} />

      {/* Banner */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny animate-pop inline-block">{status}</span>
        ) : myTurn ? (
          <span className={v.inCheck ? "text-rose-300 animate-pop inline-block" : "text-mint animate-pop inline-block"}>
            {status}
          </span>
        ) : (
          <span className="text-white/70">{status}</span>
        )}
      </div>

      {/* Board */}
      <div className="mx-auto w-full max-w-md">
        <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl ring-4 ring-purple-900/40 shadow-pop">
          {Array.from({ length: 8 }).flatMap((_, r) =>
            Array.from({ length: 8 }).map((__, c) => {
              const k = key(r, c);
              const dark = (r + c) % 2 === 1;
              const piece = v.board[r][c];
              const isSelected = selected && selected[0] === r && selected[1] === c;
              const isTarget = targets.has(k);
              const isCapture = isTarget && piece != null;
              const isCheck = checkSquare === k;
              const selectable = myTurn && piece?.color === myColor && movableFrom.has(k);
              return (
                <button
                  key={k}
                  onClick={() => onSquare(r, c)}
                  disabled={!myTurn || pending}
                  className={`relative grid aspect-square place-items-center ${
                    dark ? "bg-amber-700/80" : "bg-amber-100/90"
                  } ${isSelected ? "ring-4 ring-inset ring-sky-400" : ""} ${
                    isCheck ? "ring-4 ring-inset ring-rose-500" : ""
                  } ${selectable ? "cursor-pointer" : ""}`}
                >
                  {piece && <Glyph piece={piece} />}
                  {/* legal-target dot / capture ring */}
                  {isTarget && !isCapture && (
                    <span className="pointer-events-none absolute h-1/3 w-1/3 rounded-full bg-emerald-500/70" />
                  )}
                  {isCapture && (
                    <span className="pointer-events-none absolute inset-1 rounded-full ring-4 ring-emerald-500/70" />
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* My tray (bottom) */}
      <Tray label={`${v.white.name} took`} pieces={v.capturedByBlack} />

      <div className="text-center text-xs text-white/60">
        You are {myColor ? (myColor === "white" ? "White ♔" : "Black ♚") : "spectating"} · {me.emoji} {me.name}
      </div>

      {/* Promotion picker */}
      {promo && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6"
          onClick={() => setPromo(null)}
        >
          <div className="card-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-lg font-extrabold">Promote to…</p>
            <div className="flex gap-3">
              {(["Q", "R", "B", "N"] as PromotionType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    commit(promo.from, promo.to, t);
                    setPromo(null);
                  }}
                  className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-4xl text-white shadow-pop active:translate-y-1"
                >
                  {GLYPH[t]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-white/50">Tap a piece (Queen is the usual pick).</p>
          </div>
        </div>
      )}

      {/* Log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
