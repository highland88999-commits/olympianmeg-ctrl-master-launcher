// lib/earth2/streaming.js
// EARTH 2 — PROXIMITY STREAMING for the walkable planet
// (hardening pass, 2026-10-22). Merlin's first long walk on his
// phone ended at ~36 seconds when Safari killed the tab ("This
// webpage was reloaded because a problem occurred" — the WebKit
// per-tab memory ceiling): the world used to decode and hold ALL
// 56 foundry models at entry, and each GLB decodes to far more
// GPU memory than its file size (plants and landforms alone are
// ~3 MB apiece on disk). The planet's population is now streamed:
//
//   - a species' model loads only when the walker comes within
//     its LOAD radius of the species' habitat anchors;
//   - it is released (removed from the scene, GPU resources
//     disposed) only beyond its RELEASE radius — release > load
//     for every kind, so border-walking can never thrash a load;
//   - at spawn only the landing neighbourhood streams in, so
//     stepping onto the planet is quick and the resident set
//     stays bounded wherever the walker roams.
//
// This module is the pure half of that contract: it derives the
// stream plan (units, habitat anchors, radii) from the SAME
// placement data lib/earth2/world.js generates — it changes no
// geography, no biome, no habitat. The scene glue (loading,
// instantiation, disposal) lives in components/earth2/
// Earth2World.jsx and consumes the plan through these functions.
// Pure arithmetic only — no three.js, no DOM, no Math.random —
// so the whole contract is unit-testable.

import {
  worldCreatures,
  worldSwimmers,
  worldFlyers,
  worldPlants,
  worldLandforms,
  worldMosquitoCenters,
  compySwarmCenter,
  draculaCourt,
} from './world.js';
import { COMPY_SWARM } from './creatures.js';

// Load / release radii (metres of EFFECTIVE distance — see
// streamDistance). The gap between a kind's two radii is the
// hysteresis band: a resident unit inside it stays resident, a
// non-resident stays unloaded, so pacing a border loads nothing.
// Load radii sit inside the scene's visibility caps (land 520,
// plants 260 drawn / swimmers 750 / flyers 1000) wherever the
// cast's geography allows, trading a soft fog-masked pop-in
// window on fast approaches for a hard memory bound — the tab
// surviving the walk is the priority Merlin's recording set.
export const STREAM_RADII = {
  land:     { load: 430, release: 660 },
  flyer:    { load: 430, release: 700 },
  swimmer:  { load: 360, release: 620 },
  plant:    { load: 300, release: 520 },
  landform: { load: 560, release: 800 },
  swarm:    { load: 430, release: 640 },
  mosquito: { load: 430, release: 640 },
  court:    { load: 560, release: 800 },
};

let _units = null;

/**
 * The stream plan: one unit per placeable thing in the world.
 * A unit is { key, kind, slugs, anchors, ...payload } where
 * `slugs` are the foundry status slugs it satisfies, `anchors`
 * are the habitat points ({ x, z, r }) its distance is measured
 * from (r = the roam radius around that point, e.g. a walk
 * circuit or a flyer's circle), and the payload (recs / rec /
 * instances / castleRec) is exactly the world.js placement data
 * the scene's placement functions consume.
 */
export function worldStreamUnits() {
  if (_units) return _units;
  const units = [];

  // Land creatures, grouped by species (herd copies + apexes).
  {
    const bySlug = new Map();
    for (const rec of worldCreatures()) {
      if (!bySlug.has(rec.slug)) bySlug.set(rec.slug, []);
      bySlug.get(rec.slug).push(rec);
    }
    for (const [slug, recs] of bySlug) {
      const anchors = recs.map((r) => ({ x: r.x, z: r.z, r: 0 }));
      for (const r of recs) {
        if (r.walk) anchors.push({ x: r.walk.cx, z: r.walk.cz, r: r.walk.r });
      }
      units.push({ key: `land:${slug}`, kind: 'land', slug, slugs: [slug], recs, anchors });
    }
  }

  // Flyers: the anchor is the circuit centre, discounted by the
  // circuit radius — the bird can be anywhere on its circle.
  for (const rec of worldFlyers()) {
    units.push({
      key: `flyer:${rec.slug}`, kind: 'flyer', slug: rec.slug, slugs: [rec.slug], rec,
      anchors: [{ x: rec.cx, z: rec.cz, r: rec.r }],
    });
  }

  // Swimmers: the anchor is the circuit centre, discounted by
  // the circuit's long axis.
  for (const rec of worldSwimmers()) {
    units.push({
      key: `swimmer:${rec.slug}`, kind: 'swimmer', slug: rec.slug, slugs: [rec.slug], rec,
      anchors: [{ x: rec.cx, z: rec.cz, r: Math.max(rec.rx, rec.rz) }],
    });
  }

  // Plants, grouped by species; every rooted instance is an
  // anchor (a species streams in when ANY of its instances is
  // near, and out only when ALL are far).
  {
    const bySlug = new Map();
    for (const rec of worldPlants()) {
      if (!bySlug.has(rec.slug)) bySlug.set(rec.slug, []);
      bySlug.get(rec.slug).push(rec);
    }
    for (const [slug, instances] of bySlug) {
      units.push({
        key: `plant:${slug}`, kind: 'plant', slug, slugs: [slug], instances,
        anchors: instances.map((r) => ({ x: r.x, z: r.z, r: 0 })),
      });
    }
  }

  // Landforms stand alone — except the castle, which belongs to
  // the court unit below (it must arrive with its Count).
  let castleRec = null;
  for (const rec of worldLandforms()) {
    if (rec.slug === 'castle-transylvania') { castleRec = rec; continue; }
    units.push({
      key: `landform:${rec.slug}`, kind: 'landform', slug: rec.slug, slugs: [rec.slug], rec,
      anchors: [{ x: rec.x, z: rec.z, r: 0 }],
    });
  }

  // The compy swarm scurries one meadow.
  {
    const c = compySwarmCenter();
    units.push({
      key: 'swarm:compy', kind: 'swarm', slugs: ['compy-swarm'],
      anchors: [{ x: c.x, z: c.z, r: COMPY_SWARM.radius }],
    });
  }

  // The mosquitos cruise the great herds; the unit's anchors are
  // their cruise centres.
  units.push({
    key: 'mosquito', kind: 'mosquito', slugs: ['giant-mosquito'],
    anchors: worldMosquitoCenters().map((c) => ({ x: c.cx, z: c.cz, r: 0 })),
  });

  // The court: castle + Dracula + his bats, one unit at the
  // south-pole parcel — nothing of Transylvania exists in the
  // world until the walker travels south for it.
  {
    const court = draculaCourt();
    units.push({
      key: 'court', kind: 'court',
      slugs: ['castle-transylvania', 'dracula', 'vampire-bat'],
      castleRec,
      anchors: [{ x: court.castle.x, z: court.castle.z, r: 0 }],
    });
  }

  _units = units;
  return units;
}

/**
 * Effective distance from a point to a unit: the nearest anchor,
 * discounted by the anchor's roam radius (a walker 400 m from a
 * herd's walk centre whose circuit radius is 50 m is 350 m from
 * the nearest animal).
 */
export function streamDistance(unit, x, z) {
  let best = Infinity;
  for (const a of unit.anchors) {
    const d = Math.hypot(x - a.x, z - a.z) - (a.r || 0);
    if (d < best) best = d;
  }
  return Math.max(0, best);
}

/** The units whose load radius covers a point — the entry set
 *  when the point is the spawn, nearest first (load priority). */
export function streamEntryUnits(x, z) {
  return worldStreamUnits()
    .map((u) => ({ u, d: streamDistance(u, x, z) }))
    .filter(({ u, d }) => d <= STREAM_RADII[u.kind].load)
    .sort((a, b) => a.d - b.d || (a.u.key < b.u.key ? -1 : 1))
    .map(({ u }) => u);
}

/**
 * The streaming decision for one evaluation, with hysteresis:
 * a unit loads when it is inactive and within its load radius;
 * it releases when it is active and beyond its release radius;
 * between the radii nothing changes. `activeKeys` is the set of
 * unit keys currently resident OR loading (or failed — a failed
 * unit stays "active" until it leaves the release radius, so a
 * broken model can't be re-fetched every evaluation).
 * Returns { load: [units nearest-first], release: [units] }.
 */
export function planStreamActions(units, activeKeys, x, z) {
  const load = [];
  const release = [];
  for (const u of units) {
    const d = streamDistance(u, x, z);
    const radii = STREAM_RADII[u.kind];
    if (activeKeys.has(u.key)) {
      if (d > radii.release) release.push(u);
    } else if (d <= radii.load) {
      load.push({ u, d });
    }
  }
  load.sort((a, b) => a.d - b.d || (a.u.key < b.u.key ? -1 : 1));
  return { load: load.map(({ u }) => u), release };
}
