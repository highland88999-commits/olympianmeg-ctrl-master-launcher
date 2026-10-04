// lib/live-recordings-queue.js
// Pure helpers for the "Feature on TikTok" queue used by the Live Recordings
// feature. The tiktok_post_queue table is created by a not-yet-run migration;
// all Supabase access goes through the browser client at call time so a
// missing table produces an honest "not set up yet" message instead of a crash.
//
// The row lifecycle (v2 design, see ~/workspace/live-recordings/TIKTOK_INTEGRATION.md):
//   queued -> posting -> posted | failed
// A server worker claims `queued` rows, uploads the video, DIRECT_POSTs with
// the attribution caption, then marks the row posted/failed.

export const TIKTOK_POST_QUEUE_TABLE = 'tiktok_post_queue';

export const TIKTOK_QUEUE_STATUS_QUEUED = 'queued';
export const TIKTOK_QUEUE_STATUS_POSTING = 'posting';
export const TIKTOK_QUEUE_STATUS_POSTED = 'posted';
export const TIKTOK_QUEUE_STATUS_FAILED = 'failed';

/**
 * Build the exact row inserted into tiktok_post_queue when a recording owner
 * requests a TikTok feature. Pure function — no side effects, no imports.
 */
export function buildFeaturePayload(recording, userId) {
  return {
    recording_id: recording?.id ?? null,
    requested_by: userId ?? null,
    status: TIKTOK_QUEUE_STATUS_QUEUED,
  };
}

/**
 * Validate a feature payload before insert. Returns an array of human-readable
 * problems (empty = valid). Pure function.
 */
export function validateFeaturePayload(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') return ['payload is missing'];
  if (!payload.recording_id) problems.push('recording_id is required');
  if (!payload.requested_by) problems.push('requested_by is required (user must be signed in)');
  if (payload.status !== TIKTOK_QUEUE_STATUS_QUEUED) {
    problems.push(`status must be '${TIKTOK_QUEUE_STATUS_QUEUED}' on insert`);
  }
  return problems;
}

/**
 * True when a Supabase/PostgREST error means the queue table simply doesn't
 * exist yet (migration not run) — not a real insert failure.
 */
export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42P01' || // PostgreSQL: undefined_table
    /relation .* does not exist/i.test(message) ||
    /table .* (does not exist|not found)/i.test(message) ||
    /could not find the table/i.test(message) // PostgREST PGRST205 wording
  );
}
