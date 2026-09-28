'use client';
import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3, easeInOutCubic } from '@/lib/geo';

export const EARTH_CENTER = new THREE.Vector3(0, -60, -120);
const HUB_HOME = new THREE.Vector3(0, 75, 20);

// Cinematic Earth flights. The core idea (Merlin's walking experiment):
// the traveler stands still — the WORLD moves. Destination travel rotates
// the planet under a fixed camera instead of flying the camera across it.
export default function EarthFlightController({
  launchState, setLaunchState, quatRef, focus, pendingDest, onArriveDest, controls,
}) {
  const { camera } = useThree();
  const travel = useRef(null);

  const smoothLook = (target, delta, speed = 4) => {
    const m = new THREE.Matrix4().lookAt(camera.position, target, camera.up);
    const tq = new THREE.Quaternion().setFromRotationMatrix(m);
    camera.quaternion.slerp(tq, 1 - Math.exp(-speed * delta));
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
    } else if (launchState === 'earth_surface') {
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
    } else if (launchState === 'returning_to_orbit') {
      camera.position.lerp(HUB_HOME, 1 - Math.exp(-2.2 * delta));
      smoothLook(new THREE.Vector3(0, 35, -60), delta, 3);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 52, delta * 3);
      camera.updateProjectionMatrix();
      if (camera.position.distanceTo(HUB_HOME) < 2) {
        setLaunchState('hub_freeroam');
      }
    }
  });

  return null;
}
