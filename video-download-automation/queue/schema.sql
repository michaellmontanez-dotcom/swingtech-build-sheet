-- Video download job queue.
-- Rendezvous between the droplet (n8n, public) and the Mac agent (behind home NAT).
-- The Mac only ever makes OUTBOUND HTTPS to Supabase, so no inbound port / Tailscale
-- is required for the queue itself. Run this once in the Supabase SQL editor.

create table if not exists video_jobs (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'telegram',   -- 'telegram' | 'messenger'
  chat_id     text not null,                       -- where to send the confirmation
  sender_id   text not null,                       -- allow-listed upstream, kept for audit
  url         text not null,
  status      text not null default 'queued'
              check (status in ('queued','running','done','failed','skipped')),
  attempts    int  not null default 0,
  error       text,
  title       text,
  video_id    text,
  file_path   text,
  duration    int,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  finished_at timestamptz
);

create index if not exists video_jobs_status_created_idx
  on video_jobs (status, created_at);

-- Concurrency-safe claim: FOR UPDATE SKIP LOCKED means two workers never grab the
-- same row. Returns 0 or 1 row. The agent calls this via supabase.rpc('claim_next_video_job').
create or replace function claim_next_video_job()
returns setof video_jobs
language plpgsql
as $$
declare
  j video_jobs;
begin
  select * into j
    from video_jobs
   where status = 'queued'
   order by created_at
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update video_jobs
     set status = 'running',
         attempts = attempts + 1,
         claimed_at = now()
   where id = j.id
  returning * into j;

  return next j;
end;
$$;

-- Re-queue jobs that a crashed worker left 'running' for too long (belt & suspenders).
create or replace function requeue_stale_video_jobs(max_minutes int default 30)
returns int
language sql
as $$
  with bumped as (
    update video_jobs
       set status = 'queued', claimed_at = null
     where status = 'running'
       and claimed_at < now() - make_interval(mins => max_minutes)
       and attempts < 3
    returning 1
  )
  select count(*)::int from bumped;
$$;
