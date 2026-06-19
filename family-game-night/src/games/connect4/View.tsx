"use client";

import type { GameViewProps } from "@/games/viewTypes";
import type { Cell, Disc } from "@/games/connect4/logic";

const DISC_BG: Record<Disc, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
};
const DISC_RING: Record<Disc, string> = {
  red: "ring-red-300",
  yellow: "ring-yellow-200",
};

interface Connect4ViewData {
  cols: number;
  rows: number;
  board: Cell[][];
  discs: Record<string, Disc>;
  activePlayerId: string;
  finished: boolean;
  winnerId: string | null;
  draw: boolean;
  winLine: { cells: [number, number][] } | null;
  log: string[];
  you: string | null;
  players: { id: string; name: string; disc: Disc }[];
}

export function ConnectFourView({ view, me, send, pending }: GameViewProps) {
  const v = view as Connect4ViewData;
  if (!v?.board) return <div className="p-6 text-center text-white/70">Setting up…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;
  const winSet = new Set((v.winLine?.cells ?? []).map(([r, c]) => `${r},${c}`));
  const activePlayer = v.players.find((p) => p.id === v.activePlayerId);
  const winner = v.players.find((p) => p.id === v.winnerId);

  // a column is droppable if its TOP cell (row 0) is still empty
  function columnOpen(col: number): boolean {
    return v.board[0][col] === null;
  }

  function drop(col: number) {
    if (!myTurn || pending || !columnOpen(col)) return;
    send({ type: "drop", col });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* players */}
      <div className="flex justify-center gap-3">
        {v.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${
              p.id === v.activePlayerId && !v.finished ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10"
            }`}
          >
            <span className={`h-5 w-5 rounded-full ${DISC_BG[p.disc]} ring-2 ${DISC_RING[p.disc]}`} />
            <span className="text-sm font-extrabold">
              {p.name}
              {p.id === me.id && " (you)"}
            </span>
          </div>
        ))}
      </div>

      {/* status banner */}
      <div className="text-center text-lg font-extrabold">
        {v.finished ? (
          v.draw ? (
            <span className="text-white/80">🤝 It&apos;s a draw!</span>
          ) : (
            <span className="text-sunny animate-pop inline-block">
              🏆 {winner?.name}
              {v.winnerId === me.id ? " (you)" : ""} wins!
            </span>
          )
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">Your turn — tap a column!</span>
        ) : (
          <span className="text-white/70">Waiting for {activePlayer?.name}…</span>
        )}
      </div>

      {/* board */}
      <div className="card-surface mx-auto w-full max-w-md p-3">
        {/* column drop buttons */}
        <div
          className="mb-2 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${v.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: v.cols }).map((_, col) => {
            const open = columnOpen(col);
            return (
              <button
                key={col}
                onClick={() => drop(col)}
                disabled={!myTurn || pending || !open}
                aria-label={`Drop in column ${col + 1}`}
                className={`grid h-8 place-items-center rounded-lg text-lg font-black transition ${
                  myTurn && open
                    ? "bg-white/15 text-white hover:-translate-y-0.5 hover:bg-white/25 active:translate-y-0"
                    : "bg-white/5 text-white/30"
                }`}
              >
                ▾
              </button>
            );
          })}
        </div>

        {/* grid of cells */}
        <div
          className="grid gap-1.5 rounded-2xl bg-blue-700 p-1.5 shadow-pop-sm"
          style={{ gridTemplateColumns: `repeat(${v.cols}, minmax(0, 1fr))` }}
        >
          {v.board.map((rowCells, r) =>
            rowCells.map((cell, c) => {
              const disc = cell ? v.discs[cell] : null;
              const isWin = winSet.has(`${r},${c}`);
              return (
                <div
                  key={`${r}-${c}`}
                  className="grid aspect-square place-items-center rounded-full bg-blue-900/70"
                >
                  {disc && (
                    <span
                      className={`h-[88%] w-[88%] rounded-full ${DISC_BG[disc]} shadow-pop-sm ring-2 ${
                        isWin ? "ring-white animate-pop" : DISC_RING[disc]
                      } ${isWin ? "ring-4" : ""}`}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
