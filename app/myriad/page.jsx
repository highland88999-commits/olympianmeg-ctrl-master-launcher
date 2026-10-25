// app/myriad/page.jsx — MYRIAD: 100 explorable universes.
//
// Pick a tron bike from the garage, browse the atlas of 100 procedurally
// generated universes, then fly any of them: layered parallax starfields in
// the universe's palette, its nebulae and spiral galaxies, and its anomaly —
// a wormhole (fly in and wake up somewhere else), a starforge, a voidbloom,
// or a drifting crystalfield.
//
// Built on the NOVA flight model: lib/nova-flight.js math, TronBikes garage,
// and DeepSpace scenery components. No telemetry, no phone-home, zero
// network calls. Everything procedural and deterministic.
//
// Honesty rules:
// - Labels say what things are ("Somewhere else — fly in").
// - Reduced motion: no auto-rotation; autopilot still flies (user-initiated).
// - Plain-English HUD. Touch controls built in (no dependencies).
// - The atlas scrolls; Safari bottom-bar clearance everywhere.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TRON_BIKES, bikeByKey } from '@/components/nova/TronBikes';
import TronRider from '@/components/nova/TronRider';
import { SpiralGalaxy, Nebula, Wormhole } from '@/components/nova/DeepSpace';
import { fx, unlockFx } from '@/lib/fx';
import { HermesBackdrop, HermesPanelTexture } from '@/components/hermes-ui/HermesUi';
import { RadarIcon, BikeIcon, GridIcon, EyeIcon } from '@/lib/hermes-icons';

// HERMES treatment: inline-flex icon+label wrapper for HUD buttons.
const HIcon = ({ children }) => (
  <span className="inline-flex items-center gap-2">{children}</span>
);
import {
  TRON_BIKE_TUNING,
  tuningFor,
  dist3,
  headingOf,
  speedWord,
  stepFlight,
  steerToward,
} from '@/lib/nova-flight';
import {
  UNIVERSES,
  universeById,
  sceneFor,
  MYRIAD_SPAWN,
  ANOMALIES,
  anomalyLabel,
  mulberry32,
} from '@/lib/myriad-universes';
import {
  sitesFor,
  landingSitesFor,
  foundKey,
} from '@/lib/myriad-wonders';
import {
  loadProgress,
  saveProgress,
  markVisited,
  recordWormhole,
  markFound,
  markLanded,
  markMissionDone,
} from '@/lib/myriad-progress';
import {
  MISSIONS,
  missionProgress,
  newlyCompleted,
  nextMission,
} from '@/lib/myriad-missions';
import {
  AuroraVeil,
  CometSwarm,
  EchoReef,
  DerelictStation,
  SignalSource,
  Phenomenon,
  SiteGlow,
  SiteProximity,
  LandingGround,
  WalkerFigure,
  WalkRig,
  createWalker,
  applyLook,
} from '@/components/myriad/MyriadExtras';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';
import WalkJoystick from '@/components/world/WalkJoystick';

const TITLE = 'MYRIAD — 100 Universes';

const ANOMALY_TAG_COLORS = {
  wormhole: 'text-cyan-300 border-cyan-400/50 bg-cyan-400/10',
  starforge: 'text-amber-300 border-amber-400/50 bg-amber-400/10',
  voidbloom: 'text-violet-300 border-violet-400/50 bg-violet-400/10',
  crystalfield: 'text-sky-300 border-sky-400/50 bg-sky-400/10',
  none: 'text-zinc-400 border-zinc-700 bg-white/5',
};

// ---------------------------------------------------------------------------
// 3D helpers
// ---------------------------------------------------------------------------

function AnomalyLabel({ position, color, children }) {
  return (
    <Html
      position={position}
      center
      distanceFactor={90}
      style={{
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        letterSpacing: '0.25em',
        fontSize: 11,
        color: color || '#e8f4ff',
        textShadow: '0 0 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)',
        fontWeight: 700,
      }}
    >
      {children}
    </Html>
  );
}

// Layered parallax starfield tinted to the universe's palette.
function TintedStars({ seed, count, radius, palette, size }) {
  const geom = useMemo(() => {
    const rand = mulberry32(seed);
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
      col.multiplyScalar(0.45 + rand() * 0.55);
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

// ---------------------------------------------------------------------------
// Anomalies — each universe has at most one, rendered distinctly
// ---------------------------------------------------------------------------

function Starforge({ anomaly, reduced }) {
  const grp = useRef(null);
  const tex = useMemo(
    () =>
      glowTexture([
        [0, 'rgba(255,200,120,0.95)'],
        [0.35, 'rgba(255,140,60,0.45)'],
        [1, 'rgba(255,120,40,0)'],
      ]),
    []
  );
  useFrame((state) => {
    if (!reduced && grp.current) {
      grp.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.08);
    }
  });
  if (!tex) return null;
  return (
    <group position={[anomaly.pos.x, anomaly.pos.y, anomaly.pos.z]}>
      <group ref={grp}>
        <sprite scale={[26, 26, 1]}>
          <spriteMaterial map={tex} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite scale={[54, 54, 1]}>
          <spriteMaterial map={tex} transparent opacity={0.32} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <mesh>
          <sphereGeometry args={[3.2, 20, 20]} />
          <meshBasicMaterial color="#ffd9a0" />
        </mesh>
      </group>
      <pointLight intensity={80} distance={130} color="#ff9d5c" decay={1.7} />
      <AnomalyLabel position={[0, 17, 0]} color="#ffcf9e">
        Starforge
      </AnomalyLabel>
    </group>
  );
}

function Voidbloom({ anomaly, seed, reduced }) {
  const grp = useRef(null);
  const petals = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: 9 }, (_, i) => ({
      rotY: (i / 9) * Math.PI * 2,
      tilt: 0.5 + rand() * 0.5,
      len: 7 + rand() * 5,
      wid: 2.4 + rand() * 1.6,
    }));
  }, [seed]);
  useFrame((_, dt) => {
    if (!reduced && grp.current) grp.current.rotation.y += dt * 0.12;
  });
  return (
    <group position={[anomaly.pos.x, anomaly.pos.y, anomaly.pos.z]}>
      {/* dark heart */}
      <mesh>
        <sphereGeometry args={[4.2, 20, 20]} />
        <meshStandardMaterial color="#0d0616" roughness={1} metalness={0} />
      </mesh>
      {/* faint violet rim so the dark reads against the dark */}
      <mesh>
        <sphereGeometry args={[4.7, 20, 20]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.16} side={THREE.BackSide} />
      </mesh>
      <group ref={grp}>
        {petals.map((p, i) => (
          <group key={i} rotation={[0, p.rotY, 0]}>
            <mesh position={[0, 1.5, p.len / 2 + 3]} rotation={[p.tilt, 0, 0]}>
              <boxGeometry args={[p.wid, 0.5, p.len]} />
              <meshStandardMaterial
                color="#170b26"
                roughness={0.9}
                emissive="#4c1d95"
                emissiveIntensity={0.35}
              />
            </mesh>
          </group>
        ))}
      </group>
      <AnomalyLabel position={[0, 13, 0]} color="#c4b5fd">
        Voidbloom
      </AnomalyLabel>
    </group>
  );
}

function Crystalfield({ anomaly, seed, reduced }) {
  const refs = useRef([]);
  const shards = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: 16 }, () => ({
      pos: [(rand() - 0.5) * 46, (rand() - 0.5) * 26, (rand() - 0.5) * 46],
      rot: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      s: 0.8 + rand() * 2.2,
      spin: 0.1 + rand() * 0.4,
      bob: rand() * Math.PI * 2,
      y0: 0,
    })).map((sh) => ({ ...sh, y0: sh.pos[1] }));
  }, [seed]);
  useFrame((state, dt) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m || !shards[i]) return;
      m.rotation.y += dt * shards[i].spin;
      m.rotation.x += dt * shards[i].spin * 0.6;
      m.position.y = shards[i].y0 + Math.sin(t * 0.5 + shards[i].bob) * 1.2;
    });
  });
  return (
    <group position={[anomaly.pos.x, anomaly.pos.y, anomaly.pos.z]}>
      {shards.map((sh, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={sh.pos}
          rotation={sh.rot}
          scale={sh.s}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#bae6fd"
            roughness={0.15}
            metalness={0.6}
            emissive="#0ea5e9"
            emissiveIntensity={0.25}
            transparent
            opacity={0.92}
          />
        </mesh>
      ))}
      <AnomalyLabel position={[0, 17, 0]} color="#bae6fd">
        Crystalfield
      </AnomalyLabel>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Autopilot tour waypoints for a universe scene
// ---------------------------------------------------------------------------

function tourFor(scene) {
  const legs = [];
  if (scene.anomaly) {
    if (scene.anomaly.type === 'wormhole') {
      legs.push({ kind: 'portal', pos: scene.anomaly.pos, radius: scene.anomaly.radius });
    } else {
      legs.push({
        kind: 'look',
        pos: { x: scene.anomaly.pos.x, y: scene.anomaly.pos.y + 6, z: scene.anomaly.pos.z + 30 },
        dwell: 4,
      });
    }
  }
  for (const g of scene.galaxies) {
    legs.push({
      kind: 'look',
      pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z + g.radius + 34 },
      dwell: 4,
    });
  }
  for (const n of scene.nebulae) {
    legs.push({
      kind: 'look',
      pos: { x: n.pos.x, y: n.pos.y, z: n.pos.z + n.radius + 26 },
      dwell: 3,
    });
  }
  return legs;
}

// ---------------------------------------------------------------------------
// 3D: tron bike rig (flight physics + chase cam)
// ---------------------------------------------------------------------------

function BikeRig({ flightRef, inputRef, bikeKey, autopilotRef, reduced, snapCamRef, tour, anomaly, onPortal }) {
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
  const lastHud = useRef(0);
  const wasBoosting = useRef(false); // edge detector for the boost whoosh

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(0.05, rawDt || 0.016);
    const f = flightRef.current;
    const tuning = tuningFor(bikeKey);

    // Autopilot overrides the input.
    let input = inputRef.current;
    const ap = autopilotRef.current;
    if (ap.active) {
      const wp = tour.length ? tour[ap.wpIndex % tour.length] : null;
      if (wp) {
        const steer = steerToward(f, wp.pos, tuning);
        const close = steer.dist < (wp.kind === 'portal' ? wp.radius * 2.2 : 26);
        if (wp.kind === 'look' && close) {
          // Dwell: hold still, admire, then move on.
          if (!ap.dwellUntil) ap.dwellUntil = state.clock.elapsedTime + wp.dwell;
          input = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: true };
          if (state.clock.elapsedTime >= ap.dwellUntil) {
            ap.dwellUntil = 0;
            ap.wpIndex += 1;
          }
        } else {
          input = {
            thrust: close ? 0.35 : 0.85,
            turn: steer.turn,
            pitch: steer.pitch,
            boost: false,
            brake: false,
          };
        }
      } else {
        ap.wpIndex = 0;
        input = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
      }
    }

    const next = stepFlight(f, input, dt, tuning);
    f.pos = next.pos;
    f.yaw = next.yaw;
    f.pitch = next.pitch;
    f.speed = next.speed;
    f.boosting = !!(input.boost && (input.thrust || 0) > 0.1);
    // Boost edge: fire the whoosh once per engagement, not every frame.
    if (f.boosting && !wasBoosting.current) fx.boost();
    wasBoosting.current = f.boosting;

    // Wormhole anomaly contact — ride it somewhere else.
    if (anomaly && anomaly.type === 'wormhole' && dist3(f.pos, anomaly.pos) < anomaly.radius) {
      onPortal();
    }

    // Orient: nose (+Z) along heading, up = +Y (deep space, no planet).
    const s = scratch;
    const h = headingOf(f.yaw, f.pitch);
    s.h.set(h.x, h.y, h.z);
    s.m.lookAt(s.h, s.zero, s.up);
    g.position.set(f.pos.x, f.pos.y, f.pos.z);
    g.quaternion.setFromRotationMatrix(s.m);
    // Gentle bank into turns — the bike leans, it never snaps.
    g.rotateZ(-(input.turn || 0) * 0.35);

    // Chase camera with smoothing — but snap instantly on universe entry /
    // wormhole ride so the tron bike loads right in front of the user.
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

    if (state.clock.elapsedTime - lastHud.current > 0.2) {
      lastHud.current = state.clock.elapsedTime;
      autopilotRef.current.hudTick = (autopilotRef.current.hudTick || 0) + 1;
    }
  });

  const Bike = bikeByKey(bikeKey).Cmp;
  return (
    <group ref={group}>
      <Bike color={bikeByKey(bikeKey).color} />
      <TronRider bikeKey={bikeKey} reduced={reduced} />
    </group>
  );
}

function MyriadScene({ universe, scene, reduced, flightRef, inputRef, autopilotRef, bikeKey, snapCamRef, onPortal, sites, onFound }) {
  const tour = useMemo(() => tourFor(scene), [scene]);
  const starCount = (n) => Math.round(n * universe.starDensity);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[60, 80, 40]} intensity={1.4} />
      {/* key on universe id so scene animations reset between universes */}
      <group key={universe.id}>
        <TintedStars seed={universe.seed + 1} count={starCount(1400)} radius={900} palette={[...universe.palette, '#ffffff']} size={1.6} />
        <TintedStars seed={universe.seed + 2} count={starCount(900)} radius={600} palette={universe.palette} size={2.2} />
        <TintedStars seed={universe.seed + 3} count={starCount(350)} radius={380} palette={[universe.palette[2], '#ffffff']} size={2.8} />
        {/* near bright stars — an added layer only; the three layers above are untouched */}
        <TintedStars seed={universe.seed + 4} count={starCount(140)} radius={260} palette={[universe.palette[2], '#ffffff']} size={3.4} />
        {scene.galaxies.map((gl, i) => (
          <SpiralGalaxy key={gl.key} galaxy={gl} reduced={reduced} seed={universe.seed + 100 + i * 77} />
        ))}
        {scene.nebulae.map((n, i) => (
          <Nebula key={n.key} nebula={n} seed={universe.seed + 500 + i * 131} />
        ))}
        {scene.anomaly && scene.anomaly.type === 'wormhole' && (
          <Wormhole
            wormhole={{
              id: `myriad-wh-${universe.id}`,
              pos: scene.anomaly.pos,
              radius: scene.anomaly.radius,
              label: 'Somewhere else — fly in',
            }}
            index={universe.id % 3}
            reduced={reduced}
          />
        )}
        {scene.anomaly && scene.anomaly.type === 'starforge' && (
          <Starforge anomaly={scene.anomaly} reduced={reduced} />
        )}
        {scene.anomaly && scene.anomaly.type === 'voidbloom' && (
          <Voidbloom anomaly={scene.anomaly} seed={universe.seed + 700} reduced={reduced} />
        )}
        {scene.anomaly && scene.anomaly.type === 'crystalfield' && (
          <Crystalfield anomaly={scene.anomaly} seed={universe.seed + 900} reduced={reduced} />
        )}
        {/* soft halo on the anomaly — added light, the anomaly itself is untouched */}
        {scene.anomaly && scene.anomaly.type !== 'wormhole' && (
          <SiteGlow position={[scene.anomaly.pos.x, scene.anomaly.pos.y, scene.anomaly.pos.z]} color={universe.palette[2]} size={44} />
        )}
        {/* new wonders + finds for this universe */}
        {sites.map((s) => {
          if (s.group === 'wonder' && s.kind === 'aurora-veil') return <AuroraVeil key={s.id} site={s} reduced={reduced} />;
          if (s.group === 'wonder' && s.kind === 'comet-swarm') return <CometSwarm key={s.id} site={s} seed={universe.seed + 1100} reduced={reduced} />;
          if (s.group === 'wonder' && s.kind === 'echo-reef') return <EchoReef key={s.id} site={s} seed={universe.seed + 1300} />;
          if (s.kind === 'derelict') return <DerelictStation key={s.id} site={s} />;
          if (s.kind === 'signal') return <SignalSource key={s.id} site={s} reduced={reduced} />;
          if (s.kind === 'phenomenon') return <Phenomenon key={s.id} site={s} seed={universe.seed + 1500} reduced={reduced} />;
          return null;
        })}
      </group>
      <SiteProximity sites={sites} flightRef={flightRef} universeId={universe.id} onEnter={onFound} />
      <BikeRig
        flightRef={flightRef}
        inputRef={inputRef}
        bikeKey={bikeKey}
        autopilotRef={autopilotRef}
        reduced={reduced}
        snapCamRef={snapCamRef}
        tour={tour}
        anomaly={scene.anomaly}
        onPortal={onPortal}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Touch controls (same pattern as NOVA)
// ---------------------------------------------------------------------------

function TouchControls({ inputRef, autopilotRef, visible }) {
  const [nub, setNub] = useState({ x: 0, y: 0 });
  const [slide, setSlide] = useState(0);
  const leftId = useRef(null);
  const leftStart = useRef({ x: 0, y: 0 });
  const rightId = useRef(null);
  const rightStart = useRef({ y: 0 });

  if (!visible) return null;
  const stopAuto = () => {
    autopilotRef.current.active = false;
  };

  return (
    <>
      {/* left half: steer stick */}
      <div
        className="absolute left-0 bottom-0 w-1/2 h-[46%] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          stopAuto();
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
            className="absolute w-14 h-14 rounded-full bg-cyan-300/70 border border-cyan-100/60"
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
      {/* right half: thrust slider */}
      <div
        className="absolute right-0 bottom-0 w-1/2 h-[46%] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          stopAuto();
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

// Shared tron bike picker (garage radiogroup).
function BikePicker({ bikeKey, setBikeKey }) {
  return (
    <div className="grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Choose tron bike">
      {TRON_BIKES.map((b) => (
        <button
          key={b.key}
          role="radio"
          aria-checked={bikeKey === b.key}
          onClick={() => setBikeKey(b.key)}
          className={`min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
            bikeKey === b.key
              ? 'border-cyan-400/70 bg-cyan-400/10'
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
// Page: ATLAS (10x10 grid) + EXPLORER (fly one universe)
// ---------------------------------------------------------------------------

export default function MyriadPage() {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'MYRIAD' });
  const [reduced, setReduced] = useState(false);
  const [touchUI, setTouchUI] = useState(false);
  const [view, setView] = useState('atlas'); // atlas | explorer
  const [universeId, setUniverseId] = useState(1);
  const [bikeKey, setBikeKey] = useState('wisp');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | anomaly key
  const [flash, setFlash] = useState(false);
  const [hudTick, setHudTick] = useState(0);
  const [showBikes, setShowBikes] = useState(false);
  const [mode, setMode] = useState(null); // null = choose | 'missions' | 'roam'
  const [progress, setProgress] = useState(() => loadProgress());
  const [walkSite, setWalkSite] = useState(null);
  const [notice, setNotice] = useState('');
  const progressRef = useRef(progress);
  const modeRef = useRef(mode);
  const walkerRef = useRef(null);
  const walkJoyRef = useRef({ x: 0, y: 0 });
  const walkKeysRef = useRef(null);
  const walkLookRef = useRef(null);
  const noticeTimer = useRef(null);

  const flightRef = useRef({ pos: { ...MYRIAD_SPAWN }, yaw: Math.PI, pitch: 0, speed: 0, boosting: false });
  const inputRef = useRef({ thrust: 0, turn: 0, pitch: 0, boost: false, brake: false });
  const autopilotRef = useRef({ active: false, wpIndex: 0, dwellUntil: 0, hudTick: 0 });
  const snapCamRef = useRef(false);
  const jumpingRef = useRef(false);
  const keysRef = useRef(new Set());

  const universe = universeById(universeId) || UNIVERSES[0];
  const scene = useMemo(() => sceneFor(universe), [universe]);
  const tour = useMemo(() => tourFor(scene), [scene]);

  useEffect(() => {
    document.title = view === 'explorer' ? `${universe.name} — MYRIAD` : TITLE;
  }, [view, universe]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(!!(mq && mq.matches));
      setTouchUI(navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    } catch {
      /* defaults stand */
    }
    // FX system: unlock sound+haptics on the first gesture.
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Sync HUD cheaply from the flight ref.
  useEffect(() => {
    if (view !== 'explorer') return;
    const id = setInterval(() => setHudTick((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [view]);

  const showNotice = useCallback((text) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4200);
  }, []);

  // Single funnel for every progress change: save + mirror to state.
  const updateProgress = useCallback((fn) => {
    const next = fn(progressRef.current);
    saveProgress(next);
    progressRef.current = next;
    setProgress(next);
    return next;
  }, []);

  // Missions mode only: check off newly completed missions + celebrate.
  const checkMissions = useCallback((np) => {
    if (modeRef.current !== 'missions') return;
    const fresh = newlyCompleted(np);
    if (!fresh.length) return;
    let p2 = np;
    for (const m of fresh) p2 = markMissionDone(p2, m.id);
    saveProgress(p2);
    progressRef.current = p2;
    setProgress(p2);
    for (const m of fresh) {
      fx.checkpoint();
      showNotice(`Mission complete: ${m.title}`);
    }
  }, [showNotice]);

  const stopAutopilot = useCallback(() => {
    autopilotRef.current.active = false;
    autopilotRef.current.wpIndex = 0;
    autopilotRef.current.dwellUntil = 0;
  }, []);

  const resetFlight = useCallback(() => {
    flightRef.current = { pos: { ...MYRIAD_SPAWN }, yaw: Math.PI, pitch: 0, speed: 0, boosting: false };
    inputRef.current = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
    autopilotRef.current = { active: false, wpIndex: 0, dwellUntil: 0, hudTick: 0 };
    snapCamRef.current = true; // tron bike loads right in front of the user
    setShowBikes(false);
  }, []);

  const arrive = useCallback(
    (id) => {
      const u = universeById(id);
      if (!u) return;
      fx.satelliteDrop(); // universe selected from the atlas: the drop fanfare
      resetFlight();
      setUniverseId(id);
      setView('explorer');
      setFlash(true);
      setTimeout(() => setFlash(false), reduced ? 80 : 320);
      const np = updateProgress((p) => markVisited(p, id));
      checkMissions(np);
    },
    [reduced, resetFlight, updateProgress, checkMissions]
  );

  // Wormhole anomaly: fly in, wake up in a different universe.
  const rideWormhole = useCallback(() => {
    if (jumpingRef.current) return;
    jumpingRef.current = true;
    fx.checkpoint(); // sector jump: soft chime + tick
    let next = universeId;
    while (next === universeId) next = 1 + Math.floor(Math.random() * UNIVERSES.length);
    resetFlight();
    setUniverseId(next);
    const np = updateProgress((p) => markVisited(recordWormhole(p), next));
    checkMissions(np);
    setFlash(true);
    setTimeout(() => setFlash(false), reduced ? 80 : 320);
    setTimeout(() => {
      jumpingRef.current = false;
    }, 600);
  }, [universeId, reduced, resetFlight]);

  const returnToAtlas = useCallback(() => {
    stopAutopilot();
    setWalkSite(null);
    setView('atlas');
  }, [stopAutopilot]);

  // Flying close to a site finds it.
  const onFound = useCallback((site) => {
    const key = foundKey(universeId, site.id);
    if (progressRef.current.found.includes(key)) return;
    const np = updateProgress((p) => markFound(p, key));
    fx.checkpoint();
    showNotice(`Found: ${site.label}`);
    checkMissions(np);
  }, [universeId, updateProgress, showNotice, checkMissions]);

  // Land at a site: park the bike, walk on foot.
  const landAt = useCallback((site) => {
    stopAutopilot();
    inputRef.current = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
    walkerRef.current = createWalker({ x: 0, z: 0, yaw: Math.PI, pitch: 0 });
    walkJoyRef.current = { x: 0, y: 0 };
    setWalkSite(site);
    const np = updateProgress((p) => markLanded(p, universeId, site.id));
    showNotice(`Landed at ${site.label} — walk around, then take off.`);
    checkMissions(np);
  }, [universeId, stopAutopilot, updateProgress, showNotice, checkMissions]);

  // Take off: back on the bike above the site.
  const takeOff = useCallback(() => {
    if (!walkSite) return;
    flightRef.current = {
      pos: { x: walkSite.pos.x, y: walkSite.pos.y + 10, z: walkSite.pos.z + 24 },
      yaw: Math.PI, pitch: 0, speed: 0, boosting: false,
    };
    inputRef.current = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
    snapCamRef.current = true;
    setWalkSite(null);
  }, [walkSite]);

  // --- keyboard ------------------------------------------------------------
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
      stopAutopilot();
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
  }, [view, stopAutopilot]);

  // Walk-mode input: keyboard + drag-look on the walk overlay.
  useEffect(() => {
    if (!walkSite) return undefined;
    const keys = createKeyInput();
    keys.attach();
    walkKeysRef.current = keys;
    const detachLook = attachDragLook(walkLookRef.current, {
      onLook: (dx, dy) => {
        const w = walkerRef.current;
        if (w) applyLook(w, dx, dy);
      },
    });
    return () => {
      keys.detach();
      walkKeysRef.current = null;
      detachLook();
    };
  }, [walkSite]);

  // --- atlas filtering ------------------------------------------------------
  const counts = useMemo(() => {
    const c = { all: UNIVERSES.length };
    for (const a of ANOMALIES) c[a] = UNIVERSES.filter((u) => u.anomaly === a).length;
    return c;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return UNIVERSES.filter((u) => {
      if (filter !== 'all' && u.anomaly !== filter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || String(u.id) === q;
    });
  }, [query, filter]);

  // --- derived HUD -----------------------------------------------------------
  const f = flightRef.current;
  const tuning = tuningFor(bikeKey);
  const speedLabel = speedWord(f.speed || 0, tuning.maxSpeed, !!f.boosting);
  const bike = bikeByKey(bikeKey);
  const autopilot = autopilotRef.current.active;
  const canTour = tour.length > 0;
  const sites = useMemo(() => sitesFor(universe), [universe]);
  const landingSites = useMemo(() => landingSitesFor(universe), [universe]);
  let nearestLanding = null;
  let nearestLandingDist = Infinity;
  for (const s of landingSites) {
    const d = Math.hypot(f.pos.x - s.pos.x, f.pos.y - s.pos.y, f.pos.z - s.pos.z);
    if (d < nearestLandingDist) { nearestLandingDist = d; nearestLanding = s; }
  }
  let nearestUnfound = null;
  let nearestUnfoundDist = Infinity;
  for (const s of sites) {
    if (progress.found.includes(foundKey(universe.id, s.id))) continue;
    const d = Math.hypot(f.pos.x - s.pos.x, f.pos.y - s.pos.y, f.pos.z - s.pos.z);
    if (d < nearestUnfoundDist) { nearestUnfoundDist = d; nearestUnfound = s; }
  }
  const missionsDone = progress.completedMissions.length;
  const next = mode === 'missions' ? nextMission(progress) : null;
  const nextProgress = next ? missionProgress(progress, next) : null;

  // ============================ ATLAS ======================================
  if (view === 'atlas') {
    return (
      <div className="relative min-h-dvh bg-black text-white select-none">
        <HermesBackdrop src="/images/myriad/bg.webp" imgOpacity={0.4} zIndex={0} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <div className="relative overflow-hidden border-l-2 border-cyan-400/80 pl-4 mb-2 rounded-r-xl bg-black/40 backdrop-blur-sm py-3 pr-4">
            <HermesPanelTexture opacity={0.1} />
            <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-cyan-300/90">
              100 procedurally generated universes
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-widest mt-1">100 UNIVERSES</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-2 tracking-wide max-w-2xl">
              Every universe is generated from its own seed — the same seed always
              builds the same sky. Pick a tron bike, pick a universe, and fly it.
            </p>
          </div>

          {/* your journey so far */}
          <div className="relative mt-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80 mb-1">
              Your journey
            </div>
            <p className="text-sm text-zinc-300 tracking-wide">
              {progress.visited.length} of 100 universes visited · {missionsDone} of {MISSIONS.length} missions done · {progress.found.length} things found
            </p>
          </div>

          {/* tron bike garage */}
          <div className="relative mt-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4">
            <HermesPanelTexture opacity={0.06} />
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80 mb-2">
              Tron bike garage
            </div>
            <BikePicker bikeKey={bikeKey} setBikeKey={setBikeKey} />
          </div>

          {/* search + anomaly filter */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or number…"
              aria-label="Search universes"
              className="min-h-[44px] flex-1 max-w-md px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-sm tracking-wide placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400/70"
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by anomaly">
              {['all', ...ANOMALIES].map((a) => (
                <button
                  key={a}
                  onClick={() => setFilter(a)}
                  aria-pressed={filter === a}
                  className={`min-h-[44px] px-3 rounded-full border text-[11px] font-bold tracking-widest uppercase transition-colors ${
                    filter === a
                      ? 'border-cyan-400/70 bg-cyan-400/10 text-cyan-200'
                      : 'border-zinc-800 bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {a === 'all' ? `All · ${counts.all}` : `${anomalyLabel(a)} · ${counts[a]}`}
                </button>
              ))}
            </div>
          </div>

          {/* missions */}
          <details className="mt-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4">
            <summary className="cursor-pointer text-[10px] tracking-[0.3em] uppercase text-cyan-300/80">
              Missions · {missionsDone} of {MISSIONS.length} done
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {MISSIONS.map((m) => {
                const done = progress.completedMissions.includes(m.id);
                const mp = missionProgress(progress, m);
                return (
                  <div key={m.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="font-bold tracking-wide">{done ? '✓ ' : ''}{m.title}</div>
                      <div className="text-[11px] text-zinc-400">{m.desc}</div>
                    </div>
                    <div className="text-[11px] text-zinc-400 shrink-0">{mp.current}/{mp.target}</div>
                  </div>
                );
              })}
            </div>
          </details>

          {/* the 10x10 grid */}
          {filtered.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-2">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => arrive(u.id)}
                  aria-label={`Explore universe ${u.id}: ${u.name}`}
                  className="min-h-[96px] p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-cyan-400/60 hover:bg-zinc-900 transition-colors text-left flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-widest text-zinc-500">
                      {String(u.id).padStart(3, '0')}
                    </span>
                    <span className="flex gap-1" aria-hidden="true">
                      {u.palette.map((c) => (
                        <span
                          key={c}
                          className="w-2.5 h-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold leading-tight mt-1.5 line-clamp-2">
                    {u.name}
                  </div>
                  <div className="mt-1.5">
                    <span
                      className={`inline-block text-[9px] font-bold tracking-[0.2em] uppercase border rounded-full px-2 py-0.5 ${ANOMALY_TAG_COLORS[u.anomaly]}`}
                    >
                      {anomalyLabel(u.anomaly)}
                    </span>
                    {progress.visited.includes(u.id) && (
                      <span className="inline-block text-[9px] font-bold tracking-[0.2em] uppercase border border-emerald-400/50 bg-emerald-400/10 text-emerald-300 rounded-full px-2 py-0.5 ml-1">
                        Visited
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 border border-zinc-800 rounded-xl p-10 text-center">
              <p className="text-zinc-400 text-sm tracking-wide">
                No universes match — clear the search or pick a different filter.
              </p>
              <button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="mt-4 min-h-[44px] px-6 rounded-lg border border-zinc-700 bg-white/5 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2"><EyeIcon size={14} />Show all 100</span>
              </button>
            </div>
          )}

          <p className="text-[10px] text-zinc-600 tracking-[0.25em] uppercase mt-8 text-center">
            Myriad · {counts.all} universes · endless sky
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
      aria-label={`MYRIAD explorer — ${universe.name} on a tron bike`}
    >
      <Canvas
        onCreated={sceneGuard.onCreated}
        className="absolute inset-0"
        camera={{ position: [14, 7, 20], fov: 55, near: 0.5, far: 4000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.75]}
      >
        <color attach="background" args={[universe.palette[0]]} />
        {walkSite ? (
          <>
            <ambientLight intensity={0.55} />
            <directionalLight position={[60, 80, 40]} intensity={1.4} />
            <TintedStars seed={universe.seed + 1} count={Math.round(1400 * universe.starDensity)} radius={900} palette={[...universe.palette, '#ffffff']} size={1.6} />
            <TintedStars seed={universe.seed + 2} count={Math.round(900 * universe.starDensity)} radius={600} palette={universe.palette} size={2.2} />
            <LandingGround site={walkSite} groundColor={universe.palette[0]} accent={universe.palette[2]} />
            <WalkerFigure walkerRef={walkerRef} color={bike.color} />
            <WalkRig site={walkSite} walkerRef={walkerRef} joyRef={walkJoyRef} keysRef={walkKeysRef} />
          </>
        ) : (
          <MyriadScene
            universe={universe}
            scene={scene}
            reduced={reduced}
            flightRef={flightRef}
            inputRef={inputRef}
            autopilotRef={autopilotRef}
            bikeKey={bikeKey}
            snapCamRef={snapCamRef}
            onPortal={rideWormhole}
            sites={sites}
            onFound={onFound}
          />
        )}
      </Canvas>
      {/* walk-mode drag-look layer (under the HUD buttons) */}
      {walkSite && (
        <div ref={walkLookRef} className="absolute inset-0" style={{ touchAction: 'none' }} aria-label="Drag to look around" />
      )}

      {/* arrival flash */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-white pointer-events-none ${reduced ? '' : 'transition-opacity duration-200'}`}
        style={{ opacity: flash ? 1 : 0 }}
      />

      {/* header / HUD */}
      <div className="absolute left-0 right-0 flex items-start justify-between gap-2 p-4 sm:p-5 pointer-events-none" style={{ top: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}>
        <div className="relative overflow-hidden bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-cyan-400/80 max-w-[62vw]">
          <HermesPanelTexture opacity={0.12} />
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-cyan-300/90">
            Universe {universe.id} / 100
          </div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-widest mt-0.5 leading-tight">
            {universe.name}
          </h1>
          <div className="text-[11px] sm:text-xs text-neutral-300 mt-1 tracking-wider">
            <span
              className={`inline-block text-[9px] font-bold tracking-[0.2em] uppercase border rounded-full px-2 py-0.5 mr-2 ${ANOMALY_TAG_COLORS[universe.anomaly]}`}
            >
              {anomalyLabel(universe.anomaly)}
            </span>
            {bike.name} tron bike ·{' '}
            <span className="text-cyan-300 font-bold">{speedLabel}</span>
            {autopilot && <span className="text-amber-300"> · autopilot</span>}
            {walkSite && <span className="text-emerald-300"> · on foot at {walkSite.label}</span>}
            {mode && <span className="text-zinc-300"> · {mode === 'missions' ? 'Missions' : 'Free Roam'}</span>}
          </div>
          <p className="hidden sm:block text-[11px] text-zinc-500 mt-1.5 leading-relaxed max-w-md">
            {universe.description}
          </p>
          {mode === 'missions' && next && (
            <p className="text-[11px] text-amber-200 mt-1.5 tracking-wide">
              Mission: {next.title} — {nextProgress.current}/{nextProgress.target}
            </p>
          )}
          {!walkSite && nearestUnfound && nearestUnfoundDist < 60 && (
            <p className="text-[11px] text-emerald-200 mt-1 tracking-wide">
              Something glimmers nearby — fly a little closer.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 pointer-events-auto">
          {!walkSite && (
          <button
            onClick={() => {
              if (autopilotRef.current.active) stopAutopilot();
              else if (canTour) {
                autopilotRef.current.active = true;
                autopilotRef.current.wpIndex = 0;
                autopilotRef.current.dwellUntil = 0;
              }
              setHudTick((n) => n + 1);
            }}
            aria-pressed={autopilot}
            disabled={!canTour && !autopilot}
            title={canTour ? 'Fly a guided tour of this universe' : 'Nothing to tour here — open sky'}
            className={`min-h-[44px] px-4 rounded-lg border text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-40 ${
              autopilot
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-zinc-700 bg-black/60 text-zinc-300 hover:bg-white/10'
            }`}
          >
            {autopilot ? (<HIcon><RadarIcon size={13} />Stop tour</HIcon>) : (<HIcon><RadarIcon size={13} />Autopilot tour</HIcon>)}
          </button>
          )}
          {!walkSite && (
          <button
            onClick={() => setShowBikes((s) => !s)}
            aria-expanded={showBikes}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-700 bg-black/60 text-zinc-300 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
          >
            <HIcon><BikeIcon size={14} />Tron bike</HIcon>
          </button>
          )}
          {!walkSite && nearestLanding && (
            <button
              onClick={() => landAt(nearestLanding)}
              disabled={nearestLandingDist >= 70}
              className="min-h-[44px] px-4 rounded-lg border border-emerald-400/50 bg-black/60 text-emerald-200 text-xs font-bold tracking-widest uppercase hover:bg-white/10 disabled:opacity-40"
            >
              {nearestLandingDist < 70 ? `Land at ${nearestLanding.label}` : 'Land — fly closer'}
            </button>
          )}
          {walkSite && (
            <button
              onClick={takeOff}
              className="min-h-[44px] px-4 rounded-lg border border-emerald-400/50 bg-black/60 text-emerald-200 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
            >
              Take off
            </button>
          )}
          <button
            onClick={() => setMode(null)}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-700 bg-black/60 text-zinc-300 text-xs font-bold tracking-widest uppercase hover:bg-white/10"
          >
            Mode
          </button>
          <button
            onClick={returnToAtlas}
            className="min-h-[44px] px-4 rounded-lg border border-cyan-400/60 bg-cyan-400/10 text-cyan-200 text-xs font-bold tracking-widest uppercase hover:bg-cyan-400/20"
          >
            <HIcon><GridIcon size={13} />Return to atlas</HIcon>
          </button>
        </div>
      </div>

      {/* tron bike switcher */}
      {showBikes && !walkSite && (
        <div className="absolute top-24 right-4 sm:right-5 w-64 pointer-events-auto">
          <div className="bg-zinc-950/92 border border-zinc-800 rounded-xl backdrop-blur-md p-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80 mb-2">
              Swap tron bike
            </div>
            <BikePicker bikeKey={bikeKey} setBikeKey={setBikeKey} />
          </div>
        </div>
      )}

      {/* touch controls */}
      <TouchControls inputRef={inputRef} autopilotRef={autopilotRef} visible={touchUI && !walkSite} />
      {/* walk-mode joystick */}
      {walkSite && (
        <div className="absolute left-4 bottom-24 z-20">
          <WalkJoystick onMove={(x, y) => { walkJoyRef.current.x = x; walkJoyRef.current.y = y; }} />
        </div>
      )}

      {/* desktop hint */}
      {!touchUI && !walkSite && (
        <div className="absolute bottom-0 left-0 right-0 hidden md:flex justify-center pointer-events-none pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">
            WASD / arrows · R/F pitch · Shift boost · Space brake
            {universe.anomaly === 'wormhole' ? ' · fly into the ring to wake up somewhere else' : ''}
          </div>
        </div>
      )}
      {!touchUI && walkSite && (
        <div className="absolute bottom-0 left-0 right-0 hidden md:flex justify-center pointer-events-none pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">
            WASD / arrows walk · drag to look · Space jumps · Shift runs
          </div>
        </div>
      )}

      {/* mode choice — missions or free roam */}
      {mode === null && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80">How do you want to fly?</div>
            <h2 className="text-xl font-bold tracking-widest mt-1">Missions or Free Roam</h2>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Missions gives you goals that check off as you fly, land, and find things — and your progress saves.
              Free Roam is just flying: places you visit and things you find still save, but missions do not check off.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => setMode('missions')} className="min-h-[44px] px-4 rounded-lg border border-cyan-400/60 bg-cyan-400/10 text-cyan-200 text-sm font-bold tracking-widest uppercase hover:bg-cyan-400/20">
                Missions
              </button>
              <button onClick={() => setMode('roam')} className="min-h-[44px] px-4 rounded-lg border border-zinc-700 bg-white/5 text-sm font-bold tracking-widest uppercase hover:bg-white/10">
                Free Roam
              </button>
            </div>
          </div>
        </div>
      )}
      {/* notice pill */}
      {notice && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-20">
          <div className="bg-black/70 backdrop-blur-sm border border-cyan-400/40 rounded-full px-4 py-2 text-xs font-bold tracking-wide text-cyan-100">
            {notice}
          </div>
        </div>
      )}
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom)] pointer-events-none" />
    </div>
  );
}
