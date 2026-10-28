// lib/broadcast/voice-changer.js — the vocal broadcast system, shared bits.
//
// One job: Merlin holds a mic button, his voice goes through a changer,
// and every user on the site hears the changed voice. Delivery follows the
// house pattern (DB-style polling, no websockets, no Realtime): the clip
// lands in a public Supabase Storage bucket and a tiny latest.json pointer
// tells every open page a new broadcast exists. Polling, not streaming:
// a broadcast arrives seconds after release, not sub-second live. True
// live streaming (an SFU/TURN relay) is a later step, not this one.
//
// Owner-only on the sending side: the API routes check the keeper's email
// server-side (lib/owner.js). Listening is public — announcements are
// meant for every user.

export const BROADCAST_BUCKET = 'broadcasts';
export const BROADCAST_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per clip
export const BROADCAST_MAX_SECONDS = 120; // 2-minute cap per announcement
export const BROADCAST_POLL_MS = 5000;

export const BROADCAST_PRESETS = {
  original: { label: 'Original', pitch: 1, robot: false },
  deep: { label: 'Deep', pitch: 0.7, robot: false },
  high: { label: 'High', pitch: 1.45, robot: false },
  robot: { label: 'Robot', pitch: 0.9, robot: true },
};

export const BROADCAST_AUDIO_TYPES = ['audio/webm', 'audio/mp4'];

/** Strip codec parameters so 'audio/webm;codecs=opus' matches the allowlist. */
export function normalizeAudioType(raw) {
  return String(raw || '').split(';')[0].trim().toLowerCase();
}

/** Pick the first recorder mime the browser supports, or '' for the default. */
export function pickMime(candidates) {
  try {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
  } catch {}
  return '';
}

/** A broadcast clip path must live under the sender's own clips folder. */
export function isBroadcastPath(path, userId) {
  if (typeof path !== 'string' || typeof userId !== 'string') return false;
  if (path.includes('..') || path.startsWith('/')) return false;
  const prefix = `clips/${userId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes('/') && /\.(webm|mp4)$/i.test(rest);
}

/** Shape-check the latest.json pointer before any page trusts it. */
export function validateLatest(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const audioUrl = typeof obj.audioUrl === 'string' ? obj.audioUrl : '';
  if (!/^https:\/\//.test(audioUrl)) return null;
  if (!Object.prototype.hasOwnProperty.call(BROADCAST_PRESETS, obj.preset)) return null;
  if (!Number.isFinite(Number(obj.createdAt))) return null;
  return {
    id: typeof obj.id === 'string' ? obj.id : audioUrl,
    audioUrl,
    preset: obj.preset,
    durationMs: Number(obj.durationMs) || 0,
    createdAt: Number(obj.createdAt),
  };
}

export function latestJsonUrl(base) {
  return `${String(base || '').replace(/\/$/, '')}/storage/v1/object/public/${BROADCAST_BUCKET}/latest.json`;
}
