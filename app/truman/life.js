/**
 * app/truman/life.js — pedestrian operators for the Truman town.
 *
 * The live scene had no people at all — an empty perfect town.
 * These operators are the town's residents, in the house idiom
 * (app/star-wars/operators.js, lib/planet-cgi/motion.js): a
 * pedestrian's whole walk is a pure function of (place, kind,
 * device clock) — no stored state, no server. Same index + same
 * time = the same person in the same place on every phone.
 *
 * Kinds (read from the town that exists — houses, main-street
 * shops, the beach road):
 *   stroller — slow loop around a residential block, all day.
 *   shopper  — main street (z ≈ 100, the shop row), pauses at
 *              shop fronts: 8 s still every 40 s.
 *   jogger   — faster loop around the outer ring road.
 * Death law: there is no death, damage, hunt or combat code for
 * pedestrians anywhere in Truman — operators PERSIST (death:
 * null). They sidestep the player (a pure function of the
 * player's position, so it stays deterministic per frame) and
 * never collide with anything — they are life, not mechanics.
 *
 * Nothing here is a fake count: 14 named slots, each with its
 * own seeded route, kind, colour and phase.
 */

import { hash01 } from '../../lib/life-clock.js';

export const TRUMAN_EPOCH_MS = Date.UTC(2026, 0, 1);
export const TRUMAN_PEDESTRIAN_COUNT = 14;

export const PEDESTRIAN_KINDS = {
  stroller: { speed: 1.1, color: '#e8b4b8', label: 'stroller' },
  shopper: { speed: 0.9, color: '#a8c8e8', label: 'shopper', pauseEveryS: 40, pauseS: 8 },
  jogger: { speed: 2.6, color: '#f0d060', label: 'jogger' },
};
export const PEDESTRIAN_KIND_NAMES = Object.keys(PEDESTRIAN_KINDS);

// Pastel small-town wardrobe, one per slot (seeded, stable).
export const PEDESTRIAN_COLORS = [
  '#e8b4b8', '#a8c8e8', '#b8d8a8', '#e8d8a8', '#c8b8e8', '#e8a8c8',
  '#a8d8d8', '#d8b8a8', '#b8c8e8', '#e8c8b8', '#a8e8c8', '#d8a8d8',
  '#c8d8e8', '#e8e8a8',
];

// Residential blocks the strollers loop (block centres from
// town.js generateTown: centres at -220 + 60k, beach x > 150
// excluded, POI blocks skipped by the town builder).
const STROLLER_BLOCKS = [
  { x: -220, z: -160 }, { x: -160, z: 20 }, { x: -100, z: -100 },
  { x: -40, z: 140 }, { x: 20, z: -220 }, { x: 80, z: 80 },
  { x: 140, z: -40 }, { x: -160, z: -220 },
];

// Main-street shop fronts (shops sit at z = 100, x = -80..80).
const SHOPPER_SPOTS = [
  { x: -80, z: 100 }, { x: -40, z: 100 }, { x: 0, z: 100 },
  { x: 40, z: 100 }, { x: 80, z: 100 },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A pedestrian's seeded route: { kind, cx, cz, half, phase, color }.
 * The route is a rectangular loop (half-size `half`) around a
 * block centre — the sidewalk ring around the block, ~6 m off
 * the road centerlines. Shoppers walk the shop row instead.
 */
export function pedestrianRoute(index) {
  const i = ((index % TRUMAN_PEDESTRIAN_COUNT) + TRUMAN_PEDESTRIAN_COUNT) % TRUMAN_PEDESTRIAN_COUNT;
  const kind = PEDESTRIAN_KIND_NAMES[i % PEDESTRIAN_KIND_NAMES.length];
  const phase = hash01(`truman:ped:${i}`, 4242) * 400;
  const color = PEDESTRIAN_COLORS[i];
  if (kind === 'shopper') {
    const spot = SHOPPER_SPOTS[i % SHOPPER_SPOTS.length];
    return { kind, cx: spot.x, cz: spot.z, half: 14, phase, color };
  }
  if (kind === 'jogger') {
    // Outer ring road: a big loop around the town centre.
    return { kind, cx: 0, cz: 0, half: 190, phase, color };
  }
  const block = STROLLER_BLOCKS[i % STROLLER_BLOCKS.length];
  return { kind, cx: block.x, cz: block.z, half: 24, phase, color };
}

// Perimeter position on a rectangular loop: distance d (m) along
// the loop from the (-half, -half) corner, clockwise.
function loopPoint(cx, cz, half, d) {
  const per = half * 8; // perimeter of the square loop
  let s = ((d % per) + per) % per;
  const side = half * 2;
  if (s < side) return { x: cx - half + s, z: cz - half, heading: Math.PI / 2 };
  s -= side;
  if (s < side) return { x: cx + half, z: cz - half + s, heading: 0 };
  s -= side;
  if (s < side) return { x: cx + half - s, z: cz + half, heading: -Math.PI / 2 };
  s -= side;
  return { x: cx - half, z: cz + half - s, heading: Math.PI };
}

/**
 * A pedestrian's state at `nowMs`: { x, z, heading, bob, kind,
 * paused, speed, color }. `player` is { x, z } or null — when
 * the player is within 2.5 m the pedestrian steps aside
 * (perpendicular, away from the player); still a pure function
 * of the inputs, so the frame is deterministic.
 */
export function pedestrianAt(index, nowMs = Date.now(), player = null) {
  const route = pedestrianRoute(index);
  const kind = PEDESTRIAN_KINDS[route.kind];
  const t = (Number(nowMs) - TRUMAN_EPOCH_MS) / 1000;
  // Shoppers pause at shop fronts: 8 s still every 40 s.
  let movingT = t + route.phase;
  let paused = false;
  if (route.kind === 'shopper') {
    const cycle = kind.pauseEveryS;
    const inCycle = ((movingT % cycle) + cycle) % cycle;
    const fullCycles = Math.floor(movingT / cycle);
    const pausedInCycle = clamp01((inCycle - (cycle - kind.pauseS - 2)) / kind.pauseS) * kind.pauseS;
    const pausedTotal = fullCycles * kind.pauseS + (inCycle > cycle - kind.pauseS - 2 ? pausedInCycle : 0);
    movingT -= pausedTotal;
    paused = inCycle >= cycle - kind.pauseS - 2 && inCycle < cycle - 2;
  }
  const dist = kind.speed * movingT;
  const p = loopPoint(route.cx, route.cz, route.half, dist);
  // Walk bob: gentle, zero while paused.
  const bob = paused ? 0 : Math.abs(Math.sin((t + route.phase) * 5.2)) * 0.12;
  let { x, z } = p;
  // Sidestep the player.
  if (player) {
    const dx = x - player.x, dz = z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5 && d > 1e-6) {
      const push = (2.5 - d) * 0.9;
      x += (dx / d) * push;
      z += (dz / d) * push;
    } else if (d <= 1e-6) {
      x += 1.2; // exactly on top of the player: step +x
    }
  }
  return {
    x, z, heading: p.heading, bob,
    kind: route.kind, paused, speed: paused ? 0 : kind.speed,
    color: route.color,
  };
}
