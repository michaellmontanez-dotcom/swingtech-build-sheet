#!/usr/bin/env bash
#
# Double-click this file in Finder to download coaching videos.
# It just opens the downloader so you don't have to use Terminal commands.
#
# First time only: macOS may say it's from an unidentified developer.
# If so, right-click this file → Open → Open, and you won't be asked again.

# Move to this file's folder so it finds download.sh no matter where it's run.
cd "$(dirname "$0")" || exit 1

./download.sh

# Keep the window open so you can read the results.
echo
printf "Press Return to close this window… "
read -r _
