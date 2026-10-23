// tests/earth2-world.test.mjs
// EARTH 2 — THE WALKABLE PLANET (Merlin, 2026-10-22): the parcel
// map IS the geography. Pins for lib/earth2/world.js + the chamber
// wiring of components/earth2/Earth2World.jsx:
//
// - world-gen determinism (same pure functions → same planet)
// - parcel-at-position round-trip against parcels.js, incl.
//   E2-2476 = Castle Transylvania at the south
// - climate bands (frozen poles / warm equator in the derivation)
// - the heightfield laws (water below the waterline, the castle
//   terrace dry, borders blended — no cell cliffs)
// - the spawn rule (home base when set, else the landing meadow)
// - population habitat placement (swimmers only in water, herds
//   only on dry land, the castle cast at the castle parcel, the
//   two apexes holding separate territories)
// - the walker step (collision push-out, the wading law, the
//   world's edge)
// - the gate: the chamber page still 404s non-owners and the
//   world chunk is lazy behind it, exactly like the Bay
//
// Run: node --test tests/earth2-world.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PARCELS,
  parcelById,
  parcelAt,
  castleParcel,
  isCastleParcel,
} from '../lib/earth2/parcels.js';
import { EARTH2_MODEL_BY_SLUG, earth2PlacedModels } from '../lib/earth2/models.js';
import {
  WORLD_CELL_M,
  WORLD_SIZE_M,
  WORLD_HALF_M,
  WATER_Y,
  WALK_EYE_M,
  TRAVEL_SPEED_MPS,
  MAX_WADE_DEPTH_M,
  parcelCenterWorld,
  parcelWorldRect,
  parcelAtWorld,
  worldToLatLon,
  climateForLat,
  climateForParcel,
  familyForParcel,
  biomeForParcel,
  continentalAt,
  heightAt,
  groundColorAt,
  isWaterAt,
  waterDepthAt,
  waterBodies,
  largestWaterBody,
  landingParcel,
  resolveSpawnParcel,
  spawnPointFor,
  worldLandforms,
  worldCreatures,
  worldSwimmers,
  worldFlyers,
  worldPlants,
  worldMosquitoCenters,
  compySwarmCenter,
  draculaCourt,
  worldColliders,
  applyWorldLook,
  stepWorldWalker,
  parcelBorderPoints,
} from '../lib/earth2/world.js';
import {
  STREAM_RADII,
  worldStreamUnits,
  streamEntryUnits,
  streamDistance,
  planStreamActions,
} from '../lib/earth2/streaming.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('the world grid — one geography (parcels.js)', () => {
  it('the planet is 1.2–1.5 km across at 24–30 m per parcel', () => {
    assert.equal(WORLD_SIZE_M, 1400);
    assert.equal(WORLD_CELL_M, 28);
    assert.ok(WORLD_SIZE_M >= 1200 && WORLD_SIZE_M <= 1500);
    assert.equal(WORLD_HALF_M * 2, WORLD_SIZE_M);
  });

  it('every parcel centre round-trips: parcel → world → same parcel', () => {
    for (const p of PARCELS) {
      const c = parcelCenterWorld(p);
      assert.equal(parcelAtWorld(c.x, c.z).id, p.id, p.id);
    }
  });

  it('world positions agree with parcels.js parcelAt at the centres', () => {
    for (const p of PARCELS) {
      assert.equal(parcelAt(p.centerLat, p.centerLon).id, p.id, p.id);
      const ll = worldToLatLon(...Object.values(parcelCenterWorld(p)));
      assert.ok(Math.abs(ll.lat - p.centerLat) < 1.8, `${p.id} lat`);
      assert.ok(Math.abs(ll.lon - p.centerLon) < 3.6, `${p.id} lon`);
    }
  });

  it('the south is +z: the last row sits at the bottom of the world', () => {
    const north = parcelCenterWorld(PARCELS[0]);
    const south = parcelCenterWorld(PARCELS[PARCELS.length - 1]);
    assert.ok(north.z < 0 && south.z > 0);
    assert.equal(parcelWorldRect(PARCELS[0]).minZ, -WORLD_HALF_M);
    assert.equal(parcelWorldRect(PARCELS[PARCELS.length - 1]).maxZ, WORLD_HALF_M);
  });

  it('E2-2476 — Castle Transylvania — stands at the south of the world', () => {
    const castle = castleParcel();
    assert.equal(castle.id, 'E2-2476');
    const c = parcelCenterWorld(castle);
    assert.ok(c.z > WORLD_HALF_M - WORLD_CELL_M, 'southernmost row');
    assert.equal(parcelAtWorld(c.x, c.z).id, 'E2-2476');
    assert.equal(parcelAtWorld(c.x, WORLD_HALF_M - 1).id, 'E2-2476');
    assert.ok(isCastleParcel(parcelAtWorld(c.x, c.z)));
  });
});

describe('climate & biome derivation', () => {
  it('latitude bands: frozen poles, temperate mids, warm equator', () => {
    assert.equal(climateForLat(88), 'polar');
    assert.equal(climateForLat(-88), 'polar');
    assert.equal(climateForLat(60), 'subpolar');
    assert.equal(climateForLat(45), 'temperate');
    assert.equal(climateForLat(30), 'subtropical');
    assert.equal(climateForLat(0), 'tropical');
    // The castle's row is polar; the equator rows are tropical.
    assert.equal(climateForParcel(castleParcel()), 'polar');
    assert.equal(climateForParcel(PARCELS[25 * 50 + 25]), 'tropical');
  });

  it('name families drive the biome (Fields grassland, Basin bowl, Shore coast…)', () => {
    const byName = (frag) => PARCELS.find((p) => p.name.endsWith(frag) && p.tier !== 'landmark');
    assert.equal(familyForParcel(byName('Fields')), 'Fields');
    assert.equal(familyForParcel(byName('Highlands')), 'Highlands');
    assert.equal(familyForParcel(byName('Basin')), 'Basin');
    assert.equal(familyForParcel(byName('Shore')), 'Shore');
    assert.equal(familyForParcel(parcelById('E2-2476')), 'Shore', 'the castle stands on a frozen shore');
    // Elevation targets follow the family: highlands high, basins low.
    const high = biomeForParcel(byName('Highlands'));
    const basin = biomeForParcel(byName('Basin'));
    assert.ok(high.elevationTarget > basin.elevationTarget + 8,
      `highlands ${high.elevationTarget} vs basin ${basin.elevationTarget}`);
    // Ground colour is a real RGB triple everywhere.
    for (const p of [byName('Fields'), byName('Meadows'), castleParcel()]) {
      const col = groundColorAt(...Object.values(parcelCenterWorld(p)));
      assert.equal(col.length, 3);
      for (const v of col) assert.ok(v >= 0 && v <= 1);
    }
  });

  it('polar ground reads as snow; the castle court stays pale shore', () => {
    const polar = PARCELS.find((p) => climateForParcel(p) === 'polar' && familyForParcel(p) === 'Fields');
    const col = biomeForParcel(polar).color;
    assert.ok(col[2] > 0.8 && col[0] > 0.75, `polar tint ${col}`);
    const castleCol = biomeForParcel(castleParcel()).color;
    // Pale icy shore, warmed a touch by the landmark-gold shift.
    assert.ok(Math.min(...castleCol) > 0.7, `castle tint stays pale ${castleCol}`);
  });
});

describe('the heightfield — deterministic, blended, lawful', () => {
  it('same inputs → same planet (no Math.random in world gen)', () => {
    const probes = [[0, 0], [123, -456], [-699, 699], [340.5, 12.25]];
    for (const [x, z] of probes) {
      assert.equal(heightAt(x, z), heightAt(x, z));
      assert.deepEqual(groundColorAt(x, z), groundColorAt(x, z));
    }
    assert.equal(continentalAt(10, 10), continentalAt(10, 10));
    assert.deepEqual(worldCreatures(), worldCreatures());
    assert.deepEqual(worldSwimmers(), worldSwimmers());
    const src = read('lib/earth2/world.js');
    assert.ok(!/Math\.random\s*\(/.test(src), 'world gen never rolls dice');
  });

  it('borders blend — the steepest step across a parcel edge is a bank, not a cliff', () => {
    // Walk a line across the whole world at 0.5 m steps; no single
    // step may jump more than 1.2 m (a true cliff would be metres
    // in one step).
    let worst = 0;
    for (const z of [-400, -100, 137, 500]) {
      let prev = heightAt(-WORLD_HALF_M, z);
      for (let x = -WORLD_HALF_M + 0.5; x <= WORLD_HALF_M; x += 0.5) {
        const h = heightAt(x, z);
        worst = Math.max(worst, Math.abs(h - prev));
        prev = h;
      }
    }
    assert.ok(worst < 1.2, `steepest half-metre step ${worst}`);
  });

  it('water is exactly the land below the waterline, and there is a real sea', () => {
    const bodies = waterBodies();
    assert.ok(bodies.length >= 3, 'several water bodies');
    const sea = largestWaterBody();
    assert.ok(sea.size >= 20, `the great sea spans ${sea.size} parcels`);
    assert.ok(sea.depthM >= 2.5, `the sea runs ${sea.depthM} deep`);
    assert.ok(isWaterAt(sea.deepestX, sea.deepestZ));
    assert.ok(waterDepthAt(sea.deepestX, sea.deepestZ) > 2);
    for (const p of sea.parcels) {
      const c = parcelCenterWorld(p);
      assert.ok(heightAt(c.x, c.z) < WATER_Y, `${p.id} is in the sea but stands dry`);
    }
  });

  it("the castle terrace is level and dry at the pole", () => {
    const court = draculaCourt();
    const c = parcelCenterWorld(castleParcel());
    assert.equal(court.castle.parcelIndex, castleParcel().index);
    assert.ok(Math.abs(heightAt(c.x, c.z) - 3.2) < 0.3, 'terrace height');
    assert.ok(heightAt(c.x, c.z) > WATER_Y + 1, 'the castle stands dry');
    assert.ok(court.spot.y > WATER_Y + 1, "Dracula's court stands dry");
    assert.ok(Math.hypot(court.spot.x - c.x, court.spot.z - c.z) > 26,
      'the Count stands before the walls, not inside them');
  });
});

describe('spawn — home base when set, else the landing meadow', () => {
  it('resolveSpawnParcel honours a set home base, falls back cleanly', () => {
    const someParcel = PARCELS[100];
    assert.equal(resolveSpawnParcel(someParcel.id).id, someParcel.id);
    assert.equal(resolveSpawnParcel('E2-2476').id, 'E2-2476');
    assert.equal(resolveSpawnParcel(null).id, landingParcel().id);
    assert.equal(resolveSpawnParcel('E2-9999').id, landingParcel().id);
    assert.equal(resolveSpawnParcel(undefined).id, landingParcel().id);
  });

  it('the landing meadow is dry grass near the heart of the map', () => {
    const landing = landingParcel();
    const c = parcelCenterWorld(landing);
    assert.ok(Math.abs(c.x) < 200 && Math.abs(c.z) < 200, 'near the heart');
    assert.ok(['Fields', 'Meadows', 'Grove'].includes(familyForParcel(landing)));
    assert.ok(heightAt(c.x, c.z) > 0.8, 'dry');
    assert.notEqual(climateForParcel(landing), 'polar');
  });

  it('spawn points always stand on dry ground', () => {
    for (const id of [null, 'E2-2476', 'E2-0001', 'E2-1225']) {
      const parcel = resolveSpawnParcel(id);
      const spawn = spawnPointFor(parcel);
      assert.ok(heightAt(spawn.x, spawn.z) > 0.4, `${id} spawn height`);
      assert.ok(Math.abs(spawn.x) <= WORLD_HALF_M && Math.abs(spawn.z) <= WORLD_HALF_M);
    }
  });
});

describe('the population — placed by habitat', () => {
  it('every placed foundry model has a home in the world plan', () => {
    const planned = new Set([
      ...worldLandforms().map((r) => r.slug),
      ...worldCreatures().map((r) => r.slug),
      ...worldSwimmers().map((r) => r.slug),
      ...worldFlyers().map((r) => r.slug),
      ...new Set(worldPlants().map((r) => r.slug)),
      'compy-swarm', 'giant-mosquito', 'dracula', 'vampire-bat',
      // The museum pair (Phase 2 mount, 2026-10-23): their home
      // is not a habitat scatter — it is the one designated site
      // in lib/earth2/museum.js (parcel E2-0510 + Hammond's stand
      // point), streamed as the 'museum' unit; placement there is
      // pinned by tests/earth2-museum-mount.test.mjs.
      'museum', 'hammond',
    ]);
    for (const m of earth2PlacedModels()) {
      assert.ok(planned.has(m.slug), `${m.slug} has no world placement`);
    }
  });

  it('swimmers live only in the largest water body, circuits in the water', () => {
    const sea = largestWaterBody();
    const swimmers = worldSwimmers();
    assert.equal(swimmers.length, 8, 'all eight sea creatures swim the world sea');
    for (const s of swimmers) {
      assert.ok(EARTH2_MODEL_BY_SLUG.get(s.slug).habitat === 'water', s.slug);
      assert.equal(s.bodySize, sea.size, `${s.slug} swims the largest body`);
      assert.ok(heightAt(s.cx, s.cz) < WATER_Y - 0.25, `${s.slug} centre is wet`);
      // The whole circuit stays off dry land.
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const h = heightAt(s.cx + Math.cos(a) * s.rx, s.cz + Math.sin(a) * s.rz);
        assert.ok(h < WATER_Y + 0.4, `${s.slug} circuit point ${k} on land (${h})`);
      }
      assert.ok(s.deep < s.shallow, `${s.slug} deep below shallow`);
      assert.ok(s.shallow < WATER_Y, `${s.slug} surfaces under the waterline cap`);
    }
  });

  it('land creatures stand on dry ground in their habitat families', () => {
    const grass = ['Fields', 'Meadows', 'Grove', 'Vale'];
    for (const c of worldCreatures()) {
      const h = heightAt(c.x, c.z);
      assert.ok(h > 0.1, `${c.slug}#${c.copy} stands dry (${h})`);
      const parcel = PARCELS[c.parcelIndex];
      const entry = EARTH2_MODEL_BY_SLUG.get(c.slug);
      // Herd and flock herbivores graze the grass families (the
      // solo ankylosaurus ranges the steppe by design).
      if (entry.diet === 'herbivore' && (entry.social === 'herd' || entry.social === 'flock')) {
        assert.ok(grass.includes(familyForParcel(parcel)),
          `${c.slug} grazes ${familyForParcel(parcel)}`);
      }
    }
  });

  it('the apexes hold separate territories', () => {
    const creatures = worldCreatures();
    const indo = creatures.find((c) => c.slug === 'indominus-rex');
    const rex = creatures.find((c) => c.slug === 'spinosaurus-rex');
    assert.ok(indo && rex, 'both apexes placed');
    assert.ok(indo.x < -250, 'the Indominus holds the west');
    assert.ok(rex.x > 250, 'the Rex holds the east');
    assert.ok(Math.hypot(indo.x - rex.x, indo.z - rex.z) > 700, 'territories apart');
    // The Rex stands at his tar pit's edge.
    const tarPit = worldLandforms().find((r) => r.slug === 'tar-pit');
    assert.ok(Math.hypot(rex.x - tarPit.x, rex.z - tarPit.z) < 90, 'the Rex at the tar pit');
  });

  it('the castle cast sits at the castle parcel — and nowhere else', () => {
    const castleRec = worldLandforms().find((r) => r.slug === 'castle-transylvania');
    const c = parcelCenterWorld(castleParcel());
    assert.equal(castleRec.parcelIndex, castleParcel().index);
    assert.equal(castleRec.x, c.x);
    assert.equal(castleRec.z, c.z);
    const court = draculaCourt();
    // The Count stands BEFORE his front face: one parcel north of
    // the castle's row (row 48), in the castle's own column.
    const spotParcel = parcelAtWorld(court.spot.x, court.spot.z);
    assert.equal(spotParcel.index, castleParcel().index - 50, "the court fronts the castle");
    assert.equal(spotParcel.row, 48);
    assert.equal(spotParcel.col, castleParcel().col);
  });

  it('landforms stand on ground that suits them', () => {
    for (const rec of worldLandforms()) {
      if (rec.slug === 'castle-transylvania') continue;
      const h = heightAt(rec.x, rec.z);
      assert.ok(h > 0.3, `${rec.slug} stands dry (${h})`);
    }
    const mountains = worldLandforms().find((r) => r.slug === 'mountain-range');
    assert.ok(heightAt(mountains.x, mountains.z) > 12, 'the range stands high');
    // Colliders exist for every structure Earth law makes solid.
    const colliders = worldColliders();
    for (const slug of ['castle-transylvania', 'mountain-range', 'active-volcano', 'dormant-volcano']) {
      assert.ok(colliders.some((c) => c.slug === slug), `${slug} collides`);
    }
  });

  it('flyers circle real anchors; skimmers circle the sea', () => {
    const sea = largestWaterBody();
    const flyers = worldFlyers();
    assert.equal(flyers.length, 9, 'all nine flyers ride the world sky');
    for (const f of flyers) {
      assert.ok(f.r >= 20 && f.h >= 4, f.slug);
      if (f.overWater) {
        assert.equal(f.cx, sea.deepestX, `${f.slug} over the sea`);
        assert.equal(f.cz, sea.deepestZ, `${f.slug} over the sea`);
      }
    }
  });

  it('plants root where their kind belongs (reeds at the waterline)', () => {
    const plants = worldPlants();
    assert.ok(plants.length >= 80, `${plants.length} plant instances dress the world`);
    for (const p of plants) {
      const h = heightAt(p.x, p.z);
      if (p.slug === 'horsetail-reeds') {
        assert.ok(h >= WATER_Y - 0.6 && h <= WATER_Y + 0.7, `reeds at the edge (${h})`);
      } else {
        assert.ok(h > WATER_Y + 0.3, `${p.slug} rooted dry (${h})`);
      }
    }
    assert.ok(worldMosquitoCenters().length >= 2, 'mosquitos cruise the herds');
    const cc = compySwarmCenter();
    assert.ok(heightAt(cc.x, cc.z) > 0.3, 'the compy meadow is dry');
  });
});

describe('the walker — Earth laws in the step', () => {
  it('look clamps pitch and turns with drag', () => {
    const l = applyWorldLook(0, 0, 100, -10000);
    assert.ok(l.yaw < 0, 'drag right turns right');
    assert.ok(l.pitch <= 1.35 && l.pitch > 1.3, 'pitch clamps at the sky');
    const l2 = applyWorldLook(0, 0, 0, 10000);
    assert.ok(l2.pitch >= -1.35 && l2.pitch < -1.3, 'pitch clamps at the ground');
  });

  it('a step moves at walk pace, faster at travel pace', () => {
    const start = { x: 0, z: 0 };
    const yaw = Math.PI; // face +z… forward = (−sin π, −cos π) = (0, 1)
    const walk = stepWorldWalker(start, yaw, { fwd: 1, strafe: 0 }, 1, [], false);
    assert.ok(Math.abs(Math.hypot(walk.x, walk.z) - 6) < 0.01, 'walk pace ≈ 6 m/s');
    const fast = stepWorldWalker(start, yaw, { fwd: 1, strafe: 0 }, 1, [], true);
    assert.ok(Math.abs(Math.hypot(fast.x, fast.z) - TRAVEL_SPEED_MPS) < 0.01, 'travel pace');
    assert.ok(WALK_EYE_M > 1.5 && WALK_EYE_M < 2, 'eye height is a standing adult');
  });

  it('structures push the walker out by radius', () => {
    const colliders = [{ x: 10, z: 0, r: 5 }];
    const next = stepWorldWalker({ x: 0, z: 0 }, -Math.PI / 2, { fwd: 1, strafe: 0 }, 1, colliders, true);
    // Ran straight at the circle at travel pace: must end outside it.
    assert.ok(Math.hypot(next.x - 10, next.z) >= 5.5, `pushed out (${next.x}, ${next.z})`);
  });

  it('the wading law: shallows yes, deep water no', () => {
    const sea = largestWaterBody();
    // The step must refuse to move INTO deeper water — from the
    // shore side, a walker wading in stops at chest depth — while
    // walking toward the shallows is always allowed.
    let pos = { x: sea.deepestX, z: sea.deepestZ };
    // The nearest dry parcel centre is the shore we walk for.
    // Forward is (−sin yaw, −cos yaw), so yaw = atan2(−dx, −dz).
    let shore = null;
    let shoreD = Infinity;
    for (const p of PARCELS) {
      const c = parcelCenterWorld(p);
      if (heightAt(c.x, c.z) < 0.5) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < shoreD) { shoreD = d; shore = c; }
    }
    assert.ok(shore && shoreD < 200, 'dry land within reach of the deep');
    let guard = 0;
    while (waterDepthAt(pos.x, pos.z) > 0.2 && guard++ < 300) {
      const yaw = Math.atan2(-(shore.x - pos.x), -(shore.z - pos.z));
      pos = stepWorldWalker(pos, yaw, { fwd: 1, strafe: 0 }, 0.25, [], false);
    }
    assert.ok(waterDepthAt(pos.x, pos.z) <= 0.21, `walked out of the sea (guard ${guard})`);
    // Now try to walk back into the deep: depth may never exceed
    // the wading limit by more than one step's grace.
    let maxSeen = 0;
    for (let i = 0; i < 40; i++) {
      const yaw = Math.atan2(-(sea.deepestX - pos.x), -(sea.deepestZ - pos.z));
      pos = stepWorldWalker(pos, yaw, { fwd: 1, strafe: 0 }, 0.25, [], false);
      maxSeen = Math.max(maxSeen, waterDepthAt(pos.x, pos.z));
    }
    assert.ok(maxSeen <= MAX_WADE_DEPTH_M + 0.6, `never swims (saw ${maxSeen})`);
  });

  it("the world's edge is a wall", () => {
    const next = stepWorldWalker({ x: WORLD_HALF_M - 5, z: 0 }, -Math.PI / 2, { fwd: 1, strafe: 0 }, 2, [], true);
    assert.ok(next.x <= WORLD_HALF_M - 4 + 0.001, `clamped at the edge (${next.x})`);
  });

  it('the highlight outline traces the parcel border', () => {
    const pts = parcelBorderPoints(castleParcel(), 4);
    assert.equal(pts.length, 16);
    const rect = parcelWorldRect(castleParcel());
    for (const [x, z] of pts) {
      assert.ok(x >= rect.minX - 0.01 && x <= rect.maxX + 0.01);
      assert.ok(z >= rect.minZ - 0.01 && z <= rect.maxZ + 0.01);
    }
  });
});

describe('the gate — the world lives behind the same lock as the Bay', () => {
  const page = read('app/earth-2/page.jsx');

  it('the chamber still 404s non-owners before anything renders', () => {
    assert.ok(page.includes('isOwnerEmail'), 'owner check');
    assert.ok(page.includes('getSession'), 'session read');
    assert.ok(page.includes('This page could not be found.'), 'plain 404 for non-owners');
  });

  it('the world entry is prominent in the chamber, near the top', () => {
    assert.ok(page.includes('WALK THE PLANET'), 'the entry names itself');
    assert.ok(page.indexOf('WALK THE PLANET') < page.indexOf('THE PARCEL MAP'),
      'the entry sits above the parcel map');
    assert.ok(page.indexOf('WALK THE PLANET') < page.indexOf('DINOSAUR BAY') || page.includes('DinosaurBay'),
      'the entry sits high in the access space');
  });

  it('the world chunk is lazy (next/dynamic, ssr off) and mounted only while walking', () => {
    assert.ok(page.includes("import('@/components/earth2/Earth2World')"), 'dynamic import');
    assert.ok(/Earth2World = dynamic\([\s\S]*?ssr: false/.test(page), 'ssr off — no server leak');
    assert.ok(page.includes('walking &&'), 'mounted only in the walking state');
    assert.ok(page.includes('spawnParcelId={homeBaseId}'), 'spawn follows the home base');
    assert.ok(page.includes('onParcelChange={setSelectedId}'), 'the map selection follows the walker');
  });

  it('the world is display-only on foot: no rent, no buying wired in', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(!world.includes('/api/earth2/buy'), 'no buy calls');
    assert.ok(!world.includes('/api/earth2/rent'), 'no rent calls');
    assert.ok(world.includes('Display only'), 'the HUD says so plainly');
  });

  it('the world loads models only through the signed-door resolver', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes('fetchEarth2ModelUrls'), 'signed URLs fetched once');
    assert.ok(world.includes('earth2ModelUrl'), 'every load resolved');
    assert.ok(!world.includes('/models/earth2'), 'no hard-coded public path');
    assert.ok(world.includes('stepWorldWalker'), 'walking runs on the pure step');
    assert.ok(world.includes('heightAt'), 'feet read the shared heightfield');
  });
});

describe('proximity streaming — the memory contract (Safari killed the all-at-entry world)', () => {
  it('the planet itself is bit-identical to the one Merlin walked (generation fingerprint)', () => {
    const samples = [];
    for (let x = -700; x <= 700; x += 37.3) {
      for (let z = -700; z <= 700; z += 41.7) {
        samples.push(heightAt(x, z).toFixed(5));
        samples.push(groundColorAt(x, z).map((v) => v.toFixed(4)).join(','));
      }
    }
    const hash = createHash('sha256').update(samples.join('|')).digest('hex');
    assert.equal(hash, '8e2fd6296c03c439e27a2635b11fcd87fb8dfdbfa00e522e96b51ec5ef80e27d',
      'heightfield + ground colours unchanged by the streaming pass');
    assert.equal(worldCreatures().length, 30, 'placement plan unchanged');
    assert.equal(worldLandforms().length, 9, 'placement plan unchanged');
    assert.equal(worldPlants().length, 109, 'placement plan unchanged');
    assert.equal(landingParcel().id, 'E2-1225', 'the landing meadow is the same parcel');
  });

  it('every kind keeps a hysteresis band: release radius strictly beyond load radius', () => {
    for (const [kind, r] of Object.entries(STREAM_RADII)) {
      assert.ok(r.load > 0, `${kind} loads at a real distance`);
      assert.ok(r.release > r.load, `${kind}: release ${r.release} > load ${r.load} — border-walking cannot thrash`);
    }
  });

  it('the stream plan covers the whole cast exactly once — and nothing else', () => {
    const units = worldStreamUnits();
    const covered = units.flatMap((u) => u.slugs);
    assert.equal(new Set(covered).size, covered.length, 'no slug is streamed by two units');
    for (const m of earth2PlacedModels()) {
      assert.ok(covered.includes(m.slug), `${m.slug} has a stream unit`);
    }
    assert.ok(covered.includes('compy-swarm'), 'the swarm streams with the cast');
    assert.equal(covered.length, earth2PlacedModels().length + 1, 'the cast + the swarm, no more');
  });

  it('at spawn only the landing neighbourhood streams in — a strict subset of the cast', () => {
    const spawn = spawnPointFor(resolveSpawnParcel(null));
    const entry = streamEntryUnits(spawn.x, spawn.z);
    const entrySlugs = new Set(entry.flatMap((u) => u.slugs));
    const allSlugs = new Set(worldStreamUnits().flatMap((u) => u.slugs));
    assert.ok(entry.length > 0, 'the neighbourhood is populated');
    assert.ok(entrySlugs.size < allSlugs.size, 'the entry set is a strict subset of the cast');
    // The welcome party Merlin's recording showed: herds on the
    // plains around the landing, the heartland flyers overhead.
    for (const slug of ['gallimimus', 'triceratops', 'compsognathus', 'compy-swarm', 'giant-mosquito', 'pteranodon', 'quetzalcoatlus']) {
      assert.ok(entrySlugs.has(slug), `${slug} greets the walker at spawn`);
    }
    // Everything far stays out of memory: the whole sea cast,
    // both apexes, the volcanoes and the mountain range, and the
    // entire Transylvania court at the south pole.
    for (const slug of ['mosasaurus', 'kronosaurus', 'elasmosaurus', 'ichthyosaurus', 'plesiosaurus', 'liopleurodon', 'tylosaurus', 'megalodon']) {
      assert.ok(!entrySlugs.has(slug), `${slug} waits in the sea, unloaded`);
    }
    for (const slug of ['tyrannosaurus-rex', 'spinosaurus-rex', 'active-volcano', 'mountain-range', 'castle-transylvania', 'dracula', 'vampire-bat']) {
      assert.ok(!entrySlugs.has(slug), `${slug} is not resident at spawn`);
    }
    // The museum + Hammond wait in Earth 2's Drumheller, ~600 m
    // north-west — never resident at spawn (Phase 2 mount pin).
    for (const slug of ['museum', 'hammond']) {
      assert.ok(!entrySlugs.has(slug), `${slug} is not resident at spawn`);
    }
    // Of the 58 foundry model files, the spawn step-on loads 31.
    const entryModels = [...entrySlugs].filter((s) => {
      const e = EARTH2_MODEL_BY_SLUG.get(s);
      return e && e.file;
    });
    assert.equal(entryModels.length, 31, `entry loads ${entryModels.length} of 58 model files`);
  });

  it('the plan honours hysteresis: inside the band nothing loads and nothing releases', () => {
    const units = worldStreamUnits();
    const court = units.find((u) => u.key === 'court');
    const [cx, cz] = [court.anchors[0].x, court.anchors[0].z];
    // 700 m north of the castle: beyond the court load radius
    // (560) but inside its release radius (800).
    const band = { x: cx, z: cz - 700 };
    assert.equal(streamDistance(court, band.x, band.z), 700);
    const idle = planStreamActions(units, new Set(), band.x, band.z);
    assert.ok(!idle.load.some((u) => u.key === 'court'), 'inactive in the band: no load');
    const held = planStreamActions(units, new Set(['court']), band.x, band.z);
    assert.ok(!held.release.some((u) => u.key === 'court'), 'resident in the band: no release');
    // 500 m out: inside load — an inactive court loads.
    const near = planStreamActions(units, new Set(), cx, cz - 500);
    assert.ok(near.load.some((u) => u.key === 'court'), 'inside load radius: the court streams in');
    // 900 m out: beyond release — a resident court is freed.
    const far = planStreamActions(units, new Set(['court']), cx, cz - 900);
    assert.ok(far.release.some((u) => u.key === 'court'), 'beyond release radius: the court is freed');
  });

  it('loads are ordered nearest-first, so the closest cast arrives first', () => {
    const spawn = spawnPointFor(resolveSpawnParcel(null));
    const { load } = planStreamActions(worldStreamUnits(), new Set(), spawn.x, spawn.z);
    assert.ok(load.length > 0);
    const dists = load.map((u) => streamDistance(u, spawn.x, spawn.z));
    for (let i = 1; i < dists.length; i++) {
      assert.ok(dists[i] >= dists[i - 1], 'non-decreasing distance order');
    }
    assert.equal(dists[0], 0, 'the pteranodon circles the landing itself');
  });

  it('the scene wires the streaming plan: loads through it, frees through disposal', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes("from '@/lib/earth2/streaming'"), 'the plan is imported');
    assert.ok(world.includes('worldStreamUnits'), 'units come from the plan');
    assert.ok(world.includes('planStreamActions'), 'per-frame decisions come from the plan');
    assert.ok(world.includes('disposeGraph'), 'releases dispose GPU resources');
    assert.ok(world.includes('256, 256'), 'the terrain mesh took the diet (256×256 segments)');
  });
});
