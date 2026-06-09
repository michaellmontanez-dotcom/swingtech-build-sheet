#!/usr/bin/env bash
#
# SwingTECH Coaching Video Downloader (macOS)
# -------------------------------------------
# Saves YouTube videos as phone-friendly .mp4 files you can share with
# players offline (AirDrop, USB, email, etc.).
#
# Usage:
#   ./download.sh                         # paste links interactively
#   ./download.sh <url> [url2] [url3...]  # download specific links
#   ./download.sh -a                      # audio-only (.mp3)
#   ./download.sh -o ~/Desktop/Lessons    # choose output folder
#
# Output:
#   By default, videos land in ./Coaching-Videos next to this script.
#
# Only download content you have the right to share (your own videos,
# Creative Commons, or material you're licensed to redistribute).

set -euo pipefail

# ---- Defaults -------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/Coaching-Videos"
AUDIO_ONLY=0
MAX_RES=1080

# ---- Colors ---------------------------------------------------------------
if [ -t 1 ]; then
  BOLD="$(tput bold)"; RESET="$(tput sgr0)"
  RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"; BLUE="$(tput setaf 4)"
else
  BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""
fi
say()  { printf "%s\n" "$*"; }
ok()   { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; }
head() { printf "\n%s%s%s\n" "$BOLD$BLUE" "$*" "$RESET"; }

# ---- Parse arguments ------------------------------------------------------
URLS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -a|--audio)  AUDIO_ONLY=1; shift ;;
    -o|--output) OUTPUT_DIR="$2"; shift 2 ;;
    -h|--help)
      # Print the leading comment block (skip the shebang), stop at first code line.
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0 ;;
    -*)
      err "Unknown option: $1"; exit 1 ;;
    *)
      URLS+=("$1"); shift ;;
  esac
done

# ---- Dependency check / install ------------------------------------------
ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then return 0; fi
  err "Homebrew is not installed — it's the easiest way to get the tools."
  say "Install it by pasting this into Terminal, then re-run this script:"
  say ""
  say "  ${BOLD}/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${RESET}"
  say ""
  exit 1
}

ensure_tool() {
  local tool="$1"
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool is installed"
    return 0
  fi
  warn "$tool is not installed."
  ensure_homebrew
  printf "  Install %s now with Homebrew? [Y/n] " "$tool"
  read -r reply </dev/tty || reply="y"
  case "${reply:-y}" in
    [nN]*) err "Cannot continue without $tool."; exit 1 ;;
    *) say "Installing $tool…"; brew install "$tool"; ok "$tool installed" ;;
  esac
}

head "Checking tools"
ensure_tool yt-dlp
ensure_tool ffmpeg

# ---- Collect links --------------------------------------------------------
if [ ${#URLS[@]} -eq 0 ]; then
  head "Paste YouTube links"
  say "Paste one link per line. Press ${BOLD}Enter on a blank line${RESET} when done."
  say ""
  while true; do
    printf "  link> "
    read -r line </dev/tty || break
    [ -z "$line" ] && break
    URLS+=("$line")
  done
fi

if [ ${#URLS[@]} -eq 0 ]; then
  warn "No links given. Nothing to do."
  exit 0
fi

mkdir -p "$OUTPUT_DIR"

# ---- Build yt-dlp arguments ----------------------------------------------
COMMON_ARGS=(
  --no-playlist
  --ignore-errors
  --no-overwrites
  --restrict-filenames
  --embed-metadata
  --newline
  -o "${OUTPUT_DIR}/%(title)s [%(id)s].%(ext)s"
)

if [ "$AUDIO_ONLY" -eq 1 ]; then
  head "Mode: audio only (.mp3)"
  FORMAT_ARGS=( -x --audio-format mp3 --audio-quality 0 )
else
  head "Mode: phone-friendly video (.mp4, H.264, up to ${MAX_RES}p)"
  # Prefer H.264 video + AAC audio in an mp4 container so the files play on
  # any phone without re-encoding. Fall back gracefully if unavailable.
  FORMAT_ARGS=(
    -f "bv*[vcodec^=avc1]+ba[ext=m4a]/bv*+ba/b"
    -S "res:${MAX_RES},vcodec:h264,ext:mp4:m4a"
    --merge-output-format mp4
    --remux-video mp4
  )
fi

# ---- Download loop --------------------------------------------------------
head "Downloading ${#URLS[@]} item(s) → ${OUTPUT_DIR}"
total=${#URLS[@]}
n=0
failed=()
for url in "${URLS[@]}"; do
  n=$((n + 1))
  say ""
  say "${BOLD}[${n}/${total}]${RESET} ${url}"
  if yt-dlp "${COMMON_ARGS[@]}" "${FORMAT_ARGS[@]}" "$url"; then
    ok "Done"
  else
    err "Failed: $url"
    failed+=("$url")
  fi
done

# ---- Summary --------------------------------------------------------------
head "Finished"
ok "Saved to: ${OUTPUT_DIR}"
if [ ${#failed[@]} -gt 0 ]; then
  warn "${#failed[@]} link(s) failed:"
  for f in "${failed[@]}"; do say "    $f"; done
  say ""
  say "Common fixes: update yt-dlp ( ${BOLD}brew upgrade yt-dlp${RESET} ),"
  say "check the link opens in a browser, or the video may be private/region-locked."
  exit 1
fi

# Reveal the folder in Finder for convenience.
command -v open >/dev/null 2>&1 && open "$OUTPUT_DIR" || true
