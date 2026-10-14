// lib/characters/character-glb.js
//
// WAVE 0 — the 3D half of the shared embodiment module
// (characters-everywhere-plan.md §3). Generalizes Kombat's Step 6
// GLB machinery to characterId keying for NON-Kombat scenes,
// WITHOUT forking it: loading, the per-URL buffer cache, the
// Meshopt decoder, the code pose driver, the per-fighter floor
// margins and the floor-law wrapper are all Kombat's own
// (lib/kombat/glb-fighter.js), reached through the bridge's
// kombatId, which the read model (lib/characters/embodiment.js)
// resolves from any characterId. Kombat's behaviour is untouched.
//
// The contract every surface adapter gets (plan §3):
//
//   prefetchCharacterGlbs(ids)   warm the shared cache early
//   attachCharacterGlb(opts)  -> handle | null
//     handle.group             add this to your scene at the floor
//     handle.kind              'glb' | 'billboard'
//     handle.ready             Promise<boolean> (GLB parsed+posed)
//     handle.isReady()         the real model is on stage
//     handle.isLiveGlb()       ready AND a live model (not a card)
//     handle.update(pose, dt, now, ctx)   per-frame pose + floor
//     handle.dispose()         frees geometry/textures + the slot
//
// FALLBACK IS THE NATIVE BODY, NEVER A HOLE: a null handle (unknown
// character, no glbUrl) and a not-yet-ready handle both mean "keep
// your existing figure (capsule, cone, procedural build) visible";
// hide it only when isReady() turns true. A failed load leaves
// ready=false forever — the native body simply stays.
//
// POSES: surfaces speak a small vocabulary — 'idle', 'walk', 'run' —
// mapped onto the pose driver's gaits, which are driven by each
// character's own movement profile (Jason stalks, raptors lope,
// Slimer floats — the driver + movementProfile do that work). Any
// other driver pose ('block', 'win', ...) passes through untouched,
// so a surface may use more of the vocabulary when it grows one.
//
// FLOOR LAW: the driver wrapper's lift is always >= 0 and the model
// is bind-normalized onto the plane inside glb-fighter; on top of
// that, every update() runs the shared floor clamp
// (lib/kombat/floor.js) over the handle root, so a surface that
// positions the group can never push it through the floor either.
//
// PRESENCE CAP: live GLBs are metered by a slot registry
// (lib/characters/glb-slots.js, default cap 4 per scene). Beyond the
// cap, attach returns a BILLBOARD handle instead: the character's
// preview image on a floor-anchored sprite — present and named at a
// glance, at a fraction of the GPU cost. Presence surfaces with
// several instances of the same character MUST pass a per-instance
// slotKey (e.g. the user id): the default key is the characterId,
// which would let two Slimers share one slot count.

import * as THREE from 'three';
import { attachGlbFighter, prefetchFighterGlbs } from '../kombat/glb-fighter.js';
import { applyFloorClamp } from '../kombat/floor.js';
import { getEmbodiment } from './embodiment.js';
import { createGlbSlotRegistry, sharedGlbSlots } from './glb-slots.js';

/** Poses the Kombat pose driver implements (pose-driver.js). */
export const DRIVER_POSES = new Set([
  'idle', 'walk', 'punch', 'kick', 'special', 'block', 'hit', 'win', 'ko',
]);

/** Map a surface pose request onto the driver vocabulary. 'run' is
 *  the walk gait (the surface's own speed lives in its movement
 *  code; the profile sets the cadence) — anything unknown reads as
 *  idle, never as a crash or a leaked combat pose. */
export function toDriverPose(pose) {
  if (pose === 'run') return 'walk';
  return DRIVER_POSES.has(pose) ? pose : 'idle';
}

/** Warm the shared GLB cache for characterIds (scene load, lobby,
 *  versus-splash equivalents). Fire-and-forget safe. */
export function prefetchCharacterGlbs(characterIds) {
  const kombatIds = [];
  for (const id of characterIds || []) {
    const e = getEmbodiment(id);
    if (e && e.kombatId && e.glbUrl) kombatIds.push(e.kombatId);
  }
  if (kombatIds.length) prefetchFighterGlbs(kombatIds);
}

function makeBillboardHandle(embodiment, procSize, slotKey) {
  const group = new THREE.Group();
  group.name = `character-billboard-${embodiment.id}`;
  const height = procSize && procSize.y > 0 ? procSize.y : 1.9;
  let map = null;
  try {
    map = new THREE.TextureLoader().load(embodiment.preview);
    map.colorSpace = THREE.SRGBColorSpace;
  } catch {
    map = null; // no DOM (headless) — the sprite still stands
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial(map ? { map, transparent: true } : { transparent: true }),
  );
  sprite.center.set(0.5, 0); // bottom-center anchor: stands ON the floor
  sprite.scale.set(height, height, 1);
  group.add(sprite);
  let disposed = false;
  return {
    characterId: embodiment.id,
    kind: 'billboard',
    group,
    ready: Promise.resolve(true),
    isReady() { return true; },
    isLiveGlb() { return false; },
    update(pose, dt, now) {
      if (disposed) return;
      // a living presence, not a statue: a breath of a bob, and the
      // floor law over the root like every other embodiment
      sprite.position.y = Math.max(0, Math.sin((now || 0) * 1.6) * 0.03);
      applyFloorClamp(group);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (map) map.dispose();
      sprite.material.dispose();
    },
    _slotKey: slotKey,
  };
}

/**
 * Attach a character embodiment under a fresh group.
 * @param opts.characterId  roster characterId
 * @param opts.procSize     measured size {x,y,z} of the surface's
 *   native figure — the GLB takes its footprint, so the swap never
 *   changes the surface's sense of scale. Omit to use the Kombat
 *   default stature (or the scale-class defaults in embodiment.js).
 * @param opts.registry     slot registry for the scene (default:
 *   the shared registry, cap 4)
 * @param opts.slotKey      cap key (default: characterId; presence
 *   scenes pass a per-instance key)
 * @returns handle | null (null = no embodiment exists; keep the
 *   native figure)
 */
export function attachCharacterGlb(opts) {
  const o = opts || {};
  const embodiment = getEmbodiment(o.characterId);
  if (!embodiment || !embodiment.glbUrl || !embodiment.kombatId) return null;
  const registry = o.registry || sharedGlbSlots;
  const slotKey = o.slotKey || embodiment.id;

  if (!registry.acquire(slotKey)) {
    return makeBillboardHandle(embodiment, o.procSize, slotKey);
  }

  const inner = attachGlbFighter({
    kombatId: embodiment.kombatId,
    procSize: o.procSize,
  });
  if (!inner) {
    registry.release(slotKey);
    return null;
  }

  let disposed = false;
  return {
    characterId: embodiment.id,
    kind: 'glb',
    group: inner.group,
    ready: inner.ready,
    isReady() { return inner.isReady(); },
    isLiveGlb() { return inner.isReady(); },
    update(pose, dt, now, ctx) {
      if (disposed) return;
      inner.update(toDriverPose(pose), dt, now, ctx || {});
      applyFloorClamp(inner.group);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      inner.dispose();
      registry.release(slotKey);
    },
    _slotKey: slotKey,
  };
}

/**
 * Convenience for presence scenes: one object holding the scene's
 * own slot registry plus bound attach/prefetch, so a hall of users
 * shares one cap without threading the registry through every call.
 */
export function createEmbodimentScene(opts) {
  const o = opts || {};
  const registry = o.registry || createGlbSlotRegistry(o.maxLiveGlb);
  return {
    registry,
    attach(attachOpts) {
      return attachCharacterGlb({ ...(attachOpts || {}), registry });
    },
    prefetch: prefetchCharacterGlbs,
  };
}
