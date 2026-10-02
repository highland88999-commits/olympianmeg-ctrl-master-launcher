'use client';
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  GOLDBAR_FOUND_EVENT,
  GOLDBAR_CLAIM_RADIUS,
  GOLD_BAR_SPOTS,
  monthKey,
  pickMonthlySpot,
  isClaimed,
  markClaimed,
} from '@/lib/babel/monthlyGold';
import { prefersReducedMotion } from '@/lib/babel/walk';

// BABEL tower — the monthly gold bar. One bar per calendar month, hidden at
// a deterministic monthly spot (same spot for every player that month).
// Visible in orbit view (glint shard + warm light so it can be spotted at
// range); claimed by walking within GOLDBAR_CLAIM_RADIUS in walk mode.
// First claim per device per month wins; the bar then hides until next month.
//
// Mount INSIDE the tower-view branch of the page Canvas (see WIRING.md).
// Claims are per-device localStorage — the server-ledger seam for true
// cross-player fairness is documented in MENU_GOLD_NOTES.md.
export default function TowerGoldBar({ inputRef, walkMode }) {
  const [gone, setGone] = useState(false);
  const glint = useRef();
  const claimed = useRef(false);
  const reduced = useRef(null);

  // Pick this month's spot once. Already claimed this month → nothing.
  const data = useMemo(() => {
    const key = monthKey();
    if (isClaimed(key)) return null;
    const spot = pickMonthlySpot(GOLD_BAR_SPOTS, key);
    return spot ? { ...spot, key } : null;
  }, []);

  useFrame((state) => {
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    if (glint.current && !reduced.current) {
      const t = state.clock.elapsedTime;
      glint.current.rotation.y = t * 1.2;
      glint.current.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    }
    if (walkMode && data && !claimed.current && inputRef?.current?.pos) {
      const p = inputRef.current.pos;
      if (Math.hypot(p.x - data.x, p.z - data.z) < GOLDBAR_CLAIM_RADIUS) {
        claimed.current = true;
        markClaimed(data.key);
        setGone(true);
        window.dispatchEvent(
          new CustomEvent(GOLDBAR_FOUND_EVENT, { detail: { month: data.key } })
        );
      }
    }
  });

  if (!data || gone) return null;

  return (
    <group position={[data.x, 0, data.z]}>
      {/* the bar — a chunky ingot resting on the plaza (ground plane y=-0.5) */}
      <mesh position={[0, -0.22, 0]} rotation={[0, data.rot, 0]}>
        <boxGeometry args={[1.5, 0.55, 0.75]} />
        <meshStandardMaterial
          color="#d4a24e"
          metalness={1}
          roughness={0.28}
          emissive="#7a5a1e"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* glint shard floating above — spottable from orbit view */}
      <mesh ref={glint} position={[0, 1.2, 0]}>
        <octahedronGeometry args={[0.3]} />
        <meshStandardMaterial
          color="#ffe9a8"
          emissive="#ffcf5e"
          emissiveIntensity={2.4}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* one small warm light, no shadows — phone-safe */}
      <pointLight position={[0, 1.6, 0]} color="#ffcf5e" intensity={6} distance={10} decay={2} />
    </group>
  );
}
