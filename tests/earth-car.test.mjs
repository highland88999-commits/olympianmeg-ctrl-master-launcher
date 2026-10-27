// tests/earth-car.test.mjs — the Earth supercar outage repair
// (Merlin, 2026-10-26: "it crashes for car spawning and it's
// chunky"). Two findings from his 62-second clip, both pinned
// here so no later edit can quietly reintroduce them:
//
// 1. THE CRASH: the Aventador GLB was 23.6 MB / 1.95M triangles
//    with an 8192×8192 texture, and it loaded the moment the
//    street scene mounted. On a phone over LTE the main-thread
//    decode spike killed the page twice (white page → reload →
//    login screen, ~s24 and ~s61). The shipped file is now
//    ~1.7 MB / ~234k triangles / WebP-1024, same shape, and it
//    loads LAZILY — only the summon starts the download.
// 2. THE CHUNK: the hub Canvas rendered at the phone's full
//    device pixel ratio (up to 3×) on top of that scene. It is
//    capped at 1.75 (the Myriad precedent).
//
// Run: node tests/earth-car.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  ensureCarModel,
  getCarModel,
  isCarModelLoading,
  subscribeCarModel,
  resetCarModelForTests,
} from '../lib/earth/car-model.js';
import { DISPLAY_UNITS_PER_METRE } from '../lib/earth/placements.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// --- GLB budget: parse the JSON chunk straight out of the file ---
function readGlbJson(path) {
  const buf = readFileSync(join(root, path));
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'glTF', 'GLB magic');
  const jsonLen = buf.readUInt32LE(12);
  return { bytes: buf.length, json: JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) };
}

const { bytes, json } = readGlbJson('public/models/vehicles/wedge-supercar.glb');
const prim = json.meshes[0].primitives[0];
const posAcc = json.accessors[prim.attributes.POSITION];
const idxAcc = json.accessors[prim.indices];
const tris = idxAcc.count / 3;

check('car file is small enough to decode on a phone', () => {
  assert.ok(bytes < 5_000_000, `car GLB is ${bytes} bytes, budget 5 MB`);
});
check('car triangle count is a street-scale budget, not a film asset', () => {
  assert.ok(tris > 50_000, `car has only ${tris} triangles — degenerate export?`);
  assert.ok(tris < 400_000, `car has ${tris} triangles, budget 400k`);
});
check('car textures are all WebP and small', () => {
  assert.ok(json.images.length > 0, 'car has textures');
  let total = 0;
  for (const img of json.images) {
    assert.equal(img.mimeType, 'image/webp', `texture is ${img.mimeType}, not WebP`);
    total += json.bufferViews[img.bufferView].byteLength;
  }
  assert.ok(total < 500_000, `car textures total ${total} bytes, budget 500 KB`);
});
check('car is unrigged (no skins to break under simplification)', () => {
  assert.equal((json.skins || []).length, 0, 'car must stay unrigged');
});
check('car keeps its shape: extent ratios match the original', () => {
  // The optimized file stores QUANTIZED min/max, so absolute
  // values moved — but the shape ratios must not. Original
  // extents were x 0.4896 / y 0.2512 / z 0.9809.
  const ext = posAcc.max.map((v, i) => v - posAcc.min[i]);
  const xz = ext[0] / ext[2];
  const yz = ext[1] / ext[2];
  assert.ok(Math.abs(xz - 0.4991) < 0.01, `x/z ratio ${xz}`);
  assert.ok(Math.abs(yz - 0.2561) < 0.01, `y/z ratio ${yz}`);
});

// --- Source contracts: lazy load, dpr cap, Moon gate ---
check('EarthSupercar never loads the model at street entry', () => {
  const src = read('components/EarthSupercar.jsx');
  assert.ok(!src.includes('loadAsync'), 'component must not call loadAsync itself');
  assert.ok(src.includes('subscribeVehicleModel'), 'component subscribes to the lazy loader');
});
check('summoning the craft is what starts the download', () => {
  const src = read('components/EarthSupercar.jsx');
  const summon = src.slice(src.indexOf('export function summonCar('));
  assert.ok(summon.includes('ensureVehicleModel'), 'summonCar must kick ensureVehicleModel');
  // The loader is generalized (one loader for all 19 craft); the
  // shipped wedge file is still the roster's wedge entry.
  const roster = read('lib/earth/vehicles.js');
  assert.ok(roster.includes('/models/vehicles/wedge-supercar.glb'), 'roster points at the shipped wedge file');
});
check('hub Canvas pixel ratio is capped', () => {
  const src = read('components/HomeScene.jsx');
  assert.ok(src.includes('dpr={[1, 1.75]}'), 'Canvas must carry dpr={[1, 1.75]}');
});
check('HubMoon hides at street level (its label bled into street sky)', () => {
  const src = read('components/HomeScene.jsx');
  assert.ok(
    src.includes("!['diving_to_street', 'earth_roam'].includes(appState) && <HubMoon />"),
    'HubMoon must be gated off during diving_to_street / earth_roam',
  );
});

// --- Lazy loader behaviour (fake loader, real three objects) ---
function fakeCarScene() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial());
  group.add(mesh);
  return group;
}

await checkAsync('loader does not run before the first summon', async () => {
  resetCarModelForTests();
  let calls = 0;
  const load = async () => { calls += 1; return { scene: fakeCarScene() }; };
  assert.equal(getCarModel(), null);
  assert.equal(isCarModelLoading(), false);
  assert.equal(calls, 0, 'importing the module must not start a load');
  const a = ensureCarModel(load);
  const b = ensureCarModel(load);
  assert.equal(isCarModelLoading(), true, 'loading flag is set while in flight');
  assert.equal(calls, 1, 'concurrent summons share one load');
  const model = await a;
  assert.equal(await b, model, 'concurrent callers get the same model');
  assert.equal(calls, 1);
  assert.equal(getCarModel(), model);
  // BoxGeometry(2,1,4): longest horizontal axis 4, so scale maps
  // 4 model units to 4.6 m; nose axis is z, so no half-turn.
  assert.equal(model.rotY, 0);
  assert.equal(model.liftY, 0.5);
  assert.equal(model.scale, (4.6 * DISPLAY_UNITS_PER_METRE) / 4);
  assert.equal(isCarModelLoading(), false);
});

await checkAsync('a loaded model is cached, never re-downloaded', async () => {
  let calls = 0;
  const load = async () => { calls += 1; return { scene: fakeCarScene() }; };
  const again = await ensureCarModel(load);
  assert.equal(calls, 0, 'cached model must not reload');
  assert.equal(again, getCarModel());
});

await checkAsync('subscribers hear the model the moment it lands', async () => {
  resetCarModelForTests();
  const heard = [];
  const unsub = subscribeCarModel((m) => heard.push(m));
  await ensureCarModel(async () => ({ scene: fakeCarScene() }));
  assert.equal(heard.length, 1, 'one emit on load');
  assert.equal(heard[0], getCarModel());
  unsub();
});

await checkAsync('a failed load stays absent and retries on the next summon', async () => {
  resetCarModelForTests();
  let calls = 0;
  const failing = async () => { calls += 1; throw new Error('no network'); };
  assert.equal(await ensureCarModel(failing), null);
  assert.equal(getCarModel(), null);
  assert.equal(isCarModelLoading(), false);
  assert.equal(await ensureCarModel(failing), null);
  assert.equal(calls, 2, 'each failed summon may retry');
});

console.log(`earth-car: ${passed} checks passed`);
