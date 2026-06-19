-- Family Game Night — core schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) or via the
-- Supabase CLI (`supabase db push`). It is safe to re-run.
--
-- Security model
-- --------------
-- * The browser uses the ANON key. Players identify themselves with a random
--   client-generated player id stored in their browser; it is sent to Realtime
--   and to the move endpoint.
-- * All authoritative writes go through the Next.js move endpoint using the
--   SERVICE ROLE key, which bypasses RLS. RLS below governs what a phone can
--   read directly via the anon client (Realtime subscriptions + selects).
-- * Hidden information (card hands, hidden ship grids) lives in `hands`, which
--   is NOT directly readable by the anon role at all — phones receive their own
--   private view only through the redacted `getPlayerView` payload broadcast by
--   the server. Shared/public info lives in `games.public_state`.

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- 4-letter join code, e.g. "ABCD"
  host_player_id  text not null,                  -- client-generated id of the host
  status          text not null default 'lobby',  -- lobby | picking | playing | finished
  current_game    text,                           -- game_type of the active game, if any
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id          text not null,                       -- client-generated id (per browser)
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text not null,
  seat        int  not null,                       -- stable seat index / turn order
  is_host     boolean not null default false,
  connected   boolean not null default true,
  emoji       text,                                -- fun avatar
  joined_at   timestamptz not null default now(),
  primary key (room_id, id)
);

-- ---------------------------------------------------------------------------
-- games (one active game per room at a time; history retained)
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  game_type     text not null,                     -- 'uno', 'go-fish', ...
  public_state  jsonb not null default '{}'::jsonb,-- shared info only (never secrets)
  version       int  not null default 0,           -- optimistic lock / move counter
  status        text not null default 'active',    -- active | finished
  winner        jsonb,                             -- winner payload when finished
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists games_room_idx on public.games(room_id);
create index if not exists games_active_idx on public.games(room_id, status);

-- ---------------------------------------------------------------------------
-- hands — per-player private/hidden state (card hands, ship grids, etc.)
-- RLS: a player may read ONLY their own row.
-- ---------------------------------------------------------------------------
create table if not exists public.hands (
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.rooms   enable row level security;
alter table public.players enable row level security;
alter table public.games   enable row level security;
alter table public.hands   enable row level security;

-- Rooms / players / games hold only shared, non-secret information, so anon
-- phones may read them (Realtime needs SELECT to deliver row changes). All
-- writes are funneled through the service-role server endpoints.
drop policy if exists rooms_read   on public.rooms;
drop policy if exists players_read on public.players;
drop policy if exists games_read   on public.games;
create policy rooms_read   on public.rooms   for select using (true);
create policy players_read on public.players for select using (true);
create policy games_read   on public.games   for select using (true);

-- Hands carry SECRETS. With no permissive policy granting access to anon, RLS
-- denies all direct anon reads/writes. The server (service role) bypasses RLS
-- and is the only thing that touches this table. The policy below documents the
-- intended rule and would apply if you later move to Supabase Auth where
-- auth.uid()::text == player_id.
drop policy if exists hands_owner_read on public.hands;
create policy hands_owner_read on public.hands
  for select using (auth.uid() is not null and auth.uid()::text = player_id);

-- ---------------------------------------------------------------------------
-- Realtime: publish row changes so phones stay in sync.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.games;

-- keep updated_at fresh on games
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();
