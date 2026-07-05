import { readdir, writeFile, statfs } from 'node:fs/promises';
import path from 'node:path';

// Defence-in-depth URL allow-list. n8n validates on ingress too, but the worker
// never trusts that — a bad host here means SSRF / arbitrary download.
const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'music.youtube.com', 'youtu.be',
]);
const FACEBOOK_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch',
]);

export function isAllowedUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host) || FACEBOOK_HOSTS.has(host)) return true;
  // Facebook CDN attachment URLs (Phase 2 Messenger links).
  if (host.endsWith('.fbcdn.net')) return true;
  return false;
}

// Free space on the volume holding the library, in GB. Returns Infinity if the
// platform can't report it (so a probe failure never blocks downloads).
export async function freeSpaceGB(dir) {
  try {
    const s = await statfs(dir);
    return (s.bsize * s.bavail) / 1e9;
  } catch {
    return Infinity;
  }
}

// A finished download already carries "[<id>]" in its name (see the -o template).
// If yt-dlp skips because the id is in the archive, find that existing file.
export async function findExistingById(dir, videoId) {
  try {
    const entries = await readdir(dir);
    const hit = entries.find(
      (f) => f.includes(`[${videoId}]`) && /\.(mp4|mkv|webm|mov)$/i.test(f),
    );
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

// Sidecar JSON so the flat coaching library stays searchable even though it's flat.
export async function writeSidecar(filePath, meta) {
  const jsonPath = filePath.replace(/\.[^.]+$/, '') + '.json';
  const body = {
    title: meta.title ?? null,
    video_id: meta.videoId ?? null,
    source_url: meta.webpageUrl ?? meta.url ?? null,
    duration_seconds: meta.duration ?? null,
    uploader: meta.uploader ?? null,
    source: meta.source ?? null,
    requested_by: meta.senderId ?? null,
    downloaded_at: new Date().toISOString(),
    file: path.basename(filePath),
  };
  await writeFile(jsonPath, JSON.stringify(body, null, 2), 'utf8');
  return jsonPath;
}
