#!/usr/bin/env bash
# Install & run the SwingTECH video agent on the Mac Mini.
# Idempotent: safe to re-run to update.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$HERE/com.swingtech.videoagent.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.swingtech.videoagent.plist"
LABEL="com.swingtech.videoagent"

echo "==> Checking dependencies"
command -v brew >/dev/null || { echo "Homebrew required: https://brew.sh"; exit 1; }
for pkg in yt-dlp ffmpeg node; do
  if ! command -v "$pkg" >/dev/null; then
    echo "    installing $pkg"; brew install "$pkg"
  fi
done

echo "==> Installing node deps"
cd "$HERE"
npm install --omit=dev

if [[ ! -f "$HERE/.env" ]]; then
  echo "==> Creating .env from template — EDIT IT before the agent will work"
  cp "$HERE/.env.example" "$HERE/.env"
fi

echo "==> Running doctor (fill in .env if this reports ❌)"
node agent.js --doctor || true

echo "==> Installing launchd service ($LABEL)"
NODE_BIN="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s#__NODE__#$NODE_BIN#g" \
    -e "s#__DIR__#$HERE#g" \
    -e "s#__HOME__#$HOME#g" \
    "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load  "$PLIST_DST"
echo "==> Loaded. Logs: ~/Library/Logs/swingtech-video-agent.{out,err}.log"
echo "    Tail with: tail -f ~/Library/Logs/swingtech-video-agent.out.log"
