// lib/earth/lens-cache.js — the device record of which Earth lens
// cells have been rendered (Merlin, 2026-10-20: "make it so the
// tiles render and stay permanently once rendered — what is
// rendered becomes permanent for all users").
//
// This module is the DEVICE half of that design, buildable today:
// every lens sheet NexusEarth finishes building records its tile
// cell here (localStorage, deduped, capped, most-recent-last), so
// the map a user has revealed is remembered across sessions and a
// returning user's mapped area is on record before they move.
//
// The GLOBAL half — a server coverage registry making rendered
// tiles permanent FOR ALL USERS, plus the "post oblivion" event
// when the whole Earth is mapped — is designed in
// ~/workspace/goals/earth-tile-drop-to-street-view/GOAL.md and
// waits on a Supabase table (not built yet). The cell keys used
// here are deliberately the same identity the registry will use:
// preset + zoom + slippy grid origin, so device records can be
// backfilled into the global map unchanged.
//
// Pure functions with an injectable storage — headless-testable,
// never throws (private mode / quota / SSR all degrade to "no
// record", never a crash).

/** localStorage key for the rendered-tile record. */
export const RENDERED_TILES_KEY = 'olympus.earth.renderedTiles.v1';
/** Cap on stored cell keys (oldest evicted). At street zoom a cell
 *  is a 16×16 ESRI tile block ≈ 1.4° across; 512 cells is a lot of
 *  mapped Earth for a ~10 KB record. */
export const MAX_RENDERED_TILE_KEYS = 512;

/** The stable identity of a built lens sheet: which preset, at
 *  which zoom, anchored at which slippy-grid origin. */
export function tileCellKey(presetName, plan) {
  if (!presetName || !plan) return null;
  return `${presetName}:z${plan.zoom}:${plan.gridLeft}:${plan.gridTop}`;
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** All recorded rendered-cell keys, oldest first. */
export function loadRenderedTileKeys(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RENDERED_TILES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((k) => typeof k === 'string');
  } catch {
    return [];
  }
}

/** Record a rendered cell key: deduped, most-recent-last, capped.
 *  Returns the list as persisted after the write (empty when
 *  storage is unavailable or refuses — never a phantom record).
 *  Never throws. */
export function recordRenderedTileKey(key, storage = defaultStorage()) {
  const list = loadRenderedTileKeys(storage);
  if (!key || !storage) return list;
  const next = [...list.filter((k) => k !== key), key];
  while (next.length > MAX_RENDERED_TILE_KEYS) next.shift();
  try {
    storage.setItem(RENDERED_TILES_KEY, JSON.stringify(next));
  } catch {
    // Quota/private mode: nothing persisted; the re-read says so.
  }
  return loadRenderedTileKeys(storage);
}
