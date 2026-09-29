// components/nova/DeepSpace.jsx — NOVA deep-space scenery.
//
// Starfields, procedural spiral galaxies (point clouds), soft nebula
// sprites, swirling wormhole portals, THE GIFT (boardable) and its warm
// interior chamber. Everything procedural — no external assets, no
// network, no telemetry. Reduced motion: all rotation/swirl stops.

'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Stars, Html } from '@react-three/drei';
import { GALAXIES, NEBULAE } from '@/lib/nova-flight';

// Deterministic pseudo-random so the cosmos is stable between renders.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABEL_STYLE = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.25em',
  fontSize: 11,
  color: '#e8f4ff',
  textShadow: '0 0 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)',
  fontWeight: 700,
};

function Label({ position, children, color }) {
  return (
    <Html position={position} center distanceFactor={90} style={{ ...LABEL_STYLE, ...(color ? { color } : {}) }}>
      {children}
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Starfields
// ---------------------------------------------------------------------------

export function Starfield({ seed = 7, count = 3200, radius = 600 }) {
  return <Stars key={seed} radius={radius} depth={80} count={count} factor={4} saturation={0} fade speed={0} />;
}

// ---------------------------------------------------------------------------
// Spiral galaxies — point-cloud spirals with distinct palettes
// ---------------------------------------------------------------------------

function galaxyPoints(galaxy, seed) {
  const rand = mulberry32(seed);
  const N = 1500;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const pal = galaxy.palette.map((c) => new THREE.Color(c));
  const twist = 4.6;
  for (let i = 0; i < N; i++) {
    let t = Math.pow(rand(), 0.7); // denser toward the core
    if (galaxy.ring) t = 0.55 + 0.45 * rand(); // Hollow Eye: rim-heavy, dark core
    const arm = Math.floor(rand() * galaxy.arms);
    const ang = (arm * Math.PI * 2) / galaxy.arms + t * twist + (rand() - 0.5) * 0.55;
    const r = t * galaxy.radius;
    const thick = (1 - t) * 3.2;
    positions[i * 3] = Math.cos(ang) * r + (rand() - 0.5) * thick;
    positions[i * 3 + 1] = (rand() - 0.5) * thick * 0.7;
    positions[i * 3 + 2] = Math.sin(ang) * r + (rand() - 0.5) * thick;
    const c = pal[Math.min(pal.length - 1, Math.floor(t * pal.length))];
    const b = 0.55 + rand() * 0.45;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
  }
  return { positions, colors };
}

export function SpiralGalaxy({ galaxy, reduced = false, seed = 100 }) {
  const group = useRef(null);
  const geom = useMemo(() => {
    const { positions, colors } = galaxyPoints(galaxy, seed);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [galaxy, seed]);

  useFrame((_, dt) => {
    if (!reduced && group.current) group.current.rotation.y += (galaxy.spin || 0.015) * dt;
  });

  return (
    <group position={[galaxy.pos.x, galaxy.pos.y, galaxy.pos.z]}>
      <group ref={group} rotation={[0.35, 0, 0.15]}>
        <points geometry={geom}>
          <pointsMaterial
            size={1.1}
            vertexColors
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            sizeAttenuation
          />
        </points>
        {/* bright core */}
        <mesh>
          <sphereGeometry args={[galaxy.radius * 0.09, 16, 16]} />
          <meshBasicMaterial color={galaxy.palette[galaxy.palette.length - 1]} transparent opacity={0.85} />
        </mesh>
      </group>
      <Label position={[0, galaxy.radius + 7, 0]}>{galaxy.name}</Label>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Nebulae — soft additive sprite clouds
// ---------------------------------------------------------------------------

function nebulaTexture(palette, seed) {
  const rand = mulberry32(seed);
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const c0 = palette[Math.floor(rand() * palette.length)];
  const c1 = palette[Math.floor(rand() * palette.length)];
  g.addColorStop(0, c0 + 'cc');
  g.addColorStop(0.45, c1 + '66');
  g.addColorStop(1, c0 + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Nebula({ nebula, seed = 500 }) {
  const sprites = useMemo(() => {
    if (typeof document === 'undefined') return [];
    const rand = mulberry32(seed);
    const list = [];
    for (let i = 0; i < 5; i++) {
      list.push({
        tex: nebulaTexture(nebula.palette, seed + i * 17),
        offset: [
          (rand() - 0.5) * nebula.radius,
          (rand() - 0.5) * nebula.radius * 0.6,
          (rand() - 0.5) * nebula.radius,
        ],
        scale: nebula.radius * (0.9 + rand() * 0.7),
        opacity: 0.14 + rand() * 0.1,
      });
    }
    return list;
  }, [nebula, seed]);

  return (
    <group position={[nebula.pos.x, nebula.pos.y, nebula.pos.z]}>
      {sprites.map((s, i) => (
        <sprite key={i} position={s.offset} scale={[s.scale, s.scale, 1]}>
          <spriteMaterial
            map={s.tex}
            transparent
            opacity={s.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
      <Label position={[0, nebula.radius * 0.9, 0]} color="#d8ccff">
        {nebula.name}
      </Label>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Wormholes — swirling ring portals
// ---------------------------------------------------------------------------

const WORMHOLE_COLORS = ['#22d3ee', '#a78bfa', '#fbbf24'];

function discPoints(radius, count, seed) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rand()) * radius;
    const a = rand() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = (rand() - 0.5) * 1.2;
  }
  return positions;
}

export function Wormhole({ wormhole, index = 0, reduced = false }) {
  const disc = useRef(null);
  const color = WORMHOLE_COLORS[index % WORMHOLE_COLORS.length];
  const R = wormhole.radius;
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(discPoints(R * 0.92, 320, 900 + index * 31), 3));
    return g;
  }, [R, index]);

  useFrame((_, dt) => {
    if (!reduced && disc.current) disc.current.rotation.z += dt * 1.4;
  });

  return (
    <group position={[wormhole.pos.x, wormhole.pos.y, wormhole.pos.z]}>
      {/* ring */}
      <mesh>
        <torusGeometry args={[R, 0.55, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
      <mesh>
        <torusGeometry args={[R, 1.1, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} />
      </mesh>
      {/* swirling particle disc */}
      <points ref={disc} geometry={geom}>
        <pointsMaterial
          size={0.7}
          color={color}
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
      <Label position={[0, R + 5, 0]} color={color}>
        → {wormhole.label}
      </Label>
    </group>
  );
}

// ---------------------------------------------------------------------------
// THE GIFT — colossal floating gift box (exterior)
// ---------------------------------------------------------------------------

export function TheGift({ position, reduced = false }) {
  const group = useRef(null);
  useFrame((_, dt) => {
    if (!reduced && group.current) group.current.rotation.y += dt * 0.06;
  });

  const boxColor = '#7f1d2e'; // deep crimson
  const ribbonColor = '#f5c542'; // gold

  return (
    <group position={[position.x, position.y, position.z]}>
      <group ref={group}>
        {/* body */}
        <mesh>
          <boxGeometry args={[24, 20, 24]} />
          <meshStandardMaterial
            color={boxColor}
            roughness={0.5}
            metalness={0.25}
            emissive="#3b0a14"
            emissiveIntensity={0.55}
          />
        </mesh>
        {/* lid */}
        <mesh position={[0, 11.5, 0]}>
          <boxGeometry args={[26, 4, 26]} />
          <meshStandardMaterial
            color="#96263a"
            roughness={0.45}
            metalness={0.25}
            emissive="#3b0a14"
            emissiveIntensity={0.55}
          />
        </mesh>
        {/* ribbon cross */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[24.6, 21, 2.6]} />
          <meshStandardMaterial color={ribbonColor} roughness={0.35} metalness={0.6} emissive="#6b4a08" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2.6, 21, 24.6]} />
          <meshStandardMaterial color={ribbonColor} roughness={0.35} metalness={0.6} emissive="#6b4a08" emissiveIntensity={0.4} />
        </mesh>
        {/* bow: two loops + knot */}
        {[-1, 1].map((s, i) => (
          <mesh key={i} position={[s * 3.4, 15.6, 0]} rotation={[0, 0, s * 0.5]}>
            <torusGeometry args={[2.6, 1.0, 12, 24]} />
            <meshStandardMaterial color={ribbonColor} roughness={0.35} metalness={0.6} emissive="#6b4a08" emissiveIntensity={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 15.2, 0]}>
          <sphereGeometry args={[1.6, 16, 16]} />
          <meshStandardMaterial color={ribbonColor} roughness={0.35} metalness={0.6} emissive="#6b4a08" emissiveIntensity={0.4} />
        </mesh>
      </group>
      <Label position={[0, 19, 0]} color="#f5c542">
        The Gift — fly close to board
      </Label>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Gift interior — serene warm chamber with a golden star
// ---------------------------------------------------------------------------

function dustPoints(count, seed) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 6 + rand() * 26;
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
    positions[i * 3 + 1] = r * Math.cos(ph) * 0.6;
    positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  return positions;
}

export function GiftInterior({ reduced = false }) {
  const star = useRef(null);
  const dust = useRef(null);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dustPoints(400, 4242), 3));
    return g;
  }, []);

  useFrame((state, dt) => {
    if (reduced) return;
    if (star.current) {
      star.current.rotation.y += dt * 0.25;
      star.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
    }
    if (dust.current) dust.current.rotation.y += dt * 0.01;
  });

  return (
    <group>
      {/* chamber shell */}
      <mesh>
        <sphereGeometry args={[42, 32, 32]} />
        <meshBasicMaterial color="#241105" side={THREE.BackSide} />
      </mesh>
      <ambientLight intensity={0.7} color="#ffdcb0" />
      <pointLight position={[0, 4, 0]} intensity={60} distance={90} color="#ffbe6e" decay={1.6} />
      <pointLight position={[0, -14, 10]} intensity={20} distance={60} color="#ff9d5c" decay={1.8} />

      {/* the golden star */}
      <mesh ref={star} position={[0, 6, -8]}>
        <icosahedronGeometry args={[4.5, 0]} />
        <meshStandardMaterial
          color="#ffd34d"
          emissive="#ffb300"
          emissiveIntensity={1.6}
          roughness={0.25}
          metalness={0.7}
        />
      </mesh>
      {/* halo */}
      <sprite position={[0, 6, -8]} scale={[22, 22, 1]}>
        <spriteMaterial
          color="#ffcf6e"
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* drifting motes */}
      <points ref={dust} geometry={geom}>
        <pointsMaterial
          size={0.35}
          color="#ffd9a0"
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* warm floor glow */}
      <mesh position={[0, -16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[20, 32]} />
        <meshBasicMaterial color="#8a4a1a" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Convenience: all galaxies / nebulae in Spiral Reach.
export function SpiralReachField({ reduced = false }) {
  return (
    <group>
      {GALAXIES.map((g, i) => (
        <SpiralGalaxy key={g.key} galaxy={g} reduced={reduced} seed={100 + i * 77} />
      ))}
      {NEBULAE.map((n, i) => (
        <Nebula key={n.key} nebula={n} seed={500 + i * 131} />
      ))}
    </group>
  );
}
