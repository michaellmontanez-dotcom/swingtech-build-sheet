import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see .env.example)');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

// Atomically grab the next queued job, or null if the queue is empty.
export async function claimNextJob() {
  const { data, error } = await supabase.rpc('claim_next_video_job');
  if (error) throw new Error(`claim_next_video_job failed: ${error.message}`);
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function markDone(id, { title, videoId, filePath, duration }) {
  const { error } = await supabase
    .from('video_jobs')
    .update({
      status: 'done',
      title,
      video_id: videoId,
      file_path: filePath,
      duration,
      error: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`markDone failed: ${error.message}`);
}

export async function markSkipped(id, { title, videoId, filePath }) {
  const { error } = await supabase
    .from('video_jobs')
    .update({
      status: 'skipped',
      title,
      video_id: videoId,
      file_path: filePath,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`markSkipped failed: ${error.message}`);
}

export async function markFailed(id, message) {
  const { error } = await supabase
    .from('video_jobs')
    .update({
      status: 'failed',
      error: String(message).slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`markFailed failed: ${error.message}`);
}

export async function requeueStale() {
  const { error } = await supabase.rpc('requeue_stale_video_jobs', { max_minutes: 30 });
  if (error) console.warn('requeue_stale_video_jobs:', error.message);
}
