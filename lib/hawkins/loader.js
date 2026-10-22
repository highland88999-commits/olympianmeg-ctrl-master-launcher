// lib/hawkins/loader.js
// HAWKINS — GLB loading + character instantiation for the Tripo
// models, following the house pattern set by lib/kombat/glb-fighter.js
// and the Earth 2 Bay: ONE shared GLTFLoader with the MeshoptDecoder
// (the Studio exports REQUIRE EXT_meshopt_compression), ArrayBuffers
// cached per URL, and each game instance an independent SkeletonUtils
// clone of the parsed base — so ten demogorgons share one download but
// never share a skeleton.
//
// instantiateHawkins(id) resolves to a handle:
//   {
//     group,          // holder group — the engine positions/rotates it
//     entry,          // the manifest entry it was built from
//     joints,         // resolved joint names (for the record/tests)
//     update(t, state), // drive the pose for absolute time t
//     dispose(),
//   }
// or null when the manifest entry has no file (still awaiting its rig)
// or the load fails — callers then keep their fallback body.
//
// Normalization (the Bay's rule): the model is scaled so its height —
// or, for span-scaled sky creatures, its longest horizontal extent —
// matches the manifest, centred on x/z, feet on the floor. Bind-pose
// facing was measured off the files: toes point +Z, which is the
// Hawkins engine's own forward (rotation.y = atan2(dx, dz)), so no
// yaw correction is applied.
//
// The delivered rig exports carry no materials/textures/vertex
// colours, so each clone is dressed in a MeshStandardMaterial of the
// manifest tint; otherwise the models would render renderer-white.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { hawkinsModel } from './models.js';
import {
  resolveHawkinsJoints, resolveCreatureJoints, buildJointObjects,
  pickBones, createPoseDriver, createSwayDriver, createFlapDriver,
  HAWKINS_PERSONALITIES,
} from './rig.js';

let sharedLoader = null;
function getLoader() {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    sharedLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedLoader;
}

const bufferCache = new Map(); // url -> Promise<ArrayBuffer>
function fetchBuffer(url) {
  if (!bufferCache.has(url)) {
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`GLB fetch ${r.status}`);
        return r.arrayBuffer();
      })
      .catch((err) => {
        bufferCache.delete(url); // a later retry may succeed
        throw err;
      });
    bufferCache.set(url, p);
  }
  return bufferCache.get(url);
}

const baseCache = new Map(); // id -> Promise<THREE.Object3D|null>
function loadBase(id) {
  if (!baseCache.has(id)) {
    const entry = hawkinsModel(id);
    const p = (async () => {
      if (!entry || !entry.file) return null;
      const buf = await fetchBuffer(entry.file);
      const gltf = await getLoader().parseAsync(buf, '');
      return gltf.scene;
    })().catch(() => null);
    baseCache.set(id, p);
  }
  return baseCache.get(id);
}

// All skeleton bones under a loaded scene (first skeleton wins — the
// Studio exports carry exactly one skinned mesh per character).
function collectBones(root) {
  let bones = [];
  root.traverse((o) => {
    if (!bones.length && o.isSkinnedMesh && o.skeleton) bones = o.skeleton.bones;
  });
  return bones;
}

function dressAndNormalize(model, entry) {
  const mat = new THREE.MeshStandardMaterial({
    color: entry.tint !== undefined ? entry.tint : 0x333333,
    roughness: entry.roughness !== undefined ? entry.roughness : 0.9,
  });
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = mat;
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds move with the pose
    }
  });
  const holder = new THREE.Group();
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const bySpan = entry.scaleBasis === 'span';
  const extent = bySpan ? Math.max(size.x, size.z) : size.y;
  const target = bySpan ? entry.spanUnits : entry.heightUnits;
  const k = extent > 0 && target ? target / extent : 1;
  model.scale.multiplyScalar(k);
  holder.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(holder);
  const center = box2.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box2.min.y;
  return holder;
}

export async function instantiateHawkins(id, opts = {}) {
  const entry = hawkinsModel(id);
  if (!entry || !entry.file) return null;
  const base = await loadBase(id);
  if (!base) return null;

  const model = skeletonClone(base);
  const inner = dressAndNormalize(model, entry);
  const group = new THREE.Group(); // engine-positioned
  const bob = new THREE.Group();   // driver root offsets live here
  bob.add(inner);
  group.add(bob);

  const bones = collectBones(model);
  const jointNames = bones.map((b) => b.name);
  let update = null;
  let animated = true; // humanoid pose drivers always animate

  if (entry.role === 'creature') {
    // Generic 'Other'-dialect rigs (Demo-bats, Mind Flayer): flap if
    // the rig has wings, sway its chains either way. When neither
    // resolves, update stays null and the caller animates the mesh
    // itself, exactly as the procedural bodies do today.
    const resolved = resolveCreatureJoints(jointNames);
    const flap = createFlapDriver(pickBones(bones, resolved.wings), { hz: 2.6, amp: 0.65 });
    const swayBones = pickBones(bones, resolved.sway);
    const sway = createSwayDriver(swayBones, {
      amp: id === 'demobats' ? 0.04 : 0.06, hz: 0.4,
    });
    animated = !!(flap || swayBones.length);
    update = (t, state) => {
      if (flap) flap.update(t, (state && state.phase) || 0);
      sway.update(t);
    };
  } else {
    const resolved = resolveHawkinsJoints(jointNames);
    const jointObjs = buildJointObjects(bones, resolved);
    const personality = HAWKINS_PERSONALITIES[id] || HAWKINS_PERSONALITIES.generic;
    const driver = createPoseDriver(jointObjs, personality);
    const bobScale = (entry.heightUnits || 13.5) / 13.5;
    update = (t, state) => {
      const out = driver.update(t, state || { mode: 'idle' });
      bob.position.y = out.bobY * bobScale;
      bob.rotation.z = out.rollZ;
    };
  }

  return {
    group,
    entry,
    joints: jointNames,
    animated,
    update,
    dispose() {
      // Only the per-instance tint material is ours to release — the
      // clone's geometries are shared with the cached base scene and
      // must outlive any single instance (three re-uploads GPU buffers
      // on demand regardless; the base is never disposed here).
      group.traverse((o) => {
        if (o.material) o.material.dispose();
      });
    },
  };
}

// Warm the download cache for a manifest id (menu-time prefetch).
export function prefetchHawkins(id) {
  const entry = hawkinsModel(id);
  if (entry && entry.file) fetchBuffer(entry.file).catch(() => {});
}
