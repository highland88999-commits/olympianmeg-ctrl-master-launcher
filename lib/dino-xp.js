// lib/dino-xp.js
// COMPANION DINO XP + LEVELS + SAVAGERY (Merlin, 2026-11-26):
// "Raised Dino's should help hunt and in doing so they gain
// experience and level up. As they level up, they become more
// savage."
//
// Pure arithmetic throughout: no three.js, no DOM, no clock.
// The backpack record is the truth — XP and level live on the
// dino item's meta (meta.xp, meta.level), so they survive
// reloads and travel to every realm the backpack lives in,
// exactly like the dino's state ('out' | 'pack').
//
// THE NUMBERS (checked against the world's scale — orc warrior
// 60 HP, captain 150 HP, Saruman 600 HP; the player's blade is
// 34 dmg per 0.45 s swing):
//   XP per kill: warrior 20, captain 50, Saruman 100.
//   XP per damaging hit (no kill): 2. XP per assist (the dino
//   hurt a target the player then finished): 5.
//   Curve: level N -> N+1 costs 50 * (N+1) XP — L1->2 is 100,
//   L9->10 is 500. Total to max level 10 is 2,700 XP: about
//   135 warrior kills, or a long hunt with a captain or two.
//   A level-1 dino needs 10 bites to drop a warrior (6 dmg)
//   and cannot one-shot anything; a level-10 dino hits for 42
//   every 0.7 s — savage, but still ~15 bites for Saruman.

import { isDinoItem, dinoIdOf } from './earth2/breeding.js';

/** The highest level a companion dino reaches. */
export const MAX_DINO_LEVEL = 10;

/** XP for landing the killing blow, by target kind. */
export const XP_KILL = { warrior: 20, captain: 50, boss: 100 };

/** XP for a damaging hit that does not kill. */
export const XP_PER_HIT = 2;

/** XP when a target the dino hurt is finished by the player. */
export const XP_ASSIST = 5;

/** XP to go from `level` to `level + 1` (null at max level). */
export function xpToNextLevel(level) {
  const l = Math.max(1, Math.min(MAX_DINO_LEVEL, Math.floor(Number(level) || 1)));
  if (l >= MAX_DINO_LEVEL) return null;
  return 50 * (l + 1);
}

/** Total XP a dino holds the moment it reaches `level` (L1 = 0). */
export function xpForLevelStart(level) {
  const l = Math.max(1, Math.min(MAX_DINO_LEVEL, Math.floor(Number(level) || 1)));
  return 25 * (l - 1) * (l + 2);
}

/** Total XP needed to reach max level (2,700). */
export const XP_TO_MAX_LEVEL = xpForLevelStart(MAX_DINO_LEVEL);

/** The level a dino with this much total XP sits at. */
export function levelForXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < MAX_DINO_LEVEL && x >= xpForLevelStart(level + 1)) level += 1;
  return level;
}

// ── Savagery ───────────────────────────────────────────────
// Higher level = more savage: harder hits, faster attacks,
// a longer chase, and a readier temper. Aggression is a
// stance, not a coin flip — the agent reads it deterministically:
//   defensive (L1-2): only the owner's target, or whatever just
//     hurt the owner. It guards, it does not go looking.
//   opportunistic (L3-5): the above, plus the nearest hostile
//     inside chase range once the hunt is on.
//   savage (L6+): the nearest hostile inside chase range,
//     always — it goes looking for the fight.
// Growth tempers it: a baby hits softer and runs slower than
// the same dino grown (baby 0.6x damage / 0.7x speed, juvenile
// 0.85x, adult full). A baby level-10 still cannot out-hit an
// adult level-1 — size is real.

export const GROWTH_COMBAT = {
  baby: { dmg: 0.6, speed: 0.7 },
  juvenile: { dmg: 0.85, speed: 0.85 },
  adult: { dmg: 1.0, speed: 1.0 },
};

/** 'defensive' | 'opportunistic' | 'savage' for a level. */
export function aggressionForLevel(level) {
  const l = Math.max(1, Math.min(MAX_DINO_LEVEL, Math.floor(Number(level) || 1)));
  if (l >= 6) return 'savage';
  if (l >= 3) return 'opportunistic';
  return 'defensive';
}

/**
 * The combat stats for a dino at a level (and growth stage).
 * damage: per bite/stomp/swipe. cooldown: seconds between
 * attacks. chaseRange: how far it will run down a target.
 * moveSpeed: m/s on the hunt. aggression: its stance.
 * Table (adult): L1 6 dmg / 1.6 s / 12 m / 5.0 m/s, L5 22 /
 * 1.2 s / 20 m / 6.2 m/s, L10 42 / 0.7 s / 30 m / 7.7 m/s.
 */
export function statsForLevel(level, stage) {
  const l = Math.max(1, Math.min(MAX_DINO_LEVEL, Math.floor(Number(level) || 1)));
  const g = GROWTH_COMBAT[stage] || GROWTH_COMBAT.adult;
  return {
    level: l,
    damage: Math.round((6 + 4 * (l - 1)) * g.dmg),
    cooldown: Number(Math.max(0.7, 1.6 - 0.1 * (l - 1)).toFixed(2)),
    chaseRange: 12 + 2 * (l - 1),
    moveSpeed: Number(((5 + 0.3 * (l - 1)) * g.speed).toFixed(2)),
    aggression: aggressionForLevel(l),
  };
}

/** The full savagery table (adult stage), L1..L10. */
export const SAVAGERY_TABLE = Array.from({ length: MAX_DINO_LEVEL }, (_, i) => statsForLevel(i + 1, 'adult'));

// ── Attacks ────────────────────────────────────────────────
// Reach by attack (metres). The agent picks the attack from
// the dino's build and the shape of the fight — never a canned
// script: bite for a carnivore up close, stomp for a
// herbivore/quadruped, tail swipe when two or more hostiles
// crowd it, charge to close ground beyond bite range.
export const ATTACK_RANGE = { bite: 2.2, tail: 3.5, stomp: 2.5, charge: 8 };

/**
 * Which attack the dino throws: diet/posture from the model
 * registry, dist to the target, nearby = hostiles within 3.5 m.
 * Returns 'bite' | 'tail' | 'stomp' | 'charge' | null (no
 * target in reach at all — the agent keeps closing or heels).
 */
export function pickAttack({ diet, posture, dist, nearby } = {}) {
  const d = Number(dist);
  if (!Number.isFinite(d) || d < 0) return null;
  if (d > ATTACK_RANGE.charge) return null;
  if (d > ATTACK_RANGE.tail && d <= ATTACK_RANGE.charge) return 'charge';
  if ((Number(nearby) || 0) >= 2 && d <= ATTACK_RANGE.tail) return 'tail';
  if (diet === 'carnivore') return d <= ATTACK_RANGE.bite ? 'bite' : 'charge';
  if (posture === 'quadruped') return d <= ATTACK_RANGE.stomp ? 'stomp' : 'charge';
  return d <= ATTACK_RANGE.stomp ? 'stomp' : 'charge';
}

// ── The record (XP persists on the backpack item) ───────────

/** Total XP on a dino item's meta (0 when the record predates XP). */
export function xpOf(entry) {
  const x = entry && entry.meta ? Number(entry.meta.xp) : NaN;
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
}

/** The dino's level — stored on the meta when present, else
 *  derived from its XP so old records level up correctly. */
export function levelOf(entry) {
  const stored = entry && entry.meta ? Number(entry.meta.level) : NaN;
  if (Number.isFinite(stored) && stored >= 1) {
    return Math.max(1, Math.min(MAX_DINO_LEVEL, Math.floor(stored)));
  }
  return levelForXp(xpOf(entry));
}

/**
 * Award XP to a plain { xp, level } pair (pure): clamps at max
 * level (XP stops at 2,700 — a maxed dino banks nothing more).
 * Returns { xp, level, leveledUp, levelsGained }.
 */
export function awardXp({ xp, level } = {}, amount) {
  const startXp = Math.max(0, Math.floor(Number(xp) || 0));
  const startLevel = levelForXp(startXp);
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  const newXp = Math.min(XP_TO_MAX_LEVEL, startXp + add);
  const newLevel = levelForXp(newXp);
  return {
    xp: newXp,
    level: newLevel,
    leveledUp: newLevel > startLevel,
    levelsGained: newLevel - startLevel,
  };
}

/** XP for a kill of this target kind (warrior/captain/boss). */
export function xpForKill(kind) {
  if (kind === 'boss') return XP_KILL.boss;
  return XP_KILL[kind] || XP_KILL.warrior;
}

/**
 * A new item list with one dino's XP moved to the given total
 * (pure — the setter the page persists through; the handle
 * already computed the new total, so this never re-adds).
 */
export function setDinoXp(items, dinoId, xp, level) {
  const x = Math.max(0, Math.min(XP_TO_MAX_LEVEL, Math.floor(Number(xp) || 0)));
  const l = levelForXp(x);
  const want = level == null ? l : Math.max(1, Math.min(MAX_DINO_LEVEL, Math.floor(Number(level) || l)));
  return (Array.isArray(items) ? items : []).map((it) => {
    if (!isDinoItem(it) || dinoIdOf(it) !== dinoId) return it;
    return { ...it, meta: { ...it.meta, xp: x, level: want } };
  });
}

/**
 * A new item list with XP added to one dino (pure). Returns
 * { items, result } — result is awardXp's return, or null
 * when no dino with that id is in the list.
 */
export function withDinoXp(items, dinoId, amount) {
  let result = null;
  const next = (Array.isArray(items) ? items : []).map((it) => {
    if (!isDinoItem(it) || dinoIdOf(it) !== dinoId) return it;
    result = awardXp({ xp: xpOf(it), level: levelOf(it) }, amount);
    return { ...it, meta: { ...it.meta, xp: result.xp, level: result.level } };
  });
  return { items: next, result };
}
