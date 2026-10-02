'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { mulberry32 } from '@/lib/babel/rand';
import { prefersReducedMotion } from '@/lib/babel/walk';
import { makeRiverBlocker } from '@/lib/babel/arena-collide';

// Page-level toast plumbing: dispatch DUAT_ARENA_EVENT with
// { detail: { kind: 'toast', text } } — the page renders the pill.
export const DUAT_ARENA_EVENT = 'DUAT_ARENA_EVENT';

// The Nile — a walkable river crossing the east dunes. Rect |px - 60| < 7,
// z in [-150, 150]; bridges are walkable rects 6 wide crossing it.
const RIVER = {
  x: 60,
  width: 14,
  zMin: -150,
  zMax: 150,
  bridges: [
    { z: -60, halfWidth: 3 },
    { z: 0, halfWidth: 3 },
    { z: 60, halfWidth: 3 },
  ],
};

// Sphinxes. Built facing +z locally; yaw = rotation.y applied to the group.
// west/east sphinxes flank the pyramid approach and face the walker (+z);
// the Nile sphinx stands on the west bank and faces the river (+x).
const SPHINXES = [
  { x: -14, z: -18, yaw: 0 },
  { x: 14, z: -18, yaw: 0 },
  { x: 48, z: 40, yaw: Math.PI / 2 },
];
const SPHINX_R = 3.2;

// Colliders registered into gameRef.colliders. FloorDuat values confirmed:
// pyramid cone r=42 at (0,-45) → footprint ~±29.7, collider r=30; obelisks at
// (±16, 8), pedestal 5×5 → r=2.8 with a margin.
const BASE_COLLIDERS = [
  { kind: 'circle', x: 0, z: -45, r: 30 }, // great pyramid
  { kind: 'circle', x: -16, z: 8, r: 2.8 }, // west obelisk
  { kind: 'circle', x: 16, z: 8, r: 2.8 }, // east obelisk
  ...SPHINXES.map((s) => ({ kind: 'circle', x: s.x, z: s.z, r: SPHINX_R })),
];

// Hidden Duat gold. (a) behind the east sphinx, at the pyramid rim — reachable
// by circling the sphinx or hugging the pyramid edge; (b) across the Nile on
// the far bank near the north bridge — rewards exploring the other side.
const GOLD_STORE_KEY = 'babel-duat-gold';
const GOLD_SPOTS = [
  { id: 'sphinx-shadow', x: 17.5, z: -22 },
  { id: 'far-bank', x: 74, z: -58 },
];
const FIND_RADIUS = 2.6;

function loadGoldFound() {
  try {
    const raw = window.localStorage.getItem(GOLD_STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

// A primitive-built sphinx: lion body, raised chest, nemes-framed head,
// stretched front paws, curling tail. Solid visuals — no pass-through.
function Sphinx({ x, z, yaw }) {
  const stone = { color: '#d9b06a', roughness: 0.95 };
  const head = { color: '#cfa055', roughness: 0.9 };
  const nemes = { color: '#e8c46a', roughness: 0.7 };
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* lion body */}
      <mesh position={[0, 1.1, -0.6]}>
        <boxGeometry args={[2.2, 2.2, 5.4]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      {/* haunches */}
      <mesh position={[0, 0.9, -2.6]}>
        <boxGeometry args={[2.0, 1.8, 1.6]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      {/* raised chest */}
      <mesh position={[0, 1.3, 1.9]}>
        <boxGeometry args={[2.2, 2.6, 1.4]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      {/* head */}
      <mesh position={[0, 3.5, 2.1]}>
        <boxGeometry args={[1.7, 1.8, 1.8]} />
        <meshStandardMaterial {...head} />
      </mesh>
      {/* nemes stripes — two angled panels framing the face */}
      <mesh position={[-0.95, 3.3, 1.7]} rotation={[0, 0, 0.32]}>
        <boxGeometry args={[0.5, 1.7, 0.6]} />
        <meshStandardMaterial {...nemes} />
      </mesh>
      <mesh position={[0.95, 3.3, 1.7]} rotation={[0, 0, -0.32]}>
        <boxGeometry args={[0.5, 1.7, 0.6]} />
        <meshStandardMaterial {...nemes} />
      </mesh>
      {/* stretched front paws */}
      {[-0.65, 0.65].map((px) => (
        <mesh key={px} position={[px, 0.32, 3.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.42, 2.6, 10]} />
          <meshStandardMaterial {...stone} />
        </mesh>
      ))}
      {/* curling tail */}
      <mesh position={[0, 1.5, -3.5]} rotation={[0.55, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.24, 2.2, 8]} />
        <meshStandardMaterial {...head} />
      </mesh>
    </group>
  );
}

// Gold stack: deterministic coin scatter (mulberry32) + a glint shard.
// Per-frame animation is driven by the parent's useFrame via coinRef/glintRef,
// exactly like SylvaGold — walkers spot the glint shard at range.
function GoldStack({ spot, i, coinRef, glintRef }) {
  const rand = mulberry32(0x64af01 + i);
  const coins = [0, 1, 2].map((k) => ({
    x: (rand() - 0.5) * 0.5,
    z: (rand() - 0.5) * 0.5,
    rot: rand() * Math.PI * 2,
  }));
  return (
    <group position={[spot.x, 0, spot.z]}>
      {coins.map((c, k) => (
        <mesh
          key={k}
          ref={k === 0 ? (m) => { coinRef.current[i] = { mesh: m, seedRot: c.rot }; } : undefined}
          position={[c.x, 0.05 + k * 0.07, c.z]}
          rotation={[0.1, c.rot, 0.06]}
        >
          <cylinderGeometry args={[0.3, 0.3, 0.09, 24]} />
          <meshStandardMaterial
            color="#d4a24e"
            metalness={1}
            roughness={0.3}
            emissive="#8a5a17"
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}
      <mesh
        ref={(m) => { glintRef.current[i] = m; }}
        position={[0, 0.55, 0]}
      >
        <octahedronGeometry args={[0.09, 0]} />
        <meshBasicMaterial color="#ffe9b0" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Duat environment layer: the Nile + bridges, sphinxes, hidden gold.
// Visuals + collider registration only — no gameplay logic here.
// No shadows on any mesh (phone perf); scene lighting/fog stay as FloorDuat set.
export default function DuatEnv({ gameRef, walkMode }) {
  const waterMat = useRef(null);
  const coins = useRef([]);
  const glints = useRef([]);
  const found = useRef(null);
  const reduced = useRef(null);
  const activeRef = useRef(walkMode);
  activeRef.current = walkMode;

  // Collider + river registration on the shared arena state.
  useEffect(() => {
    const g = gameRef && gameRef.current;
    if (!g) return undefined;
    if (!Array.isArray(g.colliders)) g.colliders = [];
    const added = BASE_COLLIDERS.map((c) => ({ ...c }));
    g.colliders.push(...added);
    const prevRiver = g.riverCheck;
    g.riverCheck = makeRiverBlocker(RIVER);
    return () => {
      const gg = gameRef && gameRef.current;
      if (!gg) return;
      gg.colliders = gg.colliders.filter((c) => !added.includes(c));
      if (gg.riverCheck && gg.riverCheck !== prevRiver) gg.riverCheck = prevRiver;
    };
  }, [gameRef]);

  useEffect(() => {
    if (!found.current) found.current = loadGoldFound();
  }, []);

  useFrame((state) => {
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    if (!found.current) found.current = loadGoldFound();
    const t = state.clock.elapsedTime;
    // Water shimmer: gentle opacity breathing; static under reduced motion.
    if (waterMat.current) {
      waterMat.current.opacity = reduced.current
        ? 0.72
        : 0.72 + Math.sin(t * 1.6) * 0.08;
    }
    // Gold animation — coin turn + glint pulse, calmer once found.
    GOLD_SPOTS.forEach((s, i) => {
      const isFound = found.current.has(s.id);
      const entry = coins.current[i];
      if (entry && entry.mesh) {
        entry.mesh.rotation.y = (reduced.current ? 0.6 : t * 0.5) + entry.seedRot;
        const m = entry.mesh.material;
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
    });
    // Gold discovery — walk mode only, so the orbit camera can't trigger it.
    // Walker position comes from the page's inputRef, attached to the shared
    // game state by the arena provider (see RECON §7).
    const inp = gameRef && gameRef.current && gameRef.current.inputRef
      ? gameRef.current.inputRef
      : null;
    GOLD_SPOTS.forEach((s) => {
      const isFound = found.current.has(s.id);
      if (activeRef.current && !isFound && inp && inp.current && inp.current.pos) {
        const d = Math.hypot(inp.current.pos.x - s.x, inp.current.pos.z - s.z);
        if (d < FIND_RADIUS) {
          found.current.add(s.id);
          try {
            window.localStorage.setItem(GOLD_STORE_KEY, JSON.stringify([...found.current]));
          } catch {
            // private mode — the toast still fires, it just won't persist
          }
          window.dispatchEvent(
            new CustomEvent(DUAT_ARENA_EVENT, {
              detail: { kind: 'toast', text: `✦ You found Duat gold (${found.current.size}/${GOLD_SPOTS.length})` },
            })
          );
        }
      }
    });
  });

  return (
    <group>
      {/* the Nile — riverbed + water, slightly below sand level */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[RIVER.x, -0.25, 0]}>
        <planeGeometry args={[RIVER.width + 2, 300]} />
        <meshStandardMaterial color="#1a2b33" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[RIVER.x, -0.15, 0]}>
        <planeGeometry args={[RIVER.width, 300]} />
        <meshStandardMaterial
          ref={(m) => { waterMat.current = m; }}
          color="#2e8b9a"
          transparent
          opacity={0.72}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>

      {/* bridges — stone decks with low rails, walkable over the river */}
      {RIVER.bridges.map((b) => (
        <group key={b.z} position={[RIVER.x, 0, b.z]}>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[RIVER.width + 4, 0.6, b.halfWidth * 2]} />
            <meshStandardMaterial color="#b08d5f" roughness={0.9} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, 0.8, side * (b.halfWidth - 0.25)]}>
              <boxGeometry args={[RIVER.width + 4, 0.8, 0.4]} />
              <meshStandardMaterial color="#9c7a52" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}

      {/* sphinxes */}
      {SPHINXES.map((s, i) => (
        <Sphinx key={i} x={s.x} z={s.z} yaw={s.yaw} />
      ))}

      {/* hidden gold — coin stacks rendered from mulberry32 scatter */}
      {GOLD_SPOTS.map((s, i) => (
        <GoldStack key={s.id} spot={s} i={i} coinRef={coins} glintRef={glints} />
      ))}
    </group>
  );
}
