// app/nether-realm/world3d.js
// NETHER-REALM 3D scene — procedural, no external assets.
//
// The world beneath the world: black rock ground with lava veins, the
// River Styx, the Gates with Cerberus, Hades' Palace, the three fields
// (Asphodel / Elysium / Tartarus), the Descent, and seven portal
// arches. First-person walk; the camera rig lives here too so the
// page shell stays lean.
//
// Patterns follow app/erebus/page.jsx: Canvas + useSceneContextGuard,
// Html labels from drei, touch UI detected via maxTouchPoints, plain
// English everywhere. No game mechanics in the base shell — the arches
// only navigate, nothing fights, nothing charges.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getParticleTexture } from '@/lib/particles/sprites';
import {
  DESCENT_PORTAL,
  GATES,
  LAVA_DROP_NAME,
  MEDUSA_LAIR,
  PALACE,
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
  mulberry32,
  nearestLavaPool,
  nearestPortal,
  regionAt,
  right,
  stepPosition,
} from '@/lib/nether-realm/world';
import { ANTI_LIFE_PORTAL, isOnAntiLifePortal } from '@/lib/afterlife/anti-life-portal';
import { FloorDropDisc } from '@/components/world/FloorDrop';
import { FLOOR_DROP_DISC_NETHER, createFloorDropGuard, floorDropGuardShouldFire } from '@/lib/world/floor-drop';
import { useArchTextures } from '@/lib/portal/arch-graphics';
import { useGoldArchMaterial } from '@/lib/portal/gold-texture';
import AntiLifePortalDisc from '@/components/afterlife/AntiLifePortalDisc';
import {
  LAIR_RUN_MPS,
  LAIR_WALK_MPS,
  MEDUSA_POS,
  MEDUSA_SNAKE_COUNT,
  blockedByStatue,
  headSnakesPose,
} from '@/lib/nether-realm/medusa';
import { heroMotionPose, heroPhaseRate } from '@/app/middle-earth/figure-motion.js';
import DayNightRig from '@/components/DayNightRig';
import { FLOOR_EMISSIVE_INTENSITY, floorSurface, stoneSurface } from '@/lib/portal/realm-surfaces';
import { floorVideoUrlForRealm, useNetherVideoTexture } from '@/lib/nether-realm/video-wraps';
import RealmSkyDome from '@/components/RealmSkyDome';
import StreamingGround from '@/components/afterlife/StreamingGround';
import ShadeFigure from '@/components/afterlife/ShadeFigure';
import { LavaGlowDome, LavaPoolGlow } from '@/components/LavaGlow';
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
const LAVA = '#ff5a00';
const PORTAL_GLOW = '#7c3aed';

// --- canvas textures (procedural, seeded) ---------------------------------

function riverTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04120d';
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

// Lava-pool label: the pool is a drop, not scenery — the label names
// where it takes you, like the arch labels name their realm.
const lavaLabelStyle = {
  ...portalLabelStyle,
  fontSize: 13,
  fontWeight: 700,
  color: '#ffedd5',
  background: 'rgba(40, 10, 0, 0.82)',
  border: '1px solid rgba(255, 122, 26, 0.65)',
};

// --- static pieces ----------------------------------------------------------

function Ground({ playerRef }) {
  const floor = useMemo(() => floorSurface('hades', 6), []);
  // VIDEO WRAP (Merlin, Nov 15 ~15:03, batch 1): the lava floor video
  // when it is live; the painted floorSurface() until then.
  const videoTex = useNetherVideoTexture(floorVideoUrlForRealm('hades'));
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

function LavaPools({pools, reduced}) {
  return (
    <group>
      {pools.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <LavaPoolGlow pool={p} color={LAVA} reduced={reduced} />
          <Html center distanceFactor={90} position={[0, 2.2, 0]} zIndexRange={[20, 0]} style={lavaLabelStyle}>
            {LAVA_DROP_NAME}
          </Html>
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
        color="#9fd8c0"
        transparent
        opacity={0.92}
        roughness={0.25}
        metalness={0.1}
      />
    </mesh>
  );
}

function Bridge() {
  const stone = useMemo(() => stoneSurface('hades'), []);
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

function Cerberus() {
  // Cerberus faces SOUTH (+Z): the user walks up from the bridge and
  // meets the three heads first. Eyes are on the +Z (south) side.
  // CGI rebuild (Nov 28, 2026): textured brindle hound — same
  // position, same footprint (~5 m long, skull centres ~5.8 m up),
  // same ONE red pointLight, same growl trigger (page.jsx). Idle
  // life only (breathing, head sway, tail wag) — still a static guard.
  const fur = useMemo(() => brindleFurTexture(), []);
  const bodyRef = useRef();
  const headRefs = useRef([]);
  const tailRef = useRef();
  const HEAD_TILT = [0.28, 0, -0.28];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (bodyRef.current) {
      bodyRef.current.scale.set(1, 1 + Math.sin(t * 1.1) * 0.02, 1);
    }
    headRefs.current.forEach((h, i) => {
      if (!h) return;
      h.rotation.z = HEAD_TILT[i] + Math.sin(t * 0.5 + i * 2.1) * 0.05;
      h.rotation.x = Math.sin(t * 0.7 + i * 1.3) * 0.03;
    });
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(t * 2) * 0.18;
  });
  const eye = () => (
    <>
      <mesh position={[-0.35, 0.2, 0.8]}>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshBasicMaterial color="#ff2a1a" />
      </mesh>
      <mesh position={[0.35, 0.2, 0.8]}>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshBasicMaterial color="#ff2a1a" />
      </mesh>
    </>
  );
  const head = (x, i) => (
    <group
      key={x}
      ref={(g) => { headRefs.current[i] = g; }}
      position={[x, 3.6, 1.1]}
      rotation={[0, 0, HEAD_TILT[i]]}
    >
      {/* neck */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 2.2, 10]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      {/* skull */}
      <mesh position={[0, 2.2, 0]} scale={[1, 0.9, 1.15]}>
        <sphereGeometry args={[0.95, 16, 12]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      {/* snout + jaw */}
      <mesh position={[0, 2.0, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.55, 0.9, 10]} />
        <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.78, 0.75]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 0.7, 8]} />
        <meshStandardMaterial color="#241a12" roughness={0.95} />
      </mesh>
      {/* ears */}
      {[-0.55, 0.55].map((ex) => (
        <mesh key={ex} position={[ex, 2.95, -0.1]} rotation={[0, 0, ex > 0 ? -0.25 : 0.25]}>
          <coneGeometry args={[0.28, 0.7, 8]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
      ))}
      <group position={[0, 2.2, 0]}>{eye()}</group>
    </group>
  );
  return (
    <group position={[GATES.x, 0, GATES.z - 8]}>
      <pointLight position={[0, 7, -2]} color="#ff2200" intensity={14} distance={34} />
      {/* body — barrel chest + haunches under one breathing group */}
      <group ref={bodyRef}>
        <mesh position={[0, 2.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.15, 1.15, 4.4, 12]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
        <mesh position={[1.6, 2.2, 0]}>
          <sphereGeometry args={[1.25, 16, 12]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
        <mesh position={[-1.6, 2.2, 0]}>
          <sphereGeometry args={[1.2, 16, 12]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
      </group>
      {/* legs + paws */}
      {[[-1.8, -0.6], [1.8, -0.6], [-1.8, 0.6], [1.8, 0.6]].map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.32, 0.36, 1.6, 10]} />
            <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.18, 0.05]} scale={[1, 0.6, 1.2]}>
            <sphereGeometry args={[0.36, 10, 8]} />
            <meshStandardMaterial color="#241a12" roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* tail (north side, away from the heads) — pivot at the rump */}
      <group ref={tailRef} position={[0, 2.4, -1.2]}>
        <mesh position={[0, 0, -0.9]} rotation={[Math.PI / 2 - 0.5, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.22, 2.2, 8]} />
          <meshStandardMaterial map={fur} color="#ffffff" roughness={0.95} />
        </mesh>
      </group>
      {head(-1.9, 0)}
      {head(0, 1)}
      {head(1.9, 2)}
    </group>
  );
}

function Gates() {
  const stone = useMemo(() => stoneSurface('hades'), []);
  return (
    <group position={[GATES.x, 0, GATES.z]}>
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

function Palace() {
  const stone = useMemo(() => stoneSurface('hades'), []);
  const spikes = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    spikes.push({ x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2, key: i });
  }
  return (
    <group position={[PALACE.x, 0, PALACE.z]}>
      <pointLight position={[0, 22, 12]} color={PORTAL_GLOW} intensity={90} distance={130} />
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[17, 19, 2, 24]} />
        <meshStandardMaterial {...stone} color="#0a0810" roughness={0.9} />
      </mesh>
      {/* black spire */}
      <mesh position={[0, 25, 0]}>
        <cylinderGeometry args={[2.5, 10, 46, 8]} />
        <meshStandardMaterial {...stone} color="#08070c" roughness={0.85} />
      </mesh>
      {spikes.map((s) => (
        <mesh key={s.key} position={[s.x, 49, s.z]}>
          <coneGeometry args={[0.9, 5, 6]} />
          <meshStandardMaterial {...stone} color="#08070c" roughness={0.85} />
        </mesh>
      ))}
      {/* throne, facing the plaza */}
      <mesh position={[0, 3, 12]}>
        <boxGeometry args={[7, 5, 3]} />
        <meshStandardMaterial {...stone} color="#0d0a14" roughness={0.85} />
      </mesh>
      <mesh position={[0, 6.4, 12]}>
        <boxGeometry args={[3, 2.4, 1]} />
        <meshBasicMaterial color={PORTAL_GLOW} />
      </mesh>
      {/* glowing window slits up the spire — the spire tapers from
          radius 10 at its base (y=2) to 2.5 at its top (y=48), so each
          slit sits just proud of the surface at its own height. */}
      {[12, 20, 28, 36, 44].map((y) => (
        <mesh key={y} position={[0, y, 10 - (y - 2) * (7.5 / 46) + 0.05]}>
          <boxGeometry args={[0.7, 3, 0.3]} />
          <meshBasicMaterial color="#c084fc" />
        </mesh>
      ))}
      <Html center distanceFactor={140} position={[0, 54, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        {"Hades' Palace"}
      </Html>
    </group>
  );
}

function Asphodel({stones, shades, reduced}) {
  const stone = useMemo(() => stoneSurface('hades'), []);
  const floor = useMemo(() => floorSurface('hades', 2), []);
  const asphodelShades = useMemo(() => shades.filter((s) => s.id.startsWith('a')), [shades]);
  const shadeRefs = useRef([]);
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    shadeRefs.current.forEach((m, i) => {
      if (!m) return;
      m.position.y = 1.4 + Math.sin(t * asphodelShades[i].slow + i * 1.7) * 0.45;
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#3d3d44" roughness={1} />
      </mesh>
      {stones.map((s) => (
        <mesh key={s.id} position={[s.x, s.h / 2, s.z]} rotation={[0, s.id * 0.7, 0]}>
          <boxGeometry args={[1.2, s.h, 0.8]} />
          <meshStandardMaterial {...stone} color={PALE_STONE} roughness={1} />
        </mesh>
      ))}
      {asphodelShades.map((s, i) => (
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
        Asphodel
      </Html>
    </group>
  );
}

function Elysium({pillars, shades}) {
  const stone = useMemo(() => stoneSurface('hades'), []);
  const floor = useMemo(() => floorSurface('hades', 2), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.05, -70]}>
        <circleGeometry args={[70, 40]} />
        <meshStandardMaterial {...floor} color="#6b5f3f" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.08, -70]}>
        <circleGeometry args={[12, 24]} />
        <meshBasicMaterial color="#ffe9a8" transparent opacity={0.45} />
      </mesh>
      <pointLight position={[160, 10, -70]} color="#ffd98a" intensity={45} distance={95} />
      {pillars.map((p) => (
        <mesh key={p.id} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[0.9, 1.1, p.h, 10]} />
          <meshStandardMaterial {...stone} color="#d8d2c0" roughness={0.9} />
        </mesh>
      ))}
      {shades.filter((s) => s.id.startsWith('e')).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.2, s.z]} color="#2a2a33" opacity={0.7} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[160, 9, -70]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Elysium
      </Html>
    </group>
  );
}

function Tartarus({pits, shades, reduced}) {
  const floor = useMemo(() => floorSurface('hades', 2), []);
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
        <meshStandardMaterial {...floor} color="#1c0505" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, -230]} color={LAVA} intensity={LAVA_GLOW_PIT_LIGHT_INTENSITY} distance={LAVA_GLOW_PIT_LIGHT_DISTANCE} />
      {pits.map((p) => (
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
      {shades.filter((s) => s.id.startsWith('t')).map((s, i) => (
        <ShadeFigure key={s.id} position={[s.x, 1.2, s.z]} color="#2a2a33" opacity={0.7} seed={i} />
      ))}
      <Html center distanceFactor={120} position={[0, 9, -230]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Tartarus
      </Html>
    </group>
  );
}

function PortalArches() {
  const stone = useMemo(() => stoneSurface('hades'), []);
  const archMat = useGoldArchMaterial({ ...stone, color: STONE, roughness: 0.9 });
  // Arch doorway art (Merlin, 2026-11-15): every arch's doorway wears
  // the illustrated art of the place it leads to. The medusa door keeps
  // the same lair texture, crop, position and opacity as before — the
  // bespoke loader is replaced by the shared hook. Before a texture
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
// just a spawn marker. This nether-realm is GREEK hell; the menu hangs
// off this portal next round (Greek, Norse, Egyptian, Christian, ...).
// The ring is deliberately a full circle, distinct from the seven
// standing-stone arches: it is the doorway you came down through, and
// the way back up. Walking through it does nothing in this round — the
// menu comes later.
function DescentPortal() {
  const stone = useMemo(() => stoneSurface('hades'), []);
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
      {/* ground ring of dark stones + the glowing crack it stands in */}
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
      {/* the ring itself: a full standing stone circle, facing south
          toward the player who just came down */}
      <mesh position={[0, 4.5, 0]}>
        <torusGeometry args={[DESCENT_PORTAL.radius, 0.7, 12, 32]} />
        <meshStandardMaterial {...stone} color={STONE} roughness={0.9} />
      </mesh>
      {/* the doorway: violet-blue disc + bright core, round and deeper
          than the arch portals */}
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
          Short name only — the long clause overflowed the viewport
          sideways at this distance; every other label is a short name. */}
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
// 14, riding at the flame. Blue is the same discipline, cool tone.
// The flicker is Earth 2's (components/earth2/Earth2World.jsx, "Fire
// flicker", 2026-11-03): every 3rd frame each lit flame breathes,
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

// --- Medusa's lair: procedural CGI --------------------------------------
//
// MEDUSA'S LAIR (Merlin, 2026-11-15): the whole chamber is
// procedural CGI in the planet/sports standard — seeded textures,
// atmosphere, lighting — no Tripo, no paid assets. A marked disc
// in the southwest, not a walled room: the walker can always step
// back out. One extra real point light lives here (green, above
// Medusa) — the scene's light budget goes 12 → 13; everything
// else in the chamber is emissive only.
//
// MOVEMENT (Merlin, 2026-11-15): everyone moving in the lair
// uses the Middle-earth avatar movement system — heroMotionPose
// step rhythm + heroPhaseRate, foot-in-front-of-the-other, no
// sideways shuffle. The walker gets it in the CameraRig (ME
// speeds 10/18 inside the disc); foes get it in FoeFigures;
// Medusa glides her patrol on the same rhythm (her serpent
// lower half has no leg swing — the ME system has no serpent
// gait, so her whole-body bob/sway/roll/twist IS the walk, at
// her slow 1.5 m/s glide; flagged honestly in the build report).
// Statues are stone: they never move.

const LAIR_GREEN = '#3dff7a';
const LAIR_DARK = '#0a1f12';

function lairFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  const rand = mulberry32(7102);
  g.fillStyle = '#0b120c';
  g.fillRect(0, 0, 512, 512);
  // Snake-scale arcs, seeded — the floor reads as scales underfoot.
  for (let i = 0; i < 900; i += 1) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 4 + rand() * 9;
    g.strokeStyle = `rgba(61, 255, 122, ${0.04 + rand() * 0.10})`;
    g.lineWidth = 1 + rand();
    g.beginPath();
    g.arc(x, y, r, rand() * Math.PI, rand() * Math.PI + Math.PI * 0.8);
    g.stroke();
  }
  // Faint green veins.
  g.strokeStyle = 'rgba(61, 255, 122, 0.16)';
  g.shadowColor = LAIR_GREEN;
  g.shadowBlur = 6;
  for (let i = 0; i < 12; i += 1) {
    let x = rand() * 512;
    let y = rand() * 512;
    g.lineWidth = 1 + rand() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s += 1) {
      x += (rand() - 0.5) * 140;
      y += (rand() - 0.5) * 140;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- CGI creature textures (Nov 28, 2026 — CGI character swap) -----
// Seeded canvas textures in the lairFloorTexture / stoneSurface
// idiom: no external assets, no new lights. All four paint on a
// neutral base where noted so the material `color` tints them.

function brindleFurTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(1337);
  g.fillStyle = '#1a1512';
  g.fillRect(0, 0, 256, 256);
  // Brindle: wavy dark-brown / black streaks along the coat.
  for (let i = 0; i < 260; i += 1) {
    const x = rand() * 256;
    const y = rand() * 256;
    const len = 12 + rand() * 34;
    g.strokeStyle = rand() < 0.5
      ? `rgba(58, 38, 22, ${0.25 + rand() * 0.4})`
      : `rgba(8, 6, 5, ${0.25 + rand() * 0.4})`;
    g.lineWidth = 1 + rand() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + (rand() - 0.5) * 10, y + len * 0.33, x + (rand() - 0.5) * 10, y + len * 0.66, x + (rand() - 0.5) * 8, y + len);
    g.stroke();
  }
  // Coarse guard-hair speckle.
  for (let i = 0; i < 900; i += 1) {
    g.fillStyle = `rgba(120, 90, 60, ${0.05 + rand() * 0.16})`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function medusaScaleTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(7102);
  g.fillStyle = '#123524';
  g.fillRect(0, 0, 256, 256);
  // Overlapping scale arcs, seeded — the lair floor's own motif.
  for (let i = 0; i < 700; i += 1) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 4 + rand() * 8;
    g.strokeStyle = `rgba(61, 255, 122, ${0.08 + rand() * 0.18})`;
    g.lineWidth = 1 + rand();
    g.beginPath();
    g.arc(x, y, r, rand() * Math.PI, rand() * Math.PI + Math.PI * 0.8);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Neutral-grey woven cloth: the material `color` carries the hue
// (Medusa's dark-green robe, each foe's peer colour).
function clothTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = '#b8b8bc';
  g.fillRect(0, 0, 128, 128);
  // Vertical drape folds.
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * 128;
    const w = 2 + rand() * 4;
    g.fillStyle = `rgba(60,60,70,${0.08 + rand() * 0.14})`;
    g.fillRect(x - w, 0, w * 2, 128);
  }
  // Weave threads.
  g.strokeStyle = 'rgba(70,70,80,0.12)';
  g.lineWidth = 1;
  for (let y = 0; y < 128; y += 4) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function statueStoneTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const rand = mulberry32(5150);
  g.fillStyle = '#8a8a92';
  g.fillRect(0, 0, 128, 128);
  // Stone speckle.
  for (let i = 0; i < 800; i += 1) {
    g.fillStyle = rand() < 0.5
      ? `rgba(40,40,48,${0.06 + rand() * 0.2})`
      : `rgba(200,200,210,${0.05 + rand() * 0.14})`;
    g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Hairline cracks.
  g.strokeStyle = 'rgba(30,30,36,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    let x = rand() * 128;
    let y = rand() * 128;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k += 1) {
      x += (rand() - 0.5) * 40;
      y += (rand() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const medusaLabelStyle = {
  ...regionLabelStyle,
  fontSize: 13,
  fontWeight: 700,
  color: '#d1fae0',
  background: 'rgba(6, 30, 16, 0.82)',
  border: '1px solid rgba(61, 255, 122, 0.6)',
};

const statueLabelStyle = {
  ...regionLabelStyle,
  fontSize: 12,
  fontWeight: 600,
  color: '#e7e5e4',
  background: 'rgba(20, 20, 24, 0.85)',
  border: '1px solid rgba(231, 229, 228, 0.4)',
};

// One snake's pivot: three shrinking segments + a cone tip, along
// local +Y. The render loop turns the pivot from the snake's own
// agent pose (snakePoseFor via headSnakesPose) — never in lockstep.
function SnakeSegments({ size }) {
  // CGI snake: the same three shrinking segments + tip, now scale-
  // textured with a real head (eyes) on the middle segment. The
  // pivot/pose code path is untouched — SnakeHair still turns each
  // pivot from headSnakesPose per snake.
  const scaleTex = useMemo(() => medusaScaleTexture(), []);
  return (
    <group>
      <mesh position={[0, 0.14 * size, 0]}>
        <sphereGeometry args={[0.11 * size, 8, 8]} />
        <meshStandardMaterial map={scaleTex} color="#ffffff" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3 * size, 0]}>
        <sphereGeometry args={[0.085 * size, 8, 8]} />
        <meshStandardMaterial map={scaleTex} color="#ffffff" roughness={0.7} />
      </mesh>
      {/* snake head: eyes on the +Z face, forked tongue tip */}
      <mesh position={[-0.035 * size, 0.32 * size, 0.07 * size]}>
        <sphereGeometry args={[0.018 * size, 6, 6]} />
        <meshBasicMaterial color={LAIR_GREEN} />
      </mesh>
      <mesh position={[0.035 * size, 0.32 * size, 0.07 * size]}>
        <sphereGeometry args={[0.018 * size, 6, 6]} />
        <meshBasicMaterial color={LAIR_GREEN} />
      </mesh>
      <mesh position={[0, 0.44 * size, 0]}>
        <coneGeometry args={[0.06 * size, 0.2 * size, 8]} />
        <meshStandardMaterial color="#3dff7a" roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * A head of snakes, agent-driven: each snake's pivot is turned by
 * its OWN motion agent (headSnakesPose — pure function of snake
 * index + device clock + head state), so one coils while another
 * sways, another strikes, another rests. Used by Medusa herself
 * and by the held head alike. `state` is the head state
 * ('idle' | 'aiming' | 'firing' | 'sheathed').
 */
function SnakeHair({ count = MEDUSA_SNAKE_COUNT, size = 1, state = 'idle', reduced = false }) {
  const pivots = useRef([]);
  useFrame(() => {
    if (reduced) return;
    const pose = headSnakesPose({ count, nowMs: Date.now(), state });
    for (let i = 0; i < count; i += 1) {
      const p = pivots.current[i];
      if (!p) continue;
      const sp = pose.snakes[i];
      const baseYaw = (i / count) * Math.PI * 2;
      p.rotation.set(-0.9 + sp.pitch, baseYaw + sp.yaw, 0);
      p.scale.setScalar(1 + sp.strike * 0.3 + sp.coil * 0.1);
    }
  });
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => { pivots.current[i] = g; }}>
          <SnakeSegments size={size} />
        </group>
      ))}
    </group>
  );
}

function MedusaLair({ reduced }) {
  const stone = useMemo(() => stoneSurface('hades'), []);
  const tex = useMemo(() => lairFloorTexture(), []);
  const gateYaw = Math.atan2(
    MEDUSA_LAIR.x - MEDUSA_LAIR.gate.x,
    MEDUSA_LAIR.z - MEDUSA_LAIR.gate.z,
  );
  const pillars = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    pillars.push({ x: MEDUSA_LAIR.x + Math.cos(a) * 34, z: MEDUSA_LAIR.z + Math.sin(a) * 34, key: i });
  }
  return (
    <group>
      {/* chamber floor — seeded scale texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MEDUSA_LAIR.x, 0.06, MEDUSA_LAIR.z]}>
        <circleGeometry args={[MEDUSA_LAIR.r, 48]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive={LAIR_GREEN} emissiveIntensity={0.35} color="#ffffff" roughness={1} />
      </mesh>
      {/* the snake pit: a glowing green disc at the chamber's heart */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MEDUSA_POS.x, 0.1, MEDUSA_POS.z]}>
        <circleGeometry args={[7, 32]} />
        <meshBasicMaterial color={LAIR_GREEN} transparent opacity={0.14} />
      </mesh>
      {/* pillar ring */}
      {pillars.map((p) => (
        <mesh key={p.key} position={[p.x, 4, p.z]}>
          <cylinderGeometry args={[0.9, 1.2, 8, 8]} />
          <meshStandardMaterial {...stone} color="#101a12" roughness={0.9} />
        </mesh>
      ))}
      {/* green braziers — emissive only, no lights (the budget) */}
      {pillars.filter((p) => p.key % 2 === 0).map((p) => (
        <group key={`b-${p.key}`} position={[p.x, 8.4, p.z]}>
          <mesh>
            <coneGeometry args={[0.4, 0.9, 8]} />
            <meshBasicMaterial color={LAIR_GREEN} transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      {/* entrance gate on the rim, facing the palace approach */}
      <group position={[MEDUSA_LAIR.gate.x, 0, MEDUSA_LAIR.gate.z]} rotation={[0, gateYaw, 0]}>
        {[-3.5, 3.5].map((x) => (
          <mesh key={x} position={[x, 4.5, 0]}>
            <boxGeometry args={[1.4, 9, 1.4]} />
            <meshStandardMaterial {...stone} color="#101a12" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 9.4, 0]}>
          <boxGeometry args={[9.4, 1.2, 1.4]} />
          <meshStandardMaterial {...stone} color="#101a12" roughness={0.9} />
        </mesh>
        <mesh position={[0, 8.6, 0]}>
          <boxGeometry args={[7, 0.4, 0.4]} />
          <meshBasicMaterial color={LAIR_GREEN} />
        </mesh>
        {/* The gate name stays a constant screen size: drei's Html
            with distanceFactor scales the label by 1/distance, so
            walking up to the gate blew it up to fill the screen
            (Merlin's first run, Nov 15 ~04:18). No distanceFactor
            here — the label reads the same from any range. */}
        <Html center position={[0, 11.4, 0]} zIndexRange={[20, 0]} style={medusaLabelStyle}>
          🐍 Medusa&apos;s Lair
        </Html>
      </group>
      {/* The lair's region name: same constant-size rule. */}
      <Html center position={[MEDUSA_LAIR.x, 10, MEDUSA_LAIR.z]} zIndexRange={[20, 0]} style={regionLabelStyle}>
        Medusa&apos;s Lair
      </Html>
    </group>
  );
}

/**
 * Medusa's head, shared: the full-size boss wears it at [0, 3.1, 0]
 * in MedusaFigure, and the held HeadViewModel reuses it at 0.55
 * scale (rotated PI so the face points forward, -Z local). A real
 * face — brow, nose, mouth, green eyes — under agent-driven snakes.
 */
function MedusaHead({ state = 'idle', reduced = false }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.45, 16, 12]} />
        <meshStandardMaterial color="#d8cfc0" roughness={0.75} />
      </mesh>
      {/* brow ridge */}
      <mesh position={[0, 0.2, 0.4]} scale={[1.4, 0.35, 0.5]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color="#c9bda8" roughness={0.8} />
      </mesh>
      {/* nose */}
      <mesh position={[0, 0, 0.44]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.22, 8]} />
        <meshStandardMaterial color="#c9bda8" roughness={0.8} />
      </mesh>
      {/* mouth */}
      <mesh position={[0, -0.16, 0.42]}>
        <boxGeometry args={[0.2, 0.03, 0.03]} />
        <meshBasicMaterial color="#7a2a33" />
      </mesh>
      <mesh position={[-0.16, 0.08, 0.4]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={LAIR_GREEN} />
      </mesh>
      <mesh position={[0.16, 0.08, 0.4]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={LAIR_GREEN} />
      </mesh>
      <group position={[0, 0.32, 0]}>
        <SnakeHair size={1} state={state} reduced={reduced} />
      </group>
    </group>
  );
}

/**
 * Medusa herself: robed figure with a serpent coil for a lower
 * half, agent-driven snake hair, and a green gaze telegraph that
 * tracks the walker inside 30 m. She patrols a slow circle
 * (1.5 m/s) on the Middle-earth step rhythm — the glide IS the
 * walk, bob/sway/roll/twist at her speed. When dead she stands
 * headless where she fell until she reforms; the page owns the
 * boss clock, the scene only renders it. Her gaze is a telegraph
 * ONLY: she does not petrify the player (no player-petrify law
 * exists — Merlin's call if he wants one).
 */
function MedusaFigure({ boss, playerRef, onMedusaMove, reduced }) {
  const scaleTex = useMemo(() => medusaScaleTexture(), []);
  const robeTex = useMemo(() => clothTexture(7103), []);
  const groupRef = useRef();
  const telegraphRef = useRef();
  const patrolRef = useRef({ angle: 0, phase: 0, x: MEDUSA_POS.x, z: MEDUSA_POS.z });
  const MEDUSA_GLIDE_MPS = 1.5;
  const MEDUSA_PATROL_R = 6;

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = groupRef.current;
    if (!g || !boss) return;
    const p = patrolRef.current;
    if (boss.state === 'alive' && !reduced) {
      p.angle += (MEDUSA_GLIDE_MPS / MEDUSA_PATROL_R) * dt;
      p.phase += heroPhaseRate(MEDUSA_GLIDE_MPS) * dt;
      p.x = MEDUSA_POS.x + Math.cos(p.angle) * MEDUSA_PATROL_R;
      p.z = MEDUSA_POS.z + Math.sin(p.angle) * MEDUSA_PATROL_R;
    }
    const pose = boss.state === 'alive'
      ? heroMotionPose({ speed: MEDUSA_GLIDE_MPS, phase: p.phase })
      : { bobY: 0, leanX: 0, twistY: 0, rollZ: 0, swayX: 0, stepZ: 0 };
    g.position.set(p.x + pose.swayX, pose.bobY, p.z + pose.stepZ);
    // Face along the patrol tangent while alive; face the walker when dead.
    const pl = playerRef.current;
    const dx = boss.state === 'alive'
      ? -Math.sin(p.angle)
      : pl.x - p.x;
    const dz = boss.state === 'alive'
      ? Math.cos(p.angle)
      : pl.z - p.z;
    g.rotation.set(pose.leanX, Math.atan2(dx, dz) + pose.twistY, pose.rollZ);
    if (typeof onMedusaMove === 'function') onMedusaMove({ x: p.x, z: p.z });
    // Gaze telegraph: a green cone tracking the walker inside 30 m.
    const tel = telegraphRef.current;
    if (tel) {
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      const show = boss.state === 'alive' && d < 30 && !reduced;
      tel.visible = show;
      if (show) {
        tel.rotation.y = Math.atan2(pl.x - p.x, pl.z - p.z);
        const pulse = 0.18 + 0.12 * Math.sin(state.clock.elapsedTime * 3);
        tel.children.forEach((m) => {
          if (m.material) m.material.opacity = pulse;
        });
      }
    }
  });

  const alive = boss && boss.state === 'alive';
  // Snake state follows the boss: alive + walker near = aiming,
  // alive otherwise idle, dead = sheathed (snakes go limp).
  const pl = playerRef.current;
  const near = pl && Math.hypot(pl.x - patrolRef.current.x, pl.z - patrolRef.current.z) < 30;
  const snakeState = !alive ? 'sheathed' : near ? 'aiming' : 'idle';

  return (
    <group ref={groupRef} position={[MEDUSA_POS.x, 0, MEDUSA_POS.z]}>
      {/* the one real lair light: green, above Medusa */}
      <pointLight position={[0, 7, 0]} color={LAIR_GREEN} intensity={20} distance={30} />
      {/* serpent coil — her lower half, scale-textured */}
      <mesh position={[0, 0.4, 0]}>
        <torusGeometry args={[1.2, 0.4, 10, 24]} />
        <meshStandardMaterial map={scaleTex} color="#ffffff" roughness={0.8} />
      </mesh>
      <mesh position={[0.9, 0.3, 0.6]} rotation={[0.4, 0, -0.6]}>
        <coneGeometry args={[0.32, 1.6, 8]} />
        <meshStandardMaterial map={scaleTex} color="#ffffff" roughness={0.8} />
      </mesh>
      {/* robe — woven cloth, dark green */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.55, 1.15, 2.4, 10]} />
        <meshStandardMaterial map={robeTex} color="#0d1f14" roughness={0.85} />
      </mesh>
      {/* arms, reaching, with hands */}
      {[-0.7, 0.7].map((x) => (
        <group key={x}>
          <mesh position={[x, 2.2, 0.5]} rotation={[0.9, 0, x > 0 ? -0.2 : 0.2]}>
            <cylinderGeometry args={[0.12, 0.14, 1.2, 8]} />
            <meshStandardMaterial color="#d8cfc0" roughness={0.8} />
          </mesh>
          <mesh position={[x, 2.58, 0.98]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#d8cfc0" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* head — gone when beheaded */}
      {alive && (
        <group position={[0, 3.1, 0]}>
          <MedusaHead state={snakeState} reduced={reduced} />
        </group>
      )}
      {/* gaze telegraph: green cone toward the walker, visual only */}
      <group ref={telegraphRef} visible={false}>
        <mesh position={[0, 3, 6]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[2.2, 12, 16, 1, true]} />
          <meshBasicMaterial color={LAIR_GREEN} transparent opacity={0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      {/* Her name tag: constant screen size, like the gate — with
          distanceFactor it filled the whole screen at close range
          (Merlin's first run, Nov 15 ~04:18). */}
      <Html center position={[0, 4.6, 0]} zIndexRange={[20, 0]} style={medusaLabelStyle}>
        {alive ? '🐍 Medusa' : 'Medusa reforms…'}
      </Html>
    </group>
  );
}

/**
 * The held head — a first-person viewmodel, not a camera child:
 * it follows the walker's own position/yaw (playerRef), so it
 * rides 0.8 m ahead of the camera, lower-right at rest, rising
 * to centre when aiming, with a green gaze flash on firing.
 * It exists only in this client — peers never see it.
 */
function HeadViewModel({ headState, firingAtMs, playerRef, reduced }) {
  const groupRef = useRef();
  const flashRef = useRef();
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const p = playerRef.current;
    const aiming = headState === 'aiming' || headState === 'firing';
    const fw = forward(p.yaw);
    const rt = right(p.yaw);
    const dist = aiming ? 0.85 : 0.8;
    const side = aiming ? 0 : 0.38;
    g.position.set(
      p.x + fw.x * dist + rt.x * side,
      2.4 + (aiming ? -0.18 : -0.36),
      p.z + fw.z * dist + rt.z * side,
    );
    g.rotation.set(aiming ? -0.28 : 0.18, p.yaw, aiming ? 0 : 0.14);
    const flash = flashRef.current;
    if (flash) {
      const age = Date.now() - (firingAtMs || 0);
      const env = headState === 'firing' && age >= 0 && age < 600
        ? 1 - age / 600
        : 0;
      flash.visible = env > 0;
      if (env > 0) flash.material.opacity = env * 0.5;
    }
  });
  return (
    <group ref={groupRef}>
      {/* the head itself: Medusa's head at 0.55 scale, turned PI so
          the face points forward (-Z local, where the gaze flash goes) */}
      <group rotation={[0, Math.PI, 0]} scale={0.55}>
        <MedusaHead state={headState === 'sheathed' ? 'sheathed' : headState} reduced={reduced} />
      </group>
      {/* gaze flash cone, forward (-Z local) on firing */}
      <mesh ref={flashRef} visible={false} position={[0, 0, -4]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.6, 8, 16, 1, true]} />
        <meshBasicMaterial color={LAIR_GREEN} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * THE FLAMING CHAIN effect (Merlin, 2026-11-15): the chain extends
 * from the walker to the target, coils around them, and the target
 * bursts into flames and burns to ash. CGI only — torus links,
 * emissive flame, falling ash. No real point light (the mobile
 * light budget is already at 13); the burst is additive emissive,
 * which reads as fire without one. The effect runs ~2 s from
 * chainFx.atMs, then hides itself. One chain per target:
 * chainFx.targets is the throw's victim list (1 at level 0, 5 at
 * level 4); a lone `to` is the level-0 shape, kept for back-compat.
 */
function ChainFx({ chainFx, reduced }) {
  const groupRef = useRef();
  const burstGroupRef = useRef();
  const ashRef = useRef();
  const layout = useMemo(() => {
    if (!chainFx || !chainFx.from || (!chainFx.to && !(chainFx.targets && chainFx.targets.length > 0))) return null;
    const { from } = chainFx;
    const tos = (Array.isArray(chainFx.targets) && chainFx.targets.length > 0)
      ? chainFx.targets
      : [chainFx.to];
    const links = [];
    for (const to of tos) {
      // Six links along the line, then three coiled around the target.
      for (let i = 0; i < 6; i += 1) {
        const t = (i + 0.5) / 6;
        links.push({
          x: from.x + (to.x - from.x) * t,
          y: 1.6 + Math.sin(t * Math.PI) * 0.4,
          z: from.z + (to.z - from.z) * t,
          rot: i % 2 === 0 ? 0 : Math.PI / 2,
        });
      }
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        links.push({
          x: to.x + Math.cos(a) * 0.8,
          y: 0.7 + i * 0.55,
          z: to.z + Math.sin(a) * 0.8,
          rot: a,
        });
      }
    }
    const rand = mulberry32(4242);
    const ash = [];
    for (const to of tos) {
      for (let i = 0; i < (reduced ? 5 : 10); i += 1) {
        ash.push({ x: to.x + (rand() - 0.5) * 1.6, z: to.z + (rand() - 0.5) * 1.6, fall: 0.8 + rand() * 1.2 });
      }
    }
    return { links, ash, tos };
  }, [chainFx, reduced]);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!layout) { g.visible = false; return; }
    const age = Date.now() - (chainFx.atMs || 0);
    if (age < 0 || age > 2000) { g.visible = false; return; }
    g.visible = true;
    const burstGroup = burstGroupRef.current;
    if (burstGroup) {
      const t = Math.min(1, age / 600);
      const s = 0.5 + t * 1.7;
      burstGroup.children.forEach((burst) => {
        burst.scale.set(s, s, s);
        burst.visible = age < 1200;
        burst.material.opacity = age < 1200 ? 0.9 * (1 - age / 1200) : 0;
      });
    }
    const ash = ashRef.current;
    if (ash) {
      ash.visible = age > 400;
      ash.children.forEach((m, i) => {
        const a = layout.ash[i % layout.ash.length];
        const fall = Math.max(0, (age - 400) / 1000) * a.fall;
        m.position.set(a.x, Math.max(0.05, 1.8 - fall), a.z);
        m.material.opacity = Math.max(0, 0.85 - (age - 400) / 1600);
      });
    }
  });
  if (!layout) return null;
  return (
    <group ref={groupRef} visible={false}>
      {/* the chain: glowing links, line then coil — one chain per target */}
      {layout.links.map((l, i) => (
        <mesh key={i} position={[l.x, l.y, l.z]} rotation={[0, l.rot, 0]}>
          <torusGeometry args={[0.16, 0.05, 8, 12]} />
          <meshBasicMaterial color="#ff6a1a" />
        </mesh>
      ))}
      {/* the flame bursts, one per target */}
      <group ref={burstGroupRef}>
        {layout.tos.map((t, i) => (
          <mesh key={i} position={[t.x, 1.2, t.z]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {/* ash falling where each target stood */}
      <group ref={ashRef}>
        {layout.ash.map((a, i) => (
          <mesh key={i} position={[a.x, 1.8, a.z]}>
            <sphereGeometry args={[0.07, 6, 6]} />
            <meshBasicMaterial color="#3a3230" transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Other users in Hades (presence sector 'hades'): each renders
 * as a small robed figure in their peer colour, walking on the
 * Middle-earth step rhythm — phase advanced from their real
 * travel speed, so feet move foot-in-front-of-the-other and
 * never shuffle sideways. No figure for the local user.
 */
function FoeFigures({ foes, reduced }) {
  const cloth = useMemo(() => clothTexture(9101), []);
  const states = useRef(new Map());
  const groups = useRef(new Map());
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    for (const f of foes || []) {
      const g = groups.current.get(f.id);
      if (!g) continue;
      let st = states.current.get(f.id);
      if (!st) {
        st = { x: f.x, z: f.z, phase: 0 };
        states.current.set(f.id, st);
      }
      const moved = Math.hypot(f.x - st.x, f.z - st.z);
      const speed = dt > 0 ? Math.min(20, moved / dt) : 0;
      st.x = f.x;
      st.z = f.z;
      if (!reduced) st.phase += heroPhaseRate(speed) * dt;
      const pose = heroMotionPose({ speed, phase: st.phase });
      g.position.set(f.x + pose.swayX, pose.bobY, f.z + pose.stepZ);
      g.rotation.set(pose.leanX, (f.yaw || 0) + pose.twistY, pose.rollZ);
    }
  });
  return (
    <group>
      {(foes || []).map((f) => (
        <group
          key={f.id}
          ref={(g) => {
            if (g) groups.current.set(f.id, g);
            else groups.current.delete(f.id);
          }}
          position={[f.x, 0, f.z]}
        >
          {/* robe in the peer's colour, woven cloth */}
          <mesh position={[0, 1.1, 0]}>
            <coneGeometry args={[0.5, 2.2, 8]} />
            <meshStandardMaterial map={cloth} color={f.color || '#22d3ee'} transparent opacity={0.85} roughness={0.8} />
          </mesh>
          {/* shoulders */}
          <mesh position={[0, 2.05, 0]} scale={[1.2, 0.55, 0.95]}>
            <sphereGeometry args={[0.34, 12, 10]} />
            <meshStandardMaterial map={cloth} color={f.color || '#22d3ee'} transparent opacity={0.85} roughness={0.8} />
          </mesh>
          {/* head + hood */}
          <mesh position={[0, 2.45, 0]}>
            <sphereGeometry args={[0.32, 12, 10]} />
            <meshStandardMaterial color="#e8e8ee" transparent opacity={0.85} roughness={0.7} />
          </mesh>
          <mesh position={[0, 2.62, 0]}>
            <coneGeometry args={[0.36, 0.55, 10]} />
            <meshStandardMaterial map={cloth} color={f.color || '#22d3ee'} transparent opacity={0.85} roughness={0.8} />
          </mesh>
          {/* Constant screen size — the same rule as the lair
              labels: a foe's name never blows up at close range. */}
          <Html center position={[0, 3.2, 0]} zIndexRange={[20, 0]} style={regionLabelStyle}>
            {f.label || 'Traveller'}
          </Html>
        </group>
      ))}
    </group>
  );
}

// Statues are stone: they never move, never animate. A solid
// monument with the victim's name, who turned them, and when.
function Statues({ statues }) {
  const stone = useMemo(() => stoneSurface('hades'), []);
  const stoneTex = useMemo(() => statueStoneTexture(), []);
  return (
    <group>
      {(statues || []).map((s) => (
        <group key={s.id} position={[s.x, 0, s.z]}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[1.6, 0.5, 1.6]} />
            <meshStandardMaterial {...stone} color="#3a3a42" roughness={1} />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <coneGeometry args={[0.55, 2.4, 8]} />
            <meshStandardMaterial map={stoneTex} color="#8a8a92" roughness={0.95} />
          </mesh>
          <mesh position={[0, 2.9, 0]}>
            <sphereGeometry args={[0.34, 12, 10]} />
            <meshStandardMaterial map={stoneTex} color="#8a8a92" roughness={0.95} />
          </mesh>
          {/* Constant screen size, capped width: a statue's story
              is the longest label in the lair, and with
              distanceFactor it filled the screen up close. It wraps
              at 220 px now instead of running off the phone. */}
          <Html center position={[0, 3.8, 0]} zIndexRange={[20, 0]} style={{ ...statueLabelStyle, whiteSpace: 'normal', maxWidth: 220, textAlign: 'center' }}>
            🗿 {s.victim_name} — turned to stone by {s.petrifier_name}
            {s.interim ? ' · standing on this device until the server list is live' : ''}
          </Html>
        </group>
      ))}
    </group>
  );
}

// --- first-person camera rig -------------------------------------------------

export function CameraRig({playerRef, inputRef, onPortal, onLava, lavaPools, onRegion, reduced, statues, onAntiLife, onFloorDrop}) {
  const { camera } = useThree();
  const lastTravelRef = useRef(0);
  const travelingRef = useRef(false);
  const lastAntiLifeRef = useRef(0);
  const antiLifeTravelingRef = useRef(false);
  const floorDropGuardRef = useRef(createFloorDropGuard());
  const lastLavaRef = useRef(0);
  const lavaTravelingRef = useRef(false);
  const lastRegionRef = useRef('');
  // ME step-rhythm phase for the lair walk (heroMotionPose).
  const walkPhaseRef = useRef(0);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const player = playerRef.current;
    const input = inputRef.current;

    // Look: accumulated drag deltas from mouse / touch.
    if (input.lookDx) {
      player.yaw -= input.lookDx * 0.005;
      input.lookDx = 0;
    }

    // Move: keyboard or touch stick. INSIDE the lair disc the
    // walker moves on the Middle-earth system (Merlin, 2026-11-15):
    // ME foot speeds (walk 10 / sprint 18) and the heroMotionPose
    // step rhythm on the camera, foot-in-front-of-the-other.
    // Outside the disc Hades keeps its own 8/14 and flat camera.
    const inLair = Math.hypot(player.x - MEDUSA_LAIR.x, player.z - MEDUSA_LAIR.z) < MEDUSA_LAIR.r;
    let speed = 0;
    let f = input.fwd;
    let s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 0.01) {
      if (len > 1) { f /= len; s /= len; }
      speed = input.run
        ? (inLair ? LAIR_RUN_MPS : RUN_SPEED)
        : (inLair ? LAIR_WALK_MPS : WALK_SPEED);
      const fw = forward(player.yaw);
      const rt = right(player.yaw);
      const dx = (fw.x * f + rt.x * s) * speed * dt;
      const dz = (fw.z * f + rt.z * s) * speed * dt;
      const next = stepPosition(player.x, player.z, dx, dz);
      // Statues are solid monuments: never step inside one.
      if (!blockedByStatue(next.x, next.z, statues)) {
        player.x = next.x;
        player.z = next.z;
      }
    }

    // The ME step rhythm, on the camera, only inside the lair:
    // bob + lean + roll from heroMotionPose, phase advanced by
    // heroPhaseRate at the real travel speed. Standing still (or
    // outside the lair) reads flat — the pose is all zeros there.
    let camY = 2.4;
    let camLeanX = 0;
    let camRollZ = 0;
    if (inLair && !reduced && speed > 0.5) {
      walkPhaseRef.current += heroPhaseRate(speed) * dt;
      const pose = heroMotionPose({ speed, phase: walkPhaseRef.current });
      camY += pose.bobY;
      camLeanX = pose.leanX * 0.3;
      camRollZ = pose.rollZ;
    }
    camera.position.set(player.x, camY, player.z);
    camera.rotation.set(camLeanX, player.yaw, camRollZ);

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

    // Stepping into a lava pool drops the walker into the World
    // Engine (Merlin, 2026-11-13) — the same once-per-entry guard
    // as the arches, so standing in the lava re-fires the drop
    // only after stepping back out. The drop rides the same vortex
    // travel; the tube is the fall.
    const pool = lavaPools ? nearestLavaPool(player.x, player.z, lavaPools) : null;
    if (pool) {
      if (!lavaTravelingRef.current && now - lastLavaRef.current > 1500) {
        lavaTravelingRef.current = true;
        lastLavaRef.current = now;
        onLava(pool);
      }
    } else {
      lavaTravelingRef.current = false;
    }
  });

  return null;
}

// --- the whole scene ---------------------------------------------------------

export function NetherRealmScene({playerRef, inputRef, onPortal, onLava, onRegion, reduced, medusa, statues, foes, headHeld, headState, firingAtMs, chainFx, onMedusaMove, onAntiLife, onFloorDrop}) {
  const world = useMemo(() => makeWorld(1337), []);

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
    if (Math.hypot(x - PALACE.x, z - PALACE.z) < 45) return false;
    if (Math.hypot(x - DESCENT_PORTAL.x, z - DESCENT_PORTAL.z) < 16) return false;
    if (PORTALS.some((portal) => Math.hypot(x - portal.x, z - portal.z) < 10)) return false;
    if (world.lavaPools.some((pool) => Math.hypot(x - pool.x, z - pool.z) < pool.r + 3)) return false;
    return true;
  };
  return (
    <>
      <DayNightRig sun moon followRef={playerRef}
        shade={NETHER_REALM_SHADE.hades}
        storm={{
          hue: 'red',
          bounds: { xMin: -300, xMax: 300, zMin: -300, zMax: 300 },
          isOpenGround,
          realm: 'hades',
          seed: 7101,
        }}
      />
      <RealmSkyDome realmKey="hades" followRef={playerRef} />
      <Ground playerRef={playerRef} />
      <LavaPools pools={world.lavaPools} reduced={reduced} />
      <River reduced={reduced} />
      <Bridge />
      <Gates />
      <Cerberus />
      <Palace />
      <Asphodel stones={world.asphodelStones} shades={world.shades} reduced={reduced} />
      <Elysium pillars={world.elysiumPillars}  shades={world.shades}/>
      <Tartarus pits={world.tartarusPits} shades={world.shades} reduced={reduced} />
      <PortalArches />
      <AntiLifePortalDisc />
      <FloorDropDisc side="nether" reduced={reduced} />
      <DescentPortal />
      <Torches reduced={reduced} />
      <Embers reduced={reduced} />
      {/* Medusa's lair: chamber, boss, foes, statues, held head */}
      <MedusaLair reduced={reduced} />
      {medusa && (
        <MedusaFigure boss={medusa} playerRef={playerRef} onMedusaMove={onMedusaMove} reduced={reduced} />
      )}
      <FoeFigures foes={foes} reduced={reduced} />
      <Statues statues={statues} />
      {headHeld && (
        <HeadViewModel headState={headState || 'idle'} firingAtMs={firingAtMs} playerRef={playerRef} reduced={reduced} />
      )}
      <ChainFx chainFx={chainFx} reduced={reduced} />
      <CameraRig
        playerRef={playerRef}
        inputRef={inputRef}
        onPortal={onPortal}
        onAntiLife={onAntiLife}
        onFloorDrop={onFloorDrop}
        onLava={onLava}
        lavaPools={world.lavaPools}
        onRegion={onRegion}
        reduced={reduced}
        statues={statues}
      />
    </>
  );
}
