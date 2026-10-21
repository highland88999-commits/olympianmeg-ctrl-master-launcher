'use client';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { roamState } from '@/lib/earth/roam';
import { parachuteState } from '@/lib/earth/parachute';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { latLonToVec3 } from '@/lib/geo';
import { TERRAIN_RADIUS } from '@/lib/terrain';

// UnderwaterVeil — the underwater ambience for Earth swimming
// (round 3, lib/earth/swim.js). When the CAMERA goes under the
// waterline, the world takes a clear bright-blue wash — Merlin's
// ocean rule: bright and clear, never murky. A BackSide sphere
// rides the swimmer (the QuantumSkyDome pattern): from inside,
// every view direction tints. Above the surface it renders
// nothing at all, so surface swimming keeps the ordinary day sky.
//
// "Underwater" is measured honestly: the camera's globe-local
// radius (its position un-rotated into this spin group's space)
// against the base globe radius — the waterline is the sea-level
// sphere. Mounted inside NexusEarth's spin group, terrain layer,
// roaming only; the Quantum Realm (scale < 0.5) never shows it.
const VEIL_RADIUS_U = 0.45; // hub units around the swimmer
const WATERLINE_EPS_U = 0.01; // ~0.6 display m of surface chop grace

export default function UnderwaterVeil() {
  const meshRef = useRef();
  const { camera } = useThree();
  const tmp = useRef(new THREE.Vector3());

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const scale = parachuteState?.scale || 1;
    const on = scale >= 0.5 && roamState.active && !!(roamState.swim && roamState.swim.active);
    if (!on || !mesh.parent) {
      mesh.visible = false;
      return;
    }
    // Camera position in globe-local (spin group) space: if the
    // lens rides above the waterline the veil stays off even while
    // the swimmer is submerged below it.
    tmp.current.copy(camera.position);
    mesh.parent.worldToLocal(tmp.current);
    const camR = tmp.current.length();
    if (camR >= TERRAIN_RADIUS - WATERLINE_EPS_U) {
      mesh.visible = false;
      return;
    }
    const { lat, lon } = roamState;
    const p = latLonToVec3(lat, lon, surfaceRadiusOrBase(lat, lon));
    mesh.position.set(p.x, p.y, p.z);
    mesh.visible = true;
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={5}>
      <sphereGeometry args={[VEIL_RADIUS_U, 24, 16]} />
      <meshBasicMaterial
        color="#2fb9ec"
        transparent
        opacity={0.30}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
