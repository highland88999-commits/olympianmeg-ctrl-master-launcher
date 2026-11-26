'use client';

// components/hub-baseball/BaseballController.jsx — HUB BASEBALL flight brain.
//
// Lives inside the Canvas. Owns the flight-state ref (shared with
// Baseball + SequenceController via the flightRef prop created in
// HubScene) and, every frame:
//   * edge-detects baseballCmdRef.swing while appState is
//     'baseball_flight' and starts a flight (createFlight with a fresh
//     random seed — spawns the holes, launches the ball, fires
//     onBaseballUpdate { type: 'start' });
//   * while flying, steps physics with input from bikeAxisInput
//     (controlsRef + flightAxis), updates the ball mesh + hole rings,
//     writes baseballHudRef, fires throttled 'tick' (5 Hz);
//   * on eaten/range, fires 'end' once and stops stepping — the ball
//     stays where it ended until the state flips;
//   * on quit-counter edge, ends with reason 'quit' and aborts silently
//     (no 'end' event: the page already submits on the QUIT tap — the
//     scene submits NOTHING, only the page submits, so firing 'end'
//     here would double-submit);
//   * at rest the ball bobs gently and spins slowly above the plate;
//   * in freeroam, near-plate detection (camera within 150 of PLATE_POS)
//     writes baseballHudRef.nearPlate and fires 'proximity' on flip.
//
// The scene submits NOTHING — only the page submits scores.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PLATE_POS, BALL_REST, PLATE_PROXIMITY_RADIUS } from '../../lib/hub-baseball/placement';
import { createFlight, stepFlight, endFlight } from '../../lib/hub-baseball/flight';
import { bikeAxisInput } from '../../lib/flight-axis';

// Near-plate radius (STATE.md): spawn is 55 from the plate, so the
// SWING orb shows at spawn — discoverable. Single-sourced from
// placement.js.
export const NEAR_PLATE_RADIUS = PLATE_PROXIMITY_RADIUS;

// --- Small tolerant readers -----------------------------------------------
// Worker A owns lib/hub-baseball/flight.js; the contract pins the state
// shape ({ pos, vel, holes, distanceM, maxDistanceM, eaten, ended,
// reason }) but not whether vectors are {x,y,z} objects or [x,y,z]
// arrays, nor the hole fields. These readers accept both so a field
// naming difference degrades to a hidden hole, never a crash.

/** Copy a {x,y,z} object or [x,y,z] array into `out` (a THREE.Vector3). */
export function flightVec3(v, out) {
  if (!v) return out.set(0, 0, 0);
  if (Array.isArray(v)) return out.set(v[0] || 0, v[1] || 0, v[2] || 0);
  return out.set(v.x || 0, v.y || 0, v.z || 0);
}

/** Hole centre: hole.pos | hole.position | hole.center (obj or array). */
function holeCenter(hole, out) {
  return flightVec3(hole.pos || hole.position || hole.center, out);
}

/** Hole radius: hole.radius | hole.r | hole.size. */
function holeRadius(hole) {
  const r = hole.radius ?? hole.r ?? hole.size;
  return typeof r === 'number' && r > 0 ? r : 0;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export default function BaseballController({
  appState,
  controlsRef,
  flightAxis,
  baseballCmdRef,
  baseballHudRef,
  onBaseballUpdate,
  flightRef,
}) {
  const { camera } = useThree();
  const prevSwingRef = useRef(0);
  const prevQuitRef = useRef(0);
  const endFiredRef = useRef(false);
  const tickAccumRef = useRef(0);
  const nearPlateRef = useRef(false);
  const restTimeRef = useRef(0);

  // The page may not have wired the refs yet (Worker C lands the page
  // separately); guards keep the scene alive until then.
  const emit = (evt) => {
    if (typeof onBaseballUpdate === 'function') {
      try {
        onBaseballUpdate(evt);
      } catch {
        // A page handler must never break the frame.
      }
    }
  };
  const writeHud = (patch) => {
    if (baseballHudRef && baseballHudRef.current) {
      Object.assign(baseballHudRef.current, patch);
    }
  };

  const setNearPlate = (near) => {
    if (near === nearPlateRef.current) return;
    nearPlateRef.current = near;
    if (flightRef) flightRef.current.nearPlate = near;
    writeHud({ nearPlate: near });
    emit({ type: 'proximity', nearPlate: near });
  };

  const clearFlight = () => {
    if (!flightRef) return;
    flightRef.current.flight = null;
    flightRef.current.handedOff = false;
    endFiredRef.current = false;
    tickAccumRef.current = 0;
    if (flightRef.current.holeSlots) {
      for (const slot of flightRef.current.holeSlots) {
        if (slot && slot.group) slot.group.visible = false;
      }
    }
    writeHud({ flying: false, distanceM: 0, maxDistanceM: 0, eaten: false });
  };

  const startFlight = () => {
    if (!flightRef) return;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const flight = createFlight({ seed, plate: PLATE_POS });
    flightRef.current.flight = flight;
    flightRef.current.handedOff = false;
    flightRef.current.holeVersion = (flightRef.current.holeVersion || 0) + 1;
    // Fresh direction: the ball launches away from the hub centre, so
    // the first camera lookAt has a real direction even before the
    // first step.
    flightVec3(flight.vel, flightRef.current.lastDir);
    if (flightRef.current.lastDir.lengthSq() < 0.001) {
      flightRef.current.lastDir.set(0, 0, -1);
    } else {
      flightRef.current.lastDir.normalize();
    }
    endFiredRef.current = false;
    tickAccumRef.current = 0;
    writeHud({ flying: true, distanceM: 0, maxDistanceM: 0, eaten: false });
    emit({ type: 'start' });
  };

  // Position + scale the hole slots from the flight's holes. Slots past
  // the hole count stay hidden; holes without a readable centre/radius
  // stay hidden too (never a crash, never a hole at the origin).
  const syncHoles = (flight, t) => {
    if (!flightRef || !flightRef.current.holeSlots) return;
    const holes = Array.isArray(flight.holes) ? flight.holes : [];
    flightRef.current.holeSlots.forEach((slot, i) => {
      if (!slot || !slot.group) return;
      const hole = holes[i];
      if (!hole) {
        slot.group.visible = false;
        return;
      }
      const r = holeRadius(hole);
      if (r <= 0) {
        slot.group.visible = false;
        return;
      }
      holeCenter(hole, _v1);
      slot.group.visible = true;
      slot.group.position.copy(_v1);
      // Unit-sized slot contents scale to the hole: sphere = radius,
      // ring = 1.6x radius, glow sprite = ~5x radius.
      slot.group.scale.setScalar(1);
      const sphere = slot.group.children[0];
      if (sphere) sphere.scale.setScalar(r);
      const ring = slot.group.userData.ring;
      if (ring) {
        ring.scale.setScalar(r);
        // Slow accretion spin; the 0.5 rad X tilt is set on the mesh.
        ring.rotation.z = t * 0.25 + i * 1.7;
      }
      const glow = slot.group.userData.glow;
      if (glow) glow.scale.set(r * 5, r * 5, 1);
    });
  };

  useFrame((state, delta) => {
    if (!flightRef) return;
    const shared = flightRef.current;
    const t = state.clock.elapsedTime;
    const step = Math.min(delta, 0.05);
    const c = controlsRef && controlsRef.current ? controlsRef.current : null;

    // --- Command edges (page increments; scene edge-detects) ------------
    const swing = baseballCmdRef && baseballCmdRef.current
      ? baseballCmdRef.current.swing || 0
      : 0;
    const quit = baseballCmdRef && baseballCmdRef.current
      ? baseballCmdRef.current.quit || 0
      : 0;
    if (quit !== prevQuitRef.current) {
      prevQuitRef.current = quit;
      // QUIT: abort silently — the page already submitted on the tap.
      if (shared.flight) {
        try {
          endFlight(shared.flight, 'quit');
        } catch {
          /* endFlight is a pure helper; never break the frame */
        }
        clearFlight();
      }
    }
    if (swing > prevSwingRef.current) {
      // SWING: start only on the flight state, and never restart a
      // flight already in the air (a double tap must not re-seed it).
      // Do NOT consume the edge while the state prop still lags behind
      // the page's setAppState — the edge must still fire on the frame
      // the 'baseball_flight' prop arrives.
      if (appState === 'baseball_flight' && !shared.flight) {
        prevSwingRef.current = swing;
        startFlight();
      } else if (shared.flight) {
        prevSwingRef.current = swing;
      }
    }

    const flying = appState === 'baseball_flight' && !!shared.flight;

    if (flying) {
      const flight = shared.flight;
      if (!flight.ended) {
        const input = c
          ? bikeAxisInput({
              keyW: c.keyW,
              keyS: c.keyS,
              keyA: c.keyA,
              keyD: c.keyD,
              moveX: c.moveX,
              moveY: c.moveY,
              axis: flightAxis,
            })
          : { throttle: 0, steer: 0, vertical: false };
        stepFlight(flight, input, step);

        // The camera IS the ball: hide the mesh while flying.
        if (shared.ballMesh) shared.ballMesh.visible = false;

        // Keep the last real direction for the camera lookAt (the
        // SequenceController branch reads it when speed is ~0).
        flightVec3(flight.vel, _v1);
        if (_v1.lengthSq() > 1) {
          shared.lastDir.copy(_v1).normalize();
        }

        writeHud({
          flying: true,
          distanceM: flight.distanceM || 0,
          maxDistanceM: flight.maxDistanceM || 0,
          eaten: !!flight.eaten,
        });
        tickAccumRef.current += step;
        if (tickAccumRef.current >= 0.2) {
          tickAccumRef.current = 0;
          emit({
            type: 'tick',
            distanceM: flight.distanceM || 0,
            maxDistanceM: flight.maxDistanceM || 0,
          });
        }
      }

      syncHoles(flight, t);

      if (flight.ended && !endFiredRef.current) {
        endFiredRef.current = true;
        // The ball stays where it ended: show it at the end spot so
        // the plate-viewpoint handoff has something to look back at.
        if (shared.ballMesh) {
          flightVec3(flight.pos, _v2);
          shared.ballMesh.position.copy(_v2);
          shared.ballMesh.visible = true;
        }
        writeHud({
          flying: false,
          distanceM: flight.distanceM || 0,
          maxDistanceM: flight.maxDistanceM || 0,
          eaten: !!flight.eaten,
        });
        emit({
          type: 'end',
          distanceM: flight.distanceM || 0,
          maxDistanceM: flight.maxDistanceM || 0,
          eaten: !!flight.eaten,
          reason: flight.reason || (flight.eaten ? 'eaten' : 'range'),
        });
      }
      // While ended, the ball mesh already sits at the end spot and
      // the holes stay lit; nothing more to step.
      return;
    }

    // --- Not flying ------------------------------------------------------
    // A flight left over from a state flip without a quit (defensive):
    // stand it down so the ball returns to the plate.
    if (shared.flight) clearFlight();

    // At rest the ball bobs gently and spins slowly above the plate.
    restTimeRef.current += step;
    const rt = restTimeRef.current;
    if (shared.ballMesh) {
      shared.ballMesh.visible = true;
      shared.ballMesh.position.set(
        BALL_REST[0],
        BALL_REST[1] + Math.sin(rt * 0.8) * 3,
        BALL_REST[2]
      );
      shared.ballMesh.rotation.y = rt * 0.15;
    }
    if (shared.holeSlots) {
      for (const slot of shared.holeSlots) {
        if (slot && slot.group) slot.group.visible = false;
      }
    }

    // --- Near-plate detection (freeroam only) ---------------------------
    if (appState === 'hub_freeroam') {
      flightVec3(PLATE_POS, _v1);
      const d = camera.position.distanceTo(_v1);
      setNearPlate(d < NEAR_PLATE_RADIUS);
      writeHud({ nearPlate: nearPlateRef.current });
    } else if (nearPlateRef.current) {
      setNearPlate(false);
    }
  });

  return null;
}
