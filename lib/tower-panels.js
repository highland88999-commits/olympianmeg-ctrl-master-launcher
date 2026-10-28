// lib/tower-panels.js — Deterministic ad-panel assignment for the hub god
// towers. Pure helpers (headless-testable): given a tower index, return the
// four billboard slots its panels show.
//
// Panel 0 is ALWAYS Merlin's native stake.com placement — his own inventory,
// never removed, never rotated out. Panels 1–3 rotate through the rest of
// the real billboard inventory (lib/partners.js: 7 affiliate partners,
// Betty, YOUR AD HERE fillers) with a fixed stride, so:
//   - no tower ever shows the same slot twice,
//   - every partner key appears on at least one tower across the ring of 10,
//     which matters because spawn sits in the middle with all ten towers
//     visible (Merlin's hub design, 2026-09-30),
//   - the assignment is stable across reloads (no layout shift, no
//     hydration surprise).

import { billboardInventory, STAKE_SLOT } from './partners.js';

export const PANELS_PER_TOWER = 4;
export const TOWER_COUNT = 10;
// Ad-space screen size (Merlin, 2026-10-20: "make the screens for the
// ad spaces bigger"). Every billboard panel on every satellite scales
// uniformly by this factor about its own centre — face, border, backing,
// CTA strip and the number badge (a child of the panel) all grow
// together, so the creative is never stretched. Geometry-audited at
// 1.5×: neighbouring panels on the same tower keep 2.72 world units of
// clearance, the panel back clears the flared skirt by 0.56 world, the
// farthest panel point reaches only 20.2 of the 62.0 world units
// between adjacent towers, and everything stays ~7 world units inside
// the r=22 flight collider.
export const PANEL_SCALE = 1.5;
// Stride coprime-ish to the rotating pool so consecutive towers land on
// different partners; 3 panels per tower, pool of 11 → full coverage.
const STRIDE = 3;

/**
 * The four billboard slots for tower `towerIndex` (0-based, matching the
 * GOD_TOWER_SPOTS order). Returns [stakeSlot, slotA, slotB, slotC].
 */
export function panelsForTower(towerIndex) {
  const slots = billboardInventory();
  const stake =
    slots.find((s) => s.key === STAKE_SLOT.key) || { ...STAKE_SLOT };
  const rest = slots.filter((s) => s.key !== stake.key);
  const n = rest.length;
  const panels = [stake];
  for (let k = 1; k < PANELS_PER_TOWER; k++) {
    const idx = (((towerIndex * STRIDE + (k - 1)) % n) + n) % n;
    panels.push(rest[idx]);
  }
  return panels;
}

/**
 * The billboard number for one panel (Merlin, 2026-10-20): the
 * BOARD number — the numbering lives on the inventory itself, in
 * ONE continuous run across the whole ring — tower 0 (first in
 * GOD_TOWER_SPOTS band order) carries boards 1–4, tower 1 carries
 * 5–8, …, tower 10 carries 41–44. Within a tower, panels are
 * numbered in panelsForTower order 0–3. This is the manager /
 * manifest / override address for a board: manifest keys,
 * override lookups (lib/billboards/overrides.js), and the video
 * preload list (lib/billboards/panel-video.js) all use it, and
 * all three validate it to 1–44. It is NOT the badge visitors
 * see on the middle level anymore — that badge is
 * middleLevelBillboardNumberFor below. This replaces the old
 * single number that floated under each orbiting satellite.
 */
export function billboardNumberFor(towerIndex, panelIndex) {
  return towerIndex * PANELS_PER_TOWER + panelIndex + 1;
}

// ---- Tower LEVELS (Merlin, 2026-10-27: "It's levels") ----
// A tower stacks billboard levels down its pillar: Level 1 TOP
// (Merlin: "Multiverse = multi level one"), Level 2 MIDDLE, Level 3 BOTTOM, with a name
// level and ring breaks between levels. Display badges run
// TOP TO BOTTOM (Merlin, 2026-10-27: "Make sure you number
// them from top to bottom"): top 1–44, middle 45–88, bottom
// 89–132, for 3 × 44 = 132 faces per tower ring. Within each
// level the rotational face order is unchanged (tower/panel
// order). The middle level is the current 44 boards
// ("currently there" in his sketch): its boards keep their
// 1–44 board numbers for the manager, manifest, queue,
// playlist, pricing, and cap — only the badge visitors see
// moves, to 45–88. Levels 1 and 3 are house-only for now,
// with display badges only (code only, not a product
// decision): they are NOT wired into the manager, manifest,
// queue, playlist, pricing, or cap — every new face plays
// the same house video through the existing panel video
// path, and opens no new inventory for sale. Level names
// are internal only: no level-name text is ever rendered.
export const TOP_LEVEL_BADGE_BASE = 0;
export const MIDDLE_LEVEL_BADGE_BASE = 44;
export const BOTTOM_LEVEL_BADGE_BASE = 88;

/**
 * Display badge numbers, top to bottom: top 1–44, middle
 * 45–88, bottom 89–132. The top badge equals the board
 * number, the middle badge is the board number + 44, and
 * the bottom badge is the board number + 88.
 */
export function topLevelBillboardNumberFor(towerIndex, panelIndex) {
  return TOP_LEVEL_BADGE_BASE + billboardNumberFor(towerIndex, panelIndex);
}

export function middleLevelBillboardNumberFor(towerIndex, panelIndex) {
  return MIDDLE_LEVEL_BADGE_BASE + billboardNumberFor(towerIndex, panelIndex);
}

export function bottomLevelBillboardNumberFor(towerIndex, panelIndex) {
  return BOTTOM_LEVEL_BADGE_BASE + billboardNumberFor(towerIndex, panelIndex);
}

// The shipped house creative (public/billboards/manifest.json, house
// entry on every board 1–44): the fallback when a slot carries no
// house entry of its own (e.g. a solo board, whose override holds
// only the buyer's ad). New levels never show a paid or solo
// creative: without this fallback a solo number's new level would
// have nothing house to show.
export const HOUSE_FALLBACK_ENTRY = {
  company: 'Olympus',
  link: 'https://olympusverse.com/request-billboard',
  creativeType: 'video',
  creativeUrl: '/billboards/house-ad-space.mp4',
  house: true,
};

/**
 * The house-only slot for a new-level panel: the same slot with
 * its entries replaced by the single house entry — the slot's own
 * house entry when it has one (so a re-cut house creative follows
 * the manifest), else the shipped house fallback. One entry means
 * the face stays static (no rotation timer) and the existing panel
 * video path plays the house video through the shared record.
 * The slot key is preserved so the stake face-texture path still
 * recognizes a stake slot; the badge number (top 1–44, middle
 * 45–88, bottom 89–132) is assigned by the caller, not here.
 */
export function houseLevelSlot(slot) {
  const entries = Array.isArray(slot?.entries) ? slot.entries : null;
  const house = entries ? entries.find((e) => e && e.house === true) : null;
  const entry = house || HOUSE_FALLBACK_ENTRY;
  return {
    ...slot,
    entries: [entry],
    creativeType: entry.creativeType,
    creativeUrl: entry.creativeUrl,
    creatives: [],
  };
}
