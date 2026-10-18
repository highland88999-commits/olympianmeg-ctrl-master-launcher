'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState } from '@/lib/earth/roam';
import { beginClimb, getClimbAltM, climbState } from '@/lib/earth/parachute';

// MonumentElevator — glass elevator platforms at landmark monuments.
//
// For every landmark with a single placement (Eiffel Tower, Statue of
// Liberty, Burj Khalifa, etc.), a glass/metal elevator platform sits
// at the base. Double-click the monument (or the platform) to ride:
// the platform rises smoothly to the monument's top (scaleM height),
// carrying the walker's viewpoint. Double-click again to descend.
//
// The platform is a glass disc with a metallic rim and a subtle cyan
// glow. It tracks the climb altitude so the walker rides it visually.

const UPM = DISPLAY_UNITS_PER_METRE;

function monumentLandmarks() {
  return EARTH_ASSETS.filter(
    (a) =>
      a.category === 'landmark' &&
      a.placement?.mode === 'single' &&
      a.placement.lat != null &&
      a.placement.lon != null
  );
}

function ElevatorPlatform({ asset, onRide }) {
  const platformRef = useRef();
  const { lat, lon } = asset.placement;
  const heightM = asset.scaleM || 50;
  const heightU = heightM * UPM;

  const { basePosition, quaternion } = useMemo(() => {
    const r = surfaceRadiusOrBase(lat, lon);
    const p = latLonToVec3(lat, lon, r);
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const normal = pos.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal
    );
    return { basePosition: pos, quaternion: quat };
  }, [lat, lon]);

  // The platform follows the climb altitude each frame.
  useFrame(() => {
    const plat = platformRef.current;
    if (!plat) return;
    const altU = getClimbAltM() * UPM;
    const normal = basePosition.clone().normalize();
    plat.position.copy(basePosition).addScaledVector(normal, altU);
  });

  const discR = 2.5 * UPM * 10; // platform radius in display units

  return (
    <group quaternion={quaternion}>
      {/* Guide rail from base to top (subtle) */}
      <mesh position={[basePosition.x, basePosition.y + heightU / 2, basePosition.z]}>
        <boxGeometry args={[0.1 * UPM * 10, heightU, 0.1 * UPM * 10]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.9}
          roughness={0.2}
          transparent
          opacity={0.4}
        />
      </mesh>
      {/* The moving platform */}
      <group ref={platformRef} position={basePosition}>
        {/* Glass disc */}
        <mesh
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (roamState.active && onRide) onRide(asset);
          }}
        >
          <cylinderGeometry args={[discR, discR, 0.15 * UPM * 10, 24]} />
          <meshPhysicalMaterial
            color="#a5f3fc"
            metalness={0.1}
            roughness={0.1}
            transparent
            opacity={0.45}
            clearcoat={1}
          />
        </mesh>
        {/* Metallic rim */}
        <mesh position={[0, 0.02 * UPM * 10, 0]}>
          <torusGeometry args={[discR, 0.08 * UPM * 10, 8, 32]} />
          <meshStandardMaterial
            color="#64748b"
            metalness={0.9}
            roughness={0.25}
            emissive="#22d3ee"
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Glow underlight */}
        <mesh position={[0, -0.1 * UPM * 10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[discR * 0.9, 24]} />
          <meshBasicMaterial
            color="#22d3ee"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Invisible hitbox */}
        <mesh visible={false}>
          <cylinderGeometry args={[discR * 2, discR * 2, 1 * UPM * 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}

export default function MonumentElevator({ visible }) {
  const landmarks = useMemo(() => monumentLandmarks(), []);

  const handleRide = (asset) => {
    const heightM = asset.scaleM || 50;
    const current = getClimbAltM();
    // Toggle: if up high, come down; otherwise ride to the top
    if (current > heightM * 0.5) {
      beginClimb(0, 3.0);
    } else {
      beginClimb(heightM, 4.0);
    }
  };

  if (!visible) return null;

  return (
    <group>
      {landmarks.map((asset) => (
        <ElevatorPlatform key={asset.id} asset={asset} onRide={handleRide} />
      ))}
    </group>
  );
}
