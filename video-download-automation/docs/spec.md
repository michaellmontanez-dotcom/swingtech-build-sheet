# Video Download Automation — Refined Spec (v2)

Golf-instruction video capture for the SwingTECH coaching library.
This is the council-reviewed replacement for the original single-step converter.

## Goal

Message a link to a bot → the video lands in the coaching library on the Mac Mini
as a QuickTime-playable MP4, auto-synced to OneDrive, with a confirmation back in chat.

## Architecture — control plane / worker split

```
Telegram (primary)   ┄┄ Phase 2: Facebook Page / Messenger ┄┄┐
      │                                                       │  final ✅/❌ (agent sends)
      ▼                                                       │
DigitalOcean droplet 198.211.114.184                          │
  n8n (behind Caddy HTTPS + basic-auth + ufw)                 │
   • allow-list sender  • extract + allow-list URL            │
   • INSERT job row into Supabase  • reply "⏳ queued"         │
                     │                                        │
                     ▼  (Mac polls OUTBOUND — no inbound/NAT hole)
              Supabase  video_jobs  ── atomic claim RPC ──┐    │
                     ▲                                    │    │
                     │                                    ▼    │
Mac Mini (michaelmontanez) — worker                            │
   • claim job • yt-dlp → H.264/AAC mp4 • write to OneDrive    │
     folder • sidecar index.json • send final ✅/❌ ───────────┘
   • OneDrive client auto-syncs the folder (pin "Always keep on device")
```

## Key decisions (and why they changed from the proposal)

| Proposal | Decision | Rationale |
|---|---|---|
| Messenger ingress | **Telegram primary**; Messenger = Phase 2 Page webhook | Personal-DM automation is impossible / ToS-banned; Telegram works today with a native n8n node, no app review, no 24h window |
| Download on droplet | **Download on the Mac** | No double transfer; file lands natively in the OneDrive folder; droplet stays a $6 box |
| Droplet↔Mac link | **Supabase queue, Mac polls outbound** | No inbound port / Tailscale needed just to move jobs; survives Mac reboots & long downloads |
| Separate OneDrive sync step | **Write into the OneDrive folder** | The OneDrive client *is* the sync; one less failure mode |
| Sync flat folder | **Flat + `--download-archive` + `[id]` filenames + `index.json`** | Kills duplicates & collisions; keeps a flat library searchable |
| "MP4" | **Prefer H.264+AAC, merge to mp4** | VP9/AV1-in-mp4 won't open in QuickTime |
| Synchronous webhook→download→reply | **Async: ack now, worker downloads, agent confirms** | Downloads outlive n8n timeouts; absorbs YouTube throttling |
| Raw n8n on public IP | **Caddy HTTPS + basic-auth + ufw** | It's a remote command surface |

## Security (non-negotiable)

1. **Sender allow-list** in the n8n Code node (numeric Telegram ids). Everyone else is dropped silently.
2. **URL allow-list** on ingress *and* in the worker (`isAllowedUrl`). Defence in depth against SSRF / arbitrary download.
3. **No shell interpolation** — the worker calls `execFile('yt-dlp', [...])` with the URL as a discrete argv element after `--`. Command injection is structurally impossible.
4. **n8n locked down** — HTTPS + basic-auth + `ufw` (only 22/80/443). Never expose port 5678 publicly.
5. **Secrets** live in `.env` / n8n credentials, never in git (`.gitignore` enforces this).
6. **Worker is unprivileged** with a free-space floor (`MIN_FREE_GB`) so a runaway can't fill the disk.

> Legal note: bulk-downloading YouTube for a coaching library is against YouTube's ToS and may implicate copyright if the content isn't yours. This is a business decision to make deliberately, not a technical gap.

## The download contract

- Format: `-f "bv*+ba/b" -S "vcodec:h264,res,acodec:aac" --merge-output-format mp4`
- Naming: `%(title).180B [%(id)s].%(ext)s` (id makes re-downloads idempotent via `--download-archive`)
- Embeds: metadata, thumbnail, English subs
- Sidecar: `<name>.json` with title, id, source url, duration, uploader, requester, timestamp
- Weekly `yt-dlp -U` cron — the #1 cause of silent breakage

## Reliability

- Every terminal state replies to chat: `✅ Downloaded …` / `↩️ Already in library …` / `❌ Failed: <friendly reason>`.
- `claim_next_video_job()` uses `FOR UPDATE SKIP LOCKED` — safe if you ever run two workers.
- `requeue_stale_video_jobs()` rescues jobs a crashed worker left `running`.
- Cookie fallback (`COOKIES_FROM_BROWSER`) for YouTube "confirm you're not a bot".

## Phase 2 — Messenger adapter (later)

A Facebook **Page** + verified Messenger webhook feeds the *same* `video_jobs` queue
(`source = 'messenger'`, `chat_id = <PSID>`) with a PSID allow-list. The worker is
unchanged. Personal-account DM scraping is explicitly out of scope (bans + ToS).

## Repo layout

```
video-download-automation/
  docs/spec.md                 ← this file
  docs/MAC-HANDOFF-PROMPT.md    ← paste into Claude Code on the Mac
  queue/schema.sql             ← run once in Supabase
  droplet/                     ← n8n + Caddy + setup + workflow import
  mac-agent/                   ← the worker (Node)
  scripts/yt-dlp-update.sh     ← weekly updater
  README.md                    ← deployment runbook
```
