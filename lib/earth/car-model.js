// lib/earth/car-model.js — the supercar model, loaded LAZILY.
//
// 2026-10-26 (Earth outage repair): the Aventador GLB used to load
// the moment the street scene mounted — a 23.6 MB download with a
// 1.95M-triangle mesh and an 8192×8192 texture, decoded on the main
// thread. On a phone over LTE that spike landed mid-walk and the
// page died (white page → reload → login screen, twice in one
// 62-second clip). Two changes end that:
//
// 1. The file itself is optimized (same path): ~1.7 MB, ~234k
//    triangles, WebP-1024 textures, same bounding size — the car
//    on screen is unchanged, the spike is gone.
// 2. Nothing loads until the traveler actually summons the car.
//    summonCar() (EarthSupercar) calls ensureCarModel(); the
//    component subscribes and renders the car when it arrives.
//    A tap while loading is a no-op visually — the car appears
//    when ready — and a failed load stays absent (never a crash)
//    and retries on the next summon.
//
// The prepared model is cached for the session: leaving the
// street and coming back never re-downloads it.

import * as THREE from 'three';
import { DISPLAY_UNITS_PER_METRE } from './placements.js';
import { tameTripoMaterials } from '../characters/tame-materials.js';

export const CAR_GLB_URL = '/models/vehicles/wedge-supercar.glb';
export const CAR_LENGTH_M = 4.6;

let cached = null;
let inflight = null;
const listeners = new Set();

export function getCarModel() {
  return cached;
}

export function isCarModelLoading() {
  return inflight !== null;
}

export function subscribeCarModel(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const cb of [...listeners]) {
    try {
      cb(cached);
    } catch {
      // A dead subscriber never breaks the car for everyone else.
    }
  }
}

// The app's GLTFLoader + meshopt path (browser only). Tests inject
// their own loader — this default is never imported in node tests.
async function defaultLoadCarModel() {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(CAR_GLB_URL);
}

// Same fit math EarthSupercar used to do inline: tame the Tripo
// materials, then scale so the longest horizontal axis reads
// CAR_LENGTH_M and lift by half the height so the wheels sit on
// the ground, not the model's centre.
function prepareModel(gltf) {
  tameTripoMaterials(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const longest = Math.max(size.x, size.z) || 1;
  return {
    scene: gltf.scene,
    scale: (CAR_LENGTH_M * DISPLAY_UNITS_PER_METRE) / longest,
    rotY: size.x > size.z ? Math.PI / 2 : 0,
    liftY: size.y / 2,
  };
}

export function ensureCarModel(load = defaultLoadCarModel) {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const gltf = await load();
      cached = gltf && gltf.scene ? prepareModel(gltf) : null;
    } catch {
      // Absent, never a crash — and the next summon retries.
      cached = null;
    } finally {
      inflight = null;
    }
    emit();
    return cached;
  })();
  return inflight;
}

// Test-only: clear the session cache and listeners.
export function resetCarModelForTests() {
  cached = null;
  inflight = null;
  listeners.clear();
}
