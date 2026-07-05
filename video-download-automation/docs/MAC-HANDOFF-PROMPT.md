# Mac handoff prompt

Copy everything in the box below into a **Claude Code session running on the Mac Mini
(michaelmontanez)**. It first surfaces the *existing* video-conversion tool (so nothing
is lost), then deploys the new agent and tests a real download.

---

```
You are on my Mac Mini. We're deploying the worker half of a video-download system
that already lives in my repo under `video-download-automation/`. Do this in order and
STOP for my confirmation between phases 1 and 2.

PHASE 1 — Find the existing tool (do NOT change anything yet).
There is an older video-download / yt-dlp / "convert to mp4" tool somewhere on this
Mac (possibly an n8n workflow, an Automator/Shortcuts action, a shell/Python script, or
a cron/launchd job). Locate it and report back:
  - search common spots: `ls -la ~/Library/LaunchAgents ~/Library/Services`,
    `crontab -l`, `mdfind -name yt-dlp`, `mdfind 'kMDItemDisplayName == "*.n8n"'`,
    grep for "yt-dlp" and "youtube" under ~ and /usr/local, check ~/Downloads scripts,
    check for a running n8n (`launchctl list | grep -i n8n`, `docker ps`).
  - report: what it is, where it lives, what folder it downloads to, whether it still
    runs, and paste the key script/workflow so we preserve its behavior.
  - identify the current OneDrive coaching-library folder path if one exists.
Then STOP and show me what you found before touching anything.

PHASE 2 — Deploy the new agent (after I confirm).
  1. Clone/pull my repo and `cd video-download-automation/mac-agent`.
  2. `cp .env.example .env` and fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
     TELEGRAM_BOT_TOKEN, and LIBRARY_DIR (use the OneDrive path from Phase 1 if it
     matches what I want, else the path in .env.example). Ask me for any secret you
     don't have — do not invent them.
  3. Run `bash install.sh`. It installs yt-dlp/ffmpeg/node deps, runs a doctor check,
     and loads a launchd service (com.swingtech.videoagent).
  4. Confirm `node agent.js --doctor` is all ✅. Fix anything red.
  5. In Finder, set the LIBRARY_DIR OneDrive folder to "Always Keep on This Device".
  6. Add the weekly yt-dlp updater to cron (see scripts/yt-dlp-update.sh).

PHASE 3 — End-to-end test.
  - I'll send a YouTube link to the Telegram bot. Watch
    `tail -f ~/Library/Logs/swingtech-video-agent.out.log`.
  - Confirm: an mp4 appears in LIBRARY_DIR, a matching .json sidecar is written, the
    file plays in QuickTime, and OneDrive shows it syncing. Report the result.

Constraints: never print my secrets back in full; keep the old tool intact until I say
it can be retired; if yt-dlp hits "confirm you're not a bot", set
COOKIES_FROM_BROWSER=chrome in .env and retry.
```

---

Once Phase 1 comes back, paste what it found to me here — if the old tool has behavior
worth keeping (a specific folder layout, naming, or a Shortcuts trigger), I'll fold it
into the agent before you retire it.
