'use client';
import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState } from '@/lib/earth/roam';
import { beginClimb, getClimbAltM } from '@/lib/earth/parachute';

// EarthLadders — climbable ladders on building-category structures.
//
// For every building with a single placement (lighthouse, water tower,
// control tower, windmill, grain elevator, etc.), a procedural ladder
// is attached: two rails + rungs, with yellow/black hazard stripes.
// Double-click a ladder to climb it: the walker's altitude animates
// from ground to the structure's top (scaleM height) over ~2 seconds.
//
// The ladder is positioned at the asset's lat/lon, offset slightly
// outward from the structure, oriented along the surface normal.

const UPM = DISPLAY_UNITS_PER_METRE;

// Climbable structures: buildings with exact single placements.
function climbableStructures() {
  return EARTH_ASSETS.filter(
    (a) =>
      (a.category === 'building' || a.category === 'prop') &&
      a.placement?.mode === 'single' &&
      a.placement.lat != null &&
      a.placement.lon != null
  );
}

function LadderMesh({ asset, onClimb }) {
  const groupRef = useRef();
  const { lat, lon } = asset.placement;
  const heightM = asset.scaleM || 10;
  const heightU = heightM * UPM;

  const { position, quaternion } = useMemo(() => {
    const r = surfaceRadiusOrBase(lat, lon);
    const p = latLonToVec3(lat, lon, r);
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    // Orient +Y along the surface normal
    const normal = pos.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal
    );
    // Offset the ladder slightly from the structure center so it
    // reads as attached to the side, not through the middle.
    const offset = new THREE.Vector3(1.2 * UPM, 0, 0).applyQuaternion(quat);
    pos.add(offset);
    return { position: pos, quaternion: quat };
  }, [lat, lon]);

  const rungCount = Math.max(3, Math.floor(heightM / 1.5));
  const rungs = [];
  for (let i = 0; i < rungCount; i++) {
    rungs.push((i + 0.5) * (heightU / rungCount));
  }

  const railW = 0.06 * UPM * 10; // rail width in display units
  const ladderW = 0.5 * UPM * 10; // ladder width

  return (
    <group
      ref={groupRef}
      position={position}
      quaternion={quaternion}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (roamState.active && onClimb) onClimb(asset);
      }}
    >
      {/* Rails */}
      {[-ladderW / 2, ladderW / 2].map((x, i) => (
        <mesh key={i} position={[x, heightU / 2, 0]}>
          <boxGeometry args={[railW, heightU, railW]} />
          <meshStandardMaterial color="#c8c8c8" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* Rungs */}
      {rungs.map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[ladderW, railW * 0.7, railW * 0.7]} />
          <meshStandardMaterial color="#888888" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {/* Hazard stripe base plate */}
      <mesh position={[0, 0.05 * UPM * 10, 0]}>
        <boxGeometry args={[ladderW + 0.2 * UPM * 10, 0.1 * UPM * 10, 0.3 * UPM * 10]} />
        <meshStandardMaterial color="#facc15" roughness={0.6} />
      </mesh>
      {/* Invisible hitbox for easy double-clicking */}
      <mesh position={[0, heightU / 2, 0]} visible={false}>
        <boxGeometry args={[ladderW * 3, heightU, 1 * UPM * 10]} />
      </mesh>
    </group>
  );
}

export default function EarthLadders({ visible }) {
  const structures = useMemo(() => climbableStructures(), []);

  const handleClimb = (asset) => {
    const heightM = asset.scaleM || 10;
    // If already at the top (or climbing), go back down
    const current = getClimbAltM();
    if (current > heightM * 0.5) {
      beginClimb(0, 2.0);
    } else {
      beginClimb(heightM, 2.5);
    }
  };

  if (!visible) return null;

  return (
    <group>
      {structures.map((asset) => (
        <LadderMesh key={asset.id} asset={asset} onClimb={handleClimb} />
      ))}
    </group>
  );
}
