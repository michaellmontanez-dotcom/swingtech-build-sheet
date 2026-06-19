"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { UnoCard, UnoColor } from "@/games/uno/logic";

const COLOR_BG: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  wild: "bg-gradient-to-br from-red-500 via-yellow-400 to-blue-500",
};
const COLOR_RING: Record<string, string> = {
  red: "ring-red-400",
  yellow: "ring-yellow-300",
  green: "ring-green-400",
  blue: "ring-blue-400",
};

function label(card: UnoCard): string {
  switch (card.kind) {
    case "number": return String(card.value);
    case "skip": return "⊘";
    case "reverse": return "⇄";
    case "draw2": return "+2";
    case "wild": return "🌈";
    case "wild4": return "+4";
  }
}

function CardFace({ card, color, big }: { card: UnoCard; color?: string; big?: boolean }) {
  const shown = card.color === "wild" ? "wild" : card.color;
  return (
    <div
      className={`relative grid place-items-center rounded-xl ${COLOR_BG[shown]} ${
        big ? "h-28 w-20 text-4xl" : "h-24 w-16 text-3xl"
      } font-extrabold text-white shadow-pop-sm`}
    >
      <span className="drop-shadow">{label(card)}</span>
      {card.color === "wild" && color && (
        <span className={`absolute bottom-1 h-3 w-3 rounded-full ${COLOR_BG[color]} ring-2 ring-white`} />
      )}
    </div>
  );
}

export function UnoView({ view, me, send, pending }: GameViewProps) {
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const v = view as {
    top: UnoCard;
    currentColor: UnoColor;
    activePlayerId: string;
    drawPileCount: number;
    pendingDraw: number;
    pendingKind: string | null;
    drewThisTurn: boolean;
    stacking: boolean;
    finished: boolean;
    winnerId: string | null;
    log: string[];
    players: { id: string; name: string; handCount: number; saidUno: boolean }[];
    you: string | null;
    hand: UnoCard[];
    playable: string[];
  };
  if (!v?.top) return <div className="p-6 text-center text-white/70">Dealing…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;
  const playableSet = new Set(v.playable);

  function play(card: UnoCard) {
    if (card.color === "wild") {
      setPendingWild(card.id);
      return;
    }
    send({ type: "play", cardId: card.id });
  }
  function chooseColor(color: UnoColor) {
    if (!pendingWild) return;
    send({ type: "play", cardId: pendingWild, chosenColor: color });
    setPendingWild(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* opponents */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {v.players
          .filter((p) => p.id !== me.id)
          .map((p) => (
            <div
              key={p.id}
              className={`flex-none rounded-2xl px-3 py-2 text-center ${
                p.id === v.activePlayerId ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10"
              }`}
            >
              <div className="text-sm font-extrabold">{p.name}</div>
              <div className="text-xs opacity-80">🂠 {p.handCount}</div>
              {p.saidUno && <div className="text-[10px] font-black text-rose-300">UNO!</div>}
              {p.handCount === 1 && !p.saidUno && (
                <button
                  className="mt-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black"
                  onClick={() => send({ type: "callUno", targetId: p.id })}
                >
                  Catch! 😈
                </button>
              )}
            </div>
          ))}
      </div>

      {/* table center */}
      <div className="card-surface flex items-center justify-center gap-6 py-6">
        <button
          className="flex flex-col items-center"
          disabled={!myTurn || pending}
          onClick={() => send({ type: "draw" })}
        >
          <div className="grid h-24 w-16 place-items-center rounded-xl bg-purple-900 text-2xl font-black text-white/80 shadow-pop-sm ring-2 ring-white/20">
            🂠
          </div>
          <span className="mt-1 text-xs font-bold text-white/70">Draw ({v.drawPileCount})</span>
        </button>

        <div className="flex flex-col items-center">
          <CardFace card={v.top} color={v.currentColor} big />
          <div className={`mt-2 h-4 w-16 rounded-full ${COLOR_BG[v.currentColor]} ring-2 ring-white/40`} />
        </div>
      </div>

      {v.pendingDraw > 0 && (
        <div className="rounded-2xl bg-rose-600/80 p-2 text-center font-bold">
          Stacked penalty: +{v.pendingDraw} {v.stacking ? "— stack or draw!" : ""}
        </div>
      )}

      {/* status */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            🏆 {v.players.find((p) => p.id === v.winnerId)?.name} wins!
          </span>
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">Your turn!</span>
        ) : (
          <span className="text-white/70">
            Waiting for {v.players.find((p) => p.id === v.activePlayerId)?.name}…
          </span>
        )}
      </div>

      {/* my actions */}
      {myTurn && !v.finished && (
        <div className="flex flex-wrap justify-center gap-2">
          {v.drewThisTurn && v.pendingDraw === 0 && (
            <button className="btn-ghost" onClick={() => send({ type: "pass" })} disabled={pending}>
              Pass ▶
            </button>
          )}
          {v.hand.length <= 2 && (
            <button className="btn-pink" onClick={() => send({ type: "uno" })} disabled={pending}>
              Shout UNO! ✋
            </button>
          )}
        </div>
      )}

      {/* my hand */}
      <div className="card-surface p-3">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          Your hand · {me.emoji} {me.name}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {v.hand.map((card) => {
            const canPlay = myTurn && playableSet.has(card.id);
            return (
              <button
                key={card.id}
                disabled={!canPlay || pending}
                onClick={() => play(card)}
                className={`flex-none transition ${canPlay ? "hover:-translate-y-2 -translate-y-1" : "opacity-60"}`}
              >
                <CardFace card={card} />
              </button>
            );
          })}
          {v.hand.length === 0 && <div className="py-6 text-white/60">No cards 🎉</div>}
        </div>
      </div>

      {/* wild color picker */}
      {pendingWild && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6" onClick={() => setPendingWild(null)}>
          <div className="card-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-lg font-extrabold">Pick a color</p>
            <div className="grid grid-cols-2 gap-3">
              {(["red", "yellow", "green", "blue"] as UnoColor[]).map((c) => (
                <button
                  key={c}
                  onClick={() => chooseColor(c)}
                  className={`h-20 w-20 rounded-2xl ${COLOR_BG[c]} ring-4 ${COLOR_RING[c]} shadow-pop active:translate-y-1`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
