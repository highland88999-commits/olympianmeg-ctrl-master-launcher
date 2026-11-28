// app/mictlan/world3d.js
// MICTLAN 3D scene — procedural, no external assets.
//
// Nine levels down, ruled by Mictlantecuhtli and Mictecacíhuatl: the river Apanohuacalhuia, crossed with a dog's help, the mountains that crash together, the obsidian winds, and the throne of the Lord of the Dead on the ninth level.
// First-person walk; the camera rig lives here too so the page shell
// stays lean. Patterns follow app/nether-realm/world3d.js: Canvas +
// useSceneContextGuard, Html labels from drei, plain English
// everywhere. No game mechanics in the base shell — the arches only
// navigate, nothing fights, nothing charges.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  DESCENT_PORTAL,
  GATES,
  PALACE,
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
} from '@/lib/mictlan/world';
import { useArchTextures } from '@/lib/portal/arch-graphics';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import { ANTI_LIFE_PORTAL, isOnAntiLifePortal } from '@/lib/afterlife/anti-life-portal';
import { FloorDropDisc } from '@/components/world/FloorDrop';
import { FLOOR_DROP_DISC_NETHER, createFloorDropGuard, floorDropGuardShouldFire } from '@/lib/world/floor-drop';
import AntiLifePortalDisc from '@/components/afterlife/AntiLifePortalDisc';
import DayNightRig from '@/components/DayNightRig';
import StreamingGround from '@/components/afterlife/StreamingGround';
import ShadeFigure from '@/components/afterlife/ShadeFigure';
import { floorSurface, stoneSurface } from '@/lib/portal/realm-surfaces';
import RealmSkyDome from '@/components/RealmSkyDome';
import { LavaGlowDome } from '@/components/LavaGlow';
import {
  LAVA_GLOW_CRACK_OPACITY,
  LAVA_GLOW_PIT_HALO_OPACITY,
  LAVA_GLOW_PIT_LIGHT_DISTANCE,
  LAVA_GLOW_PIT_LIGHT_INTENSITY,
  LAVA_GLOW_VEIN_SHADOW_BLUR,
} from '@/lib/nether-realm/lava-glow';
import { NETHER_REALM_SHADE } from '@/lib/day-night';

const ROCK = '#141118';
const STONE = '#2a2a32';
const PALE_STONE = '#55555e';
const DARK = '#0d0d12';
const LAVA = '#ff3a1a';
const PORTAL_GLOW = '#2ad4c0';

// --- canvas textures (procedural, seeded) ---------------------------------

function riverTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#140404';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(140, 40, 30, ${0.25 + Math.random() * 0.5})`;
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

// --- CGI dog fur texture (procedural canvas) ------------------------------
// Short brindle strokes over the old grey coat — painted on canvas at
// load, no external assets.

function furTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a44';
  g.fillRect(0, 0, 256, 256);
  // Brindle fur: short strokes, lighter and darker than the coat.
  for (let i = 0; i < 1400; i += 1) {
    const light = Math.random() > 0.5;
    const v = light ? 80 + Math.floor(Math.random() * 40) : 20 + Math.floor(Math.random() * 25);
    g.strokeStyle = `rgba(${v},${v},${v + 6},${0.3 + Math.random() * 0.4})`;
    g.lineWidth = 1 + Math.random() * 1.5;
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const len = 4 + Math.random() * 10;
    const a = (Math.random() - 0.5) * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + a * len);
    g.stroke();
  }
  // Darker back stripe down the middle.
  g.fillStyle = 'rgba(20, 20, 26, 0.25)';
  g.fillRect(0, 112, 256, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// --- labels ----------------------------------------------------------------

const portalLabelStyle = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontSize: 15,
  fontWeight: 700,
  color: '#e8fffb',
  background: 'rgba(4, 30, 26, 0.82)',
  border: '1px solid rgba(42, 212, 192, 0.65)',
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

function Ground({ playerRef }) {
  const floor = useMemo(() => floorSurface('mictlan', 6), []);
  // ENDLESS (Merlin, Nov 18, 2026): the fixed r=400 disc is gone —
  // the same floor streams in chunks around the walker (the shared
  // StreamingGround samples the old disc's UVs, so the home region
  // reads byte-identical). The material props are unchanged.
  return (
    <StreamingGround
      materialProps={{ ...floor, color: '#ffffff', roughness: 1, metalness: 0 }}
      followRef={playerRef}
    />
  );
}

function ObsidianPools({pools}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color="#2ad4c0" transparent opacity={0.22} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#0d3a34" transparent opacity={0.9} />
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
        color="#c47a6a"
        transparent
        opacity={0.92}
        roughness={0.25}
        metalness={0.1}
      />
    </mesh>
  );
}

function Bridge() {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
  const slabs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  return (
    <group>
      {slabs.map((x) => (
        <mesh key={x} position={[x, 0.3, 0]}>
          <boxGeometry args={[3.2, 0.6, 38]} />
          <meshStandardMaterial {...stone} color={STONE} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Gates() {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 10, 0]} color="#ff3a1a" intensity={20} distance={45} />
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial {...stone} color="#17171c" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial {...stone} color="#17171c" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0, 13.2, 0]}>
        <boxGeometry args={[11, 0.5, 0.4]} />
        <meshBasicMaterial color="#ff3a1a" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The First Level
      </Html>
    </group>
  );
}

function Dog() {
  const fur = useMemo(() => furTexture(), []);
  // The faithful dog who helps the dead cross the river Apanohuacalhuia.
  // Textured CGI dog: fur coat, four legs, raised tail, ears, eyes and
  // snout — same river-bank position (14, 26), same data-only helper
  // behaviour (it waits; nothing about it moves or fights).
  return (
    <group position={[14, 0, 26]}>
      {/* Body: fur-textured, same footprint as the old box. */}
      <mesh position={[0, 1.4, 0]} scale={[1.7, 0.9, 0.7]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      {/* Chest ruff. */}
      <mesh position={[1.5, 1.5, 0]} scale={[0.7, 0.8, 0.65]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      {/* Head. */}
      <mesh position={[1.9, 2.6, 0]}>
        <sphereGeometry args={[0.72, 14, 10]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      {/* Snout and nose. */}
      <mesh position={[2.55, 2.45, 0]} scale={[1.1, 0.7, 0.7]}>
        <sphereGeometry args={[0.4, 10, 8]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      <mesh position={[2.95, 2.55, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#0d0d12" roughness={0.4} />
      </mesh>
      {/* Eyes. */}
      {[-0.28, 0.28].map((z) => (
        <mesh key={z} position={[2.35, 2.8, z]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshBasicMaterial color="#1a0d08" />
        </mesh>
      ))}
      {/* Ears, tipped slightly outward. */}
      {[-0.35, 0.35].map((z) => (
        <mesh key={z} position={[1.9, 3.5, z]} rotation={[z > 0 ? -0.12 : 0.12, 0, 0]}>
          <coneGeometry args={[0.25, 1, 6]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
      ))}
      {/* Four legs. */}
      {[-1.15, 1.15].map((x) => [-0.42, 0.42].map((z) => (
        <mesh key={`${x}:${z}`} position={[x, 0.7, z]}>
          <cylinderGeometry args={[0.16, 0.14, 1.4, 8]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
      )))}
      {/* Paws. */}
      {[-1.15, 1.15].map((x) => [-0.42, 0.42].map((z) => (
        <mesh key={`${x}:${z}`} position={[x, 0.09, z]} scale={[1.3, 0.6, 1.3]}>
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshStandardMaterial color="#232328" roughness={0.9} />
        </mesh>
      )))}
      {/* Tail, raised. */}
      <mesh position={[-1.95, 2.0, 0]} rotation={[0, 0, 0.9]}>
        <cylinderGeometry args={[0.09, 0.16, 1.1, 8]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      <Html center distanceFactor={80} position={[0, 5.5, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Faithful Dog
      </Html>
    </group>
  );
}

function Throne() {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
  // The throne of Mictlantecuhtli, Lord of the Dead, on the ninth
  // level — nine steps up, one for each level down.
  return (
    <group position={[PALACE.x, 0, PALACE.z]}>
      <pointLight position={[0, 16, 10]} color="#ff3a1a" intensity={70} distance={120} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[18, 20, 2, 24]} />
        <meshStandardMaterial {...stone} color="#120a0a" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <mesh key={i} position={[0, 0.5 + i * 0.9, 14 - i * 1.2]}>
          <boxGeometry args={[10 - i * 0.6, 0.9, 1.4]} />
          <meshStandardMaterial {...stone} color="#1c1214" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 10, 2]}>
        <boxGeometry args={[8, 12, 2]} />
        <meshStandardMaterial {...stone} color="#241a1c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 17.5, 3.2]}>
        <sphereGeometry args={[2.6, 16, 12]} />
        <meshStandardMaterial {...stone} color="#d8d2c0" roughness={0.9} />
      </mesh>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x, 17.8, 5.4]}>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial color="#ff3a1a" />
        </mesh>
      ))}
      <Html center distanceFactor={140} position={[0, 22, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Throne of the Dead
      </Html>
    </group>
  );
}

function CrashingMountains({stones, shades}) {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
  const floor = useMemo(() => floorSurface('mictlan', 2), []);
  // Two mountains leaning in to crush together, frozen mid-crash.
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#2e2a26" roughness={1} />
      </mesh>
      <mesh position={[-178, 14, -70]} rotation={[0, 0, 0.35]}>
        <coneGeometry args={[26, 34, 6]} />
        <meshStandardMaterial {...stone} color="#3a332c" roughness={1} />
      </mesh>
      <mesh position={[-142, 14, -70]} rotation={[0, 0, -0.35]}>
        <coneGeometry args={[26, 34, 6]} />
        <meshStandardMaterial {...stone} color="#3a332c" roughness={1} />
      </mesh>
      {stones.map((s) => (
        <mesh key={s.id} position={[s.x, s.h / 2, s.z]} rotation={[0, s.id * 0.7, 0]}>
          <boxGeometry args={[1.2, s.h, 0.8]} />
          <meshStandardMaterial {...stone} color={PALE_STONE} roughness={1} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('a')).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.4, s.z]} color="#e8e8ee" opacity={0.45} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[-160, 34, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Crashing Mountains
      </Html>
    </group>
  );
}

function WindDesert({spires, shades}) {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
  const floor = useMemo(() => floorSurface('mictlan', 2), []);
  // The obsidian wind desert: black glass spires the wind howls through.
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#1c2a2a" roughness={1} />
      </mesh>
      <pointLight position={[160, 8, -70]} color="#2ad4c0" intensity={40} distance={95} />
      {spires.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]} rotation={[0, p.id * 0.9, 0.15]}>
          <coneGeometry args={[1.2, p.h, 6]} />
          <meshStandardMaterial {...stone} color="#0d1a1a" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('e')).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.4, s.z]} color="#e8e8ee" opacity={0.45} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Obsidian Wind
      </Html>
    </group>
  );
}

function NinthLevel({pits, shades}) {
  const floor = useMemo(() => floorSurface('mictlan', 2), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -230]}>
        <circleGeometry args={[80, 40]} />
        <meshStandardMaterial {...floor} color="#160808" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color="#ff3a1a" intensity={LAVA_GLOW_PIT_LIGHT_INTENSITY} distance={LAVA_GLOW_PIT_LIGHT_DISTANCE} />
      {pits.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color={LAVA} transparent opacity={LAVA_GLOW_PIT_HALO_OPACITY} />
          </mesh>
          <LavaGlowDome radius={p.r * 1.6} color={LAVA} height={2.5} />
          <mesh position={[0, 1.8, 0]}>
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      {shades.filter((s) => s.id.startsWith('t')).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.2, s.z]} color="#2a2a33" opacity={0.7} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Ninth Level
      </Html>
    </group>
  );
}

function PortalArches() {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
  const archMat = useGoldArchMaterial({ ...stone, color: STONE, roughness: 0.9 });
  // Arch doorway art (Merlin, 2026-11-15): each arch's doorway wears
  // the illustrated art of the place it leads to; before a texture
  // loads the arch shows its plain glow disc.
  const archTex = useArchTextures(PORTALS.map((p) => p.key));
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
          {archTex[p.key] ? (
            <mesh position={[0, 3.6, 0.12]}>
              <circleGeometry args={[2.6, 24]} />
              <meshBasicMaterial map={archTex[p.key]} transparent opacity={0.92} side={THREE.DoubleSide} />
            </mesh>
          ) : null}
          <mesh position={[0, 3.6, 0.15]}>
            <circleGeometry args={[1.5, 24]} />
            <meshBasicMaterial color="#4ae8d4" transparent opacity={0.4} side={THREE.DoubleSide} />
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
// just a spawn marker. This nether-realm is Aztec hell; the
// menu hangs off this portal next round. The ring is deliberately a
// full circle, distinct from the standing-stone arches: it is the
// doorway you came down through, and the way back up. Walking through
// it does nothing in this round — the menu comes later.
function DescentPortal() {
  const stone = useMemo(() => stoneSurface('mictlan'), []);
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
          <meshStandardMaterial {...stone} color={STONE} roughness={0.9} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[3, 20]} />
        <meshBasicMaterial color="#ff3a1a" transparent opacity={LAVA_GLOW_CRACK_OPACITY} />
      </mesh>
      <LavaGlowDome radius={4.5} color="#ff3a1a" height={1.2} />
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[DESCENT_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial {...stone} color={STONE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color="#7c2d12" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#ff3a1a" transparent opacity={0.45} side={THREE.DoubleSide} />
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
// 14, riding at the flame. The second hue is the same discipline in this
// world's cold tone. The flicker is Earth 2's
// (components/earth2/Earth2World.jsx, "Fire flicker", 2026-11-03):
// every 3rd frame each lit flame breathes,
// intensity = base * (0.88 + 0.12 * sin(t*11 + id) * sin(t*5.7 + id*2)),
// and the flame cone breathes with the same wave.
//
// Only the 8 route-marking torches carry a real point light (the mobile
// budget: 8 torch lights + 4 region lights = 12 total). Every torch
// still shows its flame; the lit ones are the pools of light along
// the way down.
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

function Embers({reduced}) {
  const COUNT = 260;
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
      <pointsMaterial size={0.9} color="#ff5a2a" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
    </points>
  );
}

// --- first-person camera rig -------------------------------------------------

export function CameraRig({playerRef, inputRef, onPortal, onRegion, reduced, onAntiLife, onFloorDrop}) {
  const { camera } = useThree();
  const lastTravelRef = useRef(0);
  const travelingRef = useRef(false);
  const lastAntiLifeRef = useRef(0);
  const antiLifeTravelingRef = useRef(false);
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
    // ANTI-LIFE PORTAL (Merlin, 2026-11-15): a fall-through-the-floor
    // portal to Anti-Life — the same once-per-entry guard as the
    // arches and the Hades lava drop, so standing on the disc re-fires
    // the fall only after stepping back out. The fall rides the same
    // vortex travel; the tube is the fall.
    if (onAntiLife && isOnAntiLifePortal(player.x, player.z)) {
      if (!antiLifeTravelingRef.current && now - lastAntiLifeRef.current > 1500) {
        antiLifeTravelingRef.current = true;
        lastAntiLifeRef.current = now;
        onAntiLife();
      }
    } else {
      antiLifeTravelingRef.current = false;
    }
    // FLOOR DROP (WS-C, Nov 16): the disc at the mirror spot (+70, 110) drops the
    // walker through the floor to the Land of the Dead — the same
    // once-per-entry guard as the arches and the Anti-Life disc, with
    // its own guard state, so standing on the disc re-fires only
    // after stepping back out. The origin rides along, so the floor
    // portal in the Land of the Dead knows where to send the walker back.
    if (onFloorDrop && floorDropGuardShouldFire(floorDropGuardRef.current, player.x, player.z, FLOOR_DROP_DISC_NETHER, now)) {
      onFloorDrop();
    }
  });

  return null;
}

// --- the whole scene ---------------------------------------------------------

export function MictlanScene({playerRef, inputRef, onPortal, onRegion, reduced, onAntiLife, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1337), []);
  return (
    <>
      <DayNightRig sun moon followRef={playerRef} shade={NETHER_REALM_SHADE.mictlan} storm={null} />
      <RealmSkyDome realmKey="mictlan" followRef={playerRef} />
      <Ground playerRef={playerRef} />
      <ObsidianPools pools={world.obsidianPools} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Dog />
      <Throne />
      <CrashingMountains stones={world.mountainStones} shades={world.shades} />
      <WindDesert spires={world.windSpires}  shades={world.shades}/>
      <NinthLevel pits={world.thronePits} shades={world.shades} />
      <PortalArches />
      <AntiLifePortalDisc />
      <FloorDropDisc side="nether" reduced={reduced} />
      <DescentPortal />
      <Torches reduced={reduced} />
      <Embers reduced={reduced} />
      <CameraRig
        playerRef={playerRef}
        inputRef={inputRef}
        onPortal={onPortal}
        onAntiLife={onAntiLife}
        onFloorDrop={onFloorDrop}
        onRegion={onRegion}
        reduced={reduced}
      />
    </>
  );
}
