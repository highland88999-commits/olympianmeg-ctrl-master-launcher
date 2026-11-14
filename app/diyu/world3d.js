// app/diyu/world3d.js
// DIYU 3D scene — procedural, no external assets.
//
// The ten courts of hell — King Yama judges, the bridge crosses, the wheel turns.
// First-person walk; the camera rig lives here too so the page shell
// stays lean. Patterns follow app/nether-realm/world3d.js: Canvas +
// useSceneContextGuard, Html labels from drei, plain English
// everywhere. No game mechanics in the base shell — the arches only
// navigate, nothing fights, nothing charges.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  DESCENT_PORTAL,
  GATES,
  COURT as LANDMARK,
  PORTALS,
  RIVER,
  RUN_SPEED,
  TORCH_COLORS,
  TORCH_LIGHT,
  WALK_SPEED,
  WORLD_RADIUS,
  forward,
  makeTorches,
  makeWorld,
  nearestPortal,
  regionAt,
  right,
  stepPosition,
} from '@/lib/diyu/world';
import DayNightRig from '@/components/DayNightRig';
import { NETHER_REALM_SHADE } from '@/lib/day-night';

const ROCK = '#141118';
const STONE = '#2a2a32';
const PALE_STONE = '#55555e';
const DARK = '#0d0d12';
const LAVA = '#ff2a1a';
const PORTAL_GLOW = '#7c3aed';

// --- canvas textures (procedural, seeded) ---------------------------------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#140505';
  g.fillRect(0, 0, 1024, 1024);
  // Speckled basalt.
  for (let i = 0; i < 9000; i += 1) {
    const v = 8 + Math.floor(Math.random() * 22);
    g.fillStyle = `rgb(${v},${Math.floor(v * 0.9)},${Math.floor(v * 1.2)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Glowing veins.
  g.strokeStyle = LAVA;
  g.shadowColor = LAVA;
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
  g.fillStyle = '#1a0505';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(20, 90, 70, ${0.25 + Math.random() * 0.5})`;
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

function FirePools({ pools }) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color={LAVA} transparent opacity={0.22} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function River({ reduced }) {
  const tex = useMemo(() => riverTexture(), []);
  useFrame((state, dt) => {
    if (reduced) return;
    tex.offset.x += dt * 0.012;
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <planeGeometry args={[820, 36]} />
        <meshStandardMaterial
          map={tex}
          color="#8a2a1a"
          transparent
          opacity={0.92}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      {/* The river's own plain-words label, east of the bridge so it
          never covers the crossing (the Kur fix: rivers had no label). */}
      <Html center distanceFactor={120} position={[16, 3.5, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Wangchuan
      </Html>
    </>
  );
}

function Bridge() {
  const slabs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  return (
    <group>
      {slabs.map((x) => (
        <mesh key={x} position={[x, 0.3, 0]}>
          <boxGeometry args={[3.2, 0.6, 38]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
      {/* The Naihe Bridge over the Wangchuan, the river of
          forgetfulness. The label rides low at the south mouth, where
          the player steps on — a label above the span would hang in
          the walk view and collide with the HUD while crossing. */}
      <Html center distanceFactor={40} position={[0, 2.5, 20]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Naihe Bridge
      </Html>
    </group>
  );
}

function Gates() {
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 10, 0]} color="#ff2200" intensity={14} distance={34} />
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial color="#0f0f14" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial color="#0f0f14" roughness={0.85} />
      </mesh>
      <mesh position={[0, 13.2, 0]}>
        <boxGeometry args={[11, 0.5, 0.4]} />
        <meshBasicMaterial color="#ff2a1a" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Gates
      </Html>
    </group>
  );
}

function Landmark() {
  // King Yama's Court: a red-and-gold judgment hall, the tenth and
  // final court, where the verdict is read.
  return (
    <group position={[LANDMARK.x, 0, LANDMARK.z]}>
      <pointLight position={[0, 10, 0]} color="#ffc233" intensity={45} distance={95} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[15, 17, 2, 24]} />
        <meshStandardMaterial color="#1c0805" roughness={0.9} />
      </mesh>
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[20, 14, 16]} />
        <meshStandardMaterial color="#4a0d05" roughness={0.85} />
      </mesh>
      <mesh position={[0, 16.5, 0]}>
        <coneGeometry args={[15, 6, 4]} />
        <meshStandardMaterial color="#ffc233" roughness={0.7} />
      </mesh>
      {[-8, 8].map((x) => (
        <mesh key={x} position={[x, 6, 9]}>
          <cylinderGeometry args={[0.9, 1.1, 12, 8]} />
          <meshStandardMaterial color="#7a1a08" roughness={0.9} />
        </mesh>
      ))}
      {/* the judgment seat, facing the plaza */}
      <mesh position={[0, 4, 6]}>
        <boxGeometry args={[6, 6, 2.5]} />
        <meshStandardMaterial color="#2a0a04" roughness={0.85} />
      </mesh>
      <mesh position={[0, 7.4, 6]}>
        <boxGeometry args={[2.5, 2, 0.8]} />
        <meshBasicMaterial color="#ffc233" />
      </mesh>
      <Html center distanceFactor={140} position={[0, 21, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        {"King Yama's Court"}
      </Html>
    </group>
  );
}

function WestRegion({ dressing, shades, reduced }) {
  const westShades = useMemo(() => shades.filter((s) => s.id.startsWith('a')), [shades]);
  const shadeRefs = useRef([]);
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    shadeRefs.current.forEach((m, i) => {
      if (!m) return;
      m.position.y = 1.4 + Math.sin(t * westShades[i].slow + i * 1.7) * 0.45;
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#33100a" roughness={1} />
      </mesh>
      {dressing.map((s) => (
        <mesh key={s.id} position={[s.x, s.h / 2, s.z]} rotation={[0, s.id * 0.7, 0]}>
          <boxGeometry args={[1.2, s.h, 0.8]} />
          <meshStandardMaterial color={PALE_STONE} roughness={1} />
        </mesh>
      ))}
      {westShades.map((s, i) => (
        <mesh
          key={s.id}
          ref={(m) => { shadeRefs.current[i] = m; }}
          position={[s.x, 1.4, s.z]}
        >
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#e8e8ee" transparent opacity={0.45} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[-160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Ten Courts
      </Html>
    </group>
  );
}

function EastRegion({ dressing }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#2a0803" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[12, 24]} />
        <meshBasicMaterial color="#ffe9a8" transparent opacity={0.45} />
      </mesh>
      <pointLight position={[160, 10, -70]} color='#ff5a1a' intensity={45} distance={95} />
      {dressing.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial color="#d8d2c0" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Torment Halls
      </Html>
    </group>
  );
}

function NorthRegion({ dressing, shades, reduced }) {
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
        <meshStandardMaterial color="#241505" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color='#ffd98a' intensity={55} distance={110} />
      {dressing.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color={LAVA} transparent opacity={0.3} />
          </mesh>
          <mesh
            ref={(m) => { pitRefs.current[p.id] = m; }}
            position={[0, 1.8, 0]}
          >
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      {shades.filter((s) => s.id.startsWith('t')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#2a2a33" transparent opacity={0.7} roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Wheel of Rebirth
      </Html>
    </group>
  );
}

function PortalArches() {
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
              <meshStandardMaterial color={STONE} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 8.4, 0]}>
            <boxGeometry args={[8.4, 1.2, 1.2]} />
            <meshStandardMaterial color={STONE} roughness={0.9} />
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

// The Descent portal — a real, persistent portal object (id
// 'descent-portal', name="descent-portal" on the group so the next
// round's mythos-chooser menu can find it in the scene graph), not
// just a spawn marker. This nether-realm is Chinese hell; the menu hangs
// off this portal next round. The ring is deliberately a full circle,
// distinct from the standing-stone arches: it is the doorway you came
// down through, and the way back up. Walking through it does nothing
// in this round — the menu comes later.
function DescentPortal() {
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
    <group name="descent-portal" position={[DESCENT_PORTAL.x, 0, DESCENT_PORTAL.z]}>
      {stones.map((s) => (
        <mesh key={s.key} position={[s.x, 0.8, s.z]}>
          <boxGeometry args={[1.4, 1.6, 1]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[3, 20]} />
        <meshBasicMaterial color={LAVA} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[DESCENT_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color="#4c1d95" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* The name rides low, as a plaque at the portal's foot: a label
          above the ring is clipped by the viewport edge at spawn (the
          phone's portrait FOV is narrow) and collides with the HUD.
          Short name only — every other label is a short name. */}
      <Html center distanceFactor={25} position={[0, 1.6, 2.5]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Descent
      </Html>
    </group>
  );
}

// --- fire: real light, Earth 2 torch style ---------------------------------
//
// The torch is the Earth 2 torch-post shape (lib/building/piece-geometry.js):
// a thin dark post, an inverted cup, a glow flame on top — scaled to this
// world's metres. The light follows lib/building/piece-render.js LIGHT_SPECS
// exactly for the yellow torch-post: warm 0xff9a3c, intensity 10, distance
// 14, riding at the flame. red is the same discipline in the other
// hue of this world. The flicker is Earth 2's
// (components/earth2/Earth2World.jsx, "Fire flicker", 2026-11-03):
// every 3rd frame each lit flame breathes,
// intensity = base * (0.88 + 0.12 * sin(t*11 + id) * sin(t*5.7 + id*2)),
// and the flame cone breathes with the same wave.
//
// Only the 8 route-marking torches carry a real point light (the mobile
// budget: 8 torch lights + 4 region lights = 12 total). Every torch
// still shows its flame; the lit ones are the pools of light along
// the way down.
function Torches({ reduced }) {
  const torches = useMemo(() => makeTorches(), []);
  const lightRefs = useRef([]);
  const flameRefs = useRef([]);
  const frameRef = useRef(0);

  useFrame((state) => {
    if (reduced) return;
    frameRef.current += 1;
    if (frameRef.current % 3 !== 1) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < torches.length; i += 1) {
      const wave = Math.sin(t * 11 + i) * Math.sin(t * 5.7 + i * 2);
      const flame = flameRefs.current[i];
      if (flame) flame.scale.set(1, 1 + 0.12 * wave, 1);
      const light = lightRefs.current[i];
      if (light) light.intensity = TORCH_LIGHT.intensity * (0.88 + 0.12 * wave);
    }
  });

  return (
    <group>
      {torches.map((torch) => {
        const colors = TORCH_COLORS[torch.hue];
        return (
          <group key={torch.id} position={[torch.x, 0, torch.z]}>
            {/* torch-post: thin dark post + inverted cup */}
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 2.2, 8]} />
              <meshStandardMaterial color="#1a1a20" roughness={0.9} />
            </mesh>
            <mesh position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.17, 0.2, 8]} />
              <meshStandardMaterial color="#1a1a20" roughness={0.9} />
            </mesh>
            {/* flame: glow cone + bright core, breathing with the light */}
            <group
              ref={(g) => { flameRefs.current[torch.id] = g; }}
              position={[0, 2.55, 0]}
            >
              <mesh>
                <coneGeometry args={[0.16, 0.5, 8]} />
                <meshBasicMaterial color={colors.flame} transparent opacity={0.95} />
              </mesh>
              <mesh position={[0, -0.05, 0]}>
                <coneGeometry args={[0.08, 0.3, 8]} />
                <meshBasicMaterial color={colors.core} />
              </mesh>
            </group>
            {torch.lit && (
              <pointLight
                ref={(l) => { lightRefs.current[torch.id] = l; }}
                position={[0, 2.4, 0]}
                color={colors.light}
                intensity={TORCH_LIGHT.intensity}
                distance={TORCH_LIGHT.distance}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

function Embers({ reduced }) {
  const COUNT = 260;
  const ref = useRef();
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
      <pointsMaterial size={0.9} color="#ff7a1a" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// --- first-person camera rig -------------------------------------------------

export function CameraRig({ playerRef, inputRef, onPortal, onRegion, reduced }) {
  const { camera } = useThree();
  const lastTravelRef = useRef(0);
  const travelingRef = useRef(false);
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
  });

  return null;
}

// --- the whole scene ---------------------------------------------------------

export function DiyuScene({ playerRef, inputRef, onPortal, onRegion, reduced }) {
  const world = useMemo(() => makeWorld(1340), []);

  // DAY / NIGHT STORM (Merlin, 2026-11-14): a strike sometimes sets a
  // ground fire — open ground only. Never on the walker (5 m), never
  // in the river band, never on the Gates, the palace plaza, the
  // Descent, a portal arch, or a lava pool. Visual only: no realm
  // here has a hazard law for ground fire, so a fire never deals
  // damage. The rig prunes each fire after its 20–45 s life.
  const isOpenGround = (x, z) => {
    const p = playerRef.current;
    if (p && Math.hypot(x - p.x, z - p.z) < 5) return false;
    if (Math.hypot(x, z) > WORLD_RADIUS - 20) return false;
    if (z > RIVER.zMin - 2 && z < RIVER.zMax + 2) return false;
    if (Math.hypot(x - GATES.x, z - GATES.z) < 12) return false;
    if (Math.hypot(x - LANDMARK.x, z - LANDMARK.z) < 45) return false;
    if (Math.hypot(x - DESCENT_PORTAL.x, z - DESCENT_PORTAL.z) < 16) return false;
    if (PORTALS.some((portal) => Math.hypot(x - portal.x, z - portal.z) < 10)) return false;
    if (world.lavaPools.some((pool) => Math.hypot(x - pool.x, z - pool.z) < pool.r + 3)) return false;
    return true;
  };
  return (
    <>
      <DayNightRig
        shade={NETHER_REALM_SHADE.diyu}
        storm={{
          hue: 'red',
          bounds: { xMin: -300, xMax: 300, zMin: -300, zMax: 300 },
          isOpenGround,
          realm: 'diyu',
          seed: 7104,
        }}
      />
      <Ground />
      <FirePools pools={world.lavaPools} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Landmark />
      <WestRegion dressing={world.courtPillars} shades={world.shades} reduced={reduced} />
      <EastRegion dressing={world.hallBraziers} />
      <NorthRegion dressing={world.wheelSpokes} shades={world.shades} reduced={reduced} />
      <PortalArches />
      <DescentPortal />
      <Torches reduced={reduced} />
      <Embers reduced={reduced} />
      <CameraRig
        playerRef={playerRef}
        inputRef={inputRef}
        onPortal={onPortal}
        onRegion={onRegion}
        reduced={reduced}
      />
    </>
  );
}
