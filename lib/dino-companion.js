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
// THE RECORD is the truth in every realm: the backpack item's
// state ('out' | 'pack') decides what renders — the backpack
// IS home (Merlin, 2026-11-14), so there is no third state.
// A realm mounts, restores its 'out' dinos beside the walker;
// unmount disposes the meshes; the item keeps its state, so
// the dino follows its user across realms instead of dying
// at the door. Home copies on the land are Earth-2-only and
// live outside this module.
//
// COMBAT + XP (Merlin, 2026-11-26): raised dinos help hunt.
// The dino is an agent (lib/dino-companion-agent.js, on the
// shared character-agent runner): it picks a target, closes,
// and throws the agent's pick of bite / tail / stomp / charge.
// Hunting earns XP on the backpack record (lib/dino-xp.js);
// higher level = more savage. The agent reports dinoHit
// events — the realm engine applies the damage and awards
// the XP, the agent never kills anything itself.
//
// SPAWN SCALE (fixed Nov 26, from the video-watcher's frames):
// the old growth line divided the target size by the adult
// scaleM for EVERY model — right for the adult GLB (which
// loads at adult size) but wrong for the baby GLBs, which
// Tripo ships unit-normalized (longest axis exactly 1 m).
// A newborn triceratops rendered 14 cm tall; an adult never
// passed 1 m, because this module never swaps to the adult
// model the way Earth 2 does. The divisor is now the loaded
// model's own bind length: 1 for a baby GLB, adultScaleM for
// the adult fallback — a newborn renders 1.2 m, an adult its
// full species length. (The T. rex in the video loads the
// adult fallback — baby-tyrannosaurus-rex.glb does not exist
// under the registry slug, the file is baby-tyrannosaurus.glb
// — so its spawn was always correctly scaled; it read tiny
// because it was a recent hatch, dark, and unmarked.)
// VISIBILITY: the companion now wears a small gold marker
// above it (the orc hunt marker's pattern, fog-proof) so a
// dark baby on Mordor's black ground can actually be found.
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
  growthStage,
  uniformScaleAt,
  rigScalesFor,
  allyMoveDecision,
} from './earth2/breeding.js';
import {
  createCompanionAgent,
  classifyDinoBones,
  attackPoseFor,
  ATTACK_ANIM_S,
} from './dino-companion-agent.js';
import {
  awardXp as awardDinoXp,
} from './dino-xp.js';

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

/** Left / right side of a leg bone, for the run-cycle split. */
function legSide(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('left') || /(^|_)l_/.test(n)) return 'left';
  if (n.includes('right') || /(^|_)r_/.test(n)) return 'right';
  return null;
}

/**
 * Spawn a raised dino beside the walker.
 *   scene, walker, groundHeight: the realm's own (walker.pos.x/z).
 *   species, bornAt: the dino. dinoId: the stable record id.
 *   level, xp: from the backpack record (defaults read the record).
 *   onXp(dinoId, xp, level, leveledUp, levelsGained): the page
 *   persists the new total onto the backpack record.
 * Returns a handle { dinoId, species, root, entity, xp, level,
 * update(dt, ctx), awardXp(amount), dispose() }, or null when
 * no model could load. ctx (optional, per frame) is the hunt
 * context { hostiles, ownerTarget, attacker, ownerId, onEvent }
 * — without it the dino follows at heel only, exactly as
 * before (Hollow Earth passes none).
 */
export async function spawnCompanion({ scene, walker, groundHeight, species, bornAt, dinoId, groundPoint, groundUp, level, xp, onXp }) {
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
  let babyModel = false;
  try {
    const gltf = await loader.loadAsync(babyModelPath(species));
    modelScene = gltf.scene;
    babyModel = true;
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
  // The bind length the growth scale divides by: a baby GLB is
  // unit-normalized (longest axis 1 m), an adult GLB loads at
  // its full species length. The old code divided by
  // adultScaleM either way — baby-GLB species never grew past
  // 1 m (see the header note).
  const bindLengthM = babyModel ? 1 : adultScaleM;
  const skeleton = findSkeleton(modelScene);
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(modelScene);
  root.add(spin);
  // The bones the agent's attacks drive (jaw/head/neck, spine/
  // hips, legs), with each bone's bind rotation saved — attack
  // poses ADD to the bind pose, they never overwrite it.
  const boneParts = skeleton ? classifyDinoBones(skeleton.bones.map((b) => b.name)) : null;
  const boneBase = new Map();
  if (skeleton) {
    for (const bone of skeleton.bones) {
      boneBase.set(bone.name, { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z });
    }
  }
  const applyAttackPose = () => {
    if (!skeleton || !boneParts) return;
    const kind = handle.entity.attackKind;
    const animT = handle.entity.attackAnimT;
    const phase = animT > 0 ? 1 - animT / ATTACK_ANIM_S : 0;
    const pose = animT > 0 ? attackPoseFor(kind, phase) : null;
    const setGroup = (names, delta, flip) => {
      if (!delta) return;
      for (const name of names || []) {
        const bone = skeleton.bones.find((b) => b.name === name);
        const base = boneBase.get(name);
        if (!bone || !base) continue;
        const f = flip ? -1 : 1;
        bone.rotation.set(base.x + delta.x * f, base.y + delta.y * f, base.z + delta.z * f);
      }
    };
    // Head/neck/spine/hips take the pose straight; legs split
    // left/right so the charge run cycle alternates sides.
    setGroup(boneParts.jaw, pose && pose.jaw);
    setGroup(boneParts.head, pose && pose.head);
    setGroup(boneParts.neck, pose && pose.neck);
    setGroup(boneParts.spine, pose && pose.spine);
    setGroup(boneParts.hips, pose && pose.hips);
    const legs = boneParts.legs || [];
    const leftLegs = legs.filter((n) => legSide(n) !== 'right');
    const rightLegs = legs.filter((n) => legSide(n) === 'right');
    const legDelta = pose && pose.legs;
    if (kind === 'charge' && legDelta) {
      setGroup(leftLegs, legDelta, false);
      setGroup(rightLegs, legDelta, true);
    } else {
      setGroup(legs, legDelta, false);
    }
  };
  const applyGrowth = () => {
    const t = growthT(bornAt, Date.now());
    root.scale.setScalar(uniformScaleAt(t, adultScaleM) / bindLengthM);
    if (skeleton) {
      const names = skeleton.bones.map((b) => b.name);
      const scales = rigScalesFor(names, t);
      for (const bone of skeleton.bones) {
        const s = scales[bone.name] || 1;
        bone.scale.set(s, s, s);
      }
    }
    handle.entity.stage = growthStage(bornAt, Date.now());
  };
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
  // The gold marker: a small fog-proof diamond above the dino,
  // the orc hunt marker's pattern — a dark baby on Mordor's
  // black ground is otherwise unfindable. It rides the scene
  // (not the scaled root) so it stays the same size at any age.
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.85, fog: false, depthWrite: false }),
  );
  marker.name = 'companion-marker';
  scene.add(marker);
  const markerUp = new THREE.Vector3();
  const placeMarker = () => {
    const t = growthT(bornAt, Date.now());
    const height = uniformScaleAt(t, adultScaleM) * 0.5 + 1.0;
    markerUp.set(0, 1, 0).applyQuaternion(root.quaternion);
    marker.position.set(
      root.position.x + markerUp.x * height,
      root.position.y + markerUp.y * height,
      root.position.z + markerUp.z * height,
    );
    marker.rotation.y += 0.01;
  };
  // The dino's DECK position, tracked apart from its 3D root:
  // on a sphere the root sits at a 3D point, and the follow law
  // (allyMoveDecision) runs in deck space — reading the root's
  // x/z as deck coordinates would strand it past the rim.
  // The agent owns the entity: mode/timers live on it, exactly
  // as the shared character-agent rule demands.
  const handle = {
    dinoId: dinoId || null,
    species,
    root,
    marker,
    xp: xp != null ? Math.max(0, Math.floor(Number(xp) || 0)) : 0,
    level: level != null ? Math.max(1, Math.floor(Number(level) || 1)) : 1,
    entity: {
      x: sx, z: sz, heading: 0, speed: 5,
      mode: 'heel', attackT: 0, targetId: null,
      level: level != null ? Math.max(1, Math.floor(Number(level) || 1)) : 1,
      stage: growthStage(bornAt, Date.now()),
      diet: (entry && entry.diet) || 'carnivore',
      posture: (entry && entry.posture) || 'biped',
      attackKind: null, attackAnimT: 0,
    },
    awardXp(amount) {
      const res = awardDinoXp({ xp: handle.xp, level: handle.level }, amount);
      handle.xp = res.xp;
      handle.level = res.level;
      handle.entity.level = res.level;
      if (typeof onXp === 'function') {
        try { onXp(handle.dinoId, res.xp, res.level, res.leveledUp, res.levelsGained); } catch { /* pack unavailable */ }
      }
      return res;
    },
    update(dt, ctx) {
      // Growth, slowly: re-apply the rig scales every ~10 s.
      growthAge += dt;
      if (growthAge >= 10) {
        growthAge = 0;
        applyGrowth();
      }
      // The attack pose ticks down every frame, hunt or not.
      if (handle.entity.attackAnimT > 0) {
        handle.entity.attackAnimT = Math.max(0, handle.entity.attackAnimT - dt);
        if (handle.entity.attackAnimT <= 0) handle.entity.attackKind = null;
      }
      const { x: wxx, z: wzz } = walkerPos();
      if (ctx && ctx.hostiles) {
        // HUNT: the agent drives — perceive, decide, act — and
        // reports dinoHit events for the realm engine to apply.
        const events = agent.step({
          dino: handle.entity,
          owner: { x: wxx, z: wzz },
          ownerId: ctx.ownerId || 'owner',
          ownerTarget: ctx.ownerTarget || null,
          attacker: ctx.attacker || null,
          hostiles: ctx.hostiles,
        }, dt);
        if (typeof ctx.onEvent === 'function') {
          for (const ev of events || []) {
            try { ctx.onEvent(ev); } catch { /* the engine decides */ }
          }
        }
        placeDeck(handle.entity.x, handle.entity.z, handle.entity.heading);
      } else {
        // HEEL ONLY (no hunt context — Hollow Earth): the old
        // follow law, untouched.
        const ax = handle.entity.x;
        const az = handle.entity.z;
        const decision = allyMoveDecision(ax, az, wxx, wzz);
        if (decision === 'idle') { placeMarker(); applyAttackPose(); return; }
        const dx = wxx - ax;
        const dz = wzz - az;
        const d = Math.hypot(dx, dz) || 1;
        const speed = decision === 'return' ? 9 : 5; // hurry back, else trot
        const step = Math.min(d, speed * dt);
        const nx = ax + (dx / d) * step;
        const nz = az + (dz / d) * step;
        handle.entity.x = nx;
        handle.entity.z = nz;
        handle.entity.heading = Math.atan2(dx, dz);
        placeDeck(nx, nz, handle.entity.heading);
      }
      placeMarker();
      applyAttackPose();
    },
    dispose() {
      scene.remove(root);
      scene.remove(marker);
      disposeGraph(root);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
    },
  };
  // applyGrowth + the agent need the handle, so they close over
  // it after construction: run the first growth pass now.
  let growthAge = 0;
  const agent = createCompanionAgent({ dinoId: handle.dinoId, species });
  // The walker's position is read LIVE on every update — the
  // spawn-time snapshot is only for the first placement.
  const walkerPos = () => {
    if (!walker) return { x: 0, z: 0 };
    if (walker.pos) return { x: walker.pos.x, z: walker.pos.z };
    return { x: walker.x || 0, z: walker.z || 0 };
  };
  const placeDeck = (nx, nz, heading) => {
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
  };
  // First growth pass: the dino spawns at its true size, with
  // the record's XP/level when the caller passed them (else
  // level 1 — a fresh hatch with no XP yet).
  if (xp == null && level == null) {
    handle.xp = 0;
    handle.level = 1;
    handle.entity.level = 1;
  }
  applyGrowth();
  placeMarker();
  return handle;
}

/** Step every live companion one frame; drops disposed handles.
 *  ctx (optional) is the hunt context, passed to each handle. */
export function updateCompanions(handles, dt, ctx) {
  if (!Array.isArray(handles)) return handles;
  for (let i = handles.length - 1; i >= 0; i--) {
    const h = handles[i];
    if (!h || typeof h.update !== 'function') {
      handles.splice(i, 1);
      continue;
    }
    h.update(dt, ctx);
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
