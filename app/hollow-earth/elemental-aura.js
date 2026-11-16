// app/hollow-earth/elemental-aura.js — THE ELEMENTAL AURA TABLE.
//
// MonsterVerse workstream 5, phase 2 (2026-11-16). Merlin ordered
// Nov 16 ~01:33-01:34: "give each monster its own element and make
// them be the source of their elements." Phase 1 audited the 7
// elements (~/workspace/monsterverse-round/ws5-elements-audit.md)
// and found only lightning was a true source; this module is the
// pure table the wiring worker generalises the spawns.js aura
// branch onto. NEW FILE ONLY — nothing here is wired in yet, and
// nothing in this file touches spawns.js, zone.js, page.jsx, or
// operators.js. No THREE, no DOM, no lights, no server, no SQL.
//
// THE LAW, per element (audit §3a):
//   lightning — MERLIN'S numbers, delegated to lib/lightning-aura.js
//     (do NOT duplicate: 59 m, 8 hit + 6/s burn x 3 s = 26, 1.5 s
//     cadence). The row below is built from the shared module's
//     own exports, so if the law ever moves, this table moves.
//   fire / acid / poison / shadow / sand / frost — the audit's
//     numbers, WORKER'S CALL (Merlin ordered the features, not
//     these numbers): fire 24 m, 4 + 4/s x 3 s = 16; acid 18 m,
//     3 + 3/s x 4 s = 15 + ground pool 3.5 m / 4 s; poison 20 m,
//     2 + 4/s x 4 s = 18; shadow 30 m, 3 hit, gloom (haze dome
//     to full 0.30 while the hunter stands inside any shadow
//     aura); sand 26 m, 3 hit, sand veil (2 s obscuring gust);
//     frost 16 m, 2 hit, chill (walker speed x0.7 for 3 s).
//   Cadence is 1.5 s per source for ALL seven (STRIKE_INTERVAL_S).
//   Poison and frost rows exist even though they barely exist
//   live (poison 0 placed, frost 1) so Tripo re-sends light them
//   up automatically with no further code change.
//
// EXEMPTIONS, by construction (the wiring worker must honour
// auraSourceAllowed / isExemptSource — the guards live here so
// the rule is stated once):
//   Korus (type 'korus' / kind 'boss') — EXEMPT, never auras,
//     never prey. His telegraphed blasts are his own mechanics.
//   Ghorrum (kind 'watcher' / watcher: true) — EXEMPT, non-hostile.
//   Mounted monsters never emanate. Dead monsters emit nothing.
//   Inactive monsters emit nothing. The Haven (inBase) suppresses
//   every aura — sanctuary means sanctuary for every element.
//   Lightning is NOT softened against the user: the player is
//   struck first, always; monster prey only when the player is
//   outside the aura (the wiring worker keeps that order).
//
// Colours come from PROJECTILE_STYLE (monster-projectiles.js) —
// the one look per element already in code — except lightning,
// whose streak colour comes from lightningColorFor (white-yellow
// for lightning monsters, red for dragons, yellow for demobats).
// No ambient rain tick lives here: the rain ambient tick
// (1 HP / 2 s per element type) is HELD for Merlin's word and
// was NOT built anywhere in this workstream.

import {
  AURA_R_M,
  BURN_HIT_DMG,
  BURN_DPS,
  BURN_SECONDS,
  STRIKE_INTERVAL_S,
  STRIKE_INTERVAL_MS,
  lightningColorFor,
  strikeDue,
} from '../../lib/lightning-aura.js';
import { PROJECTILE_STYLE } from './monster-projectiles.js';

export { STRIKE_INTERVAL_S, STRIKE_INTERVAL_MS };

// The 7 elements, exactly as written in spawns.js:51.
export const ELEMENTS = ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost'];

// Haze dome full opacity while the hunter stands inside any
// shadow aura (audit §3a; the existing elemental.js haze hook).
export const SHADOW_GLOOM_OPACITY = 0.30;
// Acid ground-pool shape, reusing the environmental hazard shape
// (spawns.js hazard radius 3.5 m).
export const ACID_POOL_RADIUS_M = 3.5;
export const ACID_POOL_SECONDS = 4;
// Frost chill: walker speed factor + duration.
export const FROST_CHILL_FACTOR = 0.7;
export const FROST_CHILL_SECONDS = 3;
// Sand veil: obscuring gust duration.
export const SAND_VEIL_SECONDS = 2;

function styleFor(element) {
  return PROJECTILE_STYLE[element] || null;
}

function row(element, radiusM, hit, dps, seconds, secondary, extra = {}) {
  const style = styleFor(element);
  return Object.freeze({
    element,
    radiusM,
    hit,
    dps,
    seconds,
    // Total damage if the DoT/burn runs its course: hit + dps * seconds.
    total: hit + dps * seconds,
    secondary,
    color: style ? style.color : 0x555560,
    core: style ? style.core : 0xb9b9c6,
    shape: style ? style.shape : 'smoke',
    label: style ? style.label : 'smoke bolt',
    ...extra,
  });
}

// One row per element. Lightning DELEGATES to lib/lightning-aura.js:
// every number in its row is the shared module's export, not a
// literal copied here.
export const ELEMENT_AURA = Object.freeze({
  lightning: row('lightning', AURA_R_M, BURN_HIT_DMG, BURN_DPS, BURN_SECONDS, 'burn'),
  fire: row('fire', 24, 4, 4, 3, 'burn'),
  acid: row('acid', 18, 3, 3, 4, 'pool', { poolRadiusM: ACID_POOL_RADIUS_M, poolSeconds: ACID_POOL_SECONDS }),
  poison: row('poison', 20, 2, 4, 4, 'dot'),
  shadow: row('shadow', 30, 3, 0, 0, 'gloom', { gloomOpacity: SHADOW_GLOOM_OPACITY }),
  sand: row('sand', 26, 3, 0, 0, 'veil', { veilSeconds: SAND_VEIL_SECONDS }),
  frost: row('frost', 16, 2, 0, 0, 'chill', { chillFactor: FROST_CHILL_FACTOR, chillSeconds: FROST_CHILL_SECONDS }),
});

/** The aura row for an element, or null for an unknown element. Unknown never fires. */
export function auraRowFor(element) {
  if (!element) return null;
  return ELEMENT_AURA[element] || null;
}

/**
 * True when a source record is Korus or Ghorrum — exempt by
 * construction, whatever else it carries. Korus: type 'korus' or
 * kind 'boss'. Ghorrum: kind 'watcher' or watcher: true.
 */
export function isExemptSource(source) {
  if (!source) return false;
  if (source.type === 'korus' || source.kind === 'boss') return true;
  if (source.kind === 'watcher' || source.watcher === true) return true;
  return false;
}

/**
 * Pure guard modelling the spawns.js aura-branch guards: a source
 * may emanate only when it is alive, active, unmounted, not
 * exempt, and the hunter is not inside The Haven (opts.inBase).
 * `source` is a monster record (or null); opts carries inBase.
 * Returns false for a null source.
 */
export function auraSourceAllowed(source, opts = {}) {
  if (!source) return false;
  if (source.dead) return false;
  if (source.active === false) return false;
  if (source.mounted) return false;
  if (isExemptSource(source)) return false;
  if (opts.inBase) return false;
  return true;
}

/** 2D ground distance between two {x, z} points (y ignored — same distance the senses use). */
export function auraDistance2D(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dz);
}

/**
 * One monster's elemental aura at an instant: its row (radius,
 * hit, DoT, secondary, colours), its streak colour, and whether
 * the given target stands inside it.
 *
 *   auraForElement(element, hunterPos, targetPos, opts)
 *   hunterPos — the source monster's {x, z} (the aura's centre)
 *   targetPos — the victim's {x, z}, or null (no target known —
 *     the aura still exists, it simply has nothing to strike)
 *   opts — { kind, dragon, source, inBase }: kind 'dragon' /
 *     'demobat' / 'lightning-monster' picks the lightning streak
 *     colour (dragons red); source, when given, is run through
 *     auraSourceAllowed (mounted / dead / exempt / Haven refuse).
 *
 * Returns null for an unknown element, or when the source guard
 * refuses. Lightning rows carry the lightningColorFor colour;
 * every other element carries its PROJECTILE_STYLE colour.
 */
export function auraForElement(element, hunterPos, targetPos = null, opts = {}) {
  const r = auraRowFor(element);
  if (!r) return null;
  if (opts.source && !auraSourceAllowed(opts.source, opts)) return null;
  const out = {
    element: r.element,
    radiusM: r.radiusM,
    hit: r.hit,
    dps: r.dps,
    seconds: r.seconds,
    total: r.total,
    secondary: r.secondary,
    color: r.color,
    core: r.core,
    active: true,
    targetInRange: false,
    distanceM: null,
  };
  if (element === 'lightning') {
    const kind = opts.dragon ? 'dragon' : (opts.kind || 'lightning-monster');
    const lc = lightningColorFor(kind);
    if (lc) {
      // Streak colour stays the lightningColorFor object (the
      // shape spawns.js already emits as ev.color); `color` /
      // `core` above stay the numeric PROJECTILE_STYLE hexes so
      // every row's colour fields share one type.
      out.lightningColor = lc;
      out.lightningLabel = lc.label;
    }
  }
  if (element === 'acid') {
    out.poolRadiusM = r.poolRadiusM;
    out.poolSeconds = r.poolSeconds;
  }
  if (element === 'shadow') out.gloomOpacity = r.gloomOpacity;
  if (element === 'sand') out.veilSeconds = r.veilSeconds;
  if (element === 'frost') {
    out.chillFactor = r.chillFactor;
    out.chillSeconds = r.chillSeconds;
  }
  if (hunterPos && targetPos) {
    const d = auraDistance2D(hunterPos, targetPos);
    out.distanceM = Math.round(d * 100) / 100;
    out.targetInRange = d <= r.radiusM;
  }
  return out;
}

/**
 * True when an elemental streak may fire — the 1.5 s cadence
 * gate, shared by all seven elements (delegates to the
 * lightning-aura strikeDue: same law, same interval).
 */
export function elementalStrikeDue(lastStrikeMs, nowMs) {
  return strikeDue(lastStrikeMs, nowMs);
}

/**
 * Fresh elemental-victim state: full HP, no DoT running, no
 * secondary running, full speed. `maxHp` defaults to the
 * walker/monster-prey 100.
 */
export function createElementalVictimState(maxHp = 100) {
  return {
    hp: maxHp, maxHp,
    dotDps: 0, dotRemainingS: 0, dotElement: null,
    secondary: null, secondaryRemainingS: 0,
    speedFactor: 1,
    lastStrikeMs: null, dead: false,
  };
}

/**
 * An elemental streak lands on a victim: `hit` damage on the
 * impact, then the row's DoT (dps x seconds) if any, then the
 * row's secondary effect (burn/pool/dot/gloom/veil/chill).
 * Returns the new state (does not mutate). A dead victim stays
 * dead; an unknown element never fires (victim returned
 * unchanged). Secondary durations: pool 4 s (acid), veil 2 s
 * (sand), chill 3 s (frost, speed x0.7); gloom is positional —
 * it lasts only while the hunter stands inside a shadow aura,
 * so it carries no countdown here (the wiring worker re-derives
 * it from auraForElement each tick).
 */
export function applyElementalStrike(victim, element, nowMs = Date.now()) {
  if (!victim || victim.dead) return victim;
  const r = auraRowFor(element);
  if (!r) return victim;
  const hp = Math.max(0, victim.hp - r.hit);
  const next = {
    ...victim,
    hp,
    dotDps: r.dps,
    dotRemainingS: r.seconds,
    dotElement: r.dps > 0 ? element : null,
    secondary: r.secondary,
    secondaryRemainingS:
      r.secondary === 'pool' ? r.poolSeconds
      : r.secondary === 'veil' ? r.veilSeconds
      : r.secondary === 'chill' ? r.chillSeconds
      : 0,
    speedFactor: r.secondary === 'chill' ? r.chillFactor : victim.speedFactor,
    lastStrikeMs: nowMs,
    dead: hp <= 0,
  };
  return next;
}

/**
 * One elemental tick: the running DoT eats hp at dotDps for dt
 * seconds and counts down; the secondary countdown ticks down
 * too, and when a chill ends the walker speed returns to 1.
 * Returns the new state (does not mutate). A victim with no
 * DoT and no secondary running is returned unchanged.
 */
export function elementalTick(victim, dt) {
  if (!victim || victim.dead) return victim;
  const step = Math.max(dt || 0, 0);
  if (!(victim.dotRemainingS > 0) && !(victim.secondaryRemainingS > 0)) return victim;
  let { hp, dotRemainingS, secondaryRemainingS, speedFactor } = victim;
  if (dotRemainingS > 0) {
    const s = Math.min(step, dotRemainingS);
    hp = Math.max(0, hp - victim.dotDps * s);
    dotRemainingS = Math.max(0, dotRemainingS - s);
  }
  if (secondaryRemainingS > 0) {
    secondaryRemainingS = Math.max(0, secondaryRemainingS - step);
  }
  const dotDps = dotRemainingS <= 0 ? 0 : victim.dotDps;
  const dotElement = dotRemainingS <= 0 ? null : victim.dotElement;
  const secondary = secondaryRemainingS <= 0 && dotRemainingS <= 0 ? null : victim.secondary;
  if (victim.secondary === 'chill' && secondaryRemainingS <= 0) speedFactor = 1;
  return {
    ...victim,
    hp,
    dotDps,
    dotRemainingS,
    dotElement,
    secondary,
    secondaryRemainingS,
    speedFactor,
    dead: hp <= 0,
  };
}
