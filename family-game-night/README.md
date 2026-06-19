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
| **Battle Tetris**, **Monopoly** | — | 🧩 In progress |

Every game ships with unit-tested logic (full-game simulations + invariants like
card/stone conservation and no-secret-leak checks). 144 logic tests passing.

---

## 🚀 Deploy (the "online" requirement)

### 1. Create the Supabase project
1. Go to <https://supabase.com> → **New project**.
2. Open **SQL Editor** → paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
   This creates `rooms`, `players`, `games`, `hands`, enables RLS, and adds the
   tables to the Realtime publication.
3. **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE` (⚠️ secret, server only)

### 2. Deploy to Vercel
1. Import this repo at <https://vercel.com/new>.
2. **Set the Root Directory to `family-game-night`** (this app lives in a
   subfolder).
3. Add **Environment Variables** (Production + Preview):

   | Name | Value | Exposed to browser? |
   |------|-------|---------------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL | yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | yes |
   | `SUPABASE_URL` | your Project URL | no |
   | `SUPABASE_ANON_KEY` | anon public key | no |
   | `SUPABASE_SERVICE_ROLE` | service_role key | **no — keep secret** |

   (`NEXT_PUBLIC_APP_URL` is optional; only set it to force a specific origin in
   the join links/QR. Vercel auto-detects it otherwise.)
4. **Deploy.** You'll get a public `https://…vercel.app` URL — that's the link
   you text to the family.

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
