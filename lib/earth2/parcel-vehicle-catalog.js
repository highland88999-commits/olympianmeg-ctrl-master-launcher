// lib/earth2/parcel-vehicle-catalog.js
// The parcel-vehicle showroom (Merlin, 2026-11-01): a land buyer may
// pick ANY vehicle from ANY program in the ecosystem — the Earth 2
// fleet plus Earth's garage. Earth 1 entries ride under an
// `earth1:` slug namespace (Earth also has a 'rover' — the prefix
// keeps the two from colliding) and their arcade tuning is bridged
// into the Earth 2 drive model.
//
// Pure and client-safe: no Supabase, no DOM.

import { VEHICLES } from '../earth/vehicles.js';

/** Slug prefix for Earth-program vehicles parked on Earth 2 land. */
export const EARTH1_PARCEL_PREFIX = 'earth1:';

/** True for parcel-vehicle slugs that come from Earth's garage. */
export function isEarth1ParcelSlug(slug) {
  return typeof slug === 'string' && slug.startsWith(EARTH1_PARCEL_PREFIX);
}

/** The Earth 1 vehicle id behind a bridged slug, or null. */
export function earth1IdFor(slug) {
  if (!isEarth1ParcelSlug(slug)) return null;
  return slug.slice(EARTH1_PARCEL_PREFIX.length) || null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Bridge one Earth 1 garage entry into an Earth 2 drive spec.
 * Earth's tuning is arcade-scale (maxSpeed ~42–95); Earth 2 drives
 * in m/s, so speed/accel cross as km/h → m/s with clamps that keep
 * every import inside the fleet's honest envelope (nothing outruns
 * the VTOL, nothing crawls). Fields with no Earth counterpart take
 * the fleet's sensible defaults.
 */
export function bridgeEarth1Spec(v) {
  if (!v || typeof v.id !== 'string') return null;
  const t = v.tuning || {};
  const lengthM = Number.isFinite(v.lengthM) && v.lengthM > 0 ? v.lengthM : 4.5;
  const maxSpeed = clamp((Number(t.maxSpeed) || 60) / 3.6, 6, 30);
  const accel = clamp((Number(t.accel) || 40) / 3.6, 4, 16);
  return Object.freeze({
    slug: `${EARTH1_PARCEL_PREFIX}${v.id}`,
    name: v.name || v.id,
    emoji: v.emoji || '🚗',
    verb: 'Drive',
    air: false,
    water: false,
    earth1: true, // bridged import, not a native fleet machine
    glbUrl: v.glbUrl || null,
    maxSpeed,
    reverseMax: maxSpeed * 0.25,
    accel,
    turnRate: clamp((Number(t.turnRate) || 2) * 0.55, 0.7, 1.3),
    turnFloor: 0.5,
    radius: lengthM * 0.28,
    halfLength: lengthM / 2,
    halfWidth: lengthM * 0.2,
    eyeHeight: 2.0 + lengthM * 0.12,
    // Earth's nose audit rides along: a flagged model spawns
    // flipped so it doesn't drive backward. The on-device look
    // is the verdict, as with every mount.
    spin: v.noseReversed ? Math.PI : 0,
  });
}

/** All bridged Earth 1 specs, keyed by parcel slug. */
export const EARTH1_PARCEL_SPECS = (() => {
  const m = new Map();
  for (const v of VEHICLES) {
    const spec = bridgeEarth1Spec(v);
    if (spec) m.set(spec.slug, spec);
  }
  return m;
})();

/** One bridged spec by parcel slug, or null. */
export function bridgedParcelSpec(slug) {
  return EARTH1_PARCEL_SPECS.get(slug) || null;
}

/**
 * A model-registry entry for a bridged Earth 1 vehicle, shaped like
 * the EARTH2_MODEL_BY_SLUG entries the scene's loader expects
 * (slug/file/scaleM/scaleBasis) so placeVehicle's loadModel +
 * normalize path renders it from its glbUrl untouched.
 */
export function bridgedParcelModel(slug) {
  const spec = bridgedParcelSpec(slug);
  if (!spec || !spec.glbUrl) return null;
  const id = earth1IdFor(slug);
  const v = VEHICLES.find((e) => e.id === id);
  return {
    slug,
    name: spec.name,
    kind: 'vehicle',
    file: spec.glbUrl,
    status: 'placed',
    scaleM: (v && v.lengthM) || 4.5,
    scaleBasis: 'length',
  };
}

/**
 * The showroom, grouped by program for the picker. Earth 2 lists
 * the native fleet slugs (the boat only on waterfront — the picker
 * enforces that); Earth lists every bridged garage import.
 */
export const PARCEL_VEHICLE_CATALOG = Object.freeze({
  earth2: Object.freeze(['rover', 'speed-bike', 'scarab', 'vtol']),
  earth: Object.freeze([...EARTH1_PARCEL_SPECS.keys()].sort()),
});

/** 'earth2' for native fleet slugs (and the boat), 'earth' for bridged imports. */
export function parcelVehicleSource(slug) {
  if (isEarth1ParcelSlug(slug)) return 'earth';
  return 'earth2';
}
