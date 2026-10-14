// tests/earth-placements.test.mjs — Earth generated-asset placement
// layer: bridge manifest integrity + placement math (grounding on the
// real terrain sampler, anchor extraction, deterministic scatter,
// farmstead composition). Synthetic height data keeps the math tests
// dependency-free; grounding uses lib/terrain.js's real sampler.
import assert from 'node:assert';
import { EARTH_ASSETS, getEarthAsset } from '../lib/earth/assets.js';
import {
  placementsFor,
  groundedPlacement,
  surfaceRadiusAt,
  anchorFromRegion,
  seededRandom,
  METRES_PER_HUB_UNIT,
} from '../lib/earth/placements.js';
import { latLonToVec3, EARTH_RADIUS } from '../lib/geo.js';
import { TERRAIN_RADIUS, displacementForHeight } from '../lib/terrain.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

// Synthetic heightmaps: flat ocean (all 0) and a uniform landmass.
const OW = 64, OH = 32;
const ocean = new Uint8Array(OW * OH).fill(0);
const land = new Uint8Array(OW * OH).fill(200);

check('bridge manifest: every entry is verified-hosted shaped', () => {
  assert.ok(Array.isArray(EARTH_ASSETS) && EARTH_ASSETS.length > 0);
  for (const a of EARTH_ASSETS) {
    assert.match(a.glbUrl, /^https:\/\/pjslctbyigtapvblbjao\.supabase\.co\/storage\/v1\/object\/public\/earth-models\/[a-z0-9-]+\.glb$/);
    assert.ok(a.glbUrl.endsWith(`/${a.id}.glb`));
    assert.ok(a.tris > 0 && a.bytes > 0);
    assert.ok(a.scaleFactor > 0, `${a.id} scaleFactor`);
    assert.ok(Array.isArray(a.nativeSize) && a.nativeSize.length === 3);
    assert.ok(a.placement && a.placement.mode);
    assert.equal(getEarthAsset(a.id), a);
  }
  assert.equal(getEarthAsset('e999-nope'), null);
});

check('surface radius: ocean floor dips, land rises', () => {
  const rOcean = surfaceRadiusAt(ocean, OW, OH, 0, 0);
  const rLand = surfaceRadiusAt(land, OW, OH, 0, 0);
  assert.ok(Math.abs(rOcean - (TERRAIN_RADIUS + displacementForHeight(0))) < 1e-9);
  assert.ok(rLand > rOcean);
  assert.ok(Math.abs(rLand - (TERRAIN_RADIUS + displacementForHeight(200 / 255))) < 1e-6);
});

check('grounded placement: base rests on the surface, normal is radial', () => {
  const asset = { scaleM: 22, scaleFactor: 11, nativeSize: [0.68, 2, 0.8] };
  const g = groundedPlacement(asset, land, OW, OH, 54, -115);
  const surf = latLonToVec3(54, -115, g.surfaceRadius);
  assert.ok(Math.abs(g.surfacePoint.x - surf.x) < 1e-9);
  const nMag = Math.hypot(g.normal.x, g.normal.y, g.normal.z);
  assert.ok(Math.abs(nMag - 1) < 1e-9);
  // origin - surfacePoint == normal * worldHeight/2
  const d = Math.hypot(
    g.position.x - g.surfacePoint.x - (g.normal.x * g.worldHeight) / 2,
    g.position.y - g.surfacePoint.y - (g.normal.y * g.worldHeight) / 2,
    g.position.z - g.surfacePoint.z - (g.normal.z * g.worldHeight) / 2,
  );
  assert.ok(d < 1e-9);
  assert.ok(Math.abs(g.worldHeight - 22 / METRES_PER_HUB_UNIT) < 1e-12);
});

check('anchor extraction from queue region strings', () => {
  assert.deepEqual(anchorFromRegion('Global — Canadian Shield anchor 50.0,-86.0; any'), { lat: 50, lon: -86 });
  assert.deepEqual(anchorFromRegion('Alberta farmsteads — anchor 53.45,-113.6 (farmland)'), { lat: 53.45, lon: -113.6 });
  assert.equal(anchorFromRegion('no anchor here'), null);
  assert.equal(anchorFromRegion(null), null);
  // Queue fallback phrasing: trailing coordinates, no 'anchor' word.
  assert.deepEqual(
    anchorFromRegion('Global riparian — river valleys incl. North Saskatchewan River, Edmonton 53.55,-113.49'),
    { lat: 53.55, lon: -113.49 });
  // Genuinely coordinate-free regions stay unanchored (gap, not guess).
  assert.equal(anchorFromRegion('Global coastlines — temperate and tropical shores'), null);
});

check('seeded scatter is deterministic and grounded', () => {
  const asset = {
    id: 'e009-lodgepole-pine', scaleM: 22, scaleFactor: 11,
    nativeSize: [0.68, 2, 0.8],
    placement: { mode: 'instanced-scatter', lat: null, lon: null, region: 'Boreal — anchor 54.0,-115.0', headingDeg: null },
  };
  const a = placementsFor(asset, land, OW, OH, { scatterCount: 12 });
  const b = placementsFor(asset, land, OW, OH, { scatterCount: 12 });
  assert.equal(a.length, 12);
  assert.deepEqual(a, b);
  for (const p of a) {
    const expect = surfaceRadiusAt(land, OW, OH, p.lat, p.lon);
    assert.ok(Math.abs(p.surfaceRadius - expect) < 1e-9);
  }
  const r1 = seededRandom('x'); const r2 = seededRandom('x');
  assert.equal(r1(), r2());
});

check('exact single places once, at its coordinates', () => {
  const asset = {
    id: 'e007-badlands-hoodoos', scaleM: 18, scaleFactor: 6,
    nativeSize: [2, 3, 2],
    placement: { mode: 'single', lat: 51.4678, lon: -112.6451, region: 'Drumheller', headingDeg: null },
  };
  const ps = placementsFor(asset, land, OW, OH);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].lat, 51.4678);
  assert.equal(ps[0].lon, -112.6451);
});

check('farm singles compose around the shared anchor, never stack', () => {
  const mk = (id) => ({
    id, scaleM: 12, scaleFactor: 6, nativeSize: [2, 2, 2],
    placement: { mode: 'single', lat: null, lon: null, region: 'Alberta farmsteads — anchor 53.45,-113.6', headingDeg: null },
  });
  const pts = ['e021-red-gambrel-barn', 'e022-grain-silo', 'e023-prairie-farmhouse', 'e024-farm-windmill']
    .map((id) => placementsFor(mk(id), land, OW, OH)[0]);
  const keys = new Set(pts.map((p) => `${p.lat},${p.lon}`));
  assert.equal(keys.size, 4);
});

check('unanchored asset yields no placements rather than a wrong one', () => {
  const asset = {
    id: 'eXXX', scaleM: 5, scaleFactor: 2, nativeSize: [1, 1, 1],
    placement: { mode: 'instanced-scatter', lat: null, lon: null, region: 'somewhere', headingDeg: null },
  };
  assert.deepEqual(placementsFor(asset, land, OW, OH), []);
});

check('EARTH_RADIUS sanity: hub units match the geo module', () => {
  assert.equal(EARTH_RADIUS, TERRAIN_RADIUS);
});

console.log(`earth-placements: ${passed} checks passed`);
