// lib/earth/global-registry.js — Earth 1 GLOBAL team registry helpers
// (Merlin, 2026-10-26: "build the global team registry" — every
// user's swept cells union into ONE Earth total toward Oblivion).
//
// SAME grid and encoding as the personal record, nothing new
// invented: the globe cut into 2° × 2° cells (16,200), one bitset
// per user, stored as a 4,050-character lowercase hex string (see
// lib/earth/mapping-progress.js). The registry table holds one row
// per user (user_id, mapped_hex, updated_at); the global total is
// the OR-union of all rows, so re-syncs and overlaps never
// double-count and a user's row never shrinks.
//
// PRIVACY: only the aggregate ever leaves the server — the
// tracker shows the team percentage and nothing else. No per-user
// breakdown, no names, no "who mapped what". The aggregate route
// (app/api/earth/mapped-global) reads rows with the service-role
// client and returns covered cells + percentage only.
//
// Pure functions, headless-testable, never throw. The migration
// itself lives in supabase/migrations/
// 20261026_earth_global_registry.sql and is NOT run by code —
// Merlin runs it in the Supabase dashboard SQL Editor. Until
// then the aggregate route answers "not ready" and the tracker
// keeps showing the personal number (see resolveTrackerDisplay).

import {
  TOTAL_CELLS,
  countBits,
  createBitset,
  parseBitset,
  serializeBitset,
  unionInto,
} from './mapping-progress.js';

// Re-exported for the aggregate route: app/api/earth/mapped-global
// imports TOTAL_CELLS from this module (it was imported here but
// never re-exported, which failed the Next build).
export { TOTAL_CELLS };

/** Registry table name (public schema). */
export const REGISTRY_TABLE = 'earth_mapped_registry';
/** Aggregate endpoint the tracker polls. */
export const GLOBAL_ROUTE = '/api/earth/mapped-global';

/** Clamp a percentage into [0, 100]; non-numbers become 0. */
export function clampPercent(p) {
  return Math.max(0, Math.min(100, Number.isFinite(p) ? p : 0));
}

/** OR-merge an incoming personal bitset hex into a registry row's
 *  hex. The union rule, applied to one row: the result never
 *  loses cells (a subset re-sync cannot shrink the row), and
 *  re-merging the same hex is a no-op. Invalid incoming hex
 *  leaves the row untouched; a missing/invalid existing row
 *  starts from the incoming hex. Returns the merged hex string,
 *  or null when neither side is a valid v1 bitset. */
export function mergeRegistryHex(existingHex, incomingHex) {
  const incoming = parseBitset(incomingHex);
  if (!incoming) {
    const existing = parseBitset(existingHex);
    return existing ? serializeBitset(existing) : null;
  }
  const existing = parseBitset(existingHex);
  if (!existing) return serializeBitset(incoming);
  unionInto(existing, incoming);
  return serializeBitset(existing);
}

/** Union a list of registry row hexes into one global bitset.
 *  Invalid rows are skipped silently (a corrupt row must never
 *  break the team total). Returns { hex, coveredCells, percent }.
 *  An empty list is 0 cells / 0% — the honest answer for a table
 *  that exists but has no rows yet. */
export function unionRegistryHexes(hexes) {
  const union = createBitset();
  if (Array.isArray(hexes)) {
    for (const hex of hexes) {
      const bits = parseBitset(hex);
      if (bits) unionInto(union, bits);
    }
  }
  const coveredCells = countBits(union);
  return {
    hex: serializeBitset(union),
    coveredCells,
    percent: (coveredCells / TOTAL_CELLS) * 100,
  };
}

/** Decide what the tracker pill shows. The team percentage wins
 *  whenever the registry answers with a real number (even 0 —
 *  a table that exists but has no rows yet honestly reads 0%).
 *  When the registry is not ready (null, NaN, missing), the
 *  personal number stands — and it is labeled as personal, never
 *  presented as the team number. Returns { percent, scope } with
 *  scope 'team' | 'personal'. */
export function resolveTrackerDisplay({ globalPercent, personalPercent }) {
  if (typeof globalPercent === 'number' && Number.isFinite(globalPercent)) {
    return { percent: clampPercent(globalPercent), scope: 'team' };
  }
  return { percent: clampPercent(personalPercent), scope: 'personal' };
}
