// lib/earth2/fleet.js
// EARTH 2 — THE FLEET AS INSTANCES (Terrain Wave B, 2026-10-23).
// Vehicles Phase 1 gave Tyrrell Field four machines, one of each
// kind, and keyed their saved states by model slug. Merlin's next
// order — "make land vehicles scattered throughout the terrain" —
// turns the fleet into INSTANCES: every physical machine has its
// own id, its own home, and its own saved state; the model slug
// says what it IS, the instance id says WHICH ONE it is.
//
// THE REGISTRY (this module is the only place that knows):
//   - the four Tyrrell Field machines keep their Phase 1 ids —
//     the instance id IS the model slug ('rover', 'speed-bike',
//     'scarab', 'vtol') — so every saved state from Phase 1 reads
//     exactly as it did, untouched;
//   - nine scattered land machines (rover / speed bike / scarab)
//     parked at deterministic scenic spots on Free Commons across
//     the map's regions — shore overlooks, a meadow edge near the
//     landing, a bridge end, the lake shore, the tar-pit approach,
//     high country, the castle road, the southern meadows;
//   - three River Runner boats moored on three different waters:
//     the great sea (the largest body — the swimmers' water), the
//     lake (the 20-parcel body), and the central river.
// The VTOL stays at Tyrrell Field only — flight is the field's
// privilege this wave.
//
// Spots are chosen by the world's own data (dry, gentle, Commons,
// unprotected, apart from each other) with seeded scans — pure
// and deterministic like every other placement on this planet.

import { PARCELS } from './parcels.js';
import {
  WORLD_CELL_M,
  WORLD_HALF_M,
  WATER_Y,
  heightAt,
  waterDepthAt,
  waterBodies,
  parcelCenterWorld,
  parcelAtWorld,
  familyForParcel,
  landingParcel,
} from './world.js';
import { AIRPORT_PARKING } from './airport.js';
import { worldBridges } from './bridges.js';
import { protectedParcelIds } from './building.js';

export const BOAT_SLUG = 'boat';

// Scattered-machine definitions: what to look for, in order.
// `near` is a preference point; the scan takes the best Commons
// parcel it can find for the wish, kept apart from the others.
const SCATTER_WISHES = [
  { id: 'rover-shore', slug: 'rover', label: 'Sea-overlook Rover', families: ['Shore', 'Fields', 'Meadows'], nearBody: 0, shore: true },
  { id: 'bike-landing', slug: 'speed-bike', label: 'Landing-meadow Speed Bike', families: ['Fields', 'Meadows'], nearLanding: true },
  { id: 'scarab-tarpit', slug: 'scarab', label: 'Tar-pit Scarab', families: ['Steppe', 'Fields'], near: [430, 200] },
  { id: 'rover-bridge', slug: 'rover', label: 'Bridge-end Rover', families: null, nearBridgeBody: 3 },
  { id: 'bike-lake', slug: 'speed-bike', label: 'Lakeside Speed Bike', families: ['Shore', 'Fields', 'Meadows'], nearBody: 5, shore: true },
  { id: 'scarab-highland', slug: 'scarab', label: 'High-country Scarab', families: ['Reach', 'Highlands', 'Steppe'], near: [250, -420] },
  { id: 'rover-south', slug: 'rover', label: 'Southern-meadows Rover', families: ['Fields', 'Meadows', 'Vale'], near: [-80, 430] },
  { id: 'bike-castle', slug: 'speed-bike', label: 'Castle-road Speed Bike', families: ['Shore', 'Fields'], near: [14, 560] },
  { id: 'scarab-everest', slug: 'scarab', label: 'Everest-approach Scarab', families: ['Reach', 'Steppe', 'Cliffs'], near: [322, -210] },
];

function slopeAt(x, z, r = 6) {
  const hs = [
    heightAt(x, z),
    heightAt(x + r, z), heightAt(x - r, z),
    heightAt(x, z + r), heightAt(x, z - r),
  ];
  return Math.max(...hs) - Math.min(...hs);
}

function dryGentle(x, z) {
  return heightAt(x, z) > 0.5 && slopeAt(x, z) <= 2.6;
}

let _spots = null;

/** The scattered land machines: [{ id, slug, label, x, z,
 *  heading, parcelId }] — deterministic, on Free Commons. */
export function scatteredVehicleSpots() {
  if (_spots) return _spots;
  const bodies = waterBodies();
  const bridges = worldBridges();
  const prot = protectedParcelIds();
  const landing = parcelCenterWorld(landingParcel());
  const used = AIRPORT_PARKING.map((s) => ({ x: s.x, z: s.z }));
  const out = [];

  const bridgeNear = (bodyIdx) => {
    const list = bridges.filter((b) => b.bodyIndex === bodyIdx);
    if (!list.length) return null;
    const mid = list[Math.floor(list.length / 2)];
    return { x: mid.spanTo + 12, z: mid.z };
  };
  // Distance from a point to a water body's nearest parcel
  // centre — the honest "on this body's shore" measure (a wide
  // body's centre + radius overshoots into the next valley).
  const bodyDistance = (bodyIdx, x, z) => {
    const b = bodies[bodyIdx];
    if (!b) return Infinity;
    let best = Infinity;
    for (const p of b.parcels) {
      const c = parcelCenterWorld(p);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < best) best = d;
    }
    return best;
  };

  for (const wish of SCATTER_WISHES) {
    let near = null;
    if (Array.isArray(wish.near)) near = { x: wish.near[0], z: wish.near[1] };
    if (wish.nearLanding) near = { x: landing.x + 120, z: landing.z + 60 };
    if (wish.nearBridgeBody != null) near = bridgeNear(wish.nearBridgeBody) || near;
    const scoreOf = wish.nearBody != null
      // On the body's shore, but weighted toward its middle
      // latitudes — a river runs pole to pole, and its rim ends
      // are nobody's overlook.
      ? (c) => bodyDistance(wish.nearBody, c.x, c.z) + 0.6 * Math.abs(c.z - (bodies[wish.nearBody] ? bodies[wish.nearBody].centerZ : 0))
      : (near ? (c) => Math.hypot(c.x - near.x, c.z - near.z) : null);
    if (!scoreOf) continue;
    const sorted = PARCELS
      .filter((p) => p.kind === 'commons' && !prot.has(p.id))
      .filter((p) => !wish.families || wish.families.includes(familyForParcel(p)))
      .map((p) => ({ p, c: parcelCenterWorld(p) }))
      .sort((a, b2) => (scoreOf(a.c) - scoreOf(b2.c)) || a.p.index - b2.p.index);
    let placed = null;
    for (const { p, c } of sorted) {
      if (used.some((u) => Math.hypot(u.x - c.x, u.z - c.z) < 130)) continue;
      if (!dryGentle(c.x, c.z)) continue;
      placed = { p, c };
      break;
    }
    if (!placed) continue;
    const { p, c } = placed;
    used.push(c);
    // Face the point of interest the spot was chosen for — for a
    // shore spot, the water itself (the body's nearest parcel).
    let face = near;
    if (!face && wish.nearBody != null && bodies[wish.nearBody]) {
      let bd = Infinity;
      for (const bp of bodies[wish.nearBody].parcels) {
        const pc = parcelCenterWorld(bp);
        const d = Math.hypot(pc.x - c.x, pc.z - c.z);
        if (d < bd) { bd = d; face = pc; }
      }
    }
    const heading = face ? Math.atan2(face.x - c.x, face.z - c.z) : 0;
    out.push({
      id: wish.id, slug: wish.slug, label: wish.label,
      x: c.x, z: c.z, heading, parcelId: p.id,
    });
  }
  _spots = out;
  return out;
}

let _moorings = null;

/**
 * The three boat moorings: [{ id, slug: 'boat', label, bodyIndex,
 * x, z, heading, parcelId }] — a boat floats in water deep enough
 * to run (≥ 0.6 m) with wadeable shallows or a bank within a
 * short walk, bow toward open water. Bodies: the great sea
 * (largest), the lake, and the central river — in that order,
 * first-found wins per body.
 */
export function boatMoorings() {
  if (_moorings) return _moorings;
  const bodies = waterBodies();
  const picks = [];
  const want = [0, 5, 1]; // sea, lake, central river (by waterBodies() order)
  const labels = ['Great-sea River Runner', 'Lake River Runner', 'River Runner'];
  want.forEach((bi, k) => {
    const body = bodies[bi];
    if (!body) return;
    // Search the body's wettest parcels first (deepest bed),
    // spiralling outward by parcel distance from the deepest.
    const parcelsByDepth = body.parcels
      .map((p) => ({ p, c: parcelCenterWorld(p) }))
      .sort((a, b2) => heightAt(a.c.x, a.c.z) - heightAt(b2.c.x, b2.c.z) || a.p.index - b2.p.index);
    let found = null;
    for (const { p, c } of parcelsByDepth) {
      // Ring-scan around the parcel centre for a mooring point:
      // deep enough to float, with a footing (wadeable or dry)
      // close enough to step aboard from.
      for (const r of [6, 12, 20, 30]) {
        if (found) break;
        for (let s = 0; s < 16; s++) {
          const a = (s / 16) * Math.PI * 2;
          const x = c.x + Math.cos(a) * r;
          const z = c.z + Math.sin(a) * r;
          if (Math.abs(x) > WORLD_HALF_M - 8 || Math.abs(z) > WORLD_HALF_M - 8) continue;
          const depth = waterDepthAt(x, z);
          if (depth < 0.6 || depth > 2.6) continue;
          // A footing within 11 m — dry bank preferred (the bow
          // then points away from the true shore), wading depth
          // accepted where no bank is that close.
          let dryFooting = null;
          let wadeFooting = null;
          for (let s2 = 0; s2 < 12; s2++) {
            const a2 = (s2 / 12) * Math.PI * 2;
            for (const rr of [5, 8, 11]) {
              const fx = x + Math.cos(a2) * rr;
              const fz = z + Math.sin(a2) * rr;
              if (!dryFooting && heightAt(fx, fz) > WATER_Y + 0.05) dryFooting = { x: fx, z: fz };
              else if (!wadeFooting && waterDepthAt(fx, fz) <= 1.2) wadeFooting = { x: fx, z: fz };
            }
          }
          const footing = dryFooting || wadeFooting;
          if (!footing) continue;
          // Bow toward open water: away from the footing.
          const heading = Math.atan2(x - footing.x, z - footing.z);
          found = {
            id: `boat-${bi}`, slug: BOAT_SLUG, label: labels[k] || 'River Runner',
            bodyIndex: bi, x, z, heading, parcelId: p.id,
          };
        }
      }
      if (found) break;
    }
    if (found) picks.push(found);
  });
  _moorings = picks;
  return picks;
}

let _instances = null;

/**
 * Every vehicle instance on the planet:
 * [{ id, slug, label, home: { x, z, heading } }] — the airport
 * four first (ids = slugs, Phase 1), then the scattered land
 * machines, then the boats.
 */
export function vehicleInstances() {
  if (_instances) return _instances;
  const out = [];
  for (const spot of AIRPORT_PARKING) {
    out.push({ id: spot.slug, slug: spot.slug, label: null, home: { x: spot.x, z: spot.z, heading: spot.heading } });
  }
  for (const s of scatteredVehicleSpots()) {
    out.push({ id: s.id, slug: s.slug, label: s.label, home: { x: s.x, z: s.z, heading: s.heading } });
  }
  for (const m of boatMoorings()) {
    out.push({ id: m.id, slug: BOAT_SLUG, label: m.label, home: { x: m.x, z: m.z, heading: m.heading } });
  }
  _instances = out;
  return out;
}

const _byId = new Map();
/** One instance by id, or null. */
export function vehicleInstanceById(id) {
  if (!_byId.size) for (const inst of vehicleInstances()) _byId.set(inst.id, inst);
  return _byId.get(id) || null;
}

/** The model slug an instance id belongs to (itself, for the
 *  airport four), or null for an unknown id. */
export function modelSlugForInstance(id) {
  const inst = vehicleInstanceById(id);
  return inst ? inst.slug : null;
}

/** A fresh state at an instance's home. */
export function homeStateForInstance(id) {
  const inst = vehicleInstanceById(id);
  if (!inst) return null;
  return { slug: inst.slug, x: inst.home.x, z: inst.home.z, heading: inst.home.heading, speed: 0, alt: 0 };
}

/** The parcel a scattered spot or mooring belongs to (display). */
export function instanceParcelId(id) {
  const s = scatteredVehicleSpots().find((v) => v.id === id);
  if (s) return s.parcelId;
  const m = boatMoorings().find((v) => v.id === id);
  if (m) return m.parcelId;
  const at = parcelAtWorld((vehicleInstanceById(id) || {}).home?.x || 0, (vehicleInstanceById(id) || {}).home?.z || 0);
  return at ? at.id : null;
}
