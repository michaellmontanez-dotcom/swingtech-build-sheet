# SwingTECH Coaching Video Downloader

A simple Mac tool to save YouTube videos as regular **`.mp4` files** you can
share with the players you coach offline — AirDrop, USB stick, text, or email.
No app required on their end; the files play on any phone, tablet, or computer.

> **Please only download content you have the right to share** — your own
> videos, Creative Commons clips, or material you're licensed to redistribute.

---

## One-time setup (about 5 minutes)

You need two free tools: **yt-dlp** (downloads the video) and **ffmpeg**
(packages it into a phone-friendly file). The script can install them for you.

1. Open the **Terminal** app (press `⌘ + Space`, type `Terminal`, hit Enter).
2. If you don't already have **Homebrew** (a Mac app installer), paste this in
   and press Enter, then follow the prompts:

   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. That's it. The first time you run the downloader, it will offer to install
   `yt-dlp` and `ffmpeg` automatically — just answer **Y**.

---

## How to use it

1. In Terminal, go to this folder. The easiest way:
   type `cd ` (with a space), then drag this `video-downloader` folder from
   Finder onto the Terminal window, and press Enter.

2. Run:

   ```
   ./download.sh
   ```

3. Paste one YouTube link per line. When you're done, press **Enter on an
   empty line**.

4. The videos download into a **`Coaching-Videos`** folder, which pops open in
   Finder automatically when it's finished. Share those `.mp4` files however
   you like.

### Shortcuts

| What you want | Command |
|---|---|
| Download specific links right away | `./download.sh "LINK1" "LINK2"` |
| Save to a different folder | `./download.sh -o ~/Desktop/Lessons` |
| Audio only (MP3) | `./download.sh -a` |
| Help | `./download.sh --help` |

---

## What you get

- **Format:** H.264 MP4 (up to 1080p) — the most universally compatible video
  format. Plays everywhere with no extra software.
- **Filenames:** the video's title plus its ID, e.g.
  `Perfect_Golf_Swing_Drill [dQw4w9WgXcQ].mp4`.
- Already-downloaded videos are skipped, so you can safely re-run the same list.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| A link fails to download | Run `brew upgrade yt-dlp` — YouTube changes things often and updates fix most issues. |
| "Homebrew is not installed" | Run the Homebrew install command in the setup section above. |
| Video is private / region-locked | The script can't access it; confirm the link opens in your browser. |
| "permission denied" running the script | Run `chmod +x download.sh` once, then try again. |

---

## Why not just do this on the website?

YouTube downloading can't run inside the SwingTECH web app: browsers and
Vercel's servers are blocked from fetching YouTube's video streams, and the
required tools (`yt-dlp`, `ffmpeg`) can't run there. Running it on your own Mac
is the reliable, supported way to save videos for offline coaching.
