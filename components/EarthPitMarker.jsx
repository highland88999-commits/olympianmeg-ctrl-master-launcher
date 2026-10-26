'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3, EARTH_RADIUS } from '@/lib/geo';
import { surfaceRadiusOrBase, globeGridRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { destinationPoint, tangentFrame } from '@/lib/earth/roam';

// EarthPitMarker — the VISIBLE quicksand-pit marker for hub Earth
// (Earth 1 expansion + video QA V2-5, 2026-10-26): the Redwater
// journey is easy to walk past — a flat sand disc on flat ground
// — so the pit gets a gold beam, a ground ring and a slow-spinning
// diamond floating above it, visible from the Redwater spawn
// (the town centre, ~112 m away) and from anywhere nearby.
//
// The marker is VISUAL ONLY: no collider, no trigger change, no
// ground moved. The ring (6 m) stands OUTSIDE the pit disc
// (3 m), and the beam is a thin visual — walking into the pit
// still sinks exactly as RedwaterQuicksand defines it. This
// supports the Redwater protection guard; it never covers,
// blocks or reroutes any leg of the journey (pit → sink →
// cavern → 2 km tunnel → core + sniper mount → NYC portal).
// The pit position is derived exactly the way RedwaterMount
// derives it: town centre + 50 m north + 100 m east.

const UPM = DISPLAY_UNITS_PER_METRE;
const TOWN = { lat: 53.9486, lon: -113.1067 };
const PIT_AFTER_NORTH = destinationPoint(TOWN.lat, TOWN.lon, 0, (50 * UPM) / EARTH_RADIUS);
const PIT_LL = destinationPoint(PIT_AFTER_NORTH.lat, PIT_AFTER_NORTH.lon, 90, (100 * UPM) / EARTH_RADIUS);

export default function EarthPitMarker() {
  const beamRef = useRef();
  const gemRef = useRef();
  const groupRef = useRef();

  const { position, quaternion } = useMemo(() => {
    const r = Math.max(
      surfaceRadiusOrBase(PIT_LL.lat, PIT_LL.lon),
      globeGridRadiusOrBase(PIT_LL.lat, PIT_LL.lon),
    );
    const p = latLonToVec3(PIT_LL.lat, PIT_LL.lon, r);
    const frame = tangentFrame(PIT_LL.lat, PIT_LL.lon);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z),
        new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z),
        new THREE.Vector3(-frame.north.x, -frame.north.y, -frame.north.z),
      ),
    );
    return { position: p, quaternion: q };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (beamRef.current) {
      beamRef.current.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.12;
    }
    if (gemRef.current) {
      gemRef.current.rotation.y = t * 0.9;
      gemRef.current.position.y = 12 * UPM + Math.sin(t * 1.4) * 1.5 * UPM;
    }
  });

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]} quaternion={quaternion}>
      {/* Ground ring: 6 m radius, outside the 3 m pit disc. */}
      <mesh position={[0, 0.15 * UPM, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5 * UPM, 6 * UPM, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Gold beam: 80 m tall, thin — a landmark from the spawn. */}
      <mesh ref={beamRef} position={[0, 40 * UPM, 0]}>
        <cylinderGeometry args={[0.7 * UPM, 0.7 * UPM, 80 * UPM, 12, 1, true]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Spinning diamond, 12 m up. */}
      <mesh ref={gemRef} position={[0, 12 * UPM, 0]}>
        <octahedronGeometry args={[1.6 * UPM, 0]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.95} />
      </mesh>
    </group>
  );
}
