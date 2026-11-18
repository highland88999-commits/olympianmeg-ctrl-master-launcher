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
// - the walker step (collision push-out, the wading law, no wall
//   at the grid edge — the world is endless)
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
  PARCEL_ROWS,
  PARCEL_COLS,
  parcelById,
  parcelAt,
  castleParcel,
  isCastleParcel,
} from '../lib/earth2/parcels.js';
import { EARTH2_MODEL_BY_SLUG, earth2PlacedModels } from '../lib/earth2/models.js';
import { VEHICLES } from '../lib/earth/vehicles.js';
import {
  WORLD_CELL_M,
  WORLD_SIZE_M,
  WORLD_HALF_M,
  WATER_Y,
  WALK_EYE_M,
  TRAVEL_SPEED_MPS,
  MAX_WADE_DEPTH_M,
  WADE_FULL_SPEED_DEPTH_M,
  SWIM_FULL_DEPTH_M,
  SWIM_SPEED_FACTOR,
  swimSpeedFactor,
  swimDraftMargin,
  RIM_BAND_M,
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
  vehicleStreamUnits,
} from '../lib/earth2/streaming.js';
import { defaultVehicleStates, defaultInstanceStates } from '../lib/earth2/vehicles.js';

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

describe('the coastline — the rim is ocean (Merlin, 2026-10-23)', () => {
  it('every map edge descends below the waterline — the castle headland excepted', () => {
    const cc = parcelCenterWorld(castleParcel());
    for (let t = -WORLD_HALF_M; t <= WORLD_HALF_M; t += 3.5) {
      for (const [x, z] of [[t, -WORLD_HALF_M], [t, WORLD_HALF_M], [-WORLD_HALF_M, t], [WORLD_HALF_M, t]]) {
        // The Count's terrace is re-pinned after the apron: his
        // stretch of the south rim meets the sea as a headland.
        if (z === WORLD_HALF_M && Math.abs(x - cc.x) < 58) continue;
        assert.ok(heightAt(x, z) < WATER_Y, `rim at ${x}, ${z} meets the sea (${heightAt(x, z).toFixed(2)})`);
      }
    }
  });

  it('no rim parcel is drowned by the apron — each keeps dry ground', () => {
    for (const p of PARCELS) {
      const rim = p.row === 0 || p.col === 0 || p.row === PARCEL_ROWS - 1 || p.col === PARCEL_COLS - 1;
      if (!rim) continue;
      const c = parcelCenterWorld(p);
      // Parcels whose centres are water (basin ponds, the sea's
      // own edge) were ponds before the apron and stay ponds.
      if (heightAt(c.x, c.z) < WATER_Y - 0.25) continue;
      const r = parcelWorldRect(p);
      let mx = -Infinity;
      for (let x = r.minX + 1; x < r.maxX; x += 2) {
        for (let z = r.minZ + 1; z < r.maxZ; z += 2) mx = Math.max(mx, heightAt(x, z));
      }
      assert.ok(mx > 0.3, `${p.id} keeps a dry strip (max ${mx.toFixed(2)} m)`);
    }
  });

  it('the apron lives only in the border ring — the interior is untouched', () => {
    // Well inside the band, rim-ward ground keeps its native
    // height: the cap there sits above the world's highest peak.
    assert.ok(RIM_BAND_M < WORLD_CELL_M, 'the band fits inside the border ring');
    const c = parcelCenterWorld(parcelById('E2-1225'));
    assert.ok(heightAt(c.x, c.z) > 0.8, 'the landing meadow stands as before');
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
      // Tyrrell Field + the fleet (Vehicles Phase 1, 2026-10-23):
      // the terminal's home is its designated site
      // (lib/earth2/airport.js), streamed as the 'airport' unit;
      // each machine's home is wherever it is parked — the live
      // vehicle stream units (vehicleStreamUnits), merged into
      // the coverage test below exactly as the scene merges
      // them. Placement is pinned by
      // tests/earth2-vehicles.test.mjs. Terrain Wave B
      // (2026-10-23) adds the River Runner: a fleet model like
      // the four — its homes are the moorings in
      // lib/earth2/fleet.js, pinned by
      // tests/earth2-terrain-wave-b.test.mjs.
      'airport', 'rover', 'speed-bike', 'scarab', 'vtol', 'boat',
    ]);
    for (const m of earth2PlacedModels()) {
      assert.ok(planned.has(m.slug), `${m.slug} has no world placement`);
    }
  });

  it('swimmers live only in the largest water body, circuits fitted to the bed', () => {
    const sea = largestWaterBody();
    const swimmers = worldSwimmers();
    assert.equal(swimmers.length, 8, 'all eight sea creatures swim the world sea');
    for (const s of swimmers) {
      const scaleM = EARTH2_MODEL_BY_SLUG.get(s.slug).scaleM;
      assert.ok(EARTH2_MODEL_BY_SLUG.get(s.slug).habitat === 'water', s.slug);
      assert.equal(s.bodySize, sea.size, `${s.slug} swims the largest body`);
      assert.ok(heightAt(s.cx, s.cz) < WATER_Y - 0.25, `${s.slug} centre is wet`);
      // The fitted-circuit law (Wave C — the beached-tylosaurus
      // fix): at 72 samples the bed along the whole ellipse keeps
      // the animal's full draft below its surfacing line, so the
      // scene's bed clamp can never lift it; and the body-swept
      // ring 3 m outside the path stays over submerged bed — a
      // swimmer never renders where the terrain is above water.
      const bedLimit = s.shallow - swimDraftMargin(scaleM) - 0.6;
      let worst = -Infinity;
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const h = heightAt(s.cx + Math.cos(a) * s.rx, s.cz + Math.sin(a) * s.rz);
        if (h > worst) worst = h;
        assert.ok(h <= bedLimit + 1e-9,
          `${s.slug} circuit point ${k}: bed ${h.toFixed(2)} breaks its draft (limit ${bedLimit.toFixed(2)})`);
        const hr = heightAt(s.cx + Math.cos(a) * (s.rx + 3), s.cz + Math.sin(a) * (s.rz + 3));
        assert.ok(hr < WATER_Y, `${s.slug} body-swept ring point ${k} over dry land (${hr.toFixed(2)})`);
      }
      assert.ok(s.deep < s.shallow, `${s.slug} deep below shallow`);
      assert.ok(s.shallow < WATER_Y, `${s.slug} surfaces under the waterline cap`);
      // The dive band is set from the worst bed on the path: at
      // its deepest the belly still clears that bed by the draft.
      assert.ok(s.deep >= worst + swimDraftMargin(scaleM) - 1e-9,
        `${s.slug} dive band clears the worst bed on its circuit`);
    }
  });

  it('land creatures stand on dry ground in their habitat families', () => {
    const grass = ['Fields', 'Meadows', 'Grove', 'Vale'];
    // The volcano herd (Merlin, 2026-11-01) grazes the ash fields —
    // the volcano's slopes aren't grass families by design.
    const volcano = worldLandforms().find((lf) => lf.slug === 'active-volcano');
    for (const c of worldCreatures()) {
      const h = heightAt(c.x, c.z);
      assert.ok(h > 0.1, `${c.slug}#${c.copy} stands dry (${h})`);
      const parcel = PARCELS[c.parcelIndex];
      const entry = EARTH2_MODEL_BY_SLUG.get(c.slug);
      // Herd and flock herbivores graze the grass families (the
      // solo ankylosaurus ranges the steppe by design; the volcano
      // herd grazes the ash fields).
      if (entry.diet === 'herbivore' && (entry.social === 'herd' || entry.social === 'flock')) {
        const nearVolcano = volcano && Math.hypot(c.x - volcano.x, c.z - volcano.z) < 160;
        if (!nearVolcano) {
          assert.ok(grass.includes(familyForParcel(parcel)),
            `${c.slug} grazes ${familyForParcel(parcel)}`);
        }
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
        // Near the sea (within 120 m of the deepest point) — not
        // stacked on the exact centre (Merlin, 2026-11-03: labels
        // were stacking on one bird).
        const d = Math.hypot(f.cx - sea.deepestX, f.cz - sea.deepestZ);
        assert.ok(d < 120, `${f.slug} near the sea (${d.toFixed(0)} m)`);
      }
    }
    // No two flyers share a circuit centre (label stacking).
    for (let i = 0; i < flyers.length; i++) {
      for (let j = i + 1; j < flyers.length; j++) {
        const d = Math.hypot(flyers[i].cx - flyers[j].cx, flyers[i].cz - flyers[j].cz);
        assert.ok(d > 5, `${flyers[i].slug} vs ${flyers[j].slug} centres apart`);
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

  it('the river law: on foot, deep water slows the walker but never stops it', () => {
    // The pace curve: full speed through the shallows, easing to
    // the swim factor once fully swimming (Merlin, 2026-10-23:
    // rivers crossable on foot). Ground vehicles keep the old
    // wading wall — pinned in tests/earth2-vehicles.test.mjs.
    assert.equal(swimSpeedFactor(0), 1, 'dry land is full pace');
    assert.equal(swimSpeedFactor(WADE_FULL_SPEED_DEPTH_M), 1, 'shallows are full pace');
    assert.equal(swimSpeedFactor(SWIM_FULL_DEPTH_M), SWIM_SPEED_FACTOR, 'full depth is the swim factor');
    assert.equal(swimSpeedFactor(9), SWIM_SPEED_FACTOR, 'deeper stays at the swim factor');
    const mid = swimSpeedFactor((WADE_FULL_SPEED_DEPTH_M + SWIM_FULL_DEPTH_M) / 2);
    assert.ok(mid < 1 && mid > SWIM_SPEED_FACTOR, 'the slowdown eases in between');

    const sea = largestWaterBody();
    // Walking OUT of the deep toward the shallows always works.
    let pos = { x: sea.deepestX, z: sea.deepestZ };
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

    // And walking back IN crosses the whole channel, bank to
    // bank, through water far deeper than the old wading wall —
    // slower in the deep, but never refused.
    pos = { x: sea.deepestX, z: sea.deepestZ };
    const yawEast = Math.atan2(-1, 0); // forward = (−sin, −cos) → +x
    let maxDepth = 0;
    let crossed = false;
    for (let i = 0; i < 400; i++) {
      pos = stepWorldWalker(pos, yawEast, { fwd: 1, strafe: 0 }, 0.25, [], false);
      const d = waterDepthAt(pos.x, pos.z);
      if (d > 0.3) maxDepth = Math.max(maxDepth, d);
      if (i > 4 && d <= 0.02) { crossed = true; break; }
    }
    assert.ok(crossed, 'the walker reached the far bank on foot');
    assert.ok(maxDepth > MAX_WADE_DEPTH_M + 1,
      `the crossing truly swam (deepest ${maxDepth.toFixed(2)} m, wall was ${MAX_WADE_DEPTH_M})`);

    // The swim is slower than the wade: 2 s from the deepest
    // point covers well under the 12 m a dry 2 s walk covers.
    let deep = { x: sea.deepestX, z: sea.deepestZ };
    for (let i = 0; i < 8; i++) deep = stepWorldWalker(deep, yawEast, { fwd: 1, strafe: 0 }, 0.25, [], false);
    const swum = Math.hypot(deep.x - sea.deepestX, deep.z - sea.deepestZ);
    assert.ok(swum > 2 && swum < 9, `2 s of swimming covers ${swum.toFixed(1)} m, not a walk's 12`);
  });

  it('no wall at the grid edge: the walker walks out into the open sea and keeps going', () => {
    // Travel mode, due east from 5 m inside the edge: 10 s at 26 m/s
    // would run 260 m on dry land — out through the sea the pace
    // eases to a swim (the river law), but nothing stops the walker.
    let p = { x: WORLD_HALF_M - 5, z: 0 };
    for (let i = 0; i < 40; i++) p = stepWorldWalker(p, -Math.PI / 2, { fwd: 1, strafe: 0 }, 0.25, [], true);
    assert.ok(p.x > WORLD_HALF_M + 50, `the walker crossed the old edge (x=${p.x.toFixed(1)})`);
    assert.ok(heightAt(p.x, p.z) < WATER_Y, 'beyond the grid is open sea');
    // And it keeps going: another 10 s further out, still swimming
    // on real sea floor, not a void.
    for (let i = 0; i < 40; i++) p = stepWorldWalker(p, -Math.PI / 2, { fwd: 1, strafe: 0 }, 0.25, [], true);
    assert.ok(p.x > WORLD_HALF_M + 100, `the walker keeps going (x=${p.x.toFixed(1)})`);
    assert.ok(Number.isFinite(heightAt(p.x, p.z)), 'the sea floor is defined out there');
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

  it('the chamber still gates accounts without Earth 2 access before anything renders', () => {
    assert.ok(page.includes('hasEarth2Access'), 'access check (owner or POC guest)');
    assert.ok(page.includes('getSession'), 'session read');
    assert.ok(page.includes('Sign in to enter Earth 2'), 'sign-in gate for accounts without access (scout flaw 1, Nov 14, 2026)');
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
    assert.ok(page.includes('spawnParcelId={buildSpawnId || homeBaseId}'), 'spawn follows the home base (or the parcel a Build-here press targeted)');
    assert.ok(page.includes('onParcelChange={setSelectedId}'), 'the map selection follows the walker');
  });

  it('the world is display-only on foot: no rent, no buying wired in', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(!world.includes('/api/earth2/buy'), 'no buy calls');
    assert.ok(!world.includes('/api/earth2/rent'), 'no rent calls');
    assert.ok(world.includes('Display only'), 'the HUD says so plainly');
  });

  it('sanctuary rent: the world REPORTS the entry, the page charges it (Merlin, 2026-11-14)', () => {
    // The display-only law above forbids the scene calling the
    // rent route — so a sanctuary entry travels out through a
    // callback and the page (which already owns the rent call)
    // charges the passing rent. If either half is removed, the
    // meter silently stops and sanctuary becomes free.
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes('onSanctuaryEntry'), 'the scene takes a sanctuary-entry callback');
    assert.ok(world.includes('sanctuaryEntryRef.current(parcel.id, sanctuaryEntryId(parcel.id, Date.now()))'),
      'the scene reports the entry with its idempotency key');
    assert.ok(world.includes('sanctuaryRentOwed'), 'the scene only reports entries that owe rent');
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('onSanctuaryEntry={handleSanctuaryEntry}'), 'the page wires the callback into the world');
    assert.ok(page.includes('handleSanctuaryEntry'), 'the page handler exists');
    assert.ok(page.includes("post('/api/earth2/rent', { parcelId, entryId })"), 'the page charges the rent route');
    assert.ok(page.includes('lastSanctuaryEntryRef'), 'one charge per entry — the page dedupes by entryId');
  });

  it('the world loads models only through the signed-door resolver', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes('fetchEarth2ModelUrls'), 'signed URLs fetched once');
    // MODEL FALLBACK RETRY (Merlin, 2026-11-13): loads resolve
    // through modelDeliveryUrls — signed URL first, public file
    // second — which itself resolves through earth2ModelUrl.
    assert.ok(world.includes('modelDeliveryUrls'), 'every load resolved through the delivery list');
    assert.ok(read('lib/earth2/models.js').includes('export function earth2ModelUrl'),
      'the delivery list still resolves through the signed-door resolver');
    assert.ok(!world.includes('/models/earth2'), 'no hard-coded public path');
    assert.ok(world.includes('stepWorldWalker'), 'walking runs on the pure step');
    assert.ok(world.includes('heightAt'), 'feet read the shared heightfield');
  });
});

describe('proximity streaming — the memory contract (Safari killed the all-at-entry world)', () => {
  it('the planet matches the pinned generation fingerprint (coastline rework)', () => {
    // The fingerprint moved ONCE, deliberately: Merlin's
    // 2026-10-23 coastline order ("the world edge must be
    // ocean") added the rim apron in heightAt. The interior is
    // bit-identical to the planet Merlin walked; only the outer
    // band of the border ring changed. Any FURTHER drift of this
    // hash is a generation change nobody ordered.
    const samples = [];
    for (let x = -700; x <= 700; x += 37.3) {
      for (let z = -700; z <= 700; z += 41.7) {
        samples.push(heightAt(x, z).toFixed(5));
        samples.push(groundColorAt(x, z).map((v) => v.toFixed(4)).join(','));
      }
    }
    const hash = createHash('sha256').update(samples.join('|')).digest('hex');
    assert.equal(hash, 'bacfb9fcba2689a0b18bf58a0f4b37a0db6abe54f61c548828ddb2e0cfd07028',
      'heightfield + ground colours match the coastline-reworked planet');
    assert.equal(worldCreatures().length, 67, 'placement plan unchanged');
    assert.equal(worldLandforms().length, 9, 'placement plan unchanged');
    // The plant count moved ONCE, deliberately: Merlin's 2026-11-13
    // reed order (13 of 14 specced horsetail reeds placed) raised
    // the placement guard so the 14th reed lands — 109 -> 110.
    // The first 13 reeds are bit-identical (same seeded stream).
    assert.equal(worldPlants().length, 110, 'placement plan unchanged');
    assert.equal(landingParcel().id, 'E2-1225', 'the landing meadow is the same parcel');
  });

  it('every kind keeps a hysteresis band: release radius strictly beyond load radius', () => {
    for (const [kind, r] of Object.entries(STREAM_RADII)) {
      assert.ok(r.load > 0, `${kind} loads at a real distance`);
      assert.ok(r.release > r.load, `${kind}: release ${r.release} > load ${r.load} — border-walking cannot thrash`);
    }
  });

  it('the stream plan covers the whole cast exactly once — and nothing else', () => {
    // The scene's merged plan: the static world units plus the
    // fleet's live units — a machine's anchor moves with it, so
    // its unit is computed from state, exactly like a build's.
    // Since Terrain Wave B the fleet is per-INSTANCE (fleet.js):
    // the merged plan is computed from the instance state map,
    // and a scattered instance of a model claims no slug — the
    // Tyrrell Field machine carries its model's coverage, so the
    // cast is still covered exactly once.
    const units = worldStreamUnits().concat(vehicleStreamUnits(defaultInstanceStates()));
    const covered = units.flatMap((u) => u.slugs);
    assert.equal(new Set(covered).size, covered.length, 'no slug is streamed by two units');
    for (const m of earth2PlacedModels()) {
      assert.ok(covered.includes(m.slug), `${m.slug} has a stream unit`);
    }
    assert.ok(covered.includes('compy-swarm'), 'the swarm streams with the cast');
    // The 18 bridged Earth 1 garage models (Merlin, 2026-11-14)
    // stream as fleet units too — each is a distinct model, so
    // each claims its own slug. The count is read off Earth's
    // garage (minus the wedge-supercar, which lives on owned
    // parcels), not off the units under test.
    const earth1Streamed = VEHICLES.filter((v) => v.id !== 'wedge-supercar').length;
    assert.equal(covered.length, earth2PlacedModels().length + 1 + earth1Streamed, 'the cast + the swarm + the Earth 1 garage, no more');
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
    // (Merlin, 2026-11-03: the T-rex's 57 m walk circuit reaches
    // into the 430 m spawn load radius — 456 m anchor minus 57 m
    // roam = 399 m effective. Still a far walk; the "far" list
    // keeps the truly distant cast.)
    for (const slug of ['spinosaurus-rex', 'active-volcano', 'mountain-range', 'castle-transylvania', 'dracula', 'vampire-bat']) {
      assert.ok(!entrySlugs.has(slug), `${slug} is not resident at spawn`);
    }
    // The museum + Hammond wait in Earth 2's Drumheller, ~600 m
    // north-west — never resident at spawn (Phase 2 mount pin).
    for (const slug of ['museum', 'hammond']) {
      assert.ok(!entrySlugs.has(slug), `${slug} is not resident at spawn`);
    }
    // Of the 63 foundry model files, the spawn step-on loads 31.
    const entryModels = [...entrySlugs].filter((s) => {
      const e = EARTH2_MODEL_BY_SLUG.get(s);
      return e && e.file;
    });
    assert.equal(entryModels.length, 33, `entry loads ${entryModels.length} of 63 model files`);
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
    // ENDLESS (Nov 18, 2026): the old static 256×256 plane is gone —
    // the ground streams in chunks around the camera instead.
    assert.ok(world.includes("from '@/lib/earth2/terrain-streaming'"), 'the endless terrain law is imported');
    assert.ok(world.includes('updateTerrainStreaming'), 'terrain streams around the camera');
    assert.ok(world.includes('chunkHeightField(cx, cz)'), 'chunks built from the seeded field');
    assert.ok(!world.includes('PlaneGeometry(WORLD_SIZE_M, WORLD_SIZE_M, 256, 256)'), 'the old static plane is gone');
  });

  it('marine creatures stay in water — never on dry land (Merlin, 2026-11-03)', () => {
    // Footage showed Kronosaurus, Megalodon, Tylosaurus and
    // Elasmosaurus on dry land. The placement guard rejects
    // circuits centred on land; the runtime guard hides strays.
    const swimmers = worldSwimmers();
    for (const s of swimmers) {
      const h = heightAt(s.cx, s.cz);
      assert.ok(h < WATER_Y - 1.0,
        `${s.slug} circuit centre is wet (${h.toFixed(2)} < ${WATER_Y - 1.0})`);
    }
    // Every swimmer slug is a marine entry with water habitat.
    for (const s of swimmers) {
      const entry = EARTH2_MODEL_BY_SLUG.get(s.slug);
      assert.equal(entry.kind, 'marine', `${s.slug} is marine`);
      assert.equal(entry.habitat, 'water', `${s.slug} lives in water`);
    }
  });

  it('flyers roost on land, never on water (Merlin, 2026-11-03)', () => {
    // Birds nest in trees, not water. The roost logic spirals out
    // from a wet circuit centre to dry land.
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes('ROOST-ON-WATER FIX'), 'the roost fix is wired');
    assert.ok(world.includes('spiral out to the nearest dry land'), 'roost seeks land');
  });

  it('marine predators hunt swimmers (Merlin, 2026-11-03)', () => {
    // "Megs should hunt anything that enters the water."
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes('MARINE HUNT'), 'the marine hunt is wired');
    assert.ok(world.includes('walkerInWater'), 'the hunt checks for swimmers');
    assert.ok(world.includes('killWalker'), 'the hunt can catch the swimmer');
  });
});

describe('the sky — a visible sun and the photo moon (Merlin, 2026-11-17)', () => {
  it('the moon is a sphere wearing the lunar photo, never a flat disc', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes("new THREE.SphereGeometry(56, 32, 24)"), 'the moon is a sphere, r56');
    assert.ok(world.includes("'/images/moon/moon-surface.jpg'"), 'the moon wears the equirectangular photo');
    assert.ok(world.includes('new THREE.TextureLoader().load('), 'the photo loads through TextureLoader');
    assert.ok(!world.includes('CircleGeometry(56'), 'no flat moon disc — a disc would smear the unwrapped photo');
    assert.ok(!world.includes('moonDisc.lookAt'), 'a sphere needs no lookAt');
    assert.ok(world.includes('moonGlow.position.copy(moonSphere.position)'), 'the halo still rides the moon');
  });

  it('the sun is a visible core + halo on its real bearing, gone at night', () => {
    const world = read('components/earth2/Earth2World.jsx');
    assert.ok(world.includes('new THREE.SphereGeometry(70, 32, 24)'), 'the sun core is a sphere, r70');
    assert.ok(world.includes('sunDisc.position.set(walker.x + sd.x * 1850'), 'the core rides the real sun vector at the moon distance');
    assert.ok(world.includes('sunGlow.position.copy(sunDisc.position)'), 'the halo rides the core');
    assert.ok(world.includes('sol.elevationDeg > -2'), 'the sun sets below the horizon — the Earth 3 rule');
    assert.ok(world.includes('sunDisc.material.opacity = sunUp ?'), 'the core is gone at night, not shining through the ground');
  });
});
