// lib/jupiter2/guard.js — the cave-mouth guard dragons, pure logic.
//
// Merlin's canon (Nov 19 ~00:20): BOTH dragons — Stormwing +
// Aureline — guard the cave ENTRANCE (at the mouth, not inside).
// Nov 19 ~00:23 correction: users do NOT have to kill either dragon
// — getting AROUND them is enough to reach the lever. Killing is
// optional; killing either one drops the shield upgrade bonus
// (lib/oblivion/state.js — carries over to Earth 2, server-side).
// Nov 19 ~00:24: a killed dragon RESPAWNS for the next user — the
// guard is always there.
//
// HOW "GETTING AROUND" WORKS (read from the hunt law, not invented):
// the dragons hunt only when hungry (hunger ≥ 0.72, cycling 0→1
// over 210 s — hungry ~28% of the time); the rest of the time they
// patrol and do not chase. On foot, slip past in the not-hungry
// window. Riding the speeder, the walker is NOT prey (mounted =
// immune) at 28 m/s. Fighting is the bonus path.
//
// GUARD RESPAWN — the honest gap in the natural cycle: the J2
// lifecycle (lib/jupiter2/operators.js lifeFor) leaves a killed
// creature's slot decomposing for 30 DAYS before the next
// generation is born. That would leave the cave mouth unguarded
// for a month after a kill, which breaks "the guard is always
// there". So guard dragons get a guard-specific rebirth:
// GUARD_RESPAWN_MS after any guard death, the slot is alive again
// (the scene clears the recorded kill — lifeFor's clock walk then
// reads the current generation alive). The killer keeps a
// comfortable window to reach the lever (13 m from mouth to lever);
// the next user finds a live dragon. The 30-day cycle still governs
// every non-guard creature.

import { dirAt, dirToDeck, leverCaveMouthPoint } from './planet.js';
import { CAVE_MOUTH_THETA_RAD, MOUNTAIN_AZIMUTH } from './planet.js';
// The slot knowledge lives in operators.js (the roster owner) —
// this module re-exports it so the scene imports guard law from
// one place.
import { isGuardDragonSlot, GUARD_DRAGON_SLOTS } from './operators.js';

export { isGuardDragonSlot, GUARD_DRAGON_SLOTS };

/** The two guard dragons' model keys (lib/jupiter2/operators.js DRAGON_MODEL_KEYS). */
export const GUARD_DRAGON_MODEL_KEYS = Object.freeze(['sky-dragon', 'aureline']);

/** True when a creature's model key is one of the guard dragons. */
export function isGuardDragon(modelKey) {
  return GUARD_DRAGON_MODEL_KEYS.includes(String(modelKey || ''));
}

/**
 * The guard dragon's server key for the shield grant:
 * sky-dragon → 'stormwing', aureline → 'aureline'. Anything else
 * grants nothing.
 */
export function dragonShieldKeyFor(modelKey) {
  if (modelKey === 'sky-dragon') return 'stormwing';
  if (modelKey === 'aureline') return 'aureline';
  return null;
}

/** Guard rebirth: how long after a guard death the slot is alive again (5 min — worker's call). */
export const GUARD_RESPAWN_MS = 5 * 60 * 1000;

/** Guard patrol: how far a guard dragon wanders from the mouth while holding station. */
export const GUARD_PATROL_RADIUS_M = 8;

/** Deck coordinates of the cave mouth — the guards' home. */
export function guardHomeDeck() {
  return dirToDeck(dirAt(CAVE_MOUTH_THETA_RAD, MOUNTAIN_AZIMUTH));
}

/** The 3D cave-mouth point — the guards' home on the sphere. */
export function guardHomePoint() {
  return leverCaveMouthPoint();
}

/**
 * True when a guard's recorded kill has aged past the rebirth
 * window: the slot is alive again. entry: the brain-tick entry
 * ({ dead, guardRebornAtMs }).
 */
export function guardRebirthDue(entry, nowMs = Date.now()) {
  if (!entry || !entry.dead) return false;
  const at = Number(entry.guardRebornAtMs);
  return Number.isFinite(at) && nowMs >= at;
}
