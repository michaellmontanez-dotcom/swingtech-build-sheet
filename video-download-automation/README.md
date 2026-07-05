# SwingTECH Video Download Automation

Message a golf-video link to a Telegram bot → it downloads to the coaching library
on the Mac Mini as a QuickTime-friendly MP4, auto-syncs to OneDrive, and confirms in chat.

Full design & rationale: [`docs/spec.md`](docs/spec.md).
To deploy the Mac side via Claude Code on the Mac: [`docs/MAC-HANDOFF-PROMPT.md`](docs/MAC-HANDOFF-PROMPT.md).

---

## Deploy — run top to bottom

### 1. Supabase queue (once, ~2 min)
1. In your Supabase project → SQL Editor, paste and run [`queue/schema.sql`](queue/schema.sql).
2. Note your **Project URL** and **service_role key** (Settings → API).

### 2. Telegram bot (once, ~2 min)
1. In Telegram, message **@BotFather** → `/newbot` → copy the **bot token**.
2. Message **@userinfobot** → copy your **numeric user id** (the allow-list value).

### 3. Droplet — n8n ingress (on 198.211.114.184)
Point a DNS name (e.g. `n8n.yourdomain.com`) at the droplet first — Telegram webhooks
require a valid HTTPS cert.
```bash
scp -r droplet/ root@198.211.114.184:/opt/video-ingress
ssh root@198.211.114.184
cd /opt/video-ingress
cp .env.example .env && nano .env      # set N8N_HOST, passwords, encryption key
bash setup.sh                          # firewall + docker + n8n/Caddy
```
Then open `https://<N8N_HOST>`, log in, and **Import** `n8n-workflow.json`:
- Edit the **Validate & extract** node → put your Telegram id in `ALLOWED_USER_IDS`.
- Edit the **Insert job (Supabase)** node → your Supabase URL + service_role key.
- Attach a **Telegram API** credential (bot token) to the trigger + both reply nodes.
- **Activate** the workflow.

### 4. Mac Mini — the worker
Either run the handoff prompt (`docs/MAC-HANDOFF-PROMPT.md`) in Claude Code on the Mac,
or do it by hand:
```bash
git clone <this-repo> && cd */video-download-automation/mac-agent
cp .env.example .env && nano .env      # Supabase, bot token, LIBRARY_DIR
bash install.sh                        # deps + doctor + launchd service
```
Set the OneDrive `LIBRARY_DIR` folder to **"Always Keep on This Device"** in Finder.
Add the weekly updater to cron:
```
0 6 * * 1  /path/to/video-download-automation/scripts/yt-dlp-update.sh >> ~/Library/Logs/yt-dlp-update.log 2>&1
```

### 5. Test
Send a YouTube link to the bot. Expect: `⏳ Queued` immediately, then `✅ Downloaded: <title>`
within a minute, the MP4 in the OneDrive folder, and a `.json` sidecar beside it.

---

## Operate
- Agent logs: `~/Library/Logs/swingtech-video-agent.out.log`
- Health check: `cd mac-agent && node agent.js --doctor`
- Drain one job manually: `node agent.js --once`
- Restart worker: `launchctl unload/load ~/Library/LaunchAgents/com.swingtech.videoagent.plist`

## Troubleshooting
| Symptom | Fix |
|---|---|
| `❌ Failed: … confirm you're not a bot` | Set `COOKIES_FROM_BROWSER=chrome` (or a `COOKIES_FILE`) in `mac-agent/.env` |
| Video won't play in QuickTime | Rare AV1-only source; agent prefers H.264 but some videos have no H.264 — open in VLC or add a transcode step |
| Nothing happens on send | Sender id not in `ALLOWED_USER_IDS`, or workflow not Activated |
| `queued` but never `✅` | Mac agent down — check logs / `--doctor` / launchd |
| Duplicates | Shouldn't happen — `--download-archive` + `[id]` naming dedupe; check the archive file exists in `LIBRARY_DIR` |
