// app/erebus/page.jsx — EREBUS: 140 explorable void universes.
//
// A pure escape space: no programs, no modules inside — just a dark void to
// get lost in for a while, flown on a TRON bike. One portal (a single,
// well-placed ring + one centered HUD button) jumps between universes.
// Two gold bars hide in every universe: one in the open, one tucked away.
// Bounce off planets and asteroids — no death, no fail state.
//
// Built on the NOVA flight model: lib/nova-flight.js math, the TronBikes
// garage, and deterministic scenes from lib/erebus-universes.js.
// Progress and the gold ledger are localStorage-only (no SQL).
//
// Honesty rules: labels say what things are; reduced motion respected;
// plain-English HUD; touch controls built in; minimal HUD — universe
// name/index, bars found, one portal button.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TRON_BIKES, bikeByKey } from '@/components/nova/TronBikes';
import TronRider from '@/components/nova/TronRider';
import { fx, unlockFx } from '@/lib/fx';
import { HermesBackdrop, HermesPanelTexture } from '@/components/hermes-ui/HermesUi';
import { RadarIcon, GridIcon, EyeIcon, PortalIcon, PinIcon } from '@/lib/hermes-icons';

// HERMES treatment: inline-flex icon+label wrapper for HUD buttons.
const HIcon = ({ children }) => (
  <span className="inline-flex items-center gap-2">{children}</span>
);
import {
  tuningFor,
  dist3,
  speedWord,
  stepFlight,
  steerToward,
} from '@/lib/nova-flight';
import {
  UNIVERSES,
  universeById,
  sceneFor,
  moonPosAt,
  obstaclesFor,
  resolveCollision,
  EREBUS_SPAWN,
  EREBUS_SPAWN_YAW,
  PORTAL,
  BARS_PER_UNIVERSE,
  BAR_COLLECT_RADIUS,
  GOLD_LIQUID_PER_BAR,
  blankProgress,
  loadProgress,
  saveProgress,
  markVisited,
  collectBar,
  barsFound,
  totalBars,
  visitedCount,
  blankLedger,
  loadLedger,
  saveLedger,
  creditBarToLedger,
} from '@/lib/erebus-universes';

const TITLE = 'EREBUS — 140 Void Universes';
const BIKE_RADIUS = 2.2;

const safeStorage = {
  getItem(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem(k, v) {
    try { localStorage.setItem(k, v); return true; } catch { return false; }
  },
};

// ---------------------------------------------------------------------------
// 3D helpers
// ---------------------------------------------------------------------------

function glowTexture(stops) {
  if (typeof document === 'undefined') return null;
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function TintedStars({ seed, count, radius, palette, size }) {
  const geom = useMemo(() => {
    // mulberry32 inlined (page-side; lib's is not imported here to keep
    // this component dependency-free).
    let a = seed >>> 0;
    const rand = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const white = new THREE.Color('#ffffff');
    const pal = palette.map((c) => new THREE.Color(c));
    const col = new THREE.Color();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = radius * (0.25 + 0.75 * Math.cbrt(rand()));
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
      positions[i * 3 + 1] = r * Math.cos(ph);
      positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      col.copy(pal[Math.floor(rand() * pal.length)]);
      if (rand() < 0.18) col.lerp(white, 0.6);
      col.multiplyScalar(0.4 + rand() * 0.5);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [seed, count, radius, palette]);

  return (
    <points geometry={geom}>
      <pointsMaterial
        size={size}
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function makePlanetTexture(texSeed, base, dark, light) {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let a = texSeed >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // Horizontal bands.
  const bands = 6 + Math.floor(rand() * 6);
  for (let i = 0; i < bands; i++) {
    const y = rand() * H;
    const h = 3 + rand() * 14;
    ctx.fillStyle = rand() < 0.5 ? dark : light;
    ctx.globalAlpha = 0.12 + rand() * 0.22;
    ctx.fillRect(0, y, W, h);
  }
  // Speckle.
  ctx.globalAlpha = 1;
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.5 ? dark : light;
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Planet({ planet, palette, reduced }) {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const base = new THREE.Color(palette[planet.colorIdx % 3]);
    const dark = base.clone().multiplyScalar(0.45).getStyle();
    const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
    return makePlanetTexture(planet.texSeed, base.getStyle(), dark, light);
  }, [planet, palette]);
  const grp = useRef(null);
  useFrame((state, dt) => {
    if (!reduced && grp.current) grp.current.rotation.y += dt * 0.02;
  });
  return (
    <group position={[planet.pos.x, planet.pos.y, planet.pos.z]}>
      <group ref={grp}>
        <mesh>
          <sphereGeometry args={[planet.radius, 40, 40]} />
          {tex ? (
            <meshStandardMaterial map={tex} roughness={0.95} metalness={0.02} />
          ) : (
            <meshStandardMaterial color={palette[planet.colorIdx % 3]} roughness={0.95} />
          )}
        </mesh>
        {planet.ringed && (
          <mesh rotation={[Math.PI / 2 - 0.35, 0, 0.4]}>
            <ringGeometry args={[planet.radius * 1.35, planet.radius * 1.95, 64]} />
            <meshBasicMaterial
              color={palette[2]}
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Moons({ scene, reduced }) {
  const refs = useRef([]);
  const list = useMemo(
    () =>
      scene.moons.map((m) => ({
        moon: m,
        planet: scene.planets.find((p) => p.key === m.planetKey),
      })),
    [scene]
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    list.forEach(({ moon, planet }, i) => {
      const mesh = refs.current[i];
      if (!mesh || !planet) return;
      const mp = moonPosAt(planet, moon, reduced ? 0 : t);
      mesh.position.set(mp.x, mp.y, mp.z);
      if (!reduced) mesh.rotation.y += 0.004;
    });
  });
  return (
    <group>
      {list.map(({ moon, planet }, i) => (
        <mesh
          key={moon.key}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={[planet.pos.x + moon.orbitR, planet.pos.y, planet.pos.z]}
        >
          <sphereGeometry args={[moon.size, 20, 20]} />
          <meshStandardMaterial color="#9aa7bd" roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function Asteroids({ scene }) {
  const { mesh, count } = useMemo(() => {
    const rocks = [];
    for (const fl of scene.fields) {
      for (const rk of fl.rocks) {
        rocks.push({
          x: fl.center.x + rk.ox,
          y: fl.center.y + rk.oy,
          z: fl.center.z + rk.oz,
          r: rk.r,
          tint: rk.tint,
          phase: rk.phase,
        });
      }
    }
    return { rocks, count: rocks.length };
  }, [scene]);
  const ref = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    const im = ref.current;
    if (!im) return;
    mesh.forEach((rk, i) => {
      dummy.position.set(rk.x, rk.y, rk.z);
      dummy.rotation.set(rk.phase, rk.phase * 1.7, rk.phase * 0.6);
      dummy.scale.setScalar(rk.r);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      col.set('#6b7280').lerp(new THREE.Color(scene.planets[0] ? '#3f3f46' : '#3f3f46'), rk.tint);
      col.multiplyScalar(0.7 + rk.tint * 0.5);
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [mesh, dummy, col, scene]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={0.95} metalness={0.05} />
    </instancedMesh>
  );
}

// A soft nebula accent: a few additive sprites, no labels — the void is quiet.
function NebulaPuff({ nebula, seed, reduced }) {
  const tex = useMemo(
    () =>
      glowTexture([
        [0, 'rgba(255,255,255,0.55)'],
        [0.4, 'rgba(255,255,255,0.16)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
    []
  );
  const puffs = useMemo(() => {
    let a = (seed >>> 0) || 1;
    const rand = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const cols = nebula.palette.map((c) => new THREE.Color(c));
    return Array.from({ length: 5 }, (_, i) => ({
      off: [
        (rand() - 0.5) * nebula.radius,
        (rand() - 0.5) * nebula.radius * 0.6,
        (rand() - 0.5) * nebula.radius,
      ],
      scale: nebula.radius * (0.9 + rand() * 0.8),
      color: `#${cols[i % cols.length].getHexString()}`,
      opacity: 0.10 + rand() * 0.08,
    }));
  }, [nebula, seed]);
  const grp = useRef(null);
  useFrame((state, dt) => {
    if (!reduced && grp.current) grp.current.rotation.y += dt * 0.008;
  });
  if (!tex) return null;
  return (
    <group position={[nebula.pos.x, nebula.pos.y, nebula.pos.z]}>
      <group ref={grp}>
        {puffs.map((p, i) => (
          <sprite key={i} position={p.off} scale={[p.scale, p.scale, 1]}>
            <spriteMaterial
              map={tex}
              color={p.color}
              transparent
              opacity={p.opacity}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}

function GoldBar({ bar, found, reduced }) {
  const grp = useRef(null);
  const glint = useRef(null);
  const beamTex = useMemo(
    () =>
      glowTexture([
        [0, 'rgba(255,215,130,0.9)'],
        [0.5, 'rgba(255,190,80,0.35)'],
        [1, 'rgba(255,180,60,0)'],
      ]),
    []
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (grp.current && !reduced) {
      grp.current.position.y = bar.pos.y + Math.sin(t * 1.4 + bar.index) * 1.2;
      grp.current.rotation.y += 0.008;
    }
    if (glint.current) {
      const s = 1 + Math.sin(t * 3 + bar.index * 2) * 0.25;
      glint.current.scale.set(14 * s, 14 * s, 1);
    }
  });
  if (found || !beamTex) return null;
  return (
    <group position={[bar.pos.x, bar.pos.y, bar.pos.z]}>
      {/* beacon beam: tall, faint — visible from far away */}
      <mesh position={[0, 60, 0]}>
        <cylinderGeometry args={[1.4, 2.2, 140, 12, 1, true]} />
        <meshBasicMaterial
          color="#ffd98a"
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <sprite ref={glint} scale={[14, 14, 1]}>
        <spriteMaterial
          map={beamTex}
          color="#ffe9b0"
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <group ref={grp}>
        <mesh rotation={[0.2, 0, 0.15]}>
          <boxGeometry args={[1.6, 0.7, 2.8]} />
          <meshStandardMaterial
            color="#d4a017"
            roughness={0.25}
            metalness={0.9}
            emissive="#8a5c00"
            emissiveIntensity={0.55}
          />
        </mesh>
      </group>
    </group>
  );
}

function PortalRing({ reduced }) {
  const ring = useRef(null);
  const swirlTex = useMemo(
    () =>
      glowTexture([
        [0, 'rgba(160,240,255,0.85)'],
        [0.55, 'rgba(80,180,255,0.3)'],
        [1, 'rgba(60,140,255,0)'],
      ]),
    []
  );
  useFrame((state) => {
    if (!reduced && ring.current) ring.current.rotation.z += 0.01;
  });
  if (!swirlTex) return null;
  return (
    <group position={[PORTAL.pos.x, PORTAL.pos.y, PORTAL.pos.z]}>
      <mesh ref={ring}>
        <torusGeometry args={[PORTAL.radius, 0.7, 16, 64]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.9} />
      </mesh>
      <sprite scale={[PORTAL.radius * 2.6, PORTAL.radius * 2.6, 1]}>
        <spriteMaterial
          map={swirlTex}
          color="#9adcff"
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <pointLight intensity={40} distance={60} color="#7dd3fc" decay={1.8} />
      <Html position={[0, PORTAL.radius + 4, 0]} center distanceFactor={110}
        style={{
          pointerEvents: 'none', whiteSpace: 'nowrap', textTransform: 'uppercase',
          letterSpacing: '0.25em', fontSize: 11, color: '#bae6fd', fontWeight: 700,
          textShadow: '0 0 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)',
        }}>
        Portal — fly in to jump
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// TRON bike flight rig: physics + chase cam + collision + collect + portal
// ---------------------------------------------------------------------------

function BikeRig({ flightRef, inputRef, bikeKey, reduced, snapCamRef, scene, foundRef, onCollect, onPortal, autopilotRef, waypoints }) {
  const group = useRef(null);
  const { camera } = useThree();
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      h: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      zero: new THREE.Vector3(0, 0, 0),
      camGoal: new THREE.Vector3(),
      look: new THREE.Vector3(),
    }),
    []
  );
  const wasBoosting = useRef(false);
  const lastBump = useRef(0);
  const portalArmed = useRef(true);

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(0.05, rawDt || 0.016);
    const t = state.clock.elapsedTime;
    const f = flightRef.current;
    const tuning = tuningFor(bikeKey);
    let input = inputRef.current;

    // Autopilot: a slow guided tour — remaining gold bars, then the portal.
    // Any user input disengages it (see TouchControls + keyboard handler).
    const ap = autopilotRef && autopilotRef.current;
    if (ap && ap.active && waypoints && waypoints.length) {
      const wp = waypoints[ap.wpIndex % waypoints.length];
      const steer = steerToward(f, wp.pos, tuning);
      if (steer.dist < wp.radius) {
        if (!ap.dwellUntil) ap.dwellUntil = t + 1.4;
        input = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: true };
        if (t >= ap.dwellUntil) { ap.dwellUntil = 0; ap.wpIndex += 1; }
      } else {
        input = {
          thrust: steer.dist > 120 ? 0.85 : 0.45,
          turn: steer.turn,
          pitch: steer.pitch,
          boost: false,
          brake: false,
        };
      }
    }

    const next = stepFlight(f, input, dt, tuning);

    // Collision: bounce, never die. Substepped so fast flight can't tunnel
    // through small rocks between frames — Merlin's standing rule: ALL
    // geometry is solid (planets, moons, asteroids), no clipping through
    // anything. The ONLY pass-through is the portal, by design.
    const obstacles = obstaclesFor(scene, t);
    const from = f.pos;
    const travel = dist3(from, next.pos);
    const substeps = Math.max(1, Math.ceil(travel / 3));
    let px = from.x;
    let py = from.y;
    let pz = from.z;
    let hitAny = false;
    for (let s = 1; s <= substeps; s++) {
      const k = s / substeps;
      const res = resolveCollision(
        {
          x: from.x + (next.pos.x - from.x) * k,
          y: from.y + (next.pos.y - from.y) * k,
          z: from.z + (next.pos.z - from.z) * k,
        },
        BIKE_RADIUS,
        obstacles
      );
      px = res.pos.x;
      py = res.pos.y;
      pz = res.pos.z;
      if (res.hit) {
        hitAny = true;
        break;
      }
    }
    next.pos = { x: px, y: py, z: pz };
    if (hitAny) {
      next.speed = Math.max(0, next.speed * 0.25);
      if (t - lastBump.current > 0.35) {
        lastBump.current = t;
        fx.tap();
      }
    }

    f.pos = next.pos;
    f.yaw = next.yaw;
    f.pitch = next.pitch;
    f.speed = next.speed;
    f.boosting = !!(input.boost && (input.thrust || 0) > 0.1);
    if (f.boosting && !wasBoosting.current) fx.boost();
    wasBoosting.current = f.boosting;

    // Gold bars: ride close to collect.
    for (let i = 0; i < BARS_PER_UNIVERSE; i++) {
      if (foundRef.current[i]) continue;
      const b = scene.bars[i];
      if (dist3(f.pos, b.pos) < BAR_COLLECT_RADIUS + BIKE_RADIUS) {
        onCollect(i);
      }
    }

    // The ONE portal: fly in to open the jump sheet.
    const pd = dist3(f.pos, PORTAL.pos);
    if (pd < PORTAL.radius && portalArmed.current) {
      portalArmed.current = false;
      onPortal();
    } else if (pd > PORTAL.radius * 2.5) {
      portalArmed.current = true; // re-arm once clear
    }

    // Orient + chase cam.
    const s = scratch;
    const h = { x: Math.sin(f.yaw) * Math.cos(f.pitch), y: Math.sin(f.pitch), z: Math.cos(f.yaw) * Math.cos(f.pitch) };
    s.h.set(h.x, h.y, h.z);
    s.m.lookAt(s.h, s.zero, s.up);
    g.position.set(f.pos.x, f.pos.y, f.pos.z);
    g.quaternion.setFromRotationMatrix(s.m);

    s.camGoal.set(f.pos.x, f.pos.y, f.pos.z).addScaledVector(s.h, -15).addScaledVector(s.up, 5.5);
    if (snapCamRef.current) {
      camera.position.copy(s.camGoal);
      snapCamRef.current = false;
    } else {
      const step = Math.min(1, Math.max(0, dt * 3.2));
      camera.position.lerp(s.camGoal, step);
    }
    s.look.set(f.pos.x, f.pos.y, f.pos.z).addScaledVector(s.h, 22);
    camera.lookAt(s.look);
  });

  const Bike = bikeByKey(bikeKey).Cmp;
  return (
    <group ref={group}>
      <Bike color={bikeByKey(bikeKey).color} />
      <TronRider bikeKey={bikeKey} reduced={reduced} />
    </group>
  );
}

function ErebusScene({ universe, scene, reduced, flightRef, inputRef, bikeKey, snapCamRef, foundBars, foundRef, onCollect, onPortal, autopilotRef, waypoints }) {
  const starCount = (n) => Math.round(n * universe.starDensity);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[60, 80, 40]} intensity={1.3} />
      <group key={universe.id}>
        <TintedStars seed={universe.seed + 1} count={starCount(1500)} radius={950} palette={[...universe.palette, '#ffffff']} size={1.5} />
        <TintedStars seed={universe.seed + 2} count={starCount(900)} radius={620} palette={universe.palette} size={2.1} />
        <TintedStars seed={universe.seed + 3} count={starCount(320)} radius={400} palette={[universe.palette[2], '#ffffff']} size={2.7} />
        {scene.nebulae.map((n, i) => (
          <NebulaPuff key={n.key} nebula={n} seed={universe.seed + 500 + i * 131} reduced={reduced} />
        ))}
        {scene.planets.map((p) => (
          <Planet key={p.key} planet={p} palette={universe.palette} reduced={reduced} />
        ))}
        <Moons scene={scene} reduced={reduced} />
        <Asteroids scene={scene} />
        {scene.bars.map((b) => (
          <GoldBar key={b.index} bar={b} found={foundBars[b.index]} reduced={reduced} />
        ))}
        <PortalRing reduced={reduced} />
      </group>
      <BikeRig
        flightRef={flightRef}
        inputRef={inputRef}
        bikeKey={bikeKey}
        reduced={reduced}
        snapCamRef={snapCamRef}
        scene={scene}
        foundRef={foundRef}
        onCollect={onCollect}
        onPortal={onPortal}
        autopilotRef={autopilotRef}
        waypoints={waypoints}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Touch controls
// ---------------------------------------------------------------------------

function TouchControls({ inputRef, autopilotRef, visible }) {
  const [nub, setNub] = useState({ x: 0, y: 0 });
  const [slide, setSlide] = useState(0);
  const leftId = useRef(null);
  const leftStart = useRef({ x: 0, y: 0 });
  const rightId = useRef(null);
  const rightStart = useRef({ y: 0 });

  if (!visible) return null;

  return (
    <>
      <div
        className="absolute left-0 bottom-0 w-1/2 h-[44%] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (autopilotRef && autopilotRef.current) autopilotRef.current.active = false;
          leftId.current = e.pointerId;
          leftStart.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== leftId.current) return;
          const dx = Math.max(-60, Math.min(60, e.clientX - leftStart.current.x));
          const dy = Math.max(-60, Math.min(60, e.clientY - leftStart.current.y));
          setNub({ x: dx, y: dy });
          inputRef.current.turn = -(dx / 60);
          inputRef.current.pitch = -(dy / 60);
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== leftId.current) return;
          leftId.current = null;
          setNub({ x: 0, y: 0 });
          inputRef.current.turn = 0;
          inputRef.current.pitch = 0;
        }}
        onPointerCancel={() => {
          leftId.current = null;
          setNub({ x: 0, y: 0 });
          inputRef.current.turn = 0;
          inputRef.current.pitch = 0;
        }}
        aria-label="Steer stick"
      >
        <div className="absolute left-8 bottom-10 w-28 h-28 rounded-full border-2 border-white/25 bg-white/5">
          <div
            className="absolute w-14 h-14 rounded-full bg-indigo-300/70 border border-indigo-100/60"
            style={{
              left: `calc(50% - 28px + ${nub.x * 0.55}px)`,
              top: `calc(50% - 28px + ${nub.y * 0.55}px)`,
            }}
          />
        </div>
        <div className="absolute left-8 bottom-40 text-[10px] uppercase tracking-[0.25em] text-white/50">
          Steer
        </div>
      </div>
      <div
        className="absolute right-0 bottom-0 w-1/2 h-[44%] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (autopilotRef && autopilotRef.current) autopilotRef.current.active = false;
          rightId.current = e.pointerId;
          rightStart.current = { y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== rightId.current) return;
          const dy = Math.max(-90, Math.min(90, e.clientY - rightStart.current.y));
          setSlide(-dy / 90);
          inputRef.current.thrust = Math.max(-1, Math.min(1, -dy / 90));
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== rightId.current) return;
          rightId.current = null;
          setSlide(0);
          inputRef.current.thrust = 0;
        }}
        onPointerCancel={() => {
          rightId.current = null;
          setSlide(0);
          inputRef.current.thrust = 0;
        }}
        aria-label="Thrust slider"
      >
        <div className="absolute right-10 bottom-10 w-16 h-40 rounded-full border-2 border-white/25 bg-white/5 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-amber-300/60"
            style={{ height: `${Math.max(0, slide) * 100}%` }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-sky-300/50"
            style={{ height: `${Math.max(0, -slide) * 100}%` }}
          />
        </div>
        <div className="absolute right-10 bottom-52 text-[10px] uppercase tracking-[0.25em] text-white/50">
          Thrust
        </div>
      </div>
    </>
  );
}

function BikePicker({ bikeKey, setBikeKey }) {
  return (
    <div className="grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Choose tron bike">
      {TRON_BIKES.map((b) => (
        <button
          key={b.key}
          role="radio"
          aria-checked={bikeKey === b.key}
          onClick={() => { setBikeKey(b.key); fx.tap(); }}
          className={`min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
            bikeKey === b.key
              ? 'border-indigo-400/70 bg-indigo-400/10'
              : 'border-zinc-800 bg-white/5 hover:bg-white/10'
          }`}
        >
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} aria-hidden="true" />
          <span>
            <span className="block text-sm font-bold tracking-wider">{b.name}</span>
            <span className="block text-[11px] text-zinc-400">{b.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ErebusPage() {
  const [reduced, setReduced] = useState(false);
  const [touchUI, setTouchUI] = useState(false);
  const [view, setView] = useState('atlas'); // atlas | explorer
  const [universeId, setUniverseId] = useState(1);
  const [bikeKey, setBikeKey] = useState('wisp');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | unvisited | bars-left
  const [flash, setFlash] = useState(false);
  const [hudTick, setHudTick] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const [jumpQuery, setJumpQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [scope, setScope] = useState('device:pending');
  const [progress, setProgress] = useState(() => blankProgress());
  const [ledger, setLedger] = useState(() => blankLedger());
  const [foundBars, setFoundBars] = useState([false, false]);

  const flightRef = useRef({ pos: { ...EREBUS_SPAWN }, yaw: EREBUS_SPAWN_YAW, pitch: 0, speed: 0, boosting: false });
  const inputRef = useRef({ thrust: 0, turn: 0, pitch: 0, boost: false, brake: false });
  const autopilotRef = useRef({ active: false, wpIndex: 0, dwellUntil: 0 });
  const snapCamRef = useRef(false);
  const foundRef = useRef([false, false]);
  const progressRef = useRef(blankProgress());
  const ledgerRef = useRef(blankLedger());
  const showJumpRef = useRef(false);
  const keysRef = useRef(new Set());
  const toastTimer = useRef(null);

  const universe = universeById(universeId) || UNIVERSES[0];
  const scene = useMemo(() => sceneFor(universe), [universe]);

  // Autopilot tour: remaining gold bars (nearest-first by index), then the portal.
  const waypoints = useMemo(() => {
    const wps = [];
    scene.bars.forEach((b, i) => {
      if (!foundRef.current[i]) wps.push({ pos: b.pos, kind: 'bar', radius: 14 });
    });
    wps.push({ pos: PORTAL.pos, kind: 'portal', radius: PORTAL.radius * 2.2 });
    return wps;
  }, [scene, foundBars]);

  // --- per-user scope + progress load ----------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let sc = safeStorage.getItem('erebus:scope:v1');
      if (!sc) {
        sc = 'device:' + Math.random().toString(36).slice(2, 10);
        try {
          const mod = await import('@/lib/supabase');
          const { data } = await mod.supabase.auth.getUser();
          if (data && data.user && data.user.id) sc = 'user:' + data.user.id;
        } catch {
          /* signed-out or unconfigured — device scope stands */
        }
        safeStorage.setItem('erebus:scope:v1', sc);
      }
      if (cancelled) return;
      setScope(sc);
      const p = loadProgress(sc, safeStorage);
      const l = loadLedger(sc, safeStorage);
      progressRef.current = p;
      ledgerRef.current = l;
      setProgress(p);
      setLedger(l);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = view === 'explorer' ? `${universe.name} — EREBUS` : TITLE;
  }, [view, universe]);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(!!(mq && mq.matches));
      setTouchUI(navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    } catch { /* defaults stand */ }
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (view !== 'explorer') return;
    const id = setInterval(() => setHudTick((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [view]);

  useEffect(() => {
    showJumpRef.current = showJump;
  }, [showJump]);

  const showToast = useCallback((msg) => {
    setToast({ msg, key: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const resetFlight = useCallback(() => {
    flightRef.current = { pos: { ...EREBUS_SPAWN }, yaw: EREBUS_SPAWN_YAW, pitch: 0, speed: 0, boosting: false };
    inputRef.current = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
    snapCamRef.current = true;
  }, []);

  const arrive = useCallback((id) => {
    const u = universeById(id);
    if (!u) return;
    fx.bikeMount();
    resetFlight();
    autopilotRef.current.active = false;
    autopilotRef.current.wpIndex = 0;
    autopilotRef.current.dwellUntil = 0;
    setUniverseId(id);
    setShowJump(false);
    setJumpQuery('');
    setView('explorer');
    const next = markVisited(progressRef.current, id);
    progressRef.current = next;
    setProgress(next);
    saveProgress(scope, next, safeStorage);
    const fb = [!!(next.bars[id] && next.bars[id][0]), !!(next.bars[id] && next.bars[id][1])];
    foundRef.current = [...fb];
    setFoundBars(fb);
    setFlash(true);
    setTimeout(() => setFlash(false), reduced ? 80 : 320);
  }, [reduced, resetFlight, scope]);

  const onCollect = useCallback((barIndex) => {
    if (foundRef.current[barIndex]) return;
    foundRef.current[barIndex] = true;
    fx.coin();
    const u = universeById(universeId);
    const { progress: next, fresh } = collectBar(progressRef.current, universeId, barIndex);
    if (fresh) {
      progressRef.current = next;
      setProgress(next);
      saveProgress(scope, next, safeStorage);
    }
    const { ledger: nl, fresh: lf } = creditBarToLedger(ledgerRef.current, universeId, barIndex, u ? u.name : '');
    if (lf) {
      ledgerRef.current = nl;
      setLedger(nl);
      saveLedger(scope, nl, safeStorage);
    }
    setFoundBars([...foundRef.current]);
    const n = barsFound(progressRef.current, universeId);
    if (n >= BARS_PER_UNIVERSE) {
      showToast(`Both gold bars found in ${u ? u.name : 'this universe'}`);
    } else {
      showToast(`Gold bar found — +${GOLD_LIQUID_PER_BAR.toLocaleString()} liquid gold (${n}/${BARS_PER_UNIVERSE})`);
    }
  }, [universeId, scope, showToast]);

  const openJump = useCallback(() => {
    autopilotRef.current.active = false;
    if (showJumpRef.current) return;
    fx.menuOpen();
    setShowJump(true);
  }, []);

  const stopAutopilot = useCallback(() => {
    autopilotRef.current.active = false;
    autopilotRef.current.dwellUntil = 0;
    setHudTick((n) => n + 1);
  }, []);

  const returnToAtlas = useCallback(() => {
    setShowJump(false);
    setView('atlas');
  }, []);

  // --- keyboard ------------------------------------------------------------------
  useEffect(() => {
    if (view !== 'explorer') return;
    const syncKeys = () => {
      const ks = keysRef.current;
      const fwd = ks.has('w') || ks.has('arrowup');
      const back = ks.has('s') || ks.has('arrowdown');
      const left = ks.has('a') || ks.has('arrowleft');
      const right = ks.has('d') || ks.has('arrowright');
      inputRef.current.thrust = (fwd ? 1 : 0) + (back ? -1 : 0);
      inputRef.current.turn = (left ? 1 : 0) + (right ? -1 : 0);
      inputRef.current.pitch = (ks.has('r') ? 1 : 0) + (ks.has('f') ? -1 : 0);
      inputRef.current.boost = ks.has('shift');
      inputRef.current.brake = ks.has(' ');
    };
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (k === 'p') { openJump(); return; }
      if (k === 'escape' && showJumpRef.current) { setShowJump(false); return; }
      if (autopilotRef.current.active) autopilotRef.current.active = false; // user took the controls
      keysRef.current.add(k);
      syncKeys();
    };
    const up = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
      syncKeys();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keysRef.current.clear();
      inputRef.current = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
    };
  }, [view, openJump]);

  // --- atlas filtering --------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return UNIVERSES.filter((u) => {
      if (filter === 'unvisited' && progress.visited.includes(u.id)) return false;
      if (filter === 'bars-left' && barsFound(progress, u.id) >= BARS_PER_UNIVERSE) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || String(u.id) === q;
    });
  }, [query, filter, progress]);

  const jumpFiltered = useMemo(() => {
    const q = jumpQuery.trim().toLowerCase();
    if (!q) return UNIVERSES;
    return UNIVERSES.filter((u) => u.name.toLowerCase().includes(q) || String(u.id) === q);
  }, [jumpQuery]);

  // --- derived HUD ----------------------------------------------------------------------
  const f = flightRef.current;
  const tuning = tuningFor(bikeKey);
  const speedLabel = speedWord(f.speed || 0, tuning.maxSpeed, !!f.boosting);
  const bike = bikeByKey(bikeKey);
  const bars = barsFound(progress, universeId);
  const total = totalBars(progress);
  const visited = visitedCount(progress);
  const autopilotOn = autopilotRef.current.active;

  // ============================ ATLAS ======================================
  if (view === 'atlas') {
    return (
      <div className="relative min-h-dvh bg-black text-white select-none">
        <HermesBackdrop src="/images/erebus/bg.webp" imgOpacity={0.45} zIndex={0} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <div className="relative overflow-hidden border-l-2 border-indigo-400/80 pl-4 mb-2 rounded-r-xl bg-black/40 backdrop-blur-sm py-3 pr-4">
            <HermesPanelTexture opacity={0.1} />
            <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-indigo-300/90">
              140 procedurally generated void universes
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-widest mt-1">EREBUS</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-2 tracking-wide max-w-2xl">
              No programs. No noise. Just the void, a tron bike, and two gold
              bars hiding in every universe. Fly the portal ring — or the portal
              button — to jump between universes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] tracking-widest uppercase">
              <span className="px-3 py-1.5 rounded-full border border-zinc-800 bg-white/5 text-zinc-300">
                {visited}/140 universes visited
              </span>
              <span className="px-3 py-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-200">
                ◆ {total}/280 gold bars
              </span>
              <span className="px-3 py-1.5 rounded-full border border-zinc-800 bg-white/5 text-zinc-300">
                {ledger.balance.toLocaleString()} liquid gold
              </span>
            </div>
          </div>

          <div className="relative mt-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4">
            <HermesPanelTexture opacity={0.06} />
            <div className="text-[10px] tracking-[0.3em] uppercase text-indigo-300/80 mb-2">
              Tron bike garage
            </div>
            <BikePicker bikeKey={bikeKey} setBikeKey={setBikeKey} />
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or number…"
              aria-label="Search universes"
              className="min-h-[44px] flex-1 max-w-md px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-sm tracking-wide placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/70"
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter universes">
              {[
                ['all', `All · ${UNIVERSES.length}`],
                ['unvisited', `Unvisited · ${UNIVERSES.length - visited}`],
                ['bars-left', 'Bars left'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`min-h-[44px] px-3 rounded-full border text-[11px] font-bold tracking-widest uppercase transition-colors ${
                    filter === key
                      ? 'border-indigo-400/70 bg-indigo-400/10 text-indigo-200'
                      : 'border-zinc-800 bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
              {filtered.map((u) => {
                const bf = barsFound(progress, u.id);
                const seen = progress.visited.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => arrive(u.id)}
                    aria-label={`Explore universe ${u.id}: ${u.name} — ${bf} of 2 gold bars found`}
                    className={`min-h-[96px] p-2.5 rounded-lg border bg-zinc-950/80 transition-colors text-left flex flex-col justify-between ${
                      seen ? 'border-indigo-400/50 hover:border-indigo-300' : 'border-zinc-800 hover:border-indigo-400/60'
                    } hover:bg-zinc-900`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black tracking-widest text-zinc-500">
                        {String(u.id).padStart(3, '0')}
                      </span>
                      <span className="flex gap-1" aria-hidden="true">
                        {u.palette.map((c) => (
                          <span key={c} className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold leading-tight mt-1.5 line-clamp-2">{u.name}</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-amber-300/90 text-[11px] tracking-widest" aria-hidden="true">
                        {bf === 2 ? '◆◆' : bf === 1 ? '◆◇' : '◇◇'}
                      </span>
                      {seen && <span className="text-[9px] uppercase tracking-[0.2em] text-indigo-300/70">visited</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 border border-zinc-800 rounded-xl p-10 text-center">
              <p className="text-zinc-400 text-sm tracking-wide">No universes match — clear the search or pick a different filter.</p>
              <button
                onClick={() => { setQuery(''); setFilter('all'); }}
                className="mt-4 min-h-[44px] px-6 rounded-lg border border-zinc-700 bg-white/5 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2"><EyeIcon size={14} />Show all 140</span>
              </button>
            </div>
          )}

          <p className="text-[10px] text-zinc-600 tracking-[0.25em] uppercase mt-8 text-center">
            Erebus · 140 universes · the quiet dark
          </p>
        </div>
      </div>
    );
  }

  // =========================== EXPLORER ====================================
  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white select-none"
      role="application"
      aria-label={`EREBUS explorer — ${universe.name} on a tron bike`}
    >
      <Canvas
        className="absolute inset-0"
        camera={{ position: [14, 7, 20], fov: 55, near: 0.5, far: 4000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[universe.palette[0]]} />
        <ErebusScene
          universe={universe}
          scene={scene}
          reduced={reduced}
          flightRef={flightRef}
          inputRef={inputRef}
          bikeKey={bikeKey}
          snapCamRef={snapCamRef}
          foundBars={foundBars}
          foundRef={foundRef}
          onCollect={onCollect}
          onPortal={openJump}
          autopilotRef={autopilotRef}
          waypoints={waypoints}
        />
      </Canvas>

      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-white pointer-events-none ${reduced ? '' : 'transition-opacity duration-200'}`}
        style={{ opacity: flash ? 1 : 0 }}
      />

      {/* minimal HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between gap-2 p-4 sm:p-5 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-indigo-400/80 max-w-[62vw]">
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-indigo-300/90">
            Universe {universe.id} / 140
          </div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-widest mt-0.5 leading-tight">{universe.name}</h1>
          <div className="text-[11px] sm:text-xs text-neutral-300 mt-1 tracking-wider">
            {bike.name} tron bike · <span className="text-indigo-300 font-bold">{speedLabel}</span>
            {autopilotOn && <span className="text-amber-300"> · autopilot</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <div className="bg-black/60 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-amber-400/40 text-amber-200 text-sm font-bold tracking-widest">
            ◆ {bars}/{BARS_PER_UNIVERSE}
          </div>
          <button
            onClick={() => {
              if (autopilotRef.current.active) stopAutopilot();
              else {
                autopilotRef.current.active = true;
                autopilotRef.current.wpIndex = 0;
                autopilotRef.current.dwellUntil = 0;
                setHudTick((n) => n + 1);
              }
            }}
            aria-pressed={autopilotOn}
            aria-label="Toggle autopilot tour"
            className={`min-h-[44px] px-4 rounded-lg border text-xs font-bold tracking-widest uppercase transition-colors ${
              autopilotOn
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-zinc-700 bg-black/60 text-zinc-300 hover:bg-white/10'
            }`}
          >
            <HIcon><RadarIcon size={13} />Autopilot</HIcon>
          </button>
          <button
            onClick={returnToAtlas}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-700 bg-black/60 text-zinc-300 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
          >
            <HIcon><GridIcon size={13} />Atlas</HIcon>
          </button>
        </div>
      </div>

      {/* the ONE portal button — centered */}
      <div className={`absolute left-0 right-0 flex justify-center pointer-events-none ${touchUI ? 'bottom-[47%]' : 'bottom-[calc(2rem+env(safe-area-inset-bottom))]'}`}>
        <button
          onClick={openJump}
          className="pointer-events-auto min-h-[56px] px-8 rounded-full border-2 border-cyan-300/70 bg-cyan-400/10 backdrop-blur-sm text-cyan-100 text-sm font-black tracking-[0.3em] uppercase hover:bg-cyan-400/25 transition-colors shadow-[0_0_30px_rgba(103,232,249,0.25)]"
        >
          <HIcon><PortalIcon size={16} />Portal</HIcon>
        </button>
      </div>

      {/* collect toast */}
      {toast && (
        <div className="absolute top-20 left-0 right-0 flex justify-center pointer-events-none">
          <div key={toast.key} className="bg-black/70 backdrop-blur-sm px-5 py-3 rounded-full border border-amber-400/50 text-amber-200 text-xs sm:text-sm font-bold tracking-widest">
            {toast.msg}
          </div>
        </div>
      )}

      {/* jump sheet */}
      {showJump && (
        <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col" role="dialog" aria-label="Jump to another universe">
          <div className="max-w-2xl w-full mx-auto px-4 pt-10 sm:pt-14 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col max-h-full">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/90">Portal — jump to another universe</div>
            <h2 className="text-2xl font-bold tracking-widest mt-1">Where to?</h2>
            <input
              value={jumpQuery}
              onChange={(e) => setJumpQuery(e.target.value)}
              placeholder="Search by name or number…"
              aria-label="Search universes to jump to"
              autoFocus
              className="mt-4 min-h-[44px] px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-sm tracking-wide placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400/70"
            />
            <div className="mt-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
              {jumpFiltered.map((u) => {
                const bf = barsFound(progress, u.id);
                const current = u.id === universeId;
                return (
                  <button
                    key={u.id}
                    disabled={current}
                    onClick={() => arrive(u.id)}
                    className={`min-h-[48px] px-3 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors ${
                      current
                        ? 'border-cyan-400/60 bg-cyan-400/10 opacity-60'
                        : 'border-zinc-800 bg-zinc-950/90 hover:border-cyan-400/60'
                    }`}
                  >
                    <span>
                      <span className="block text-[10px] font-black tracking-widest text-zinc-500">{String(u.id).padStart(3, '0')}{current ? ' · here' : ''}</span>
                      <span className="block text-sm font-bold">{u.name}</span>
                    </span>
                    <span className="text-amber-300/90 text-xs tracking-widest shrink-0" aria-label={`${bf} of 2 gold bars found`}>
                      {bf === 2 ? '◆◆' : bf === 1 ? '◆◇' : '◇◇'}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowJump(false)}
              className="mt-4 min-h-[48px] rounded-lg border border-zinc-700 bg-white/5 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
            >
              <span className="inline-flex items-center gap-2"><PinIcon size={14} />Stay here</span>
            </button>
          </div>
        </div>
      )}

      <TouchControls inputRef={inputRef} autopilotRef={autopilotRef} visible={touchUI} />

      {!touchUI && (
        <div className="absolute bottom-0 left-0 right-0 hidden md:flex justify-center pointer-events-none pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">
            WASD / arrows · R/F pitch · Shift boost · Space brake · P portal
          </div>
        </div>
      )}

      <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom)] pointer-events-none" />
    </div>
  );
}
