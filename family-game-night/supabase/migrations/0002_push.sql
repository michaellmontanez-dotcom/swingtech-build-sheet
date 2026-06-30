-- Push notifications: store each device's Web Push subscription so the server
-- can buzz a player when it becomes their turn while the app is backgrounded.
-- Run this in the Supabase SQL editor (safe to re-run).

create table if not exists public.push_subscriptions (
  player_id  text not null,
  endpoint   text not null,           -- unique per device/browser
  room_id    uuid references public.rooms(id) on delete set null,
  data       jsonb not null,          -- the full PushSubscription JSON
  name       text,
  updated_at timestamptz not null default now(),
  primary key (player_id, endpoint)
);

create index if not exists push_player_idx on public.push_subscriptions(player_id);

-- Secrets-ish (endpoints/keys). Only the service-role server touches this table;
-- RLS on with no anon policy denies all direct anon access.
alter table public.push_subscriptions enable row level security;
