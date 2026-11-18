// lib/mars2/world.js — Mars 2 world constants (Merlin, Nov 15, 2026).
//
// Mars 2 is the successor world to Mars 1 (Earth 1 → Earth 2
// pattern): same seeded Mars engine, a fixed seed, no exobiology
// program — the world is terrain + rovers + day/night + landmarks.
// Pure, node-safe: the scene and the tests share these numbers.
//
// What lives here: the route identity (the coordinator owns the
// menu registries; this is the single source of truth for the
// key/path the registries will point at), the fixed seed, the
// walker spawn, the world rim, the day factor arc, and the ARES
// outpost site — the place the rovers have to go.

import { SeedRNG, getTerrainHeight } from '../mars/engine.js';

export const MARS2_ROUTE_KEY = 'mars-2';
export const MARS2_ROUTE_PATH = '/mars-2';
export const MARS2_SEED = 'MARS-2';
export const MARS2_WORLD_NAME = 'Tharsis Reach [MARS-2]';
export const WORLD_RADIUS = 88;
// WORLD_RADIUS is the HOME REGION: the outpost, the Mons, the
// basins and the build plots all live inside it. The world itself
// is ENDLESS (Merlin, Nov 18, 2026) — the rim clamp is gone, so
// this number bounds only the fixed features' neighbourhood,
// never the walker. Anything that used to clamp to it now
// streams past it.
export const WALKER_SPAWN = { x: 10, z: 26 };
export const EYE_HEIGHT = 1.7;
export const OUTPOST_NAME = 'ARES OUTPOST';

// The day factor (0 night → 1 day) for a time-of-day 0..1 — the
// same smoothstep arc the Mars 1 sky uses (marsSky in
// components/mars/MarsScene.jsx), so the dust and devils dim with
// the same sun the shared day/night rig drives.
export function mars2DayFactor(timeOfDay) {
  const elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const s = Math.max(0, Math.min(1, (elev + 0.06) / (0.28 + 0.06)));
  return s * s * (3 - 2 * s);
}

/**
 * The ARES outpost site: a seeded spot 16–24 m out from the
 * walker spawn, clear of the Mons (radius 70–78) and clear of
 * any basin (never inside a pool's radius). Deterministic per
 * seed. The outpost is the rovers' home: habitat domes, a
 * landing pad, a comms mast, solar panels — somewhere to drive
 * to, and the landmark the walker spawns looking at.
 */
export function outpostSite(profile) {
  const rng = new SeedRNG(`${profile.seed}-OUTPOST`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(16, 24);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const inBasin = profile.basins.some(
      (b) => Math.hypot(x - b.x, z - b.z) < b.radius * 1.1,
    );
    if (inBasin) continue;
    return {
      x,
      z,
      y: getTerrainHeight(x, z, profile),
      angle,
      dist,
      name: OUTPOST_NAME,
    };
  }
  // Fallback: due east of spawn, basins be damned — the caller
  // still gets a deterministic site.
  const x = 20;
  const z = 0;
  return { x, z, y: getTerrainHeight(x, z, profile), angle: 0, dist: 20, name: OUTPOST_NAME };
}

// ── ARES outpost rebuild (Merlin, Nov 17, 2026) ─────────────────────
// The outpost grows a walk-in interior in the larger dome, so the
// building needs real dimensions in one place: the scale, the
// doorway's facing, and the solid parts the walker and the rover
// cannot pass through. Pure functions — the scene and the tests
// share them; the scene never re-derives a number by hand.
//
// The outpost group is scaled by OUTPOST_SCALE and rotated so the
// big dome's door (local -X, where the doorway wedge is cut)
// faces the walker spawn — the walker spawns looking at the door.
// Local units are the build units (dome radius 3.2); world units
// are local × OUTPOST_SCALE.
export const OUTPOST_SCALE = 1.5;
export const OUTPOST_BIG_DOME_R_M = 3.2 * OUTPOST_SCALE; // 4.8 world m
export const OUTPOST_SMALL_DOME_R_M = 2.4 * OUTPOST_SCALE; // 3.6 world m
export const OUTPOST_DOOR_WEDGE_RAD = 0.42; // doorway cut in the big dome shell
export const OUTPOST_DOOR_HALF_ANGLE_RAD = 0.2; // open sector at the dome wall (matches the wedge)
export const OUTPOST_DOOR_PASSAGE_M = 2.4; // how far the open passage runs out
export const OUTPOST_DOOR_CORRIDOR_HALF_M = 0.5; // the airlock's clear half-width for a walker
export const OUTPOST_LINTEL_WORLD_M = 2.6; // doorway head height, world metres
export const OUTPOST_LINTEL_LOCAL_M = OUTPOST_LINTEL_WORLD_M / OUTPOST_SCALE; // 1.73 local
// The wedge patch above the lintel reaches down to this polar
// angle: cos(theta) = lintel / dome radius, so the patch spans
// theta 0..theta (the dome's crown down to the lintel height).
export const OUTPOST_DOOR_THETA = Math.acos(OUTPOST_LINTEL_LOCAL_M / 3.2);
export const OUTPOST_WALKER_BODY_R_M = 0.35;
export const OUTPOST_ROVER_BODY_R_M = 1.6;
// The connector tube runs wall-to-wall between the domes (local
// x): the big dome's wall is at -4 + 3.2 = -0.8, the small dome's
// at 4 - 2.4 = +1.6. The tube is exactly that long — it must not
// poke into either room (Nov 17: 1.9 local of tube + its end cap
// stuck into the big dome's room, reading as a dark red dome
// inside the habitat). The visual tube and the capsule below
// share these ends.
export const OUTPOST_TUBE_X0_LOCAL = -4 + 3.2; // -0.8, big dome wall
export const OUTPOST_TUBE_X1_LOCAL = 4 - 2.4; // +1.6, small dome wall
// Decor that blocks the walker inside the dome (local coords,
// dome centre (-4, 0), radius in local units): bunks, table,
// console, greenhouse, crates. The connector tube's strip stays
// clear of them — the tube is its own capsule below.
export const OUTPOST_DECOR_COLLIDERS = [
  { x: -5.2, z: -1.9, r: 0.9 }, // bunks
  { x: -3.2, z: 1.2, r: 0.9 }, // table
  { x: -2.8, z: -1.6, r: 0.8 }, // console
  { x: -5.0, z: 1.6, r: 0.8 }, // greenhouse rack
  { x: -6.2, z: 0.8, r: 0.7 }, // crates
];

/**
 * The outpost group's rotation.y: local -X (the big dome's door)
 * lands on the direction from the outpost to the walker spawn.
 * rotation.y = θ maps local (-1,0,0) to (-cosθ, 0, sinθ), so
 * cosθ = -dx/L and sinθ = dz/L for the spawn direction (dx, dz).
 */
export function outpostDoorAngle(site, spawn = WALKER_SPAWN) {
  const dx = spawn.x - site.x;
  const dz = spawn.z - site.z;
  return Math.atan2(dz, -dx);
}

/** The outpost group's placement: site + door-facing angle + scale. */
export function outpostTransform(site) {
  return {
    x: site.x, z: site.z, y: site.y,
    angle: outpostDoorAngle(site),
    scale: OUTPOST_SCALE,
  };
}

/** A group-local (x, z) into world (x, z) through the outpost transform. */
export function outpostLocalToWorld(lx, lz, site) {
  const t = outpostTransform(site);
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  return {
    x: t.x + (lx * c + lz * s) * t.scale,
    z: t.z + (-lx * s + lz * c) * t.scale,
  };
}

/**
 * Push a world (x, z) out of the outpost's solid parts — the big
 * dome's wall (except through its doorway), the small dome, the
 * connector tube (a capsule lying on the dirt), and the big
 * decor inside. Returns the corrected position (a fresh object).
 * The doorway is a real opening: inside the door sector, the wall
 * does not block between the dome interior and the end of the
 * airlock passage, and the passage's sides hold the walker in the
 * corridor so they cannot slip around the airlock's flanks.
 * No barrier anywhere else — the open dunes are untouched.
 */
export function outpostCollide(x, z, site, bodyRadius = OUTPOST_WALKER_BODY_R_M) {
  const big = outpostLocalToWorld(-4, 0, site);
  const small = outpostLocalToWorld(4, 0, site);
  const door = {
    x: WALKER_SPAWN.x - site.x,
    z: WALKER_SPAWN.z - site.z,
  };
  const dl = Math.hypot(door.x, door.z) || 1;
  door.x /= dl;
  door.z /= dl;
  let px = x;
  let pz = z;

  // Big dome: solid wall with a doorway sector.
  const R = OUTPOST_BIG_DOME_R_M;
  const dx = px - big.x;
  const dz = pz - big.z;
  const d = Math.hypot(dx, dz);
  if (d < R + bodyRadius) {
    const dot = d > 1e-9 ? (dx * door.x + dz * door.z) / d : 1;
    // The doorway is walker-sized (the airlock is 1.7 m wide):
    // a body wider than the corridor — the rover, 1.9 m — cannot
    // use it, so the dome stays solid to the rover.
    const canUseDoor = bodyRadius <= OUTPOST_DOOR_CORRIDOR_HALF_M + 0.01;
    const inSector = canUseDoor && dot > Math.cos(OUTPOST_DOOR_HALF_ANGLE_RAD);
    const passageEnd = R + OUTPOST_DOOR_PASSAGE_M;
    if (inSector && d < passageEnd) {
      // Open passage: inside the dome the room is open; in the
      // wall band and out through the airlock, hold the walker in
      // the corridor so they cannot slip around the airlock's
      // flanks or clip its side walls.
      const along = dx * door.x + dz * door.z;
      const perpX = dx - along * door.x;
      const perpZ = dz - along * door.z;
      const perp = Math.hypot(perpX, perpZ);
      if (d > R - 0.5 && perp > OUTPOST_DOOR_CORRIDOR_HALF_M && along > 0 && perp > 1e-9) {
        const s = OUTPOST_DOOR_CORRIDOR_HALF_M / perp;
        px = big.x + along * door.x + perpX * s;
        pz = big.z + along * door.z + perpZ * s;
      }
    } else if (d > R - 0.5 && d < R) {
      // In the wall band, away from the door: the far wall holds
      // the walker INSIDE at R − 0.5 — they cannot pass through
      // the wall. (Round 2: the old condition was inverted —
      // `d < R - 0.5` shoved every inside walker OUT to the wall
      // ring, and the next frame ejected them outside the dome,
      // so the room was uninhabitable off the door line.)
      const hold = R - 0.5;
      px = big.x + (dx / d) * hold;
      pz = big.z + (dz / d) * hold;
    } else if (d >= R) {
      // Outside (or in the wall band): push out to the wall face.
      const push = R + bodyRadius;
      px = big.x + (dx / d) * push;
      pz = big.z + (dz / d) * (push);
    }
  }

  // Small dome: solid, no door.
  const SR = OUTPOST_SMALL_DOME_R_M;
  const sdx = px - small.x;
  const sdz = pz - small.z;
  const sd = Math.hypot(sdx, sdz);
  if (sd < SR + bodyRadius && sd > 1e-9) {
    px = small.x + (sdx / sd) * (SR + bodyRadius);
    pz = small.z + (sdz / sd) * (SR + bodyRadius);
  }

  // Connector tube: capsule from the big dome's wall to the small
  // dome's wall, belly on the dirt — solid at ground level.
  // Wall-to-wall (OUTPOST_TUBE_X0/X1_LOCAL): the tube never enters
  // either room, so the capsule never reaches inside either.
  const a = outpostLocalToWorld(OUTPOST_TUBE_X0_LOCAL, 0, site);
  const b = outpostLocalToWorld(OUTPOST_TUBE_X1_LOCAL, 0, site);
  const TR = 0.9 * OUTPOST_SCALE;
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  let tt = ((px - a.x) * abx + (pz - a.z) * abz) / len2;
  tt = Math.max(0, Math.min(1, tt));
  const cx = a.x + abx * tt;
  const cz = a.z + abz * tt;
  const cdx = px - cx;
  const cdz = pz - cz;
  const cd = Math.hypot(cdx, cdz);
  if (cd < TR + bodyRadius && cd > 1e-9) {
    px = cx + (cdx / cd) * (TR + bodyRadius);
    pz = cz + (cdz / cd) * (TR + bodyRadius);
  }

  // Big decor inside the dome (bunks, table, console, greenhouse,
  // crates): solid circles, so the walker cannot clip through the
  // furniture they can see.
  for (const dec of OUTPOST_DECOR_COLLIDERS) {
    const w = outpostLocalToWorld(dec.x, dec.z, site);
    const wr = dec.r * OUTPOST_SCALE;
    const ddx = px - w.x;
    const ddz = pz - w.z;
    const dd = Math.hypot(ddx, ddz);
    if (dd < wr + bodyRadius && dd > 1e-9) {
      px = w.x + (ddx / dd) * (wr + bodyRadius);
      pz = w.z + (ddz / dd) * (wr + bodyRadius);
    }
  }

  return { x: px, z: pz };
}

/**
 * True when a world (x, z) is sheltered from a sandstorm: inside
 * the big dome's room, or in the airlock passage (the roofed
 * corridor from the dome wall to the door mouth). The small dome
 * has no door, so nobody can be inside it. The open dunes, the
 * landing pad and the rover are NOT shelter — only the habitat
 * (and the ship's enclosed orb, which the caller adds by mode).
 * Same geometry as outpostCollide's doorway: the room is the
 * disc inside the wall, the passage is the door sector out to
 * the airlock mouth.
 */
export function isShelteredAt(x, z, site) {
  const big = outpostLocalToWorld(-4, 0, site);
  const R = OUTPOST_BIG_DOME_R_M;
  const dx = x - big.x;
  const dz = z - big.z;
  const d = Math.hypot(dx, dz);
  // Inside the room (the wall band is not inside).
  if (d < R - 0.5) return true;
  const door = {
    x: WALKER_SPAWN.x - site.x,
    z: WALKER_SPAWN.z - site.z,
  };
  const dl = Math.hypot(door.x, door.z) || 1;
  door.x /= dl;
  door.z /= dl;
  const dot = d > 1e-9 ? (dx * door.x + dz * door.z) / d : 1;
  if (dot > Math.cos(OUTPOST_DOOR_HALF_ANGLE_RAD) && d < R + OUTPOST_DOOR_PASSAGE_M) {
    const along = dx * door.x + dz * door.z;
    const perpX = dx - along * door.x;
    const perpZ = dz - along * door.z;
    const perp = Math.hypot(perpX, perpZ);
    if (along > 0 && perp <= OUTPOST_DOOR_CORRIDOR_HALF_M) return true;
  }
  return false;
}
