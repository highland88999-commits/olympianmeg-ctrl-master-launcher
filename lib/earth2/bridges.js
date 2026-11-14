// lib/earth2/bridges.js
// EARTH 2 — THE CROSSINGS (Terrain Wave B, 2026-10-23). Merlin:
// "Build bridges over water, every 6 parcels?" — so the planet's
// water is crossable on foot and by machine without a boat: a
// stone-arch bridge (the building catalog's bridge-stone-arch is
// the design language — same stone, same arch) wherever a river
// or lake would otherwise turn a walker back.
//
// THE GEOGRAPHY THE DATA GIVES: Earth 2's water is five long
// north–south rivers running pole to pole (1–3 parcels wide),
// one true lake (20 parcels), and two shallow ponds. The
// crossings are therefore east–west spans over the rivers and
// the lake, spaced along each body's length so a shoreline point
// is never more than ~3 parcels from a deck (a crossing roughly
// every 6 parcels, Merlin's rule of thumb). Two honest
// exceptions, both read off the data:
//   - the west-edge river (body at column 0) has NO far bank —
//     west of it is the world's edge — so a crossing would lead
//     nowhere and none is built;
//   - the two ponds are shallower than the wading limit (0.5–0.6
//     m against MAX_WADE_DEPTH_M 1.35): they never turn anyone
//     back, so they need no bridge.
// Every other body whose depth exceeds the wading limit gets
// crossings. Each span: two abutments founded on DRY land (the
// centreline is scanned metre by metre until the banks read
// solid), a deck crowned 2.2 m above the waterline with ramps
// down to bank height, one arch opening at the centre — high
// enough at mid-span for the River Runner to pass beneath
// (lib/earth2/vehicles.js, the boat).
//
// THE DECK IS LAW, NOT MESH: bridgeHeightAt(x, z) is the pure
// sampler the walker step and the ground-vehicle step consult,
// so feet and wheels ride the deck exactly; bridge piers (the
// waterline ends of the arch) are the boat's obstacles, exported
// as bridgePierColliders(). The meshes in the scene are built
// from this same data and can never disagree with the law.
//
// Pure and deterministic — derived from world.js's own water
// data with seeded scans only; world generation is untouched.

import {
  PARCELS,
  PARCEL_COLS,
  PARCEL_ROWS,
} from './parcels.js';
import {
  WORLD_CELL_M,
  WORLD_HALF_M,
  WATER_Y,
  MAX_WADE_DEPTH_M,
  heightAt,
  waterBodies,
  parcelCenterWorld,
} from './world.js';

export const BRIDGE_DECK_WIDTH_M = 6; // two machines pass; a scarab fits
export const BRIDGE_CROWN_M = 2.2; // deck crown above the waterline
export const BRIDGE_SLAB_M = 0.45; // deck slab thickness (boat clearance reads underside)
const RAMP_OVERHANG_M = 3.5; // deck footprint reaching onto each bank
const SPACING_ROWS = 6; // a crossing roughly every 6 parcels along a body
const MIN_GAP_ROWS = 5; // accepted crossings never sit closer than this
const MAX_RUN_PARCELS = 4; // wider water than this is a sea arm, not a neck

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

// The wet test world.js's waterBodies() itself uses.
function wetAtCentre(parcel) {
  const c = parcelCenterWorld(parcel);
  return heightAt(c.x, c.z) < WATER_Y - 0.25;
}

let _bridges = null;

/**
 * Derive every crossing from the water data. A bridge record:
 * { id, bodyIndex, axis: 'x', z (the centreline), row,
 *   from, to (deck footprint ends along x), spanFrom, spanTo
 *   (abutment centres — dry ground), lengthM, crownY,
 *   profile: [{ t, y }] deck-height control points (t 0..1
 *   along from→to), piers: [{ x, z, r }], centerX, centerZ }
 * Sorted by body, then along the body (north to south).
 */
export function worldBridges() {
  if (_bridges) return _bridges;
  const bodies = waterBodies();
  const wet = PARCELS.map(wetAtCentre);
  const bodyOf = new Map();
  bodies.forEach((b, bi) => b.parcels.forEach((p) => bodyOf.set(p.index, bi)));

  const out = [];
  bodies.forEach((body, bi) => {
    if (body.depthM <= MAX_WADE_DEPTH_M) return; // a pond — wadeable, no crossing needed
    const rows = [...new Set(body.parcels.map((p) => p.row))].sort((a, b) => a - b);
    // Candidate rows: this body owns a short wet run in the row,
    // with dry parcels flanking it on BOTH sides (a far bank must
    // exist — the west-edge river fails the west flank forever).
    const candidates = [];
    for (const row of rows) {
      let start = -1;
      for (let col = 0; col <= PARCEL_COLS; col++) {
        const isWet = col < PARCEL_COLS && wet[row * PARCEL_COLS + col] && bodyOf.get(row * PARCEL_COLS + col) === bi;
        if (isWet && start < 0) start = col;
        if (!isWet && start >= 0) {
          const len = col - start;
          if (len >= 1 && len <= MAX_RUN_PARCELS) {
            const westDry = start > 0 && !wet[row * PARCEL_COLS + start - 1];
            const eastDry = col < PARCEL_COLS && !wet[row * PARCEL_COLS + col];
            if (westDry && eastDry) candidates.push({ row, fromCol: start, toCol: col - 1 });
          }
          start = -1;
        }
      }
    }
    if (!candidates.length) return;
    // Space them along the body: first near the north end, then
    // never closer than MIN_GAP_ROWS, aiming at SPACING_ROWS;
    // the tail of the body is covered too (no southern desert
    // left more than a spacing from the last deck).
    const picked = [];
    let lastRow = -Infinity;
    for (const cand of candidates) {
      if (picked.length === 0 || cand.row - lastRow >= MIN_GAP_ROWS) {
        picked.push(cand);
        lastRow = cand.row;
      }
    }
    const maxRow = rows[rows.length - 1];
    const lastCand = candidates[candidates.length - 1];
    if (lastCand && maxRow - lastRow > SPACING_ROWS && lastCand.row !== lastRow) {
      picked.push(lastCand);
    }
    for (const cand of picked) {
      const bridge = buildBridge(bi, cand, out.length);
      if (bridge) out.push(bridge);
    }
  });
  _bridges = out;
  return out;
}

// Found one span: scan the centreline metre by metre from the
// wet run outward until each bank reads solid dry ground; the
// abutment stands there. The deck profile is then built from
// control points that honour the crown over water, the bank
// heights at the ends, and the ground itself (the deck never
// dips below the terrain it crosses + a hand's breadth).
function buildBridge(bodyIndex, cand, seq) {
  const z = (cand.row + 0.5) * WORLD_CELL_M - WORLD_HALF_M;
  const x0 = cand.fromCol * WORLD_CELL_M - WORLD_HALF_M; // wet run west edge
  const x1 = (cand.toCol + 1) * WORLD_CELL_M - WORLD_HALF_M; // wet run east edge
  const scanDry = (fromX, dir) => {
    let solid = 0;
    for (let d = 0; d <= WORLD_CELL_M * 2.5; d += 0.5) {
      const x = fromX + dir * d;
      if (heightAt(x, z) > 0.35) { solid++; if (solid >= 3) return x; }
      else solid = 0;
    }
    return null;
  };
  const west = scanDry(x0, -1);
  const east = scanDry(x1, 1);
  if (west == null || east == null || east - west < 8) return null;
  const from = west - RAMP_OVERHANG_M;
  const to = east + RAMP_OVERHANG_M;
  const lengthM = to - from;
  const hA = heightAt(from, z) + 0.15;
  const hB = heightAt(to, z) + 0.15;
  const crownY = WATER_Y + BRIDGE_CROWN_M;
  const profile = [];
  const STEPS = Math.max(8, Math.round(lengthM / 2));
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = from + (to - from) * t;
    const base = hA + (hB - hA) * t;
    const arch = crownY - (crownY - base) * Math.pow(Math.abs(2 * t - 1), 2.5);
    let y = Math.max(base + 0.1, arch);
    const ground = heightAt(x, z);
    if (y < ground + 0.12) y = ground + 0.12;
    profile.push({ t, y: Math.round(y * 1000) / 1000 });
  }
  // The piers: where the centreline meets the water on each side
  // (bed at −0.3 m), stepped 1.5 m toward the centre — the arch's
  // waterline ends, and the boat's obstacles.
  const waterlineX = (fromX, dir) => {
    for (let d = 0; d <= WORLD_CELL_M * 2.5; d += 0.5) {
      const x = fromX + dir * d;
      if (heightAt(x, z) < WATER_Y - 0.3) return x;
    }
    return null;
  };
  const piers = [];
  const pw = waterlineX(west, 1);
  const pe = waterlineX(east, -1);
  if (pw != null) piers.push({ x: pw + 1.5, z, r: 2.6 });
  if (pe != null) piers.push({ x: pe - 1.5, z, r: 2.6 });
  return {
    id: `bridge-${seq}`,
    bodyIndex,
    axis: 'x',
    row: cand.row,
    z,
    from,
    to,
    spanFrom: west,
    spanTo: east,
    lengthM,
    crownY,
    profile,
    piers,
    centerX: (from + to) / 2,
    centerZ: z,
  };
}

/** Deck height at a profile parameter t (0..1 along from→to). */
export function bridgeDeckYAt(bridge, t) {
  const p = bridge.profile;
  if (!p || !p.length) return null;
  const u = clamp(t, 0, 1) * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(u));
  const f = u - i;
  return p[i].y + (p[i + 1].y - p[i].y) * f;
}

/** Local bridge coordinates for a world point, or null when the
 *  point is nowhere near this bridge's footprint. */
export function bridgeLocal(bridge, x, z) {
  if (Math.abs(z - bridge.z) > BRIDGE_DECK_WIDTH_M / 2) return null;
  if (x < bridge.from || x > bridge.to) return null;
  return { t: (x - bridge.from) / (bridge.to - bridge.from), across: z - bridge.z };
}

/**
 * The deck sampler: the deck's height at a world point, or null
 * when the point is not on any deck. The walker step and the
 * ground-vehicle step consult this; where it answers, the deck
 * — not the terrain, not the water — is the ground.
 */
export function bridgeHeightAt(x, z) {
  let best = null;
  for (const b of worldBridges()) {
    const loc = bridgeLocal(b, x, z);
    if (!loc) continue;
    const y = bridgeDeckYAt(b, loc.t);
    if (y != null && (best == null || y > best)) best = y;
  }
  return best;
}

/** The bridge whose deck a point stands on, or null. */
export function bridgeAt(x, z) {
  for (const b of worldBridges()) {
    if (bridgeLocal(b, x, z)) return b;
  }
  return null;
}

/** Every bridge's pier circles — the boat's obstacles. A boat
 *  passes a bridge through the arch centre, between the piers. */
export function bridgePierColliders() {
  const out = [];
  for (const b of worldBridges()) {
    for (const p of b.piers) out.push({ x: p.x, z: p.z, r: p.r, bridge: b.id });
  }
  return out;
}

/**
 * One walker step ON a bridge (pure; mirrors stepWorldWalker's
 * contract and speeds). env: { heightAt, waterDepthAt,
 * bridgeHeightAt, colliders, travel }.
 * The rule: a candidate on a deck is always lawful (the water
 * below is not the walker's business up here); a candidate off
 * every deck must satisfy the ordinary ground law (wadeable or
 * dry) — so the ends are how you leave, never the sides. Axis
 * slides are tried before the step is given up, exactly the
 * house pattern, and colliders push out last.
 */
export function stepBridgeWalker(state, yaw, input, dt, env) {
  const speed = (env.travel ? 26 : 6) * (env.speedScale ?? 1); // TRAVEL_SPEED_MPS / WALK_SPEED_MPS (world.js)
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  let vx = (-sin) * (Number(input && input.fwd) || 0) + cos * (Number(input && input.strafe) || 0);
  let vz = (-cos) * (Number(input && input.fwd) || 0) + (-sin) * (Number(input && input.strafe) || 0);
  const len = Math.hypot(vx, vz);
  if (len > 1) { vx /= len; vz /= len; }
  const mag = Math.min(1, len);
  const dx = vx * speed * dt;
  const dz = vz * speed * dt;
  const lawful = (x, z) => {
    if (env.bridgeHeightAt(x, z) != null) return true;
    // BRIDGE EXITS (Merlin, 2026-11-03): the ends of a bridge meet
    // the land — if the terrain is dry and within a step of the
    // deck height, the walker steps off smoothly, no stubbornness.
    const deckY = env.bridgeHeightAt(state.x, state.z);
    if (deckY != null) {
      const groundY = env.heightAt ? env.heightAt(x, z) : 0;
      if (Math.abs(groundY - deckY) <= 1.0 && env.waterDepthAt(x, z) <= MAX_WADE_DEPTH_M) {
        return true;
      }
    }
    return env.waterDepthAt(x, z) <= MAX_WADE_DEPTH_M;
  };
  let nx = state.x + dx;
  let nz = state.z + dz;
  if (mag > 0 && !lawful(nx, nz)) {
    if (lawful(nx, state.z)) nz = state.z;
    else if (lawful(state.x, nz)) nx = state.x;
    else { nx = state.x; nz = state.z; }
  }
  // Collider push-out (the walker's own law, WALKER_RADIUS_M —
  // or env.radiusM while parcel-shrunk, Merlin 2026-11-13).
  let px = nx;
  let pz = nz;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of env.colliders || []) {
      const ddx = px - c.x;
      const ddz = pz - c.z;
      const rr = c.r + (env.radiusM ?? 0.55);
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        px = c.x + (ddx / d) * rr;
        pz = c.z + (ddz / d) * rr;
      }
    }
  }
  return {
    x: clamp(px, -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    z: clamp(pz, -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
  };
}

/** Crossings per body, for the chamber's telling: [{ bodyIndex,
 *  size, count, rows }]. */
export function bridgeSummary() {
  const bodies = waterBodies();
  const out = bodies.map((b, bi) => ({ bodyIndex: bi, size: b.size, count: 0, rows: [] }));
  for (const br of worldBridges()) {
    out[br.bodyIndex].count++;
    out[br.bodyIndex].rows.push(br.row);
  }
  return out;
}
