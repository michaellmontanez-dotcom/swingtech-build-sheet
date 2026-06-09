# SwingTECH Video Converter

Save YouTube videos as regular **`.mp4` files** you can keep and share with the
players you coach — offline, on any phone or computer, no app needed on their
end.

There are two ways to use this, easiest first.

> **Please only convert content you have the right to keep and share** — your
> own videos, Creative Commons clips, or material you're licensed to use as a
> coaching reference.

---

## ⭐ The app (recommended — no Terminal, no Homebrew, no websites)

**`SwingTECH Video Converter.app`** is a normal Mac app. The first time you open
it, it spends about a minute quietly downloading its own conversion engine into
itself — after that it just works.

### Install it (once)
1. Drag **`SwingTECH Video Converter.app`** into your **Applications** folder
   (or anywhere you like — the Desktop is fine too).
2. **First open:** right-click (or Control-click) the app → **Open** → **Open**.
   macOS asks this once for any app it didn't download from the App Store; after
   that you can open it normally by double-clicking.

### Use it
1. Double-click the app.
2. The **first time only**, click **OK** on the welcome message and wait for the
   **"Ready"** notification (about a minute — it's setting itself up).
3. Paste one or more YouTube links into the box. Separate multiple links with a
   space. Click **Convert**.
4. When it's done, click **Show in Finder** to see your videos.

### Where your videos go
Your **Movies** folder, in a folder called **`SwingTECH Videos`**. They're
H.264 MP4 files (up to 1080p) that play anywhere. Share them however you like —
AirDrop, text, email, USB.

---

## Troubleshooting the app

| What you see | What to do |
|---|---|
| "unidentified developer" / won't open | Right-click the app → **Open** → **Open** (only needed the first time). |
| "Setup couldn't finish" | Check your internet connection and open the app again. |
| A link fails to convert | It may be private, region-locked, or mistyped. Confirm the link opens in your browser. |
| Lots of links suddenly fail | YouTube changed something. Delete the folder `~/Library/Application Support/SwingTECH Video Converter` and reopen the app — it re-downloads a fresh, updated engine. |

The app keeps a log of the last run at
`~/Library/Application Support/SwingTECH Video Converter/last-run.log` if you
ever need to see what happened.

---

## Alternative: the command-line script

If you'd rather not use the app, `download.sh` does the same job from Terminal
(it uses Homebrew to install `yt-dlp` + `ffmpeg`). See the comments at the top
of that file, or run `./download.sh --help`. A double-clickable
`Download Videos.command` is included for it too.

---

## Why a self-contained app?

YouTube downloading can't run inside the SwingTECH website (browsers and
Vercel's servers are blocked from fetching YouTube streams), and public
download websites keep getting shut down. A small app that runs on your own Mac,
carrying its own engine, is the reliable, private way to keep coaching videos
for offline reference.
