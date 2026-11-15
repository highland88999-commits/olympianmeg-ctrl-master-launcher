// lib/takamagahara/operators.js
// TAKAMAGAHARA — OPERATOR AGENTS: thin realm-scoped entry point.
// The agents themselves live in lib/afterlife/operators.js (one shared
// module — all 24 realms share one spawner shape); this file binds
// them to this realm so the scene and the tap card import from the
// realm's own folder. Pure functions of (place, species, device
// clock); no stored state, no server.
import {
  speciesFor,
  guardiansFor,
  lifeFor as lifeForRealm,
  enrichCreatures as enrichRealm,
  populationFor as populationForRealm,
  lifeLineFor,
  growthScale,
  areaAt as areaAtRealm,
} from '../afterlife/operators.js';

export const REALM_KEY = 'takamagahara';
export const SPECIES = speciesFor(REALM_KEY);
export const GUARDIANS = guardiansFor(REALM_KEY);
export { lifeLineFor, growthScale };

/** The full life state of one creature of this realm at the clock. */
export function lifeFor(name, cellKey, now = Date.now(), opts = {}) {
  return lifeForRealm(REALM_KEY, name, cellKey, now, opts);
}

/** Enrich this realm's spawner output with life (mutates, returns it). */
export function enrichCreatures(creatures, now = Date.now()) {
  return enrichRealm(creatures, REALM_KEY, now);
}

/** Population audit for this realm (Merlin's population rule). */
export function populationFor(creatures, now = Date.now()) {
  return populationForRealm(REALM_KEY, creatures, now);
}

/** The region disc a point belongs to in this realm. */
export function areaAt(x, z) {
  return areaAtRealm(REALM_KEY, x, z);
}
