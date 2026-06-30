"use client";

import { useEffect, useRef } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import { Fireworks } from "@/components/Fireworks";
import { playSound } from "@/lib/sound";

export function TicTacToeView({ view, me, send, pending, players }: GameViewProps) {
  const v = view as {
    board: (string | null)[];
    activePlayerId: string;
    finished: boolean;
    winnerId: string | null;
    winningLine: number[] | null;
    draw: boolean;
    players: { id: string; name: string; mark: "X" | "O" }[];
    you: string | null;
    yourMark: "X" | "O" | null;
  };
  if (!v?.board) return <div className="p-6 text-center text-white/70">Setting up…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;
  const emojiOf = (id: string) => players.find((p) => p.id === id)?.emoji ?? "🎲";
  const nameOf = (id: string) => v.players.find((p) => p.id === id)?.name ?? "Player";
  const win = new Set(v.winningLine ?? []);

  // sounds on state changes
  const prev = useRef<{ filled: number; finished: boolean; myTurn: boolean } | null>(null);
  useEffect(() => {
    const filled = v.board.filter(Boolean).length;
    const p = prev.current;
    if (p) {
      if (v.finished && !p.finished) playSound(v.winnerId === me.id ? "win" : v.winnerId ? "lose" : "draw");
      else if (filled > p.filled) playSound("play");
      if (myTurn && !p.myTurn && !v.finished) playSound("turn");
    }
    prev.current = { filled, finished: v.finished, myTurn };
  }, [v, myTurn, me.id]);

  return (
    <div className="flex flex-col items-center gap-5">
      {/* players */}
      <div className="flex w-full justify-center gap-4">
        {v.players.map((p) => {
          const active = p.id === v.activePlayerId && !v.finished;
          return (
            <div key={p.id} className={`rounded-2xl px-4 py-2 text-center ${active ? "bg-sunny text-purple-900 ring-2 ring-white" : "bg-white/10"}`}>
              <div className="text-2xl leading-none">{emojiOf(p.id)}</div>
              <div className="text-sm font-extrabold">
                {p.id === me.id ? "You" : p.name} · {p.mark}
              </div>
            </div>
          );
        })}
      </div>

      {/* status */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          v.draw ? (
            <span className="text-xl text-white/80">😼 Cat&apos;s game — a draw!</span>
          ) : (
            <span className="text-xl text-sunny">🏆 {v.winnerId === me.id ? "You win!" : `${nameOf(v.winnerId ?? "")} wins!`}</span>
          )
        ) : myTurn ? (
          <span className="text-mint">Your turn — you&apos;re {v.yourMark}</span>
        ) : (
          <span className="text-white/70">{emojiOf(v.activePlayerId)} Waiting for {nameOf(v.activePlayerId)}…</span>
        )}
      </div>

      {/* board */}
      <div className="grid grid-cols-3 gap-2">
        {v.board.map((markCell, i) => {
          const open = myTurn && markCell === null && !pending;
          const isWin = win.has(i);
          return (
            <button
              key={i}
              disabled={!open}
              onClick={() => send({ type: "mark", cell: i })}
              className={`grid h-24 w-24 place-items-center rounded-2xl text-5xl font-black transition ${
                isWin ? "bg-mint text-emerald-950 animate-pop" : "bg-white/10"
              } ${open ? "ring-2 ring-sunny/70 active:translate-y-0.5" : ""}`}
            >
              <span className={markCell === "X" ? "text-sky-300" : markCell === "O" ? "text-rose-300" : ""}>
                {markCell ?? (open ? <span className="text-2xl text-white/30">{v.yourMark}</span> : "")}
              </span>
            </button>
          );
        })}
      </div>

      {v.finished && (
        <>
          {!v.draw && <Fireworks />}
          <p className="text-sm text-white/60">Host: tap “Games ▾” up top to play again.</p>
        </>
      )}
    </div>
  );
}
