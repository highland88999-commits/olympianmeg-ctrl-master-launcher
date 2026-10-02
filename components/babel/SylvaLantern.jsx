'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { prefersReducedMotion } from '@/lib/babel/walk';

// SYLVA lantern — a warm light the walker carries through the endless forest.
// A single point light (no shadows: phone-safe) plus a small visible lantern
// mesh built from primitives, held low-right of the camera with a gentle
// pendulum sway. `on`/`active` are owned by the page shell (button + L key);
// the page persists the preference in localStorage.
export default function SylvaLantern({ inputRef, active, on }) {
  const group = useRef();
  const light = useRef();
  const flame = useRef();
  const reduced = useRef(null);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    const lit = on && active;
    g.visible = lit;
    if (!lit) return;

    const inp = inputRef.current;
    const t = state.clock.elapsedTime;
    // Walker convention (lib/babel/walk): yaw 0 faces -z.
    const fx = -Math.sin(inp.yaw);
    const fz = -Math.cos(inp.yaw);
    const rx = Math.cos(inp.yaw);
    const rz = -Math.sin(inp.yaw);
    // Held low and to the right, like a hand lantern. Sway is a slow
    // pendulum; skipped entirely under reduced motion.
    const sway = reduced.current ? 0 : Math.sin(t * 1.4) * 0.05;
    const bob = reduced.current ? 0 : Math.abs(Math.sin(t * 2.2)) * 0.03;
    g.position.set(
      inp.pos.x + fx * 0.55 + rx * (0.38 + sway),
      1.02 + bob,
      inp.pos.z + fz * 0.55 + rz * (0.38 + sway)
    );
    g.rotation.y = inp.yaw + (reduced.current ? 0 : Math.sin(t * 1.4) * 0.08);

    // Subtle flame flicker — ±8%, low frequency, never strobing.
    if (light.current) {
      light.current.intensity = reduced.current
        ? 26
        : 26 * (1 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 13.1) * 0.04);
    }
    if (flame.current) {
      flame.current.material.emissiveIntensity = reduced.current
        ? 2.2
        : 2.2 + Math.sin(t * 9.1) * 0.35;
    }
  });

  return (
    <group ref={group} visible={false}>
      <pointLight ref={light} color="#ffb45e" intensity={26} distance={26} decay={2} />
      {/* lantern body — primitives only */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.075, 0.09, 0.05, 10]} />
        <meshStandardMaterial color="#2b2118" roughness={0.6} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.062, 0.062, 0.16, 10]} />
        <meshStandardMaterial color="#ffdf9e" transparent opacity={0.28} roughness={0.2} />
      </mesh>
      <mesh ref={flame} position={[0, 0, 0]}>
        <sphereGeometry args={[0.038, 12, 12]} />
        <meshStandardMaterial color="#ffcf7a" emissive="#ff9d3c" emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.09, 0.075, 0.05, 10]} />
        <meshStandardMaterial color="#2b2118" roughness={0.6} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <torusGeometry args={[0.07, 0.012, 8, 20, Math.PI]} />
        <meshStandardMaterial color="#2b2118" roughness={0.6} metalness={0.7} />
      </mesh>
    </group>
  );
}
