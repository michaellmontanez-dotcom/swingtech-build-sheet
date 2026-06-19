"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { Card } from "@/games/gin/logic";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED = new Set(["H", "D"]);

function rankLabel(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function CardFace({
  card,
  selected,
  big,
}: {
  card: Card;
  selected?: boolean;
  big?: boolean;
}) {
  const red = RED.has(card.suit);
  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-xl bg-white font-extrabold shadow-pop-sm ${
        big ? "h-28 w-20 text-3xl" : "h-24 w-16 text-2xl"
      } ${selected ? "-translate-y-2 ring-4 ring-mint" : ""} ${red ? "text-rose-600" : "text-slate-900"}`}
    >
      <span>{rankLabel(card.rank)}</span>
      <span className="text-xl">{SUIT_GLYPH[card.suit]}</span>
    </div>
  );
}

export function GinRummyView({ view, me, send, pending }: GameViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const v = view as {
    topDiscard: Card | null;
    stockCount: number;
    discardCount: number;
    activePlayerId: string;
    phase: "draw" | "discard" | "roundOver" | "gameOver";
    scores: Record<string, number>;
    target: number;
    lastRound: {
      knocker: string;
      gin: boolean;
      undercut: boolean;
      knockerDeadwood: number;
      opponentDeadwood: number;
      points: number;
      scorer: string;
    } | null;
    finished: boolean;
    winnerId: string | null;
    log: string[];
    players: { id: string; name: string; handCount: number; score: number }[];
    you: string | null;
    hand: Card[];
    melds: Card[][];
    deadwood: Card[];
    deadwoodValue: number;
    canKnock: boolean;
    justTookFromDiscard: string | null;
  };

  if (!v?.players) return <div className="p-6 text-center text-white/70">Dealing…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;
  const opponent = v.players.find((p) => p.id !== me.id);
  const meldedIds = new Set(v.melds.flat().map((c) => c.id));

  const inDraw = myTurn && v.phase === "draw";
  const inDiscard = myTurn && v.phase === "discard";
  const selectedCard = v.hand.find((c) => c.id === selected) ?? null;
  // deadwood after discarding the selected card (knock/gin eligibility)
  const canDiscardSelected =
    !!selectedCard && !(v.justTookFromDiscard && selectedCard.id === v.justTookFromDiscard);

  function discard() {
    if (!selectedCard || !canDiscardSelected) return;
    send({ type: "discard", card: selectedCard });
    setSelected(null);
  }
  function knock(kind: "knock" | "gin") {
    if (!selectedCard || !canDiscardSelected) return;
    send({ type: kind, card: selectedCard });
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* scores / opponent */}
      <div className="flex items-stretch justify-between gap-2">
        <div className="card-surface flex-1 px-3 py-2 text-center">
          <div className="text-sm font-extrabold">
            {me.emoji} {me.name}
          </div>
          <div className="text-2xl font-black text-mint">{v.scores[me.id] ?? 0}</div>
        </div>
        <div className="grid place-items-center px-2 text-xs font-bold text-white/60">
          to {v.target}
        </div>
        <div className="card-surface flex-1 px-3 py-2 text-center">
          <div className="text-sm font-extrabold">{opponent?.name ?? "Opponent"}</div>
          <div className="text-2xl font-black text-sunny">{opponent ? v.scores[opponent.id] ?? 0 : 0}</div>
          <div className="text-xs opacity-70">🂠 {opponent?.handCount ?? 0} cards</div>
        </div>
      </div>

      {/* round / game banners */}
      {v.finished && (
        <div className="card-surface bg-sunny/20 p-3 text-center text-lg font-black text-sunny">
          🏆 {v.players.find((p) => p.id === v.winnerId)?.name} wins the game!
        </div>
      )}
      {!v.finished && v.lastRound && v.phase === "roundOver" && (
        <div className="card-surface p-3 text-center font-extrabold">
          {v.lastRound.gin
            ? "GIN! 🃏"
            : v.lastRound.undercut
              ? "UNDERCUT! 😈"
              : "Knock!"}{" "}
          {v.players.find((p) => p.id === v.lastRound!.scorer)?.name} +{v.lastRound.points}
          <div className="mt-2">
            <button className="btn-pink" disabled={pending} onClick={() => send({ type: "nextRound" })}>
              Next round ▶
            </button>
          </div>
        </div>
      )}

      {/* table: stock + discard */}
      <div className="card-surface flex items-center justify-center gap-6 py-5">
        <button
          className="flex flex-col items-center disabled:opacity-50"
          disabled={!inDraw || v.stockCount === 0 || pending}
          onClick={() => send({ type: "draw", source: "stock" })}
        >
          <div className="grid h-24 w-16 place-items-center rounded-xl bg-purple-900 text-2xl font-black text-white/80 shadow-pop-sm ring-2 ring-white/20">
            🂠
          </div>
          <span className="mt-1 text-xs font-bold text-white/70">Stock ({v.stockCount})</span>
        </button>

        <button
          className="flex flex-col items-center disabled:opacity-50"
          disabled={!inDraw || !v.topDiscard || pending}
          onClick={() => send({ type: "draw", source: "discard" })}
        >
          {v.topDiscard ? (
            <CardFace card={v.topDiscard} big />
          ) : (
            <div className="grid h-28 w-20 place-items-center rounded-xl border-2 border-dashed border-white/30 text-white/40">
              empty
            </div>
          )}
          <span className="mt-1 text-xs font-bold text-white/70">Take discard</span>
        </button>
      </div>

      {/* status */}
      <div className="text-center font-extrabold">
        {v.finished ? null : myTurn ? (
          <span className="text-mint animate-pop inline-block">
            {v.phase === "draw" ? "Your turn — draw a card" : "Now discard a card"}
          </span>
        ) : (
          <span className="text-white/70">Waiting for {opponent?.name}…</span>
        )}
      </div>

      {/* deadwood + actions */}
      {v.you && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">
            Deadwood: <span className={v.deadwoodValue <= 10 ? "text-mint" : "text-white"}>{v.deadwoodValue}</span>
          </span>
          {inDiscard && (
            <>
              <button className="btn-ghost" disabled={!canDiscardSelected || pending} onClick={discard}>
                Discard ↧
              </button>
              <button
                className="btn-pink disabled:opacity-40"
                disabled={!canDiscardSelected || v.deadwoodValue > 10 || pending}
                onClick={() => knock(v.deadwoodValue === 0 ? "gin" : "knock")}
                title={v.deadwoodValue > 10 ? "Deadwood must be ≤ 10" : ""}
              >
                {v.deadwoodValue === 0 ? "GIN! 🃏" : "Knock ✊"}
              </button>
            </>
          )}
        </div>
      )}
      {inDiscard && !canDiscardSelected && (
        <div className="text-center text-xs text-white/50">
          Tap a card to select it{" "}
          {v.justTookFromDiscard ? "(you can't re-discard the card you just took)" : ""}
        </div>
      )}

      {/* my hand grouped: melds then deadwood */}
      <div className="card-surface p-3">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          Your hand · {me.emoji} {me.name}
        </div>

        {v.melds.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[10px] font-black uppercase text-mint">Melds</div>
            <div className="flex flex-col gap-2">
              {v.melds.map((meld, mi) => (
                <div key={mi} className="no-scrollbar flex gap-1 overflow-x-auto">
                  {meld.map((card) => (
                    <button
                      key={card.id}
                      disabled={pending}
                      onClick={() => setSelected((s) => (s === card.id ? null : card.id))}
                    >
                      <CardFace card={card} selected={selected === card.id} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-1 text-[10px] font-black uppercase text-rose-300">
          Deadwood ({v.deadwoodValue})
        </div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto pb-1">
          {v.hand
            .filter((c) => !meldedIds.has(c.id))
            .map((card) => (
              <button
                key={card.id}
                disabled={pending}
                onClick={() => setSelected((s) => (s === card.id ? null : card.id))}
              >
                <CardFace card={card} selected={selected === card.id} />
              </button>
            ))}
          {v.hand.length === 0 && <div className="py-6 text-white/60">No cards</div>}
        </div>
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
