import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';

import { claimNextJob, markDone, markFailed, markSkipped, requeueStale, supabase } from './lib/queue.js';
import { downloadVideo, ytdlpVersion } from './lib/download.js';
import { isAllowedUrl, freeSpaceGB } from './lib/library.js';
import { sendMessage } from './lib/telegram.js';

const run = promisify(execFile);

const POLL_MS = (Number(process.env.POLL_INTERVAL_SECONDS) || 8) * 1000;
const MIN_FREE_GB = Number(process.env.MIN_FREE_GB) || 10;
const LIBRARY_DIR = process.env.LIBRARY_DIR;

let running = true;
let sinceRequeue = 0;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

function fmtDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return ` (${m}m${String(s).padStart(2, '0')}s)`;
}

async function processJob(job) {
  log(`job ${job.id} claimed:`, job.url);

  if (!isAllowedUrl(job.url)) {
    await markFailed(job.id, 'URL host not in allow-list');
    await sendMessage(job.chat_id, `❌ Refused: that link isn't a supported YouTube/Facebook URL.`);
    return;
  }

  const freeGB = await freeSpaceGB(LIBRARY_DIR);
  if (freeGB < MIN_FREE_GB) {
    await markFailed(job.id, `Low disk: ${freeGB.toFixed(1)}GB free (< ${MIN_FREE_GB}GB)`);
    await sendMessage(job.chat_id, `❌ Download skipped — the coaching library disk is low on space (${freeGB.toFixed(1)}GB free).`);
    return;
  }

  try {
    const res = await downloadVideo(job.url, { source: job.source, senderId: job.sender_id });
    if (res.skipped) {
      await markSkipped(job.id, { title: res.title, videoId: res.videoId, filePath: res.filePath });
      await sendMessage(job.chat_id, `↩️ Already in the library: ${res.title}`);
    } else {
      await markDone(job.id, {
        title: res.title, videoId: res.videoId, filePath: res.filePath, duration: res.duration,
      });
      await sendMessage(job.chat_id, `✅ Downloaded: ${res.title}${fmtDuration(res.duration)}`);
    }
    log(`job ${job.id} ${res.skipped ? 'skipped' : 'done'}:`, res.filePath);
  } catch (err) {
    const reason = (err.stderr || err.message || String(err)).toString().trim().split('\n').pop();
    await markFailed(job.id, reason);
    await sendMessage(job.chat_id, `❌ Failed: ${friendlyReason(reason)}`);
    log(`job ${job.id} FAILED:`, reason);
  }
}

// Keep the user-facing failure message short and non-scary.
function friendlyReason(reason) {
  if (/confirm your age|sign in to confirm|not a bot/i.test(reason)) {
    return 'YouTube asked for sign-in/age verification. Set COOKIES_FROM_BROWSER in the agent to fix.';
  }
  if (/Private video|members-only|unavailable/i.test(reason)) return 'the video is private or unavailable.';
  return reason.slice(0, 180);
}

async function loop() {
  while (running) {
    try {
      // Every ~5 minutes, rescue jobs a crashed run left 'running'.
      if (Date.now() - sinceRequeue > 5 * 60 * 1000) {
        await requeueStale();
        sinceRequeue = Date.now();
      }
      const job = await claimNextJob();
      if (job) {
        await processJob(job);
        continue; // drain the queue without waiting
      }
    } catch (err) {
      log('loop error:', err.message);
    }
    await sleep(POLL_MS);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function doctor() {
  const checks = [];
  const ok = (n, v) => checks.push(`  ✅ ${n}: ${v}`);
  const bad = (n, v) => checks.push(`  ❌ ${n}: ${v}`);

  try { ok('yt-dlp', await ytdlpVersion()); } catch (e) { bad('yt-dlp', e.message); }
  try { const { stdout } = await run('ffmpeg', ['-version']); ok('ffmpeg', stdout.split('\n')[0]); }
  catch (e) { bad('ffmpeg', 'not found — brew install ffmpeg'); }

  try { await access(LIBRARY_DIR, constants.W_OK); ok('library dir writable', LIBRARY_DIR); }
  catch { bad('library dir', `not writable: ${LIBRARY_DIR}`); }

  try {
    const gb = await freeSpaceGB(LIBRARY_DIR);
    (gb >= MIN_FREE_GB ? ok : bad)('free space', `${gb.toFixed(1)}GB (min ${MIN_FREE_GB})`);
  } catch (e) { bad('free space', e.message); }

  try {
    const { error, count } = await supabase.from('video_jobs').select('*', { count: 'exact', head: true });
    if (error) throw error;
    ok('supabase queue', `reachable (${count ?? 0} jobs)`);
  } catch (e) { bad('supabase queue', e.message); }

  ok('telegram token', process.env.TELEGRAM_BOT_TOKEN ? 'set' : 'MISSING');

  console.log('\nswingtech-video-agent doctor:\n' + checks.join('\n') + '\n');
  const healthy = !checks.some((c) => c.includes('❌'));
  process.exit(healthy ? 0 : 1);
}

function shutdown() {
  log('shutting down after current job…');
  running = false;
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const mode = process.argv[2];
if (mode === '--doctor') {
  await doctor();
} else if (mode === '--once') {
  const job = await claimNextJob();
  if (job) await processJob(job);
  else log('queue empty');
  process.exit(0);
} else {
  log(`swingtech-video-agent starting (poll ${POLL_MS / 1000}s, library ${LIBRARY_DIR})`);
  await loop();
}
