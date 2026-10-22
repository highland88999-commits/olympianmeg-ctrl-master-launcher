'use client';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { roamState } from '@/lib/earth/roam';
import { parachuteState } from '@/lib/earth/parachute';
import { veilOpacityFor } from '@/lib/earth/swim';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { latLonToVec3 } from '@/lib/geo';
import { TERRAIN_RADIUS } from '@/lib/terrain';

// UnderwaterVeil — the underwater ambience for Earth swimming
// (round 3, lib/earth/swim.js). When the traveler goes under the
// waterline, the world takes a clear bright-blue wash — Merlin's
// ocean rule: bright and clear, never murky. A BackSide sphere
// rides the swimmer (the QuantumSkyDome pattern): from inside,
// every view direction tints. Above the surface it renders
// nothing at all, so surface swimming keeps the ordinary day sky.
//
// Round 4 (defect 7): the veil used to answer to the CAMERA
// alone, so a submerged swimmer whose boom lifted the lens to the
// surface read as open air — pale sky, a flickering wash, a hard
// waterline band. It now answers to the SWIMMER too, through
// veilOpacityFor (lib/earth/swim.js): the wash is present
// whenever the swimmer is submerged, deepening with held depth,
// and the camera-under wash from round 3 still applies at the
// surface float. "Underwater" for the camera is measured
// honestly: its globe-local radius (its position un-rotated into
// this spin group's space) against the base globe radius — the
// waterline is the sea-level sphere. Mounted inside NexusEarth's
// spin group, terrain layer, roaming only; the Quantum Realm
// (scale < 0.5) never shows it — and since the parachute dive
// suspends the swim state itself, a shrunken swimmer carries no
// water in with him.
const VEIL_RADIUS_U = 0.45; // hub units around the swimmer
const WATERLINE_EPS_U = 0.01; // ~0.6 display m of surface chop grace

export default function UnderwaterVeil() {
  const meshRef = useRef();
  const matRef = useRef();
  const { camera } = useThree();
  const tmp = useRef(new THREE.Vector3());

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const scale = parachuteState?.scale || 1;
    const swim = roamState.swim;
    const on = scale >= 0.5 && roamState.active && !!(swim && swim.active);
    if (!on || !mesh.parent) {
      mesh.visible = false;
      return;
    }
    // Camera position in globe-local (spin group) space.
    tmp.current.copy(camera.position);
    mesh.parent.worldToLocal(tmp.current);
    const camUnder = tmp.current.length() < TERRAIN_RADIUS - WATERLINE_EPS_U;
    const opacity = veilOpacityFor({ camUnder, submergeM: swim.submergeM || 0 });
    if (opacity <= 0) {
      mesh.visible = false;
      return;
    }
    if (matRef.current) matRef.current.opacity = opacity;
    const { lat, lon } = roamState;
    const p = latLonToVec3(lat, lon, surfaceRadiusOrBase(lat, lon));
    // The wash is a BackSide sphere: from OUTSIDE it paints its far
    // hemisphere as a hard-edged disc — the diagonal slice that cut
    // across Merlin's swim footage whenever the boom camera rode
    // high while the swimmer was under. The veil only exists for a
    // camera inside the volume; from outside, the water is the
    // swimmer's, not the lens's (2026-10-21).
    if (tmp.current.distanceTo(p) > VEIL_RADIUS_U) {
      mesh.visible = false;
      return;
    }
    mesh.position.set(p.x, p.y, p.z);
    mesh.visible = true;
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={5}>
      <sphereGeometry args={[VEIL_RADIUS_U, 24, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color="#2fb9ec"
        transparent
        opacity={0.3}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
