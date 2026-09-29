// components/argo/VehicleArchetypes.jsx — ARGO fleet skycraft.
//
// Ported from Merlin's omega-fleet VehicleArchetypes.tsx (olympianmeg-ctrl
// account), adapted for flight: the ground-car wheels are replaced with
// hover pods, and each hull carries a small local engine glow. No bloom,
// no postprocessing — glow stays on the vehicle so the Earth textures
// underneath stay readable.
//
// Convention: nose points along +Z. The flight rig orients +Z along the
// velocity vector with up = away-from-Earth-center (see app/argo/page.jsx).

'use client';

import * as THREE from 'three';

function Paint() {
  return (
    <meshPhysicalMaterial
      color="#0f172a"
      metalness={0.7}
      roughness={0.3}
      clearcoat={1.0}
      clearcoatRoughness={0.1}
    />
  );
}

function Glass() {
  return (
    <meshPhysicalMaterial
      color="#0a1420"
      metalness={0.9}
      roughness={0.08}
      clearcoat={1.0}
    />
  );
}

function PodShell() {
  return <meshStandardMaterial color="#05070c" roughness={0.85} />;
}

// Hover pod: replaces the ground-car wheel. Small, local, no light spill.
function HoverPods({ color = '#00d4ff', scale = 1, xOffset = 1.35, zOffset = 1.5 }) {
  const spots = [
    [xOffset, zOffset],
    [-xOffset, zOffset],
    [xOffset, -zOffset],
    [-xOffset, -zOffset],
  ];
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0.28 * scale, z]} scale={scale}>
          <mesh>
            <cylinderGeometry args={[0.32, 0.4, 0.3, 24]} />
            <PodShell />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.04, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AccentStripe({ color = '#00d4ff', y = 0.9, length = 4.45, width = 2.15 }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[width, 0.05, length]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} />
    </mesh>
  );
}

// Engine glow: two small emissive discs at the stern (-Z). Local only.
function EngineGlow({ color = '#00d4ff', y = 0.7, spread = 0.6 }) {
  return (
    <group position={[0, y, -2.2]}>
      {[-spread, spread].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, 0]}>
          <circleGeometry args={[0.22, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function SkiffArchetype({ color = '#00d4ff' }) {
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[2.1, 0.65, 4.4]} />
        <Paint />
      </mesh>
      <mesh position={[0, 1.25, -0.3]}>
        <boxGeometry args={[1.8, 0.7, 2.6]} />
        <Glass />
      </mesh>
      <AccentStripe color={color} y={0.9} length={4.45} width={2.15} />
      <EngineGlow color={color} y={0.7} spread={0.55} />
      <HoverPods color={color} />
    </group>
  );
}

export function CruiserArchetype({ color = '#38bdf8' }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[2.1, 0.6, 4.8]} />
        <Paint />
      </mesh>
      <mesh position={[0, 1.15, -0.2]}>
        <boxGeometry args={[1.7, 0.6, 2.4]} />
        <Glass />
      </mesh>
      <AccentStripe color={color} y={0.85} length={4.85} width={2.15} />
      <EngineGlow color={color} y={0.65} spread={0.55} />
      <HoverPods color={color} xOffset={1.4} zOffset={1.6} />
    </group>
  );
}

export function HaulerArchetype({ color = '#f59e0b' }) {
  return (
    <group>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[2.2, 0.8, 4.6]} />
        <Paint />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[1.9, 0.8, 3.2]} />
        <Glass />
      </mesh>
      <AccentStripe color={color} y={1.2} length={4.65} width={2.25} />
      <EngineGlow color={color} y={0.9} spread={0.6} />
      <HoverPods color={color} scale={1.2} xOffset={1.35} zOffset={1.55} />
    </group>
  );
}

export function TitanArchetype({ color = '#a78bfa' }) {
  return (
    <group>
      <mesh position={[0, 0.75, 1.2]}>
        <boxGeometry args={[2.2, 0.7, 2.0]} />
        <Paint />
      </mesh>
      <mesh position={[0, 0.6, -1.1]}>
        <boxGeometry args={[2.2, 0.4, 2.6]} />
        <Paint />
      </mesh>
      <mesh position={[0, 1.45, 1.2]}>
        <boxGeometry args={[1.9, 0.7, 1.8]} />
        <Glass />
      </mesh>
      <AccentStripe color={color} y={1.1} length={2.05} width={2.25} />
      <EngineGlow color={color} y={0.7} spread={0.6} />
      <HoverPods color={color} xOffset={1.35} zOffset={1.5} />
    </group>
  );
}

export function DartArchetype({ color = '#00ff88' }) {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.7, 0.6, 2.4]} />
        <Paint />
      </mesh>
      <mesh position={[0, 1.1, 0.6]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.5, 0.4, 0.1]} />
        <Glass />
      </mesh>
      <mesh position={[0, 0.85, -0.6]}>
        <boxGeometry args={[0.5, 0.2, 1.2]} />
        <meshStandardMaterial color="#050505" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.75, 0.05, 2.45]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      <group position={[0, 0.45, -1.25]}>
        <mesh>
          <circleGeometry args={[0.2, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <HoverPods color={color} scale={0.55} xOffset={0.45} zOffset={0.9} />
    </group>
  );
}

// --- Tron bikes: Merlin's signature single-rider space bikes. Narrow
// elongated frame, glass rider canopy, two side trim-thruster pods with glow
// discs, engine glow at the stern. Nose +Z like the rest of the fleet.
function TrimThrusterPods({ color = '#00ffcc', xOffset = 0.85 }) {
  return (
    <group>
      {[xOffset, -xOffset].map((x, i) => (
        <group key={i} position={[x, 0.55, -0.2]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.22, 0.26, 1.1, 20]} />
            <PodShell />
          </mesh>
          <mesh position={[0, 0, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, -0.58]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function WispArchetype({ color = '#00ffcc' }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0.1]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[0.42, 0.34, 2.6]} />
        <Paint />
      </mesh>
      <mesh position={[0, 0.95, 0.35]}>
        <sphereGeometry args={[0.3, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glass />
      </mesh>
      <mesh position={[0, 0.62, 0.1]}>
        <boxGeometry args={[0.46, 0.05, 2.62]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 0.5, -1.35]}>
        <circleGeometry args={[0.14, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <TrimThrusterPods color={color} xOffset={0.8} />
    </group>
  );
}

export function CometArchetype({ color = '#38bdf8' }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.55, 0.42, 2.9]} />
        <Paint />
      </mesh>
      <mesh position={[0, 0.98, 0.3]}>
        <sphereGeometry args={[0.36, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glass />
      </mesh>
      <mesh position={[0, 0.35, 0.9]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.18, 0.5, 0.9]} />
        <PodShell />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.59, 0.05, 2.92]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 0.55, -1.5]}>
        <circleGeometry args={[0.18, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <TrimThrusterPods color={color} xOffset={0.95} />
    </group>
  );
}

// Fleet registry for the staging dock UI. Description is one plain-English line.
export const FLEET = [
  { key: 'skiff', name: 'Skiff', desc: 'Nimble courier, quick off the dock.', color: '#00d4ff', Cmp: SkiffArchetype },
  { key: 'cruiser', name: 'Cruiser', desc: 'Long-range flyer, smooth and steady.', color: '#38bdf8', Cmp: CruiserArchetype },
  { key: 'hauler', name: 'Hauler', desc: 'Heavy lifter for the big loads.', color: '#f59e0b', Cmp: HaulerArchetype },
  { key: 'titan', name: 'Titan', desc: 'The workhorse of the fleet.', color: '#a78bfa', Cmp: TitanArchetype },
  { key: 'dart', name: 'Dart', desc: 'Interceptor — fastest thing in the sky.', color: '#00ff88', Cmp: DartArchetype },
  { key: 'wisp', name: 'Tron bike · Wisp', desc: "Merlin's agile scout bike — fastest off the line.", color: '#00ffcc', Cmp: WispArchetype },
  { key: 'comet', name: 'Tron bike · Comet', desc: "Merlin's balanced bike — steady and sharp.", color: '#38bdf8', Cmp: CometArchetype },
];

export function fleetByKey(key) {
  return FLEET.find((v) => v.key === key) || FLEET[0];
}
