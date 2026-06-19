"use client";

import { useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  UPPER_CATEGORIES,
  type Category,
  type ScoreCard,
} from "@/games/yahtzee/logic";

const DIE_PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

interface PlayerSummary {
  id: string;
  name: string;
  card: ScoreCard;
  upperSubtotal: number;
  upperBonus: number;
  yahtzeeBonus: number;
  total: number;
}

interface YahtzeeViewModel {
  type: "yahtzee";
  activePlayerId: string;
  dice: number[];
  kept: boolean[];
  rollsUsed: number;
  rollsLeft: number;
  maxRolls: number;
  finished: boolean;
  log: string[];
  players: PlayerSummary[];
  winners: string[];
  you: string | null;
  myTurn: boolean;
  canRoll: boolean;
  canScore: boolean;
  available: Partial<Record<Category, number>>;
}

function Die({
  face,
  kept,
  rolled,
  disabled,
  onToggle,
}: {
  face: number;
  kept: boolean;
  rolled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onToggle}
      className={`grid h-16 w-16 place-items-center rounded-2xl text-5xl shadow-pop-sm transition active:translate-y-1 ${
        kept ? "bg-sunny text-purple-900 ring-4 ring-amber-300" : "bg-white text-purple-900"
      } ${disabled ? "opacity-70" : "hover:-translate-y-1"}`}
    >
      <span>{rolled ? DIE_PIPS[face] : "·"}</span>
    </button>
  );
}

export function YahtzeeView({ view, me, send, pending }: GameViewProps) {
  const v = view as YahtzeeViewModel;

  // Keep-draft: which dice the player has toggled to keep for the next re-roll.
  // Re-initialised from the server's kept flags whenever the dice change.
  const [keepDraft, setKeepDraft] = useState<boolean[]>([false, false, false, false, false]);
  const sig = v ? `${v.activePlayerId}:${v.rollsUsed}:${v.dice.join(",")}` : "";
  const lastSig = useRef<string>("");
  useEffect(() => {
    if (v && lastSig.current !== sig) {
      lastSig.current = sig;
      setKeepDraft([...v.kept]);
    }
  }, [sig, v]);

  if (!v?.players) return <div className="p-6 text-center text-white/70">Loading…</div>;

  const you = v.you ?? me.id;
  const myTurn = v.myTurn;
  const rolled = v.rollsUsed > 0;
  const mySummary = v.players.find((p) => p.id === you);
  const activeName = v.players.find((p) => p.id === v.activePlayerId)?.name ?? "…";

  function toggleKeep(i: number) {
    if (!myTurn || !rolled) return;
    setKeepDraft((d) => d.map((k, idx) => (idx === i ? !k : k)));
  }

  function roll() {
    const keep: number[] = [];
    for (let i = 0; i < 5; i++) if (keepDraft[i]) keep.push(i);
    send({ type: "roll", keep: v.rollsUsed === 0 ? [] : keep });
  }

  function score(category: Category) {
    if (!v.canScore) return;
    send({ type: "score", category });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* status */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            🏆 {v.winners.map((id) => v.players.find((p) => p.id === id)?.name).join(" & ")} win
            {v.winners.length > 1 ? " (tie)" : "s"}!
          </span>
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">
            Your turn · {v.rollsLeft} roll{v.rollsLeft === 1 ? "" : "s"} left
          </span>
        ) : (
          <span className="text-white/70">Waiting for {activeName}…</span>
        )}
      </div>

      {/* dice */}
      <div className="card-surface flex flex-col items-center gap-3 py-5">
        <div className="flex gap-2">
          {v.dice.map((face, i) => (
            <Die
              key={i}
              face={face}
              rolled={rolled}
              kept={keepDraft[i]}
              disabled={!myTurn || !rolled || pending}
              onToggle={() => toggleKeep(i)}
            />
          ))}
        </div>
        {rolled && myTurn && (
          <p className="text-xs font-bold text-white/60">Tap dice to keep · re-roll the rest</p>
        )}
        <button
          className="btn-pink disabled:opacity-50"
          disabled={!v.canRoll || pending}
          onClick={roll}
        >
          🎲 Roll ({v.rollsLeft} left)
        </button>
      </div>

      {/* my scorecard */}
      {mySummary && (
        <div className="card-surface p-3">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
            {me.emoji} {me.name} · {mySummary.total} pts
          </div>
          <div className="grid grid-cols-1 gap-1">
            {CATEGORIES.map((cat) => {
              const filled = mySummary.card[cat];
              const open = filled === null;
              const preview = v.available[cat];
              const pickable = open && v.canScore;
              return (
                <button
                  key={cat}
                  disabled={!pickable || pending}
                  onClick={() => score(cat)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold ${
                    open
                      ? pickable
                        ? "bg-white/10 hover:bg-mint/30 active:translate-y-0.5"
                        : "bg-white/5 text-white/50"
                      : "bg-emerald-600/30 text-emerald-100"
                  } ${UPPER_CATEGORIES.includes(cat) ? "" : "border-t border-white/5"}`}
                >
                  <span>{CATEGORY_LABELS[cat]}</span>
                  <span className="font-black">
                    {open ? (pickable ? `+${preview ?? 0}` : "—") : filled}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between px-3 text-xs text-white/60">
            <span>
              Upper {mySummary.upperSubtotal}/63
              {mySummary.upperBonus > 0 ? " · +35 bonus 🎉" : ""}
            </span>
            {mySummary.yahtzeeBonus > 0 && <span>Yahtzee bonus +{mySummary.yahtzeeBonus}</span>}
          </div>
        </div>
      )}

      {/* opponents totals */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {v.players
          .filter((p) => p.id !== you)
          .map((p) => (
            <div
              key={p.id}
              className={`flex-none rounded-2xl px-3 py-2 text-center ${
                p.id === v.activePlayerId ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10"
              }`}
            >
              <div className="text-sm font-extrabold">{p.name}</div>
              <div className="text-xs opacity-80">{p.total} pts</div>
            </div>
          ))}
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
