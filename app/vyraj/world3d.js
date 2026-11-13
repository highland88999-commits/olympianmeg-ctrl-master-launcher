// app/vyraj/world3d.js
// VYRAJ 3D scene — procedural, no external assets.
//
// The Slavic paradise garden — birds, blossom, and endless spring. First-person walk; the camera rig lives here too so
// the page shell stays lean. Bright higher realm: sunlight and
// glow-lanterns, not fire. Patterns follow app/nether-realm/world3d.js:
// Canvas + useSceneContextGuard, Html labels from drei, touch UI
// detected via maxTouchPoints, plain English everywhere. No game
// mechanics in the base shell — the arches only navigate.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  ENTRY_PORTAL,
  GATES,
  GREAT_OAK,
  PORTALS,
  RUN_SPEED,
  TORCH_COLORS,
  TORCH_LIGHT,
  WALK_SPEED,
  forward,
  makeTorches,
  makeWorld,
  nearestPortal,
  regionAt,
  right,
  stepPosition,
} from '@/lib/vyraj/world';

const STONE = '#8a8378';
const PALE_STONE = '#b8b0a0';
const LEAF = '#2f7a3d';
const PORTAL_GLOW = '#f9a8d4';

// --- canvas textures (procedural, seeded) ---------------------------------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1d4023';
  g.fillRect(0, 0, 1024, 1024);
  // Speckled bright ground.
  for (let i = 0; i < 9000; i += 1) {
    const v = 40 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgb(${Math.floor(v * 0.8)},${v},${Math.floor(v * 0.9)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Soft pale patches — sunlit grass, petals, cloud-shade.
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(255, 255, 240, ${0.03 + Math.random() * 0.05})`;
    g.beginPath();
    g.arc(Math.random() * 1024, Math.random() * 1024, 20 + Math.random() * 60, 0, Math.PI * 2);
    g.fill();
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
  g.fillStyle = '#0e3a24';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(140, 230, 180, ${0.25 + Math.random() * 0.5})`;
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
  color: '#1c1917',
  background: 'rgba(255, 251, 235, 0.88)',
  border: '1px solid rgba(180, 140, 40, 0.65)',
  borderRadius: 999,
  padding: '4px 12px',
};

const regionLabelStyle = {
  ...portalLabelStyle,
  fontSize: 13,
  fontWeight: 600,
  color: '#292524',
  background: 'rgba(255, 255, 255, 0.78)',
  border: '1px solid rgba(120, 113, 108, 0.4)',
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

function Pools({ pools }) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color="#57b877" transparent opacity={0.25} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#57b877" transparent opacity={0.75} />
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
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <planeGeometry args={[820, 36]} />
        <meshStandardMaterial
          map={tex}
          color="#8fd8a8"
          transparent
          opacity={0.92}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      {/* The river is a named place (regionAt returns it), so it gets
          its own visible label — rivers were missed twice in Wave 1. */}
      <Html center distanceFactor={120} position={[0, 7, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Bright River
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
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Gates() {
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 8, 0]} color="#f9a8d4" intensity={30} distance={60} />
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial color={PALE_STONE} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial color={PALE_STONE} roughness={0.85} />
      </mesh>
      <mesh position={[0, 13.2, 0]}>
        <boxGeometry args={[11, 0.5, 0.4]} />
        <meshBasicMaterial color="#f9a8d4" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Garden Gates
      </Html>
    </group>
  );
}

function Center() {
  // The Great Oak: one huge tree, the heart of the garden. Its crown
  // is three green domes; light glows from inside the leaves.
  return (
    <group position={[GREAT_OAK.x, 0, GREAT_OAK.z]}>
      <pointLight position={[0, 20, 10]} color="#f9a8d4" intensity={90} distance={130} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[17, 19, 2, 24]} />
        <meshStandardMaterial color="#3a5a34" roughness={1} />
      </mesh>
      <mesh position={[0, 10, 0]}>
        <cylinderGeometry args={[2.2, 3.4, 20, 10]} />
        <meshStandardMaterial color="#5a3d24" roughness={1} />
      </mesh>
      <mesh position={[0, 24, 0]}>
        <sphereGeometry args={[11, 16, 12]} />
        <meshStandardMaterial color="#2f7a3d" roughness={1} />
      </mesh>
      <mesh position={[-8, 19, 4]}>
        <sphereGeometry args={[7, 14, 10]} />
        <meshStandardMaterial color="#3a8a46" roughness={1} />
      </mesh>
      <mesh position={[8, 19, -3]}>
        <sphereGeometry args={[7, 14, 10]} />
        <meshStandardMaterial color="#2a6b35" roughness={1} />
      </mesh>
      <mesh position={[0, 24, 9]}>
        <sphereGeometry args={[2.2, 10, 8]} />
        <meshBasicMaterial color="#ffd6e8" />
      </mesh>
      <mesh position={[-6, 20, 7]}>
        <sphereGeometry args={[1.6, 10, 8]} />
        <meshBasicMaterial color="#ffe4f1" />
      </mesh>
      <mesh position={[6, 20, 7]}>
        <sphereGeometry args={[1.6, 10, 8]} />
        <meshBasicMaterial color="#ffe4f1" />
      </mesh>
      <Html center distanceFactor={140} position={[0, 36, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Great Oak
      </Html>
    </group>
  );
}


function WestRegion({ stones, drifters, reduced }) {
  const westDrifters = useMemo(() => drifters.filter((s) => s.id.startsWith('w')), [drifters]);
  const driftRefs = useRef([]);
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    driftRefs.current.forEach((m, i) => {
      if (!m) return;
      m.position.y = 1.4 + Math.sin(t * westDrifters[i].slow + i * 1.7) * 0.45;
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#2e5d33" roughness={1} />
      </mesh>
      {stones.map((s) => (
        <mesh key={s.id} position={[s.x, s.h / 2, s.z]} rotation={[0, s.id * 0.7, 0]}>
          <boxGeometry args={[1.2, s.h, 0.8]} />
          <meshStandardMaterial color={PALE_STONE} roughness={1} />
        </mesh>
      ))}
      {westDrifters.map((s, i) => (
        <mesh
          key={s.id}
          ref={(m) => { driftRefs.current[i] = m; }}
          position={[s.x, 1.4, s.z]}
        >
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.6} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[-160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Bird Fields
      </Html>
    </group>
  );
}

function EastRegion({ pillars }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#2e5d33" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[12, 24]} />
        <meshBasicMaterial color="#f9a8d4" transparent opacity={0.35} />
      </mesh>
      <pointLight position={[160, 10, -70]} color="#f9a8d4" intensity={45} distance={95} />
      {pillars.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial color="#e8e0cc" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Blossom Meadow
      </Html>
    </group>
  );
}

function NorthRegion({ pits, drifters, reduced }) {
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
        <meshStandardMaterial color="#2e5d33" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color="#f9a8d4" intensity={55} distance={110} />
      {pits.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color="#57b877" transparent opacity={0.3} />
          </mesh>
          <mesh
            ref={(m) => { pitRefs.current[p.id] = m; }}
            position={[0, 1.8, 0]}
          >
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#f9a8d4" transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
      {drifters.filter((s) => s.id.startsWith('n')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.6} roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Far Shore
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
// 'bird-gate', name="bird-gate" on the group so the next round's
// portal system can find it in the scene graph), not just a spawn
// marker. This higher realm is slavic heaven; the portal system
// hangs off this portal next round. The ring is deliberately a full
// circle, distinct from the five standing-stone arches: it is the
// doorway you came in through, and the way back out. Walking through
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
    <group name="bird-gate" position={[ENTRY_PORTAL.x, 0, ENTRY_PORTAL.z]}>
      {stones.map((s) => (
        <mesh key={s.key} position={[s.x, 0.8, s.z]}>
          <boxGeometry args={[1.4, 1.6, 1]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[3, 20]} />
        <meshBasicMaterial color={PORTAL_GLOW} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[ENTRY_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color={PORTAL_GLOW} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* The name rides low, as a plaque at the portal's foot: a label
          above the ring is clipped by the viewport edge at spawn (the
          phone's portrait FOV is narrow) and collides with the HUD. */}
      <Html center distanceFactor={25} position={[0, 1.6, 2.5]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Bird Gate
      </Html>
    </group>
  );
}

// --- light: real light, Earth 2 torch style, as glow-lanterns -----------
//
// The post is the Earth 2 torch-post shape (thin dark post, inverted
// cup) scaled to this world's metres, but the flame is a glow-orb:
// this is a bright realm, it uses light, not fire. The light follows
// lib/building/piece-render.js LIGHT_SPECS exactly: intensity 10,
// distance 14, riding at the glow. The shimmer is Earth 2's
// (components/earth2/Earth2World.jsx, "Fire flicker", 2026-11-03):
// every 3rd frame each lit glow breathes,
// intensity = base * (0.88 + 0.12 * sin(t*11 + id) * sin(t*5.7 + id*2)),
// and the orb breathes with the same wave.
//
// Only the 8 route-marking posts carry a real point light (the mobile
// budget: 8 lights + 4 region lights = 12 total). Every post still
// shows its glow; the lit ones are the pools of light along the way in.
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
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 2.2, 8]} />
              <meshStandardMaterial color="#3a3a30" roughness={0.9} />
            </mesh>
            <mesh position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.17, 0.2, 8]} />
              <meshStandardMaterial color="#3a3a30" roughness={0.9} />
            </mesh>
            {/* glow-orb: bright sphere + halo, breathing with the light */}
            <group
              ref={(g) => { flameRefs.current[torch.id] = g; }}
              position={[0, 2.55, 0]}
            >
              <mesh>
                <sphereGeometry args={[0.22, 12, 10]} />
                <meshBasicMaterial color={colors.core} />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.38, 12, 10]} />
                <meshBasicMaterial color={colors.flame} transparent opacity={0.45} />
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

function Blossom({ reduced }) {
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
      <pointsMaterial size={0.9} color="#ffc2dd" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
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

export function VyrajScene({ playerRef, inputRef, onPortal, onRegion, reduced }) {
  const world = useMemo(() => makeWorld(1337), []);
  return (
    <>
      <color attach="background" args={['#bfe8c8']} />
      <fogExp2 attach="fog" args={['#cdeeda', 0.0022]} />
      <ambientLight color="#dff5e6" intensity={1.1} />
      <directionalLight position={[50, 80, 40]} color="#fff6d8" intensity={1.3} />
      <Ground />
      <Pools pools={world.pools} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Center />
      <WestRegion stones={world.westStones} drifters={world.drifters} reduced={reduced} />
      <EastRegion pillars={world.eastPillars} />
      <NorthRegion pits={world.northPits} drifters={world.drifters} reduced={reduced} />
      <PortalArches />
      <EntryPortal />
      <Torches reduced={reduced} />
      <Blossom reduced={reduced} />
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
