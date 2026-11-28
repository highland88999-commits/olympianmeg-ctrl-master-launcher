// app/hell/world3d.js
// HELL 3D scene — procedural, no external assets.
//
// Abandon all hope — the pit, the burning plain, and the frozen deep.
// First-person walk; the camera rig lives here too so the page shell
// stays lean. Patterns follow app/nether-realm/world3d.js: Canvas +
// useSceneContextGuard, Html labels from drei, plain English
// everywhere. No game mechanics in the base shell — the arches only
// navigate, nothing fights, nothing charges.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  DESCENT_PORTAL,
  GATES,
  PIT as LANDMARK,
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
} from '@/lib/hell/world';
import { useArchTextures } from '@/lib/portal/arch-graphics';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import { ANTI_LIFE_PORTAL, isOnAntiLifePortal } from '@/lib/afterlife/anti-life-portal';
import { FloorDropDisc } from '@/components/world/FloorDrop';
import { FLOOR_DROP_DISC_NETHER, createFloorDropGuard, floorDropGuardShouldFire } from '@/lib/world/floor-drop';
import AntiLifePortalDisc from '@/components/afterlife/AntiLifePortalDisc';
import DayNightRig from '@/components/DayNightRig';
import StreamingGround from '@/components/afterlife/StreamingGround';
import ShadeFigure from '@/components/afterlife/ShadeFigure';
import { FLOOR_EMISSIVE_INTENSITY, floorSurface, stoneSurface } from '@/lib/portal/realm-surfaces';
import { floorVideoUrlForRealm, useNetherVideoTexture } from '@/lib/nether-realm/video-wraps';
import RealmSkyDome from '@/components/RealmSkyDome';
import { LavaGlowDome, LavaPoolGlow } from '@/components/LavaGlow';
import {
  LAVA_GLOW_CRACK_OPACITY,
  LAVA_GLOW_LAKE_LIGHT_DISTANCE,
  LAVA_GLOW_LAKE_LIGHT_INTENSITY,
  LAVA_GLOW_PIT_HALO_OPACITY,
  LAVA_GLOW_PIT_LIGHT_DISTANCE,
  LAVA_GLOW_PIT_LIGHT_INTENSITY,
  LAVA_GLOW_VEIN_SHADOW_BLUR,
} from '@/lib/nether-realm/lava-glow';
import { NETHER_REALM_SHADE } from '@/lib/day-night';
import { nearRiver } from '@/lib/afterlife/ferry';
import {
  GUIDE_BREAK_M,
  GUIDE_FOLLOW_SPEED_MPS,
  bankAt,
  followStep,
  nearestGuidable,
} from '@/lib/afterlife/guide';

const ROCK = '#141118';
const STONE = '#2a2a32';
const PALE_STONE = '#55555e';
const DARK = '#0d0d12';
const LAVA = '#ff3d00';
const PORTAL_GLOW = '#7c3aed';

// --- canvas textures (procedural, seeded) ---------------------------------

function riverTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a0f02';
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

function Ground({ playerRef }) {
  const floor = useMemo(() => floorSurface('hell', 6), []);
  // VIDEO WRAP (Merlin, Nov 15 ~15:03, batch 1): the lava/fire floor
  // video when it is live; the painted floorSurface() until then.
  const videoTex = useNetherVideoTexture(floorVideoUrlForRealm('hell'));
  const mat = videoTex
    ? { map: videoTex, emissiveMap: videoTex, emissive: '#ffffff', emissiveIntensity: FLOOR_EMISSIVE_INTENSITY }
    : floor;
  // ENDLESS (Merlin, Nov 18, 2026): the fixed r=400 disc is gone —
  // the same floor streams in chunks around the walker (the shared
  // StreamingGround samples the old disc's UVs, so the home region
  // reads byte-identical). The material props are unchanged.
  return (
    <StreamingGround
      materialProps={{ ...mat, color: '#ffffff', roughness: 1, metalness: 0 }}
      followRef={playerRef}
    />
  );
}

function FirePools({pools, reduced}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <LavaPoolGlow pool={p} color={LAVA} reduced={reduced} />
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
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <planeGeometry args={[820, 36]} />
        <meshStandardMaterial
          map={tex}
          color="#c03a10"
          transparent
          opacity={0.92}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      {/* The river's own plain-words label, east of the bridge so it
          never covers the crossing (the Kur fix: rivers had no label). */}
      <Html center distanceFactor={120} position={[16, 3.5, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Phlegethon
      </Html>
    </>
  );
}

function Bridge() {
  const stone = useMemo(() => stoneSurface('hell'), []);
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
  const stone = useMemo(() => stoneSurface('hell'), []);
  return (
    <group position={[GATES.x, 0, GATES.z]}>
      <pointLight position={[0, 10, 0]} color="#ff2200" intensity={14} distance={34} />
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial {...stone} color="#0f0f14" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14.5, 0]}>
        <boxGeometry args={[15, 2, 3]} />
        <meshStandardMaterial {...stone} color="#0f0f14" roughness={0.85} />
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
  const stone = useMemo(() => stoneSurface('hell'), []);
  const floor = useMemo(() => floorSurface('hell', 2), []);
  // The Pit: a black crater at the bottom of Hell, ringed with ice
  // spikes — the lowest circle is frozen, not burning.
  const spikes = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    spikes.push({ x: Math.cos(a) * 14, z: Math.sin(a) * 14, key: i });
  }
  return (
    <group position={[LANDMARK.x, 0, LANDMARK.z]}>
      <pointLight position={[0, 8, 0]} color="#a8d8ff" intensity={55} distance={110} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <circleGeometry args={[18, 32]} />
        <meshStandardMaterial {...floor} color="#05070a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <circleGeometry args={[12, 32]} />
        <meshBasicMaterial color="#7fb8e8" transparent opacity={0.5} />
      </mesh>
      {spikes.map((s) => (
        <mesh key={s.key} position={[s.x, 3, s.z]}>
          <coneGeometry args={[1.2, 6, 6]} />
          <meshStandardMaterial {...stone} color="#9fd8ff" roughness={0.4} />
        </mesh>
      ))}
      {/* the frozen figure at the centre of the pit */}
      <mesh position={[0, 4, 0]}>
        <coneGeometry args={[2.5, 8, 6]} />
        <meshStandardMaterial {...stone} color="#cfe8ff" roughness={0.3} />
      </mesh>
      <Html center distanceFactor={140} position={[0, 12, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Pit
      </Html>
    </group>
  );
}

function WestRegion({dressing, shades, reduced, hiddenIds}) {
  const stone = useMemo(() => stoneSurface('hell'), []);
  const floor = useMemo(() => floorSurface('hell', 2), []);
  const westShades = useMemo(
    () => shades.filter((s) => s.id.startsWith('a') && !(hiddenIds || []).includes(s.id)),
    [shades, hiddenIds],
  );
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
        <meshStandardMaterial {...floor} color="#4a1408" roughness={1} />
      </mesh>
      {dressing.map((s) => (
        <mesh key={s.id} position={[s.x, s.h / 2, s.z]} rotation={[0, s.id * 0.7, 0]}>
          <boxGeometry args={[1.2, s.h, 0.8]} />
          <meshStandardMaterial {...stone} color={PALE_STONE} roughness={1} />
        </mesh>
      ))}
      {westShades.map((s, i) => (
        <ShadeFigure
          key={s.id}
          ref={(m) => { shadeRefs.current[i] = m; }}
          position={[s.x, 1.4, s.z]}
          color="#e8e8ee"
          opacity={0.45}
          seed={i}
        />
      ))}
      <Html center distanceFactor={120} position={[-160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Burning Plain
      </Html>
    </group>
  );
}

function EastRegion({dressing, reduced, shades, hiddenIds, forgeFlash = 0}) {
  const stone = useMemo(() => stoneSurface('hell'), []);
  const floor = useMemo(() => floorSurface('hell', 2), []);
  // Five flames breathing over the lake surface, same wave as the
  // Tartarus pit cones — fixed offsets inside the lake disc so the
  // fire reads from every side, not just from the bright spot.
  const flames = [
    { x: 25, z: 0 },
    { x: 7.7, z: 23.8 },
    { x: -20.2, z: 14.7 },
    { x: -20.2, z: -14.7 },
    { x: 7.7, z: -23.8 },
  ];
  const flameRefs = useRef([]);
  // THE FORGE (tranche 1): a cast soul bursts out of the lake — an
  // expanding ring of light that fades in ~1.2 s. forgeFlash counts
  // casts; the burst starts on each change.
  const burstRef = useRef(null);
  const burstAgeRef = useRef(null);
  useEffect(() => {
    if (forgeFlash > 0) burstAgeRef.current = 0;
  }, [forgeFlash]);
  useFrame((state, dt) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    flameRefs.current.forEach((m, i) => {
      if (!m) return;
      const s = 1 + Math.sin(t * 3 + i * 2.1) * 0.12;
      m.scale.set(s, 1 + Math.sin(t * 4 + i) * 0.15, s);
    });
    if (burstAgeRef.current != null) {
      burstAgeRef.current += Math.min(dt, 0.05);
      const m = burstRef.current;
      const age = burstAgeRef.current;
      if (m) {
        const s = 1 + age * 26;
        m.scale.set(s, s, 1);
        m.material.opacity = Math.max(0, 0.9 - age * 0.75);
      }
      if (age > 1.2) burstAgeRef.current = null;
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#3d0d02" roughness={1} />
      </mesh>
      {/* The lake surface itself, in three steps — mid glow, hot
          middle, bright core — so the fire covers the lake instead of
          one small dot on a dark disc. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[55, 32]} />
        <meshBasicMaterial color="#ff5a00" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.1, -70]}>
        <circleGeometry args={[30, 32]} />
        <meshBasicMaterial color="#ff9a1a" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.12, -70]}>
        <circleGeometry args={[14, 24]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0.9} />
      </mesh>
      <group position={[160, 0, -70]}>
        <LavaGlowDome radius={70} color="#ff5a00" height={6} opacity={0.12} />
      </group>
      <pointLight position={[160, 10, -70]} color='#ff7a1a' intensity={LAVA_GLOW_LAKE_LIGHT_INTENSITY} distance={LAVA_GLOW_LAKE_LIGHT_DISTANCE} />
      {flames.map((f, i) => (
        <mesh
          key={i}
          ref={(m) => { flameRefs.current[i] = m; }}
          position={[160 + f.x, 2.5, -70 + f.z]}
        >
          <coneGeometry args={[2.2, 5, 8]} />
          <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} />
        </mesh>
      ))}
      {/* Forge burst: an expanding ring over the lake on a cast. */}
      <mesh ref={burstRef} rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.5, -70]}>
        <ringGeometry args={[0.9, 1, 32]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {dressing.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial {...stone} color="#d8d2c0" roughness={0.9} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('e') && !(hiddenIds || []).includes(s.id)).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.2, s.z]} color="#2a2a33" opacity={0.7} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Lake of Fire
      </Html>
    </group>
  );
}

function NorthRegion({dressing, shades, reduced, hiddenIds}) {
  const floor = useMemo(() => floorSurface('hell', 2), []);
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
        <meshStandardMaterial {...floor} color="#0e1a24" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color='#9fd8ff' intensity={LAVA_GLOW_PIT_LIGHT_INTENSITY} distance={LAVA_GLOW_PIT_LIGHT_DISTANCE} />
      {dressing.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 1.6, 20]} />
            <meshBasicMaterial color={LAVA} transparent opacity={LAVA_GLOW_PIT_HALO_OPACITY} />
          </mesh>
          <LavaGlowDome radius={p.r * 1.6} color={LAVA} height={2.5} />
          <mesh
            ref={(m) => { pitRefs.current[p.id] = m; }}
            position={[0, 1.8, 0]}
          >
            <coneGeometry args={[p.r * 0.7, 3.6, 8]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      {shades.filter((s) => s.id.startsWith('t') && !(hiddenIds || []).includes(s.id)).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.2, s.z]} color="#2a2a33" opacity={0.7} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        The Frozen Deep
      </Html>
    </group>
  );
}

function PortalArches() {
  const stone = useMemo(() => stoneSurface('hell'), []);
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
// just a spawn marker. This nether-realm is Christian hell; the menu hangs
// off this portal next round. The ring is deliberately a full circle,
// distinct from the standing-stone arches: it is the doorway you came
// down through, and the way back up. Walking through it does nothing
// in this round — the menu comes later.
function DescentPortal() {
  const stone = useMemo(() => stoneSurface('hell'), []);
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
        <meshBasicMaterial color={LAVA} transparent opacity={LAVA_GLOW_CRACK_OPACITY} />
      </mesh>
      <LavaGlowDome radius={4.5} color={LAVA} height={1.2} />
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[DESCENT_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial {...stone} color={STONE} roughness={0.9} />
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
// 14, riding at the flame. ember is the same discipline in the other
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
      <pointsMaterial size={0.9} color="#ff7a1a" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation map={tex ?? undefined} />
    </points>
  );
}

// --- first-person camera rig -------------------------------------------------

// The guided soul (tranche 1): a fading shade that follows the
// walker to the river bank. The page owns the guide state; this
// mesh only walks the position in guidedPosRef toward the player.
function GuidedShade({ guiding, guidedPosRef, playerRef, reduced }) {
  const ref = useRef(null);
  useFrame((state, dt) => {
    if (reduced || !guiding || !guidedPosRef.current) return;
    const p = playerRef.current;
    const g = guidedPosRef.current;
    const next = followStep(g.x, g.z, p.x, p.z, GUIDE_FOLLOW_SPEED_MPS, Math.min(dt, 0.05));
    guidedPosRef.current = { x: next.x, z: next.z };
    const m = ref.current;
    if (m) {
      m.position.set(next.x, 1.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.3, next.z);
    }
  });
  if (!guiding || !guidedPosRef.current) return null;
  // The guided soul is NOT a drift figure: it renders as its own
  // ShadeFigure (size 1.07, brighter than the drift figures) so the
  // drift census stays exact — the humanoid suite counts exactly
  // three drift ShadeFigures per realm, one per disc, and this soul
  // is none of them.
  return (
    <ShadeFigure
      ref={ref}
      position={[guidedPosRef.current.x, 1.2, guidedPosRef.current.z]}
      size={1.07}
      color="#f2f2fa"
      opacity={0.65}
      seed={99}
    />
  );
}

export function CameraRig({playerRef, inputRef, onPortal, onRegion, reduced, shades, guiding, guidedPosRef, deliveredIds, onFerryZone, onGuidable, onGuideBroken, onDelivered, onAntiLife, onFloorDrop}) {
  const { camera } = useThree();
  const lastTravelRef = useRef(0);
  const travelingRef = useRef(false);
  const lastAntiLifeRef = useRef(0);
  const antiLifeTravelingRef = useRef(false);
  const floorDropGuardRef = useRef(createFloorDropGuard());
  const lastRegionRef = useRef('');
  const lastFerryRef = useRef(null);
  const lastGuidableRef = useRef(null);
  const lastGuideCheckRef = useRef(0);
  const deliveringRef = useRef(null);

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

    // THE FERRY (tranche 1): near the river, Charon can be called.
    // Reported on change only, like the region.
    if (onFerryZone) {
      const near = nearRiver(player.x, player.z, RIVER, 30);
      if (near !== lastFerryRef.current) {
        lastFerryRef.current = near;
        onFerryZone(near);
      }
    }

    // SOUL-GUIDING (tranche 1): a fading soul within reach can be
    // guided; a guided soul that falls behind is lost, and one
    // walked to the bank is delivered. The guidable scan runs twice
    // a second — lifeFor is pure, but 18 calls a frame is wasteful.
    // Delivered souls are excluded from the scan, so a banked soul
    // is never offered twice.
    const nowMs = Date.now();
    if (guiding && guidedPosRef && guidedPosRef.current) {
      const g = guidedPosRef.current;
      if (Math.hypot(player.x - g.x, player.z - g.z) > GUIDE_BREAK_M) {
        if (onGuideBroken) onGuideBroken();
      } else if (bankAt(RIVER, player.x, player.z)) {
        if (onDelivered && deliveringRef.current !== guiding.id) {
          deliveringRef.current = guiding.id;
          onDelivered(guiding);
        }
      }
    } else {
      deliveringRef.current = null;
      if (onGuidable && shades && nowMs - lastGuideCheckRef.current > 500) {
        lastGuideCheckRef.current = nowMs;
        const open = (deliveredIds || []).length
          ? shades.filter((s) => !deliveredIds.includes(s.id))
          : shades;
        const found = nearestGuidable('hell', open, player.x, player.z, nowMs);
        const key = found ? `${found.id}:${found.generation}` : null;
        if (key !== lastGuidableRef.current) {
          lastGuidableRef.current = key;
          onGuidable(found ? { id: found.id, generation: found.generation } : null);
        }
      }
    }
  });

  return null;
}

// --- the whole scene ---------------------------------------------------------

export function HellScene({playerRef, inputRef, onPortal, onRegion, reduced, guiding, deliveredIds, forgeFlash, onFerryZone, onGuidable, onGuideBroken, onDelivered, onAntiLife, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1338), []);

  // The guided soul's live position, shared between the CameraRig
  // (break/delivery checks) and the GuidedShade mesh (the walk).
  const guidedPosRef = useRef(null);
  useEffect(() => {
    if (!guiding) {
      guidedPosRef.current = null;
      return;
    }
    const shade = world.shades.find((s) => s.id === guiding.id);
    guidedPosRef.current = shade ? { x: shade.x, z: shade.z } : null;
  }, [guiding, world]);

  // Shades already delivered — or being guided — are not rendered
  // in their region disc: a delivered soul has passed on, and the
  // guided one walks beside the player instead.
  const hiddenIds = [...(deliveredIds || []), guiding ? guiding.id : null].filter(Boolean);

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
      <DayNightRig sun moon followRef={playerRef}
        shade={NETHER_REALM_SHADE.hell}
        storm={{
          hue: 'red',
          bounds: { xMin: -300, xMax: 300, zMin: -300, zMax: 300 },
          isOpenGround,
          realm: 'hell',
          seed: 7102,
        }}
      />
      <RealmSkyDome realmKey="hell" followRef={playerRef} />
      <Ground playerRef={playerRef} />
      <FirePools pools={world.lavaPools} reduced={reduced} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Landmark />
      <WestRegion dressing={world.plainStones} shades={world.shades} reduced={reduced} hiddenIds={hiddenIds} />
      <EastRegion dressing={world.lakeFlames} reduced={reduced} shades={world.shades} hiddenIds={hiddenIds} forgeFlash={forgeFlash} />
      <NorthRegion dressing={world.frozenSpikes} shades={world.shades} reduced={reduced} hiddenIds={hiddenIds} />
      <GuidedShade guiding={guiding} guidedPosRef={guidedPosRef} playerRef={playerRef} reduced={reduced} />
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
        shades={world.shades}
        guiding={guiding}
        guidedPosRef={guidedPosRef}
        deliveredIds={deliveredIds}
        onFerryZone={onFerryZone}
        onGuidable={onGuidable}
        onGuideBroken={onGuideBroken}
        onDelivered={onDelivered}
      />
    </>
  );
}
