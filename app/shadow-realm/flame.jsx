// app/shadow-realm/flame.jsx — the ETERNAL FLAME fire pit.
//
// Built from Merlin's fire-pit photo (2026-10-03): a round stone rim, a dark
// lava-rock bed, and restless yellow-orange flames. It is the dramatic light
// source of the bump arena — the one thing in the dark realm you do NOT want
// to touch.
//
// Phone-cheap by construction: unlit materials only, ~7 flame cones, one
// THREE.Points ember field, exactly one extra point light (no shadows).
// Everything animates imperatively in a single useFrame — no React state.

'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const FLAME_COLORS = ['#ffd23f', '#ff9a1f', '#ff6a00', '#ffe97a'];

function mulberry(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function EternalFlame({ flame }) {
  const rng = useMemo(() => mulberry(1337), []);
  const group = useRef();
  const lightRef = useRef();
  const flameRefs = useRef([]);
  const emberRef = useRef();
  const glowRef = useRef();

  const rimR = flame?.rimR ?? 56;

  // Flame tongues: ring + center, each with its own flicker phase.
  const tongues = useMemo(() => {
    const arr = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rng() * 0.5;
      const r = i === 0 ? 0 : 6 + rng() * 14;
      arr.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        h: 9 + rng() * 9,
        w: 2.2 + rng() * 2.4,
        color: FLAME_COLORS[i % FLAME_COLORS.length],
        phase: rng() * Math.PI * 2,
        freq: 7 + rng() * 6,
      });
    }
    return arr;
  }, [rng]);

  // Ember particles: positions recycled in the frame loop.
  const embers = useMemo(() => {
    const N = 46;
    const pos = new Float32Array(N * 3);
    const seed = [];
    for (let i = 0; i < N; i++) {
      seed.push({
        x: (rng() - 0.5) * 30,
        z: (rng() - 0.5) * 30,
        y: rng() * 34,
        speed: 6 + rng() * 9,
        sway: rng() * Math.PI * 2,
      });
    }
    return { pos, seed, N };
  }, [rng]);

  const emberGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(embers.pos, 3));
    return g;
  }, [embers]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Flame tongues: flicker scale + slight sway. Never still — eternal.
    flameRefs.current.forEach((m, i) => {
      const tg = tongues[i];
      if (!m || !tg) return;
      const f = 0.72 + 0.28 * Math.sin(t * tg.freq + tg.phase) * Math.sin(t * 3.1 + tg.phase * 2);
      m.scale.set(1 + (1 - f) * 0.25, Math.max(0.15, f), 1 + (1 - f) * 0.25);
      m.rotation.y = Math.sin(t * 2.2 + tg.phase) * 0.22;
    });
    // Embers rise, sway, recycle.
    const arr = emberGeo.attributes.position.array;
    for (let i = 0; i < embers.N; i++) {
      const s = embers.seed[i];
      s.y += s.speed * 0.016;
      if (s.y > 36) {
        s.y = 0;
        s.x = (rng() - 0.5) * 30;
        s.z = (rng() - 0.5) * 30;
      }
      arr[i * 3] = s.x + Math.sin(t * 2 + s.sway) * 1.6;
      arr[i * 3 + 1] = s.y;
      arr[i * 3 + 2] = s.z + Math.cos(t * 1.7 + s.sway) * 1.6;
    }
    emberGeo.attributes.position.needsUpdate = true;
    // The pit breathes light: the realm's dramatic source.
    if (lightRef.current) {
      lightRef.current.intensity = 2.6 + Math.sin(t * 9.3) * 0.5 + Math.sin(t * 23.7) * 0.3;
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(t * 7.7) * 0.06;
      glowRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group ref={group} position={[flame?.x ?? 0, 0, flame?.z ?? 0]}>
      {/* lava-rock bed: dark disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <circleGeometry args={[rimR, 48]} />
        <meshBasicMaterial color="#120806" />
      </mesh>
      {/* rock lumps: a few dark ember-lit stones */}
      {useMemo(() => {
        const lumps = [];
        for (let i = 0; i < 14; i++) {
          const a = rng() * Math.PI * 2;
          const r = 10 + rng() * (rimR - 16);
          lumps.push({
            x: Math.cos(a) * r,
            z: Math.sin(a) * r,
            s: 1.6 + rng() * 2.6,
          });
        }
        return lumps;
      }, [rng, rimR]).map((l, i) => (
        <mesh key={i} position={[l.x, 0.5, l.z]}>
          <dodecahedronGeometry args={[l.s, 0]} />
          <meshBasicMaterial color={i % 3 ? '#1c0f0a' : '#2a140c'} />
        </mesh>
      ))}
      {/* stone rim: the pit's round border */}
      <mesh position={[0, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[rimR, 3.2, 10, 64]} />
        <meshBasicMaterial color="#33363d" />
      </mesh>
      <mesh position={[0, 2.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[rimR, 1.1, 8, 64]} />
        <meshBasicMaterial color="#4a4e57" />
      </mesh>
      {/* flame tongues: additive cones, yellow core to orange edge */}
      {tongues.map((tg, i) => (
        <mesh
          key={i}
          position={[tg.x, tg.h / 2 + 0.4, tg.z]}
          ref={(m) => { flameRefs.current[i] = m; }}
        >
          <coneGeometry args={[tg.w, tg.h, 7]} />
          <meshBasicMaterial
            color={tg.color}
            transparent
            opacity={0.88}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      {/* heat glow: soft additive disc hovering over the flames */}
      <sprite ref={glowRef} position={[0, 9, 0]} scale={[64, 40, 1]}>
        <spriteMaterial
          map={useMemo(() => {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255,170,60,0.55)');
            grad.addColorStop(0.5, 'rgba(255,110,20,0.22)');
            grad.addColorStop(1, 'rgba(255,80,0,0)');
            g.fillStyle = grad;
            g.fillRect(0, 0, 128, 128);
            const t2 = new THREE.CanvasTexture(c);
            t2.needsUpdate = true;
            return t2;
          }, [])}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {/* embers */}
      <points geometry={emberGeo} frustumCulled={false}>
        <pointsMaterial color="#ffb347" size={0.9} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      {/* the pit's light: flickers, reaches the track */}
      <pointLight ref={lightRef} position={[0, 14, 0]} color="#ff7a1a" intensity={2.6} distance={420} decay={1.6} />
    </group>
  );
}
