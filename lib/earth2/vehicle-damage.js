// lib/earth2/vehicle-damage.js
// EARTH 2 — VEHICLE PHYSICS CONSEQUENCES (Vehicles Phase 2,
// 2026-10-23). Merlin's orders: "Vehicles should not have
// walls… deep water, land vehicles sink, shallow water, land
// vehicles drive through nonissue. Land, water vehicles stop
// and are considered wrecked… give vehicles integrity bars and
// if that bar gets shrunken to nothing, they explode." Plus:
// "Follow true physics" and "Shooting a vehicle reduces its
// integrity too."
//
// This module is the ONE pure damage path. The steppers in
// lib/earth2/vehicles.js detect contacts; everything they
// detect flows through assessDamage / applyDamage here, so an
// impact, a grounding, a hard landing, a ditch, a submersion
// and a bullet all speak the same arithmetic:
//
//   impact damage ∝ (impact speed − a per-class free speed)²,
//   divided by the class's toughness — kinetic energy, not a
//   flat toll. Below the free speed a contact is a caress and
//   costs nothing; double the excess speed, quadruple the bill.
//
// State fields this law adds to every vehicle instance state:
//   integrity  100 → 0 (the bar; at 0 the vehicle is wrecked)
//   wrecked    true once integrity reaches 0 — steppers refuse
//   exploded   set on the wrecking step (the wreck IS an
//              explosion; the scene fires its VFX/sound there)
//   respawnIn  seconds until a fresh vehicle replaces the
//              wreck at its home (ticked purely, see vehicles.js)
//   lastDamage { kind, amount } of the most recent damage event
//   eject      { x, z } where the driver steps out when the
//              vehicle they were driving wrecks (on the wrecked
//              state, from the wrecking step onward)
// Class flags ride the state too: `beached` (boat), `ditched`
// (VTOL in the water). All of it sanitizes with the rest of the
// vehicle state in vehicles.js.

import { MAX_WADE_DEPTH_M } from './world.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const INTEGRITY_MAX = 100;
export const SHOT_DAMAGE = 10; // one hit, one tenth of the bar
export const RESPAWN_DELAY_S = 5; // the wreck's replacement timer

// ── The water lines for land vehicles ───────────────────────────
// Shallow enough to ford: drive through, slower, unharmed.
// Deeper, the drive drowns progressively; deeper than a person
// can wade (the old chest wall, kept as a PHYSICAL line rather
// than a wall) the hull is under and integrity drains.
export const SHALLOW_DRIVE_DEPTH_M = 0.6;
export const DROWN_DEPTH_M = MAX_WADE_DEPTH_M; // 1.35

// ── Per-class tuning ────────────────────────────────────────────
// freeImpactSpeed: contacts at or below this cost nothing (m/s).
// toughness: divides impact damage — the rover is a armoured
// expedition box, the bike is a fast frame with ideas above its
// station, an airframe is the most delicate thing on the field.
// submersionDrainPerSec: integrity lost per second under water
// (land machines drowning; a ditched VTOL taking on water).
export const DAMAGE_TUNING = Object.freeze({
  rover: Object.freeze({ freeImpactSpeed: 3.0, toughness: 1.6, submersionDrainPerSec: 9 }),
  'speed-bike': Object.freeze({ freeImpactSpeed: 4.0, toughness: 0.8, submersionDrainPerSec: 14 }),
  scarab: Object.freeze({ freeImpactSpeed: 3.5, toughness: 1.3, submersionDrainPerSec: 11 }),
  vtol: Object.freeze({ freeImpactSpeed: 1.2, toughness: 1.0, submersionDrainPerSec: 12 }),
  boat: Object.freeze({ freeImpactSpeed: 3.0, toughness: 1.2, submersionDrainPerSec: 0 }),
});
const GROUND_DEFAULT = Object.freeze({ freeImpactSpeed: 3.0, toughness: 1.0, submersionDrainPerSec: 11 });

/** The damage tuning for a spec (by slug, with kind fallbacks). */
export function damageTuningFor(spec) {
  if (!spec) return GROUND_DEFAULT;
  if (DAMAGE_TUNING[spec.slug]) return DAMAGE_TUNING[spec.slug];
  if (spec.air) return DAMAGE_TUNING.vtol;
  if (spec.water) return DAMAGE_TUNING.boat;
  return GROUND_DEFAULT;
}

// The impact-energy curve: damage per (m/s)² of EXCESS speed.
export const IMPACT_ENERGY_K = 0.55;
// A grounding tears along the hull, not just into it.
export const GROUNDING_DAMAGE_FACTOR = 1.25;
// A landing drives its energy through gear and struts.
export const LANDING_DAMAGE_FACTOR = 3;
// Past the safe tilt, every extra degree of lean costs this.
export const TILT_DAMAGE_PER_DEGREE = 1.5;
// A rolling touchdown faster than a jog bills half an impact.
export const ROLLING_LANDING_FACTOR = 0.5;
export const ROLLING_LANDING_FREE_MPS = 3;
// A ditch (an airframe meeting water) starts here, before the
// descent's own energy is added — hull breach, flooding, electrics.
export const DITCH_BASE_DAMAGE = 55;

// ── The VTOL landing judgment (true flight state) ──────────────
export const VTOL_SAFE_DESCENT_MPS = 2.2; // a gentle settle
export const VTOL_SAFE_TILT_RAD = 0.21; // ≈ 12° off the ground plane
export const VTOL_CATASTROPHE_TILT_RAD = 0.5236; // 30° — on its side
export const CONTACT_CATASTROPHE_MPS = 12; // total contact speed that ends it

/** Kinetic impact damage for a contact at `impactSpeed` m/s. */
export function impactDamage(spec, impactSpeed) {
  const t = damageTuningFor(spec);
  const excess = Math.max(0, (Number(impactSpeed) || 0) - t.freeImpactSpeed);
  return (excess * excess * IMPACT_ENERGY_K) / t.toughness;
}

/**
 * Assess ONE damage event. Pure: returns { amount, kind,
 * catastrophic } and touches no state. Event shapes:
 *   { kind: 'impact', impactSpeed }
 *   { kind: 'grounding', impactSpeed }          (boat meets bed)
 *   { kind: 'landing', descentRate, tiltRad, horizontalSpeed, contactSpeed }
 *   { kind: 'ditch', descentRate }              (airframe meets water)
 *   { kind: 'submersion', dt }                  (drain over time)
 *   { kind: 'shot', damage? }                   (a bullet; default SHOT_DAMAGE)
 */
export function assessDamage(spec, event) {
  const kind = event && event.kind;
  switch (kind) {
    case 'impact':
      return { amount: impactDamage(spec, event.impactSpeed), kind, catastrophic: false };
    case 'grounding':
      return { amount: impactDamage(spec, event.impactSpeed) * GROUNDING_DAMAGE_FACTOR, kind, catastrophic: false };
    case 'landing': {
      const tilt = Math.abs(Number(event.tiltRad) || 0);
      const contact = Number(event.contactSpeed) || 0;
      if (tilt > VTOL_CATASTROPHE_TILT_RAD || contact > CONTACT_CATASTROPHE_MPS) {
        // On its side, or flown into the ground: no bar survives.
        return { amount: INTEGRITY_MAX * 10, kind, catastrophic: true };
      }
      let amount = impactDamage(spec, event.descentRate) * LANDING_DAMAGE_FACTOR;
      const tiltDeg = (tilt * 180) / Math.PI;
      const safeDeg = (VTOL_SAFE_TILT_RAD * 180) / Math.PI;
      if (tiltDeg > safeDeg) amount += (tiltDeg - safeDeg) * TILT_DAMAGE_PER_DEGREE;
      const hs = Math.abs(Number(event.horizontalSpeed) || 0);
      if (hs > ROLLING_LANDING_FREE_MPS) amount += impactDamage(spec, hs) * ROLLING_LANDING_FACTOR;
      return { amount, kind, catastrophic: false };
    }
    case 'ditch':
      return { amount: DITCH_BASE_DAMAGE + impactDamage(spec, event.descentRate), kind, catastrophic: false };
    case 'submersion': {
      const t = damageTuningFor(spec);
      return { amount: t.submersionDrainPerSec * Math.max(0, Number(event.dt) || 0), kind, catastrophic: false };
    }
    case 'shot': {
      const amount = typeof event.damage === 'number' && Number.isFinite(event.damage)
        ? Math.max(0, event.damage)
        : SHOT_DAMAGE;
      return { amount, kind, catastrophic: false };
    }
    default:
      return { amount: 0, kind: kind || 'none', catastrophic: false };
  }
}

/**
 * Apply ONE damage event to a vehicle state. Returns a NEW
 * state: integrity reduced (floored at 0), wrecked + exploded
 * + respawn timer set on the transition, speed zeroed by a
 * wreck, lastDamage recorded. A wreck takes no further damage.
 */
export function applyDamage(state, spec, event) {
  if (!state || typeof state !== 'object') return state;
  if (state.wrecked) return { ...state, integrity: 0, wrecked: true };
  const a = assessDamage(spec, event);
  const before = typeof state.integrity === 'number' && Number.isFinite(state.integrity)
    ? clamp(state.integrity, 0, INTEGRITY_MAX)
    : INTEGRITY_MAX;
  const integrity = a.catastrophic ? 0 : clamp(before - a.amount, 0, INTEGRITY_MAX);
  const wrecked = integrity <= 0;
  const next = {
    ...state,
    integrity,
    wrecked,
    lastDamage: { kind: a.kind, amount: a.amount },
  };
  if (wrecked) {
    next.exploded = true;
    next.speed = 0;
    next.respawnIn = RESPAWN_DELAY_S;
  }
  return next;
}

/**
 * A shot hits a vehicle (the tap-to-shoot path routes here).
 * hitInfo.damage overrides the standard SHOT_DAMAGE. Returns
 * the new state — check `.wrecked` / `.exploded` for the kill.
 */
export function applyShotToVehicle(state, spec, hitInfo = {}) {
  return applyDamage(state, spec, { kind: 'shot', damage: hitInfo ? hitInfo.damage : undefined });
}

/**
 * Where the driver steps out of a wreck: the previous position
 * when it was wadeable footing; otherwise the nearest wadeable
 * or dry point the scan finds around the wreck (rings × rays,
 * deterministic); otherwise the wreck itself — the walker can
 * swim this planet's waters, so stepping out is never a trap.
 * env needs waterDepthAt; prev is the pre-step state (optional).
 */
export function ejectPointFor(state, env, prev) {
  const depthAt = env && typeof env.waterDepthAt === 'function' ? env.waterDepthAt : null;
  if (!depthAt || !state) return { x: state ? state.x : 0, z: state ? state.z : 0 };
  if (prev && depthAt(prev.x, prev.z) <= MAX_WADE_DEPTH_M) return { x: prev.x, z: prev.z };
  if (depthAt(state.x, state.z) <= MAX_WADE_DEPTH_M) return { x: state.x, z: state.z };
  let shallowest = null;
  let shallowDepth = Infinity;
  for (const r of [4, 8, 12, 18, 26, 36, 48]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = state.x + Math.cos(a) * r;
      const z = state.z + Math.sin(a) * r;
      const d = depthAt(x, z);
      if (d <= MAX_WADE_DEPTH_M) return { x, z };
      if (d < shallowDepth) { shallowDepth = d; shallowest = { x, z }; }
    }
  }
  return shallowest || { x: state.x, z: state.z };
}
