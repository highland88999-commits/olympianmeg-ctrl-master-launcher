'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import { getParticleTexture } from '@/lib/particles/sprites';
import { AETHELGARD_RIPPLE_COUNT, rippleAt } from '@/lib/aethelgard/cgi';

// AETHELGARD water — a winding stream (animated stripe texture on a ribbon),
// still puddles, and the waterfall at the falls hotspot (48, 0, 28).
//
// CGI pass (Nov 15, 2026): spray MIST hangs over the falls base and
// drifts up into the canopy gap, and the plunge pool carries expanding
// RIPPLE rings on a 4 s clock cycle — the falls never stop dripping.

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a5a6a';
  g.fillRect(0, 0, 64, 256);
  const rand = mulberry32(99);
  for (let i = 0; i < 46; i++) {
    const x = rand() * 64;
    const w = 1 + rand() * 3;
    const l = 20 + rand() * 80;
    const y = rand() * 256;
    g.fillStyle = `rgba(220,240,250,${0.25 + rand() * 0.5})`;
    g.fillRect(x, y, w, l);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ribbon geometry following a curve on the ground
function ribbonGeometry(points, width) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const segs = 120;
  const posArr = [];
  const uvArr = [];
  const idx = [];
  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    curve.getPointAt(s, pt);
    curve.getTangentAt(s, tan);
    const nx = -tan.z, nz = tan.x;
    const nl = Math.hypot(nx, nz) || 1;
    const hw = width / 2;
    posArr.push(pt.x + (nx / nl) * hw, 0.06, pt.z + (nz / nl) * hw);
    posArr.push(pt.x - (nx / nl) * hw, 0.06, pt.z - (nz / nl) * hw);
    uvArr.push(0, s * 14, 1, s * 14);
    if (i < segs) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function Water({ flowSpeed = 1 }) {
  const streamTex = useMemo(streakTexture, []);
  const fallTex = useMemo(streakTexture, []);
  const streamRef = useRef();
  const mistRefs = useRef([]);
  const rippleRefs = useRef([]);
  const rippleMatRefs = useRef([]);
  const mistTex = useMemo(() => getParticleTexture('mist'), []);
  // Spray-mist anchors at the falls base: each puffs up and out on
  // its own slow cycle, seeded so the spray is stable per load.
  const fallMist = useMemo(() => {
    const rand = mulberry32(777);
    return Array.from({ length: 4 }, (_, i) => ({
      dx: (rand() - 0.5) * 7,
      dz: 1 + rand() * 3,
      baseY: 1 + rand() * 2,
      scale: 7 + rand() * 5,
      phase: rand() * Math.PI * 2,
    }));
  }, []);

  const streamGeo = useMemo(() => ribbonGeometry([
    [48, 0, 30], [40, 0, 34], [30, 0, 30], [22, 0, 36], [12, 0, 32],
    [2, 0, 38], [-8, 0, 34], [-18, 0, 40], [-28, 0, 36], [-38, 0, 42],
    [-48, 0, 38], [-58, 0, 44],
  ], 3.4), []);

  const puddles = useMemo(() => {
    const rand = mulberry32(31337);
    const arr = [];
    for (let i = 0; i < 26; i++) {
      const r = 6 + rand() * 70;
      const a = rand() * Math.PI * 2;
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 1 + rand() * 2.6 });
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime * flowSpeed;
    streamTex.offset.y = -t * 0.55;
    fallTex.offset.y = -t * 1.4;
    if (streamRef.current) streamRef.current.material.opacity = 0.82 + Math.sin(t * 2.1) * 0.06;
    // spray mist puffs up from the falls base and thins as it rises
    const nowMs = Date.now();
    mistRefs.current.forEach((sp, i) => {
      if (!sp) return;
      const m = fallMist[i];
      const cyc = (Math.sin(t * 0.5 + m.phase) + 1) / 2; // 0 low .. 1 high
      sp.position.set(m.dx + Math.sin(t * 0.4 + m.phase) * 1.5, m.baseY + cyc * 4, m.dz);
      sp.scale.set(m.scale * (0.8 + cyc * 0.5), m.scale * (0.6 + cyc * 0.4), 1);
      sp.material.opacity = 0.28 * (1 - cyc * 0.6);
    });
    // plunge-pool ripples expand and fade on a 4 s clock cycle
    rippleRefs.current.forEach((ring, i) => {
      if (!ring) return;
      const r = rippleAt(i, nowMs);
      ring.scale.set(r.scale, r.scale, 1);
      const mat = rippleMatRefs.current[i];
      if (mat) mat.opacity = r.opacity;
    });
  });

  return (
    <group>
      {/* stream */}
      <mesh ref={streamRef} geometry={streamGeo}>
        <meshStandardMaterial map={streamTex} transparent opacity={0.85}
          roughness={0.25} metalness={0.35} color="#9fd4e8" />
      </mesh>

      {/* puddles — still, mirror-ish discs */}
      {puddles.map((p, i) => (
        <mesh key={i} position={[p.x, 0.04, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[p.s, 14]} />
          <meshStandardMaterial color="#3d6a7a" roughness={0.08} metalness={0.7}
            transparent opacity={0.8} />
        </mesh>
      ))}

      {/* waterfall — basalt shelf + falling sheet + foam pool */}
      <group position={[48, 0, 28]}>
        {/* cliff */}
        <mesh position={[0, 7, -4]} rotation={[0.15, 0, 0]}>
          <boxGeometry args={[16, 15, 6]} />
          <meshStandardMaterial color="#3a3f3a" roughness={1} />
        </mesh>
        <mesh position={[0, 13.5, -4]}>
          <boxGeometry args={[18, 2.5, 8]} />
          <meshStandardMaterial color="#2c4a2e" roughness={1} />
        </mesh>
        {/* falling sheet */}
        <mesh position={[0, 6.5, -0.6]}>
          <planeGeometry args={[9, 13]} />
          <meshBasicMaterial map={fallTex} transparent opacity={0.85}
            side={THREE.DoubleSide} depthWrite={false} color="#cfeaf5" />
        </mesh>
        {/* foam burst at base */}
        <mesh position={[0, 0.5, 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[5.5, 20]} />
          <meshBasicMaterial color="#dff2fa" transparent opacity={0.5} depthWrite={false} />
        </mesh>
        {/* plunge pool */}
        <mesh position={[0, 0.05, 4]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[8, 24]} />
          <meshStandardMaterial color="#1d4a5a" roughness={0.05} metalness={0.8} />
        </mesh>
        {/* expanding ripple rings on the plunge pool */}
        {Array.from({ length: AETHELGARD_RIPPLE_COUNT }, (_, i) => (
          <mesh key={`rip${i}`} position={[0, 0.08, 4]} rotation={[-Math.PI / 2, 0, 0]}
            ref={(m) => { rippleRefs.current[i] = m; }}>
            <ringGeometry args={[0.45, 0.58, 24]} />
            <meshBasicMaterial ref={(m) => { rippleMatRefs.current[i] = m; }}
              color="#dff2fa" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
        {/* spray mist hanging over the falls base */}
        {fallMist.map((m, i) => (
          <sprite key={`fm${i}`}
            ref={(sp) => { mistRefs.current[i] = sp; }}
            position={[m.dx, m.baseY, m.dz]}>
            <spriteMaterial map={mistTex} color="#e8f4f8" transparent
              opacity={0.2} depthWrite={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}
