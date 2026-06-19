"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";
import type { Card, PassDirection, Phase } from "@/games/hearts/logic";

const SUIT_SYMBOL: Record<string, string> = { C: "♣", D: "♦", S: "♠", H: "♥" };
const SUIT_RED: Record<string, boolean> = { C: false, D: true, S: false, H: true };

const PASS_LABEL: Record<PassDirection, string> = {
  left: "Pass LEFT ◀",
  right: "Pass RIGHT ▶",
  across: "Pass ACROSS ⇅",
  none: "No pass this hand",
};

function rankLabel(r: number): string {
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  if (r === 14) return "A";
  return String(r);
}

function CardFace({
  card,
  selected,
  dim,
  big,
}: {
  card: Card;
  selected?: boolean;
  dim?: boolean;
  big?: boolean;
}) {
  const red = SUIT_RED[card.suit];
  return (
    <div
      className={`relative grid place-items-center rounded-xl bg-white ${
        big ? "h-24 w-16 text-2xl" : "h-20 w-14 text-xl"
      } font-extrabold shadow-pop-sm ${selected ? "ring-4 ring-mint -translate-y-2" : "ring-1 ring-black/10"} ${
        dim ? "opacity-50" : ""
      } ${red ? "text-rose-600" : "text-gray-900"}`}
    >
      <span>{rankLabel(card.rank)}</span>
      <span className="text-base leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}

interface PlayerRow {
  id: string;
  name: string;
  handCount: number;
  score: number;
  pointsThisHand: number;
  tricksTaken: number;
  hasPassed: boolean;
}

export function HeartsView({ view, me, send, pending }: GameViewProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const v = view as {
    phase: Phase;
    handNumber: number;
    passDirection: PassDirection;
    heartsBroken: boolean;
    activePlayerId: string | null;
    leaderId: string | null;
    currentTrick: { playerId: string; card: Card }[];
    lastTrickWinner: string | null;
    lastTrickPoints: number;
    handResult: Record<string, number> | null;
    shotTheMoon: string | null;
    winners: string[];
    log: string[];
    players: PlayerRow[];
    you: string | null;
    hand: Card[];
    myPass: Card[] | null;
    hasPassed: boolean;
    playable: string[];
  };
  if (!v?.players) return <div className="p-6 text-center text-white/70">Dealing…</div>;

  const nameOf = (id: string | null) => v.players.find((p) => p.id === id)?.name ?? "—";
  const myTurn = v.phase === "playing" && v.activePlayerId === me.id;
  const playableSet = new Set(v.playable);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur;
      return [...cur, id];
    });
  }

  function submitPass() {
    if (selected.length !== 3) return;
    send({ type: "pass", cards: selected });
    setSelected([]);
  }

  function playCard(card: Card) {
    if (!myTurn || !playableSet.has(card.id)) return;
    send({ type: "play", card: card.id });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* scoreboard */}
      <div className="grid grid-cols-4 gap-2">
        {v.players.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl px-2 py-2 text-center ${
              p.id === v.activePlayerId ? "bg-sunny text-purple-900 animate-pop" : "bg-white/10"
            }`}
          >
            <div className="truncate text-sm font-extrabold">
              {p.name}
              {p.id === me.id ? " (you)" : ""}
            </div>
            <div className="text-lg font-black">{p.score}</div>
            <div className="text-[10px] opacity-80">
              🂠 {p.handCount}
              {p.pointsThisHand > 0 ? ` · +${p.pointsThisHand}` : ""}
            </div>
            {p.id === v.leaderId && v.phase === "playing" && (
              <div className="text-[9px] font-bold text-mint">leads</div>
            )}
            {v.phase === "passing" && (
              <div className="text-[9px] font-bold">{p.hasPassed ? "✓ ready" : "choosing…"}</div>
            )}
          </div>
        ))}
      </div>

      {/* banners */}
      {v.phase === "gameOver" && (
        <div className="rounded-2xl bg-sunny p-3 text-center text-lg font-black text-purple-900">
          🏆 {v.winners.map(nameOf).join(" & ")} {v.winners.length > 1 ? "tie" : "wins"}! (lowest score)
        </div>
      )}
      {v.shotTheMoon && v.phase !== "gameOver" && (
        <div className="rounded-2xl bg-purple-700 p-2 text-center font-black text-white">
          🌙 {nameOf(v.shotTheMoon)} shot the moon! Everyone else +26
        </div>
      )}
      {v.phase === "handEnd" && v.handResult && (
        <div className="rounded-2xl bg-white/10 p-3 text-center">
          <div className="mb-1 font-extrabold">Hand over</div>
          <div className="text-sm">
            {v.players.map((p) => `${p.name}: +${v.handResult![p.id] ?? 0}`).join("  ·  ")}
          </div>
        </div>
      )}
      {v.phase === "playing" && v.lastTrickWinner && v.currentTrick.length === 0 && (
        <div className="text-center text-xs text-white/60">
          {nameOf(v.lastTrickWinner)} took the last trick (+{v.lastTrickPoints})
        </div>
      )}

      {/* pass direction / status */}
      <div className="text-center font-extrabold">
        {v.phase === "passing" ? (
          <span className="text-mint">{PASS_LABEL[v.passDirection]}</span>
        ) : v.phase === "playing" ? (
          myTurn ? (
            <span className="text-mint animate-pop inline-block">Your turn!</span>
          ) : (
            <span className="text-white/70">Waiting for {nameOf(v.activePlayerId)}…</span>
          )
        ) : null}
        {v.phase === "playing" && (
          <div className="text-[10px] font-bold text-white/50">
            {v.heartsBroken ? "Hearts broken ♥" : "Hearts not broken"}
          </div>
        )}
      </div>

      {/* current trick */}
      {v.phase === "playing" && (
        <div className="card-surface flex min-h-[6rem] items-center justify-center gap-3 py-4">
          {v.currentTrick.length === 0 ? (
            <span className="text-sm text-white/50">No cards played yet</span>
          ) : (
            v.currentTrick.map((tp) => (
              <div key={tp.playerId} className="flex flex-col items-center gap-1">
                <CardFace card={tp.card} big />
                <span className="text-[10px] text-white/70">{nameOf(tp.playerId)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* passing actions */}
      {v.phase === "passing" && !v.hasPassed && (
        <div className="text-center">
          <button
            className="btn-pink"
            disabled={selected.length !== 3 || pending}
            onClick={submitPass}
          >
            Pass {selected.length}/3 cards
          </button>
        </div>
      )}
      {v.phase === "passing" && v.hasPassed && (
        <div className="text-center text-sm text-white/70">Waiting for others to pass…</div>
      )}
      {v.phase === "handEnd" && (
        <div className="text-center">
          <button className="btn-pink" disabled={pending} onClick={() => send({ type: "nextHand" })}>
            Next hand ▶
          </button>
        </div>
      )}

      {/* my hand */}
      <div className="card-surface p-3">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-white/60">
          Your hand · {me.emoji} {me.name}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {v.hand.map((card) => {
            const isSelected = selected.includes(card.id);
            const passing = v.phase === "passing" && !v.hasPassed;
            const playable = myTurn && playableSet.has(card.id);
            const dim =
              (v.phase === "playing" && !playable) ||
              (passing && selected.length >= 3 && !isSelected);
            return (
              <button
                key={card.id}
                disabled={pending || (!passing && !playable)}
                onClick={() => (passing ? toggleSelect(card.id) : playCard(card))}
                className={`flex-none transition ${playable || passing ? "hover:-translate-y-1" : ""}`}
              >
                <CardFace card={card} selected={isSelected} dim={dim} />
              </button>
            );
          })}
          {v.hand.length === 0 && <div className="py-6 text-white/60">No cards</div>}
        </div>
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>
    </div>
  );
}
