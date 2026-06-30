"use client";

import { useEffect, useRef } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import { Fireworks } from "@/components/Fireworks";
import { playSound } from "@/lib/sound";

type Cell = "X" | "O" | null;

// Position the strike-through line over the winning three cells.
function strikeStyle(line: number[]): React.CSSProperties | null {
  const key = line.join("");
  const rows: Record<string, number> = { "012": 0, "345": 1, "678": 2 };
  const cols: Record<string, number> = { "036": 0, "147": 1, "258": 2 };
  if (key in rows) {
    const r = rows[key];
    return { top: `${(r + 0.5) * 33.33}%`, left: "4%", right: "4%", height: 8, transform: "translateY(-50%)" };
  }
  if (key in cols) {
    const c = cols[key];
    return { left: `${(c + 0.5) * 33.33}%`, top: "4%", bottom: "4%", width: 8, transform: "translateX(-50%)" };
  }
  // diagonals
  const rot = key === "048" ? 45 : -45;
  return { top: "50%", left: "50%", width: "128%", height: 8, transform: `translate(-50%,-50%) rotate(${rot}deg)` };
}

function GlyphMark({ mark, faint }: { mark: Exclude<Cell, null>; faint?: boolean }) {
  const color = mark === "X" ? "text-sky-300" : "text-rose-300";
  return (
    <span key={mark} className={`${color} ${faint ? "opacity-25" : "animate-pop drop-shadow"} text-6xl font-black leading-none`}>
      {mark}
    </span>
  );
}

export function TicTacToeView({ view, me, send, pending, players }: GameViewProps) {
  const v = view as {
    board: Cell[];
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
  const prev = useRef<{ board: string; finished: boolean; myTurn: boolean } | null>(null);
  useEffect(() => {
    const boardStr = v.board.map((c) => c ?? ".").join("");
    const p = prev.current;
    if (p) {
      if (v.finished && !p.finished) {
        playSound(v.winnerId === me.id ? "win" : v.winnerId ? "lose" : "draw");
      } else {
        // find the newly-placed mark and play its sound
        for (let i = 0; i < 9; i++) {
          if (p.board[i] === "." && boardStr[i] !== ".") {
            playSound(boardStr[i] === "X" ? "markx" : "marko");
            break;
          }
        }
      }
      if (myTurn && !p.myTurn && !v.finished) playSound("turn");
    }
    prev.current = { board: boardStr, finished: v.finished, myTurn };
  }, [v, myTurn, me.id]);

  return (
    <div className="flex flex-col items-center gap-5">
      {/* players */}
      <div className="flex w-full justify-center gap-4">
        {v.players.map((p) => {
          const active = p.id === v.activePlayerId && !v.finished;
          return (
            <div key={p.id} className={`flex items-center gap-2 rounded-2xl px-4 py-2 ${active ? "bg-sunny text-purple-900 ring-2 ring-white" : "bg-white/10"}`}>
              <span className="text-2xl leading-none">{emojiOf(p.id)}</span>
              <div className="text-left">
                <div className="text-sm font-extrabold leading-tight">{p.id === me.id ? "You" : p.name}</div>
                <div className={`text-xs font-black ${p.mark === "X" ? "text-sky-400" : "text-rose-400"}`}>plays {p.mark}</div>
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
      <div className="relative rounded-3xl bg-white/10 p-2 shadow-pop">
        <div className="grid grid-cols-3 gap-2">
          {v.board.map((markCell, i) => {
            const open = myTurn && markCell === null && !pending;
            const isWin = win.has(i);
            return (
              <button
                key={i}
                disabled={!open}
                onClick={() => send({ type: "mark", cell: i })}
                className={`grid h-24 w-24 place-items-center rounded-2xl transition ${
                  isWin ? "bg-mint/30" : "bg-purple-950/40"
                } ${open ? "ring-2 ring-sunny/70 active:scale-95" : ""}`}
              >
                {markCell ? (
                  <GlyphMark mark={markCell} />
                ) : open ? (
                  <GlyphMark mark={v.yourMark ?? "X"} faint />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* winning strike-through */}
        {v.winningLine && (
          <span
            className="pointer-events-none absolute z-10 animate-pop rounded-full bg-sunny shadow-pop"
            style={strikeStyle(v.winningLine) ?? undefined}
          />
        )}
      </div>

      {v.finished && (
        <>
          {!v.draw && <Fireworks />}
          <p className="text-sm text-white/60">Host: tap “Games ▾” up top for a rematch or a new game.</p>
        </>
      )}
    </div>
  );
}
