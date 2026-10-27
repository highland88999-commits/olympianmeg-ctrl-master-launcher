// lib/earth/extension-character-model.js — direct GLB loader
// for Earth 1 extension characters (lib/earth/earth-characters.js).
//
// The kombat path (attachCharacterGlb / attachGlbFighter) cannot
// serve these characters — it requires a generated kombat
// loadout, and loadouts.js is GENERATED (never hand-edited).
// So extension characters load DIRECTLY: fetch the GLB, fit it
// to standing height, tame its materials (same two laws as the
// vehicle loader: force double-sided, never a raw emissive —
// nothing here may draw a black silhouette), and hand the
// caller a THREE.Group it can mount. No bone posing: the group
// moves as one rigid figure with procedural bob/lean/sway
// applied by EarthWalker.
//
// Same lazy, cached, fail-soft contract as lib/earth/car-model.js
// and lib/earth/vehicle-model.js: nothing downloads until the
// character is picked (or a peer needs it); a failed load stays
// absent and retries on the next pick; a loaded model is cached
// for the session, never re-downloaded.

import * as THREE from 'three';
import { getExtensionCharacter } from './earth-characters.js';
import { DISPLAY_UNITS_PER_METRE } from './placements.js';

const UPM = DISPLAY_UNITS_PER_METRE;
const cache = new Map(); // id -> prepared model
const inflight = new Map(); // id -> promise
const listeners = new Set();

function emit(payload) {
  for (const fn of Array.from(listeners)) {
    try { fn(payload); } catch { /* a listener must never break the loader */ }
  }
}

export function subscribeExtensionCharacterModel(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getExtensionCharacterModel(id) {
  return cache.get(id) || null;
}

function prepareModel(scene, heightM) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const height = Math.max(size.y, 0.001);
  const scale = (heightM * UPM) / height;
  const liftY = -box.min.y * scale;
  scene.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.DoubleSide;
        if (m.emissive && m.emissiveIntensity === 0) m.emissiveIntensity = 1;
      }
    }
  });
  return { scene, scale, liftY };
}

export async function ensureExtensionCharacterModel(id, loadImpl) {
  const entry = getExtensionCharacter(id);
  if (!entry) return null;
  if (cache.has(id)) return cache.get(id);
  if (inflight.has(id)) return inflight.get(id);
  const load = loadImpl || (async () => {
    const { GLTFLoader } = await import('three-stdlib');
    const loader = new GLTFLoader();
    return loader.loadAsync(entry.glbUrl);
  });
  const promise = load()
    .then((gltf) => {
      const model = prepareModel(gltf.scene, entry.heightM);
      cache.set(id, model);
      inflight.delete(id);
      emit({ id, model });
      return model;
    })
    .catch(() => {
      inflight.delete(id);
      return null;
    });
  inflight.set(id, promise);
  return promise;
}

export function resetExtensionCharacterModelForTests() {
  cache.clear();
  inflight.clear();
}
