#!/usr/bin/env bash
# YouTube breaks yt-dlp every few weeks — this is the #1 cause of silent failures.
# Install as a weekly cron/launchd job on the Mac. Example crontab line:
#   0 6 * * 1  /path/to/video-download-automation/scripts/yt-dlp-update.sh >> ~/Library/Logs/yt-dlp-update.log 2>&1
set -euo pipefail
echo "$(date -u +%FT%TZ) updating yt-dlp"
if command -v brew >/dev/null && brew list yt-dlp >/dev/null 2>&1; then
  brew upgrade yt-dlp || true
else
  yt-dlp -U || true
fi
yt-dlp --version
