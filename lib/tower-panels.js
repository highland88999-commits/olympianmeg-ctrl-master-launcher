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
