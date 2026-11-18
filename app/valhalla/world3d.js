// app/valhalla/world3d.js
// VALHALLA 3D scene — procedural, no external assets.
//
// The great hall — feasting, warriors, and golden light.
// First-person walk; the camera rig lives here too so the page shell
// stays lean.
//
// Patterns follow app/nether-realm/world3d.js: Canvas +
// useSceneContextGuard, Html labels from drei, touch UI detected via
// maxTouchPoints, plain English everywhere. Bright realm: real LIGHT
// (Earth 2 torch style), not fire. No game mechanics in the base
// shell — the arches only navigate, nothing fights, nothing charges.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FloorDropDisc } from '@/components/world/FloorDrop';
import { FLOOR_DROP_DISC_HEAVEN, createFloorDropGuard, floorDropGuardShouldFire } from '@/lib/world/floor-drop';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  ENTRY_PORTAL,
  GATES,
  HALL,
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
} from '@/lib/valhalla/world';
import DayNightRig from '@/components/DayNightRig';
import StreamingGround from '@/components/afterlife/StreamingGround';

const STONE = '#5d4126';
const PALE_STONE = '#8a8a92';
const ARCH_GLOW = '#ffc44d';

// --- canvas textures (procedural, seeded) ---------------------------------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#2e4d24';
  g.fillRect(0, 0, 1024, 1024);
  // Speckled ground.
  for (let i = 0; i < 9000; i += 1) {
    const v = 30 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgb(${v},${Math.floor(v * 0.95)},${Math.floor(v * 0.9)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Soft veins.
  g.strokeStyle = '#d4af37';
  g.shadowColor = '#d4af37';
  g.shadowBlur = 10;
  for (let i = 0; i < 12; i += 1) {
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    g.lineWidth = 1 + Math.random() * 2;
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
  g.fillStyle = '#7fb2e8';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(255, 210, 77, ${0.25 + Math.random() * 0.5})`;
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
  color: '#1c1005',
  background: 'rgba(255, 248, 220, 0.88)',
  border: '1px solid rgba(180, 140, 40, 0.65)',
  borderRadius: 999,
  padding: '4px 12px',
};

const regionLabelStyle = {
  ...portalLabelStyle,
  fontSize: 13,
  fontWeight: 600,
  color: '#1c1005',
  background: 'rgba(255, 250, 235, 0.78)',
  border: '1px solid rgba(180, 140, 40, 0.35)',
};

// --- static pieces ----------------------------------------------------------

function Ground({ playerRef }) {
  const tex = useMemo(() => groundTexture(), []);
  // ENDLESS (Merlin, Nov 18, 2026): the fixed r=400 disc is gone —
  // the same floor streams in chunks around the walker (the shared
  // StreamingGround samples the old disc's UVs, so the home region
  // reads byte-identical). The material props are unchanged.
  return (
    <StreamingGround
      materialProps={{ map: tex, color: '#ffffff', roughness: 1, metalness: 0 }}
      followRef={playerRef}
    />
  );
}

function LightPools({pools}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color="#ffc44d" transparent opacity={0.22} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#ffc44d" transparent opacity={0.5} />
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
      <planeGeometry args={[820, 36]} />
      <meshStandardMaterial
        map={tex}
        color="#ffffff"
        transparent
        opacity={0.95}
        roughness={0.2}
        metalness={0.1}
      />
    </mesh>
  );
}

function Bridge() {
  const slabs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  return (
    <group>
      {slabs.map((x) => (
        <mesh key={x} position={[x, 0.3, 0]}>
          <boxGeometry args={[3.2, 0.6, 38]} />
          <meshStandardMaterial color="#8a6a3a" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[0, 4, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Bifröst
      </Html>
    </group>
  );
}

function Gates() {
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 7, -2]} color="#ffc44d" intensity={14} distance={34} />
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial color={STONE} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial color={STONE} roughness={0.85} />
      </mesh>
      <mesh position={[0, 13.2, 0]}>
        <boxGeometry args={[11, 0.5, 0.4]} />
        <meshBasicMaterial color="#ffc44d" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Great Doors
      </Html>
    </group>
  );
}

function GreatHall() {
  const shields = [];
  for (let i = 0; i < 8; i += 1) shields.push({ x: -14 + i * 4, key: i });
  return (
    <group position={[HALL.x, 0, HALL.z]}>
      <pointLight position={[0, 12, 0]} color="#ffc44d" intensity={70} distance={120} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[20, 22, 2, 24]} />
        <meshStandardMaterial color="#4a3520" roughness={0.9} />
      </mesh>
      {/* the long hall itself */}
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[34, 10, 16]} />
        <meshStandardMaterial color="#5d4126" roughness={0.9} />
      </mesh>
      {/* pitched roof, two slabs meeting at the ridge */}
      <mesh position={[-8.5, 13.5, 0]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[19, 1.2, 18]} />
        <meshStandardMaterial color="#7a5a30" roughness={0.9} />
      </mesh>
      <mesh position={[8.5, 13.5, 0]} rotation={[0, 0, -0.35]}>
        <boxGeometry args={[19, 1.2, 18]} />
        <meshStandardMaterial color="#7a5a30" roughness={0.9} />
      </mesh>
      {/* the shield roof: gold shields along the ridge */}
      {shields.map((s) => (
        <mesh key={s.key} position={[s.x, 16.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.6, 1.6, 0.3, 16]} />
          <meshStandardMaterial color="#ffd24d" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* the great doors, facing the plaza (south, +Z) */}
      <mesh position={[0, 4, 8.2]}>
        <boxGeometry args={[8, 8, 0.6]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.9} />
      </mesh>
      {/* feasting tables outside the doors */}
      {[-10, 10].map((x) => (
        <mesh key={x} position={[x, 1.2, 12]}>
          <boxGeometry args={[6, 2.4, 2.5]} />
          <meshStandardMaterial color="#6b4a26" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={140} position={[0, 20, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Great Hall
      </Html>
    </group>
  );
}


function WestRegion({stones, shades, reduced}) {
  const westShades = useMemo(() => shades.filter((s) => s.id.startsWith('w')), [shades]);
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
        <meshStandardMaterial color="#4a6b2f" roughness={1} />
      </mesh>
      {stones.map((s) => (
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
          <meshStandardMaterial color="#ffffff" transparent opacity={0.45} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[-160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Feasting Field
      </Html>
    </group>
  );
}

function EastRegion({pillars, shades}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#5d4a26" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[12, 24]} />
        <meshBasicMaterial color="#ffc44d" transparent opacity={0.35} />
      </mesh>
      <pointLight position={[160, 10, -70]} color="#ffc44d" intensity={45} distance={95} />
      {pillars.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial color="#7a5a30" roughness={0.9} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('e')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.5} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Training Grounds
      </Html>
    </group>
  );
}

function NorthRegion({pits, shades, reduced}) {
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
        <meshStandardMaterial color="#3f6b2f" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color="#ff9a3c" intensity={55} distance={110} />
      {pits.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color="#ffc44d" transparent opacity={0.3} />
          </mesh>
          <mesh
            ref={(m) => { pitRefs.current[p.id] = m; }}
            position={[0, 1.8, 0]}
          >
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#ffc44d" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      {shades.filter((s) => s.id.startsWith('n')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.5} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Einherjar's Rest
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
            <meshBasicMaterial color={ARCH_GLOW} transparent opacity={0.16} />
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
            <meshBasicMaterial color={ARCH_GLOW} transparent opacity={0.55} side={THREE.DoubleSide} />
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

// The Ascent portal — a real, persistent portal object (id
// 'ascent-portal', name="ascent-portal" on the group so the next
// round's portal system can find it in the scene graph), not just a
// spawn marker. This higher realm is norse heaven; the
// higher-realms portal above Earth and the portal gun hang off this
// portal next round. The ring is deliberately a full circle, distinct
// from the standing-stone arches: it is the doorway you came up
// through, and the way back down. Walking through it does nothing in
// this round — the portal system comes later.
function AscentPortal() {
  const stones = [];
  for (let i = 0; i < 8; i += 1) {
    // Offset by 22.5°: without it a stone sits dead-centre on the south
    // side, 8m from spawn, filling the middle of the view and blocking
    // the doorway (spawn screenshot, 2026-11-12).
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    stones.push({ x: Math.cos(a) * 6, z: Math.sin(a) * 6, key: i });
  }
  return (
    <group name="ascent-portal" position={[ENTRY_PORTAL.x, 0, ENTRY_PORTAL.z]}>
      {stones.map((s) => (
        <mesh key={s.key} position={[s.x, 0.8, s.z]}>
          <boxGeometry args={[1.4, 1.6, 1]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[3, 20]} />
        <meshBasicMaterial color="#ffc44d" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[ENTRY_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial color="#5d4126" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color="#ffc44d" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#fff0b8" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* The name rides low, as a plaque at the portal's foot: a label
          above the ring is clipped by the viewport edge at spawn (the
          phone's portrait FOV is narrow) and collides with the HUD. */}
      <Html center distanceFactor={10} position={[0, 1.6, 2.5]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Ascent
      </Html>
    </group>
  );
}

// --- light: real light, Earth 2 torch style ---------------------------------
//
// Bright realms use LIGHT, not fire: the post is the Earth 2
// torch-post shape (a thin post, an inverted cup, a glow on top), but
// the glow is pale gold / cool light, not flame. The light follows
// lib/building/piece-render.js LIGHT_SPECS exactly for the yellow
// torch-post: intensity 10, distance 14, riding at the glow. The
// breathing is Earth 2's flicker wave, gentled: intensity =
// base * (0.88 + 0.12 * sin(t*11 + id) * sin(t*5.7 + id*2)).
//
// Only the 8 route-marking posts carry a real point light (the mobile
// budget: 8 post lights + 4 region lights = 12 total). Every post
// still shows its glow; the lit ones are the pools of light along
// the way up.
function Torches({reduced}) {
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
              <meshStandardMaterial color="#3a3a40" roughness={0.9} />
            </mesh>
            <mesh position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.17, 0.2, 8]} />
              <meshStandardMaterial color="#3a3a40" roughness={0.9} />
            </mesh>
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
      <pointsMaterial size={0.9} color="#ffcf5e" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
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

export function ValhallaScene({playerRef, inputRef, onPortal, onRegion, reduced, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1337), []);
  return (
    <>
      <DayNightRig sun moon followRef={playerRef} shade="earth" />
      <Ground playerRef={playerRef} />
      <LightPools pools={world.pools} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <GreatHall />
      <WestRegion stones={world.westStones} shades={world.shades} reduced={reduced} />
      <EastRegion pillars={world.eastPillars}  shades={world.shades}/>
      <NorthRegion pits={world.northPits} shades={world.shades} reduced={reduced} />
      <PortalArches />
      <AscentPortal />
      <Torches reduced={reduced} />
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
