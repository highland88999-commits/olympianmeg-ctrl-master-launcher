// app/svarga/world3d.js
// SVARGA 3D scene — procedural, no external assets.
//
// Indra's heaven — gardens, lotus lakes, and the golden mountain. Amaravati, Indra's golden city: a palace with domes, ringed by pillars. First-person walk; the camera rig lives
// here too so the page shell stays lean. Bright, not dark: light posts
// instead of fire, a bright sky, drifting motes of light.
//
// Patterns follow app/helheim/world3d.js: Canvas +
// useSceneContextGuard, Html labels from drei, touch UI detected via
// maxTouchPoints, plain English everywhere. No game mechanics in the
// base shell — the arches only navigate, nothing fights, nothing charges.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FloorDropDisc } from '@/components/world/FloorDrop';
import { FLOOR_DROP_DISC_HEAVEN, createFloorDropGuard, floorDropGuardShouldFire } from '@/lib/world/floor-drop';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  ASCENT_PORTAL,
  CENTER,
  GATES,
  PORTALS,
  RUN_SPEED,
  LIGHT_COLORS,
  LIGHT,
  WALK_SPEED,
  forward,
  makeLights,
  makeWorld,
  nearestPortal,
  regionAt,
  right,
  stepPosition,
} from '@/lib/svarga/world';
import DayNightRig from '@/components/DayNightRig';

const STONE = '#d9c08a';
const PALE_STONE = '#f5e6c8';
const GLOW = '#ff9ec7';
const PORTAL_GLOW = '#ff9ec7';

// --- canvas textures (procedural, seeded) ---------------------------------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#e8d5a8';
  g.fillRect(0, 0, 1024, 1024);
  // Speckled bright ground.
  for (let i = 0; i < 9000; i += 1) {
    const v = 200 + Math.floor(Math.random() * 55);
    g.fillStyle = `rgb(${v},${Math.floor(v * 0.98)},${Math.floor(v * 0.9)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Glowing light veins.
  g.strokeStyle = '#ff9ec7';
  g.shadowColor = '#ff9ec7';
  g.shadowBlur = 14;
  for (let i = 0; i < 26; i += 1) {
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    g.lineWidth = 1.5 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 4 + Math.floor(Math.random() * 6);
    for (let s = 0; s < steps; s += 1) {
      x += (Math.random() - 0.5) * 220;
      y += (Math.random() - 0.5) * 220;
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

function riverTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f0c9e0';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(255, 158, 199, ${0.25 + Math.random() * 0.5})`;
    g.lineWidth = 1 + Math.random() * 3;
    const y = Math.random() * 128;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + (Math.random() - 0.5) * 30, 340, y + (Math.random() - 0.5) * 30, 512, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- labels ----------------------------------------------------------------

const portalLabelStyle = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontSize: 15,
  fontWeight: 700,
  color: '#3a2a00',
  background: 'rgba(255, 250, 230, 0.88)',
  border: '1px solid rgba(180, 140, 20, 0.65)',
  borderRadius: 999,
  padding: '4px 12px',
};

const regionLabelStyle = {
  ...portalLabelStyle,
  fontSize: 13,
  fontWeight: 600,
  color: '#33302a',
  background: 'rgba(255, 250, 235, 0.8)',
  border: '1px solid rgba(120, 110, 80, 0.4)',
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

function Pools({pools}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color={GLOW} transparent opacity={0.18} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function River({reduced}) {
  const tex = useMemo(() => riverTexture(), []);
  useFrame((state, dt) => {
    if (reduced) return;
    tex.offset.x += dt * 0.012;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <planeGeometry args={[820, 36]} />
        <meshStandardMaterial
          map={tex}
          color="#f5d0e4"
          transparent
          opacity={0.92}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      <Html center distanceFactor={90} position={[0, 3.5, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Mandakini
      </Html>
    </group>
  );
}

function Bridge() {
  const slabs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  return (
    <group>
      {slabs.map((x) => (
        <mesh key={x} position={[x, 0.3, 0]}>
          <boxGeometry args={[3.2, 0.6, 38]} />
          <meshStandardMaterial color="#f5f0e0" roughness={0.7} />
        </mesh>
      ))}
      {[-9.5, 9.5].map((x) => (
        <mesh key={x} position={[x, 1.4, 0]}>
          <boxGeometry args={[0.4, 0.6, 38]} />
          <meshStandardMaterial color="#d4af37" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Gates() {
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 7, 4]} color={GLOW} intensity={14} distance={34} />
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial color="#f5f0e0" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial color="#f5f0e0" roughness={0.85} />
      </mesh>
      <mesh position={[0, 13.2, 0]}>
        <boxGeometry args={[11, 0.5, 0.4]} />
        <meshBasicMaterial color={GLOW} />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Indra's Gates
      </Html>
    </group>
  );
}

function Center() {
  // Amaravati, Indra's golden city: a palace with domes, ringed by pillars.
  return (
    <group position={[CENTER.x, 0, CENTER.z]}>
      <pointLight position={[0, 14, 12]} color="#ff9ec7" intensity={70} distance={120} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[17, 19, 2, 24]} />
        <meshStandardMaterial color="#f5e6c8" roughness={0.9} />
      </mesh>
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[26, 8, 14]} />
        <meshStandardMaterial color="#ffd700" roughness={0.4} metalness={0.5} />
      </mesh>
      {[-8, 8].map((x) => (
        <mesh key={x} position={[x, 11, 0]}>
          <sphereGeometry args={[4, 16, 12]} />
          <meshStandardMaterial color="#ffb03a" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 12, 0]}>
        <sphereGeometry args={[5, 16, 12]} />
        <meshStandardMaterial color="#ff9ec7" roughness={0.4} metalness={0.5} />
      </mesh>
      {[-11, -5.5, 5.5, 11].map((x) => (
        <mesh key={x} position={[x, 4, 7.2]}>
          <cylinderGeometry args={[0.8, 1, 8, 10]} />
          <meshStandardMaterial color="#fff6d8" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={140} position={[0, 19, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Amaravati
      </Html>
    </group>
  );
}

function WestRegion({stones, drift, reduced}) {
  const westDrift = useMemo(() => drift.filter((s) => s.id.startsWith('w')), [drift]);
  const driftRefs = useRef([]);
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    driftRefs.current.forEach((m, i) => {
      if (!m) return;
      m.position.y = 1.4 + Math.sin(t * westDrift[i].slow + i * 1.7) * 0.45;
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      {stones.map((s) => (
        <mesh key={s.id} position={[s.x, s.h / 2, s.z]} rotation={[0, s.id * 0.7, 0]}>
          <boxGeometry args={[1.2, s.h, 0.8]} />
          <meshStandardMaterial color={PALE_STONE} roughness={1} />
        </mesh>
      ))}
      {westDrift.map((s, i) => (
        <mesh
          key={s.id}
          ref={(m) => { driftRefs.current[i] = m; }}
          position={[s.x, 1.4, s.z]}
        >
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#fffbe8" transparent opacity={0.55} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[-160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Nandana Gardens
      </Html>
    </group>
  );
}

function EastRegion({pillars, drift}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#f5eeda" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[12, 24]} />
        <meshBasicMaterial color={GLOW} transparent opacity={0.45} />
      </mesh>
      <pointLight position={[160, 10, -70]} color={GLOW} intensity={45} distance={95} />
      {pillars.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </mesh>
      ))}
      {drift.filter((s) => s.id.startsWith('e')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#fffbe8" transparent opacity={0.7} roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Lotus Lakes
      </Html>
    </group>
  );
}

function NorthRegion({pits, drift, reduced}) {
  const pitRefs = useRef([]);
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    pitRefs.current.forEach((m, i) => {
      if (!m) return;
      const s = 1 + Math.sin(t * 3 + i * 2.1) * 0.12;
      m.scale.set(s, 1 + Math.sin(t * 4 + i) * 0.15, s);
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -230]}>
        <circleGeometry args={[80, 40]} />
        <meshStandardMaterial color="#f0e8d0" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color={GLOW} intensity={55} distance={110} />
      {pits.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color={GLOW} transparent opacity={0.3} />
          </mesh>
          <mesh
            ref={(m) => { pitRefs.current[p.id] = m; }}
            position={[0, 1.8, 0]}
          >
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      {drift.filter((s) => s.id.startsWith('n')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#fffbe8" transparent opacity={0.7} roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Mount Meru
      </Html>
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
            <meshBasicMaterial color="#ffffff" transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
          <Html center distanceFactor={80} position={[0, 10.4, 0]} zIndexRange={[20, 0]} style={portalLabelStyle}>
            {p.label}
          </Html>
        </group>
      ))}
    </group>
  );
}

// The entry portal — a real, persistent portal object (id
// 'svarga-gate', name="svarga-gate" on the group so the next round's
// portal system can find it in the scene graph), not just a spawn
// marker. This higher realm is HINDU heaven; the portal
// system hangs off this portal next round. The ring is deliberately a
// full circle, distinct from the five standing-stone arches: it is the
// doorway you came up through, and the way back down. Walking through
// it does nothing in this round — the portal system comes later.
function EntryPortal() {
  const stones = [];
  for (let i = 0; i < 8; i += 1) {
    // Offset by 22.5°: without it a stone sits dead-centre on the south
    // side, 8m from spawn, filling the middle of the view and blocking
    // the doorway (spawn screenshot, 2026-11-12). Fixed 2026-11-12 on
    // Merlin's word.
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    stones.push({ x: Math.cos(a) * 6, z: Math.sin(a) * 6, key: i });
  }
  return (
    <group name="svarga-gate" position={[ASCENT_PORTAL.x, 0, ASCENT_PORTAL.z]}>
      {stones.map((s) => (
        <mesh key={s.key} position={[s.x, 0.8, s.z]}>
          <boxGeometry args={[1.4, 1.6, 1]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[3, 20]} />
        <meshBasicMaterial color={GLOW} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[ASCENT_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color={GLOW} transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* The name rides low, as a plaque at the portal's foot: a label
          above the ring is clipped by the viewport edge at spawn (the
          phone's portrait FOV is narrow) and collides with the HUD.
          Short name only. */}
      <Html center distanceFactor={25} position={[0, 1.6, 2.5]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Svarga Gate
      </Html>
    </group>
  );
}

// --- light: real light, Earth 2 torch style, but no fire -------------------
//
// The light post is the Earth 2 torch-post shape: a thin pale post, an
// inverted cup, a glowing orb on top. The light follows
// lib/building/piece-render.js LIGHT_SPECS exactly for the torch-post:
// intensity 10, distance 14, riding at the orb. The breathing is Earth
// 2's flicker wave (components/earth2/Earth2World.jsx, 2026-11-03):
// every 3rd frame each lit orb breathes, intensity = base *
// (0.88 + 0.12 * sin(t*11 + id) * sin(t*5.7 + id*2)), and the orb
// breathes with the same wave.
//
// Only the 8 route-marking posts carry a real point light (the mobile
// budget: 8 light posts + 4 region lights = 12 total). Every post
// still shows its glowing orb; the lit ones are the pools of light
// along the way up.
function Lights({reduced}) {
  const lights = useMemo(() => makeLights(), []);
  const lightRefs = useRef([]);
  const orbRefs = useRef([]);
  const frameRef = useRef(0);

  useFrame((state) => {
    if (reduced) return;
    frameRef.current += 1;
    if (frameRef.current % 3 !== 1) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < lights.length; i += 1) {
      const wave = Math.sin(t * 11 + i) * Math.sin(t * 5.7 + i * 2);
      const orb = orbRefs.current[i];
      if (orb) orb.scale.set(1, 1 + 0.12 * wave, 1);
      const light = lightRefs.current[i];
      if (light) light.intensity = LIGHT.intensity * (0.88 + 0.12 * wave);
    }
  });

  return (
    <group>
      {lights.map((post) => {
        const colors = LIGHT_COLORS[post.hue];
        return (
          <group key={post.id} position={[post.x, 0, post.z]}>
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 2.2, 8]} />
              <meshStandardMaterial color="#f5f0e0" roughness={0.9} />
            </mesh>
            <mesh position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.17, 0.2, 8]} />
              <meshStandardMaterial color="#f5f0e0" roughness={0.9} />
            </mesh>
            <group
              ref={(g) => { orbRefs.current[post.id] = g; }}
              position={[0, 2.55, 0]}
            >
              <mesh>
                <sphereGeometry args={[0.22, 12, 10]} />
                <meshBasicMaterial color={colors.orb} transparent opacity={0.95} />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[0.1, 8, 8]} />
                <meshBasicMaterial color={colors.core} />
              </mesh>
            </group>
            {post.lit && (
              <pointLight
                ref={(l) => { lightRefs.current[post.id] = l; }}
                position={[0, 2.4, 0]}
                color={colors.light}
                intensity={LIGHT.intensity}
                distance={LIGHT.distance}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

function Motes({reduced}) {
  const COUNT = 260;
  const ref = useRef();
  const tex = useMemo(() => getParticleTexture('glow'), []);
  const speeds = useMemo(() => {
    const arr = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) arr[i] = 0.4 + Math.random() * 1.1;
    return arr;
  }, []);
  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 300;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = Math.random() * 60;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }, []);
  useFrame((state, dt) => {
    if (reduced || !ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < COUNT; i += 1) {
      let y = pos.getY(i) + speeds[i] * dt;
      if (y > 60) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.9} color="#ff9ec7" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
    </points>
  );
}

// --- first-person camera rig -------------------------------------------------

export function CameraRig({playerRef, inputRef, onPortal, onRegion, reduced, onFloorDrop}) {
  const { camera } = useThree();
  const lastTravelRef = useRef(0);
  const travelingRef = useRef(false);
  const floorDropGuardRef = useRef(createFloorDropGuard());
  const lastRegionRef = useRef('');

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const player = playerRef.current;
    const input = inputRef.current;

    // Look: accumulated drag deltas from mouse / touch.
    if (input.lookDx) {
      player.yaw -= input.lookDx * 0.005;
      input.lookDx = 0;
    }

    // Move: keyboard or touch stick.
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

    // Walking into an arch rides the vortex to that realm — once per
    // entry. Without the traveling guard, standing inside the arch
    // re-fired travel() every 1.5s, each call re-picking the tube skins
    // and restarting the ride, so it never finished (headless probe,
    // 2026-11-12). Re-arms when the player steps back out.
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
    // FLOOR DROP (WS-C, Nov 16): the disc at the Anti-Life spot (-70, 110) drops the
    // walker through the floor to the Land of the Dead — the same
    // once-per-entry guard as the arches and the Anti-Life disc, with
    // its own guard state, so standing on the disc re-fires only
    // after stepping back out. The origin rides along, so the floor
    // portal in the Land of the Dead knows where to send the walker back.
    if (onFloorDrop && floorDropGuardShouldFire(floorDropGuardRef.current, player.x, player.z, FLOOR_DROP_DISC_HEAVEN, now)) {
      onFloorDrop();
    }
  });

  return null;
}

// --- the whole scene ---------------------------------------------------------

export function SvargaScene({playerRef, inputRef, onPortal, onRegion, reduced, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1337), []);
  return (
    <>
      <DayNightRig sun moon shade="earth" fogDensity={0.0028} />
      <Ground />
      <Pools pools={world.lotusPonds} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Center />
      <WestRegion stones={world.gardenStones} drift={world.apsaras} reduced={reduced} />
      <EastRegion pillars={world.lotusPillars}  drift={world.apsaras}/>
      <NorthRegion pits={world.meruRocks} drift={world.apsaras} reduced={reduced} />
      <PortalArches />
      <EntryPortal />
      <Lights reduced={reduced} />
      <Motes reduced={reduced} />
      <FloorDropDisc side="heaven" reduced={reduced} />
      <CameraRig
        playerRef={playerRef}
        inputRef={inputRef}
        onPortal={onPortal}
        onFloorDrop={onFloorDrop}
        onRegion={onRegion}
        reduced={reduced}
      />
    </>
  );
}
