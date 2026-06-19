"use client";

import type { GameViewProps } from "@/games/viewTypes";

interface MancalaView {
  type: "mancala";
  board: number[];
  stores: [number, number];
  pits: [number[], number[]];
  current: 0 | 1;
  activePlayerId: string;
  players: { id: string; name: string; seat: number }[];
  finished: boolean;
  winners: string[];
  scores: Record<string, number>;
  lastMove: { player: 0 | 1; pit: number; extraTurn: boolean; captured: number } | null;
  log: string[];
  you: string | null;
  youSeat: 0 | 1 | null;
  yourPits: number[];
  yourStore: number;
  myTurn: boolean;
  legalPits: number[];
}

function Pit({
  count,
  legal,
  highlight,
  onClick,
  disabled,
}: {
  count: number;
  legal?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled || !legal}
      onClick={onClick}
      className={`grid aspect-square w-full place-items-center rounded-full text-xl font-extrabold text-white transition ${
        legal
          ? "bg-purple-700 ring-4 ring-mint shadow-pop-sm hover:-translate-y-1 active:translate-y-0"
          : "bg-purple-900/70 ring-2 ring-white/10"
      } ${highlight ? "animate-pop bg-sunny text-purple-900" : ""}`}
    >
      <span className="drop-shadow">{count}</span>
    </button>
  );
}

function Store({ count, label, highlight }: { count: number; label: string; highlight?: boolean }) {
  return (
    <div
      className={`grid h-full min-h-[7rem] w-16 place-items-center rounded-3xl text-center text-2xl font-black text-white ring-2 ${
        highlight ? "bg-sunny text-purple-900 ring-white/40 animate-pop" : "bg-purple-900/80 ring-white/10"
      }`}
    >
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
        <div className="drop-shadow">{count}</div>
      </div>
    </div>
  );
}

export function MancalaView({ view, me, send, pending }: GameViewProps) {
  const v = view as MancalaView;
  if (!v?.board) return <div className="p-6 text-center text-white/70">Setting up the board…</div>;

  // Orient so the viewer's own pits are along the bottom.
  // Default (spectator / unknown) uses seat 0 as bottom.
  const bottomSeat: 0 | 1 = v.youSeat ?? 0;
  const topSeat: 0 | 1 = bottomSeat === 0 ? 1 : 0;

  const bottomPits = v.pits[bottomSeat];
  const topPits = v.pits[topSeat];
  const bottomStore = v.stores[bottomSeat];
  const topStore = v.stores[topSeat];

  const legalSet = new Set(v.legalPits);
  const lastPit =
    v.lastMove && v.lastMove.player === bottomSeat ? v.lastMove.pit : null;

  const bottomPlayer = v.players.find((p) => p.seat === bottomSeat);
  const topPlayer = v.players.find((p) => p.seat === topSeat);

  // Top row is shown left-to-right mirrored so it lines up across the table.
  const topPitsDisplay = [...topPits].reverse();
  const topIndexMap = topPits.map((_, k) => topPits.length - 1 - k); // display idx -> real pit idx

  const winnerNames = v.winners.map((id) => v.players.find((p) => p.id === id)?.name).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {/* status / whose turn */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            {v.winners.length === 2
              ? "🤝 It's a draw!"
              : `🏆 ${winnerNames[0]} wins!`}{" "}
            <span className="text-white/80">
              ({v.scores[v.players.find((p) => p.seat === 0)!.id]} :{" "}
              {v.scores[v.players.find((p) => p.seat === 1)!.id]})
            </span>
          </span>
        ) : v.myTurn ? (
          <span className="text-mint animate-pop inline-block">Your turn — tap a pit!</span>
        ) : (
          <span className="text-white/70">
            Waiting for {v.players.find((p) => p.id === v.activePlayerId)?.name}…
          </span>
        )}
      </div>

      {v.lastMove?.captured ? (
        <div className="rounded-2xl bg-rose-600/80 p-2 text-center font-bold">
          Captured {v.lastMove.captured} stones! 🪨
        </div>
      ) : v.lastMove?.extraTurn && !v.finished ? (
        <div className="rounded-2xl bg-emerald-600/80 p-2 text-center font-bold animate-pop">
          Go again! 🎉
        </div>
      ) : null}

      {/* board */}
      <div className="card-surface p-3">
        {/* opponent label */}
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          {topPlayer?.name}
          {v.activePlayerId === topPlayer?.id && !v.finished ? " · their turn" : ""}
        </div>

        <div className="flex items-stretch gap-2">
          {/* opponent's store on the left */}
          <Store
            count={topStore}
            label={topPlayer?.name ?? "Opp"}
            highlight={v.activePlayerId === topPlayer?.id && !v.finished}
          />

          {/* the two rows of six pits */}
          <div className="flex flex-1 flex-col gap-2">
            {/* top row (opponent), mirrored */}
            <div className="grid grid-cols-6 gap-2">
              {topPitsDisplay.map((count, k) => (
                <Pit
                  key={`top-${k}`}
                  count={count}
                  legal={false}
                  highlight={v.lastMove?.player === topSeat && v.lastMove?.pit === topIndexMap[k]}
                />
              ))}
            </div>
            {/* bottom row (you) */}
            <div className="grid grid-cols-6 gap-2">
              {bottomPits.map((count, k) => (
                <Pit
                  key={`bot-${k}`}
                  count={count}
                  legal={v.myTurn && legalSet.has(k)}
                  highlight={lastPit === k}
                  disabled={pending}
                  onClick={() => send({ type: "sow", pit: k })}
                />
              ))}
            </div>
          </div>

          {/* your store on the right */}
          <Store
            count={bottomStore}
            label={bottomPlayer?.name ?? "You"}
            highlight={v.myTurn}
          />
        </div>

        {/* your label */}
        <div className="mt-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          {me.emoji} {bottomPlayer?.name ?? me.name} (you)
        </div>
      </div>

      {/* scores */}
      <div className="flex justify-around text-center font-extrabold">
        <div>
          <div className="text-xs uppercase text-white/60">{bottomPlayer?.name}</div>
          <div className="text-2xl text-sunny">{bottomStore}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-white/60">{topPlayer?.name}</div>
          <div className="text-2xl text-white/80">{topStore}</div>
        </div>
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
