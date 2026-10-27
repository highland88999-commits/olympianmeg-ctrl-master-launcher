// lib/earth/rendered-tiles.js — Earth 1 rendered-tiles server record
// (Merlin, 2026-10-27: a Supabase table tracking what tiles have
// been rendered, so tiles sent to it render again on load for
// that user).
//
// WHAT ALREADY EXISTED (checked before building, not assumed):
//   - earth_mapped_registry stores ONLY the 16,200-cell 2° coverage
//     bitset (mapped_hex) — where the player has been, never which
//     photographic sheets were built there. No table tracked
//     rendered tiles per user.
//   - The device record (lib/earth/lens-cache.js) remembers built
//     sheets on ONE device only (localStorage, 512 keys, never
//     synced), and nothing on load rebuilt sheets from any server
//     record. This module + the table close exactly that gap.
//   - The tile identity is reused EXACTLY, nothing invented:
//     tileCellKey (lens-cache.js) = preset + zoom + slippy grid
//     origin, e.g. "streetCoarse:z6:-12:34". The server row adds
//     the build job's centre lat/lon so a reload rebuilds the
//     sheet exactly, with no grid inversion.
//
// RENDER-ON-LOAD SHAPE (honest limit, stated plainly): mounted
// sheets are capped hard on phones (near 4, far 2, coarse 3), so
// a reload can never mount a user's whole history at once. The
// restore rebuilds only the recorded sheets NEAR the traveler
// (within two preset radii, nearest first, capped per pool),
// while the normal trail queue + 10 s reconciler cover the rest
// as the traveler moves. The table still holds the full history;
// the load pass is the visible neighbourhood, not the archive.
//
// Pure functions, headless-testable, never throw. The component
// (NexusEarth) owns the fetch, the staging, the flush beat, and
// the pools; this module owns validation, the restore plan, and
// the batching.

import { LENS_PRESETS } from './lens.js';
import { centreDistanceHub } from './render-queue.js';

/** Supabase table (public schema). */
export const RENDERED_TILES_TABLE = 'earth_rendered_tiles';
/** Fetch/record endpoint. */
export const RENDERED_TILES_ROUTE = '/api/earth/rendered-tiles';
/** Roaming presets recorded to the server. The orbital overlook
 *  sheet is deliberately excluded: it is not roaming ground. */
export const RENDERED_RECORD_PRESETS = ['street', 'streetFar', 'streetCoarse', 'streetCoarseWide'];
/** Pool each preset's restore jobs drain through. */
export const RENDERED_RESTORE_POOLS = {
  street: 'near',
  streetFar: 'far',
  streetCoarse: 'coarse',
  streetCoarseWide: 'coarse',
};
/** Restore caps per pool (mounted sheets are capped at near 4 /
 *  far 2 / coarse 3 — building far past the caps only churns
 *  the pools for sheets eviction would drop anyway). */
export const RESTORE_PER_POOL_MAX = { near: 2, far: 2, coarse: 4 };
/** A recorded sheet restores when its centre sits within this
 *  multiple of its own preset radius from the traveler. */
export const RESTORE_RADIUS_FACTOR = 2;
/** Max tiles per record batch (the route enforces the same cap). */
export const RENDERED_RECORD_BATCH_MAX = 500;
/** Max rows the fetch route returns (most recent first). */
export const RENDERED_FETCH_MAX = 2000;

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Validate one staged tile: { tile_key, preset, center_lat,
 *  center_lon }. Returns the sanitized tile, or null when the
 *  shape is wrong (bad preset, bad coords, missing key). Never
 *  throws; a bad tile is dropped, never stored. */
export function validateRenderedTile(t) {
  if (!t || typeof t !== 'object') return null;
  const tileKey = t.tile_key;
  if (typeof tileKey !== 'string' || tileKey.length === 0) return null;
  if (!RENDERED_RECORD_PRESETS.includes(t.preset)) return null;
  const lat = t.center_lat;
  const lon = t.center_lon;
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) return null;
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) return null;
  return { tile_key: tileKey, preset: t.preset, center_lat: lat, center_lon: lon };
}

/** Sanitize a record batch: non-arrays become [], invalid tiles
 *  drop out, duplicates collapse (last wins), capped at `max`
 *  (default RENDERED_RECORD_BATCH_MAX). */
export function sanitizeRenderedTiles(tiles, max = RENDERED_RECORD_BATCH_MAX) {
  if (!Array.isArray(tiles)) return [];
  const byKey = new Map();
  for (const t of tiles) {
    const sane = validateRenderedTile(t);
    if (sane) byKey.set(sane.tile_key, sane);
  }
  return [...byKey.values()].slice(0, max);
}

/** Normalize one fetched row to the restore plan's shape.
 *  Accepts the route's camelCase rows and snake_case rows
 *  alike; returns null for unusable rows. */
export function normalizeRenderedRow(r) {
  if (!r || typeof r !== 'object') return null;
  const tileKey = r.tileKey ?? r.tile_key;
  const lat = r.centerLat ?? r.center_lat;
  const lon = r.centerLon ?? r.center_lon;
  return validateRenderedTile({ tile_key: tileKey, preset: r.preset, center_lat: lat, center_lon: lon });
}

/** Split an array into chunks of at most `size` (last chunk may
 *  be smaller). Non-arrays and non-positive sizes give []. */
export function chunkArray(arr, size) {
  if (!Array.isArray(arr) || !(size > 0)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** The restore plan for one load: recorded sheets near the
 *  traveler become build jobs, nearest first, capped per pool.
 *  `serverTiles` are fetched rows (either spelling); `traveler`
 *  is { lat, lon }. Returns jobs [{ key, lat, lon, presetName,
 *  pool }] where key reuses the trail job format
 *  (preset:lat,lon) so restore jobs dedupe naturally against
 *  live trail jobs. Sheets already mounted are the caller's
 *  problem to filter (pass only unmounted rows) — this plan
 *  answers distance + caps only. Never throws. */
export function buildRestoreJobs(serverTiles, traveler, opts = {}) {
  const perPoolMax = opts.perPoolMax || RESTORE_PER_POOL_MAX;
  const radiusFactor = opts.radiusFactor || RESTORE_RADIUS_FACTOR;
  if (!traveler || !isFiniteNumber(traveler.lat) || !isFiniteNumber(traveler.lon)) return [];
  if (!Array.isArray(serverTiles)) return [];
  const scored = [];
  for (const raw of serverTiles) {
    const row = normalizeRenderedRow(raw);
    if (!row) continue;
    const preset = LENS_PRESETS[row.preset];
    if (!preset) continue;
    const pool = RENDERED_RESTORE_POOLS[row.preset];
    if (!pool) continue;
    const d = centreDistanceHub(traveler, { lat: row.center_lat, lon: row.center_lon });
    if (d > preset.radiusUnits * radiusFactor) continue;
    scored.push({ row, d, pool });
  }
  scored.sort((a, b) => a.d - b.d);
  const counts = { near: 0, far: 0, coarse: 0 };
  const jobs = [];
  for (const s of scored) {
    const cap = perPoolMax[s.pool] ?? 0;
    if (counts[s.pool] >= cap) continue;
    counts[s.pool] += 1;
    jobs.push({
      key: `${s.row.preset}:${s.row.center_lat.toFixed(4)},${s.row.center_lon.toFixed(4)}`,
      lat: s.row.center_lat,
      lon: s.row.center_lon,
      presetName: s.row.preset,
      pool: s.pool,
    });
  }
  return jobs;
}
