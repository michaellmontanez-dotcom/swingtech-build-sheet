"use client";

import { useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { UnoCard, UnoColor } from "@/games/uno/logic";
import { Fireworks } from "@/components/Fireworks";
import { playSound } from "@/lib/sound";

const COLOR_BG: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  wild: "bg-gradient-to-br from-red-500 via-yellow-400 to-green-500",
};
const COLOR_RING: Record<string, string> = {
  red: "ring-red-300",
  yellow: "ring-yellow-200",
  green: "ring-green-300",
  blue: "ring-blue-300",
};
const COLOR_NAME: Record<string, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };

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
function sublabel(card: UnoCard): string {
  switch (card.kind) {
    case "draw2": return "Draw 2";
    case "wild4": return "Wild +4";
    case "wild": return "Wild";
    case "skip": return "Skip";
    case "reverse": return "Reverse";
    default: return "";
  }
}

// Order a hand by color then kind/value so it's easy to scan and play.
const COLOR_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
const KIND_ORDER: Record<string, number> = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 };
function sortHand(cards: UnoCard[]): UnoCard[] {
  return [...cards].sort((a, b) =>
    COLOR_ORDER[a.color] - COLOR_ORDER[b.color] ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.value ?? 0) - (b.value ?? 0)
  );
}

function CardFace({ card, color, big }: { card: UnoCard; color?: string; big?: boolean }) {
  const shown = card.color === "wild" ? "wild" : card.color;
  const sub = sublabel(card);
  return (
    <div
      className={`relative grid place-items-center overflow-hidden rounded-2xl border-2 border-white/80 ${COLOR_BG[shown]} ${
        big ? "h-32 w-24" : "h-28 w-20"
      } font-extrabold text-white shadow-pop-sm`}
    >
      {/* glossy oval, like a real Uno card */}
      <span className="pointer-events-none absolute inset-0 m-auto h-[120%] w-[55%] rotate-45 rounded-full bg-white/25" />
      <span className={`absolute left-1.5 top-1 ${big ? "text-base" : "text-sm"} drop-shadow`}>{label(card)}</span>
      <span className={`absolute bottom-1 right-1.5 rotate-180 ${big ? "text-base" : "text-sm"} drop-shadow`}>{label(card)}</span>
      <span className={`relative drop-shadow ${big ? "text-5xl" : "text-4xl"}`}>{label(card)}</span>
      {sub && <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] uppercase tracking-wide drop-shadow">{sub}</span>}
      {card.color === "wild" && color && (
        <span className={`absolute right-1.5 top-1.5 h-4 w-4 rounded-full ${COLOR_BG[color]} ring-2 ring-white`} />
      )}
    </div>
  );
}

function CardBack({ big }: { big?: boolean }) {
  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-2xl border-2 border-white/80 bg-purple-900 ${big ? "h-32 w-24" : "h-24 w-16"} shadow-pop-sm`}>
      <span className="pointer-events-none absolute inset-0 m-auto h-[130%] w-[55%] rotate-45 rounded-full bg-red-500/80" />
      <span className="relative -rotate-12 text-lg font-black italic tracking-tight text-yellow-300 drop-shadow">UNO</span>
    </div>
  );
}

export function UnoView({ view, me, send, pending, players }: GameViewProps) {
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const v = view as {
    top: UnoCard;
    currentColor: UnoColor;
    direction: 1 | -1;
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
  const emojiOf = (id: string) => players.find((p) => p.id === id)?.emoji ?? "🎲";
  const nameOf = (id: string) => v.players.find((p) => p.id === id)?.name ?? "Player";
  const hand = sortHand(v.hand);

  // Play sounds on real state changes (covers both your and opponents' moves).
  const prev = useRef<{ topId: string; myTurn: boolean; finished: boolean; unoCount: number } | null>(null);
  useEffect(() => {
    if (!v?.top) return;
    const unoCount = v.players.filter((p) => p.saidUno).length;
    const p = prev.current;
    if (p) {
      if (v.finished && !p.finished) {
        playSound(v.winnerId === me.id ? "win" : "lose");
      } else if (v.top.id !== p.topId) {
        const k = v.top.kind;
        playSound(k === "skip" || k === "reverse" || k === "draw2" || k === "wild4" ? "special" : "play");
      }
      if (myTurn && !p.myTurn && !v.finished) playSound("turn");
      if (unoCount > p.unoCount) playSound("uno");
    }
    prev.current = { topId: v.top.id, myTurn, finished: v.finished, unoCount };
  }, [v, myTurn, me.id]);

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
      {/* turn-order strip (everyone, in play order) */}
      <div className="no-scrollbar flex items-stretch gap-2 overflow-x-auto pb-1">
        {v.players.map((p) => {
          const active = p.id === v.activePlayerId && !v.finished;
          const isMe = p.id === me.id;
          return (
            <div
              key={p.id}
              className={`relative flex-none rounded-2xl px-3 py-2 text-center transition ${
                active ? "bg-sunny text-purple-900 ring-2 ring-white shadow-pop-sm" : "bg-white/10"
              }`}
            >
              {active && <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-xs">🔻</span>}
              <div className="text-2xl leading-none">{emojiOf(p.id)}</div>
              <div className="mt-0.5 text-xs font-extrabold">{isMe ? "You" : p.name}</div>
              <div className="text-[11px] font-bold opacity-80">🃏 {p.handCount}</div>
              {p.handCount === 1 && p.saidUno && (
                <div className="text-[10px] font-black text-rose-500">UNO!</div>
              )}
              {!isMe && p.handCount === 1 && !p.saidUno && !v.finished && (
                <button
                  className="mt-1 block w-full rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white active:translate-y-0.5"
                  onClick={() => send({ type: "callUno", targetId: p.id })}
                >
                  Catch! 😈
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* table center: draw pile + discard + current color + direction */}
      <div className="card-surface relative flex items-center justify-center gap-8 py-6">
        <span className="absolute right-3 top-3 text-2xl" title="play direction">
          {v.direction === 1 ? "↻" : "↺"}
        </span>

        <button
          className="flex flex-col items-center disabled:opacity-60"
          disabled={!myTurn || pending}
          onClick={() => {
            playSound("draw");
            send({ type: "draw" });
          }}
        >
          <CardBack />
          <span className="mt-1 text-xs font-bold text-white/80">Draw · {v.drawPileCount}</span>
        </button>

        <div className="flex flex-col items-center">
          <div key={v.top.id + v.currentColor} className="animate-pop">
            <CardFace card={v.top} color={v.currentColor} big />
          </div>
          <div className={`mt-2 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${COLOR_BG[v.currentColor]} text-white ring-2 ring-white/50`}>
            {COLOR_NAME[v.currentColor]}
          </div>
        </div>
      </div>

      {v.pendingDraw > 0 && (
        <div className="animate-pop rounded-2xl bg-rose-600/90 p-2 text-center font-extrabold">
          ⚠️ Stacked penalty: +{v.pendingDraw}{v.stacking ? " — stack a matching card or draw!" : ""}
        </div>
      )}

      {/* status + what-to-do guidance */}
      {!v.finished && (
        <div className="text-center">
          {myTurn ? (
            <div>
              <div className="text-xl font-extrabold text-mint">Your turn!</div>
              <div className="text-sm text-white/80">
                {v.pendingDraw > 0
                  ? v.stacking
                    ? `Stack a ${v.pendingKind === "draw4" ? "+4" : "+2"} or tap the deck to draw ${v.pendingDraw}`
                    : `Tap the deck to draw ${v.pendingDraw}`
                  : v.drewThisTurn
                    ? "Play the card you drew, or Pass"
                    : playableSet.size > 0
                      ? "Tap a glowing card to play"
                      : "No matches — tap the deck to Draw"}
              </div>
            </div>
          ) : (
            <span className="font-bold text-white/70">
              {emojiOf(v.activePlayerId)} Waiting for {nameOf(v.activePlayerId)}…
            </span>
          )}
        </div>
      )}

      {/* my actions */}
      {myTurn && (
        <div className="flex flex-wrap justify-center gap-2">
          {v.drewThisTurn && v.pendingDraw === 0 && (
            <button className="btn-ghost" onClick={() => send({ type: "pass" })} disabled={pending}>
              Pass ▶
            </button>
          )}
          {hand.length <= 2 && (
            <button className="btn-pink animate-pop" onClick={() => send({ type: "uno" })} disabled={pending}>
              Shout UNO! ✋
            </button>
          )}
        </div>
      )}

      {/* my hand */}
      <div className="card-surface p-3">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          Your hand · {me.emoji} {me.name} · {hand.length}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-3 pt-2">
          {hand.map((card) => {
            const canPlay = myTurn && playableSet.has(card.id);
            return (
              <button
                key={card.id}
                disabled={!canPlay || pending}
                onClick={() => play(card)}
                className={`flex-none rounded-2xl transition ${
                  canPlay ? "-translate-y-2 ring-4 ring-sunny shadow-pop" : myTurn ? "opacity-40" : "opacity-90"
                }`}
              >
                <CardFace card={card} />
              </button>
            );
          })}
          {hand.length === 0 && <div className="py-6 text-white/60">No cards 🎉</div>}
        </div>
      </div>

      {/* last action */}
      <div className="mx-auto max-w-xs rounded-full bg-black/25 px-4 py-1.5 text-center text-sm font-semibold text-white/90">
        {v.log[v.log.length - 1]}
      </div>

      {/* wild color picker */}
      {pendingWild && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6" onClick={() => setPendingWild(null)}>
          <div className="card-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-lg font-extrabold">Pick a color 🌈</p>
            <div className="grid grid-cols-2 gap-3">
              {(["red", "yellow", "green", "blue"] as UnoColor[]).map((c) => (
                <button
                  key={c}
                  onClick={() => chooseColor(c)}
                  className={`grid h-24 w-24 place-items-end justify-center rounded-2xl ${COLOR_BG[c]} ring-4 ${COLOR_RING[c]} pb-2 text-sm font-black text-white shadow-pop active:translate-y-1`}
                >
                  {COLOR_NAME[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* winner celebration */}
      {v.finished && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/70 p-6">
          <Fireworks />
          <div className="animate-pop card-surface relative z-40 px-8 py-10 text-center">
            <div className="animate-bounce text-7xl">🏆</div>
            <div className="mt-3 text-3xl font-extrabold text-sunny">
              {v.winnerId === me.id ? "You win! 🎉" : `${nameOf(v.winnerId ?? "")} wins!`}
            </div>
            <div className="mt-1 text-white/70">{v.winnerId === me.id ? "Hand emptied — nicely played." : "Better luck next round!"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
