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
/** One instance by id, or null. Stock ids resolve to a
 *  descriptor of their home instance wearing the stock id — a
 *  stock machine IS its home's model, parked at its home. */
export function vehicleInstanceById(id) {
  if (!_byId.size) for (const inst of vehicleInstances()) _byId.set(inst.id, inst);
  const direct = _byId.get(id);
  if (direct) return direct;
  const homeId = homeIdForStock(id);
  if (homeId) {
    const parent = _byId.get(homeId);
    if (parent) return { id, slug: parent.slug, label: parent.label, home: parent.home };
  }
  return null;
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

// ── Ownership (Merlin, 2026-10-23) ──────────────────────────────
// Boarding a fleet machine CLAIMS it: the instance becomes that
// account's personal machine. The claim lives on the instance
// STATE (the device ledger earth2:vehicles:v1 today), as two
// fields shaped for a server lift later:
//   claimedBy — the account key (see claimKeyForUser), or null
//   claimedAt — epoch ms of the claim, or null
// A claimed machine's saved position / heading / integrity is
// AUTHORITATIVE: it never resets home on load and is never
// replaced — with one exception Merlin himself set: a claimed
// WRECK is replaced at home after the usual 5 s timer, and the
// replacement keeps the claim (the law lives in vehicles.js's
// tickVehicleRespawn, which carries the fields over).
//
// HOME REPLENISHMENT: when a claimed machine departs its home —
// the trigger is the first exit of HOME_RADIUS_M from the home
// anchor after claiming (boarding and stepping straight back
// out at home claims nothing away) — the state stamps
// `awaySince` (epoch ms). REPLENISH_DELAY_S later, if no
// unclaimed machine is sitting at that home, a FRESH UNCLAIMED
// stock instance shimmers in at the home so the spot stays
// stocked for the next driver. A stock instance is an ordinary
// fleet unit (own integrity, own wreck/respawn law) whose id is
// `<homeId>~stock`, then `~stock2`, `~stock3`… — generations are
// capped per home so a much-claimed apron cannot grow forever.
export const STOCK_SUFFIX = '~stock';
export const HOME_RADIUS_M = 12;
export const REPLENISH_DELAY_S = 4;
export const MAX_STOCK_PER_HOME = 3;

/** The account key a claim is stamped with: the account's
 *  email (lowercased), else its id, else the device-local key —
 *  one driver per device in this build. */
export function claimKeyForUser(user) {
  if (user && typeof user.email === 'string' && user.email) return user.email.toLowerCase();
  if (user && user.id != null) return String(user.id);
  return 'local-driver';
}

/** True for a stock-instance id (`<homeId>~stock[<n>]`). */
export function isStockId(id) {
  return typeof id === 'string' && id.includes(STOCK_SUFFIX);
}

/** The home (registry) instance id a stock id belongs to, or
 *  null when the id is not a stock id. */
export function homeIdForStock(id) {
  if (!isStockId(id)) return null;
  return id.slice(0, id.indexOf(STOCK_SUFFIX));
}

/** The stock id for a home at a generation (1 = `~stock`). */
export function stockIdFor(homeId, generation = 1) {
  return generation <= 1 ? `${homeId}${STOCK_SUFFIX}` : `${homeId}${STOCK_SUFFIX}${generation}`;
}

/** The next free stock id for a home given the live state map,
 *  or null when the home's generations are exhausted. */
export function nextStockId(states, homeId) {
  if (!states || typeof states !== 'object') return null;
  for (let g = 1; g <= MAX_STOCK_PER_HOME; g++) {
    const id = stockIdFor(homeId, g);
    if (!states[id]) return id;
  }
  return null;
}

/** Is this state claimed, and by this key when one is given? */
export function isClaimed(state) {
  return !!(state && typeof state.claimedBy === 'string' && state.claimedBy);
}
export function isClaimedBy(state, key) {
  return isClaimed(state) && state.claimedBy === key;
}

/** Stamp a claim onto a state (a copy — the input is untouched). */
export function claimStateFor(state, key, now) {
  if (!state || !key) return state;
  return { ...state, claimedBy: key, claimedAt: typeof now === 'number' ? now : null };
}

/**
 * The departure stamp: a claimed state that has left its home
 * radius carries `awaySince`; back inside the radius the stamp
 * clears. Returns the SAME object when nothing changes (the
 * scene saves only on change), a stamped copy otherwise.
 * Wrecks are neither stamped nor cleared — a wreck's law is the
 * replacement timer, not replenishment.
 */
export function noteDeparture(state, home, now) {
  if (!state || !home || state.wrecked || !isClaimed(state)) return state;
  const away = Math.hypot(state.x - home.x, state.z - home.z) > HOME_RADIUS_M || (state.alt || 0) > 2;
  if (away && !state.awaySince) return { ...state, awaySince: now };
  if (!away && state.awaySince) return { ...state, awaySince: null };
  return state;
}

/**
 * Does this home need a stock machine? True when some claimed
 * machine of this home has been away past the replenish delay
 * and no unclaimed machine is sitting at the home. `states` is
 * the live instance map; `now` is epoch ms.
 */
export function stockDueForHome(states, homeId, now) {
  if (!states || typeof states !== 'object') return false;
  const inst = vehicleInstanceById(homeId);
  if (!inst) return false;
  const home = inst.home;
  let awayLongEnough = false;
  for (const [id, s] of Object.entries(states)) {
    if (!s || typeof s.x !== 'number') continue;
    const mine = id === homeId || homeIdForStock(id) === homeId;
    if (!mine) continue;
    // Any machine of this home sitting on the spot — claimed,
    // stock, or a wreck mid-countdown — means the home is not
    // standing empty; nothing new spawns onto an occupied spot.
    if (Math.hypot(s.x - home.x, s.z - home.z) <= 3 && (s.alt || 0) < 0.05) return false;
    if (isClaimed(s) && s.awaySince && now - s.awaySince >= REPLENISH_DELAY_S * 1000) awayLongEnough = true;
  }
  return awayLongEnough;
}

/** A fresh unclaimed stock state at a home (whole bar, parked). */
export function freshStockState(homeId) {
  const home = homeStateForInstance(homeId);
  if (!home) return null;
  return {
    ...home, integrity: 100, wrecked: false,
    claimedBy: null, claimedAt: null, awaySince: null,
  };
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
