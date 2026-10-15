// lib/kombat/glb-fighter.js
//
// STEP 6 — the GLB rendering swap. Loads each fighter's optimized
// Tripo GLB from its bridge glbUrl (lib/kombat/loadouts.js) and mounts
// the REAL model inside the fighter's rig root, posed by the code
// pose driver (lib/kombat/pose-driver.js). The procedural body stays
// as the stand-in/fallback: it renders while the GLB loads, forever
// if the load fails, and for fighters with no glbUrl.
//
// Group contract (the engines position/rotate f.rig as always):
//   f.rig (engine-owned procedural root)
//     └─ handle.group          (this module; added by the engine)
//          └─ liftGroup        driver lift (floor law: never < 0).
//                              ABOVE the fall on purpose: lift must
//                              act in un-fallen space — below the
//                              fall rotation it would push the body
//                              along the fallen axis instead of up
//                              (measured in the Step 6 proof pass).
//             └─ fallGroup     knockdown fall rotation (driver
//                              eased). In rig-root space (the body
//                              faces +Z here): back-fall is
//                              rotation.x, side-fall rotation.z.
//                └─ yawGroup   rotation.y = -PI/2 — GLB models face
//                              +X; rig roots are oriented for a +Z
//                              facing body, so this quarter-turn
//                              makes engine facing math work
//                              unchanged
//                   └─ model   normalized so bind min.y = 0 and the
//                              bind center x/z sit on the origin
//
// Scale: the model takes the procedural rig's measured footprint, so
// the swap never changes the game's sense of a fighter's size —
// height-based for upright fighters; horizontal creatures (T-Rex,
// raptors) scale by body length instead.
//
// Loading: one shared GLTFLoader with the MeshoptDecoder the
// optimized GLBs require (EXT_meshopt_compression); ArrayBuffers are
// cached per URL so mirror matches parse independently from one
// download. prefetchFighterGlbs() warms the cache during the versus
// splash.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { getLoadout } from './loadouts.js';
import { rigManifestFor } from './rig-manifest.js';
import {
  createPoseDriver, movementProfile, rigKindFor, CREATURE_TABLES,
} from './pose-driver.js';

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

/**
 * Warm the GLB cache for a set of roster ids (kombatIds). Called
 * during the versus splash so models are parsed (or nearly) by the
 * time the fight starts. Fire-and-forget safe.
 */
// Whether the fighter has a hosted GLB at all. Pages use it to arm
// the "summoning" state before an engine exists (the round-1 model
// gate lives in the engines; the poster/overlay lives in the page).
export function fighterHasGlb(kombatId) {
  const loadout = getLoadout(kombatId);
  return !!(loadout && loadout.glbUrl);
}

export function prefetchFighterGlbs(kombatIds) {
  for (const id of kombatIds || []) {
    const loadout = getLoadout(id);
    if (loadout && loadout.glbUrl) {
      fetchBuffer(loadout.glbUrl).catch(() => {});
    }
  }
}

/**
 * Attach a fighter's GLB under its rig root.
 * @param opts.kombatId   roster id (bridge lookup happens here)
 * @param opts.procSize   measured size {x,y,z} of the procedural rig
 *                        (the swap preserves the game's scale read)
 * @returns handle { group, ready: Promise<boolean>, isReady(),
 *                   update(pose, dt, now, ctx), dispose() } | null
 *                   (null when the fighter has no glbUrl at all)
 */
export function attachGlbFighter({ kombatId, procSize }) {
  const loadout = getLoadout(kombatId);
  if (!loadout || !loadout.glbUrl) return null;

  const group = new THREE.Group();
  group.name = `glb-${kombatId}`;
  const liftGroup = new THREE.Group();
  const fallGroup = new THREE.Group();
  const yawGroup = new THREE.Group();
  yawGroup.rotation.y = -Math.PI / 2;
  group.add(liftGroup);
  liftGroup.add(fallGroup);
  fallGroup.add(yawGroup);

  const handle = {
    group,
    ready: null,
    _ready: false,
    _driver: null,
    _fallKind: 'back',
    isReady() { return handle._ready; },
    update(pose, dt, now, ctx) {
      if (!handle._ready || !handle._driver) return;
      const out = handle._driver.apply(pose, dt, now, ctx || {});
      liftGroup.position.y = Math.max(0, out.lift);
      const ang = out.fall * (Math.PI / 2 - 0.14);
      // rig-root space (body faces +Z here): back-fall tips the top
      // toward -Z (rotation.x negative); side-fall rolls over ±X.
      if (handle._fallKind === 'side') {
        fallGroup.rotation.z = ang;
        fallGroup.rotation.x = 0;
      } else {
        fallGroup.rotation.x = -ang;
        fallGroup.rotation.z = 0;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            for (const k of Object.keys(m)) {
              if (m[k] && m[k].isTexture) m[k].dispose();
            }
            m.dispose();
          }
        }
      });
    },
  };

  handle.ready = (async () => {
    try {
      const buf = await fetchBuffer(loadout.glbUrl);
      const gltf = await getLoader().parseAsync(buf.slice(0), '');
      const model = gltf.scene;
      if (!model) throw new Error('empty GLB scene');

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      if (!(size.y > 0)) throw new Error('degenerate GLB bounds');

      // Collect bones by their (already three-sanitized) names.
      const bones = new Map();
      let jointCount = 0;
      model.traverse((o) => {
        if (o.isBone) { bones.set(o.name, o); jointCount++; }
      });

      const kind = rigKindFor(loadout, jointCount);
      const table = kind === 'creature' ? CREATURE_TABLES[loadout.characterId] : null;
      handle._fallKind = kind === 'creature' ? (table && table.fall) || 'side' : 'back';

      // Scale: preserve the procedural rig's footprint.
      let scale;
      if (kind === 'creature' && handle._fallKind === 'side' && size.x > 0) {
        const targetLen = Math.min(3.0, Math.max(1.7, 0.95 * (procSize ? procSize.y : 2)));
        scale = targetLen / size.x;
      } else {
        scale = (procSize ? procSize.y : 1.9) / size.y;
      }
      model.scale.setScalar(scale);
      // Normalize: feet ON the floor plane, body centered on origin.
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      yawGroup.add(model);

      const weapon = loadout.weapon;
      handle._driver = createPoseDriver({
        kind,
        bones,
        table,
        profile: movementProfile(loadout),
        // the bridge records the hand as prose ("right hand",
        // "left hand", "both fists") — normalize to the driver's L/R
        weaponSide: weapon && /left/i.test(weapon.hand) ? 'L' : 'R',
        dualWield: !!loadout.dualWield,
        size: { x: size.x * scale, y: size.y * scale, z: size.z * scale },
        meshGroup: kind === 'rigless' ? model : null,
        // floor law: this fighter's measured per-pose margins
        floorMargins: (rigManifestFor(loadout.characterId) || {}).floorMargins || null,
      });
      handle._ready = true;
      return true;
    } catch (err) {
      // Fallback law: any failure leaves the procedural body in
      // place; the handle simply never becomes ready.
      handle._failed = true;
      return false;
    }
  })();

  return handle;
}
