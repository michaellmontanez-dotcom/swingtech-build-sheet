# 🎲 Family Game Night

A mobile-first, online multiplayer "family game night" PWA. The Jackbox/Kahoot
model: everyone's in the same room but plays on their own phone. One person
hosts, gets a **4-letter room code**, and the rest join by **code, tappable
link, or QR scan**. Installs to the home screen with a fun custom icon.

Built with **Next.js (App Router) + TypeScript + Tailwind**, **Supabase**
(Postgres + Realtime + RLS), deployed on **Vercel**.

---

## ✨ What's here

- **Game-agnostic shell** — room lifecycle, lobby, live presence, game picker,
  a generic turn manager, and **one authoritative move endpoint** with optimistic
  version locking. The shell contains **zero** game rules.
- **Pluggable game modules** — every game implements the same interface
  (`initGame`, `validateMove`, `applyMove`, `isGameOver`, `getPlayerView`).
- **Hidden information done right** — secrets (card hands, etc.) never reach the
  wrong phone. The full authoritative state lives server-side in an RLS-locked
  table; phones only ever receive their own redacted `getPlayerView`.
- **Installable PWA** — manifest, service worker, maskable icons, iOS meta tags.
- **Online sharing** — room code + join link + QR + Web Share API.

### Games

| Game | Players | Status |
|------|---------|--------|
| **Uno** (optional stacking) | 2–10 | ✅ Playable |
| **Go Fish** | 2–6 | ✅ Playable |
| **Yahtzee** | 2–8 | ✅ Playable |
| **Connect Four** | 2 | ✅ Playable |
| **Checkers** | 2 | ✅ Playable |
| **Battleship** | 2 | ✅ Playable |
| **Mancala** | 2 | ✅ Playable |
| **Hearts** | 4 | ✅ Playable |
| **Gin Rummy** | 2 | ✅ Playable |
| **Dominoes** (Block/Draw) | 2–4 | ✅ Playable |
| **Chess** | 2 | ✅ Playable |
| **Trouble** | 2–4 | ✅ Playable |
| **Sorry!** | 2–4 | ✅ Playable |
| **Battle Tetris** (real-time) | 2–4 | ✅ Playable |
| **Monopoly** | 2–6 | ✅ Playable |

Every game ships with unit-tested logic (full-game simulations + invariants like
card/stone conservation and no-secret-leak checks). **172 logic tests passing.**

> **Battle Tetris** is the one real-time game; since this stack is HTTP + DB
> per move, gravity is driven by client `tick` moves and play is best-effort
> real-time rather than frame-perfect — great for casual family duels.
> **Monopoly** implements the common paths faithfully (movement/GO, buying,
> auctions, full rent tables incl. monopolies/houses/railroads/utilities,
> even-build houses & hotels, mortgaging, jail, Chance/Chest, bankruptcy); a
> few rare edges are simplified and documented in code comments (no
> player-to-player trading; nearest-railroad/utility cards charge standard rent).

---

## 🚀 Deploy (the "online" requirement)

Everything below works from a **phone browser** — no computer required. You need
exactly **3** environment variables, all from Supabase.

### 1. Create the Supabase project (phone-friendly)
1. Go to <https://supabase.com> → sign in with GitHub → **New project** (set a DB
   password, pick a region, Create — ~2 min to provision).
2. Left menu → **SQL Editor → New query** → paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) →
   **Run**. (Creates `rooms`, `players`, `games`, `hands`, enables RLS, and adds
   the tables to the Realtime publication.)
3. **Project Settings → API** — copy these three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE` (⚠️ secret, server only)

### 2. Deploy to Vercel — one tap

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmichaellmontanez-dotcom%2Fswingtech-build-sheet&root-directory=family-game-night&project-name=family-game-night&repository-name=family-game-night&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE&envDescription=Paste%20your%20Supabase%20Project%20URL%2C%20anon%20key%2C%20and%20service_role%20key&envLink=https%3A%2F%2Fgithub.com%2Fmichaellmontanez-dotcom%2Fswingtech-build-sheet%2Ftree%2Fmain%2Ffamily-game-night)

The button pre-sets the **Root Directory** to `family-game-night` and prompts for
exactly the 3 variables from step 1 — paste them and tap **Deploy**. You'll get a
public `https://…vercel.app` URL to text the family.

> Manual alternative: <https://vercel.com/new> → import this repo → set **Root
> Directory = `family-game-night`** → add the 3 env vars → Deploy.

> The two extra names (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) are **optional** — the
> server falls back to the `NEXT_PUBLIC_*` ones. `NEXT_PUBLIC_APP_URL` is optional
> too (Vercel auto-detects the origin for join links/QR).

### 3. Play
- Open the URL on the host phone → **Host a Game Night** → share the code / QR.
- Other phones scan the QR or open the link → enter a name → they're in the lobby.
- On iOS/Android use **Add to Home Screen** for the full-screen app + icon.

---

## 🧱 Architecture

```
Phone (anon Supabase client)                 Next.js route handlers (service role)
  ├─ reads rooms/players/games (RLS: public)   ├─ POST /api/rooms            create room
  ├─ Realtime: row changes + presence          ├─ POST /api/rooms/[code]/join
  └─ GET /api/games/[id]/view  ← own secrets   ├─ POST /api/rooms/[code]/start
                                               ├─ POST /api/rooms/[code]/pick
                                               ├─ POST /api/games/[id]/move  ← authoritative
                                               └─ GET  /api/games/[id]/view
```

**The one authoritative path** (`src/lib/gameStore.ts`):
load state → `validateMove` → `applyMove` → check `isGameOver` → persist with
`version = version + 1` (optimistic lock) → Realtime fans the public projection
out to every phone. The mover gets their fresh private view in the response;
everyone else refetches their private view when the version changes.

**Secrets:** `games.public_state` holds only shared info (whose turn, discard
top, draw-pile count, each player's card counts). The full state (with every
hand) is stored in `hands` under a reserved `__full__` row that the anon role
**cannot** read — only the service-role server can. Per-player private views are
computed by `getPlayerView` and delivered only to that player.

---

## ➕ Adding a game

A game is two files plus two registry lines:

1. `src/games/<id>/logic.ts` — implement `GameModule` from
   [`src/games/types.ts`](src/games/types.ts). Pure functions only (no React,
   no DOM). Use the helpers in `src/games/turn.ts` and `src/games/rng.ts`.
2. `src/games/<id>/View.tsx` — a React component receiving `GameViewProps`
   ([`src/games/viewTypes.ts`](src/games/viewTypes.ts)); calls `send(move)`.
3. Register the logic in [`src/games/registry.ts`](src/games/registry.ts) and the
   view in [`src/games/viewRegistry.ts`](src/games/viewRegistry.ts).

That's it — the shell handles rooms, turns, sync, and secrets. See `src/games/uno`
as the reference implementation, and `src/games/uno/logic.test.ts` for how to
unit-test an engine (it simulates a full game and asserts card conservation).

---

## 🛠️ Local development

```bash
cd family-game-night
cp .env.example .env.local   # fill in your Supabase keys
npm install
npm run icons                # regenerate PWA icons from public/icon.svg
npm run dev                  # http://localhost:3000
npm test                     # run game-logic unit tests
```

> Note: Realtime/PWA install need HTTPS in production, but local `npm run dev`
> works over `http://localhost` for development.
