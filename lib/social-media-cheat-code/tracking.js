// lib/social-media-cheat-code/tracking.js
// Per-account, PER-PLATFORM check state for the Social Media
// Cheat Code rooms (Merlin, 2026-10-26): each account tracks its
// OWN pieces done — never shared, never global, and no account
// ever sees or overwrites another account's checks. Switching
// platforms never corrupts tracking: state is keyed by platform
// + piece, so a TikTok check can never falsely mark a Facebook
// piece done.
//
// The server record lives in /api/ui-state under
// `cheat_code_checks` (same pattern as the backpack/concourse
// keys: localStorage instant cache, DB wins on login); guests
// keep a device-only record.
//
// Shape: { [platformId]: { [pieceIndex]: true } } — only DONE
// pieces persist. An unchecked piece is simply absent: nothing
// is ever faked into a check, and unchecking deletes the entry.

import { PLATFORM_IDS, platformPieceCount } from './platforms.js';

export const CHEAT_CODE_CHECKS_LS_KEY = 'olympus.cheatCodeChecks.v1';

// Clean a client-supplied checks map. Returns null when the input
// is not an object at all (the route rejects that with a 400);
// otherwise returns only valid entries: known platform ids, each
// mapping integer piece indexes in range to exactly `true`.
// Anything else is dropped, never stored.
export function sanitizeCheatCodeChecks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [platform, pieces] of Object.entries(value)) {
    if (!PLATFORM_IDS.includes(platform)) continue;
    if (!pieces || typeof pieces !== 'object' || Array.isArray(pieces)) continue;
    const count = platformPieceCount(platform);
    const kept = {};
    for (const [k, v] of Object.entries(pieces)) {
      if (v !== true) continue;
      const n = Number(k);
      if (!Number.isInteger(n) || n < 0 || n >= count) continue;
      kept[n] = true;
    }
    if (Object.keys(kept).length) out[platform] = kept;
  }
  return out;
}

export function loadLocalChecks() {
  try {
    const raw = localStorage.getItem(CHEAT_CODE_CHECKS_LS_KEY);
    if (!raw) return {};
    return sanitizeCheatCodeChecks(JSON.parse(raw)) || {};
  } catch {
    return {};
  }
}

export function saveLocalChecks(checks) {
  try {
    localStorage.setItem(CHEAT_CODE_CHECKS_LS_KEY, JSON.stringify(sanitizeCheatCodeChecks(checks) || {}));
  } catch {}
}
