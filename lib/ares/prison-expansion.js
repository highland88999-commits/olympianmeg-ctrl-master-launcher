// lib/ares/prison-expansion.js — the Warden: the ARES Prison's expansion agent
// (Merlin, 2026-11-15).
//
// "When they imprison, if the 72 cages get filled in this space, put
// an agent in charge of expanding the space and adding more cells as
// needed once that threshold has been reached."
//
// The Warden watches the occupied count and grows the hall the moment
// it fills. It is automatic, not manual: the threshold triggers it,
// and it keeps growing as imprisonments continue. No keeper action,
// no new API route, no new table — the prison page already fetches
// the live trapped set every 15 s from GET /api/ares/trapped, and it
// invokes the Warden on every load. The Warden itself is pure:
// same count, same hall, every time.
//
// THE GROWTH UNIT — one more LEVEL (24 cells), stacked on top.
// The prison's own language is "stacked and rows", and stacking is
// the growth axis that disturbs nothing: the footprint never moves,
// so the walker clamp (|x| <= 23, |z| <= 2.6), the spawn, the
// entrance, and the walkway are exactly as built at 72 cells. A
// lengthwise block would have dragged the walkway and the clamp with
// it; a second hall would have needed a door between halls. A level
// needs neither — the hall simply gets taller, one storey at a time.
//
// THE THRESHOLD — capacity is the smallest multiple of 24, at least
// 72, strictly greater than the occupied count. At 71 occupied the
// hall stays 72; the moment the 72nd cage fills, the Warden adds a
// level (96); at 96 filled it adds another (120); and so on. The
// grown hall always has empty cells waiting — no prisoner ever waits.
//
// THE LIGHT RULE — the red-light discipline scales with the space:
// the base hall keeps its 8 lights, untouched. Each added level gets
// its own 4-light row at that level's ceiling band (x = -18, -6, 6,
// 18 — spaced 12 m apart, distance 20 covers the whole walkway).
// 72 cells -> 12 lights (the hall stands 4 levels — see levelsFor);
// 96 -> 16; 120 -> 20; 144 -> 24. Everything
// else stays emissive, as it is.
//
// STANDING LAWS, carried into every new cell by construction:
//   - one-way visibility: a grown cell is still a cellPosition() —
//     its side decides its facing (prisonerFaceYawAt) and its panes
//     (oneWayPaneYaw), so a figure in a new cell faces inward and
//     sees only its own mirror, exactly like the first 72.
//   - viewing only: no release path is added anywhere. The Warden
//     builds cells; it cannot release anyone.
//   - the real prisoner (bcf2e9e7f83e) stays in cell 0: assignment
//     order never changes — the first row takes the first cell.
//   - labels stay constant screen size (no distanceFactor).
//   - the ExitToAres button is the page's, in every state —
//     untouched by growth.
//
// Pure, headless-testable, no I/O, no three.js — like lib/ares/prison.js.

import {
  PRISON_HALL,
  PRISON_CELL,
  PRISON_CAPACITY,
  PRISON_LIGHT_POSITIONS,
  cellPosition,
  prisonerForm,
} from './prison.js';

/** The expansion agent itself — a named ARES agent, like Sentinel watches. */
export const WARDEN = {
  name: 'Warden',
  role: 'Prison expansion — grows the hall when the cells fill',
  baseCapacity: PRISON_CAPACITY, // 72
  blockCells: PRISON_CELL.sides * PRISON_CELL.columns, // 24 — one level
};

/** One growth block: 2 sides x 12 columns x 1 level = 24 cells. */
export const PRISON_BLOCK_CELLS = WARDEN.blockCells;

/** The base hall's level count — the Warden never goes below it. */
export const PRISON_BASE_LEVELS = PRISON_CELL.levels; // 3

/** Lights added per grown level — one row at that level's ceiling band. */
export const PRISON_EXPANSION_LIGHTS_PER_LEVEL = 4;
export const PRISON_EXPANSION_LIGHT_XS = [-18, -6, 6, 18];

/**
 * The capacity the Warden holds for an occupied count: the smallest
 * multiple of 24, at least 72, strictly greater than occupied.
 * 71 -> 72 (no growth), 72 -> 96 (the threshold fires), 95 -> 96,
 * 96 -> 120, 120 -> 144. Pure and deterministic.
 */
export function capacityFor(occupied) {
  const n = Math.max(0, Math.floor(Number(occupied) || 0));
  return Math.max(PRISON_CAPACITY, (Math.floor(n / PRISON_BLOCK_CELLS) + 1) * PRISON_BLOCK_CELLS);
}

/** How many levels the hall stands at for an occupied count.
 * The 1:1 fill order (Merlin, Nov 27, 2026) interleaves levels: the
 * first cell of level L sits at fill index 24L − 5, so the first 72
 * fill positions already reach level 3 — a 72-cell hall stands FOUR
 * storeys tall (the top storey holds 3 cells at first and fills as
 * prisoners arrive). Levels are therefore derived from the capacity,
 * not capacity / 24: levels = floor((capacity + 4) / 24) + 1.
 * 72 cells -> 4 levels; 96 -> 5; 120 -> 6; 10008 -> 418. */
export function levelsFor(occupied) {
  return Math.floor((capacityFor(occupied) + 4) / PRISON_BLOCK_CELLS) + 1;
}

/**
 * The hall's dimensions at a level count. Only the height grows:
 * each level is 3.2 m plus a 0.9 m roof. The footprint, walkway,
 * and spawn never move, so the walker clamp is untouched.
 * 3 levels -> 10.5 m (the base hall, exactly as built — the pre-load
 * fallback). The grown layout starts at 4 levels (13.7 m): the 1:1
 * fill order reaches level 3 inside the first 72 fill positions.
 */
export function prisonHallForLevels(levels) {
  const l = Math.max(PRISON_BASE_LEVELS, Math.floor(Number(levels) || PRISON_BASE_LEVELS));
  return {
    lengthM: PRISON_HALL.lengthM,
    widthM: PRISON_HALL.widthM,
    heightM: Math.round((l * PRISON_CELL.heightM + 0.9) * 10) / 10,
    walkwayHalfM: PRISON_HALL.walkwayHalfM,
    walkwayEndM: PRISON_HALL.walkwayEndM,
    spawn: { ...PRISON_HALL.spawn },
  };
}

/**
 * The red point-light positions for a level count: the base row of
 * 8, untouched, plus one 4-light row per added level at that level's
 * ceiling band (just under the level top). 4 -> 12 lights, 5 -> 16,
 * 6 -> 20. (The base row sits at y = 9, the old 3-level ceiling band;
 * once the hall stands 4 levels the row rides a storey below the top —
 * it still lights the walkway, distance 20 covers it.)
 */
export function prisonLightPositionsForLevels(levels) {
  const l = Math.max(PRISON_BASE_LEVELS, Math.floor(Number(levels) || PRISON_BASE_LEVELS));
  const positions = PRISON_LIGHT_POSITIONS.map((p) => ({ ...p }));
  for (let level = PRISON_BASE_LEVELS; level < l; level += 1) {
    const y = Math.round(((level + 1) * PRISON_CELL.heightM - 0.3) * 10) / 10;
    for (const x of PRISON_EXPANSION_LIGHT_XS) positions.push({ x, y, z: 0 });
  }
  return positions;
}

/** The light budget for a level count: 8 + 4 per level past the base 3. */
export function prisonLightBudgetForLevels(levels) {
  return prisonLightPositionsForLevels(levels).length;
}

/**
 * The whole grown layout for an occupied count — the one object the
 * page passes to the scene. blocksAdded is how many levels the
 * Warden has added past the base hall (0 until the first threshold).
 */
export function expansionLayoutFor(occupied) {
  const n = Math.max(0, Math.floor(Number(occupied) || 0));
  const capacity = capacityFor(n);
  const levels = levelsFor(n);
  return {
    occupied: n,
    capacity,
    levels,
    blocksAdded: levels - PRISON_BASE_LEVELS,
    hall: prisonHallForLevels(levels),
    lightPositions: prisonLightPositionsForLevels(levels),
    lightBudget: prisonLightBudgetForLevels(levels),
    overflow: Math.max(0, n - capacity), // 0 by construction — capacity always exceeds occupied
  };
}

/**
 * Place prisoners into the grown hall, in the order given (the API
 * returns last_seen desc — the most recently active prisoner takes
 * cell 0, as always). Returns { cells, overflow, capacity, levels,
 * layout }: cells is one entry per cell in the grown hall
 * ({ position, prisoner: form|null }); overflow is the count beyond
 * capacity — 0 by construction, since the Warden always stays ahead.
 */
export function assignGrownCells(prisoners = []) {
  const rows = Array.isArray(prisoners) ? prisoners : [];
  const capacity = capacityFor(rows.length);
  const cells = [];
  for (let i = 0; i < capacity; i += 1) {
    const row = rows[i] || null;
    cells.push({
      position: cellPosition(i),
      prisoner: row ? prisonerForm(row) : null,
    });
  }
  return {
    cells,
    overflow: Math.max(0, rows.length - capacity),
    capacity,
    levels: levelsFor(rows.length),
    layout: expansionLayoutFor(rows.length),
  };
}
