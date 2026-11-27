// components/omega-500/RaceScene.jsx — Omega 500 3D race scene (client).
//
// Renders one race: the track ribbon + start line + edge lines on the
// ground, the 9 car GLBs mounted exactly like EarthSupercar does (outer
// group = position + heading, inner group = model.scale + model.rotY,
// innermost = liftY), a chase camera behind the player's car, and the
// per-frame loop that steps the race and reports HUD state.
//
// Units here are METRES (the race sim's units), not Earth's display
// units: a prepared model is rescaled by model.scale /
// DISPLAY_UNITS_PER_METRE so the car reads its roster lengthM in metres.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleAt } from '@/lib/omega-500/tracks';
import { stepRace, racerPose, MS_TO_MPH, RACE_CAR_IDS } from '@/lib/omega-500/race';
import {
  ensureVehicleModel,
  getVehicleModel,
  subscribeVehicleModel,
} from '@/lib/earth/vehicle-model';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';

/** Deterministic car colour for the boxy fallback (GLB failed to load). */
function carColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 50%)`;
}

/** Flat ribbon strip along the centerline: centre offset + half width, at height y. */
function buildStripGeometry(line, offsetCenter, halfW, y) {
  const count = line.count;
  const positions = new Float32Array((count + 1) * 2 * 3);
  const indices = [];
  for (let i = 0; i <= count; i++) {
    const s = ((i % count) / count) * line.totalM;
    const p = sampleAt(line, s);
    const nx = -p.tz;
    const nz = p.tx;
    const lx = p.x + nx * (offsetCenter + halfW);
    const lz = p.z + nz * (offsetCenter + halfW);
    const rx = p.x + nx * (offsetCenter - halfW);
    const rz = p.z + nz * (offsetCenter - halfW);
    positions[i * 6] = lx;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = lz;
    positions[i * 6 + 3] = rx;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = rz;
    if (i < count) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Solid barricade wall along the ribbon edge: a vertical band at the
 *  given lateral offset, following the centerline. The sim wall face is
 *  the ribbon edge (halfWidth), so the mesh sits exactly there — the car
 *  bounces off the face it can see. */
function buildWallGeometry(line, offsetCenter, height) {
  const count = line.count;
  const positions = new Float32Array((count + 1) * 2 * 3);
  const indices = [];
  for (let i = 0; i <= count; i++) {
    const s = ((i % count) / count) * line.totalM;
    const p = sampleAt(line, s);
    const nx = -p.tz;
    const nz = p.tx;
    const x = p.x + nx * offsetCenter;
    const z = p.z + nz * offsetCenter;
    positions[i * 6] = x;
    positions[i * 6 + 1] = 0;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = height;
    positions[i * 6 + 5] = z;
    if (i < count) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Wall height in metres — a solid barricade, not a line on the ground. */
const WALL_HEIGHT_M = 1.2;

/** Track ribbon + start line + edge lines + ground. */
function TrackMesh({ track, line }) {
  const ribbon = useMemo(
    () => buildStripGeometry(line, 0, track.widthM / 2, 0),
    [track, line],
  );
  const edgeL = useMemo(
    () => buildStripGeometry(line, -(track.widthM / 2 - 0.4), 0.18, 0.02),
    [track, line],
  );
  const edgeR = useMemo(
    () => buildStripGeometry(line, track.widthM / 2 - 0.4, 0.18, 0.02),
    [track, line],
  );
  // Barricade walls on both ribbon edges, in the track's theme.wall
  // colour (previously unused here), with a top rail so the wall reads
  // solid from the chase camera.
  const wallColor = track.theme.wall;
  const wallL = useMemo(
    () => buildWallGeometry(line, -track.widthM / 2, WALL_HEIGHT_M),
    [track, line],
  );
  const wallR = useMemo(
    () => buildWallGeometry(line, track.widthM / 2, WALL_HEIGHT_M),
    [track, line],
  );
  const railL = useMemo(
    () => buildStripGeometry(line, -track.widthM / 2, 0.25, WALL_HEIGHT_M),
    [track, line],
  );
  const railR = useMemo(
    () => buildStripGeometry(line, track.widthM / 2, 0.25, WALL_HEIGHT_M),
    [track, line],
  );
  const start = useMemo(() => sampleAt(line, 0), [line]);
  const groundR = useMemo(() => {
    let m = 0;
    for (let i = 0; i < line.count; i++) {
      m = Math.max(m, Math.hypot(line.xs[i], line.zs[i]));
    }
    return m + 200;
  }, [line]);
  const startRotY = Math.atan2(start.tx, start.tz);
  return (
    <group>
      <mesh geometry={ribbon}>
        <meshStandardMaterial color="#2b2b30" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={edgeL}>
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={edgeR}>
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={wallL}>
        <meshStandardMaterial color={wallColor} emissive={wallColor} emissiveIntensity={0.35} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={wallR}>
        <meshStandardMaterial color={wallColor} emissive={wallColor} emissiveIntensity={0.35} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={railL}>
        <meshStandardMaterial color={wallColor} emissive={wallColor} emissiveIntensity={0.6} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={railR}>
        <meshStandardMaterial color={wallColor} emissive={wallColor} emissiveIntensity={0.6} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[start.x, 0.03, start.z]} rotation={[0, startRotY, 0]}>
        <boxGeometry args={[track.widthM, 0.05, 3]} />
        <meshStandardMaterial color="#ffffff" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[groundR, 48]} />
        <meshStandardMaterial color={track.theme.ground} roughness={1} />
      </mesh>
    </group>
  );
}

/** Gold marker bobbing above the player's car so it is easy to find. */
function PlayerMarker() {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 2.4 + Math.sin(clock.elapsedTime * 3) * 0.15;
    ref.current.rotation.y = clock.elapsedTime * 2;
  });
  return (
    <mesh ref={ref} position={[0, 2.4, 0]}>
      <coneGeometry args={[0.45, 1, 4]} />
      <meshStandardMaterial color="#ffd700" emissive="#aa8800" emissiveIntensity={0.6} />
    </mesh>
  );
}

/** One car on the grid. The outer group is moved by the frame loop. */
function RaceCarMesh({ racer, model, groupRef }) {
  const raceScale = model ? model.scale / DISPLAY_UNITS_PER_METRE : 1;
  return (
    <group ref={groupRef}>
      {model ? (
        <group scale={raceScale} rotation={[0, model.rotY, 0]}>
          <group position={[0, model.liftY, 0]}>
            <primitive object={model.scene} />
          </group>
        </group>
      ) : (
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[racer.vehicle.lengthM, 1.1, 2]} />
          <meshStandardMaterial color={carColor(racer.vehicle.id)} roughness={0.6} />
        </mesh>
      )}
      {racer.isPlayer && <PlayerMarker />}
    </group>
  );
}

/** Per-frame: step the race, move the car groups, chase the player, report HUD. */
function RaceLoop({ race, inputRef, carGroupRefs, onHud, onFinish }) {
  const { camera } = useThree();
  const camPos = useRef(new THREE.Vector3(0, 8, -16));
  const camTarget = useRef(new THREE.Vector3(0, 0, 0));
  const lastHudRef = useRef(0);
  const finishedRef = useRef(false);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    if (race.status === 'countdown' || race.status === 'racing') {
      stepRace(race, inputRef.current, dt);
    }
    // Move every car group from the sim.
    for (let i = 0; i < race.racers.length; i++) {
      const group = carGroupRefs.current[i];
      if (!group) continue;
      const pose = racerPose(race.racers[i], race.line);
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = Math.atan2(Math.cos(pose.heading), Math.sin(pose.heading));
    }
    // Chase camera behind the player's car.
    const player = race.racers.find((r) => r.isPlayer);
    if (player) {
      const pose = racerPose(player, race.line);
      const fx = Math.cos(pose.heading);
      const fz = Math.sin(pose.heading);
      const desired = new THREE.Vector3(pose.x - fx * 11, 5, pose.z - fz * 11);
      const k = 1 - Math.exp(-6 * dt);
      camPos.current.lerp(desired, k);
      camera.position.copy(camPos.current);
      camTarget.current.set(pose.x + fx * 10, 1, pose.z + fz * 10);
      camera.lookAt(camTarget.current);
    }
    // HUD, throttled to ~5 Hz.
    const now = state.clock.elapsedTime;
    if (now - lastHudRef.current > 0.2) {
      lastHudRef.current = now;
      if (player) {
        onHud({
          status: race.status,
          countdownMs: race.countdownMs,
          position: player.position,
          lap: Math.min(Math.max(player.lap, 1), race.totalLaps),
          totalLaps: race.totalLaps,
          raceMs: race.raceMs,
          lastLapMs: player.lastLapMs,
          bestLapMs: player.bestLapMs,
          speedMph: Math.round(player.speed * MS_TO_MPH),
          boost: Math.round(player.boost),
        });
      }
    }
    if (race.status === 'finished' && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(race.results);
    }
  });
  return null;
}

export default function RaceScene({ race, inputRef, onHud, onFinish }) {
  const carGroupRefs = useRef([]);
  const [models, setModels] = useState(() => {
    const m = {};
    for (const id of RACE_CAR_IDS) m[id] = getVehicleModel(id);
    return m;
  });

  useEffect(() => {
    for (const id of RACE_CAR_IDS) void ensureVehicleModel(id);
    return subscribeVehicleModel(({ id, model }) => {
      setModels((prev) => ({ ...prev, [id]: model }));
    });
  }, []);

  const track = race.track;
  return (
    <Canvas
      camera={{ fov: 62, near: 0.1, far: 3000, position: [0, 8, -16] }}
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <color attach="background" args={[track.theme.sky]} />
      <fog attach="fog" args={[track.theme.sky, 120, 700]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[80, 120, 40]} intensity={1.4} />
      <TrackMesh track={track} line={race.line} />
      {race.racers.map((racer, i) => (
        <RaceCarMesh
          key={racer.vehicle.id}
          racer={racer}
          model={models[racer.vehicle.id]}
          groupRef={(g) => {
            carGroupRefs.current[i] = g;
          }}
        />
      ))}
      <RaceLoop
        race={race}
        inputRef={inputRef}
        carGroupRefs={carGroupRefs}
        onHud={onHud}
        onFinish={onFinish}
      />
    </Canvas>
  );
}
