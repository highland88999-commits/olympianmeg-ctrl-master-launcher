// lib/gta/walker-embodiment.js
//
// WAVE 1 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the SHARED
// walker adapter for the three GTA open worlds (Mega City, Truman,
// Babel district). All three walk the same logic body
// (lib/gta/player.js: createPlayer/updatePlayer) and render it the
// same way — a CapsuleGeometry(0.5, 1.0) mesh repositioned every
// frame at (player.x, player.y + 1.0, player.z) — so ONE adapter at
// this shared layer embodies all three; each world's gta-scene.js
// only calls it (same contract, three thin call sites). Nothing
// about world physics, collision or gameplay changes: the capsule's
// logic body (radius 0.6 in lib/gta/player.js) is untouched, and
// the capsule mesh stays as the native figure.
//
// What the adapter does:
//   - resolves the walker's character through the Wave 0 pick chain
//     (lib/characters/embodiment.js): per-surface override >
//     profile character > null (null = the native capsule, no
//     forced default character);
//   - attaches the character through the Wave 0 3D adapter
//     (lib/characters/character-glb.js) at the capsule's measured
//     footprint, nested under an anchor group the adapter moves;
//   - per frame, maps the world's own movement state onto the pose
//     driver's vocabulary (walk/idle on foot, 'drive' in a
//     vehicle) and returns whether the embodiment is SHOWING —
//     the scene then hides the capsule exactly while the real
//     model stands in for it.
//
// FALLBACK LAW (Wave 0 contract): the capsule stays visible until
// the handle reports ready, and forever if the load fails or the
// character has no glbUrl. The swap is visual only.
//
// FLOOR LAW: the anchor sits at the walker's root — (player.x,
// player.y, player.z), where player.y is the height above the
// ground plane AS THE WORLD DEFINES IT (street level 0 in all
// three worlds; Mega City's subway floor while on a platform; the
// jump arc in between — the player's own physics never lets it go
// below the world's ground). The character handle is a CHILD of
// the anchor, and every handle.update() runs the shared floor
// clamp (lib/kombat/floor.js) over the handle root in anchor-local
// space, so the model's feet can never be pushed below the ground
// plane at the walker's root, whatever the world. The seated
// mount's floor story lives in lib/gta/driver-embodiment.js:
// every driven point of the 'drive' pose lands above the car's
// floor, inside the car's solid envelope.
//
// DRIVING (the follow-up wave, on Wave 6's seated family): while
// the player is in a vehicle, the SAME handle reparents into the
// seat group (lib/gta/driver-embodiment.js owns the mount
// contract) and holds the 'drive' pose, and the anchor pins to
// the vehicle instead of the on-foot root — the character sits
// IN the car. One handle, two homes, decided fresh every frame:
// never two bodies, never none when a pick exists and is ready.
// Without a pick (or before the model is ready, or on a
// billboard stand-in) the native capsule renders exactly as it
// always has, driving included.

import * as THREE from 'three';
import {
  createEmbodimentScene, prefetchCharacterGlbs,
} from '../characters/character-glb.js';
import {
  getEmbodiment, resolveSurfaceCharacter,
} from '../characters/embodiment.js';
import {
  DRIVER_MOUNT, DRIVER_POSE, driverShowing, vehicleMountable,
} from './driver-embodiment.js';

/**
 * Measured footprint {x,y,z} of a THREE.CapsuleGeometry(radius,
 * length): the cylinder section plus a hemisphere at each end.
 * The three worlds' walker capsule is (0.5, 1.0) -> {1, 2, 1}.
 * Garbage dimensions fall back to that capsule's numbers rather
 * than producing a degenerate scale.
 */
export function capsuleProcSize(radius, length) {
  const r = typeof radius === 'number' && Number.isFinite(radius) && radius > 0
    ? radius : 0.5;
  const len = typeof length === 'number' && Number.isFinite(length) && length >= 0
    ? length : 1.0;
  return { x: r * 2, y: len + r * 2, z: r * 2 };
}

/**
 * On-foot pose from the shared player state (lib/gta/player.js):
 * the world's own moving/sprinting flags, nothing invented.
 * Driving is not this function's question — the seated mount
 * holds DRIVER_POSE ('drive') instead; an in-vehicle player
 * still maps here to 'idle' for callers that only walk.
 */
export function walkerPoseFor(player) {
  if (!player || player.inVehicle || !player.moving) return 'idle';
  return player.sprinting ? 'run' : 'walk';
}

/**
 * Whether the embodiment replaces the capsule this frame: a handle
 * exists, its model is ready, and the world is currently showing
 * the on-foot figure (not driving, not world-hidden — e.g. Mega
 * City hides the walker entirely while riding the subway train).
 */
export function walkerShowing(state) {
  const s = state || {};
  return !!(s.hasHandle && s.ready && !s.inVehicle && !s.hidden);
}

/**
 * Create the walker embodiment for one GTA scene.
 * @param opts.scene            the world's THREE.Scene
 * @param opts.surface          pick-chain surface key ('mega-city',
 *                              'truman', 'babel')
 * @param opts.procSize         measured capsule footprint
 *                              (capsuleProcSize) — the GLB takes it
 * @param opts.characterId      explicit initial pick; when the key
 *                              is present (even null) it wins over
 *                              the pick chain. Omit to resolve via
 *                              resolveSurfaceCharacter(surface).
 * @param opts.storage          injectable storage for the pick
 *                              chain (tests / non-window contexts)
 * @param opts.embodimentScene injectable Wave 0 scene (slot
 *                              registry + bound attach); default a
 *                              fresh per-world one
 * @returns adapter { group, seat, update, setCharacter,
 *                    characterId, hasHandle, dispose } — update(
 *                    player, dt, now, { hidden }) returns true
 *                    while the embodiment is showing, on foot OR
 *                    seated in the vehicle (hide the capsule then)
 */
export function createWalkerEmbodiment(opts) {
  const o = opts || {};
  const scene = o.scene && typeof o.scene.add === 'function' ? o.scene : null;
  const surface = typeof o.surface === 'string' ? o.surface : '';
  const procSize = o.procSize || capsuleProcSize(0.5, 1.0);
  const embScene = o.embodimentScene || createEmbodimentScene();

  const anchor = new THREE.Group();
  anchor.name = `walker-embodiment-${surface || 'gta'}`;
  anchor.visible = false;
  if (scene) scene.add(anchor);

  // The driver's seat: a child of the anchor carrying the mount
  // contract's offset (lib/gta/driver-embodiment.js). While
  // driving, the anchor pins to the vehicle and the handle
  // reparents here; on foot the handle rides the anchor root
  // and the seat rides empty and invisible.
  const seat = new THREE.Group();
  seat.name = `driver-seat-${surface || 'gta'}`;
  seat.position.set(
    DRIVER_MOUNT.position[0], DRIVER_MOUNT.position[1], DRIVER_MOUNT.position[2],
  );
  seat.visible = false;
  anchor.add(seat);

  let handle = null;
  let currentId = null;
  let disposed = false;

  function detach() {
    if (!handle) return;
    handle.dispose();
    if (handle.group && handle.group.parent) {
      handle.group.parent.remove(handle.group);
    }
    handle = null;
  }

  /**
   * Swap the embodied character live (the picker calls this after
   * writing the surface override). Roster-validated: an unknown id
   * is refused (returns false, current embodiment kept); null
   * returns the walker to the native capsule.
   */
  function setCharacter(id) {
    if (disposed) return false;
    const next = id === null
      ? null
      : (typeof id === 'string' && getEmbodiment(id) ? id : undefined);
    if (next === undefined) return false;
    if (next === currentId) return true;
    detach();
    currentId = next;
    if (next) {
      prefetchCharacterGlbs([next]);
      handle = embScene.attach({ characterId: next, procSize });
      if (handle) anchor.add(handle.group);
    }
    anchor.visible = false;
    return true;
  }

  // Initial pick: explicit wins; otherwise the Wave 0 chain
  // (surface override > profile character > null = native capsule).
  const initial = 'characterId' in o
    ? o.characterId
    : (resolveSurfaceCharacter(surface, { storage: o.storage }) || {}).id || null;
  if (initial) setCharacter(initial);

  /**
   * Per-frame: track the walker root (or, while driving, the
   * vehicle), drive the pose, report whether the embodiment is
   * showing. `now` is seconds (the pose driver's clock).
   * frame.hidden = the world hides the figure entirely this
   * frame (Mega City's train ride).
   *
   * The mode is decided fresh each frame from the world's own
   * state: in a mountable vehicle -> the handle sits in the
   * seat group under a vehicle-pinned anchor, holding 'drive';
   * otherwise -> the handle rides the anchor root at the
   * walker's position, walking. The reparent is the whole
   * transition: one handle, one home per frame, so entering and
   * exiting a car can never show two bodies or none.
   */
  function update(player, dt, now, frame) {
    if (disposed || !player) return false;
    const hidden = !!((frame || {}).hidden);
    const vehicle = player.inVehicle || null;
    const mountable = vehicleMountable(vehicle);
    const ready = !!(handle && handle.isReady());
    const driving = driverShowing({
      hasHandle: !!handle,
      ready,
      liveGlb: !!(handle && handle.isLiveGlb && handle.isLiveGlb()),
      inVehicle: !!vehicle,
      mountable,
      hidden,
    });
    if (driving) {
      anchor.position.set(vehicle.x, 0, vehicle.z);
      anchor.rotation.y = vehicle.heading;
      if (handle.group.parent !== seat) seat.add(handle.group);
      seat.visible = true;
      anchor.visible = true;
      handle.update(DRIVER_POSE, dt, now, {});
      return true;
    }
    seat.visible = false;
    if (handle && handle.group.parent !== anchor) anchor.add(handle.group);
    anchor.position.set(player.x || 0, player.y || 0, player.z || 0);
    anchor.rotation.y = player.heading || 0;
    const showing = walkerShowing({
      hasHandle: !!handle,
      ready,
      inVehicle: !!vehicle,
      hidden,
    });
    anchor.visible = showing;
    if (handle && !vehicle && !hidden) {
      handle.update(walkerPoseFor(player), dt, now, {
        moveDir: player.moving ? 1 : 0,
      });
    }
    return showing;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    detach();
    if (anchor.parent) anchor.parent.remove(anchor);
  }

  return {
    group: anchor,
    seat,
    update,
    setCharacter,
    characterId() { return currentId; },
    hasHandle() { return !!handle; },
    dispose,
  };
}
