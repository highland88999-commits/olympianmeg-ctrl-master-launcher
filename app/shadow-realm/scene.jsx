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
import { barrierLoops, startPose } from './tracks';
import { roamSpawn, isRoam } from './roam';
import { LapTracker, resolveBarrier } from './race';
import { schemeByKey, vehicleByKey } from './schemes';
import Bots from './Bots';
import RemoteBikes from './RemoteBikes';
import { fx } from '@/lib/fx';
import { REGEN_CHARGE_RATE, SURGE_SECS } from '@/lib/bike-motion';
import { createOrbit, resetOrbit, applyDrag, applyPinch, applyWheel, orbitCamera } from './orbit';
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
// Rig: physics, barrier bounce, lap counting, chase+orbit camera, trail feed.
// ---------------------------------------------------------------------------

function Rig({ track, vehicle, scheme, mode, laps, running, inputRef, trailApi, onLap, onFinish, hudRef, orbitRef }) {
  const bikeRef = useRef();
  const camTarget = useRef(new THREE.Vector3());
  // Smoothed camera heading — the chase cam yaw follows the bike with a
  // slight lag (no snapping on sharp turns). Reset to the spawn heading
  // on every (re)spawn so the camera never swings wildly on mount.
  const camHeading = useRef(0);
  const sim = useRef(null);

  // Roam mode: no track exists — loops stay null, never touched.
  const loops = useMemo(() => (isRoam(mode) ? null : barrierLoops(track, 220)), [track, mode]);

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
    };
    if (trailApi.current) trailApi.current.clear();
    // Fresh run, fresh camera: orbit offsets reset to the chase baseline and
    // the smoothed camera heading snaps to the spawn heading (no swing).
    if (orbitRef.current) resetOrbit(orbitRef.current);
    camHeading.current = pose.heading;
  }, [track, mode, loops, running, trailApi]);

  useFrame((state, rawDt) => {
    const s = sim.current;
    if (!s || !running || s.finished) return;
    const dt = Math.min(rawDt, 0.05);

    const input = inputRef.current || {};
    const steer = input.steer || 0;
    const boost = !!input.boost;
    // motion controls (Merlin's tilt driving map): analog pedals + regen.
    const motionDrive = !!input.motionDrive;
    const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
    const throttle = clamp01(input.throttle);
    const brakePedal = clamp01(input.brake);
    const regen = clamp01(input.regen);

    // regen boost meter (the grid gives energy back, everywhere — no zones)
    if (s.boostCharge == null) s.boostCharge = 0;
    if (s.surgeT == null) s.surgeT = 0;
    if (s.surgeT > 0) s.surgeT -= dt;
    const surging = s.surgeT > 0;

    // speed: motion riders drive the pedals; everyone else keeps auto-throttle
    let target;
    let rate;
    if (motionDrive) {
      const boosting = boost || surging;
      target = vehicle.maxSpeed * throttle * (boosting ? vehicle.boostMult : 1);
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
        target = 0;
        decel = vehicle.brakeRate * (1.6 + 4 * brakePedal);
      }
      rate = (target > s.speed ? vehicle.accel : decel) * dt;
    } else {
      // auto-throttle; boost multiplies
      target = vehicle.maxSpeed * (boost ? vehicle.boostMult : 1);
      rate = (target > s.speed ? vehicle.accel : vehicle.brakeRate * 1.6) * dt;
    }
    s.speed += Math.max(-rate, Math.min(rate, target - s.speed));

    // steering: full lock only bites at speed
    const grip = 0.55 + 0.45 * Math.min(1, s.speed / vehicle.maxSpeed);
    s.heading += steer * vehicle.turnRate * grip * dt;

    const dx = Math.sin(s.heading);
    const dz = Math.cos(s.heading);
    let vx = dx * s.speed;
    let vz = dz * s.speed;

    // integrate, then bounce off the solid barriers (never die)
    let px = s.x + vx * dt;
    let pz = s.z + vz * dt;
    // Roam: open grid, no barriers — ride anywhere, nothing to bounce off.
    const res = isRoam(mode)
      ? { pos: { x: px, z: pz }, vel: { x: vx, z: vz }, bounced: false }
      : resolveBarrier({ x: px, z: pz }, { x: vx, z: vz }, loops.center, loops.halfW);
    px = res.pos.x;
    pz = res.pos.z;
    vx = res.vel.x;
    vz = res.vel.z;
    s.x = px;
    s.z = pz;
    s.speed = Math.hypot(vx, vz);
    if (res.bounced && s.speed > 8) {
      try {
        fx.hit();
      } catch {
        /* audio is best-effort */
      }
    }

    s.time += dt;

    // laps (race mode only — roam never counts laps, never fires onFinish)
    if (mode === 'race' && !isRoam(mode)) {
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
      // lean into the turn
      bikeRef.current.rotation.z = -steer * 0.28 * Math.min(1, s.speed / 30);
      // hover bob
      bikeRef.current.position.y = 0.06 + Math.sin(state.clock.elapsedTime * 9) * 0.03;
    }

    // feed the light trail
    if (trailApi.current && s.speed > 2) {
      trailApi.current.push(s.x, s.z, dx, dz);
    }

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
        lap: mode === 'race' ? Math.min(s.tracker.laps + 1, laps) : 0,
        lapsTotal: laps,
        time: s.time,
        progress: mode === 'race' ? s.tracker.progress({ x: s.x, z: s.z }) : 0,
        boostCharge: s.boostCharge || 0,
        surging: !!surging,
        // Live transform for the PvP/presence beacon (drop 2 netcode reads
        // these; the physics above is untouched).
        x: s.x,
        z: s.z,
        heading: s.heading,
        speedRaw: s.speed,
      };
    }
  });

  return <LightCycle scheme={scheme} bikeRef={bikeRef} />;
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
}) {
  const scheme = schemeByKey(schemeKey);
  const vehicle = vehicleByKey(vehicleKey);
  const trailApi = useRef(null);
  // One orbit state for the mounted realm; the Rig resets it per run.
  // Track-agnostic: every track in TRACKS renders through this same scene,
  // so orbit lands on ALL of them.
  const orbitRef = useRef(null);
  if (!orbitRef.current) orbitRef.current = createOrbit();

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
      <TrailRibbon scheme={scheme} apiRef={trailApi} />
      <Rig
        track={track}
        vehicle={vehicle}
        scheme={scheme}
        mode={mode}
        laps={laps}
        running={running}
        inputRef={inputRef}
        trailApi={trailApi}
        onLap={onLap}
        onFinish={onFinish}
        hudRef={hudRef}
        orbitRef={orbitRef}
      />
      {/* VS AI: parametric ghost racers (race mode only) */}
      <Bots
        track={track}
        botsRef={botsRef}
        running={running && mode === 'race'}
        hudRef={hudRef}
        maxSpeed={vehicle.maxSpeed}
        raceLaps={laps}
      />
      {/* Drop-2 netcode: remote-rider ghosts (PvP races + open-world
          presence). Ghost by design — no collision, cosmetic only. */}
      {!!(remoteBeacons && remoteBeacons.length && netNowRef) && (
        <RemoteBikes beacons={remoteBeacons} myUserId={netUserId} nowRef={netNowRef} />
      )}
    </Canvas>
  );
}
