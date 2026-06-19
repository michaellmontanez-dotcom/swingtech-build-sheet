"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { Board, Color, Coord, LegalMove, Piece } from "@/games/checkers/logic";

interface CheckersView {
  board: Board;
  turn: Color;
  activePlayerId: string;
  you: string | null;
  youColor: Color | null;
  red: { id: string; name: string };
  black: { id: string; name: string };
  counts: { red: number; black: number };
  finished: boolean;
  draw: boolean;
  winner: Color | null;
  winnerId: string | null;
  legalMoves: LegalMove[];
  log: string[];
}

function sameSq(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function CheckersView({ view, me, send, pending }: GameViewProps) {
  const v = view as CheckersView;
  const [selected, setSelected] = useState<Coord | null>(null);

  if (!v?.board) return <div className="p-6 text-center text-white/70">Setting up the board…</div>;

  const myColor = v.youColor;
  const myTurn = !v.finished && v.activePlayerId === me.id;

  // Squares we can pick a piece from (origins of our legal moves).
  const origins = v.legalMoves.map((m) => m.path[0]);
  // Given a selected origin, the legal full-move paths starting there.
  const movesFromSelected = selected
    ? v.legalMoves.filter((m) => sameSq(m.path[0], selected!))
    : [];
  // Immediate next destinations from the selected piece (first hop of each path).
  const nextDests: Coord[] = movesFromSelected.map((m) => m.path[1]);

  function isSelectable(r: number, c: number): boolean {
    return myTurn && origins.some((o) => sameSq(o, [r, c]));
  }
  function isDest(r: number, c: number): boolean {
    return nextDests.some((d) => sameSq(d, [r, c]));
  }

  function onSquare(r: number, c: number) {
    if (!myTurn || pending) return;
    const piece = v.board[r][c];
    // tapping one of our selectable pieces selects it
    if (isSelectable(r, c)) {
      setSelected([r, c]);
      return;
    }
    // tapping a highlighted destination commits the move
    if (selected && isDest(r, c)) {
      // Prefer a move whose FULL path ends here; otherwise (multi-jump) take the
      // unique path through this first hop. For simplicity we send the longest
      // matching path (multi-jumps are mandatory anyway).
      const candidates = movesFromSelected.filter((m) => sameSq(m.path[1], [r, c]));
      const chosen = candidates.sort((a, b) => b.path.length - a.path.length)[0];
      send({ type: "move", path: chosen.path });
      setSelected(null);
      return;
    }
    // tapping elsewhere clears selection
    if (!piece) setSelected(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* scoreboard */}
      <div className="flex items-stretch justify-center gap-3">
        <PlayerTag
          label={v.red.name}
          color="red"
          count={v.counts.red}
          active={v.turn === "red" && !v.finished}
          you={myColor === "red"}
        />
        <div className="self-center text-xl font-black text-white/40">vs</div>
        <PlayerTag
          label={v.black.name}
          color="black"
          count={v.counts.black}
          active={v.turn === "black" && !v.finished}
          you={myColor === "black"}
        />
      </div>

      {/* status / win banner */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          v.draw ? (
            <span className="text-white/80">🤝 Draw!</span>
          ) : (
            <span className="text-sunny animate-pop inline-block">
              🏆 {v.winner === "red" ? v.red.name : v.black.name} wins!
            </span>
          )
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">Your move!</span>
        ) : (
          <span className="text-white/70">
            Waiting for {v.turn === "red" ? v.red.name : v.black.name}…
          </span>
        )}
      </div>

      {/* board */}
      <div className="mx-auto w-full max-w-md">
        <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl shadow-pop">
          {v.board.map((row, r) =>
            row.map((piece, c) => {
              const dark = (r + c) % 2 === 1;
              const sel = selected && sameSq(selected, [r, c]);
              const selectable = isSelectable(r, c);
              const dest = selected && isDest(r, c);
              return (
                <button
                  key={`${r}-${c}`}
                  disabled={!myTurn || pending}
                  onClick={() => onSquare(r, c)}
                  className={`relative flex aspect-square items-center justify-center ${
                    dark ? "bg-amber-800" : "bg-amber-200"
                  } ${sel ? "ring-4 ring-inset ring-mint" : ""}`}
                >
                  {piece && <PieceChip piece={piece} highlight={!!selectable} />}
                  {dest && (
                    <span className="absolute h-1/3 w-1/3 rounded-full bg-mint/80 ring-2 ring-white" />
                  )}
                  {selectable && !sel && (
                    <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-mint/60" />
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {selected && (
        <div className="text-center">
          <button className="btn-ghost" onClick={() => setSelected(null)}>
            Deselect
          </button>
        </div>
      )}

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}

function PlayerTag({
  label,
  color,
  count,
  active,
  you,
}: {
  label: string;
  color: Color;
  count: number;
  active: boolean;
  you: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-2xl px-4 py-2 ${
        active ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10 text-white"
      }`}
    >
      <div className="flex items-center gap-1 text-sm font-extrabold">
        <span
          className={`inline-block h-4 w-4 rounded-full ${
            color === "red" ? "bg-red-500" : "bg-neutral-900 ring-1 ring-white/40"
          }`}
        />
        {label}
        {you && <span className="text-[10px] font-black opacity-70">(you)</span>}
      </div>
      <div className="text-xs opacity-80">{count} pieces</div>
    </div>
  );
}

function PieceChip({ piece, highlight }: { piece: Piece; highlight: boolean }) {
  return (
    <div
      className={`grid h-3/4 w-3/4 place-items-center rounded-full text-lg shadow-pop-sm ${
        piece.color === "red"
          ? "bg-gradient-to-br from-red-400 to-red-600"
          : "bg-gradient-to-br from-neutral-700 to-neutral-900"
      } ${highlight ? "ring-2 ring-mint" : "ring-1 ring-black/30"}`}
    >
      {piece.king && <span className="drop-shadow">👑</span>}
    </div>
  );
}
