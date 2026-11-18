// app/duat/world3d.js
// DUAT 3D scene — procedural, no external assets.
//
// The Egyptian underworld: the river of the dead, the Hall of Two Truths where the heart is weighed against the feather of Maat, the twelve gates of the night, Ra's solar barque passing through, and the serpent Apep lurking in the dark waters.
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
} from '@/lib/duat/world';
import { useArchTextures } from '@/lib/portal/arch-graphics';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import { useScratchedMaterial } from '@/lib/portal/scratched-textures';
import { ANTI_LIFE_PORTAL, isOnAntiLifePortal } from '@/lib/afterlife/anti-life-portal';
import { FloorDropDisc } from '@/components/world/FloorDrop';
import { FLOOR_DROP_DISC_NETHER, createFloorDropGuard, floorDropGuardShouldFire } from '@/lib/world/floor-drop';
import AntiLifePortalDisc from '@/components/afterlife/AntiLifePortalDisc';
import DayNightRig from '@/components/DayNightRig';
import { floorSurface, stoneSurface } from '@/lib/portal/realm-surfaces';
import RealmSkyDome from '@/components/RealmSkyDome';
import { NETHER_REALM_SHADE } from '@/lib/day-night';

const ROCK = '#141118';
const STONE = '#2a2a32';
const PALE_STONE = '#55555e';
const DARK = '#0d0d12';
const LAVA = '#d4af37';
const PORTAL_GLOW = '#d4a227';

// --- canvas textures (procedural, seeded) ---------------------------------

function riverTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04141a';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(30, 120, 140, ${0.25 + Math.random() * 0.5})`;
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
  color: '#fdf3d0',
  background: 'rgba(40, 28, 4, 0.82)',
  border: '1px solid rgba(212, 175, 55, 0.65)',
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
  const floor = useMemo(() => floorSurface('duat', 6), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[400, 64]} />
      <meshStandardMaterial {...floor} color="#ffffff" roughness={1} metalness={0} />
    </mesh>
  );
}

function DarkPools({pools}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <circleGeometry args={[p.r * 1.5, 24]} />
            <meshBasicMaterial color="#3a86ff" transparent opacity={0.22} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[p.r, 24]} />
            <meshBasicMaterial color="#1a4a8a" transparent opacity={0.9} />
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
        color="#7fc4d4"
        transparent
        opacity={0.92}
        roughness={0.25}
        metalness={0.1}
      />
    </mesh>
  );
}

function Bridge() {
  const stone = useMemo(() => stoneSurface('duat'), []);
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
  const stone = useMemo(() => stoneSurface('duat'), []);
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial {...stone} color="#8a6d2f" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial {...stone} color="#8a6d2f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 13.2, 0]}>
        <boxGeometry args={[11, 0.5, 0.4]} />
        <meshBasicMaterial color="#ffd34d" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The First Gate
      </Html>
    </group>
  );
}

function Barque() {
  const stone = useMemo(() => stoneSurface('duat'), []);
  // BRIGHT-GOLD scratched-metal wrap (Merlin, 2026-11-15): the
  // barque's HULL (hull + bow + stern boxes) wears bright gold; the
  // fallback is the hull's existing stone material, so it never goes
  // blank. NOT wrapped: the sun disc (glow disc, MeshBasicMaterial),
  // the point light, or the label.
  const barqueWrapMat = useScratchedMaterial('bright-gold', { ...stone, color: '#8a6d2f', roughness: 0.8 });
  // Ra's solar barque, sailing the river of the dead — it passes
  // through the Duat every night, and the sun rises again.
  return (
    <group position={[60, 0, 0]}>
      <pointLight position={[0, 8, 0]} color="#ffd34d" intensity={30} distance={60} />
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[14, 1.2, 3]} />
        <meshStandardMaterial {...barqueWrapMat} />
      </mesh>
      <mesh position={[-7, 2, 0]} rotation={[0, 0, 0.6]}>
        <boxGeometry args={[3, 1, 2.4]} />
        <meshStandardMaterial {...barqueWrapMat} />
      </mesh>
      <mesh position={[7, 2, 0]} rotation={[0, 0, -0.6]}>
        <boxGeometry args={[3, 1, 2.4]} />
        <meshStandardMaterial {...barqueWrapMat} />
      </mesh>
      {/* the sun disc Ra sails with */}
      <mesh position={[0, 6.5, 0]}>
        <circleGeometry args={[2.2, 24]} />
        <meshBasicMaterial color="#ffd34d" side={THREE.DoubleSide} />
      </mesh>
      <Html center distanceFactor={120} position={[0, 10, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Ra&apos;s Solar Barque
      </Html>
    </group>
  );
}

function Hall({columns}) {
  const stone = useMemo(() => stoneSurface('duat'), []);
  // BRIGHT-GOLD scratched-metal wrap (Merlin, 2026-11-15): the hall
  // COLUMNS only — the 8 inner columns and the outer ring columns —
  // wear bright gold; the fallback is the columns' existing stone
  // material. NOT wrapped: the plinth, the great scales (beam, post,
  // pans), the roof slab, the point light, or the label.
  const columnWrapMat = useScratchedMaterial('bright-gold', { ...stone, color: '#cbb98a', roughness: 0.9 });
  // The Hall of Two Truths: the heart is weighed against the feather
  // of Maat, on the great scales, under the columns.
  const innerColumns = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    innerColumns.push({ x: Math.cos(a) * 14, z: Math.sin(a) * 14, key: i });
  }
  return (
    <group position={[PALACE.x, 0, PALACE.z]}>
      <pointLight position={[0, 14, 10]} color="#ffd34d" intensity={70} distance={120} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[18, 20, 2, 24]} />
        <meshStandardMaterial {...stone} color="#14100a" roughness={0.9} />
      </mesh>
      {/* the great scales */}
      <mesh position={[0, 8, 8]}>
        <boxGeometry args={[0.5, 8, 0.5]} />
        <meshStandardMaterial {...stone} color="#8a6d2f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 12, 8]}>
        <boxGeometry args={[10, 0.4, 0.4]} />
        <meshStandardMaterial {...stone} color="#8a6d2f" roughness={0.8} />
      </mesh>
      {[-5, 5].map((x) => (
        <mesh key={x} position={[x, 10.6, 8]}>
          <cylinderGeometry args={[1.6, 0.4, 0.8, 12]} />
          <meshStandardMaterial {...stone} color="#d4af37" roughness={0.7} />
        </mesh>
      ))}
      {innerColumns.map((c) => (
        <mesh key={c.key} position={[c.x, 6, c.z]}>
          <cylinderGeometry args={[0.9, 1.1, 12, 10]} />
          <meshStandardMaterial {...columnWrapMat} />
        </mesh>
      ))}
      {/* the outer ring, from the seeded dressing */}
      {columns.map((c) => (
        <mesh key={c.id} position={[c.x, c.h / 2, c.z]}>
          <cylinderGeometry args={[0.9, 1.1, c.h, 10]} />
          <meshStandardMaterial {...columnWrapMat} />
        </mesh>
      ))}
      <mesh position={[0, 13, 0]}>
        <boxGeometry args={[26, 1.5, 26]} />
        <meshStandardMaterial {...stone} color="#14100a" roughness={0.9} />
      </mesh>
      <Html center distanceFactor={140} position={[0, 17, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Hall of Two Truths
      </Html>
    </group>
  );
}

function TwelveGates({pillars, shades}) {
  const stone = useMemo(() => stoneSurface('duat'), []);
  const floor = useMemo(() => floorSurface('duat', 2), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#4a3d22" roughness={1} />
      </mesh>
      {pillars.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]} rotation={[0, p.id * 0.5, 0]}>
          <boxGeometry args={[1.4, p.h, 1]} />
          <meshStandardMaterial {...stone} color="#8a6d2f" roughness={1} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('a')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.4, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#e8e8ee" transparent opacity={0.45} roughness={0.6} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[-160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Twelve Gates
      </Html>
    </group>
  );
}

function DarkWaters({coils, shades}) {
  const floor = useMemo(() => floorSurface('duat', 2), []);
  // Apep, the great serpent, coiled in the dark waters — gold eyes
  // watching the barque go by.
  const segments = [];
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    segments.push({ x: 160 + Math.cos(a) * 22, z: -70 + Math.sin(a) * 22, y: 1.6 + Math.sin(i * 1.3) * 0.8, key: i });
  }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#0a1a2e" roughness={0.4} metalness={0.2} />
      </mesh>
      <pointLight position={[160, 8, -70]} color="#3a86ff" intensity={40} distance={95} />
      {segments.map((s) => (
        <mesh key={s.key} position={[s.x, s.y, s.z]}>
          <sphereGeometry args={[2.2, 12, 10]} />
          <meshStandardMaterial color="#0d2b1a" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[160, 5.5, -48]}>
        <sphereGeometry args={[2.8, 12, 10]} />
        <meshStandardMaterial color="#0d2b1a" roughness={0.8} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[160 + x, 6.2, -45.4]}>
          <sphereGeometry args={[0.35, 8, 8]} />
          <meshBasicMaterial color="#ffd34d" />
        </mesh>
      ))}
      {coils.map((c) => (
        <mesh key={c.id} position={[c.x, 0.6, c.z]}>
          <torusGeometry args={[c.r, 0.5, 8, 20]} />
          <meshStandardMaterial color="#123524" roughness={0.8} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('t')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.2, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#2a2a33" transparent opacity={0.7} roughness={0.9} />
        </mesh>
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Dark Waters
      </Html>
    </group>
  );
}

function TwelfthGate() {
  const stone = useMemo(() => stoneSurface('duat'), []);
  const floor = useMemo(() => floorSurface('duat', 2), []);
  return (
    <group position={[0, 0, -230]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[80, 40]} />
        <meshStandardMaterial {...floor} color="#241a08" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, 0]} color="#ffd34d" intensity={45} distance={100} />
      {[-8, 8].map((x) => (
        <mesh key={x} position={[x, 9, 0]}>
          <boxGeometry args={[3.5, 18, 3.5]} />
          <meshStandardMaterial {...stone} color="#0f0f14" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 18.5, 0]}>
        <boxGeometry args={[20, 2.5, 3.5]} />
        <meshStandardMaterial {...stone} color="#0f0f14" roughness={0.85} />
      </mesh>
      <mesh position={[0, 16.8, 0]}>
        <boxGeometry args={[14, 0.5, 0.4]} />
        <meshBasicMaterial color="#ffd34d" />
      </mesh>
      <Html center distanceFactor={120} position={[0, 22, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Twelfth Gate
      </Html>
    </group>
  );
}

function PortalArches() {
  const stone = useMemo(() => stoneSurface('duat'), []);
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
            <meshBasicMaterial color="#ffd34d" transparent opacity={0.4} side={THREE.DoubleSide} />
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
// just a spawn marker. This nether-realm is Egyptian hell; the
// menu hangs off this portal next round. The ring is deliberately a
// full circle, distinct from the standing-stone arches: it is the
// doorway you came down through, and the way back up. Walking through
// it does nothing in this round — the menu comes later.
function DescentPortal() {
  const stone = useMemo(() => stoneSurface('duat'), []);
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
        <meshBasicMaterial color="#ffd34d" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[DESCENT_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial {...stone} color={STONE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <circleGeometry args={[3.6, 32]} />
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.5, 0.05]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#3a86ff" transparent opacity={0.45} side={THREE.DoubleSide} />
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
      <pointsMaterial size={0.9} color="#ffb03a" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
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

export function DuatScene({playerRef, inputRef, onPortal, onRegion, reduced, onAntiLife, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1337), []);
  return (
    <>
      <DayNightRig sun moon shade={NETHER_REALM_SHADE.duat} storm={null} />
      <RealmSkyDome realmKey="duat" />
      <Ground />
      <DarkPools pools={world.darkPools} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Barque />
      <Hall columns={world.hallColumns} />
      <TwelveGates pillars={world.gatePillars} shades={world.shades} />
      <DarkWaters coils={world.apepCoils} shades={world.shades} />
      <TwelfthGate />
      {world.shades.filter((s) => s.id.startsWith('n')).map((s) => (
        <mesh key={s.id} position={[s.x, 1.4, s.z]}>
          <coneGeometry args={[0.7, 2.4, 8]} />
          <meshStandardMaterial color="#e8e8ee" transparent opacity={0.45} roughness={0.6} />
        </mesh>
      ))}
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
