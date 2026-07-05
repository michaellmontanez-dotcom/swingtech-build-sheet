import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { findExistingById, writeSidecar } from './library.js';

const run = promisify(execFile);

const LIBRARY_DIR = process.env.LIBRARY_DIR;
const ARCHIVE = () => path.join(LIBRARY_DIR, '.ytdl-archive.txt');

// yt-dlp gets every user-supplied value as a discrete argv element (never a shell
// string), so a hostile URL cannot inject a command. `--` ends option parsing.
function cookieArgs() {
  const args = [];
  if (process.env.COOKIES_FROM_BROWSER) {
    args.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
  } else if (process.env.COOKIES_FILE) {
    args.push('--cookies', process.env.COOKIES_FILE);
  }
  return args;
}

async function ytdlp(args, { maxBuffer = 1024 * 1024 * 16 } = {}) {
  return run('yt-dlp', args, { maxBuffer });
}

// Cheap metadata pull — no video bytes. Used for the sidecar + confirmation text.
async function fetchInfo(url) {
  const args = [
    '--no-playlist', '--skip-download', '--dump-json', '--no-warnings',
    ...cookieArgs(), '--', url,
  ];
  const { stdout } = await ytdlp(args);
  const line = stdout.trim().split('\n').filter(Boolean).pop();
  const info = JSON.parse(line);
  return {
    videoId: info.id,
    title: info.title,
    duration: info.duration ? Math.round(info.duration) : null,
    uploader: info.uploader ?? info.channel ?? null,
    webpageUrl: info.webpage_url ?? url,
  };
}

/**
 * Download one URL into the flat library as H.264/AAC MP4 (QuickTime-friendly),
 * with metadata/thumbnail/subs embedded and a searchable JSON sidecar.
 * Returns { filePath, skipped, ...meta }.
 */
export async function downloadVideo(url, jobMeta = {}) {
  if (!LIBRARY_DIR) throw new Error('LIBRARY_DIR is not set');

  const info = await fetchInfo(url);

  const args = [
    '--no-playlist',
    '-f', 'bv*+ba/b',
    // Prefer an existing H.264/AAC rendition so QuickTime plays it without a
    // slow re-encode; only merge/remux into mp4, never transcode blindly.
    '-S', 'vcodec:h264,res,acodec:aac',
    '--merge-output-format', 'mp4',
    '--embed-metadata', '--embed-thumbnail', '--embed-subs', '--sub-langs', 'en.*',
    '--download-archive', ARCHIVE(),
    '-o', path.join(LIBRARY_DIR, '%(title).180B [%(id)s].%(ext)s'),
    '--no-simulate',
    '--print', 'after_move:%(filepath)s',
    '--no-warnings',
    ...cookieArgs(),
    '--', url,
  ];

  const { stdout } = await ytdlp(args);
  const printed = stdout.trim().split('\n').filter(Boolean).pop();

  // If the archive already had this id, nothing is downloaded and nothing is
  // printed — locate the existing file instead of erroring.
  let filePath = printed && printed.includes(path.sep) ? printed : null;
  let skipped = false;
  if (!filePath) {
    filePath = await findExistingById(LIBRARY_DIR, info.videoId);
    skipped = true;
    if (!filePath) {
      throw new Error('yt-dlp reported no output file and no existing copy was found');
    }
  }

  const meta = { ...info, url, source: jobMeta.source, senderId: jobMeta.senderId };
  await writeSidecar(filePath, meta);

  return { filePath, skipped, ...info };
}

// `yt-dlp --version` — used by the doctor check.
export async function ytdlpVersion() {
  const { stdout } = await run('yt-dlp', ['--version']);
  return stdout.trim();
}
