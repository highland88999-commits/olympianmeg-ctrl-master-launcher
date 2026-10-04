// lib/tiktok-attribution.js
// TikTok identity + attribution contract for the Live Recordings feature.
// Pure, headless-testable: no browser, no network, no Supabase.
// The TikTok handle belongs on the PERSONAL row of public.profiles
// (one row per (user_id, type); type 'personal' | 'business').
//
// Handle contract:
//   - Bare handle stored, NO leading @.
//   - Charset: letters, digits, underscore, dot — 1 to 24 chars.
//   - `normalizeTikTokHandle` trims, strips ONE leading @, validates.
//   - Returns null for anything that is not a clean, valid handle.

export const TIKTOK_HANDLE_RE = /^[A-Za-z0-9._]{1,24}$/;

// normalizeTikTokHandle(input) -> bare handle or null.
// Accepts "@merlin", "  @merlin  ", "merlin". Rejects "@@merlin"
// (stripping one @ leaves "@merlin", which fails the regex), empty,
// overlong, or any disallowed character. Non-strings -> null.
export function normalizeTikTokHandle(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s.startsWith('@')) s = s.slice(1);
  s = s.trim();
  return TIKTOK_HANDLE_RE.test(s) ? s : null;
}

export function isValidTikTokHandle(input) {
  return normalizeTikTokHandle(input) !== null;
}

// displayTikTokHandle(handle) -> '@merlin' or ''.
// Tolerates a stray @ or blank input: normalizes first.
export function displayTikTokHandle(handle) {
  const h = normalizeTikTokHandle(handle);
  return h ? `@${h}` : '';
}

// tiktokProfileUrl(handle) -> 'https://www.tiktok.com/@merlin' or null.
export function tiktokProfileUrl(handle) {
  const h = normalizeTikTokHandle(handle);
  return h ? `https://www.tiktok.com/@${h}` : null;
}

// buildShareText({ title, tiktokHandle }) -> '"TITLE" — via @handle on Olympus'
// With no valid handle the attribution is skipped entirely:
// '"TITLE" — on Olympus'. Titles are trimmed; a missing title degrades
// gracefully instead of printing undefined.
export function buildShareText({ title, tiktokHandle } = {}) {
  const t = typeof title === 'string' ? title.trim() : '';
  const handle = normalizeTikTokHandle(tiktokHandle);
  return handle ? `"${t}" — via @${handle} on Olympus` : `"${t}" — on Olympus`;
}

// recordingShareUrl(origin, id) -> 'https://<origin>/live-recordings?recording=<id>'
// origin: 'https://olympusverse.com' (no trailing slash enforced by trim).
// Returns null when either input is missing.
export function recordingShareUrl(origin, id) {
  const o = typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
  const i = typeof id === 'string' ? id.trim() : typeof id === 'number' ? String(id) : '';
  if (!o || !i) return null;
  return `${o}/live-recordings?recording=${encodeURIComponent(i)}`;
}
