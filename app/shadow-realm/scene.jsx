// app/shadow-realm/scene.jsx — SHADOW REALM night-cycle Tron scene.
//
// Phone-first: capped pixel ratio, cheap unlit materials, exactly zero
// shadow maps, two real lights (ambient + directional). Glow is faked with
// additive ribbons/sprites — light NEVER drowns out texture wraps (there
// are no wraps here at all: pure neon on dark).
//
// Game flow is driven by props: { trackKey, vehicleKey, schemeKey, mode,
// laps, onFinish, onExit, hudRef }. Physics + barrier math come from
// race.js; the barrier always bounces/deflects — NEVER kills.

'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { barrierLoops, startPose, isBumpTrack } from './tracks';
import { roamSpawn, isRoam } from './roam';
import { LapTracker, resolveBarrier } from './race';
import { schemeByKey, vehicleByKey } from './schemes';
import Bots from './Bots';
import RemoteBikes from './RemoteBikes';
import EternalFlame from './flame';
import { fx } from '@/lib/fx';
import { REGEN_CHARGE_RATE, SURGE_SECS, BASELINE_THROTTLE, blendThrottle } from '@/lib/bike-motion';
import {
  Trail,
  TRAIL_KILL_RADIUS,
  TRAIL_IMMUNITY_S,
  TRAIL_MAX_POINTS,
  TRAIL_LIFETIME_S,
  checkRivalTrails,
  findSafeSpot,
  serializeTrail,
  deserializeTrail,
} from '@/lib/shadow-realm/trails';
import { createOrbit, resetOrbit, applyDrag, applyPinch, applyWheel, orbitCamera } from './orbit';
import {
  BUMP_LIVES,
  BUMP_RADIUS,
  BUMP_BOOST_REWARD,
  BUMP_IMMUNITY_S,
  RESPAWN_INVULN_S,
  KNOCK_DECAY,
  PLAYER_MASS,
  BOT_MASS,
  resolveBump,
  resolveOuterOnly,
  inFlameZone,
  lateralOffset,
  respawnPose,
  applyLifeLoss,
  isEliminated,
} from '@/lib/shadow-realm/bump';
import { buildTrackData, botPose } from './ai';
import { interpBeacon } from '@/lib/shadow-realm/net';
import {
  RIDE_CAMERA_LOCK,
  chaseCamTarget,
  chaseLookAt,
  chaseLerpFactor,
  dampAngle,
  CHASE_HEADING_LAMBDA,
} from './chase';

// ---------------------------------------------------------------------------
// geometry builders (plain three.js, built once per track)
// ---------------------------------------------------------------------------

function loopGeometry(loop, y) {
  const pts = loop.map((p) => new THREE.Vector3(p.x, y, p.z));
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function ribbonGeometry(inner, outer, y) {
  const n = inner.length;
  const positions = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 6] = inner[i].x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = inner[i].z;
    positions[i * 6 + 3] = outer[i].x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = outer[i].z;
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(loop, height) {
  const n = loop.length;
  const positions = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 6] = loop[i].x;
    positions[i * 6 + 1] = 0;
    positions[i * 6 + 2] = loop[i].z;
    positions[i * 6 + 3] = loop[i].x;
    positions[i * 6 + 4] = height;
    positions[i * 6 + 5] = loop[i].z;
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// environment: night sky, stars, moon, grid ground, distant pylons
// ---------------------------------------------------------------------------

function NightSky() {
  const moonPos = useMemo(() => new THREE.Vector3(-320, 210, -520), []);
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1500, 24, 16]} />
        <meshBasicMaterial color="#030612" side={THREE.BackSide} fog={false} />
      </mesh>
      <Stars radius={900} depth={80} count={2200} factor={5} saturation={0} fade speed={0.4} />
      {/* moon: bright disc + soft halo sprite (no bloom pass needed) */}
      <mesh position={moonPos}>
        <circleGeometry args={[46, 40]} />
        <meshBasicMaterial color="#e8efff" fog={false} />
      </mesh>
      <mesh position={moonPos.clone().add(new THREE.Vector3(0, 0, -4))}>
        <circleGeometry args={[78, 40]} />
        <meshBasicMaterial color="#8fb4ff" transparent opacity={0.16} fog={false} />
      </mesh>
    </group>
  );
}

function GridGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[2400, 2400]} />
        <meshBasicMaterial color="#04060e" />
      </mesh>
      <gridHelper args={[1400, 70, '#1e4d8f', '#0b1e3f']} position={[0, 0, 0]} />
      <gridHelper args={[1400, 14, '#2f6fd0', '#12305e']} position={[0, 0.02, 0]} />
    </group>
  );
}

function PylonRing() {
  const ref = useRef();
  const data = useMemo(() => {
    const arr = [];
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 640 + (i % 3) * 60;
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 60 + ((i * 37) % 90) });
    }
    return arr;
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    data.forEach((p, i) => {
      m.makeTranslation(p.x, p.h / 2, p.z);
      m.scale(new THREE.Vector3(3, p.h, 3));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [data]);
  return (
    <group>
      <instancedMesh ref={ref} args={[null, null, data.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#0a1830" />
      </instancedMesh>
      {data.map((p, i) => (
        <mesh key={i} position={[p.x, p.h + 2, p.z]}>
          <sphereGeometry args={[2.2, 8, 8]} />
          <meshBasicMaterial color={i % 2 ? '#2f9dff' : '#ff5a2a'} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// track: surface ribbon, barrier walls, neon edges, start/finish
// ---------------------------------------------------------------------------

function TrackMesh({ track, scheme }) {
  const loops = useMemo(() => barrierLoops(track, 220), [track]);
  const surface = useMemo(() => ribbonGeometry(loops.inner, loops.outer, 0.06), [loops]);
  const wallIn = useMemo(() => wallGeometry(loops.inner, 1.15), [loops]);
  const wallOut = useMemo(() => wallGeometry(loops.outer, 1.15), [loops]);
  const edgeIn = useMemo(() => loopGeometry(loops.inner, 1.18), [loops]);
  const edgeOut = useMemo(() => loopGeometry(loops.outer, 1.18), [loops]);
  const baseIn = useMemo(() => loopGeometry(loops.inner, 0.1), [loops]);
  const baseOut = useMemo(() => loopGeometry(loops.outer, 0.1), [loops]);
  const centerLine = useMemo(() => loopGeometry(loops.center, 0.09), [loops]);

  const start = useMemo(() => {
    const a = loops.inner[0];
    const b = loops.outer[0];
    const g = new THREE.BufferGeometry();
    const w = 2.4;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const px = -dz / l;
    const pz = dx / l;
    const v = new Float32Array([
      a.x - (px * w) / 2, 0.1, a.z - (pz * w) / 2,
      a.x + (px * w) / 2, 0.1, a.z + (pz * w) / 2,
      b.x - (px * w) / 2, 0.1, b.z - (pz * w) / 2,
      b.x + (px * w) / 2, 0.1, b.z + (pz * w) / 2,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    return { geo: g, ax: a.x, az: a.z, bx: b.x, bz: b.z };
  }, [loops]);

  return (
    <group>
      <mesh geometry={surface}>
        <meshBasicMaterial color="#070c18" side={THREE.DoubleSide} />
      </mesh>
      {/* center dashes: short glowing ticks, cheap and readable */}
      <lineLoop geometry={centerLine}>
        <lineBasicMaterial color="#123a6e" transparent opacity={0.8} />
      </lineLoop>
      {/* barrier walls — translucent blue glass */}
      <mesh geometry={wallIn}>
        <meshBasicMaterial color="#0e2f5e" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={wallOut}>
        <meshBasicMaterial color="#0e2f5e" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* neon top + base edges in the chosen scheme */}
      <lineLoop geometry={edgeIn}>
        <lineBasicMaterial color={scheme.primary} />
      </lineLoop>
      <lineLoop geometry={edgeOut}>
        <lineBasicMaterial color={scheme.primary} />
      </lineLoop>
      <lineLoop geometry={baseIn}>
        <lineBasicMaterial color={scheme.secondary} transparent opacity={0.55} />
      </lineLoop>
      <lineLoop geometry={baseOut}>
        <lineBasicMaterial color={scheme.secondary} transparent opacity={0.55} />
      </lineLoop>
      {/* start/finish strip */}
      <mesh geometry={start.geo}>
        <meshBasicMaterial color="#f2f6ff" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* start gantry arch */}
      <group>
        <mesh position={[start.ax, 3.4, start.az]}>
          <cylinderGeometry args={[0.35, 0.35, 6.8, 8]} />
          <meshBasicMaterial color="#0a1226" />
        </mesh>
        <mesh position={[start.bx, 3.4, start.bz]}>
          <cylinderGeometry args={[0.35, 0.35, 6.8, 8]} />
          <meshBasicMaterial color="#0a1226" />
        </mesh>
        <mesh
          position={[(start.ax + start.bx) / 2, 6.9, (start.az + start.bz) / 2]}
          rotation={[0, Math.atan2(start.bx - start.ax, start.bz - start.az) + Math.PI / 2, 0]}
        >
          <boxGeometry args={[Math.hypot(start.bx - start.ax, start.bz - start.az) + 1.4, 0.5, 0.5]} />
          <meshBasicMaterial color={scheme.secondary} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// light-cycle: procedural, unlit, phone-cheap. Nose points +Z.
// The garage's full trim-bike renders live in components/nova/TronBikes.jsx;
// this lightweight cycle keeps the realm iPhone-smooth. Neon parts take the
// rider's chosen scheme color.
// ---------------------------------------------------------------------------

export function LightCycle({ scheme, bikeRef }) {
  const neon = scheme.primary;
  const dark = '#0a0e1a';
  return (
    <group ref={bikeRef}>
      {/* hull */}
      <mesh position={[0, 0.55, 0.2]}>
        <boxGeometry args={[0.72, 0.42, 3.1]} />
        <meshBasicMaterial color={dark} />
      </mesh>
      {/* nose wedge */}
      <mesh position={[0, 0.55, 2.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.08, 1.2, 4]} />
        <meshBasicMaterial color={dark} />
      </mesh>
      {/* neon side strips */}
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} position={[x, 0.62, 0.2]}>
          <boxGeometry args={[0.06, 0.1, 2.9]} />
          <meshBasicMaterial color={neon} />
        </mesh>
      ))}
      {/* neon spine */}
      <mesh position={[0, 0.8, -0.4]}>
        <boxGeometry args={[0.1, 0.08, 1.6]} />
        <meshBasicMaterial color={neon} />
      </mesh>
      {/* wheels: neon rings */}
      {[1.55, -1.25].map((z) => (
        <group key={z} position={[0, 0.62, z]}>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.55, 0.09, 8, 24]} />
            <meshBasicMaterial color={neon} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.1, 16]} />
            <meshBasicMaterial color="#05070f" />
          </mesh>
        </group>
      ))}
      {/* rider: leaning capsule + helmet */}
      <mesh position={[0, 1.05, -0.55]} rotation={[Math.PI / 2.6, 0, 0]}>
        <capsuleGeometry args={[0.22, 0.7, 4, 10]} />
        <meshBasicMaterial color="#101827" />
      </mesh>
      <mesh position={[0, 1.28, -0.15]}>
        <sphereGeometry args={[0.24, 14, 12]} />
        <meshBasicMaterial color="#0b1220" />
      </mesh>
      <mesh position={[0, 1.3, 0.06]}>
        <boxGeometry args={[0.3, 0.07, 0.06]} />
        <meshBasicMaterial color={neon} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// light trail: a single additive ribbon fed by the bike's position history.
// Newest point first; width tapers down the tail. Updated imperatively from
// the physics rig — no React state per frame.
// ---------------------------------------------------------------------------

const TRAIL_N = 110;

function TrailRibbon({ scheme, apiRef }) {
  const hist = useRef([]); // newest first: {x, z, dx, dz}
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = i * 2 + 2;
      const d = i * 2 + 3;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    return g;
  }, []);

  useEffect(() => {
    const push = (x, z, dx, dz) => {
      const h = hist.current;
      const last = h[0];
      // Only record when the bike actually moved — avoids a fat blob at spawn.
      if (last && Math.hypot(x - last.x, z - last.z) < 0.4) return;
      h.unshift({ x, z, dx, dz });
      if (h.length > TRAIL_N) h.length = TRAIL_N;
      const pos = geo.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < TRAIL_N; i++) {
        const p = h[Math.min(i, h.length - 1)] || { x, z, dx, dz };
        const w = 0.85 * (1 - i / TRAIL_N) + 0.06;
        const px = -p.dz * w;
        const pz = p.dx * w;
        arr[i * 6] = p.x - px;
        arr[i * 6 + 1] = 0.32;
        arr[i * 6 + 2] = p.z - pz;
        arr[i * 6 + 3] = p.x + px;
        arr[i * 6 + 4] = 0.32;
        arr[i * 6 + 5] = p.z + pz;
      }
      pos.needsUpdate = true;
      geo.computeBoundingSphere();
    };
    const clear = () => {
      hist.current = [];
    };
    if (apiRef) apiRef.current = { push, clear };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  }, [geo, apiRef]);

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshBasicMaterial
        color={scheme.trail}
        transparent
        opacity={0.75}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// OrbitDriver: OrbitControls-style camera gestures for the Shadow Realm.
// One-finger drag orbits the camera around the rider; two-finger pinch
// dollies in/out; wheel does the same on desktop. This is CAMERA control
// only — it never steers (tilt owns steering) and never pans the gyro view
// (device rotation owns look). Touching the canvas is a fresh gesture space:
// the old DOM steer pads are gone, BOOST and the ride circles sit above the
// canvas as separate elements, and the iOS first-tap motion-permission
// listener fires on window pointerdown regardless of what orbits here.
// ---------------------------------------------------------------------------

function OrbitDriver({ orbitRef }) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    // No browser gestures or scroll chaining on the 3D surface.
    el.style.touchAction = 'none';

    const pointers = new Map(); // pointerId -> {x, y}
    let pinchPrev = 0;

    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchPrev = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
    };

    const onMove = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      const o = orbitRef.current;
      if (!o) return;
      if (pointers.size === 1) {
        applyDrag(o, dx, dy);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        if (pinchPrev > 0) applyPinch(o, d / pinchPrev - 1);
        pinchPrev = d;
      }
    };

    const onUp = (e) => {
      pointers.delete(e.pointerId);
      pinchPrev = 0;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const o = orbitRef.current;
      if (o) applyWheel(o, e.deltaY);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, orbitRef]);

  return null;
}

// ---------------------------------------------------------------------------
// LETHAL TRAILS: player death + respawn (the classic Tron rule).
// ---------------------------------------------------------------------------

/**
 * killPlayer(s, ownerName, ctx): the bike rode through a rival's trail.
 * Starts the pixelated-death animation (s.dying); the actual respawn
 * happens when the timer burns down in useFrame. Bump mode: a trail death
 * costs 1 life, like a flame hit; 0 lives = eliminated (no respawn).
 */
function killPlayer(s, ownerName, ctx) {
  if (!s || s.dying > 0 || s.eliminated || s.finished) return;
  s.dying = 0.7; // seconds of pixelated dissolve
  s.deaths = (s.deaths || 0) + 1;
  s.diedAt = s.time;
  s.diedAtWall = Date.now(); // wall-clock for the PvP beacon
  s.deathOwner = ownerName || 'RIVAL';
  s.speed = 0;
  s.kvx = 0;
  s.kvz = 0;
  try { fx.hit(); } catch { /* audio is best-effort */ }
  try {
    ctx.onBumpEvent &&
      ctx.onBumpEvent({ type: 'trail-death', owner: s.deathOwner, deaths: s.deaths });
  } catch { /* noop */ }
  if (ctx.bumpMode) {
    s.lives = applyLifeLoss(s.lives);
    if (isEliminated(s.lives)) {
      s.eliminated = true;
      try { ctx.onBumpEvent && ctx.onBumpEvent({ type: 'eliminated' }); } catch { /* noop */ }
    }
  }
}

/**
 * respawnPlayer(s, ctx): after the death animation, drop the bike at the
 * nearest track point clear of rival trails, with 10s immunity (covers
 * trail death AND flame hits), a cleared trail, and a disarmed lap tracker.
 */
function respawnPlayer(s, ctx) {
  const { loops, mode, camHeading, clockNow, botsRef, bumpRemotes, remoteTrails } = ctx;
  const rivals = [];
  for (const b of (botsRef && botsRef.current) || []) {
    if (!b || b.eliminated || !b.trail || b.trail.length < 2) continue;
    rivals.push({ trail: b.trail, name: b.name || 'RIVAL' });
  }
  for (const bc of bumpRemotes || []) {
    const rt = remoteTrails && remoteTrails.current.get(bc?.user_id);
    if (rt && rt.trail.length >= 2) rivals.push({ trail: rt.trail, name: bc.callsign || 'RIVAL' });
  }
  const center = !isRoam(mode) && loops ? loops.center : null;
  let spot = null;
  if (center) {
    spot = findSafeSpot({ x: s.x, z: s.z, centerline: center, rivalTrails: rivals, now: clockNow });
  }
  if (spot) {
    s.x = spot.x;
    s.z = spot.z;
    // Face along the track: direction to the next centerline point.
    let bi = 0;
    let bd2 = Infinity;
    for (let i = 0; i < center.length; i++) {
      const dx = spot.x - center[i].x;
      const dz = spot.z - center[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd2) { bd2 = d2; bi = i; }
    }
    const nxt = center[(bi + 1) % center.length];
    s.heading = Math.atan2(nxt.x - spot.x, nxt.z - spot.z);
  }
  s.speed = 0;
  s.kvx = 0;
  s.kvz = 0;
  s.immuneT = TRAIL_IMMUNITY_S; // 10s: trail death AND flame hits
  s.invulnT = Math.max(s.invulnT || 0, 2); // blink
  s.bumpImmuneT = Math.max(s.bumpImmuneT || 0, 2);
  s.trail.clear();
  if (s.tracker) s.tracker.armed = false; // never a cheap lap off respawn
  if (camHeading) camHeading.current = s.heading;
}

// ---------------------------------------------------------------------------
// TrailMesh: renders a lethal Trail (lib/shadow-realm/trails.js) as an
// additive ribbon. The FULL collision trail is drawn (up to 600 points) —
// the visual must match the lethal geometry, or riders die to invisible
// walls. Old segments dissolve by age (alpha fades over TRAIL_LIFETIME_S).
// Updated imperatively in useFrame — no React state per frame.
// ---------------------------------------------------------------------------

const TRAIL_MESH_MAX = TRAIL_MAX_POINTS;

export function TrailMesh({ trailGetter, color }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MESH_MAX * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MESH_MAX * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < TRAIL_MESH_MAX - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = i * 2 + 2;
      const d = i * 2 + 3;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    return g;
  }, []);

  const col = useMemo(() => new THREE.Color(color || '#ffffff'), [color]);

  useFrame((state) => {
    const trail = trailGetter ? trailGetter() : null;
    const pts = trail ? trail.points : null;
    const pos = geo.attributes.position;
    const colAttr = geo.attributes.color;
    const now = state.clock.elapsedTime;
    const n = pts ? Math.min(pts.length, TRAIL_MESH_MAX) : 0;
    // Oldest first for the ribbon (index 0 = oldest).
    for (let i = 0; i < TRAIL_MESH_MAX; i++) {
      const p = i < n ? pts[pts.length - n + i] : null;
      let x, z, dx, dz, alpha;
      if (p) {
        x = p.x;
        z = p.z;
        // Direction from neighbors (for ribbon width).
        const pn = pts[Math.min(pts.length - 1, pts.length - n + i + 1)];
        const pp = pts[Math.max(0, pts.length - n + i - 1)];
        dx = pn.x - pp.x;
        dz = pn.z - pp.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        // Age dissolve: fade over the lifetime; also taper the tail.
        const age = Math.max(0, now - p.t);
        const ageFade = Math.max(0, 1 - age / TRAIL_LIFETIME_S);
        const tailFade = 0.15 + 0.85 * (i / Math.max(1, n - 1));
        alpha = ageFade * tailFade * 0.8;
      } else {
        x = 0; z = 0; dx = 0; dz = 1; alpha = 0;
      }
      const w = 0.85;
      const px = -dz * w;
      const pz = dx * w;
      const o = i * 6;
      pos.array[o] = x - px;
      pos.array[o + 1] = 0.32;
      pos.array[o + 2] = z - pz;
      pos.array[o + 3] = x + px;
      pos.array[o + 4] = 0.32;
      pos.array[o + 5] = z + pz;
      const co = i * 8;
      for (let k = 0; k < 2; k++) {
        colAttr.array[co + k * 4] = col.r;
        colAttr.array[co + k * 4 + 1] = col.g;
        colAttr.array[co + k * 4 + 2] = col.b;
        colAttr.array[co + k * 4 + 3] = alpha;
      }
    }
    pos.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeBoundingSphere();
  });

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshBasicMaterial
        vertexColors
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// DeathBurst: pixelated-death particle burst. One InstancedMesh (single draw
// call, phone-cheap): 28 small emissive cubes that fly outward and fade.
// Fired imperatively via apiRef.current.burst(x, z, color).
// ---------------------------------------------------------------------------

const BURST_N = 28;

function DeathBurst({ apiRef }) {
  const mesh = useRef();
  const state = useRef({ t: 1e9, x: 0, z: 0 }); // t = seconds since burst
  const geo = useMemo(() => new THREE.BoxGeometry(0.35, 0.35, 0.35), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );
  // Per-particle velocity (randomized per burst).
  const vel = useMemo(() => new Float32Array(BURST_N * 3), []);

  useEffect(() => {
    const burst = (x, z, color) => {
      const st = state.current;
      st.t = 0;
      st.x = x;
      st.z = z;
      try {
        mat.color.set(color || '#ffffff');
      } catch { /* keep white */ }
      for (let i = 0; i < BURST_N; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 6 + Math.random() * 14;
        vel[i * 3] = Math.cos(a) * sp;
        vel[i * 3 + 1] = 4 + Math.random() * 10;
        vel[i * 3 + 2] = Math.sin(a) * sp;
      }
      if (mesh.current) mesh.current.visible = true;
    };
    if (apiRef) apiRef.current = { burst };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  }, [apiRef, mat, vel]);

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const st = state.current;
    const dt = Math.min(rawDt, 0.05);
    st.t += dt;
    if (st.t > 1.2) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const dummy = DeathBurst._dummy || (DeathBurst._dummy = new THREE.Object3D());
    const fade = 1 - st.t / 1.2;
    mat.opacity = 0.9 * fade;
    for (let i = 0; i < BURST_N; i++) {
      const t = st.t;
      dummy.position.set(
        st.x + vel[i * 3] * t,
        0.6 + vel[i * 3 + 1] * t - 9 * t * t,
        st.z + vel[i * 3 + 2] * t
      );
      const sc = Math.max(0.05, fade);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );

  return (
    <instancedMesh ref={mesh} args={[geo, mat, BURST_N]} visible={false} frustumCulled={false} />
  );
}

// ---------------------------------------------------------------------------
// Rig: physics, barrier bounce, lap counting, chase+orbit camera, trail feed.
// ---------------------------------------------------------------------------

function Rig({ track, vehicle, scheme, mode, laps, running, inputRef, playerTrailRef, onLap, onFinish, hudRef, orbitRef, bump, onBumpEvent, bumpRemotes, botsRef }) {
  const bikeRef = useRef();
  const shieldRef = useRef(); // trail-immunity shield ring
  const burstRef = useRef(); // death particle burst api
  const camTarget = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera); // snap on spawn (countdown framing)
  // Smoothed camera heading — the chase cam yaw follows the bike with a
  // slight lag (no snapping on sharp turns). Reset to the spawn heading
  // on every (re)spawn so the camera never swings wildly on mount.
  const camHeading = useRef(0);
  const sim = useRef(null);
  // Bump-mode remote-bike interpolation poses (user_id -> pose), so the
  // symmetric local bump resolution rides the same smoothing as the ghosts.
  const remotePoses = useRef(new Map());
  // LETHAL TRAILS: deserialized PvP remote trails, cached per rider
  // (user_id -> { trail, sig }) so beacons don't rebuild every frame.
  const remoteTrails = useRef(new Map());

  const bumpMode = !!bump && !!track?.flame;
  const flame = bumpMode ? track.flame : null;
  // LETHAL TRAILS: live in race modes (solo vs AI, PvP) and bump mode.
  // FREE ROAM stays chill — trails render but never kill.
  const trailsLethal = !isRoam(mode);

  // Roam mode: no track exists — loops stay null, never touched.
  // Bump mode needs the loops (outer wall + centerline for respawn).
  const loops = useMemo(() => (isRoam(mode) ? null : barrierLoops(track, 220)), [track, mode]);
  // Bump-mode parametric track data for bot poses.
  const bumpTrackData = useMemo(
    () => (bumpMode ? buildTrackData(track, { flame, maxSpeed: vehicle.maxSpeed, raceLaps: laps }) : null),
    [bumpMode, track, flame, vehicle, laps]
  );

  // (Re)spawn when track/vehicle change or a new run starts. Roam mode
  // spawns on the open grid — no track pose, no lap tracker.
  useEffect(() => {
    const roam = isRoam(mode);
    const pose = roam ? roamSpawn() : startPose(track, 220);
    sim.current = {
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      speed: 0,
      time: 0,
      finished: false,
      tracker: roam ? null : new LapTracker(loops.center),
      lastHud: 0,
      // Bump-mode battle state (Merlin 2026-10-03): 3 lives, knock
      // velocity from bumper hits, immunity windows, elimination.
      lives: BUMP_LIVES,
      invulnT: 0, // post-respawn grace (blinking)
      bumpImmuneT: 0, // post-hit grace (no stunlock)
      kvx: 0,
      kvz: 0, // knock velocity — decays, control returns
      eliminated: false,
      bumpWon: false,
      // LETHAL TRAILS (Merlin 2026-10-03, the classic Tron rule): the
      // bike's own light trail (never lethal to self — only rivals'
      // trails kill). immuneT covers trail death AND flame hits.
      trail: new Trail(),
      immuneT: 0, // 10s post-respawn immunity (blinking + shield ring)
      dying: 0, // death-animation timer (pixelated dissolve)
      deaths: 0, // self-reported trail-death count (PvP beacon)
      diedAt: 0, // last death timestamp (seconds, sim clock)
      deathOwner: null, // callsign of the trail owner, for the toast
      spawnImmuneT: 3, // brief launch forgiveness (staggered grid)
    };
    remotePoses.current.clear();
    remoteTrails.current.clear();
    // The TrailMesh renders this Trail directly — fresh run, fresh trail.
    if (playerTrailRef) playerTrailRef.current = sim.current.trail;
    // Fresh run, fresh camera: orbit offsets reset to the chase baseline and
    // the smoothed camera heading snaps to the spawn heading (no swing).
    // The camera itself snaps to the chase position immediately — during the
    // countdown the Rig's useFrame doesn't run (running=false), so without
    // this the camera sits at the R3F default (0,0,5)... which is INSIDE the
    // eternal flame on the bump track (Merlin 2026-10-03 video bug hunt).
    if (orbitRef.current) resetOrbit(orbitRef.current);
    camHeading.current = pose.heading;
    try {
      const cam = camera;
      if (cam) {
        const ct = chaseCamTarget(pose.x, pose.z, pose.heading, 0);
        cam.position.set(ct.x, ct.y, ct.z);
        const la = chaseLookAt(pose.x, pose.z, pose.heading);
        cam.lookAt(la.x, la.y, la.z);
        camTarget.current.set(ct.x, ct.y, ct.z);
      }
    } catch { /* camera snap is best-effort */ }
  }, [track, mode, loops, playerTrailRef]);

  useFrame((state, rawDt) => {
    const s = sim.current;
    if (!s || !running) return;
    const dt = Math.min(rawDt, 0.05);

    const input = inputRef.current || {};
    // Finished: coasting to a stop — no steering, no pedals, no boost.
    // (The FINISH overlay lands ~2s later; this is the visible rollout.)
    const steer = (s.eliminated || s.finished) ? 0 : input.steer || 0;
    const boost = !s.eliminated && !s.finished && !!input.boost;
    // motion controls (Merlin's tilt driving map): analog pedals + regen.
    const motionDrive = !!input.motionDrive && !s.finished;
    const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
    const throttle = clamp01(input.throttle);
    const brakePedal = clamp01(input.brake);
    const regen = clamp01(input.regen);

    // regen boost meter (the grid gives energy back, everywhere — no zones)
    if (s.boostCharge == null) s.boostCharge = 0;
    if (s.surgeT == null) s.surgeT = 0;
    if (s.surgeT > 0) s.surgeT -= dt;
    const surging = s.surgeT > 0;

    // speed: baseline auto-gas is the floor on every track and grid
    // (Merlin 2026-10-03). Tilt forward adds above baseline, tilt back
    // brakes below it; neutral hold = steady cruise. No motion / pads
    // only = steady cruise.
    let target;
    let rate;
    if (s.finished) {
      target = 0; // rollout after the line
      rate = vehicle.brakeRate * 1.6 * dt;
    } else if (motionDrive) {
      const boosting = boost || surging;
      const eff = blendThrottle(throttle, brakePedal);
      target = vehicle.maxSpeed * eff * (boosting ? vehicle.boostMult : 1);
      let decel = vehicle.brakeRate * 1.6;
      if (regen > 0) {
        // regenerative braking: hard carve scrubs speed AND charges the meter
        target = 0;
        decel = vehicle.brakeRate * (1.6 + 6 * regen);
        if (s.speed > 1) {
          s.boostCharge = Math.min(1, s.boostCharge + regen * REGEN_CHARGE_RATE * dt);
          if (s.boostCharge >= 1) {
            s.boostCharge = 0;
            s.surgeT = SURGE_SECS;
          }
        }
      } else if (brakePedal > 0) {
        // proportional braking is already folded into eff — brake harder
        decel = vehicle.brakeRate * (1.6 + 4 * brakePedal);
      }
      // Boosting punches harder: even a quick tap is felt immediately.
      const accelRate = boosting ? vehicle.accel * 2.2 : vehicle.accel;
      rate = (target > s.speed ? accelRate : decel) * dt;
    } else {
      // steady baseline cruise; boost multiplies and punches harder
      target = vehicle.maxSpeed * BASELINE_THROTTLE * (boost ? vehicle.boostMult : 1);
      const accelRate = boost ? vehicle.accel * 2.2 : vehicle.accel;
      rate = (target > s.speed ? accelRate : vehicle.brakeRate * 1.6) * dt;
    }
    if (s.eliminated) {
      // Eliminated: the bike burned out — coast to a stop (the rider
      // spectates from a settling chase cam).
      s.speed = Math.max(0, s.speed - vehicle.brakeRate * 1.6 * dt);
    } else {
      s.speed += Math.max(-rate, Math.min(rate, target - s.speed));
    }

    // steering: full lock only bites at speed.
    // Sign (Merlin 2026-10-03, verified end-to-end): positive steer must turn
    // screen-RIGHT. The chase cam looks along +Z, so screen-right is -X;
    // the nose (sin h, cos h) moves toward -X when h DECREASES — hence -=.
    // (The old += turned screen-left for right tilt: inverted.)
    const grip = 0.55 + 0.45 * Math.min(1, s.speed / vehicle.maxSpeed);
    s.heading -= steer * vehicle.turnRate * grip * dt;

    const dx = Math.sin(s.heading);
    const dz = Math.cos(s.heading);
    // Knock velocity rides along: bumper shoves decay, control returns.
    let vx = dx * s.speed + s.kvx;
    let vz = dz * s.speed + s.kvz;

    // integrate, then bounce off the solid barriers (never die).
    // BUMP MODE: the outer wall stays solid; the inner edge is OPEN — the
    // flame is the hazard.
    let px = s.x + vx * dt;
    let pz = s.z + vz * dt;
    let res;
    if (isRoam(mode)) {
      // Roam: open grid, no barriers — ride anywhere, nothing to bounce off.
      res = { pos: { x: px, z: pz }, vel: { x: vx, z: vz }, bounced: false };
    } else if (bumpMode) {
      res = resolveOuterOnly({ x: px, z: pz }, { x: vx, z: vz }, loops.center, loops.halfW, flame);
    } else {
      res = resolveBarrier({ x: px, z: pz }, { x: vx, z: vz }, loops.center, loops.halfW);
    }
    px = res.pos.x;
    pz = res.pos.z;
    vx = res.vel.x;
    vz = res.vel.z;
    s.x = px;
    s.z = pz;
    // Re-split: forward speed along the nose, the rest stays knock (decaying).
    const fwd = vx * dx + vz * dz;
    s.speed = Math.max(0, fwd);
    const kDecay = Math.exp(-KNOCK_DECAY * dt);
    s.kvx = (vx - dx * s.speed) * kDecay;
    s.kvz = (vz - dz * s.speed) * kDecay;
    if (res.bounced && s.speed > 8) {
      try {
        fx.hit();
      } catch {
        /* audio is best-effort */
      }
    }

    s.time += dt;
    if (s.invulnT > 0) s.invulnT = Math.max(0, s.invulnT - dt);
    if (s.bumpImmuneT > 0) s.bumpImmuneT = Math.max(0, s.bumpImmuneT - dt);
    // LETHAL TRAILS: immunity + spawn-forgiveness timers.
    if (s.immuneT > 0) s.immuneT = Math.max(0, s.immuneT - dt);
    if (s.spawnImmuneT > 0) s.spawnImmuneT = Math.max(0, s.spawnImmuneT - dt);
    const clockNow = state.clock.elapsedTime;

    // Record the bike's own trail (never lethal to self — the rival check
    // below only tests OTHER bikes' trails). Prune on a ~1s cadence.
    if (!s.eliminated && s.dying <= 0 && s.speed > 1) {
      s.trail.record(s.x, s.z, clockNow);
    }
    if ((s._pruneT || 0) + 1 < clockNow) {
      s._pruneT = clockNow;
      s.trail.prune(clockNow);
    }

    // ---- LETHAL TRAILS collision ------------------------------------
    // trailsLethal: race modes + bump. Roam stays chill (no check at all).
    if (trailsLethal && !s.eliminated && !s.finished && s.dying <= 0) {
      const immune = s.immuneT > 0 || s.spawnImmuneT > 0;
      if (!immune) {
        const rivals = [];
        // VS AI bots.
        for (const b of botsRef.current || []) {
          if (!b || b.eliminated || !b.trail || b.trail.length < 2) continue;
          rivals.push({ trail: b.trail, name: b.name || 'RIVAL' });
        }
        // PvP remotes: deserialize beacon trails (cached per rider).
        for (const bc of bumpRemotes || []) {
          if (!bc || !bc.user_id || !Array.isArray(bc.trail) || bc.trail.length < 4) continue;
          let rt = remoteTrails.current.get(bc.user_id);
          const sig = bc.trail.length + ':' + bc.trail[0] + ':' + bc.trail[bc.trail.length - 1];
          if (!rt || rt.sig !== sig) {
            rt = { trail: deserializeTrail(bc.trail, clockNow), sig };
            remoteTrails.current.set(bc.user_id, rt);
          }
          if (rt.trail.length >= 2) rivals.push({ trail: rt.trail, name: bc.callsign || 'RIVAL' });
        }
        const hit = checkRivalTrails(rivals, s.x, s.z, clockNow, { radius: TRAIL_KILL_RADIUS });
        if (hit) killPlayer(s, hit.owner, { bumpMode, onBumpEvent, camHeading, loops, mode, clockNow });
      }
    }

    // Death animation: pixelated dissolve, then respawn (unless eliminated
    // in bump mode — then the bike stays burned out).
    if (s.dying > 0) {
      s.dying = Math.max(0, s.dying - dt);
      if (s.dying <= 0 && !s.eliminated) {
        respawnPlayer(s, { loops, mode, camHeading, clockNow, botsRef, bumpRemotes, remoteTrails });
      }
    }

    // ---- BUMP MODE battle logic -------------------------------------
    if (bumpMode && !s.eliminated && !s.finished) {
      // Trail immunity (10s post-respawn) covers flame hits too.
      const canHit = s.invulnT <= 0 && s.immuneT <= 0;

      // Flame: -1 life, respawn at the nearest track point, 2s grace.
      // 0 lives = eliminated (bike fades, rider spectates).
      if (canHit && inFlameZone({ x: s.x, z: s.z }, flame)) {
        s.lives = applyLifeLoss(s.lives);
        try { onBumpEvent && onBumpEvent({ type: 'flame-hit', lives: s.lives }); } catch { /* noop */ }
        if (isEliminated(s.lives)) {
          s.eliminated = true;
          s.kvx = 0;
          s.kvz = 0;
          try { onBumpEvent && onBumpEvent({ type: 'eliminated' }); } catch { /* noop */ }
        } else {
          const rp = respawnPose(loops.center, { x: s.x, z: s.z });
          s.x = rp.x;
          s.z = rp.z;
          s.heading = rp.heading;
          s.speed = 0;
          s.kvx = 0;
          s.kvz = 0;
          s.invulnT = RESPAWN_INVULN_S;
          s.bumpImmuneT = Math.max(s.bumpImmuneT, RESPAWN_INVULN_S);
          // Disarm the lap: a respawn must never grant a cheap line crossing.
          if (s.tracker) s.tracker.armed = false;
          // Fresh trail after a flame respawn (the mesh reads s.trail).
          s.trail.clear();
          camHeading.current = rp.heading;
        }
      }

      // Bike-vs-bike: circle-circle impulse. Each client resolves ONLY its
      // own bike (symmetric trick — no networked physics, feels right).
      if (canHit && s.bumpImmuneT <= 0) {
        const tryBump = (ox, oz, ovx, ovz, omass, onShove) => {
          const ddx = s.x - ox;
          const ddz = s.z - oz;
          if (ddx * ddx + ddz * ddz >= (BUMP_RADIUS * 2) * (BUMP_RADIUS * 2)) return;
          const r = resolveBump(
            { x: s.x, z: s.z, vx: dx * s.speed + s.kvx, vz: dz * s.speed + s.kvz, mass: PLAYER_MASS },
            { x: ox, z: oz, vx: ovx, vz: ovz, mass: omass }
          );
          if (!r.hit || r.impact <= 0.5) return;
          // Own bike: positional correction + knock impulse.
          s.x = r.ax;
          s.z = r.az;
          s.kvx += r.avx - (dx * s.speed + s.kvx);
          s.kvz += r.avz - (dz * s.speed + s.kvz);
          // Shove the other bike (bots take it as a decaying world impulse).
          if (onShove) onShove(r.bvx - ovx, r.bvz - ovz, r.impact);
          // Bumper's reward: boost meter + brief immunity (no stunlock).
          s.boostCharge = Math.min(1, (s.boostCharge || 0) + BUMP_BOOST_REWARD);
          s.bumpImmuneT = BUMP_IMMUNITY_S;
          try { fx.hit(); } catch { /* best-effort */ }
          try { onBumpEvent && onBumpEvent({ type: 'bump', impact: r.impact }); } catch { /* noop */ }
        };

        // vs AI bots (parametric — shove lands as a decaying world impulse).
        const bots = (botsRef && botsRef.current) || [];
        for (const bot of bots) {
          if (!bot || bot.eliminated || bot.invulnT > 0 || !bumpTrackData) continue;
          const pose = botPose(bot, bumpTrackData);
          const bx = pose.x + (bot.shoveX || 0);
          const bz = pose.z + (bot.shoveZ || 0);
          const bvx = Math.sin(pose.heading) * (bot.speed || 0);
          const bvz = Math.cos(pose.heading) * (bot.speed || 0);
          tryBump(bx, bz, bvx, bvz, BOT_MASS, (sx, sz) => {
            bot.shoveX = (bot.shoveX || 0) + sx * 0.9;
            bot.shoveZ = (bot.shoveZ || 0) + sz * 0.9;
          });
          if (s.bumpImmuneT > 0) break; // one clean hit per immunity window
        }

        // vs remote riders (PvP): push ONLY our own bike.
        const nowMs = Date.now();
        const remotes = bumpRemotes || [];
        for (const bcn of remotes) {
          if (!bcn || bcn.user_id == null) continue;
          const key = bcn.user_id;
          const prev = remotePoses.current.get(key) || null;
          const p = interpBeacon(bcn, prev, nowMs);
          remotePoses.current.set(key, p);
          const bvx = Math.sin(p.heading) * (Number(bcn.speed) || 0);
          const bvz = Math.cos(p.heading) * (Number(bcn.speed) || 0);
          tryBump(p.x, p.z, bvx, bvz, PLAYER_MASS, null);
          if (s.bumpImmuneT > 0) break;
        }
      }

      // Solo win: every AI rival eliminated (or finished out) — last bike
      // standing takes it. PvP last-standing is decided page-side from the
      // beacon board (bots are per-client there).
      if (!s.finished && !s.eliminated && botsRef && botsRef.current && botsRef.current.length > 0) {
        const anyRacing = botsRef.current.some((b) => b && !b.eliminated && !b.finished);
        if (!anyRacing && !s.bumpWon) {
          s.bumpWon = true;
          s.finished = true;
          try { onBumpEvent && onBumpEvent({ type: 'bump-win' }); } catch { /* noop */ }
          onFinish && onFinish({ total: s.time, laps: s.tracker ? s.tracker.laps : 0, bumpWin: true });
          return;
        }
      }
    }

    // laps (race + bump modes — roam never counts laps, never fires onFinish)
    if ((mode === 'race' || bumpMode) && !isRoam(mode)) {
      const ev = s.tracker.update({ x: s.x, z: s.z }, { x: vx, z: vz }, s.time);
      if (ev === 'lap') {
        onLap && onLap(s.tracker.laps, s.tracker.lastLapTime);
        if (s.tracker.laps >= laps) {
          s.finished = true;
          onFinish && onFinish({ total: s.time, laps: s.tracker.laps });
          return;
        }
      }
    }

    // pose the bike
    if (bikeRef.current) {
      bikeRef.current.position.set(s.x, 0, s.z);
      bikeRef.current.rotation.y = s.heading;
      // lean into the turn: positive steer = right turn = right side dips.
      // (Screen-right is -X for the chase cam; rotation.z = +θ dips -X.)
      bikeRef.current.rotation.z = steer * 0.28 * Math.min(1, s.speed / 30);
      // hover bob
      bikeRef.current.position.y = 0.06 + Math.sin(state.clock.elapsedTime * 9) * 0.03;
      // eliminated: bike fades out. dying: pixelated dissolve (rapid
      // flicker + shrink). respawn grace / trail immunity: blink.
      if (s.eliminated) {
        bikeRef.current.visible = false;
      } else if (s.dying > 0) {
        // Pixelation: the bike strobes and collapses as it digitizes.
        const k = s.dying / 0.7; // 1 -> 0 over the death anim
        bikeRef.current.visible = Math.floor(state.clock.elapsedTime * 30) % 2 === 0;
        bikeRef.current.scale.setScalar(Math.max(0.15, k));
      } else {
        bikeRef.current.scale.setScalar(1);
        if (s.invulnT > 0 || s.immuneT > 0) {
          bikeRef.current.visible = Math.floor(state.clock.elapsedTime * 8) % 2 === 0;
        } else {
          bikeRef.current.visible = true;
        }
      }
      // shield ring: visible during the 10s trail immunity, pulsing.
      if (shieldRef.current) {
        const on = s.immuneT > 0 && !s.eliminated && s.dying <= 0;
        shieldRef.current.visible = on;
        if (on) {
          shieldRef.current.position.set(s.x, 0.5, s.z);
          const pulse = 0.55 + 0.45 * Math.sin(state.clock.elapsedTime * 6);
          shieldRef.current.material.opacity = 0.35 * pulse + 0.15;
          const sc = 1 + 0.08 * Math.sin(state.clock.elapsedTime * 6);
          shieldRef.current.scale.set(sc, 1, sc);
        }
      }
      // death burst: fire the pixel particles once when dying starts.
      if (s.dying > 0 && !s._burstFired && burstRef.current) {
        s._burstFired = true;
        burstRef.current.burst(s.x, s.z, scheme.trail);
      }
      if (s.dying <= 0) s._burstFired = false;
    }

    // (The TrailMesh renders s.trail directly — no separate feed needed.)

    // Chase camera — Merlin 2026-10-03: LOCKED behind the bike during the
    // ride. The camera yaw follows the smoothed bike heading (no snapping);
    // drag-orbit and gyro-pan are gated off while RIDE_CAMERA_LOCK is true.
    // One-line re-enable: set RIDE_CAMERA_LOCK = false in ./chase.js.
    camHeading.current = dampAngle(camHeading.current, s.heading, CHASE_HEADING_LAMBDA, dt);
    const ch = camHeading.current;
    const cam = state.camera;
    const ct = chaseCamTarget(s.x, s.z, ch, s.speed);
    let camX = ct.x;
    let camY = ct.y;
    let camZ = ct.z;
    if (!RIDE_CAMERA_LOCK) {
      // Legacy: drag-orbit offsets on top of the chase baseline.
      const oc = orbitCamera({ x: s.x, z: s.z }, ct, orbitRef.current);
      camX = oc.x;
      camY = oc.y;
      camZ = oc.z;
    }
    camTarget.current.set(camX, camY, camZ);
    cam.position.lerp(camTarget.current, chaseLerpFactor(dt));
    // Look-at: straight ahead along the (smoothed) heading. Gyro-look pan
    // is gated off while the lock holds — the sensors drive the BIKE, not
    // the camera. The hook still writes lookYaw/lookPitch (code path kept);
    // set RIDE_CAMERA_LOCK = false to read them again.
    const lookYaw = RIDE_CAMERA_LOCK ? 0 : input.lookYaw || 0;
    const lookPitch = RIDE_CAMERA_LOCK ? 0 : input.lookPitch || 0;
    const la = chaseLookAt(s.x, s.z, ch);
    let lx = la.x;
    let ly = la.y;
    let lz = la.z;
    if (lookYaw) {
      const ox = lx - s.x;
      const oz = lz - s.z;
      const c = Math.cos(lookYaw);
      const n = Math.sin(lookYaw);
      lx = s.x + ox * c + oz * n;
      lz = s.z - ox * n + oz * c;
    }
    if (lookPitch) ly += lookPitch * 26;
    cam.lookAt(lx, ly, lz);

    // HUD @ ~7Hz (no per-frame React state)
    if (hudRef && s.time - s.lastHud > 0.14) {
      s.lastHud = s.time;
      hudRef.current = {
        speed: Math.round(s.speed * 2.2),
        lap: (mode === 'race' || bumpMode) ? Math.min(s.tracker.laps + 1, laps) : 0,
        lapsTotal: laps,
        time: s.time,
        progress: (mode === 'race' || bumpMode) ? s.tracker.progress({ x: s.x, z: s.z }) : 0,
        boostCharge: s.boostCharge || 0,
        surging: !!surging,
        // Manual BOOST button state — the HUD shows an unmistakable
        // BOOSTING indicator while the button is held (Merlin 2026-10-03:
        // "the boost button should work" — make it obvious that it does).
        boosting: !!input.boost && !s.eliminated && !s.finished,
        // Live transform for the PvP/presence beacon (drop 2 netcode reads
        // these; the physics above is untouched).
        x: s.x,
        z: s.z,
        heading: s.heading,
        speedRaw: s.speed,
        // Bump-mode battle state for HUD pips + beacon lives.
        lives: s.lives,
        eliminated: s.eliminated,
        invuln: s.invulnT > 0,
        // LETHAL TRAILS: immunity countdown + death count for the HUD pill
        // and the PvP beacon. The serialized trail rides the beacon at ~2Hz
        // (throttled — 120 points is plenty for remote collision).
        immuneT: Math.ceil(s.immuneT || 0),
        immune: (s.immuneT || 0) > 0,
        deaths: s.deaths || 0,
        dying: s.dying > 0,
      };
      // Throttled trail serialization for the PvP beacon (~2Hz).
      if (!s._trailBeaconT || s.time - s._trailBeaconT > 0.5) {
        s._trailBeaconT = s.time;
        if (hudRef && hudRef.current) {
          hudRef.current.trail = serializeTrail(s.trail);
          hudRef.current.diedAtWall = s.diedAtWall || null;
        }
      }
    }
  });

  return (
    <>
      <LightCycle scheme={scheme} bikeRef={bikeRef} />
      {/* Trail-immunity shield ring: follows the bike, visible while immune. */}
      <mesh ref={shieldRef} position={[0, 0.5, 0]} visible={false}>
        <torusGeometry args={[2.6, 0.12, 8, 40]} />
        <meshBasicMaterial
          color="#7df9ff"
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <DeathBurst apiRef={burstRef} />
    </>
  );
}

// ---------------------------------------------------------------------------
// RealmScene: the mounted 3D realm. Props drive everything; the page owns UI.
// ---------------------------------------------------------------------------

export default function RealmScene({
  track,
  vehicleKey,
  schemeKey,
  mode,
  laps,
  running,
  inputRef,
  onLap,
  onFinish,
  hudRef,
  botsRef,
  // Drop-2 netcode: already-capped remote beacons + the identity/clock the
  // ghost renderer needs. Optional — solo rides pass nothing.
  remoteBeacons,
  netUserId,
  netNowRef,
  // BUMP RACE (Merlin 2026-10-03): onBumpEvent({type}) — 'flame-hit',
  // 'bump', 'eliminated', 'bump-win'. The page owns HUD pips + heat flash.
  onBumpEvent,
}) {
  const scheme = schemeByKey(schemeKey);
  const vehicle = vehicleByKey(vehicleKey);
  // LETHAL TRAILS: the Rig owns the player's Trail; the mesh renders it.
  const playerTrailRef = useRef(null);
  // One orbit state for the mounted realm; the Rig resets it per run.
  // Track-agnostic: every track in TRACKS renders through this same scene,
  // so orbit lands on ALL of them.
  const orbitRef = useRef(null);
  if (!orbitRef.current) orbitRef.current = createOrbit();
  // Bump battle rules key off the track (the host picks eternal-flame for
  // PvP bump) — but never in FREE ROAM, which stays a pure open world.
  const bump = isBumpTrack(track) && !isRoam(mode);
  // LETHAL TRAILS: live in race modes (solo vs AI, PvP) and bump mode.
  // FREE ROAM stays chill — trails render but never kill. (Defined here for
  // the Bots prop below; Rig defines its own copy for the player check.)
  const trailsLethal = !isRoam(mode);

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 62, near: 0.5, far: 2600, position: [0, 8, -20] }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <fog attach="fog" args={['#04060d', 140, 950]} />
      <ambientLight intensity={0.5} color="#8fb8ff" />
      <directionalLight intensity={0.7} color="#6ea8ff" position={[-0.4, 1, 0.35]} />
      {/* Drag-orbit is gated off while the chase cam is locked (Merlin
          2026-10-03) — the camera stays behind the bike during the ride.
          One-line re-enable: RIDE_CAMERA_LOCK = false in ./chase.js. */}
      {!RIDE_CAMERA_LOCK && <OrbitDriver orbitRef={orbitRef} />}
      <NightSky />
      <GridGround />
      <PylonRing />
      {/* Roam: no track mesh — the open grid is the whole world */}
      {!isRoam(mode) && <TrackMesh track={track} scheme={scheme} />}
      {/* BUMP RACE: the eternal flame — the arena's burning heart */}
      {bump && track.flame && <EternalFlame flame={track.flame} />}
      {/* LETHAL TRAILS: the player's full collision trail, age-dissolving. */}
      <TrailMesh trailGetter={() => playerTrailRef.current} color={scheme.trail} />
      <Rig
        track={track}
        vehicle={vehicle}
        scheme={scheme}
        mode={mode}
        laps={laps}
        running={running}
        inputRef={inputRef}
        playerTrailRef={playerTrailRef}
        onLap={onLap}
        onFinish={onFinish}
        hudRef={hudRef}
        orbitRef={orbitRef}
        bump={bump}
        onBumpEvent={onBumpEvent}
        bumpRemotes={remoteBeacons}
        botsRef={botsRef}
      />
      {/* VS AI: parametric ghost racers (race + bump modes) */}
      <Bots
        track={track}
        botsRef={botsRef}
        running={running && (mode === 'race' || mode === 'bump')}
        hudRef={hudRef}
        maxSpeed={vehicle.maxSpeed}
        raceLaps={laps}
        bump={bump}
        playerTrailRef={playerTrailRef}
        trailsLethal={trailsLethal}
      />
      {/* Drop-2 netcode: remote-rider ghosts (PvP races + open-world
          presence). Ghost by design — no collision, cosmetic only. */}
      {!!(remoteBeacons && remoteBeacons.length && netNowRef) && (
        <RemoteBikes beacons={remoteBeacons} myUserId={netUserId} nowRef={netNowRef} />
      )}
    </Canvas>
  );
}
