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
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { barrierLoops, startPose } from './tracks';
import { LapTracker, resolveBarrier } from './race';
import { schemeByKey, vehicleByKey } from './schemes';
import { fx } from '@/lib/fx';

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

function LightCycle({ scheme, bikeRef }) {
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
// Rig: physics, barrier bounce, lap counting, chase camera, trail feed.
// ---------------------------------------------------------------------------

function Rig({ track, vehicle, scheme, mode, laps, running, inputRef, trailApi, onLap, onFinish, hudRef }) {
  const bikeRef = useRef();
  const camTarget = useRef(new THREE.Vector3());
  const sim = useRef(null);

  const loops = useMemo(() => barrierLoops(track, 220), [track]);

  // (Re)spawn when track/vehicle change or a new run starts.
  useEffect(() => {
    const pose = startPose(track, 220);
    sim.current = {
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      speed: 0,
      time: 0,
      finished: false,
      tracker: new LapTracker(loops.center),
      lastHud: 0,
    };
    if (trailApi.current) trailApi.current.clear();
  }, [track, loops, running, trailApi]);

  useFrame((state, rawDt) => {
    const s = sim.current;
    if (!s || !running || s.finished) return;
    const dt = Math.min(rawDt, 0.05);

    const input = inputRef.current || {};
    const steer = input.steer || 0;
    const boost = !!input.boost;

    // speed: ease toward target (auto-throttle; boost multiplies)
    const target = vehicle.maxSpeed * (boost ? vehicle.boostMult : 1);
    const rate = (target > s.speed ? vehicle.accel : vehicle.brakeRate * 1.6) * dt;
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
    const res = resolveBarrier({ x: px, z: pz }, { x: vx, z: vz }, loops.center, loops.halfW);
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

    // laps (race mode only)
    if (mode === 'race') {
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

    // chase camera (+ gyro look-around: input.lookYaw / lookPitch, radians)
    const cam = state.camera;
    const back = 13 + s.speed * 0.05;
    const cx = s.x - dx * back;
    const cz = s.z - dz * back;
    const cy = 5.6 + s.speed * 0.012;
    camTarget.current.set(cx, cy, cz);
    cam.position.lerp(camTarget.current, 1 - Math.exp(-4.5 * dt));
    // Gyro look: pan the view without moving the camera. Yaw rotates the
    // look-at point about world-up around the bike (horizon never tilts —
    // no roll is ever applied); pitch shifts its height. lookYaw > 0 looks
    // right, lookPitch > 0 looks up. Both default to 0 (straight ahead).
    const lookYaw = input.lookYaw || 0;
    const lookPitch = input.lookPitch || 0;
    let lx = s.x + dx * 12;
    let ly = 1.4;
    let lz = s.z + dz * 12;
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
}) {
  const scheme = schemeByKey(schemeKey);
  const vehicle = vehicleByKey(vehicleKey);
  const trailApi = useRef(null);

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
      <NightSky />
      <GridGround />
      <PylonRing />
      <TrackMesh track={track} scheme={scheme} />
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
      />
    </Canvas>
  );
}
