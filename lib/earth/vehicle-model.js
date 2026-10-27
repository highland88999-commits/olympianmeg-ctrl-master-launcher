// lib/earth/vehicle-model.js — lazy per-craft GLB loading for Earth 1.
//
// The car-model.js pattern, generalized: nothing loads until the
// traveler actually summons that craft (never at street entry —
// the 2026-10-26 outage repair's lesson), each craft's prepared
// model is cached for the session, a failed load stays absent
// (never a crash) and retries on the next summon. One cache entry
// per craft id, so the picker can swap craft without re-downloading
// a craft already ridden this session.
//
// Fit math is the supercar's: tame the Tripo materials, scale so
// the longest horizontal axis reads the roster lengthM, lift by
// half the height so wheels sit on the ground. car-model.js is
// left untouched (the wedge's own loader, kept for its tests).

import * as THREE from 'three';
import { DISPLAY_UNITS_PER_METRE } from './placements.js';
import { tameTripoMaterials } from '../characters/tame-materials.js';
import { getVehicle } from './vehicles.js';

const cache = new Map(); // craftId -> prepared model | null
const inflight = new Map(); // craftId -> promise
const listeners = new Set(); // cb({ id, model })

export function getVehicleModel(id) {
  return cache.has(id) ? cache.get(id) : null;
}

export function isVehicleModelLoading(id) {
  return inflight.has(id);
}

export function subscribeVehicleModel(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(id) {
  for (const cb of [...listeners]) {
    try {
      cb({ id, model: cache.get(id) || null });
    } catch {
      // A dead subscriber never breaks the craft for everyone else.
    }
  }
}

async function defaultLoadVehicleModel(url) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url);
}

function prepareModel(gltf, vehicle) {
  tameTripoMaterials(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const longest = Math.max(size.x, size.z) || 1;
  return {
    scene: gltf.scene,
    scale: (vehicle.lengthM * DISPLAY_UNITS_PER_METRE) / longest,
    rotY: effectiveRotY(size.x, size.z, !!vehicle.noseReversed),
    liftY: size.y / 2,
  };
}

/** Inner Y-rotation that puts a craft's nose on +Z (the drive
 *  direction — EarthSupercar orients the group +Z along heading).
 *  The loader aligns the longest horizontal axis to Z: an X-long
 *  model turns +90° (file +X maps to world −Z), a Z-long model
 *  turns 0°. A noseReversed craft (nose audit 2026-10-26, see
 *  lib/earth/vehicles.js) gets an extra half-turn, so its nose
 *  lands on +Z too. Pure — pinned in tests/earth-video-orders. */
export function effectiveRotY(sizeX, sizeZ, noseReversed) {
  const base = sizeX > sizeZ ? Math.PI / 2 : 0;
  return base + (noseReversed ? Math.PI : 0);
}

export function ensureVehicleModel(id, load) {
  const v = getVehicle(id);
  if (!v) return Promise.resolve(null);
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    try {
      const gltf = await (load || defaultLoadVehicleModel)(v.glbUrl);
      cache.set(id, gltf && gltf.scene ? prepareModel(gltf, v) : null);
    } catch {
      // Absent, never a crash — and the next summon retries.
      cache.set(id, null);
    } finally {
      inflight.delete(id);
    }
    emit(id);
    return cache.get(id);
  })();
  inflight.set(id, p);
  return p;
}

// Test-only: clear the session caches and listeners.
export function resetVehicleModelsForTests() {
  cache.clear();
  inflight.clear();
  listeners.clear();
}
