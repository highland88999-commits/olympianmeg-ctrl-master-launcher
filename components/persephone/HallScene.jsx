// components/persephone/HallScene.jsx
// PERSEPHONE's 3D concert hall — underworld-club atmosphere.
//
// Dark stone hall, gold/ember accents, a raised stage with the DJ booth.
// Everything procedural: no external assets, no network, no telemetry.
// Avatars shown here are REAL presence peers only — never faked. The page
// passes the live peer list; when it's empty the floor stays honestly empty.
//
// Lighting rule: no postprocessing/bloom at all; point lights are few and
// dim so the procedural surfaces stay readable.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

// Local reduced-motion hook. @react-three/drei does NOT export
// useReducedMotion (importing it yields undefined and crashes the page at
// runtime while the production build stays green), so we read the media
// query ourselves. HallScene only ever mounts client-side (ssr: false),
// but the hook stays guarded anyway.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(!!mq.matches);
      const onChange = (e) => setReduced(!!e.matches);
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
      else if (typeof mq.addListener === 'function') mq.addListener(onChange);
      return () => {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange);
        else if (typeof mq.removeListener === 'function') mq.removeListener(onChange);
      };
    } catch {
      /* old browsers / SSR: motion stays on */
    }
  }, []);
  return reduced;
}

// Deterministic placement so avatars don't jump between polls.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LABEL_STYLE = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#e8d9b0',
  textShadow: '0 0 8px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)',
  fontWeight: 700,
};

function NameTag({ position, children, color }) {
  return (
    <Html position={position} center distanceFactor={55} style={{ ...LABEL_STYLE, ...(color ? { color } : {}) }}>
      {children}
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Ember particles — slow-rising sparks, the hall's "souls in the air".
// ---------------------------------------------------------------------------
function Embers({ reduced, count = 260 }) {
  const ref = useRef(null);
  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 4;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    return { positions, seeds };
  }, [count]);

  useFrame((state) => {
    if (reduced || !ref.current) return;
    const t = state.clock.elapsedTime;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      const y = (seeds[i] + t * 0.35) % 14;
      pos.array[i * 3 + 1] = y;
      pos.array[i * 3] += Math.sin(t * 0.6 + seeds[i]) * 0.002;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} color="#ff9a3c" transparent opacity={0.75} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// ---------------------------------------------------------------------------
// One attendee avatar: a hooded-figure cone + head + name tag.
// ---------------------------------------------------------------------------
function AvatarFigure({ position, color, label, you = false }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.85, 0]}>
        <coneGeometry args={[0.42, 1.7, 8]} />
        <meshStandardMaterial color={you ? '#d4af37' : color} roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial color={you ? '#f5e6bd' : '#2a2118'} roughness={0.7} />
      </mesh>
      {you && (
        <pointLight position={[0, 2.4, 0]} color="#d4af37" intensity={6} distance={6} decay={2} />
      )}
      <NameTag position={[0, 2.55, 0]} color={you ? '#d4af37' : undefined}>
        {label}
      </NameTag>
    </group>
  );
}

function peerSpot(peer, i) {
  // Fan out in a loose arc facing the stage (stage sits at z = -12).
  const h = hashStr(peer.id || String(i));
  const row = Math.floor((h % 5) / 2); // 0..2 rows
  const spread = (h % 1000) / 1000 - 0.5;
  return [spread * 22, 0, -2 + row * 3.2 + ((h >> 3) % 100) / 100 * 1.6];
}

// ---------------------------------------------------------------------------
// The hall itself.
// ---------------------------------------------------------------------------
function Hall({ peers, reduced }) {
  const camRef = useRef(null);

  // Slow cinematic drift; frozen for reduced motion.
  useFrame((state) => {
    if (reduced || !camRef.current) return;
    const t = state.clock.elapsedTime * 0.06;
    camRef.current.position.x = Math.sin(t) * 3.2;
    camRef.current.position.y = 6.4 + Math.sin(t * 1.7) * 0.5;
    camRef.current.lookAt(0, 3.4, -10);
  });

  const columns = useMemo(() => {
    const xs = [-14, -8.4, 8.4, 14];
    return xs.flatMap((x) => [-8, 2].map((z) => [x, z]));
  }, []);

  return (
    <>
      <perspectiveCamera ref={camRef} makeDefault fov={55} near={0.5} far={300} position={[0, 6.4, 19]} />

      {/* dim, warm ambient — the hall stays DARK */}
      <ambientLight intensity={0.28} color="#3a2c1e" />
      {/* stage wash: the one bright spot, pointed at the stage only */}
      <spotLight position={[0, 11, -6]} angle={0.5} penumbra={0.7} intensity={260} color="#ffb347" target-position={[0, 2, -13]} distance={40} decay={2} />
      {/* two ember sconces, very local */}
      <pointLight position={[-14, 4, -8]} color="#ff7a2f" intensity={14} distance={12} decay={2} />
      <pointLight position={[14, 4, -8]} color="#ff7a2f" intensity={14} distance={12} decay={2} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4]} receiveShadow>
        <planeGeometry args={[60, 44]} />
        <meshStandardMaterial color="#14100c" roughness={0.95} metalness={0.05} />
      </mesh>
      {/* center carpet runner to the stage, deep red */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -7]}>
        <planeGeometry args={[5, 22]} />
        <meshStandardMaterial color="#4a1214" roughness={1} />
      </mesh>

      {/* back + side walls */}
      <mesh position={[0, 7, -20]}>
        <boxGeometry args={[60, 14, 1]} />
        <meshStandardMaterial color="#0d0a08" roughness={1} />
      </mesh>
      <mesh position={[-24, 7, -4]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[44, 14, 1]} />
        <meshStandardMaterial color="#0d0a08" roughness={1} />
      </mesh>
      <mesh position={[24, 7, -4]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[44, 14, 1]} />
        <meshStandardMaterial color="#0d0a08" roughness={1} />
      </mesh>

      {/* columns with gold collars */}
      {columns.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[0.7, 0.85, 12, 10]} />
            <meshStandardMaterial color="#1d1712" roughness={0.8} />
          </mesh>
          {[1.6, 10.4].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <torusGeometry args={[0.78, 0.1, 8, 20]} />
              <meshStandardMaterial color="#8a6a2f" roughness={0.4} metalness={0.8} />
            </mesh>
          ))}
        </group>
      ))}

      {/* STAGE */}
      <group position={[0, 0, -14]}>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[20, 1.8, 8]} />
          <meshStandardMaterial color="#191410" roughness={0.85} />
        </mesh>
        {/* gold stage edge */}
        <mesh position={[0, 1.82, 4.02]}>
          <boxGeometry args={[20, 0.08, 0.08]} />
          <meshStandardMaterial color="#d4af37" emissive="#7a5a1a" emissiveIntensity={0.7} roughness={0.4} metalness={0.7} />
        </mesh>
        {/* DJ booth */}
        <mesh position={[0, 2.6, -1]}>
          <boxGeometry args={[6, 1.7, 2.2]} />
          <meshStandardMaterial color="#100d0a" roughness={0.6} />
        </mesh>
        <mesh position={[0, 3.1, 0.12]}>
          <boxGeometry args={[5.6, 0.5, 0.1]} />
          <meshStandardMaterial color="#d4af37" emissive="#8a6a1f" emissiveIntensity={0.9} roughness={0.3} metalness={0.8} />
        </mesh>
        {/* decks: two glowing platters */}
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 3.5, -1]} rotation={[-Math.PI / 2.3, 0, 0]}>
            <cylinderGeometry args={[0.75, 0.75, 0.12, 24]} />
            <meshStandardMaterial color="#0a0a0a" emissive="#ff7a2f" emissiveIntensity={0.55} roughness={0.35} />
          </mesh>
        ))}
        {/* speaker stacks */}
        {[-8.6, 8.6].map((x) => (
          <group key={x} position={[x, 0, 0.5]}>
            {[2.8, 4.9].map((y) => (
              <mesh key={y} position={[0, y, 0]}>
                <boxGeometry args={[2.2, 2, 2]} />
                <meshStandardMaterial color="#0c0a08" roughness={0.9} />
              </mesh>
            ))}
            <pointLight position={[0, 4, 2.5]} color="#ff9a3c" intensity={5} distance={7} decay={2} />
          </group>
        ))}
        <NameTag position={[0, 6.4, 0]} color="#d4af37">
          The Underworld Stage
        </NameTag>
      </group>

      {/* doorway glow behind the camera side */}
      <mesh position={[0, 3.5, 13.9]}>
        <planeGeometry args={[8, 7]} />
        <meshBasicMaterial color="#2a1608" />
      </mesh>

      <Embers reduced={reduced} />

      {/* the visitor */}
      <AvatarFigure position={[2.6, 0, 6.5]} color="#d4af37" label="You" you />

      {/* REAL peers only — nothing faked */}
      {peers.map((p, i) => (
        <AvatarFigure key={p.id || i} position={peerSpot(p, i)} color={p.color || '#b08d3e'} label={p.label || 'Guest'} />
      ))}
    </>
  );
}

export default function HallScene({ peers = [] }) {
  const reduced = useReducedMotion();
  return (
    <Canvas
      className="absolute inset-0"
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      aria-label="Persephone concert hall — 3D view"
    >
      <Hall peers={peers} reduced={reduced} />
    </Canvas>
  );
}
