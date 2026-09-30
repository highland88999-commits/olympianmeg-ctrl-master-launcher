// components/NavBeacons.jsx
// Waypoint beacons: tall light-beams + labels marking the distant god-tower
// constellation, the asteroid belt, and Nexus Earth — so travelers can see
// where to go from spawn. (The Moon carries its own beam in HubMoon.)
// In-world 3D markers, not UI: beams punch through fog, labels billboard.

'use client';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { BEACONS } from '@/lib/hub-layout';

function Beacon({ def }) {
  const { position, beamHeight, beamRadius, color, label, labelY } = def;
  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Light beam, centered so it rises from the waypoint */}
      <mesh position={[0, beamHeight / 2 - 20, 0]}>
        <cylinderGeometry args={[beamRadius, beamRadius * 1.6, beamHeight, 12, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Base pulse ring */}
      <mesh position={[0, -18, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[6, 8.5, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <Billboard position={[0, labelY, 0]}>
        <Text
          fontSize={14}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.5}
          outlineColor="#000000"
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}

export default function NavBeacons() {
  return (
    <group>
      {BEACONS.map((def) => (
        <Beacon key={def.id} def={def} />
      ))}
    </group>
  );
}
