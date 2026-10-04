// lib/live-recordings/recordings.js
// Pure helpers for the Live Recordings community feed.
// Safe to import from client components, API routes, and plain Node tests.
//
// Attribution rule (contract with the TikTok worker): the @tiktok handle is
// FROZEN on the recording row at post time (live_recordings.tiktok_handle).
// If the user's profile handle changes later, old recordings keep their
// snapshot — attribution never rewrites history. The current profile handle
// is only a FALLBACK for rows posted before the snapshot column existed.

/** Snapshot a TikTok handle from a personal profile row (or null). */
export function snapshotHandle(profileRow) {
  if (!profileRow || typeof profileRow !== 'object') return null;
  const raw = profileRow.tiktok_handle;
  if (typeof raw !== 'string') return null;
  const h = raw.trim();
  return h ? h : null;
}

/**
 * Resolve the handle to display for a recording:
 *   1. the frozen row snapshot (live_recordings.tiktok_handle), then
 *   2. the poster's current personal profile handle, then
 *   3. null (no handle known — UI must not invent one).
 */
export function resolveRecordingHandle(recording, profileRow) {
  const snapshot = snapshotHandle(recording);
  if (snapshot) return snapshot;
  return snapshotHandle(profileRow);
}

/** Newest-first ordering for recording rows (non-mutating). */
export function sortNewestFirst(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    const ta = a && a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b && b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
  return list;
}

export const RECORDING_TITLE_MAX = 120;

/** Clean a user-typed title before upload; returns '' when unusable. */
export function sanitizeRecordingTitle(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\0/g, '').trim().slice(0, RECORDING_TITLE_MAX);
}
