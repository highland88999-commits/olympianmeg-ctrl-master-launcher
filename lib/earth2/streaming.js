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
  parcelCenterWorld,
} from './world.js';
import { COMPY_SWARM } from './creatures.js';
import { HAMMOND_NPC } from './museum.js';
import { AIRPORT_CENTER } from './airport.js';
import { parcelById } from './parcels.js';
import { worldBridges } from './bridges.js';
import { scatterFeatureUnits, scatterParcelIds, dressingForParcel } from './scatter.js';
import { vehicleInstances } from './fleet.js';
import { populationExtras } from './operators.js';

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
  museum:   { load: 560, release: 800 },
  airport:  { load: 560, release: 800 },
  vehicle:  { load: 430, release: 660 },
  build:    { load: 340, release: 580 },
  bridge:   { load: 560, release: 800 },
  scatter:  { load: 150, release: 320 },
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
  // The operator second-anchor copies (lib/earth2/operators.js
  // populationExtras) ride the same per-species unit: they are
  // full spawn records, so they stream and place exactly like
  // the originals, with their own anchors (stand point + walk
  // circuit). Sanctuary: the pure plan cannot see the live
  // owners map, so an extra whose mirrored anchor lands on a
  // titled parcel is skipped at placement in the scene
  // (placeLandSpecies) — the originals carry no placement-time
  // check (their law is movement-only), the extras do.
  {
    const landRecs = worldCreatures();
    const bySlug = new Map();
    for (const rec of landRecs.concat(populationExtras(landRecs))) {
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

  // The museum: the Royal Tyrrell Museum building on its site
  // parcel (E2-0510) + John Hammond at his stand point — one unit
  // anchored at the stand (lib/earth2/museum.js), with landform-
  // class radii. The site sits ~600 m from the landing meadow, so
  // the museum is never part of the spawn neighbourhood; it
  // streams in as the walker crosses Earth 2's Drumheller country.
  {
    const stand = HAMMOND_NPC.stand;
    units.push({
      key: 'museum', kind: 'museum',
      slugs: ['museum', 'hammond'],
      anchors: [{ x: stand.x, z: stand.z, r: 0 }],
    });
  }

  // Tyrrell Field: the airfield terminal on its designated Free
  // Commons grounds (lib/earth2/airport.js) — one unit anchored
  // at the field's centre, with landform-class radii on the
  // museum's terms. The grounds sit ~600 m from the landing
  // meadow, so the field is never part of the spawn
  // neighbourhood; it streams in as the walker crosses the
  // museum corridor. The fleet does NOT ride this unit — a
  // machine's anchor is wherever it was left (vehicleStreamUnits
  // below, computed fresh like builds).
  units.push({
    key: 'airport', kind: 'airport',
    slugs: ['airport'],
    anchors: [{ x: AIRPORT_CENTER.x, z: AIRPORT_CENTER.z, r: 0 }],
  });

  // The crossings (Terrain Wave B): one unit per stone-arch
  // bridge (lib/earth2/bridges.js), anchored at the span's
  // centre discounted by its half-length, with landform-class
  // radii — a bridge is a landmark you read from far off, and
  // its deck must be resident long before a walker steps on it
  // (the deck LAW is pure data and never waits on the mesh).
  // `slugs` stays empty: a bridge is dressed stone, not a
  // foundry model, so it never touches the boot pill.
  for (const bridge of worldBridges()) {
    units.push({
      key: `bridge:${bridge.id}`, kind: 'bridge', slugs: [], bridge,
      anchors: [{ x: bridge.centerX, z: bridge.centerZ, r: bridge.lengthM / 2 }],
    });
  }

  // Commons dressing (Terrain Wave B): one unit per Commons
  // parcel carrying procedural features (rocks / craters) or
  // foliage (lib/earth2/scatter.js), anchored at the parcel
  // centre with SHORT radii — dressing is neighbourhood detail,
  // and the short load radius is what bounds the spawn-resident
  // cost. `slugs` stays empty (the foliage rides the manifest's
  // already-counted plant models; the foundry status belongs to
  // the plant units). The unit carries its parcel so the scene
  // can skip a parcel for as long as a player's build stands
  // there.
  {
    // One unit per dressed parcel — featured parcels (rocks /
    // craters) and foliage-only parcels alike; their trees
    // stream with the parcel, not with the species.
    const featured = new Set();
    for (const f of scatterFeatureUnits()) {
      featured.add(f.parcelId);
      const parcel = parcelById(f.parcelId);
      if (!parcel) continue;
      units.push({
        key: `scatter:${f.parcelId}`, kind: 'scatter', slugs: [],
        parcel, dressing: dressingForParcel(parcel),
        anchors: [{ x: f.cx, z: f.cz, r: f.r }],
      });
    }
    for (const id of scatterParcelIds()) {
      if (featured.has(id)) continue;
      const parcel = parcelById(id);
      if (!parcel) continue;
      const c = parcelCenterWorld(parcel);
      units.push({
        key: `scatter:${id}`, kind: 'scatter', slugs: [],
        parcel, dressing: dressingForParcel(parcel),
        anchors: [{ x: c.x, z: c.z, r: 20 }],
      });
    }
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

/**
 * Stream units for player BUILDS (Building Phase 2): one unit per
 * build that has pieces, anchored at its parcel's centre. Builds
 * are dynamic (they change as players build), so unlike
 * worldStreamUnits this is computed fresh from the caller's build
 * list every time — the scene merges these units with the static
 * plan and runs the same planStreamActions over the union.
 * A build unit carries the build object itself as `build`; the
 * scene renders it with the procedural piece renderer.
 */
export function buildStreamUnits(builds) {
  const units = [];
  for (const build of Array.isArray(builds) ? builds : []) {
    if (!build || build.groundType !== 'earth2-parcel') continue;
    if (!Array.isArray(build.pieces) || build.pieces.length === 0) continue;
    const parcel = parcelById(build.groundId);
    if (!parcel) continue;
    const c = parcelCenterWorld(parcel);
    units.push({
      key: `build:${build.groundId}`,
      kind: 'build',
      slugs: [],
      build,
      anchors: [{ x: c.x, z: c.z, r: 0 }],
    });
  }
  return units;
}

/**
 * Stream units for the FLEET (Vehicles Phase 1): one unit per
 * vehicle, anchored at the vehicle's LIVE position from its
 * device-local state map (lib/earth2/vehicles.js). Like builds,
 * vehicles move, so this is computed fresh from the caller's
 * state map every evaluation — the scene merges these units
 * with the static plan and runs the same planStreamActions
 * over the union. A vehicle unit carries its state as `state`;
 * the scene seats the model from it. A vehicle being driven
 * anchors on the walker itself, so it can never stream out
 * from under its driver; parked, it releases beyond its radius
 * like everything else.
 */
export function vehicleStreamUnits(states) {
  const units = [];
  if (!states || typeof states !== 'object') return units;
  // Registry order decides who carries a model's foundry
  // status: the FIRST instance of each model claims its slug —
  // the Tyrrell Field machine for the four field models (they
  // head the registry), the great-sea boat for the River Runner
  // — and every later instance of that model claims nothing, so
  // the cast is still covered exactly once.
  const rank = new Map(vehicleInstances().map((inst, i) => [inst.id, i]));
  const ids = Object.keys(states).sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
  const claimed = new Set();
  for (const id of ids) {
    const s = states[id];
    if (!s || typeof s.x !== 'number' || typeof s.z !== 'number') continue;
    const slug = typeof s.slug === 'string' ? s.slug : id;
    const claims = !claimed.has(slug);
    if (claims) claimed.add(slug);
    units.push({
      key: `vehicle:${id}`,
      kind: 'vehicle',
      slug,
      slugs: claims ? [slug] : [],
      instanceId: id,
      state: s,
      anchors: [{ x: s.x, z: s.z, r: 0 }],
    });
  }
  return units;
}
