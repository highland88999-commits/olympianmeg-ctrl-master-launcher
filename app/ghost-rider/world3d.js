// app/ghost-rider/world3d.js
// GHOST RIDER 3D scene — procedural, no external assets.
//
// The Rider waits in his scorched circle at the north end; the
// damned drift the field between the spawn and him; one arch walks
// you back to Hell. First-person walk; the camera rig lives here
// so the page shell stays lean. Patterns follow app/hell/world3d.js:
// Canvas + useSceneContextGuard, Html labels from drei, plain
// English everywhere, the same anti-life disc as every hell realm.
//
// CHAIN EFFECT — props contract with the page (app/ghost-rider/
// page.jsx): the page passes `chainFx`, null or
//   { from: { x, z }, to: { x, z }, targets: [{ x, z }], atMs, targetId, targetKind }
// where `from`/`to` are ground positions, `targets` is the throw's
// victim list (1 at level 0, 5 at level 4 — `to` is the first of
// them, kept for back-compat), `atMs` is the Date.now()
// the chain was thrown, `targetId` is the damned soul's id for an
// NPC target (null for a user target — their client moves them),
// and `targetKind` is 'npc' | 'user'. The scene plays one chain
// per target from `atMs` on its own clock: the chain extends link by
// link (0–0.6 s), coils around the target in a helix (0.6–1.4 s),
// bursts into flame with a light flash (1.4–2.4 s), then the
// target burns to ash and falls (2.4–3.4 s). The page clears
// `chainFx` after ~3.5 s; the scene also stops rendering it past
// 3.4 s. The page owns removing/reforming the damned soul — the
// scene only fades the burning shade while the effect runs.
//
// LIGHT BUDGET: 6 lit path torches + 1 Rider flame light = 7 steady
// point lights; the chain's burst light exists only while the
// effect runs (max 8). Every other flame is emissive, no light.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  DAMNED_FIELD,
  PORTALS,
  RIDER,
  RUN_SPEED,
  SPAWN,
  WALK_SPEED,
  WORLD_RADIUS,
  forward,
  nearestPortal,
  regionAt,
  right,
  stepPosition,
} from '@/lib/ghost-rider/world';
import { isOnAntiLifePortal } from '@/lib/afterlife/anti-life-portal';
import AntiLifePortalDisc from '@/components/afterlife/AntiLifePortalDisc';
import DayNightRig from '@/components/DayNightRig';
import { NETHER_REALM_SHADE } from '@/lib/day-night';

const STONE = '#2a2a32';
const PORTAL_GLOW = '#7c3aed';
const EMBER = '#ff5a1a';
const TORCH_LIGHT = { intensity: 10, distance: 14 };

// The path torches: they line the walk from the spawn to the
// Rider's circle so the eye is always led north. Only every other
// one carries a real point light (6 lit — the hell torch budget,
// same discipline: flames everywhere, light only where it guides).
const TORCHES = (() => {
  const list = [];
  const zs = [120, 90, 60, 30, 0, -30];
  let i = 0;
  for (const z of zs) {
    for (const x of [-7, 7]) {
      list.push({ id: i, x, z, lit: i % 2 === 0 });
      i += 1;
    }
  }
  return list;
})();

// --- canvas texture (procedural, seeded) ----------------------------------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#170606';
  g.fillRect(0, 0, 1024, 1024);
  // Scorched speckle.
  for (let i = 0; i < 9000; i += 1) {
    const v = 8 + Math.floor(Math.random() * 22);
    g.fillStyle = `rgb(${v},${Math.floor(v * 0.8)},${Math.floor(v * 0.8)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Ember cracks.
  g.strokeStyle = EMBER;
  g.shadowColor = EMBER;
  g.shadowBlur = 6;
  for (let i = 0; i < 22; i += 1) {
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 4 + Math.floor(Math.random() * 5);
    for (let s = 0; s < steps; s += 1) {
      x += (Math.random() - 0.5) * 200;
      y += (Math.random() - 0.5) * 200;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- labels ----------------------------------------------------------------

const portalLabelStyle = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontSize: 15,
  fontWeight: 700,
  color: '#f3e8ff',
  background: 'rgba(20, 8, 40, 0.82)',
  border: '1px solid rgba(168, 85, 247, 0.65)',
  borderRadius: 999,
  padding: '4px 12px',
};

const regionLabelStyle = {
  ...portalLabelStyle,
  fontSize: 13,
  fontWeight: 600,
  color: '#e7e5e4',
  background: 'rgba(10, 10, 14, 0.72)',
  border: '1px solid rgba(231, 229, 228, 0.35)',
};

const riderLabelStyle = {
  ...portalLabelStyle,
  color: '#fed7aa',
  background: 'rgba(40, 8, 0, 0.82)',
  border: '1px solid rgba(251, 146, 60, 0.65)',
};

// --- static pieces ----------------------------------------------------------

function Ground() {
  const tex = useMemo(() => groundTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[400, 64]} />
      <meshStandardMaterial map={tex} color="#ffffff" roughness={1} metalness={0} />
    </mesh>
  );
}

// THE RIDER — flaming skull, dark leather torso, a chain across his
// chest, flame cones that flicker with the clock. No GLB anywhere:
// every piece is a primitive with emissive fire.
function Rider({ reduced }) {
  const flameRefs = useRef([]);
  const lightRef = useRef(null);
  const ringRef = useRef(null);
  const frameRef = useRef(0);
  const flames = [
    { x: 0, y: 3.6, z: 0, s: 1.4 },
    { x: -0.55, y: 3.2, z: 0.1, s: 1 },
    { x: 0.55, y: 3.2, z: 0.1, s: 1 },
    { x: 0, y: 3.3, z: -0.45, s: 0.9 },
  ];
  // His chest chain: a diagonal row of small torus links.
  const chestLinks = [];
  for (let i = 0; i < 7; i += 1) {
    chestLinks.push({ x: -0.45 + i * 0.15, y: 2.15 - i * 0.14, key: i });
  }
  useFrame((state) => {
    if (reduced) return;
    frameRef.current += 1;
    if (frameRef.current % 2 !== 1) return;
    const t = state.clock.elapsedTime;
    flameRefs.current.forEach((m, i) => {
      if (!m) return;
      const s = 1 + Math.sin(t * 9 + i * 2.3) * 0.18;
      m.scale.set(s, 1 + Math.sin(t * 11 + i) * 0.22, s);
    });
    if (lightRef.current) {
      lightRef.current.intensity = 26 * (0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3));
    }
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.45 + 0.25 * Math.sin(t * 2.2);
    }
  });
  return (
    <group position={[RIDER.x, 0, RIDER.z]}>
      {/* The scorched circle: a blackened disc and a pulsing ember ring. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[RIDER.r, 40]} />
        <meshStandardMaterial color="#0a0505" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[RIDER.r - 0.5, RIDER.r, 40]} />
        <meshBasicMaterial ref={ringRef} color={EMBER} transparent opacity={0.55} />
      </mesh>
      {/* His own fire: one real light, riding at the skull. */}
      <pointLight ref={lightRef} position={[0, 3.4, 0]} color="#ff7a1a" intensity={26} distance={30} />
      {/* Leather torso. */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.55, 0.7, 1.6, 10]} />
        <meshStandardMaterial color="#1a1210" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <boxGeometry args={[1.5, 0.35, 0.7]} />
        <meshStandardMaterial color="#1a1210" roughness={0.9} />
      </mesh>
      {/* The chain across his chest. */}
      {chestLinks.map((l) => (
        <mesh key={l.key} position={[l.x, l.y, 0.62]} rotation={[0.5, 0.3, 0.9]}>
          <torusGeometry args={[0.11, 0.035, 6, 10]} />
          <meshStandardMaterial color="#3a3a40" metalness={0.8} roughness={0.4} emissive="#ff5a00" emissiveIntensity={0.25} />
        </mesh>
      ))}
      {/* Arms, held low, fists of fire. */}
      {[-0.85, 0.85].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.5, 0]} rotation={[0, 0, x > 0 ? -0.25 : 0.25]}>
            <cylinderGeometry args={[0.16, 0.18, 1.4, 8]} />
            <meshStandardMaterial color="#1a1210" roughness={0.9} />
          </mesh>
          <mesh position={[x, 0.75, 0]}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshBasicMaterial color="#ff7a1a" />
          </mesh>
        </group>
      ))}
      {/* The flaming skull: bone sphere, burning eye sockets, jaw. */}
      <mesh position={[0, 2.95, 0]}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshStandardMaterial color="#f5ead0" roughness={0.6} emissive="#ff5a00" emissiveIntensity={0.15} />
      </mesh>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 3.05, 0.48]}>
          <sphereGeometry args={[0.11, 8, 8]} />
          <meshBasicMaterial color="#ff3d00" />
        </mesh>
      ))}
      <mesh position={[0, 2.55, 0.15]}>
        <boxGeometry args={[0.4, 0.22, 0.3]} />
        <meshStandardMaterial color="#e8dcc0" roughness={0.6} />
      </mesh>
      {/* The flames crowning the skull. */}
      {flames.map((f, i) => (
        <group key={i} ref={(g) => { flameRefs.current[i] = g; }} position={[f.x, f.y, f.z]}>
          <mesh>
            <coneGeometry args={[0.3 * f.s, 0.9 * f.s, 8]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <coneGeometry args={[0.15 * f.s, 0.5 * f.s, 8]} />
            <meshBasicMaterial color="#ffd27a" />
          </mesh>
        </group>
      ))}
      <Html center distanceFactor={80} position={[0, 4.8, 0]} zIndexRange={[20, 0]} style={riderLabelStyle}>
        The Ghost Rider
      </Html>
    </group>
  );
}

// THE DAMNED FIELD — 8 translucent shades, drifting aimlessly. The
// page owns the list (it removes a burned soul and reforms it after
// 45 s); the scene only drifts them and fades the one the chain is
// burning (chainFx.targetId, from 1.4 s into the effect).
function DamnedField({ damned, chainFx, reduced }) {
  const meshRefs = useRef({});
  const matRefs = useRef({});
  const startRef = useRef(null);
  useEffect(() => {
    if (!chainFx) startRef.current = null;
  }, [chainFx]);
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    let burnAge = null;
    if (chainFx) {
      if (startRef.current == null) startRef.current = t;
      burnAge = t - startRef.current;
    }
    for (const d of damned || []) {
      const m = meshRefs.current[d.id];
      if (!m) continue;
      const drift = 2.2 * Math.sin(t * 0.25 * d.slow + d.id.charCodeAt(7));
      m.position.set(
        d.x + drift,
        1.4 + Math.sin(t * d.slow + d.id.charCodeAt(7) * 1.7) * 0.45,
        d.z + 2.2 * Math.cos(t * 0.22 * d.slow + d.id.charCodeAt(7)),
      );
      const mat = matRefs.current[d.id];
      if (mat) {
        if (chainFx && chainFx.targetId === d.id && burnAge != null && burnAge > 1.4) {
          mat.opacity = Math.max(0, 0.5 * (1 - (burnAge - 1.4) / 1.2));
        } else {
          mat.opacity = 0.5;
        }
      }
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[DAMNED_FIELD.x, 0.04, DAMNED_FIELD.z]}>
        <circleGeometry args={[DAMNED_FIELD.r, 40]} />
        <meshStandardMaterial color="#1c0a06" roughness={1} />
      </mesh>
      {(damned || []).map((d) => (
        <mesh
          key={d.id}
          ref={(m) => { meshRefs.current[d.id] = m; }}
          position={[d.x, 1.4, d.z]}
        >
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial
            ref={(mt) => { matRefs.current[d.id] = mt; }}
            color="#cfcfe0"
            transparent
            opacity={0.5}
            roughness={0.6}
          />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[DAMNED_FIELD.x, 9, DAMNED_FIELD.z]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Damned Field
      </Html>
    </group>
  );
}

// Presence peers: the other walkers here, so a chain thrown at a
// user has a figure to wrap. A dark cone, a pale head, their name.
function Foes({ foes }) {
  if (!foes || foes.length === 0) return null;
  return (
    <group>
      {foes.map((f) => (
        <group key={f.id} position={[f.x, 0, f.z]}>
          <mesh position={[0, 1.2, 0]}>
            <coneGeometry args={[0.7, 2.4, 8]} />
            <meshStandardMaterial color={f.color || '#22d3ee'} transparent opacity={0.75} roughness={0.6} />
          </mesh>
          <mesh position={[0, 2.7, 0]}>
            <sphereGeometry args={[0.3, 10, 10]} />
            <meshStandardMaterial color="#e8e8ee" roughness={0.6} />
          </mesh>
          <Html center distanceFactor={60} position={[0, 3.6, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
            {f.label || 'Traveller'}
          </Html>
        </group>
      ))}
    </group>
  );
}

// THE CHAIN EFFECT — see the file header for the props contract.
// Phases by age since the throw: extend (0–0.6 s), coil (0.6–1.4 s),
// flame burst (1.4–2.4 s), ash (2.4–3.4 s).
function ChainFx({ chainFx, reduced }) {
  const startRef = useRef(null);
  const burstLightRef = useRef(null);
  const groupRef = useRef(null);
  const ashRef = useRef(null);
  useEffect(() => {
    startRef.current = null;
  }, [chainFx && chainFx.atMs]);
  // One chain per target: `targets` is the throw's victim list
  // (1 at level 0, 5 at level 4); a lone `to` is the level-0
  // shape, kept for back-compat.
  const targets = useMemo(() => {
    if (!chainFx) return [];
    if (Array.isArray(chainFx.targets) && chainFx.targets.length > 0) return chainFx.targets;
    return chainFx.to ? [chainFx.to] : [];
  }, [chainFx]);
  const ashSeeds = useMemo(() => {
    const arr = [];
    for (const t of targets) {
      for (let i = 0; i < 16; i += 1) {
        arr.push({
          x: t.x + (Math.random() - 0.5) * 1.6,
          z: t.z + (Math.random() - 0.5) * 1.6,
          y: 1.2 + Math.random() * 1.4,
          fall: 0.8 + Math.random() * 1.2,
        });
      }
    }
    return arr;
  }, [chainFx && chainFx.atMs, targets]);
  useFrame((state) => {
    if (!chainFx || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    if (startRef.current == null) startRef.current = t;
    const age = t - startRef.current;
    if (burstLightRef.current) {
      burstLightRef.current.intensity = age >= 1.4 && age < 2.4
        ? 70 * (1 - (age - 1.4) / 1.0)
        : 0;
    }
    if (ashRef.current) {
      const p = Math.min(1, Math.max(0, (age - 2.4) / 1.0));
      ashRef.current.children.forEach((m, i) => {
        const s = ashSeeds[i];
        if (!s) return;
        m.position.set(s.x, Math.max(0.05, s.y - s.fall * p * 2), s.z);
        if (m.material) m.material.opacity = 0.85 * (1 - p);
      });
    }
  });
  if (!chainFx) return null;
  const from = chainFx.from || { x: 0, z: 0 };
  // Link positions for the extend phase: 14 links along each throw.
  const extendLinks = [];
  targets.forEach((to, ti) => {
    for (let i = 0; i < 14; i += 1) {
      const f = i / 13;
      extendLinks.push({
        x: from.x + (to.x - from.x) * f,
        z: from.z + (to.z - from.z) * f,
        key: `${ti}-${i}`,
      });
    }
  });
  // Helix for the coil phase: 10 links spiralling around each target.
  const coilLinks = [];
  targets.forEach((to, ti) => {
    for (let i = 0; i < 10; i += 1) {
      const a = i * 0.9;
      coilLinks.push({
        x: to.x + Math.cos(a) * 0.9,
        z: to.z + Math.sin(a) * 0.9,
        y: 0.4 + i * 0.2,
        rot: a,
        key: `${ti}-${i}`,
      });
    }
  });
  const burstCones = [
    { x: 0, z: 0, s: 1 },
    { x: 0.7, z: 0.4, s: 0.8 },
    { x: -0.7, z: 0.4, s: 0.8 },
    { x: 0.4, z: -0.7, s: 0.7 },
    { x: -0.4, z: -0.7, s: 0.7 },
  ];
  return (
    <group ref={groupRef}>
      {/* Extend: the chain flies link by link from the walker to
          the target (0.6 s — a blink, so the full line reads as the
          throw), then it coils. */}
      <group>
        {extendLinks.map((l) => (
          <mesh key={l.key} position={[l.x, 1.5, l.z]} rotation={[0.4, 0.2, 1.1]}>
            <torusGeometry args={[0.22, 0.07, 6, 12]} />
            <meshStandardMaterial color="#3a3a40" metalness={0.8} roughness={0.4} emissive="#ff5a00" emissiveIntensity={0.5} />
          </mesh>
        ))}
      </group>
      {/* Coil: the helix around the target. */}
      <group position={[0, 0, 0]}>
        {coilLinks.map((l) => (
          <mesh key={l.key} position={[l.x, l.y, l.z]} rotation={[Math.PI / 2, 0, l.rot]}>
            <torusGeometry args={[0.22, 0.07, 6, 12]} />
            <meshStandardMaterial color="#3a3a40" metalness={0.8} roughness={0.4} emissive="#ff5a00" emissiveIntensity={0.9} />
          </mesh>
        ))}
      </group>
      {/* Flame burst: expanding emissive cones + one flashing light
          (one light, on the first target — the mobile light budget).
          One burst per target. */}
      {targets.map((t, ti) => (
        <group key={`burst-${ti}`} position={[t.x, 0, t.z]}>
          {burstCones.map((b, i) => (
            <mesh key={i} position={[b.x, 1.6, b.z]}>
              <coneGeometry args={[0.9 * b.s, 2.6 * b.s, 8]} />
              <meshBasicMaterial color={i === 0 ? '#ffd27a' : '#ff7a1a'} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          ))}
          {ti === 0 && <pointLight ref={burstLightRef} position={[0, 2.5, 0]} color="#ff7a1a" intensity={0} distance={26} />}
        </group>
      ))}
      {/* Ash: dark motes falling where each target stood. */}
      <group ref={ashRef} position={[0, 0, 0]}>
        {ashSeeds.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, s.z]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshBasicMaterial color="#3a3330" transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function PortalArches() {
  const archMat = useGoldArchMaterial({ color: STONE, roughness: 0.9 });
  return (
    <group>
      {PORTALS.map((p) => (
        <group key={p.key} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[4.2, 24]} />
            <meshBasicMaterial color={PORTAL_GLOW} transparent opacity={0.16} />
          </mesh>
          {[-3.2, 3.2].map((x) => (
            <mesh key={x} position={[x, 4, 0]}>
              <boxGeometry args={[1.2, 8, 1.2]} />
              <meshStandardMaterial {...archMat} />
            </mesh>
          ))}
          <mesh position={[0, 8.4, 0]}>
            <boxGeometry args={[8.4, 1.2, 1.2]} />
            <meshStandardMaterial {...archMat} />
          </mesh>
          <mesh position={[0, 3.6, 0.1]}>
            <circleGeometry args={[2.6, 24]} />
            <meshBasicMaterial color={PORTAL_GLOW} transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 3.6, 0.15]}>
            <circleGeometry args={[1.5, 24]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
          <Html center distanceFactor={80} position={[0, 10.4, 0]} zIndexRange={[20, 0]} style={portalLabelStyle}>
            {p.label}
          </Html>
        </group>
      ))}
    </group>
  );
}

// Path torches — hell's torch-post shape (thin dark post, inverted
// cup, glow flame on top), flickering the Earth 2 way: every 3rd
// frame each lit flame breathes, intensity = base * (0.88 + 0.12 *
// sin(t*11 + id) * sin(t*5.7 + id*2)).
function Torches({ reduced }) {
  const lightRefs = useRef([]);
  const flameRefs = useRef([]);
  const frameRef = useRef(0);
  useFrame((state) => {
    if (reduced) return;
    frameRef.current += 1;
    if (frameRef.current % 3 !== 1) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < TORCHES.length; i += 1) {
      const wave = Math.sin(t * 11 + i) * Math.sin(t * 5.7 + i * 2);
      const flame = flameRefs.current[i];
      if (flame) flame.scale.set(1, 1 + 0.12 * wave, 1);
      const light = lightRefs.current[i];
      if (light) light.intensity = TORCH_LIGHT.intensity * (0.88 + 0.12 * wave);
    }
  });
  return (
    <group>
      {TORCHES.map((torch) => (
        <group key={torch.id} position={[torch.x, 0, torch.z]}>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 2.2, 8]} />
            <meshStandardMaterial color="#1a1a20" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.17, 0.2, 8]} />
            <meshStandardMaterial color="#1a1a20" roughness={0.9} />
          </mesh>
          <group ref={(g) => { flameRefs.current[torch.id] = g; }} position={[0, 2.55, 0]}>
            <mesh>
              <coneGeometry args={[0.16, 0.5, 8]} />
              <meshBasicMaterial color="#ffb03a" transparent opacity={0.95} />
            </mesh>
            <mesh position={[0, -0.05, 0]}>
              <coneGeometry args={[0.08, 0.3, 8]} />
              <meshBasicMaterial color="#ffe1a8" />
            </mesh>
          </group>
          {torch.lit && (
            <pointLight
              ref={(l) => { lightRefs.current[torch.id] = l; }}
              position={[0, 2.4, 0]}
              color="#ff9a3c"
              intensity={TORCH_LIGHT.intensity}
              distance={TORCH_LIGHT.distance}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function Embers({ reduced }) {
  const COUNT = 200;
  const ref = useRef();
  const tex = useMemo(() => getParticleTexture('ember'), []);
  const speeds = useMemo(() => {
    const arr = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) arr[i] = 0.4 + Math.random() * 1.1;
    return arr;
  }, []);
  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 220;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = Math.random() * 50;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }, []);
  useFrame((state, dt) => {
    if (reduced || !ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < COUNT; i += 1) {
      let y = pos.getY(i) + speeds[i] * dt;
      if (y > 50) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.9} color="#ff7a1a" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
    </points>
  );
}

// --- first-person camera rig -------------------------------------------------

export function CameraRig({ playerRef, inputRef, onPortal, onRegion, reduced, onAntiLife }) {
  const { camera } = useThree();
  const lastTravelRef = useRef(0);
  const travelingRef = useRef(false);
  const lastAntiLifeRef = useRef(0);
  const antiLifeTravelingRef = useRef(false);
  const lastRegionRef = useRef('');

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const player = playerRef.current;
    const input = inputRef.current;

    if (input.lookDx) {
      player.yaw -= input.lookDx * 0.005;
      input.lookDx = 0;
    }

    let f = input.fwd;
    let s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 0.01) {
      if (len > 1) { f /= len; s /= len; }
      const speed = input.run ? RUN_SPEED : WALK_SPEED;
      const fw = forward(player.yaw);
      const rt = right(player.yaw);
      const dx = (fw.x * f + rt.x * s) * speed * dt;
      const dz = (fw.z * f + rt.z * s) * speed * dt;
      const next = stepPosition(player.x, player.z, dx, dz);
      player.x = next.x;
      player.z = next.z;
    }

    camera.position.set(player.x, 2.4, player.z);
    camera.rotation.set(0, player.yaw, 0);

    const region = regionAt(player.x, player.z);
    if (region !== lastRegionRef.current) {
      lastRegionRef.current = region;
      onRegion(region);
    }

    // Walking into the arch rides the vortex back to Hell — once
    // per entry (the hell guard: re-arms when you step back out).
    const portal = nearestPortal(player.x, player.z);
    const now = state.clock.elapsedTime * 1000;
    if (portal) {
      if (!travelingRef.current && now - lastTravelRef.current > 1500) {
        travelingRef.current = true;
        lastTravelRef.current = now;
        onPortal(portal);
      }
    } else {
      travelingRef.current = false;
    }
    // ANTI-LIFE PORTAL: step onto the dark disc and you fall
    // through the floor into Anti-Life — same once-per-entry guard.
    if (onAntiLife && isOnAntiLifePortal(player.x, player.z)) {
      if (!antiLifeTravelingRef.current && now - lastAntiLifeRef.current > 1500) {
        antiLifeTravelingRef.current = true;
        lastAntiLifeRef.current = now;
        onAntiLife();
      }
    } else {
      antiLifeTravelingRef.current = false;
    }
  });

  return null;
}

// --- the whole scene ---------------------------------------------------------

export function GhostRiderScene({ playerRef, inputRef, onPortal, onRegion, reduced, onAntiLife, damned, foes, chainFx }) {
  // DAY / NIGHT STORM (Merlin, 2026-11-14): this realm is Christian
  // hell, so it takes hell's red shade and storm. A strike's ground
  // fire never lands on the walker (5 m), the Rider's circle, the
  // arch, or the spawn — visual only, no hazard law here.
  const isOpenGround = (x, z) => {
    const p = playerRef.current;
    if (p && Math.hypot(x - p.x, z - p.z) < 5) return false;
    if (Math.hypot(x, z) > WORLD_RADIUS - 20) return false;
    if (Math.hypot(x - RIDER.x, z - RIDER.z) < RIDER.r + 6) return false;
    if (PORTALS.some((portal) => Math.hypot(x - portal.x, z - portal.z) < 10)) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 12) return false;
    return true;
  };
  return (
    <>
      <DayNightRig
        shade={NETHER_REALM_SHADE.hell}
        storm={{
          hue: 'red',
          bounds: { xMin: -260, xMax: 260, zMin: -260, zMax: 260 },
          isOpenGround,
          realm: 'ghost-rider',
          seed: 7103,
        }}
      />
      <Ground />
      <Rider reduced={reduced} />
      <DamnedField damned={damned} chainFx={chainFx} reduced={reduced} />
      <Foes foes={foes} />
      <PortalArches />
      <AntiLifePortalDisc />
      <Torches reduced={reduced} />
      <Embers reduced={reduced} />
      <ChainFx chainFx={chainFx} reduced={reduced} />
      <CameraRig
        playerRef={playerRef}
        inputRef={inputRef}
        onPortal={onPortal}
        onAntiLife={onAntiLife}
        onRegion={onRegion}
        reduced={reduced}
      />
    </>
  );
}
