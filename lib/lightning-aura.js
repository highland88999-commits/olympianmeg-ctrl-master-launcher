// lib/lightning-aura.js — THE SHARED LIGHTNING-AURA LAW (Merlin,
// Nov 16 ~00:02, Jupiter 2 order; extended to the MonsterVerse
// Nov 16 ~00:11: "That in both Jupiter 2 and the monster verse").
//
// Every lightning monster is a SOURCE of lightning: a 59 m aura
// around it, inside which streaks strike and burn everything they
// touch. The colours are Merlin's own:
//   lightning monsters — WHITE-YELLOW streaks
//   dragons            — RED streaks
//   demobats           — YELLOW streaks
// The aura is the monster's attack: it is always on (it does not
// wait for the hunt decision — a monster crackles whether or not
// it has spotted you), and the hunt (seek / chase) is what closes
// the distance until the prey is inside it.
//
// NUMBERS — the radius is Merlin's (59 m, exact). The burn numbers
// are the worker's call, stated plainly (Merlin ordered burn
// damage, not the numbers): a streak lands 8 damage on the hit
// and lights a burn of 6/s for 3 s (26 total per streak if the
// burn runs its course). A streak fires at most once per 1.5 s
// at one target. Walker HP 100 is the house pattern (Earth 2 /
// Hollow Earth PLAYER_MAX_HP); monster prey HP 100 is the same
// number by stated convention, so a demobat caught in a lightning
// monster's aura dies on the same law as the walker.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly, and both Jupiter 2 (lib/jupiter2/operators.js) and
// Hollow Earth (app/hollow-earth/spawns.js) import it.

export const AURA_R_M = 59;
export const BURN_HIT_DMG = 8;
export const BURN_DPS = 6;
export const BURN_SECONDS = 3;
export const STRIKE_INTERVAL_S = 1.5;
export const STRIKE_INTERVAL_MS = STRIKE_INTERVAL_S * 1000;
export const WALKER_MAX_HP = 100;
export const MONSTER_PREY_HP = 100;

/** Streak colours per monster kind — Merlin's law, pinned. */
export const LIGHTNING_COLORS = Object.freeze({
  'lightning-monster': Object.freeze({ core: '#fffbe0', glow: '#ffe14d', label: 'white-yellow' }),
  dragon: Object.freeze({ core: '#ff6a5a', glow: '#ff1e1e', label: 'red' }),
  demobat: Object.freeze({ core: '#fff9c4', glow: '#ffe14d', label: 'yellow' }),
});

/** The streak colour for a monster kind, or null when the kind carries no lightning. */
export function lightningColorFor(kind) {
  if (!kind) return null;
  if (kind === 'dragon') return LIGHTNING_COLORS.dragon;
  if (kind === 'lightning-monster') return LIGHTNING_COLORS['lightning-monster'];
  if (kind === 'demobat') return LIGHTNING_COLORS.demobat;
  return null;
}

/** True when the kind is a lightning source at all. */
export function isLightningSource(kind) {
  return lightningColorFor(kind) !== null;
}

/** 3D distance between two {x, y, z} points (y defaults to 0 — flat callers pass x/z only). */
export function auraDistance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dy, dz);
}

/**
 * One monster's aura at an instant: its radius (always 59 m),
 * its streak colour, and whether the given target stands inside
 * it. `target` is {x, y, z} or null (no target known — the aura
 * still exists, it simply has nothing to strike).
 */
export function auraFor(kind, hunterPos, targetPos = null) {
  const color = lightningColorFor(kind);
  if (!color) return null;
  const out = {
    kind,
    radiusM: AURA_R_M,
    color,
    active: true,
    targetInRange: false,
    distanceM: null,
  };
  if (hunterPos && targetPos) {
    const d = auraDistance(hunterPos, targetPos);
    out.distanceM = Math.round(d * 100) / 100;
    out.targetInRange = d <= AURA_R_M;
  }
  return out;
}

/** True when a streak may fire at a target — the 1.5 s cadence gate. */
export function strikeDue(lastStrikeMs, nowMs) {
  if (lastStrikeMs == null) return true;
  return nowMs - lastStrikeMs >= STRIKE_INTERVAL_MS;
}

/**
 * Fresh burnable-victim state: full HP, no burn running.
 * `maxHp` defaults to the walker/monster-prey 100.
 */
export function createVictimState(maxHp = WALKER_MAX_HP) {
  return { hp: maxHp, maxHp, burnDps: 0, burnRemainingS: 0, lastStrikeMs: null, dead: false };
}

/**
 * A streak lands on a victim: 8 damage on the hit, and the burn
 * (re)lights at 6/s for 3 s. Returns the new state (does not
 * mutate). A dead victim stays dead.
 */
export function applyStrike(victim, nowMs = Date.now()) {
  if (!victim || victim.dead) return victim;
  const hp = Math.max(0, victim.hp - BURN_HIT_DMG);
  return {
    ...victim,
    hp,
    burnDps: BURN_DPS,
    burnRemainingS: BURN_SECONDS,
    lastStrikeMs: nowMs,
    dead: hp <= 0,
  };
}

/**
 * One burn tick: the burn eats hp at burnDps for dt seconds and
 * counts down. Returns the new state (does not mutate). A victim
 * whose burn has run out takes nothing further until struck again.
 */
export function burnTick(victim, dt) {
  if (!victim || victim.dead || !(victim.burnRemainingS > 0)) return victim;
  const s = Math.min(Math.max(dt || 0, 0), victim.burnRemainingS);
  const hp = Math.max(0, victim.hp - victim.burnDps * s);
  return {
    ...victim,
    hp,
    burnRemainingS: Math.max(0, victim.burnRemainingS - s),
    burnDps: victim.burnRemainingS - s <= 0 ? 0 : victim.burnDps,
    dead: hp <= 0,
  };
}
