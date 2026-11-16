// lib/dino-companion.js
// THE DINO COMPANION (Merlin, 2026-11-14): a raised dino that
// rides in the backpack and spawns next to its user in ANY realm
// the backpack lives in. Realms WITHOUT ally machinery
// (Middle-earth, Hollow Earth) use this module: spawn the dino
// beside the walker, follow at heel, send it back to the
// backpack. Earth 2 keeps its own allies (combat, growth
// tick, sanctuary, home copies on the land) and does NOT use
// this module for following — it only shares the backpack
// record (the dino item) with it.
//
// The record is the truth in every realm: the backpack item's
// state ('out' | 'pack') decides what renders — the backpack
// IS home (Merlin, 2026-11-14), so there is no third state.
// A realm mounts, restores its 'out' dinos beside the walker;
// unmount disposes the meshes; the item keeps its state, so
// the dino follows its user across realms instead of dying
// at the door. Home copies on the land are Earth-2-only and
// live outside this module.
//
// Three.js arrives through dynamic import only (the Earth 2
// scene's own pattern), so importing this module never pulls
// three into a server bundle. The walker shape is the shared
// walk-controls one: { pos: { x, z } }.

import {
  EARTH2_MODEL_BY_SLUG,
} from './earth2/models.js';
import {
  babyModelPath,
  growthT,
  uniformScaleAt,
  rigScalesFor,
  allyMoveDecision,
} from './earth2/breeding.js';

/** Find the THREE.Skeleton in a loaded dino GLB. */
function findSkeleton(modelScene) {
  let skeleton = null;
  modelScene.traverse((obj) => {
    if (!skeleton && obj.isSkinnedMesh && obj.skeleton) {
      skeleton = obj.skeleton;
    }
  });
  return skeleton;
}

/** Free a companion's meshes (geometry + materials). */
function disposeGraph(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (m && typeof m.dispose === 'function') m.dispose();
    }
  });
}

/**
 * Spawn a raised dino beside the walker.
 *   scene, walker, groundHeight: the realm's own (walker.pos.x/z).
 *   species, bornAt: the dino. dinoId: the stable record id.
 * Returns a handle { dinoId, species, root, update(dt), dispose() },
 * or null when no model could load.
 */
export async function spawnCompanion({ scene, walker, groundHeight, species, bornAt, dinoId, groundPoint, groundUp }) {
  const wx = walker && walker.pos ? walker.pos.x : walker ? walker.x : 0;
  const wz = walker && walker.pos ? walker.pos.z : walker ? walker.z : 0;
  const entry = EARTH2_MODEL_BY_SLUG.get(species);
  const adultScaleM = entry && entry.scaleM ? Number(entry.scaleM) : 5;
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let modelScene = null;
  try {
    const gltf = await loader.loadAsync(babyModelPath(species));
    modelScene = gltf.scene;
  } catch {
    // No baby GLB — fall back to the adult, scaled down.
    if (entry && entry.file) {
      try {
        const gltf = await loader.loadAsync(entry.file);
        modelScene = gltf.scene;
      } catch { /* no model at all */ }
    }
  }
  if (!modelScene) return null;
  const skeleton = findSkeleton(modelScene);
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(modelScene);
  root.add(spin);
  const applyGrowth = () => {
    const t = growthT(bornAt, Date.now());
    root.scale.setScalar(uniformScaleAt(t, adultScaleM) / adultScaleM);
    if (skeleton) {
      const names = skeleton.bones.map((b) => b.name);
      const scales = rigScalesFor(names, t);
      for (const bone of skeleton.bones) {
        const s = scales[bone.name] || 1;
        bone.scale.set(s, s, s);
      }
    }
  };
  applyGrowth();
  const sx = wx + 2;
  const sz = wz + 2;
  const sy = typeof groundHeight === 'function' ? groundHeight(sx, sz) : 0;
  // SPHERE PROJECTION (Nov 16 inner sphere): with a groundPoint
  // opt the dino stands on its ground point with its +Y on the
  // local up; without it the flat placement stands, exactly as
  // the other realms (and the source-pinned tests) expect.
  if (typeof groundPoint === 'function') {
    const gp = groundPoint(sx, sz, 0);
    root.position.set(gp.x, gp.y, gp.z);
    const u = typeof groundUp === 'function' ? groundUp(sx, sz) : { x: 0, y: 1, z: 0 };
    root.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(u.x, u.y, u.z).normalize(),
    );
  } else {
    root.position.set(sx, sy, sz);
  }
  scene.add(root);
  // The dino's DECK position, tracked apart from its 3D root:
  // on a sphere the root sits at a 3D point, and the follow law
  // (allyMoveDecision) runs in deck space — reading the root's
  // x/z as deck coordinates would strand it past the rim.
  let deckX = sx;
  let deckZ = sz;
  let growthAge = 0;
  // The walker's position is read LIVE on every update — the
  // spawn-time snapshot is only for the first placement.
  const walkerPos = () => {
    if (!walker) return { x: 0, z: 0 };
    if (walker.pos) return { x: walker.pos.x, z: walker.pos.z };
    return { x: walker.x || 0, z: walker.z || 0 };
  };
  const handle = {
    dinoId: dinoId || null,
    species,
    root,
    update(dt) {
      // Growth, slowly: re-apply the rig scales every ~10 s.
      growthAge += dt;
      if (growthAge >= 10) {
        growthAge = 0;
        applyGrowth();
      }
      const { x: wxx, z: wzz } = walkerPos();
      const ax = deckX;
      const az = deckZ;
      const decision = allyMoveDecision(ax, az, wxx, wzz);
      if (decision === 'idle') return;
      const dx = wxx - ax;
      const dz = wzz - az;
      const d = Math.hypot(dx, dz) || 1;
      const speed = decision === 'return' ? 9 : 5; // hurry back, else trot
      const step = Math.min(d, speed * dt);
      const nx = ax + (dx / d) * step;
      const nz = az + (dz / d) * step;
      deckX = nx;
      deckZ = nz;
      const heading = Math.atan2(dx, dz);
      if (typeof groundPoint === 'function') {
        // Deck-space follow, sphere-space feet: the new deck
        // point projects onto the shell, and the dino stands
        // on its local up with its +Z on the deck heading.
        const gp = groundPoint(nx, nz, 0);
        root.position.set(gp.x, gp.y, gp.z);
        const u = typeof groundUp === 'function' ? groundUp(nx, nz) : { x: 0, y: 1, z: 0 };
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(u.x, u.y, u.z).normalize());
        const yaw = new THREE.Quaternion();
        yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
        root.quaternion.copy(q).multiply(yaw);
      } else {
        const ny = typeof groundHeight === 'function' ? groundHeight(nx, nz) : root.position.y;
        root.position.set(nx, ny, nz);
        root.rotation.y = heading;
      }
    },
    dispose() {
      scene.remove(root);
      disposeGraph(root);
    },
  };
  return handle;
}

/** Step every live companion one frame; drops disposed handles. */
export function updateCompanions(handles, dt) {
  if (!Array.isArray(handles)) return handles;
  for (let i = handles.length - 1; i >= 0; i--) {
    const h = handles[i];
    if (!h || typeof h.update !== 'function') {
      handles.splice(i, 1);
      continue;
    }
    h.update(dt);
  }
  return handles;
}

/** Remove one companion by dino id (recall / summon-again). */
export function removeCompanion(handles, dinoId) {
  if (!Array.isArray(handles)) return null;
  const idx = handles.findIndex((h) => h && h.dinoId === dinoId);
  if (idx < 0) return null;
  const [handle] = handles.splice(idx, 1);
  handle.dispose();
  return handle;
}

/** True when a companion for this dino is already walking. */
export function hasCompanion(handles, dinoId) {
  return Array.isArray(handles) && handles.some((h) => h && h.dinoId === dinoId);
}
