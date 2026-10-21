// lib/concourse-bg.js — the Concourse box backdrop preference.
//
// Pure functions — unit tested in tests/concourse-settings.test.mjs.
// No DOM, no storage here; Concourse.jsx owns persistence (localStorage
// instant cache + the per-account `concourse_bg` ui-state key).
//
// Shape:
//   { kind: 'default' }                  — the shipped artwork
//   { kind: 'image', url: 'https://…' }  — the user's own photo
//   { kind: 'video', url: 'https://…' }  — the user's own clip
// Anything malformed resolves to the default: the box always has a
// backdrop, never a hole.

export const CONCOURSE_BG_ART = '/concourse-icons/background-default.webp';

// Upload caps for a phone backdrop (checked client-side in the
// Settings panel and again server-side by the signed-URL route).
export const BG_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const BG_VIDEO_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
export const BG_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const BG_VIDEO_MIME = ['video/mp4', 'video/webm'];

const URL_MAX = 1000;

/**
 * Validate a concourse_bg preference. Returns the clean shape or
 * null for junk — the ui-state route rejects null with a 400, and
 * resolveConcourseBg falls back to the default instead.
 */
export function sanitizeConcourseBg(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (v.kind === 'default') return { kind: 'default' };
  if (v.kind !== 'image' && v.kind !== 'video') return null;
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  if (!url || url.length > URL_MAX) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return { kind: v.kind, url };
}

/** The backdrop to render: the stored preference, or the default art. */
export function resolveConcourseBg(v) {
  return sanitizeConcourseBg(v) || { kind: 'default' };
}

/**
 * Validate a background upload request ({ contentType, sizeBytes })
 * for the signed-URL route. Mirrors the caps the Settings panel
 * checks before asking, so the two can never drift apart.
 */
export function validateBackgroundUpload(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid upload request.' };
  const contentType = String(raw.contentType || '').toLowerCase().split(';')[0].trim();
  const isImage = BG_IMAGE_MIME.includes(contentType);
  const isVideo = BG_VIDEO_MIME.includes(contentType);
  if (!isImage && !isVideo) {
    return {
      ok: false,
      error: 'That file type is not allowed. Use JPG, PNG, WebP or GIF for a photo, MP4 or WebM for a video.',
    };
  }
  const sizeBytes = Math.round(Number(raw.sizeBytes));
  const max = isImage ? BG_IMAGE_MAX_BYTES : BG_VIDEO_MAX_BYTES;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > max) {
    return { ok: false, error: `File is too large (max ${Math.round(max / 1024 / 1024)} MB).` };
  }
  const ext = contentType === 'image/jpeg' ? 'jpg'
    : contentType === 'image/png' ? 'png'
    : contentType === 'image/webp' ? 'webp'
    : contentType === 'image/gif' ? 'gif'
    : contentType === 'video/mp4' ? 'mp4'
    : 'webm';
  return { ok: true, value: { contentType, sizeBytes, ext, media: isImage ? 'image' : 'video' } };
}
