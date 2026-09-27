// COLOSSEUM — the Pit: three.js arena via @react-three/fiber.
// Procedural everything: canvas textures, instanced pillars, no hotlinks.
// Lighting is deliberately restrained (Merlin's rule): dim ambient + one
// warm point + one cool directional, no bloom postprocessing.
'use client';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PIT_RADIUS, ENEMY_TYPES } from '@/lib/colosseum/game';

const TYPE_COLORS = Object.fromEntries(
  Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.color])
);
const TYPE_SCALES = Object.fromEntries(
  Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.scale])
);

function makePitTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  // dark stone base
  g.fillStyle = '#141318';
  g.fillRect(0, 0, 512, 512);
  // radial flagstone rings
  for (let r = 40; r < 260; r += 36) {
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
  }
  // spokes
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 40, 256 + Math.sin(a) * 40);
    g.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256);
    g.stroke();
  }
  // glowing rune ring (subtle)
  g.strokeStyle = 'rgba(45,212,191,0.35)';
  g.lineWidth = 5;
  g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(45,212,191,0.18)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(256, 256, 216, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function Arena() {
  const pitTex = useMemo(() => (typeof document !== 'undefined' ? makePitTexture() : null), []);
  const holo = useRef();
  const orbit1 = useRef();
  const orbit2 = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (holo.current) {
      holo.current.rotation.y = t * 0.8;
      holo.current.rotation.x = t * 0.5;
      holo.current.position.y = 9 + Math.sin(t * 1.6) * 0.8;
    }
    if (orbit1.current) orbit1.current.rotation.z = t * 0.6;
    if (orbit2.current) orbit2.current.rotation.z = -t * 0.4;
  });

  const tiers = [
    { radius: 44, y: 0, trim: '#2dd4bf' },
    { radius: 40, y: 5, trim: '#e879f9' },
    { radius: 36, y: 10, trim: '#2dd4bf' },
  ];
  const pillarCount = 48;

  return (
    <group>
      {/* lights: restrained */}
      <ambientLight intensity={0.35} color="#8888aa" />
      <pointLight position={[0, 12, 0]} intensity={60} color="#ff9a5c" distance={70} />
      <directionalLight position={[-30, 40, 20]} intensity={0.7} color="#9db8ff" />

      {/* pit floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <circleGeometry args={[PIT_RADIUS, 64]} />
        <meshStandardMaterial map={pitTex} roughness={0.85} metalness={0.25} />
      </mesh>
      {/* outer ground */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.2, 0]}>
        <circleGeometry args={[90, 32]} />
        <meshStandardMaterial color="#0a0a0e" roughness={1} />
      </mesh>

      {/* tiers: instanced pillars + trim rings */}
      {tiers.map((tier, ti) => (
        <group key={ti}>
          <mesh rotation-x={-Math.PI / 2} position={[0, tier.y, 0]}>
            <ringGeometry args={[tier.radius - 3, tier.radius + 0.6, 64]} />
            <meshBasicMaterial color={tier.trim} transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
          {Array.from({ length: pillarCount }).map((_, i) => {
            const a = (i / pillarCount) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * tier.radius, tier.y + 2.5, Math.sin(a) * tier.radius]}
                rotation-y={-a}
              >
                <boxGeometry args={[1.2, 5, 2.2]} />
                <meshStandardMaterial color="#17171f" roughness={0.6} metalness={0.6} />
              </mesh>
            );
          })}
        </group>
      ))}

      {/* inner arena wall */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[PIT_RADIUS + 1.5, PIT_RADIUS + 1.5, 5, 64, 1, true]} />
        <meshStandardMaterial color="#101016" roughness={0.7} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* central hologram: the Eye */}
      <group>
        <mesh ref={holo}>
          <octahedronGeometry args={[2.2, 0]} />
          <meshStandardMaterial color="#2dd4bf" emissive="#2dd4bf" emissiveIntensity={0.9} wireframe />
        </mesh>
        <mesh ref={orbit1} position={[0, 9, 0]} rotation-x={Math.PI / 2.4}>
          <torusGeometry args={[4.2, 0.12, 8, 48]} />
          <meshBasicMaterial color="#2dd4bf" transparent opacity={0.55} />
        </mesh>
        <mesh ref={orbit2} position={[0, 9, 0]} rotation-x={-Math.PI / 3}>
          <torusGeometry args={[5.4, 0.1, 8, 48]} />
          <meshBasicMaterial color="#e879f9" transparent opacity={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function Gladiator({ x, z, color, scale = 1, staggered, hitFlash, enraged, onStrike }) {
  const s = scale;
  const bodyColor = hitFlash > 0 ? '#ffffff' : color;
  return (
    <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); onStrike(); }}>
      {/* fat transparent hit-target for touch */}
      <mesh position={[0, 1.6 * s, 0]}>
        <cylinderGeometry args={[2.2 * s, 2.2 * s, 4.4 * s, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.1 * s, 0]}>
        <cylinderGeometry args={[0.55 * s, 0.75 * s, 2.2 * s, 10]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={staggered ? '#eab308' : enraged ? '#ef4444' : bodyColor}
          emissiveIntensity={staggered ? 1.2 : enraged ? 0.8 : 0.25}
          roughness={0.6}
        />
      </mesh>
      <mesh position={[0, 2.6 * s, 0]}>
        <sphereGeometry args={[0.5 * s, 12, 10]} />
        <meshStandardMaterial color={bodyColor} emissive={staggered ? '#eab308' : '#000000'} emissiveIntensity={staggered ? 1.2 : 0} roughness={0.5} />
      </mesh>
      {/* blade */}
      <mesh position={[0.9 * s, 1.6 * s, 0]} rotation-z={-0.5}>
        <boxGeometry args={[0.12 * s, 1.8 * s, 0.3 * s]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.3} />
      </mesh>
      {staggered && (
        <mesh position={[0, 3.6 * s, 0]}>
          <sphereGeometry args={[0.32 * s, 8, 8]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
      )}
    </group>
  );
}

function PlayerFigure() {
  const ref = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.position.y = Math.sin(t * 2.2) * 0.12;
  });
  return (
    <group ref={ref} position={[0, 0, 0]}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.6, 0.8, 2.2, 10]} />
        <meshStandardMaterial color="#2dd4bf" emissive="#2dd4bf" emissiveIntensity={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <sphereGeometry args={[0.52, 12, 10]} />
        <meshStandardMaterial color="#5eead4" roughness={0.4} />
      </mesh>
      {/* plumed helm */}
      <mesh position={[0, 3.15, 0]}>
        <boxGeometry args={[0.18, 0.5, 0.9]} />
        <meshStandardMaterial color="#e879f9" emissive="#e879f9" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[1.0, 1.7, 0]} rotation-z={-0.9}>
        <boxGeometry args={[0.14, 2.4, 0.34]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Effects({ effects }) {
  return (
    <group>
      {effects.map((fx) => {
        const k = fx.t / fx.ttl;
        if (fx.kind === 'burst') {
          return (
            <mesh key={fx.id} position={[fx.x, 1.4, fx.z]}>
              <sphereGeometry args={[0.4 + k * 2.2, 12, 10]} />
              <meshBasicMaterial color={fx.color || '#ffffff'} transparent opacity={0.75 * (1 - k)} />
            </mesh>
          );
        }
        if (fx.kind === 'shockwave') {
          return (
            <mesh key={fx.id} position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[2 + k * 4, 4 + k * 30, 48]} />
              <meshBasicMaterial color="#2dd4bf" transparent opacity={0.8 * (1 - k)} side={THREE.DoubleSide} />
            </mesh>
          );
        }
        return null;
      })}
    </group>
  );
}

function Scene({ game, snap }) {
  const angle = useRef(0.6);
  useFrame(({ camera, clock }, dt) => {
    // advance the simulation
    game.update(Math.min(dt, 0.1));
    // slow dramatic orbit
    angle.current += dt * 0.07;
    const r = 44;
    camera.position.set(
      Math.sin(angle.current) * r,
      30,
      Math.cos(angle.current) * r
    );
    camera.lookAt(0, 3, 0);
  });

  return (
    <>
      <Arena />
      <PlayerFigure />
      {snap.enemies.map((e) => (
        <Gladiator
          key={e.id}
          x={e.x}
          z={e.z}
          color={TYPE_COLORS[e.type] || '#ffffff'}
          scale={TYPE_SCALES[e.type] || 1}
          staggered={e.staggered}
          hitFlash={e.hitFlash}
          enraged={e.enraged}
          onStrike={() => game.strike(e.id)}
        />
      ))}
      <Effects effects={snap.effects} />
    </>
  );
}

export function Pit({ game, snap }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.5, far: 400, position: [26, 30, 36] }}
      style={{ touchAction: 'none' }}
    >
      <Scene game={game} snap={snap} />
    </Canvas>
  );
}
