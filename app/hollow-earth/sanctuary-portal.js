// app/hollow-earth/sanctuary-portal.js — THE SANCTUARY CENTRE PORTAL.
//
// Dive round (Merlin, Nov 24 ~16:51): "make walking through a
// portal in the middle of a sanctuary a thing, and it should
// bring users to monsters of that type".
//
// WHAT THE VIDEO SHOWED vs WHAT THE CODE HAD (checked, not
// assumed): the frames show a small dark structure with a glow
// standing inside a sanctuary ring — but a grep for "portal"
// across the Hollow Earth code returns nothing, and no centre
// structure exists at any zone centre in code. What DOES stand
// at six of the fourteen zone centres is the band's own
// landmark (data.js): the ooze-pool at Acid Hollow, the
// ember-spire at Ember Rest, the storm-pylon at Storm Calm,
// the mire-arch at Spore Sanctuary, the peak-shrine at
// Mountain Watch, and the Haven's own pole + dome. Those are
// band markers and mission targets (the storm-pylon is the
// "First Pylon" checkpoint) — they stay. The portal built here
// is the real thing, and it is a NEW structure: one arch per
// sanctuary, in the ward-line language (sanctuary-ring.js),
// standing at the sanctuary's heart.
//
// THE SEAT PROBLEM (why the seat is not always the exact
// centre): the walker cannot stand inside a landmark collider
// (resolveColliders pushes them out to the collider's edge), so
// a portal seated at the exact centre of Acid Hollow (ooze-pool
// collider r 7.2), Ember Rest (r 3.3), Storm Calm (r 2.5),
// Spore Sanctuary (r 4) or Mountain Watch (r 4.4) could never
// be walked through — the trigger is a 1.5 m radius around the
// seat, and the walker is held metres away. portalSeatForZone
// seats the portal at the zone centre wherever the centre is
// open (nine zones, The Haven included), and steps it just
// clear of the blocking collider everywhere else — still deep
// inside the sanctuary (the step is at most ~9 m in an r 24
// zone), facing the sanctuary's heart, so the eye still reads
// it as the centre piece. The seat is deterministic per zone
// (a hash of the zone name), never random per session.
//
// THE TRAVEL RULE (pickPortalDestination):
//   - the portal's element is the zone's element, read through
//     biomes.js — mountain IS lightning there, so both mountain
//     zones send the walker to lightning monsters;
//   - The Haven wears gold, no element: its portal is the
//     general door out, and takes the walker to the NEAREST
//     field monsters of any family — the sand flats around the
//     Haven are the arrival ground, so the nearest wild monsters
//     are the natural first hunt;
//   - the destination is a point AMONG live monsters of that
//     type: 8 m off one of the five nearest, the pick seeded by
//     the zone name so each sanctuary has its own road, and the
//     walker lands FACING that monster;
//   - the landing is verified, never assumed: outside every
//     safe zone (isInSanctuary) and every structure ring
//     (isInsideAnyRing), inside the hunted disc (r 540), and at
//     least 5 m clear of EVERY live monster — never inside one;
//   - POISON HAS NO LIVE MONSTERS: no poison family has a
//     placed GLB (families exist — slot-36/38/40 + vice — but
//     none is in PLACED_FIELD_KEYS, and vice's file is
//     truncated), so both poison sanctuaries fall back to the
//     nearest live monsters of any element, flagged `fallback`
//     so the page never claims a poison hunt it cannot deliver.
//     The fallback heals itself: the moment a poison re-send
//     lands, the poison portals point at real poison monsters
//     with no code change.
//   - the portal is one-way OUT for the player only. No monster
//     spawn, hunt, or travel ever uses it, and the sanctuary law
//     in sanctuary.js is untouched: nothing about this module
//     relaxes it. Death still returns to The Haven.
//
// THE MESH (buildSanctuaryPortal): procedural only, no
// binaries — an arch torus + gold trim in the zone's element
// colour, a glowing disc filling the arch, a brighter core,
// and a gold ground ring at its foot (the ward-line: element
// colour + sanctuary gold, breathing, DoubleSide, additive —
// the same look as the sanctuary rings, so the portal reads as
// part of the sanctuary, not a foreign object). NO COLLIDER is
// ever built for a portal (userData.colliderR is 0 and zone.js
// never pushes it into world.colliders): the walker passes
// straight through it, and the travel fires. The group is
// seated by the caller (zone.js: liftedPoint + orientationQuat,
// the landmark pattern) — this module only builds the piece
// standing on its local ground.
//
// Pure module: no THREE import, no DOM — R (the THREE
// namespace) arrives as a parameter, the landmark pattern.

import { isInSanctuary, isInsideAnyRing } from './sanctuary.js';
import { BIOMES } from './biomes.js';
import { FAMILIES_BY_ELEMENT } from './families.js';
import { ringElementColor, SANCTUARY_GOLD } from './sanctuary-ring.js';

/* The portal's dimensions (worker's call, stated plainly). */
export const PORTAL_ARCH_R_M = 2.2; // arch torus radius — a walker passes under it standing
export const PORTAL_DISC_R_M = 2.0; // glow disc filling the arch
export const PORTAL_GROUND_RING_R_M = 2.6; // gold foot-ring on the ground
export const PORTAL_TRIGGER_R_M = 1.5; // walk within this of the seat and the travel fires
export const PORTAL_COOLDOWN_S = 5; // re-fire guard after a travel (the page's call)
export const PORTAL_STANDOFF_M = 8; // landing distance off the anchor monster
export const PORTAL_CLEAR_M = 5; // landing must clear EVERY live monster by this
export const PORTAL_HUNTED_DISC_R_M = 540; // landings stay inside the spawn field's disc
/* The point a centre-seated portal faces: the arrival ground
 * (spawns.js WORLD_SPAWN, 0, 95) — the way most walkers enter
 * a sanctuary. Offset portals face the sanctuary's heart
 * instead. A local copy, not an import: spawns.js is the whole
 * combat system, and this module stays light. */
export const PORTAL_FACE_POINT = Object.freeze({ x: 0, z: 95 });

/** Deterministic seed in [0, 1) for a zone — a djb2 hash of its
 * name, so each sanctuary has its own road and the road never
 * moves between sessions. */
export function portalSeed(zone) {
  const name = (zone && zone.name) || '';
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return h / 4294967296;
}

/**
 * The monster element a zone's portal leads to, or null for The
 * Haven (gold — no element, the general door out). Mountain
 * resolves through biomes.js, where the mountain element IS
 * lightning — never a second copy of that rule here.
 */
export function portalElementForZone(zone) {
  if (!zone || !zone.element || zone.element === 'gold') return null;
  const band = BIOMES[zone.element];
  return (band && band.element) || zone.element;
}

/**
 * The monster family keys of a zone's portal element — the
 * element → families table, read straight off families.js
 * (FAMILIES_BY_ELEMENT, dragons excluded there as in
 * spawns.js TYPES_BY_ELEMENT). The Haven returns []: no
 * element, so no family list — its portal takes the nearest
 * field monsters of any family instead. Poison returns its
 * four families even though none is placed yet: the mapping is
 * the truth, the live fallback is pickPortalDestination's job.
 */
export function portalFamiliesForZone(zone) {
  const element = portalElementForZone(zone);
  if (!element) return [];
  return [...(FAMILIES_BY_ELEMENT[element] || [])];
}

/**
 * Where a zone's portal stands ({ x, z, offset, offsetM }).
 * The zone centre wherever the centre is open; where a
 * landmark collider covers the centre, the seat steps out just
 * clear of the blocking collider (collider radius + trigger
 * radius + 0.5 m) in a deterministic direction (the zone seed),
 * so the walker can actually reach the trigger — and it stays
 * well inside the sanctuary. `colliders` is the world's static
 * list ({ x, z, r } each); a null list seats the centre.
 * The seat is verified reachable: after stepping, no collider
 * may sit within (r + 0.5 m) of it, or the step grows.
 */
export function portalSeatForZone(zone, colliders) {
  const list = Array.isArray(colliders) ? colliders : [];
  const centre = { x: zone.x, z: zone.z };
  // A collider covers the centre when the walker cannot get
  // within trigger range of it: the closest the walker can
  // stand to the centre is (c.r − distance), so the centre is
  // blocked exactly when that exceeds the trigger radius.
  const covering = list.filter((c) => {
    if (!c || !(c.r > 0)) return false;
    return Math.hypot(centre.x - c.x, centre.z - c.z) < c.r - PORTAL_TRIGGER_R_M;
  });
  if (covering.length === 0) return { x: zone.x, z: zone.z, offset: false, offsetM: 0 };
  // The step must clear the WORST covering collider: its centre
  // distance from the zone centre plus its radius plus room to
  // stand in the trigger.
  let step = 0;
  for (const c of covering) {
    step = Math.max(step, Math.hypot(centre.x - c.x, centre.z - c.z) + c.r + PORTAL_TRIGGER_R_M + 0.5);
  }
  const angle = portalSeed(zone) * Math.PI * 2;
  // Grow the step until the seat itself is reachable (no
  // collider within r + 0.5 m of it), and keep it inside the
  // sanctuary with room to stand (zone.r − 2 m at most).
  const maxStep = Math.max(0, zone.r - 2);
  let guard = 0;
  let seat = null;
  while (guard++ < 12) {
    const d = Math.min(step, maxStep);
    seat = { x: centre.x + Math.cos(angle) * d, z: centre.z + Math.sin(angle) * d };
    const blocked = list.some((c) => c && c.r > 0
      && Math.hypot(seat.x - c.x, seat.z - c.z) < c.r + 0.5);
    if (!blocked || d >= maxStep) break;
    step += 2;
  }
  return { x: seat.x, z: seat.z, offset: true, offsetM: Math.hypot(seat.x - centre.x, seat.z - centre.z) };
}

/**
 * The yaw the portal arch faces at its seat: the disc's normal
 * points at the zone centre for an offset seat (the gate faces
 * the sanctuary's heart), and at the arrival ground for a
 * centre seat. The flat yaw convention: forward at yaw is
 * (−sin yaw, −cos yaw) in (x, z), so facing (dx, dz) is
 * atan2(−dx, −dz).
 */
export function portalYawForZone(zone, seat) {
  const target = seat && seat.offset
    ? { x: zone.x, z: zone.z }
    : PORTAL_FACE_POINT;
  const dx = target.x - seat.x;
  const dz = target.z - seat.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  return Math.atan2(-dx / d, -dz / d);
}

/** Live monsters in a world record: not dead, on the deck. */
function liveMonsters(world) {
  const list = (world && Array.isArray(world.monsters)) ? world.monsters : [];
  return list.filter((m) => m && !m.dead
    && Number.isFinite(m.x) && Number.isFinite(m.z));
}

/**
 * Pick the portal's destination for a zone: a landing among
 * live monsters of the zone's element — or, for The Haven, the
 * nearest field monsters of any family; or, when the element
 * has no live monsters at all (today: poison), the nearest
 * live monsters of any element, flagged `fallback`.
 *
 * Returns null when the world holds no live monster at all, or
 * when no landing passes the checks (the page then leaves the
 * walker where they are and says so — never a blind jump).
 * Otherwise { x, z, monsterId, monsterType, element,
 * targetElement, fallback, faceYaw, zoneName } — the walker
 * lands at (x, z) facing the anchor monster. faceYaw is the
 * WALKER's yaw, not the monster's: the walker's forward is
 * (−sin yaw, −cos yaw) while a monster's faceYaw is
 * atan2(dx, dz) (riding.js: a figure at yaw + π faces the
 * walker's forward), so the landing yaw is atan2(−dx, −dz)
 * toward the anchor — the monster's atan2 plus π.
 */
export function pickPortalDestination(zone, world) {
  const live = liveMonsters(world);
  if (live.length === 0) return null;
  const targetElement = portalElementForZone(zone);
  let candidates = targetElement
    ? live.filter((m) => m.element === targetElement)
    : live;
  let fallback = false;
  if (candidates.length === 0) {
    // No live monster of this element walks the wilds (today:
    // poison — four families, zero placed GLBs). Fall back to
    // the nearest live monsters of any element rather than
    // stranding the portal; the flag keeps the toast honest.
    candidates = live;
    fallback = true;
  }
  // The five nearest candidates to the zone centre; the pick is
  // seeded by the zone name, so each sanctuary has its own
  // road and the road never moves between sessions.
  const byDistance = [...candidates].sort((a, b) => {
    const da = Math.hypot(a.x - zone.x, a.z - zone.z);
    const db = Math.hypot(b.x - zone.x, b.z - zone.z);
    return da - db;
  });
  const pool = byDistance.slice(0, Math.min(5, byDistance.length));
  const anchor = pool[Math.floor(portalSeed(zone) * pool.length) % pool.length];
  const rings = (world && Array.isArray(world.rings)) ? world.rings : [];
  const baseAngle = portalSeed(zone) * Math.PI * 2;
  // Try standoff rings around the anchor, nearest first, eight
  // bearings each — the first landing that is wilds (outside
  // every sanctuary and structure ring), inside the hunted
  // disc, and clear of every live monster wins.
  for (const standoff of [PORTAL_STANDOFF_M, 10, 12, 15]) {
    for (let k = 0; k < 8; k++) {
      const a = baseAngle + (k * Math.PI) / 4;
      const x = anchor.x + Math.cos(a) * standoff;
      const z = anchor.z + Math.sin(a) * standoff;
      if (Math.hypot(x, z) > PORTAL_HUNTED_DISC_R_M) continue;
      if (isInSanctuary(x, z)) continue;
      if (isInsideAnyRing(x, z, rings)) continue;
      let clear = true;
      for (const m of live) {
        if (Math.hypot(x - m.x, z - m.z) < PORTAL_CLEAR_M) { clear = false; break; }
      }
      if (!clear) continue;
      return {
        x,
        z,
        monsterId: anchor.id,
        monsterType: anchor.type,
        element: anchor.element,
        targetElement,
        fallback,
        faceYaw: Math.atan2(-(anchor.x - x), -(anchor.z - z)),
        zoneName: zone.name,
      };
    }
  }
  return null;
}

/**
 * Build one sanctuary portal (R = the THREE namespace, the
 * landmark pattern — this module imports no THREE). The group
 * stands on its local ground (y 0) with local +Y as up; the
 * caller seats it with liftedPoint + orientationQuat.
 *
 * userData: { sanctuaryPortal: true, zone, element, x, z,
 * colliderR: 0, portal: { glowMat, coreMat, archMat } } —
 * colliderR 0 is the contract: a portal is never a wall, and
 * the caller must never push it into the collider list. The
 * mats are exposed so the zone can breathe them per frame, the
 * ring pattern.
 */
export function buildSanctuaryPortal(zone, R) {
  const element = portalElementForZone(zone);
  const color = ringElementColor(element || 'gold');
  const g = new R.Group();
  // The arch: an element-coloured torus standing on the ground,
  // its centre 2.2 m up so the ring meets the ground at its
  // foot. A torus lies in the local XY plane — vertical, facing
  // local ±Z — which is the walk-through plane.
  const archMat = new R.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.1,
  });
  const arch = new R.Mesh(new R.TorusGeometry(PORTAL_ARCH_R_M, 0.22, 8, 40), archMat);
  arch.position.set(0, PORTAL_ARCH_R_M, 0);
  g.add(arch);
  // Gold trim: a thin outer torus in sanctuary gold — the
  // ward-line's second voice, the same gold as the ring edges.
  const trim = new R.Mesh(
    new R.TorusGeometry(PORTAL_ARCH_R_M + 0.28, 0.06, 6, 40),
    new R.MeshStandardMaterial({
      color: SANCTUARY_GOLD, emissive: SANCTUARY_GOLD, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2,
    }),
  );
  trim.position.set(0, PORTAL_ARCH_R_M, 0);
  g.add(trim);
  // The glow disc: the element colour, additive, filling the
  // arch — the thing the walker steps through. DoubleSide so it
  // reads from either side, fog off so it still reads at
  // distance, depthWrite off like the ring veil.
  const glowMat = new R.MeshBasicMaterial({
    color, transparent: true, opacity: 0.5, side: R.DoubleSide,
    blending: R.AdditiveBlending, depthWrite: false, fog: false,
  });
  const glow = new R.Mesh(new R.CircleGeometry(PORTAL_DISC_R_M, 32), glowMat);
  glow.position.set(0, PORTAL_ARCH_R_M, 0);
  g.add(glow);
  // A brighter core: the same colour, smaller and stronger —
  // the disc reads lit from its middle, not flat.
  const coreMat = new R.MeshBasicMaterial({
    color, transparent: true, opacity: 0.7, side: R.DoubleSide,
    blending: R.AdditiveBlending, depthWrite: false, fog: false,
  });
  const core = new R.Mesh(new R.CircleGeometry(PORTAL_DISC_R_M * 0.6, 24), coreMat);
  core.position.set(0, PORTAL_ARCH_R_M, 0);
  g.add(core);
  // The foot-ring: a flat gold ring on the ground marking where
  // the gate stands — the ward-line's ground band, shrunk to
  // one portal. RingGeometry lies in XY; rotate it flat.
  const foot = new R.Mesh(
    new R.RingGeometry(PORTAL_GROUND_RING_R_M - 0.25, PORTAL_GROUND_RING_R_M, 40),
    new R.MeshBasicMaterial({
      color: SANCTUARY_GOLD, transparent: true, opacity: 0.7,
      side: R.DoubleSide, depthWrite: false, fog: false,
    }),
  );
  foot.rotation.x = -Math.PI / 2;
  foot.position.set(0, 0.15, 0);
  g.add(foot);
  g.userData.sanctuaryPortal = true;
  g.userData.zone = zone.name;
  g.userData.element = zone.element;
  g.userData.x = zone.x;
  g.userData.z = zone.z;
  g.userData.colliderR = 0;
  g.userData.portal = { glowMat, coreMat, archMat };
  return g;
}
