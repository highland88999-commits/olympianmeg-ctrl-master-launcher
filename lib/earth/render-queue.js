// lib/earth/render-queue.js — the Earth 1 street render queue
// (Merlin, 2026-10-27, second phone video: walking kept its
// photographic mosaic, but driving fell into a dark void — and
// once voided, the ground NEVER came back, not even on foot
// afterward. A fallback layer is not enough; the ground needs
// a queue that keeps reconciling, so a void can never become
// permanent).
//
// Merlin's spec, in his words, refined across his messages:
//   1. Land passed over creates a QUEUE for land rendering:
//      every traversed position enqueues the tiles around it.
//   2. In a car, DOUBLE the radius (1350 m → 2700 m).
//   3. Build order: start AHEAD of the user (direction of
//      travel) and work back to connect with what's behind.
//   4. If a tile is already rendered, SKIP it — dedup against
//      the RENDER-side painted set (lib/earth/lens-cache.js),
//      never the mapping registry, never team logic, never
//      mapping math. This module touches rendering only.
//   5. NO governor — Merlin explicitly corrected that word out.
//      The queue drains steadily through the existing serial
//      build pool; nothing throttles or gates it under a
//      governor's name or idea.
//   6. Recovery: the queue keeps reconciling — periodically
//      re-check what is actually mounted under the traveler
//      and re-enqueue anything missing, so a void heals even
//      when the painted record claims the ground is there
//      (the record says painted, the screen says otherwise,
//      and the screen wins).
//
// Pure functions, headless-testable: no DOM, no THREE. The
// component (NexusEarth) owns the build pool, the canvas, and
// the timers; this module owns the ORDER, the radius, the
// dedup, and the coverage question.
import { EARTH_RADIUS } from '../geo.js';
import { LENS_PRESETS, lensTilePlan } from './lens.js';
import { tileCellKey, loadRenderedTileKeys } from './lens-cache.js';

/** How often the component re-checks mounted coverage while
 *  roaming (the recovery beat). 10 s: fast enough that a void
 *  heals inside Merlin's ~1-minute lag tolerance, slow enough
 *  that the check itself costs nothing. */
export const RENDER_QUEUE_RECONCILE_MS = 10000;
/** Hard cap on queued sheet centres. The natural bound is
 *  tighter (distinct centres must sit >0.5 radius apart, so a
 *  4-radius corridor holds ~8); this is the backstop, and it
 *  drops the centres FARTHEST from the traveler first. */
export const TRAIL_QUEUE_MAX = 12;

/** The coarse preset for the driving state: on foot the 1350 m
 *  sheet; in a car the doubled 2700 m sheet at the same
 *  64-tile build cost (see LENS_PRESETS.streetCoarseWide). */
export function coarsePresetFor(driving) {
  return driving ? 'streetCoarseWide' : 'streetCoarse';
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function normLon(lon) {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}

/** Great-circle distance between two lat/lon points, in globe
 *  hub units (the same units LENS_PRESETS radii use). */
export function centreDistanceHub(a, b) {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const cosC = Math.min(1, Math.max(-1,
    Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon)));
  return Math.acos(cosC) * EARTH_RADIUS;
}

/** Step a lat/lon along a compass heading (0 = north, 90 =
 *  east — the roamState.yawDeg convention) by a distance in hub
 *  units. Destination-point formula; the inverse of the
 *  headingVector walk roam.js does in vectors. */
export function stepAlongHeading(lat, lon, headingDeg, distanceHub) {
  const ang = distanceHub / EARTH_RADIUS;
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brng = toRad(headingDeg);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang)
    + Math.cos(lat1) * Math.sin(ang) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
    Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: normLon((lon2 * 180) / Math.PI) };
}

/** Bearing from point a to point b, compass degrees (0 =
 *  north, 90 = east). Used to rank queued centres by how far
 *  ahead of the traveler they sit. */
export function bearingBetween(a, b) {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return normLon((Math.atan2(y, x) * 180) / Math.PI);
}

/** The trail plan for one recenter: AHEAD first, then the
 *  traveler's own position, then BEHIND — so the newest sheet
 *  paints where the traveler is going, and the queue works
 *  back until it joins onto already-rendered ground behind.
 *  Centres sit one radius apart along the heading, so the three
 *  discs form one continuous corridor. The radius doubles in
 *  a car (streetCoarseWide). */
export function planTrailCentres({ lat, lon, headingDeg, driving }) {
  const presetName = coarsePresetFor(driving);
  const radius = LENS_PRESETS[presetName].radiusUnits;
  const ahead = stepAlongHeading(lat, lon, headingDeg, radius);
  const behind = stepAlongHeading(lat, lon, headingDeg + 180, radius);
  return [
    { lat: ahead.lat, lon: ahead.lon, presetName },
    { lat, lon, presetName },
    { lat: behind.lat, lon: behind.lon, presetName },
  ];
}

/** A candidate centre is already rendered when EITHER:
//   - its sheet cell sits in the render-side painted set
//     (lens-cache: the device record of finished sheets), or
//   - an in-session sheet / queued centre sits within half the
//     candidate's radius of it — their discs overlap so heavily
//     a new sheet would add almost nothing.
//  The half-radius session rule is what keeps the queue from
//  rebuilding the same corridor every recenter tick (ticks fire
//  every 0.4 radius of travel, so consecutive plans overlap).
//  `renderedKeys` defaults to the live device record; pass an
//  explicit list in tests. `sessionCentres` are { lat, lon } of
//  mounted sheets, the running build, and queued centres. */
export function isCentreRendered(centre, { renderedKeys = null, sessionCentres = [] } = {}) {
  const preset = LENS_PRESETS[centre.presetName];
  if (!preset) return false;
  const plan = lensTilePlan(centre.lat, centre.lon, preset.zoom, preset.grid, preset.canvasPx);
  const key = tileCellKey(centre.presetName, plan);
  const keys = renderedKeys ?? loadRenderedTileKeys();
  if (key && keys.includes(key)) return true;
  const half = preset.radiusUnits * 0.5;
  for (const s of sessionCentres) {
    if (centreDistanceHub(centre, s) <= half) return true;
  }
  return false;
}

/** Drop the already-rendered centres from a trail plan,
 *  preserving order (ahead first). */
export function filterUnrenderedCentres(centres, opts = {}) {
  return centres.filter((c) => !isCentreRendered(c, opts));
}

/** Rank queued centres most-ahead first: each centre's
 *  along-heading offset (distance × cos of the angle between
 *  the bearing to it and the heading), descending. A centre
 *  dead ahead outranks one abeam, which outranks one behind —
//  so the pool always builds the furthest-forward unbuilt
//  ground next, and works back from there. Returns a NEW array;
//  the input order is untouched. When the traveler stops, no
//  new ahead centres arrive, so the queue drains through the
//  current and behind centres on its own. */
export function sortByAheadness(centres, lat, lon, headingDeg) {
  const from = { lat, lon };
  const scored = centres.map((c) => {
    const dist = centreDistanceHub(from, c);
    const brg = bearingBetween(from, c);
    let diff = brg - headingDeg;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return { c, along: dist * Math.cos(toRad(diff)) };
  });
  scored.sort((a, b) => b.along - a.along);
  return scored.map((s) => s.c);
}

/** Drop queued centres the traveler has left far behind: a
 *  centre more than two radii from the current position can
 *  only paint ground the traveler will never rejoin this run.
//  The behind centre of the live trail sits one radius back,
//  so it always survives; anything older falls away. */
export function pruneStaleQueue(queue, lat, lon, radiusUnits) {
  const from = { lat, lon };
  return queue.filter((c) => centreDistanceHub(c, from) <= radiusUnits * 2);
}

/** Cap a queue to TRAIL_QUEUE_MAX, dropping the centres
 *  FARTHEST from the traveler first and preserving the drain
 *  order of the survivors. */
export function capTrailQueue(queue, lat, lon, max = TRAIL_QUEUE_MAX) {
  if (queue.length <= max) return queue;
  const from = { lat, lon };
  const ranked = queue.map((c, i) => ({ i, d: centreDistanceHub(c, from) }));
  ranked.sort((a, b) => a.d - b.d);
  const keep = new Set(ranked.slice(0, max).map((r) => r.i));
  return queue.filter((_, i) => keep.has(i));
}

/** The void question, answered from what is ACTUALLY mounted:
//  true when NO mounted sheet's disc contains the position.
//  `sheets` are { lat, lon, radiusUnits } across all three
//  pools (near, far, coarse). The check uses full disc radii —
//  the feather fades only the rim — so it slightly overestimates
//  coverage; that is the safe direction for a backstop, because
//  the recovery job it gates is cheap (one 64-tile build) and
//  the primary path (the trail queue) already covers the rim. */
export function lacksMountedCoverage(lat, lon, sheets) {
  const at = { lat, lon };
  for (const s of sheets) {
    if (centreDistanceHub(at, s) <= s.radiusUnits) return false;
  }
  return true;
}
