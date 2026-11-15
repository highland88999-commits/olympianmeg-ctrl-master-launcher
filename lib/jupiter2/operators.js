// lib/jupiter2/operators.js — Jupiter 2 creature operators.
//
// The operator treatment, following the lib/earth4/operators.js +
// lib/life-clock.js pattern: a creature's whole life is a pure
// function of (place, species, device clock) — no stored state, no
// server tick. Two phones in the same place at the same time see
// the same creature at the same age doing the same thing.
//
// THE CREATURES (Merlin's spec, Nov 10):
//   - LIGHTNING MONSTERS on the surface (the surface creatures)
//   - DEMOBATS in the air (the air creatures)
//
// Birth / growth / diet / habits are pure clock functions below.
// DEATH — the honest reading, stated plainly because the spec
// gives no death law: NEITHER creature has a death rule. No
// lifespan, no predation, no combat, no hunt is specified for
// Jupiter 2, and inventing one would be inventing a law Merlin
// never ordered. So lifeFor() returns death: null and
// dies: false — the creatures persist. Growth stages use a
// STATED CONVENTION lifespan (the lib/life-clock.js convention:
// lifespans drive growth stages only, they NEVER kill) —
// labelled 'convention' wherever it surfaces, never presented
// as listed data. If Merlin orders a death law later, it lands
// here, in one place.

import { hash01, localHour } from '../life-clock.js';
import { JUPITER2_FOUNDING_MS } from './profile.js';

export const JUPITER2_FOUNDING = JUPITER2_FOUNDING_MS;
export const DAY_MS = 86400000;

export const CREATURE_KINDS = {
  'lightning-monster': {
    kind: 'lightning-monster',
    name: 'Lightning Monster',
    realm: 'surface',
    diet: 'Feeds on storm charge — drinks lightning, grazes the charged cloud deck.',
    habit: 'Stalks the cloud deck in the storm; flares bright when a strike lands nearby.',
    // Growth convention only (see header): drives stages, never kills.
    lifespanDays: 420,
    lifespanSource: 'convention',
  },
  demobat: {
    kind: 'demobat',
    name: 'Demobat',
    realm: 'air',
    diet: 'Feeds on storm moths and wind-borne charge in the upper storm.',
    habit: 'Circles high in the storm by day, dives low through the rain after dark.',
    lifespanDays: 180,
    lifespanSource: 'convention',
  },
};

const GROWTH_STAGES = ['spark', 'juvenile', 'adult', 'elder'];

/** Growth stage from age: spark → juvenile → adult → elder. */
export function growthStage(kind, ageDays) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return 'adult';
  const f = Math.max(0, Math.min(1, ageDays / spec.lifespanDays));
  if (f < 0.15) return GROWTH_STAGES[0];
  if (f < 0.45) return GROWTH_STAGES[1];
  if (f < 0.8) return GROWTH_STAGES[2];
  return GROWTH_STAGES[3];
}

/** What the creature is doing at the device clock's hour. */
export function activityFor(kind, nowMs) {
  const h = localHour(nowMs);
  if (kind === 'lightning-monster') {
    // Surface monsters flare and feed hardest in the deep storm
    // hours (late night), and rest low in the bright hours.
    if (h >= 22 || h < 4) return 'feeding on storm charge';
    if (h >= 4 && h < 10) return 'stalking the cloud deck';
    if (h >= 10 && h < 16) return 'resting low in the murk';
    return 'stalking the cloud deck';
  }
  // Demobats: high circles by day, low dives after dark.
  if (h >= 20 || h < 5) return 'diving low through the rain';
  if (h >= 5 && h < 11) return 'circling high in the storm';
  return 'riding the storm winds';
}

/**
 * One creature's life at an instant — pure function of
 * (kind, index, device clock). birthMs is seeded so the world
 * is already mid-life on day one; ageDays drives the growth
 * stage; death is null by design (see header).
 */
export function lifeFor(kind, index, nowMs = Date.now()) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return null;
  const seed = hash01(`${kind}:${index}`, 20261115);
  // Born somewhere in the lifespan before founding, so the
  // first visitor meets adults and elders, not only sparks.
  const birthMs = JUPITER2_FOUNDING_MS - Math.floor(seed * spec.lifespanDays * DAY_MS);
  const ageDays = Math.max(0, (nowMs - birthMs) / DAY_MS);
  return {
    kind,
    index,
    name: spec.name,
    realm: spec.realm,
    diet: spec.diet,
    habit: spec.habit,
    birthMs,
    ageDays: Math.floor(ageDays),
    stage: growthStage(kind, ageDays),
    activity: activityFor(kind, nowMs),
    // NO DEATH LAW: the spec orders none. They persist.
    death: null,
    dies: false,
    lifespanDays: spec.lifespanDays,
    lifespanSource: spec.lifespanSource,
  };
}

/** Seeded home position for one creature, inside the world disc. */
export function homeFor(kind, index, radius = 70) {
  const a = hash01(`${kind}:angle:${index}`, 77) * Math.PI * 2;
  const r = 8 + hash01(`${kind}:dist:${index}`, 91) * radius;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
