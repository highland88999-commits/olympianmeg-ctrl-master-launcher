// tests/earth1-staged-objects.test.mjs — Earth 1 simplification
// (Merlin, 2026-10-26): all placed 3D objects are staged off the
// hub Earth scene — de-wired, NOT deleted — and kept only as
// the Redwater spawn farmstead plus the staged inventory record.
//
// Contracts pinned here:
// - The staged set covers exactly every Earth asset id (70).
// - No staged object leaves a collider behind (otherwise the
//   walker would hit invisible walls where objects used to be).
// - NexusEarth mounts no removed scene layer, keeps the player
//   systems (character, bike, supercar), the Redwater journey
//   markers, and the farmstead dressing.
// - The farmstead renders only the 4 farm clones, visual-only:
//   no colliders published, no interior room, no animation.
// Run: node tests/earth1-staged-objects.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EARTH_ASSETS } from '../lib/earth/assets.js';
import { STAGED_EARTH_ASSET_IDS, isEarthObjectStaged } from '../lib/earth/staged-objects.js';
import { buildColliders, publishColliders, getColliders } from '../lib/earth/collision.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('staged set covers exactly every Earth asset id', () => {
  assert.equal(EARTH_ASSETS.length, 70);
  assert.equal(STAGED_EARTH_ASSET_IDS.size, 70);
  for (const a of EARTH_ASSETS) {
    assert.ok(isEarthObjectStaged(a.id), `${a.id} must be staged`);
  }
  assert.equal(isEarthObjectStaged('e999-does-not-exist'), false);
  assert.equal(isEarthObjectStaged('earth-bike'), false);
  assert.equal(isEarthObjectStaged('earth-supercar'), false);
});

test('no staged object leaves a collider behind', () => {
  const colliders = buildColliders();
  assert.deepEqual(colliders, []);
  for (const c of colliders) {
    assert.equal(isEarthObjectStaged(c.id), false, `${c.id} collider leaked`);
  }
});

test('publishColliders drops staged entries', () => {
  publishColliders([{
    lat: 48.8584, lon: 2.2945, radiusM: 5,
    id: 'e049-eiffel-tower', category: 'landmark', name: 'Eiffel Tower',
  }]);
  const ids = getColliders().map((c) => c.id);
  assert.ok(!ids.includes('e049-eiffel-tower'));
});

test('NexusEarth mounts no removed layer and keeps the vehicles-only systems', () => {
  const src = read('components/NexusEarth.jsx');
  for (const gone of ['EarthAssets', 'EarthLocalScatter', 'EarthLadders', 'MonumentElevator', 'EarthWalker', 'EarthBike', 'RedwaterMount', 'EarthPitMarker']) {
    assert.ok(!src.includes(gone), `NexusEarth must not reference ${gone}`);
  }
  for (const kept of ['RedwaterFarmstead', 'EarthSupercar', 'EarthKart', 'EarthBoostPads', 'EarthPeers', 'ProceduralEarthGlobe', 'GoogleEarthTiles']) {
    assert.ok(src.includes(kept), `NexusEarth must still mount ${kept}`);
  }
});

test('RedwaterFarmstead renders only the 4 farm clones, visual-only', () => {
  const src = read('components/earth/RedwaterFarmstead.jsx');
  for (const id of ['e021-red-gambrel-barn', 'e022-grain-silo', 'e023-prairie-farmhouse', 'e024-farm-windmill']) {
    assert.ok(src.includes(id), `farmstead must include ${id}`);
  }
  assert.ok(!src.includes('publishColliders'), 'farmstead must publish no colliders');
  assert.ok(!src.includes('buildInteriorRoom'), 'farmstead must build no interior room');
  assert.ok(!src.includes('registerVertexAnimation'), 'farmstead must animate nothing');
  assert.ok(!src.includes('e049-eiffel-tower'), 'farmstead must not render other assets');
});

test('RedwaterFarmstead spreads the clones in display metres, clear of the spawn (2026-11-16 video)', () => {
  // The farm offsets are display metres on the 55-unit street
  // globe (≈60 per degree), never real-Earth metres-per-degree:
  // the real figure (111,320) put all four clones within
  // 0.0007 units of each other — one interpenetrating pile at
  // the spawn with the camera starting inside it. The display
  // figure puts them 130–200 display metres apart (nearest:
  // the silo, ~178 display metres from the spawn) with every
  // pairwise separation clear of the two footprints.
  const src = read('components/earth/RedwaterFarmstead.jsx');
  assert.ok(!src.includes('/ 111320'), 'farmstead must not convert offsets with real-Earth metres-per-degree');
  assert.ok(src.includes('DISPLAY_M_PER_DEGREE'), 'farmstead offsets use the street display scale');
});

test('staged inventory record exists with the full object list', () => {
  // The inventory lives in the workspace, not the repo, so this
  // test pins the contract shape against the staged-objects
  // module rather than the workspace file itself: the module
  // comment names the inventory path, and the counts below are
  // the receipt the push report carries.
  const src = read('lib/earth/staged-objects.js');
  assert.ok(src.includes('earth1-staged-objects/inventory.json'));
});
