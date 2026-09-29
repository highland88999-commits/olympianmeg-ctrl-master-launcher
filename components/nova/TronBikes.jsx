// components/nova/TronBikes.jsx — NOVA tron bikes.
//
// Merlin's signature single-rider space bikes. Shared design language:
// nose points +Z, narrow elongated frame, glass rider canopy, two side
// trim-thruster pods (cylinders with glow discs), one accent stripe, small
// engine glow at the stern. No bloom, no postprocessing — glows stay local
// so the deep-space backdrop stays readable.

'use client';

import * as THREE from 'three';

function Paint() {
  return (
    <meshPhysicalMaterial
      color="#0b1220"
      metalness={0.75}
      roughness={0.28}
      clearcoat={1.0}
      clearcoatRoughness={0.12}
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

// Side trim-thruster pods: horizontal cylinders, glow disc on each end.
// This is the tron bike's signature silhouette.
function TrimThrusterPods({ color = '#00ffcc', xOffset = 0.85, scale = 1 }) {
  return (
    <group>
      {[xOffset, -xOffset].map((x, i) => (
        <group key={i} position={[x, 0.55, -0.2]} scale={scale}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.22, 0.26, 1.1, 20]} />
            <PodShell />
          </mesh>
          {/* front glow disc */}
          <mesh position={[0, 0, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          {/* rear glow disc */}
          <mesh position={[0, 0, -0.58]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// One accent stripe along the spine.
function AccentStripe({ color = '#00ffcc', y = 0.62, length = 2.62, width = 0.46 }) {
  return (
    <mesh position={[0, y, 0.1]}>
      <boxGeometry args={[width, 0.05, length]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} />
    </mesh>
  );
}

// Engine glow: a single small disc at the stern (-Z). Local only.
function EngineGlow({ color = '#00ffcc', y = 0.5, r = 0.14, z = -1.35 }) {
  return (
    <mesh position={[0, y, z]}>
      <circleGeometry args={[r, 20]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

// WISP — agile scout. Slim swept frame, small canopy, tight pods.
export function WispBike({ color = '#00ffcc' }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0.1]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[0.42, 0.34, 2.6]} />
        <Paint />
      </mesh>
      {/* swept nose fins */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[s * 0.3, 0.55, 0.95]} rotation={[0, s * 0.35, 0]}>
          <boxGeometry args={[0.08, 0.3, 0.7]} />
          <Paint />
        </mesh>
      ))}
      {/* glass rider canopy */}
      <mesh position={[0, 0.95, 0.35]}>
        <sphereGeometry args={[0.3, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glass />
      </mesh>
      <AccentStripe color={color} />
      <EngineGlow color={color} />
      <TrimThrusterPods color={color} xOffset={0.8} />
    </group>
  );
}

// COMET — balanced all-rounder. A touch longer, chin intake, mid pods.
export function CometBike({ color = '#38bdf8' }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.55, 0.42, 2.9]} />
        <Paint />
      </mesh>
      {/* chin intake */}
      <mesh position={[0, 0.35, 0.9]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.18, 0.5, 0.9]} />
        <PodShell />
      </mesh>
      {/* glass rider canopy */}
      <mesh position={[0, 0.98, 0.3]}>
        <sphereGeometry args={[0.36, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glass />
      </mesh>
      <AccentStripe color={color} y={0.62} length={2.92} width={0.59} />
      <EngineGlow color={color} y={0.55} r={0.18} z={-1.5} />
      <TrimThrusterPods color={color} xOffset={0.95} />
    </group>
  );
}

// ATLAS — heavy hauler. Broad armored frame, big canopy, oversized pods,
// twin stern thrusters. Slow, planted, unstoppable.
export function AtlasBike({ color = '#f59e0b' }) {
  return (
    <group>
      {/* broad armored hull */}
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[0.95, 0.6, 3.1]} />
        <Paint />
      </mesh>
      {/* armor shoulders */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[s * 0.62, 0.75, 0.2]}>
          <boxGeometry args={[0.28, 0.5, 1.6]} />
          <Paint />
        </mesh>
      ))}
      {/* big glass rider canopy */}
      <mesh position={[0, 1.1, 0.25]}>
        <sphereGeometry args={[0.45, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glass />
      </mesh>
      {/* roll bar over the canopy */}
      <mesh position={[0, 1.25, -0.35]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.9, 0.12, 0.5]} />
        <PodShell />
      </mesh>
      <AccentStripe color={color} y={0.72} length={3.12} width={0.99} />
      {/* twin stern thrusters */}
      {[-0.22, 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0.6, -1.58]}>
          <circleGeometry args={[0.16, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <TrimThrusterPods color={color} xOffset={1.15} scale={1.25} />
    </group>
  );
}

// Garage registry. Description is one plain-English line.
export const TRON_BIKES = [
  { key: 'wisp', name: 'Wisp', desc: 'Agile scout — fastest off the line, twitchy.', color: '#00ffcc', Cmp: WispBike },
  { key: 'comet', name: 'Comet', desc: 'Balanced all-rounder — steady and sharp.', color: '#38bdf8', Cmp: CometBike },
  { key: 'atlas', name: 'Atlas', desc: 'Heavy hauler — slow, planted, unstoppable.', color: '#f59e0b', Cmp: AtlasBike },
];

export function bikeByKey(key) {
  return TRON_BIKES.find((b) => b.key === key) || TRON_BIKES[0];
}
