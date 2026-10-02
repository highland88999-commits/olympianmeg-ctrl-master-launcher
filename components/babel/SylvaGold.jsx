'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { prefersReducedMotion } from '@/lib/babel/walk';

const STORE_KEY = 'babel-sylva-gold';
export const GOLD_FOUND_EVENT = 'sylva-gold-found';
const FIND_RADIUS = 2.6;

// Two gold pieces hidden in the endless forest. Clearing verified against the
// deterministic tree layout (mulberry32 seed 20260927): both spots sit 8+
// units from the nearest trunk and inside the walk circle (r <= 76).
//   grove — (24, 34):   east of the spawn clearing, near the grove edge
//   heart — (-12, -44): deep in the forest heart, far side
const SPOTS = [
  { id: 'grove', x: 24, z: 34 },
  { id: 'heart', x: -12, z: -44 },
];

function loadFound() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

// SYLVA gold — placed treasure, not a quest system. Full-metal PBR coins that
// glint when the lantern light hits them, plus a small pulsing glint shard so
// an observant walker can spot them at range. Walking within FIND_RADIUS in
// walk mode fires a one-time toast per piece (persisted in localStorage).
export default function SylvaGold({ inputRef, active }) {
  const coins = useRef([]);
  const glints = useRef([]);
  const found = useRef(null);
  const reduced = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!found.current) found.current = loadFound();
  }, []);

  useFrame((state) => {
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    if (!found.current) found.current = loadFound();
    const t = state.clock.elapsedTime;
    const inp = inputRef.current;

    SPOTS.forEach((s, i) => {
      const isFound = found.current.has(s.id);
      const coin = coins.current[i];
      if (coin) {
        // Slow turn so the faces catch the lantern light; calmer when found.
        coin.rotation.y = (reduced.current ? 0.6 : t * 0.5) + i * 2.1;
        const m = coin.material;
        if (m) {
          m.emissiveIntensity = isFound
            ? 0.12
            : 0.25 + (reduced.current ? 0 : Math.sin(t * 2.4 + i * 1.7) * 0.12);
        }
      }
      const glint = glints.current[i];
      if (glint) {
        const pulse = reduced.current ? 0 : Math.sin(t * 2.4 + i * 1.7);
        const sc = 1 + pulse * 0.25;
        glint.scale.set(sc, sc, sc);
        glint.rotation.y = t * 0.8 + i;
        glint.material.opacity = isFound ? 0.25 : 0.6 + pulse * 0.25;
      }
      // Discovery — walk mode only, so the distant orbit camera can't trigger it.
      if (activeRef.current && !isFound && inp && inp.pos) {
        const d = Math.hypot(inp.pos.x - s.x, inp.pos.z - s.z);
        if (d < FIND_RADIUS) {
          found.current.add(s.id);
          try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify([...found.current]));
          } catch {
            // private mode — the toast still fires, it just won't persist
          }
          window.dispatchEvent(
            new CustomEvent(GOLD_FOUND_EVENT, {
              detail: { found: found.current.size, total: SPOTS.length },
            })
          );
        }
      }
    });
  });

  return (
    <group>
      {SPOTS.map((s, i) => (
        <group key={s.id} position={[s.x, 0, s.z]}>
          {/* a small stack of coins resting on the forest floor — solid, never floating */}
          <mesh
            ref={(m) => {
              coins.current[i] = m;
            }}
            position={[0, 0.05, 0]}
            rotation={[0.12, 0, 0.06]}
          >
            <cylinderGeometry args={[0.3, 0.3, 0.09, 24]} />
            <meshStandardMaterial
              color="#d4a24e"
              metalness={1}
              roughness={0.28}
              emissive="#8a5a17"
              emissiveIntensity={0.25}
            />
          </mesh>
          <mesh position={[0.14, 0.045, 0.09]} rotation={[0.1, 0.7, -0.08]}>
            <cylinderGeometry args={[0.3, 0.3, 0.09, 24]} />
            <meshStandardMaterial
              color="#d4a24e"
              metalness={1}
              roughness={0.28}
              emissive="#8a5a17"
              emissiveIntensity={0.25}
            />
          </mesh>
          {/* glint shard — a beacon for observant walkers */}
          <mesh
            ref={(m) => {
              glints.current[i] = m;
            }}
            position={[0, 0.5, 0]}
          >
            <octahedronGeometry args={[0.09, 0]} />
            <meshBasicMaterial color="#ffe9b0" transparent opacity={0.6} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
