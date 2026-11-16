// app/elysium/world3d.js
// ELYSIUM 3D scene — procedural, no external assets.
//
// The Greek heaven — white marble, still water, and the fountain that never runs dry.
// First-person walk; the camera rig lives here too so the page shell
// stays lean.
//
// Patterns follow app/nether-realm/world3d.js: Canvas +
// useSceneContextGuard, Html labels from drei, touch UI detected via
// maxTouchPoints, plain English everywhere. Bright realm: real LIGHT
// (Earth 2 torch style), not fire. No game mechanics in the base
// shell — the arches only navigate, nothing fights, nothing charges.
// KAOS LOOK FLAG (Merlin, Nov 12, 2026): the Kaos reference footage is
// NOT in yet. The fountain + structure below are built now; the pristine-white
// Kaos look is TO BE REFINED once the footage has been watched whole.

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
  FOUNTAIN,
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
} from '@/lib/elysium/world';
import DayNightRig from '@/components/DayNightRig';

const STONE = '#f5f2ea';
const PALE_STONE = '#8a8a92';
const ARCH_GLOW = '#d4af37';

// --- canvas textures (procedural, seeded) ---------------------------------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#f2efe8';
  g.fillRect(0, 0, 1024, 1024);
  // Speckled ground.
  for (let i = 0; i < 9000; i += 1) {
    const v = 210 + Math.floor(Math.random() * 45);
    g.fillStyle = `rgb(${v},${Math.floor(v * 0.95)},${Math.floor(v * 0.9)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Soft veins.
  g.strokeStyle = '#d4af37';
  g.shadowColor = '#d4af37';
  g.shadowBlur = 10;
  for (let i = 0; i < 14; i += 1) {
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
  g.fillStyle = '#cfe8ff';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(255, 255, 255, ${0.25 + Math.random() * 0.5})`;
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

function Ground() {
  const tex = useMemo(() => groundTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[400, 64]} />
      <meshStandardMaterial map={tex} color="#ffffff" roughness={1} metalness={0} />
    </mesh>
  );
}

function LightPools({pools}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color="#bfe3ff" transparent opacity={0.22} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#bfe3ff" transparent opacity={0.5} />
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
          <meshStandardMaterial color="#e8e4da" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[0, 4, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Meander
      </Html>
    </group>
  );
}

function Gates() {
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 7, -2]} color="#ffd98a" intensity={14} distance={34} />
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
        <meshBasicMaterial color="#ffd98a" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The White Gate
      </Html>
    </group>
  );
}

function MeanderFountain() {
  const columns = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    columns.push({ x: Math.cos(a) * 20, z: Math.sin(a) * 20, key: i });
  }
  return (
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      <pointLight position={[0, 14, 0]} color="#ffd98a" intensity={70} distance={120} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[16, 18, 2, 32]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.9} />
      </mesh>
      {/* lower basin — the Meander itself, white water in white stone */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[11, 12, 2.5, 32]} />
        <meshStandardMaterial color="#f5f2ea" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 3.8, 0]}>
        <circleGeometry args={[10, 32]} />
        <meshStandardMaterial color="#bfe3ff" roughness={0.15} metalness={0.1} />
      </mesh>
      {/* upper basin */}
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 5, 12]} />
        <meshStandardMaterial color="#f5f2ea" roughness={0.85} />
      </mesh>
      <mesh position={[0, 8.8, 0]}>
        <cylinderGeometry args={[5.5, 6, 2, 24]} />
        <meshStandardMaterial color="#f5f2ea" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 9.9, 0]}>
        <circleGeometry args={[4.8, 24]} />
        <meshStandardMaterial color="#bfe3ff" roughness={0.15} />
      </mesh>
      {/* the jet: water rising, the fountain that never runs dry */}
      <mesh position={[0, 12, 0]}>
        <coneGeometry args={[1.6, 5, 12]} />
        <meshBasicMaterial color="#dff0ff" transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, 15, 0]}>
        <sphereGeometry args={[1.2, 12, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
      {/* white columns ring the fountain */}
      {columns.map((c) => (
        <mesh key={c.key} position={[c.x, 4, c.z]}>
          <cylinderGeometry args={[0.8, 1, 8, 10]} />
          <meshStandardMaterial color="#f5f2ea" roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={140} position={[0, 19, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Meander Fountain
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
        <meshStandardMaterial color="#e6e2d6" roughness={1} />
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
        The White Gardens
      </Html>
    </group>
  );
}

function EastRegion({pillars, shades}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial color="#efe3b0" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[12, 24]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0.35} />
      </mesh>
      <pointLight position={[160, 10, -70]} color="#ffd98a" intensity={45} distance={95} />
      {pillars.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial color="#f5f2ea" roughness={0.9} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('e')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.5} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Golden Fields
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
        <meshStandardMaterial color="#dfe9f5" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color="#bfd9ff" intensity={55} distance={110} />
      {pits.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color="#bfe3ff" transparent opacity={0.3} />
          </mesh>
          <mesh
            ref={(m) => { pitRefs.current[p.id] = m; }}
            position={[0, 1.8, 0]}
          >
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#bfe3ff" transparent opacity={0.9} />
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
        The Far Shore
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
// spawn marker. This higher realm is greek heaven; the
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
        <meshBasicMaterial color="#ffd98a" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[ENTRY_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#fff6d8" transparent opacity={0.45} side={THREE.DoubleSide} />
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
      <pointsMaterial size={0.9} color="#fff3c4" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
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

export function ElysiumScene({playerRef, inputRef, onPortal, onRegion, reduced, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1337), []);
  return (
    <>
      <DayNightRig shade="earth" />
      <Ground />
      <LightPools pools={world.pools} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <MeanderFountain />
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
