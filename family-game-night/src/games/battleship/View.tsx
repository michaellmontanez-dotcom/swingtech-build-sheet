"use client";

import { useMemo, useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import { FLEET, BOARD_SIZE, type Cell } from "@/games/battleship/logic";

// ---- shapes of the redacted view we receive from logic.getPlayerView -------
type Shot = { r: number; c: number; hit: boolean };
type PublicShip = { name: string; size: number; sunk: boolean; cells: Cell[] | null };
type PublicBoard = {
  playerId: string;
  name: string;
  ready: boolean;
  shots: Shot[];
  ships: PublicShip[];
  shipsRemaining: number;
};
type OwnBoard = PublicBoard & {
  ownShips: { name: string; cells: Cell[]; hits: boolean[] }[];
};
type View = {
  phase: "placement" | "firing" | "finished";
  activePlayerId: string | null;
  finished: boolean;
  winnerId: string | null;
  you: string | null;
  boardSize: number;
  log: string[];
  players: { id: string; name: string; ready: boolean }[];
  myBoard: OwnBoard | null;
  opponentBoard: PublicBoard | null;
};

const LETTERS = "ABCDEFGHIJ".split("");
const key = (r: number, c: number) => `${r},${c}`;

// ---------------------------------------------------------------------------
// Placement editor — local, tap-to-place with a rotate toggle + auto-place.
// ---------------------------------------------------------------------------
function PlacementBoard({
  send,
  pending,
}: {
  send: GameViewProps["send"];
  pending: boolean;
}) {
  const [horizontal, setHorizontal] = useState(true);
  const [placed, setPlaced] = useState<{ name: string; cells: Cell[] }[]>([]);

  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const ship of placed) for (const [r, c] of ship.cells) set.add(key(r, c));
    return set;
  }, [placed]);

  const nextSpec = FLEET[placed.length] ?? null;
  const done = placed.length === FLEET.length;

  function cellsFor(r0: number, c0: number, size: number): Cell[] | null {
    const cells: Cell[] = [];
    for (let i = 0; i < size; i++) {
      const r = horizontal ? r0 : r0 + i;
      const c = horizontal ? c0 + i : c0;
      if (r >= BOARD_SIZE || c >= BOARD_SIZE) return null;
      if (occupied.has(key(r, c))) return null;
      cells.push([r, c]);
    }
    return cells;
  }

  function tap(r: number, c: number) {
    if (!nextSpec) return;
    const cells = cellsFor(r, c, nextSpec.size);
    if (!cells) return;
    setPlaced((p) => [...p, { name: nextSpec.name, cells }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-sm font-bold text-white/80">
        {done ? (
          "Fleet ready — confirm below."
        ) : (
          <>
            Place your <span className="text-sunny">{nextSpec!.name}</span> (
            {nextSpec!.size} cells)
          </>
        )}
      </div>

      <div className="flex justify-center gap-2">
        <button
          className="btn-ghost text-sm"
          onClick={() => setHorizontal((h) => !h)}
          disabled={done}
        >
          Rotate: {horizontal ? "↔ Horizontal" : "↕ Vertical"}
        </button>
        <button
          className="btn-ghost text-sm"
          onClick={() => setPlaced([])}
          disabled={placed.length === 0}
        >
          Clear
        </button>
        <button
          className="btn-ghost text-sm"
          onClick={() => send({ type: "autoplace" })}
          disabled={pending}
        >
          🎲 Auto
        </button>
      </div>

      <Grid
        onCell={done ? undefined : tap}
        render={(r, c) => {
          const mine = occupied.has(key(r, c));
          return (
            <div
              className={`grid h-full w-full place-items-center rounded-[3px] ${
                mine ? "bg-slate-400" : "bg-blue-900/60"
              }`}
            />
          );
        }}
      />

      <button
        className="btn-pink mx-auto"
        disabled={!done || pending}
        onClick={() => send({ type: "place", ships: placed })}
      >
        ⚓ Ready!
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic 10x10 grid with row/col labels.
// ---------------------------------------------------------------------------
function Grid({
  onCell,
  render,
}: {
  onCell?: (r: number, c: number) => void;
  render: (r: number, c: number) => React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-sm select-none">
      <div className="grid" style={{ gridTemplateColumns: `1.2rem repeat(${BOARD_SIZE}, 1fr)` }}>
        <div />
        {LETTERS.map((l) => (
          <div key={l} className="text-center text-[10px] font-bold text-white/50">
            {l}
          </div>
        ))}
        {Array.from({ length: BOARD_SIZE }).map((_, r) => (
          <Row key={r} r={r} onCell={onCell} render={render} />
        ))}
      </div>
    </div>
  );
}

function Row({
  r,
  onCell,
  render,
}: {
  r: number;
  onCell?: (r: number, c: number) => void;
  render: (r: number, c: number) => React.ReactNode;
}) {
  return (
    <>
      <div className="grid place-items-center text-[10px] font-bold text-white/50">{r + 1}</div>
      {Array.from({ length: BOARD_SIZE }).map((_, c) => (
        <button
          key={c}
          disabled={!onCell}
          onClick={() => onCell?.(r, c)}
          className="aspect-square p-[1px]"
        >
          {render(r, c)}
        </button>
      ))}
    </>
  );
}

// Build quick lookups for shots + sunk cells.
function shotMap(shots: Shot[]) {
  const m = new Map<string, boolean>();
  for (const s of shots) m.set(key(s.r, s.c), s.hit);
  return m;
}
function sunkCellSet(ships: PublicShip[]) {
  const set = new Set<string>();
  for (const ship of ships) if (ship.sunk && ship.cells) for (const [r, c] of ship.cells) set.add(key(r, c));
  return set;
}

export function BattleshipView({ view, me, send, pending, error }: GameViewProps) {
  const v = view as View;
  if (!v) return <div className="p-6 text-center text-white/70">Loading…</div>;

  const myTurn = v.activePlayerId === me.id && v.phase === "firing" && !v.finished;
  const opp = v.players.find((p) => p.id !== me.id);

  // ---- PLACEMENT PHASE ----
  if (v.phase === "placement") {
    const iAmReady = v.myBoard?.ready;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-center text-lg font-extrabold text-sunny">Position your fleet 🚢</h2>
        {iAmReady ? (
          <div className="card-surface p-6 text-center">
            <p className="text-lg font-bold text-mint">Fleet locked in! ⚓</p>
            <p className="mt-2 text-sm text-white/70">
              Waiting for {opp?.name ?? "your opponent"} to finish placing…
            </p>
          </div>
        ) : (
          <PlacementBoard send={send} pending={pending} />
        )}
        <PlayerStrip players={v.players} meId={me.id} />
        {error && <p className="text-center text-sm font-bold text-rose-300">{error}</p>}
      </div>
    );
  }

  // ---- FIRING / FINISHED PHASE ----
  const oppBoard = v.opponentBoard;
  const myBoard = v.myBoard;
  const oppShots = oppBoard ? shotMap(oppBoard.shots) : new Map<string, boolean>();
  const oppSunk = oppBoard ? sunkCellSet(oppBoard.ships) : new Set<string>();
  const myShots = myBoard ? shotMap(myBoard.shots) : new Map<string, boolean>();
  const myShipCells = useMemo(() => {
    const set = new Set<string>();
    if (myBoard) for (const s of myBoard.ownShips) for (const [r, c] of s.cells) set.add(key(r, c));
    return set;
  }, [myBoard]);

  return (
    <div className="flex flex-col gap-4">
      {/* status banner */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            {v.winnerId === me.id ? "🏆 Victory! Enemy fleet sunk!" : "💀 Defeat — your fleet was destroyed."}
          </span>
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">Your turn — fire! 🎯</span>
        ) : (
          <span className="text-white/70">Waiting for {opp?.name ?? "opponent"}…</span>
        )}
      </div>

      {/* opponent's waters — tap to fire */}
      <div className="card-surface p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-white/60">
          <span>🎯 {opp?.name ?? "Enemy"} waters</span>
          <span>{oppBoard ? `${oppBoard.shipsRemaining} ships left` : ""}</span>
        </div>
        <Grid
          onCell={
            myTurn
              ? (r, c) => {
                  if (oppShots.has(key(r, c)) || pending) return;
                  send({ type: "fire", r, c });
                }
              : undefined
          }
          render={(r, c) => {
            const k = key(r, c);
            const fired = oppShots.has(k);
            const hit = oppShots.get(k);
            const sunk = oppSunk.has(k);
            return (
              <div
                className={`grid h-full w-full place-items-center rounded-[3px] text-[10px] ${
                  sunk ? "bg-red-700" : hit ? "bg-rose-500" : fired ? "bg-slate-600" : "bg-blue-700/60"
                }`}
              >
                {sunk ? "💀" : hit ? "🔥" : fired ? "•" : ""}
              </div>
            );
          }}
        />
      </div>

      {/* my fleet — incoming fire */}
      <div className="card-surface p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-white/60">
          <span>⚓ Your fleet · {me.emoji} {me.name}</span>
          <span>{myBoard ? `${myBoard.shipsRemaining} ships left` : ""}</span>
        </div>
        <Grid
          render={(r, c) => {
            const k = key(r, c);
            const ship = myShipCells.has(k);
            const fired = myShots.has(k);
            const hit = myShots.get(k);
            return (
              <div
                className={`grid h-full w-full place-items-center rounded-[3px] text-[10px] ${
                  hit ? "bg-rose-600" : fired ? "bg-slate-600" : ship ? "bg-slate-400" : "bg-blue-900/60"
                }`}
              >
                {hit ? "🔥" : fired ? "•" : ""}
              </div>
            );
          }}
        />
      </div>

      {error && <p className="text-center text-sm font-bold text-rose-300">{error}</p>}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}

function PlayerStrip({
  players,
  meId,
}: {
  players: { id: string; name: string; ready: boolean }[];
  meId: string;
}) {
  return (
    <div className="flex justify-center gap-3">
      {players.map((p) => (
        <div
          key={p.id}
          className={`rounded-2xl px-3 py-2 text-center ${p.ready ? "bg-mint/20" : "bg-white/10"}`}
        >
          <div className="text-sm font-extrabold">
            {p.name}
            {p.id === meId ? " (you)" : ""}
          </div>
          <div className="text-xs opacity-80">{p.ready ? "Ready ✅" : "Placing…"}</div>
        </div>
      ))}
    </div>
  );
}
