'use client';
import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3, easeInOutCubic } from '@/lib/geo';
import {
  roamState,
  beginRoam,
  stepRoam,
  cameraRig,
  ROAM_PITCH_MIN,
  ROAM_PITCH_MAX,
} from '@/lib/earth/roam';
import {
  getHeightData,
  loadHeightData,
  surfaceRadiusOrBase,
} from '@/lib/earth/heightmap';
import {
  parachuteState,
  beginParachuteDive,
  stepParachute,
  resetParachute,
  stepClimb,
  getClimbAltM,
} from '@/lib/earth/parachute';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';

export const EARTH_CENTER = new THREE.Vector3(0, -60, -120);
const HUB_HOME = new THREE.Vector3(0, 75, 20);

// Cinematic Earth flights. The core idea (Merlin's walking experiment):
// the traveler stands still — the WORLD moves. Destination travel rotates
// the planet under a fixed camera instead of flying the camera across it.
//
// Day 2 (2026-10-15) adds the street: 'diving_to_street' continues
// the dive past the overlook all the way down to the embodied
// traveler, and 'earth_roam' walks them — the shared page joystick
// (full-tilt analog: push farther, move faster) and right-side
// drag-look drive lib/earth/roam.js's great-circle stepping on the
// real heightmap, with a third-person rig behind the character.
// Street level runs on the terrain globe (the layer that carries
// the placed world); NexusEarth forces that layer while roaming.
export default function EarthFlightController({
  launchState, setLaunchState, quatRef, focus, pendingDest, onArriveDest, controls,
}) {
  const { camera } = useThree();
  const travel = useRef(null);
  const streetDive = useRef(null);

  const smoothLook = (target, delta, speed = 4) => {
    const m = new THREE.Matrix4().lookAt(camera.position, target, camera.up);
    const tq = new THREE.Quaternion().setFromRotationMatrix(m);
    camera.quaternion.slerp(tq, 1 - Math.exp(-speed * delta));
  };

  // The street rig in world space: globe-local rig points rotated
  // by the shared planet quaternion and centred on EARTH_CENTER —
  // the same transform the dive math has always used.
  //
  // Shrink/reanimate scaling: when the character is scaled (shrinking
  // into the tile or reanimating back), the camera offsets scale
  // in lockstep so the relative framing stays identical. The climb
  // altitude (ladders/elevators) lifts the whole rig along the normal.
  const streetRigWorld = () => {
    const hd = getHeightData();
    const rig = cameraRig(roamState, hd ? hd.data : null, hd ? hd.w : 0, hd ? hd.h : 0);
    const q = quatRef.current;
    const toWorld = (p) => new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(q).add(EARTH_CENTER);

    const scale = parachuteState.scale;
    const altU = getClimbAltM() * DISPLAY_UNITS_PER_METRE;
    const n = new THREE.Vector3(rig.normal.x, rig.normal.y, rig.normal.z);
    const ground = new THREE.Vector3(rig.ground.x, rig.ground.y, rig.ground.z);

    // Scale camera offsets from the ground point, then lift by climb altitude
    const scaleFromGround = (p) => {
      const v = new THREE.Vector3(p.x, p.y, p.z).sub(ground).multiplyScalar(scale).add(ground);
      v.addScaledVector(n, altU);
      return v;
    };
    const groundLifted = ground.clone().addScaledVector(n, altU);

    return {
      rig,
      camPos: toWorld(scaleFromGround(rig.camPos)),
      look: toWorld(scaleFromGround(rig.lookTarget)),
      ground: toWorld(groundLifted),
      up: new THREE.Vector3(rig.normal.x, rig.normal.y, rig.normal.z).applyQuaternion(q),
    };
  };

  const lookAtQuat = (pos, target, up) => {
    const m = new THREE.Matrix4().lookAt(pos, target, up);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  };

  // At street scale the default near plane (0.1) would clip the
  // ground at the traveler's feet; shrink it with altitude.
  const tuneNear = (distToGround) => {
    const near = THREE.MathUtils.clamp(distToGround * 0.25, 0.004, 0.1);
    if (Math.abs(camera.near - near) > 0.002) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  };
  const restoreNear = () => {
    if (Math.abs(camera.near - 0.1) > 0.002) {
      camera.near = 0.1;
      camera.updateProjectionMatrix();
    }
  };

  useFrame((state, delta) => {
    if (launchState === 'diving_to_earth' && focus && quatRef.current) {
      const lp = latLonToVec3(focus.lat, focus.lon, 55);
      const local = new THREE.Vector3(lp.x, lp.y, lp.z);
      const world = local.applyQuaternion(quatRef.current).add(EARTH_CENTER);
      const n = world.clone().sub(EARTH_CENTER).normalize();
      const desired = world.clone().addScaledVector(n, 20);
      camera.position.lerp(desired, 1 - Math.exp(-2.5 * delta));
      smoothLook(world, delta, 4);
      if (camera.position.distanceTo(desired) < 1.2) {
        setLaunchState('earth_surface');
      }
    } else if (launchState === 'earth_travel' && pendingDest && quatRef.current) {
      if (!travel.current) {
        const lp = latLonToVec3(pendingDest.lat, pendingDest.lon, 1);
        const pLocal = new THREE.Vector3(lp.x, lp.y, lp.z).normalize();
        const camDir = camera.position.clone().sub(EARTH_CENTER).normalize();
        travel.current = {
          t: 0,
          dur: 3.8,
          q0: quatRef.current.clone(),
          q1: new THREE.Quaternion().setFromUnitVectors(pLocal, camDir),
        };
      }
      const tr = travel.current;
      tr.t += delta / tr.dur;
      const k = easeInOutCubic(Math.min(tr.t, 1));
      quatRef.current.slerpQuaternions(tr.q0, tr.q1, k);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 46, delta * 2);
      camera.updateProjectionMatrix();
      if (tr.t >= 1) {
        travel.current = null;
        camera.fov = 52;
        camera.updateProjectionMatrix();
        onArriveDest(pendingDest);
      }
    } else if (launchState === 'diving_to_street' && quatRef.current) {
      if (!streetDive.current) {
        if (!roamState.active && focus) {
          beginRoam(roamState, focus.lat, focus.lon, roamState.yawDeg || 0);
        }
        loadHeightData();
        // Shrink: character starts at normal size, shrinks into the tile
        beginParachuteDive();
        streetDive.current = {
          t: 0,
          dur: 3.2,
          fromPos: camera.position.clone(),
          fromQuat: camera.quaternion.clone(),
        };
      }
      const dv = streetDive.current;
      dv.t += delta / dv.dur;
      const k = easeInOutCubic(Math.min(dv.t, 1));
      // Step the parachute scale in lockstep with the camera dive
      stepParachute(delta, dv.dur);
      const { rig, camPos, look, up } = streetRigWorld();
      camera.position.lerpVectors(dv.fromPos, camPos, k);
      camera.quaternion.slerpQuaternions(
        dv.fromQuat, lookAtQuat(camera.position, look, up), k,
      );
      tuneNear(Math.hypot(
        rig.camPos.x - rig.ground.x,
        rig.camPos.y - rig.ground.y,
        rig.camPos.z - rig.ground.z,
      ));
      camera.fov = THREE.MathUtils.lerp(camera.fov, 55, delta * 2);
      camera.updateProjectionMatrix();
      if (dv.t >= 1) {
        streetDive.current = null;
        setLaunchState('earth_roam');
      }
    } else if (launchState === 'earth_roam' && quatRef.current) {
      const c = controls.current;
      // Reanimate: grow the character back to normal size (0.05 → 1),
      // camera scaling up in lockstep via streetRigWorld.
      if (parachuteState.mode === 'reanimating') {
        stepParachute(delta, 2.5);
      }
      // Climb: ladders and monument elevators (altitude in metres)
      stepClimb(delta);
      // Look: the page's right-side drag, in compass terms (drag
      // right turns right, drag down pitches the view down — the
      // hub's own drag feel, mapped onto the orbit rig).
      if (c.lookDeltaX !== 0 || c.lookDeltaY !== 0) {
        roamState.yawDeg = (roamState.yawDeg + c.lookDeltaX * 0.15) % 360;
        roamState.pitchDeg = THREE.MathUtils.clamp(
          roamState.pitchDeg + c.lookDeltaY * 0.05,
          ROAM_PITCH_MIN, ROAM_PITCH_MAX,
        );
        c.lookDeltaX = 0;
        c.lookDeltaY = 0;
      }
      // Walk: hub control convention — forward is the negated
      // moveY channel (joystick up / W), strafe is moveX (D / A).
      const forward = -((c.moveY || 0) + ((c.keyS ? 1 : 0) - (c.keyW ? 1 : 0)));
      const strafe = (c.moveX || 0) + ((c.keyD ? 1 : 0) - (c.keyA ? 1 : 0));
      stepRoam(roamState, { forward, strafe }, delta, {
        radius: surfaceRadiusOrBase(roamState.lat, roamState.lon),
      });
      if (!roamState.moving) roamState.faceDeg = roamState.yawDeg;

      const { rig, camPos, look, up } = streetRigWorld();
      camera.position.lerp(camPos, 1 - Math.exp(-20 * delta));
      camera.quaternion.copy(lookAtQuat(camera.position, look, up));
      tuneNear(Math.hypot(
        rig.camPos.x - rig.ground.x,
        rig.camPos.y - rig.ground.y,
        rig.camPos.z - rig.ground.z,
      ));
      camera.fov = THREE.MathUtils.lerp(camera.fov, 55, delta * 2);
      camera.updateProjectionMatrix();
    } else if (launchState === 'earth_surface') {
      // Glide to the overlook when we are not there (arriving from
      // street level on ascend, or settling the dive's last
      // stretch); once settled, the surface look-around owns it.
      let settled = false;
      if (focus && quatRef.current) {
        const lp = latLonToVec3(focus.lat, focus.lon, 55);
        const world = new THREE.Vector3(lp.x, lp.y, lp.z)
          .applyQuaternion(quatRef.current).add(EARTH_CENTER);
        const n = world.clone().sub(EARTH_CENTER).normalize();
        const desired = world.clone().addScaledVector(n, 20);
        if (camera.position.distanceTo(desired) > 0.35) {
          camera.position.lerp(desired, 1 - Math.exp(-2.8 * delta));
          smoothLook(world, delta, 4);
          restoreNear();
        } else {
          settled = true;
        }
      } else {
        settled = true;
      }
      if (settled) {
        // Explorable: look around from the surface.
        if (controls.current.lookDeltaX !== 0 || controls.current.lookDeltaY !== 0) {
          camera.rotation.order = 'YXZ';
          camera.rotation.y -= controls.current.lookDeltaX * 0.003;
          camera.rotation.x -= controls.current.lookDeltaY * 0.003;
          camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
          camera.rotation.z = 0;
          controls.current.lookDeltaX = 0;
          controls.current.lookDeltaY = 0;
        }
      }
    } else if (launchState === 'returning_to_orbit') {
      restoreNear();
      camera.position.lerp(HUB_HOME, 1 - Math.exp(-2.2 * delta));
      smoothLook(new THREE.Vector3(0, 35, -60), delta, 3);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 52, delta * 3);
      camera.updateProjectionMatrix();
      if (camera.position.distanceTo(HUB_HOME) < 2) {
        setLaunchState('hub_freeroam');
      }
    }

    // Floor clamp: camera never passes below the terrain (street phases only).
    // Pushes the camera out along the surface normal if it's under the floor.
    if ((launchState === 'diving_to_street' || launchState === 'earth_roam') && quatRef.current) {
      const camPos = camera.position;
      // Convert to globe-local (un-translate Earth center, un-rotate)
      const local = camPos.clone();
      local.x -= 0; local.y -= -60; local.z -= -120;
      local.applyQuaternion(quatRef.current.clone().invert());
      const r = Math.hypot(local.x, local.y, local.z) || 1;
      const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, local.y / r))) * 180) / Math.PI;
      let lon = (Math.atan2(local.z, -local.x) * 180) / Math.PI - 180;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      const surfR = surfaceRadiusOrBase(lat, lon);
      // Minimum 0.3m above surface (scaled by walker size for Ant-Man)
      const minR = surfR + 0.3 * DISPLAY_UNITS_PER_METRE * parachuteState.scale;
      if (r < minR) {
        // Push out along the radial direction
        const push = local.clone().normalize().multiplyScalar(minR - r);
        // Convert push back to world (re-rotate, re-translate is implicit in position)
        push.applyQuaternion(quatRef.current);
        camPos.add(push);
      }
    }
  });

  return null;
}
