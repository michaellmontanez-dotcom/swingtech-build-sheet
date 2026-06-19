"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/viewTypes";

// ----------------------------------------------------------------------------
// View types (mirror getPlayerView's public projection).
// ----------------------------------------------------------------------------
interface VSpace {
  index: number;
  name: string;
  type: string;
  group: string | null;
  price: number | null;
  owner: string | null;
  houses: number;
  mortgaged: boolean;
}
interface VPlayer {
  id: string;
  name: string;
  emoji: string | null;
  cash: number;
  position: number;
  inJail: boolean;
  getOutCards: number;
  bankrupt: boolean;
  netWorth: number;
  properties: number[];
}
interface VAuction {
  propertyIndex: number;
  propertyName: string;
  highBid: number;
  highBidder: string | null;
  currentBidder: string | null;
  bidders: string[];
}
interface MView {
  type: "monopoly";
  board: VSpace[];
  players: VPlayer[];
  activePlayerId: string;
  phase: string;
  dice: [number, number] | null;
  doublesCount: number;
  pendingBuyIndex: number | null;
  auction: VAuction | null;
  debt: { debtor: string; amount: number; creditor: string | null } | null;
  finished: boolean;
  winnerId: string | null;
  log: string[];
  you: string | null;
  actions: string[];
}

const GROUP_COLOR: Record<string, string> = {
  brown: "#8B5A2B",
  lightblue: "#AAE0FA",
  pink: "#D93A96",
  orange: "#F7941D",
  red: "#ED1B24",
  yellow: "#FEF200",
  green: "#1FB25A",
  darkblue: "#0072BB",
  railroad: "#000000",
  utility: "#C0C0C0",
};

// Token color per seat (by board order).
const TOKEN_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899"];

// Build the 40-space ring layout: bottom row R-to-L, left col B-to-T, top L-to-R,
// right col T-to-B. We map each board index to an 11x11 grid cell.
function ringCell(index: number): { row: number; col: number } {
  // index 0 = bottom-right corner (GO), going counter-clockwise visually but
  // standard board has GO at bottom-right and numbers increasing CCW.
  if (index <= 10) return { row: 10, col: 10 - index }; // bottom row: 0->col10 .. 10->col0
  if (index <= 20) return { row: 10 - (index - 10), col: 0 }; // left col up
  if (index <= 30) return { row: 0, col: index - 20 }; // top row L->R
  return { row: index - 30, col: 10 }; // right col down
}

export function MonopolyView({ view, me, send, pending }: GameViewProps) {
  const v = view as MView;
  const [bid, setBid] = useState<string>("");
  const [manageOpen, setManageOpen] = useState(false);

  if (!v?.board) return <div className="p-6 text-center text-white/70">Setting up the board…</div>;

  const myTurn = v.activePlayerId === me.id && !v.finished;
  const meP = v.players.find((p) => p.id === me.id);
  const actions = new Set(v.actions);
  const seatColor: Record<string, string> = {};
  v.players.forEach((p, i) => (seatColor[p.id] = TOKEN_COLORS[i % TOKEN_COLORS.length]));

  const activeP = v.players.find((p) => p.id === v.activePlayerId);

  function tokensOn(index: number) {
    return v.players.filter((p) => !p.bankrupt && p.position === index);
  }

  function ownerLabel(sp: VSpace) {
    if (!sp.owner) return null;
    return seatColor[sp.owner];
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Status banner */}
      <div className="text-center font-extrabold">
        {v.finished ? (
          <span className="text-sunny">
            🏆 {v.players.find((p) => p.id === v.winnerId)?.name} wins!
          </span>
        ) : myTurn ? (
          <span className="text-mint animate-pop inline-block">Your turn 🎩</span>
        ) : (
          <span className="text-white/70">
            {activeP?.emoji} {activeP?.name}&apos;s turn…
          </span>
        )}
      </div>

      {/* Board ring */}
      <div className="card-surface p-2">
        <div
          className="relative mx-auto grid aspect-square w-full max-w-md gap-[2px]"
          style={{ gridTemplateColumns: "repeat(11, 1fr)", gridTemplateRows: "repeat(11, 1fr)" }}
        >
          {v.board.map((sp) => {
            const { row, col } = ringCell(sp.index);
            const groupColor = sp.group ? GROUP_COLOR[sp.group] : "#2a2244";
            const oc = ownerLabel(sp);
            const toks = tokensOn(sp.index);
            return (
              <div
                key={sp.index}
                className="relative flex flex-col overflow-hidden rounded-[3px] bg-white/5 text-[5px] leading-none"
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
                title={`${sp.name}${sp.owner ? " (owned)" : ""}`}
              >
                {/* color strip for streets */}
                {(sp.type === "street") && (
                  <div className="h-[22%] w-full" style={{ backgroundColor: groupColor }} />
                )}
                <div className="flex-1 px-[1px] pt-[1px] text-white/80">
                  <div className="truncate font-bold">{shortName(sp)}</div>
                  {sp.price != null && <div className="text-white/50">${sp.price}</div>}
                </div>
                {/* ownership / houses */}
                {oc && (
                  <div className="absolute right-[1px] top-[1px] h-[6px] w-[6px] rounded-full border border-white/60" style={{ backgroundColor: oc }} />
                )}
                {sp.houses > 0 && (
                  <div className="absolute bottom-[1px] left-[1px] font-black text-[5px] text-emerald-300">
                    {sp.houses === 5 ? "H" : "🏠".repeat(Math.min(sp.houses, 4)) || sp.houses}
                  </div>
                )}
                {sp.mortgaged && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 text-[6px] font-black text-rose-300">M</div>
                )}
                {/* tokens */}
                {toks.length > 0 && (
                  <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-[1px]">
                    {toks.map((p) => (
                      <span
                        key={p.id}
                        className="h-[7px] w-[7px] rounded-full border border-white"
                        style={{ backgroundColor: seatColor[p.id] }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* center: dice */}
          <div className="col-start-2 col-end-11 row-start-2 row-end-11 grid place-items-center rounded-xl bg-purple-900/40">
            <div className="text-center">
              {v.dice ? (
                <div className="flex gap-2 text-3xl">
                  <Die n={v.dice[0]} />
                  <Die n={v.dice[1]} />
                </div>
              ) : (
                <div className="text-xs font-bold text-white/40">Monopoly</div>
              )}
              {v.doublesCount > 0 && !v.finished && (
                <div className="mt-1 text-[10px] font-black text-sunny">Doubles x{v.doublesCount}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active player panel (you) */}
      {meP && (
        <div className="card-surface p-3">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">
              {me.emoji} {me.name}
              {meP.inJail && <span className="ml-1 text-rose-300">🔒</span>}
              {meP.getOutCards > 0 && <span className="ml-1 text-[10px]">🃏x{meP.getOutCards}</span>}
            </div>
            <div className="text-mint font-black">${meP.cash}</div>
          </div>
          {v.debt && v.debt.debtor === me.id && (
            <div className="mt-1 rounded-lg bg-rose-600/80 px-2 py-1 text-center text-xs font-bold">
              You owe ${v.debt.amount}
              {v.debt.creditor ? ` to ${v.players.find((p) => p.id === v.debt!.creditor)?.name}` : " to the bank"} — raise funds or go bankrupt.
            </div>
          )}
          <MyProps view={v} me={me.id} />
        </div>
      )}

      {/* Contextual actions */}
      {!v.finished && (
        <div className="flex flex-wrap justify-center gap-2">
          {actions.has("roll") && (
            <button className="btn-pink" disabled={pending} onClick={() => send({ type: "roll" })}>
              🎲 Roll
            </button>
          )}
          {actions.has("rollJail") && (
            <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "rollJail" })}>
              🎲 Roll for doubles
            </button>
          )}
          {actions.has("payJail") && (
            <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "payJail" })}>
              💵 Pay $50 bail
            </button>
          )}
          {actions.has("useJailCard") && (
            <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "useJailCard" })}>
              🃏 Use jail card
            </button>
          )}
          {actions.has("buy") && v.pendingBuyIndex != null && (
            <button className="btn-pink" disabled={pending} onClick={() => send({ type: "buy" })}>
              🏷️ Buy {v.board[v.pendingBuyIndex].name} (${v.board[v.pendingBuyIndex].price})
            </button>
          )}
          {actions.has("declineBuy") && (
            <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "declineBuy" })}>
              ❌ Decline → auction
            </button>
          )}
          {actions.has("endTurn") && (
            <button className="btn-pink" disabled={pending} onClick={() => send({ type: "endTurn" })}>
              ✅ End turn
            </button>
          )}
          {actions.has("declareBankrupt") && (
            <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "declareBankrupt" })}>
              🏳️ Declare bankruptcy
            </button>
          )}
          {(actions.has("build") ||
            actions.has("sellHouse") ||
            actions.has("mortgage") ||
            actions.has("unmortgage")) && (
            <button className="btn-ghost" onClick={() => setManageOpen(true)}>
              🛠️ Manage properties
            </button>
          )}
        </div>
      )}

      {/* Auction */}
      {v.auction && (
        <div className="card-surface p-3">
          <div className="text-center font-extrabold">
            🔨 Auction: {v.auction.propertyName}
          </div>
          <div className="mt-1 text-center text-sm">
            High bid: <span className="font-black text-mint">${v.auction.highBid}</span>
            {v.auction.highBidder && (
              <> by {v.players.find((p) => p.id === v.auction!.highBidder)?.name}</>
            )}
          </div>
          {v.auction.currentBidder === me.id && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <input
                type="number"
                value={bid}
                onChange={(e) => setBid(e.target.value)}
                placeholder={`> ${v.auction.highBid}`}
                className="w-24 rounded-lg bg-white/10 px-2 py-1 text-center text-white"
              />
              <button
                className="btn-pink"
                disabled={pending || !bid}
                onClick={() => {
                  send({ type: "bid", amount: Number(bid) });
                  setBid("");
                }}
              >
                Bid
              </button>
              <button className="btn-ghost" disabled={pending} onClick={() => send({ type: "passBid" })}>
                Pass
              </button>
            </div>
          )}
          {v.auction.currentBidder !== me.id && (
            <div className="mt-1 text-center text-xs text-white/60">
              Waiting on {v.players.find((p) => p.id === v.auction!.currentBidder)?.name}…
            </div>
          )}
        </div>
      )}

      {/* Other players */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {v.players
          .filter((p) => p.id !== me.id)
          .map((p) => (
            <div
              key={p.id}
              className={`flex-none rounded-2xl px-3 py-2 text-center ${
                p.id === v.activePlayerId ? "bg-sunny text-purple-900" : "bg-white/10"
              } ${p.bankrupt ? "opacity-40" : ""}`}
            >
              <div className="flex items-center gap-1 text-sm font-extrabold">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seatColor[p.id] }} />
                {p.emoji} {p.name}
              </div>
              <div className="text-xs opacity-80">${p.cash}</div>
              <div className="text-[10px] opacity-60">
                🏠 {p.properties.length}
                {p.inJail && " · 🔒"}
                {p.bankrupt && " · 💀"}
              </div>
            </div>
          ))}
      </div>

      {/* log */}
      <div className="px-1 text-center text-xs text-white/50">{v.log[v.log.length - 1]}</div>

      {/* Manage modal */}
      {manageOpen && meP && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={() => setManageOpen(false)}>
          <div className="card-surface max-h-[80vh] w-full max-w-sm overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-lg font-extrabold">Manage properties</p>
              <button className="text-white/60" onClick={() => setManageOpen(false)}>✕</button>
            </div>
            <div className="flex flex-col gap-2">
              {v.board
                .filter((sp) => sp.owner === me.id)
                .map((sp) => (
                  <div key={sp.index} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-sm">
                    <div className="flex items-center gap-2">
                      {sp.group && (
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: GROUP_COLOR[sp.group] }} />
                      )}
                      <span className="font-bold">{sp.name}</span>
                      {sp.houses > 0 && <span className="text-[10px] text-emerald-300">{sp.houses === 5 ? "Hotel" : `${sp.houses}🏠`}</span>}
                      {sp.mortgaged && <span className="text-[10px] text-rose-300">Mortgaged</span>}
                    </div>
                    <div className="flex gap-1">
                      <MiniBtn show={sp.type === "street" && !sp.mortgaged} label="Build" onClick={() => send({ type: "build", propertyId: sp.index })} pending={pending} />
                      <MiniBtn show={sp.houses > 0} label="Sell" onClick={() => send({ type: "sellHouse", propertyId: sp.index })} pending={pending} />
                      <MiniBtn show={!sp.mortgaged && sp.houses === 0} label="Mortg." onClick={() => send({ type: "mortgage", propertyId: sp.index })} pending={pending} />
                      <MiniBtn show={sp.mortgaged} label="Lift" onClick={() => send({ type: "unmortgage", propertyId: sp.index })} pending={pending} />
                    </div>
                  </div>
                ))}
              {v.board.filter((sp) => sp.owner === me.id).length === 0 && (
                <div className="py-4 text-center text-white/50">You own nothing yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniBtn({ show, label, onClick, pending }: { show: boolean; label: string; onClick: () => void; pending: boolean }) {
  if (!show) return null;
  return (
    <button className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold hover:bg-white/20 disabled:opacity-40" disabled={pending} onClick={onClick}>
      {label}
    </button>
  );
}

function MyProps({ view, me }: { view: MView; me: string }) {
  const mine = view.board.filter((sp) => sp.owner === me);
  if (mine.length === 0) return <div className="mt-1 text-xs text-white/40">No properties yet.</div>;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {mine.map((sp) => (
        <span
          key={sp.index}
          className="rounded px-1.5 py-0.5 text-[9px] font-bold text-black"
          style={{ backgroundColor: sp.group ? GROUP_COLOR[sp.group] : "#ccc", opacity: sp.mortgaged ? 0.5 : 1 }}
        >
          {shortName(sp)}
          {sp.houses > 0 && (sp.houses === 5 ? " 🏨" : ` ${sp.houses}🏠`)}
        </span>
      ))}
    </div>
  );
}

function shortName(sp: VSpace): string {
  switch (sp.type) {
    case "go": return "GO";
    case "jail": return "JAIL";
    case "freeParking": return "FREE";
    case "goToJail": return "→JAIL";
    case "chance": return "?";
    case "chest": return "CHEST";
    case "tax": return "TAX";
    case "railroad": return "RR";
    case "utility": return sp.name.includes("Electric") ? "⚡" : "💧";
    default: {
      // first word of street name
      const w = sp.name.split(" ")[0];
      return w.length > 6 ? w.slice(0, 6) : w;
    }
  }
}

function Die({ n }: { n: number }) {
  const faces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  return <span className="text-white">{faces[n] ?? n}</span>;
}
