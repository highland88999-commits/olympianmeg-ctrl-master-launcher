'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import RedwaterQuicksand, { PIT, CORE_DEPTH } from './RedwaterQuicksand';
import { destinationPoint, roamState, tangentFrame } from '@/lib/earth/roam';
import { EARTH_RADIUS, latLonToVec3 } from '@/lib/geo';
import { globeGridRadiusOrBase, surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';

// RedwaterMount — seats the Redwater quicksand journey in the
// NexusEarth hub scene (Merlin, 2026-10-24: the journey mounts in
// NexusEarth, the hub Earth scene — not a standalone page).
// Rendered inside NexusEarth's spin group, under the same gate as
// EarthLadders (terrain layer, roaming, not micro), so it rides
// the same globe-local frame as the walker and the street layer.
//
// Frame math (all globe-local, inside the spin group):
// - The mount group stands ON THE PIT's tangent frame: +X east,
//   +Y the surface normal, +Z south — the journey's own axes, so
//   the shaft drops along -normal, straight toward the planet's
//   centre. Group scale is DISPLAY_UNITS_PER_METRE, so the
//   journey's metre coordinates land as display metres.
// - The journey renders its pit at PIT (100 m east, 50 m north of
//   the town centre, in journey metres), so the journey is shifted
//   by -PIT inside the group: the pit lands exactly on the pit's
//   surface point, and the walker-to-journey mapping is the
//   pit-frame tangential offset plus PIT back.
// - The walker reaches the pit by walking: pit-frame metres come
//   from the walker's globe position minus the pit's, dotted with
//   the pit frame's east/north and divided by UPM. The mutated
//   ref (never state) feeds the journey's frame loop — no
//   re-render churn while walking.
// - Proximity gate with hysteresis: the journey mounts at 60 m
//   from the pit and stands down at 90 m — but NEVER mid-sink or
//   mid-fall. At the core the walker is still walking the surface
//   (that is how the NYC portal is reached), so wandering 90 m
//   off there stands the journey down and the street rig retakes
//   the lens.
// - Camera: the journey only ever nudges the lens (shake + slow
//   sink, scaled by worldScale); the street rig owns it until the
//   journey leaves the surface (roamState.journeyActive gates the
//   flight controller's street camera block + floor clamp). On
//   arrival at the core the mount places the lens once at the
//   core viewpoint — south of the plinth, looking north at the
//   bars and the sniper — because the journey itself never moves
//   the camera to the core (its world drops past the lens).
const UPM = DISPLAY_UNITS_PER_METRE;
// Redwater, Alberta — the town the journey is gated to (coords
// from EarthConsole's Redwater single, exact).
const REDWATER_LAT = 53.9486;
const REDWATER_LON = -113.1067;
const MOUNT_RADIUS_M = 60;
const UNMOUNT_RADIUS_M = 90;
// The pit's true lat/lon: 100 m east and 50 m north of the town
// centre, great-circle-stepped at the hub's display scale
// (metres × UPM / globe radius — the same stepping stepRoam uses).
const PIT_AFTER_NORTH = destinationPoint(REDWATER_LAT, REDWATER_LON, 0, (50 * UPM) / EARTH_RADIUS);
const PIT_LL = destinationPoint(PIT_AFTER_NORTH.lat, PIT_AFTER_NORTH.lon, 90, (100 * UPM) / EARTH_RADIUS);
const PIT_LAT = PIT_LL.lat;
const PIT_LON = PIT_LL.lon;
// The pit's tangent frame (globe-local). Right-handed: east ×
// normal = south (roam.js proves east × north = normal).
const PIT_FRAME = tangentFrame(PIT_LAT, PIT_LON);
const PIT_QUAT = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(PIT_FRAME.east.x, PIT_FRAME.east.y, PIT_FRAME.east.z),
    new THREE.Vector3(PIT_FRAME.normal.x, PIT_FRAME.normal.y, PIT_FRAME.normal.z),
    new THREE.Vector3(-PIT_FRAME.north.x, -PIT_FRAME.north.y, -PIT_FRAME.north.z),
  ),
);
// The shift that plants the journey's pit on the mount origin.
const SHIFT_X = -PIT.x;
const SHIFT_Z = -PIT.z;
// Core camera, outer-local metres: 4 m above the plinth top,
// 8 m south of it, looking north at the bars. Journey-local core
// = pit + group sink (CORE_DEPTH) + core group (CORE_DEPTH);
// the shift subtracts PIT back out, leaving these small numbers.
const CORE_CAM_OUTER = { x: 0, y: -(2 * CORE_DEPTH) - 10, z: 8 };
const CORE_LOOK_OUTER = { x: 0, y: -(2 * CORE_DEPTH) - 12, z: 0 };

export default function RedwaterMount({ onTeleportNYC }) {
  const { camera } = useThree();
  const outerRef = useRef(null);
  const playerPositionRef = useRef({ x: 0, z: 0 });
  const phaseRef = useRef('surface');
  const coreCamPlacedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Phase bridge: the flight controller stands its street camera
  // block + floor clamp down while the journey owns the lens, and
  // the core arrival places the lens at the core viewpoint once.
  // Stable (useCallback) so the journey's phase effect fires only
  // on real phase changes.
  const handlePhaseChange = useCallback((phase) => {
    phaseRef.current = phase;
    roamState.journeyActive = phase !== 'surface';
    if (phase === 'core' && !coreCamPlacedRef.current) {
      const outer = outerRef.current;
      if (outer) {
        outer.updateWorldMatrix(true, false);
        const camPos = new THREE.Vector3(CORE_CAM_OUTER.x, CORE_CAM_OUTER.y, CORE_CAM_OUTER.z)
          .applyMatrix4(outer.matrixWorld);
        const look = new THREE.Vector3(CORE_LOOK_OUTER.x, CORE_LOOK_OUTER.y, CORE_LOOK_OUTER.z)
          .applyMatrix4(outer.matrixWorld);
        const worldQuat = new THREE.Quaternion();
        outer.getWorldQuaternion(worldQuat);
        const upWorld = new THREE.Vector3(PIT_FRAME.normal.x, PIT_FRAME.normal.y, PIT_FRAME.normal.z)
          .applyQuaternion(worldQuat);
        camera.position.copy(camPos);
        camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, look, upWorld));
        coreCamPlacedRef.current = true;
      }
    }
    if (phase === 'surface') coreCamPlacedRef.current = false;
  }, [camera]);

  // Leaving the scene always hands the camera back to the rig.
  useEffect(() => () => {
    roamState.journeyActive = false;
  }, []);

  useFrame(() => {
    const outer = outerRef.current;
    if (!outer) return;
    // Plant the mount group on the pit's surface point (same
    // grounding law as EarthWalker: the higher of the true and
    // drawn surfaces, re-read so the heightmap settling moves it).
    const r = Math.max(surfaceRadiusOrBase(PIT_LAT, PIT_LON), globeGridRadiusOrBase(PIT_LAT, PIT_LON));
    const p = latLonToVec3(PIT_LAT, PIT_LON, r);
    outer.position.set(p.x, p.y, p.z);
    outer.quaternion.copy(PIT_QUAT);
    // Walker -> journey-local metres.
    const w = latLonToVec3(roamState.lat, roamState.lon, r);
    const dx = w.x - p.x;
    const dy = w.y - p.y;
    const dz = w.z - p.z;
    const eastM = (dx * PIT_FRAME.east.x + dy * PIT_FRAME.east.y + dz * PIT_FRAME.east.z) / UPM;
    const southM = -(dx * PIT_FRAME.north.x + dy * PIT_FRAME.north.y + dz * PIT_FRAME.north.z) / UPM;
    playerPositionRef.current.x = eastM + PIT.x;
    playerPositionRef.current.z = southM + PIT.z;
    const distToPitM = Math.hypot(eastM, southM);
    if (!mounted) {
      if (distToPitM <= MOUNT_RADIUS_M) setMounted(true);
    } else if (phaseRef.current === 'surface' || phaseRef.current === 'core') {
      if (distToPitM >= UNMOUNT_RADIUS_M) {
        setMounted(false);
        phaseRef.current = 'surface';
        coreCamPlacedRef.current = false;
        roamState.journeyActive = false;
      }
    }
  });

  return (
    <group ref={outerRef} scale={UPM}>
      <group position={[SHIFT_X, 0, SHIFT_Z]}>
        {mounted && (
          <RedwaterQuicksand
            playerPosition={playerPositionRef.current}
            onTeleportNYC={onTeleportNYC}
            onPhaseChange={handlePhaseChange}
            worldScale={UPM}
          />
        )}
      </group>
    </group>
  );
}
