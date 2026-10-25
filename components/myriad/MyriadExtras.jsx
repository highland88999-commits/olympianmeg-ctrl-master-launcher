// components/myriad/MyriadExtras.jsx — MYRIAD upgrade scenery.
//
// New wonder + find renderers, the landing ground, and the walk rig for
// the MYRIAD upgrade (missions + free roam, landing + walking, new
// wonders, polish). Only MYRIAD uses this file: the shared NOVA scenery
// components are untouched. All motion respects `reduced`.

'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/myriad-universes';
import { WALK_RADIUS } from '@/lib/myriad-wonders';
import { createWalker, stepWalker, applyLook } from '@/lib/world/walk-controls';

export { createWalker, applyLook };

function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function glowTextureFor(color) {
  if (typeof document === 'undefined') return null;
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, hexA(color, 0.9));
  g.addColorStop(0.4, hexA(color, 0.35));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function SiteGlow({ position, color, size }) {
  const tex = useMemo(() => glowTextureFor(color), [color]);
  if (!tex) return null;
  return (
    <sprite position={position} scale={[size, size, 1]}>
      <spriteMaterial map={tex} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

function SiteLabel({ position, color, children }) {
  return (
    <Html
      position={position}
      center
      distanceFactor={90}
      style={{
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        letterSpacing: '0.25em',
        fontSize: 11,
        color: color || '#e8f4ff',
        textShadow: '0 0 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)',
        fontWeight: 700,
      }}
    >
      {children}
    </Html>
  );
}

// --- new wonders ------------------------------------------------------------

export function AuroraVeil({ site, reduced }) {
  const grp = useRef(null);
  useFrame((state) => {
    if (!reduced && grp.current) grp.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.25) * 0.04;
  });
  return (
    <group position={[site.pos.x, site.pos.y, site.pos.z]}>
      <group ref={grp}>
        {[-12, 0, 12].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} rotation={[0, (i - 1) * 0.35, 0]}>
            <planeGeometry args={[26, 18]} />
            <meshBasicMaterial
              color={i === 1 ? '#e0f2fe' : site.color}
              transparent
              opacity={i === 1 ? 0.2 : 0.13}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
      <SiteGlow position={[0, 0, 0]} color={site.color} size={44} />
      <SiteLabel position={[0, 14, 0]} color={site.color}>
        Aurora Veil
      </SiteLabel>
    </group>
  );
}

export function CometSwarm({ site, seed, reduced }) {
  const grp = useRef(null);
  const comets = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: 7 }, (_, i) => ({
      angle: (i / 7) * Math.PI * 2 + rand() * 0.5,
      radius: 13 + rand() * 7,
      y: (rand() - 0.5) * 8,
      s: 0.7 + rand() * 0.8,
    }));
  }, [seed]);
  useFrame((_, dt) => {
    if (!reduced && grp.current) grp.current.rotation.y += dt * 0.06;
  });
  return (
    <group position={[site.pos.x, site.pos.y, site.pos.z]}>
      <group ref={grp}>
        {comets.map((c, i) => (
          <group
            key={i}
            position={[Math.cos(c.angle) * c.radius, c.y, Math.sin(c.angle) * c.radius]}
            rotation={[0, -c.angle, 0]}
          >
            <mesh scale={[c.s * 0.6, c.s * 0.6, c.s * 2.4]}>
              <sphereGeometry args={[1, 12, 12]} />
              <meshBasicMaterial color="#fdba74" transparent opacity={0.95} />
            </mesh>
          </group>
        ))}
      </group>
      <SiteGlow position={[0, 0, 0]} color={site.color} size={36} />
      <SiteLabel position={[0, 13, 0]} color={site.color}>
        Comet Swarm
      </SiteLabel>
    </group>
  );
}

export function EchoReef({ site, seed }) {
  const spires = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: 8 }, (_, i) => ({
      angle: (i / 8) * Math.PI * 2,
      h: 7 + rand() * 7,
      r: 10 + rand() * 2,
    }));
  }, [seed]);
  return (
    <group position={[site.pos.x, site.pos.y, site.pos.z]}>
      {spires.map((s, i) => (
        <mesh
          key={i}
          position={[Math.cos(s.angle) * s.r, s.h / 2 - 1, Math.sin(s.angle) * s.r]}
        >
          <coneGeometry args={[1.4, s.h, 6]} />
          <meshStandardMaterial color="#ddd6fe" roughness={0.3} metalness={0.4} emissive="#7c3aed" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <SiteGlow position={[0, 0, 0]} color={site.color} size={34} />
      <SiteLabel position={[0, 13, 0]} color={site.color}>
        Echo Reef
      </SiteLabel>
    </group>
  );
}

// --- finds ------------------------------------------------------------------

export function DerelictStation({ site }) {
  return (
    <group position={[site.pos.x, site.pos.y, site.pos.z]}>
      <mesh>
        <boxGeometry args={[9, 2.5, 9]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[8, 0.7, 10, 32]} />
        <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.6} />
      </mesh>
      {[0, Math.PI / 2].map((r, i) => (
        <mesh key={i} rotation={[0, r, 0]}>
          <boxGeometry args={[13, 1, 1]} />
          <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {[-4, 0, 4].map((x, i) => (
        <mesh key={i} position={[x, 1.6, 4.6]}>
          <sphereGeometry args={[0.35, 8, 8]} />
          <meshBasicMaterial color="#fca5a5" />
        </mesh>
      ))}
      <SiteGlow position={[0, 0, 0]} color={site.color} size={26} />
    </group>
  );
}

export function SignalSource({ site, reduced }) {
  const ring = useRef(null);
  useFrame((state) => {
    if (!reduced && ring.current) {
      const t = state.clock.elapsedTime % 2;
      ring.current.scale.setScalar(1 + t * 0.7);
    }
  });
  return (
    <group position={[site.pos.x, site.pos.y, site.pos.z]}>
      <mesh>
        <octahedronGeometry args={[1.6, 0]} />
        <meshBasicMaterial color="#86efac" />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.2, 2.7, 32]} />
        <meshBasicMaterial color="#86efac" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SiteGlow position={[0, 0, 0]} color={site.color} size={20} />
    </group>
  );
}

export function Phenomenon({ site, seed, reduced }) {
  const grp = useRef(null);
  const sparks = useMemo(() => {
    const rand = mulberry32(seed);
    const positions = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) {
      positions[i * 3] = (rand() - 0.5) * 16;
      positions[i * 3 + 1] = (rand() - 0.5) * 16;
      positions[i * 3 + 2] = (rand() - 0.5) * 16;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [seed]);
  useFrame((_, dt) => {
    if (!reduced && grp.current) grp.current.rotation.y += dt * 0.25;
  });
  return (
    <group position={[site.pos.x, site.pos.y, site.pos.z]}>
      <group ref={grp}>
        <mesh rotation={[0.6, 0, 0.3]}>
          <torusGeometry args={[6, 0.25, 8, 40]} />
          <meshBasicMaterial color={site.color} transparent opacity={0.9} />
        </mesh>
        <points geometry={sparks}>
          <pointsMaterial size={0.8} color="#ffffff" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>
      <SiteGlow position={[0, 0, 0]} color={site.color} size={24} />
    </group>
  );
}

// --- proximity: fly near a site to find it -----------------------------------

export function SiteProximity({ sites, flightRef, universeId, onEnter }) {
  const entered = useRef(new Set());
  useEffect(() => {
    entered.current = new Set();
  }, [universeId]);
  useFrame(() => {
    const p = flightRef.current.pos;
    for (const s of sites) {
      const key = `${universeId}:${s.id}`;
      if (entered.current.has(key)) continue;
      const d = Math.hypot(p.x - s.pos.x, p.y - s.pos.y, p.z - s.pos.z);
      if (d < s.radius + 6) {
        entered.current.add(key);
        onEnter(s);
      }
    }
  });
  return null;
}

// --- landing ground -----------------------------------------------------------
// One layout function feeds BOTH the visuals and the walk colliders, so
// what you see is always what blocks you.
export function propLayout(prop) {
  if (prop === 'spires') {
    return Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return { x: Math.cos(a) * 12, z: Math.sin(a) * 12, r: 1.6 };
    });
  }
  if (prop === 'deck') {
    return [
      { x: -8, z: -6, r: 1.8 },
      { x: 8, z: -6, r: 1.8 },
      { x: -8, z: 7, r: 1.8 },
      { x: 8, z: 7, r: 1.8 },
    ];
  }
  if (prop === 'pillars') {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return { x: Math.cos(a) * 14, z: Math.sin(a) * 14, r: 1.2 };
    });
  }
  // petals
  return Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2;
    return { x: Math.cos(a) * 10, z: Math.sin(a) * 10, r: 1.4 };
  });
}

export function LandingGround({ site, groundColor, accent }) {
  const props = useMemo(() => propLayout(site.prop || 'pillars'), [site]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[WALK_RADIUS, 48]} />
        <meshStandardMaterial color={groundColor || '#0b1026'} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[WALK_RADIUS - 0.6, WALK_RADIUS, 48]} />
        <meshBasicMaterial color={accent || '#e8f4ff'} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      {props.map((pr, i) => {
        if (site.prop === 'spires') {
          return (
            <mesh key={i} position={[pr.x, 3.5, pr.z]}>
              <coneGeometry args={[1.4, 7, 6]} />
              <meshStandardMaterial color="#ddd6fe" roughness={0.3} metalness={0.4} emissive="#7c3aed" emissiveIntensity={0.4} />
            </mesh>
          );
        }
        if (site.prop === 'deck') {
          return (
            <mesh key={i} position={[pr.x, 1, pr.z]}>
              <boxGeometry args={[3, 2, 3]} />
              <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.6} />
            </mesh>
          );
        }
        if (site.prop === 'pillars') {
          return (
            <mesh key={i} position={[pr.x, 3, pr.z]}>
              <cylinderGeometry args={[0.8, 0.8, 6, 10]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.6} metalness={0.3} emissive="#92400e" emissiveIntensity={0.3} />
            </mesh>
          );
        }
        return (
          <mesh key={i} position={[pr.x, 0.4, pr.z]} rotation={[0.4, 0, 0]}>
            <boxGeometry args={[2.4, 0.5, 5]} />
            <meshStandardMaterial color="#170b26" roughness={0.9} emissive="#4c1d95" emissiveIntensity={0.35} />
          </mesh>
        );
      })}
      <SiteGlow position={[0, 2, 0]} color={accent || '#e8f4ff'} size={30} />
    </group>
  );
}

// Visible walker body for third-person walking.
export function WalkerFigure({ walkerRef, color }) {
  const g = useRef(null);
  useFrame(() => {
    const w = walkerRef.current;
    if (!w || !g.current) return;
    const feetY = w.pos.y - 2.4;
    g.current.position.set(w.pos.x, feetY, w.pos.z);
    g.current.rotation.y = w.yaw + Math.PI;
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.45, 0.9, 4, 12]} />
        <meshStandardMaterial color={color || '#38bdf8'} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshStandardMaterial color="#e8f4ff" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.75, 0.3]}>
        <boxGeometry args={[0.4, 0.12, 0.1]} />
        <meshBasicMaterial color={color || '#38bdf8'} />
      </mesh>
    </group>
  );
}

// Third-person walk rig: steps the walker, parks the camera behind it.
export function WalkRig({ site, walkerRef, joyRef, keysRef }) {
  const { camera } = useThree();
  const colliders = useMemo(() => propLayout(site.prop || 'pillars'), [site]);
  useFrame((_, rawDt) => {
    const w = walkerRef.current;
    if (!w) return;
    const dt = Math.min(0.05, rawDt || 0.016);
    const keys = keysRef.current ? keysRef.current.state : { fwd: 0, strafe: 0, sprint: false };
    const joy = joyRef.current || { x: 0, y: 0 };
    const input = {
      fwd: (keys.fwd || 0) + (joy.y || 0),
      strafe: (keys.strafe || 0) + (joy.x || 0),
      sprint: !!keys.sprint,
      jump: keysRef.current ? keysRef.current.consumeJump() : false,
    };
    stepWalker(w, input, dt, {
      groundHeight: () => 0,
      colliders,
      bounds: { kind: 'circle', max: WALK_RADIUS },
      snapY: true,
      speed: 10,
    });
    const feetY = w.pos.y - 2.4;
    const fx = -Math.sin(w.yaw);
    const fz = -Math.cos(w.yaw);
    camera.position.set(w.pos.x - fx * 7, feetY + 3.4, w.pos.z - fz * 7);
    camera.lookAt(w.pos.x + fx * 6, feetY + 1.7 + (w.pitch || 0) * 2, w.pos.z + fz * 6);
  });
  return null;
}
