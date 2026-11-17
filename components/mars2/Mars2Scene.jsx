'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { SeedRNG, getTerrainHeight } from '@/lib/mars/engine';
import { terrainMaterial, disposeTerrainMaterial, monsSite, monsSlopeMaterial, monsCapMaterial, hazeSpriteTexture, devilStreakTexture, DUST_DEVIL_COUNT, DUST_DEVIL_AREA, HAZE_COUNT } from '@/lib/mars/cgi';
import { makeDustField, updateDustField, devilFor, PLANET_CGI_EPOCH_MS } from '@/lib/planet-cgi/motion';
import { getParticleTexture } from '@/lib/particles/sprites';
import DayNightRig from '@/components/DayNightRig';
import { TouchControls } from '@/components/mars/MarsScene';
import BackpackHud from '@/components/backpack/BackpackHud';
import { mars2DayFactor, outpostSite, WORLD_RADIUS, WALKER_SPAWN, EYE_HEIGHT } from '@/lib/mars2/world';
import { materialForHardware } from '@/lib/mars2/textures';
import { useScratchedMaterial } from '@/lib/portal/scratched-textures';
import { thuleWindAt, makeSandField, updateSandField, windCompass } from '@/lib/mars2/weather';
import {
  ROVER_WHEEL_RADIUS_M, ROVER_WHEEL_COUNT,
  summonRover, updateRover, dismountRover, roverSpeedKmh, smoothRoverSpeedKmh,
} from '@/lib/mars2/rovers';
// The shared planet walker (Merlin, Nov 15, 2026 — the same
// gravity logic on every planet): Mars 2's walk runs on it now —
// real Mars gravity (3.71 m/s²) with the shared 3.0 m/s take-off,
// so the jump here arcs 1.21 m and hangs 1.62 s. Walk speed stays
// the world's own 3 m/s (WALK_SPEED_MPS, via the planet bundle).
import { stepFlatWalker, planetParams } from '@/lib/planet-walker';

const MARS_PLANET = planetParams('mars');

// MARS 2 — the successor world (Merlin, Nov 15, 2026). One-word
// spec: ROVERS. Same seeded Mars engine as Mars 1 (fixed seed
// MARS-2), no exobiology program — the world is red terrain,
// dunes, dust devils, haze, Olympus Mons, one ARES outpost, and
// a summonable six-wheeled survey rover you drive across it.
// Modes: 'orbit' overview, 'walk' (WASD + stick, terrain-clamped),
// 'drive' (same keys drive the rover, chase camera). No fly mode
// on purpose — this world is walked and driven, not flown.
// Day/night is the shared law: DayNightRig (lib/day-night.js)
// drives sky, fog and lights from the real clock; the page's
// timeOfDay (same real clock) only dims the dust and devils.

function useKeys(inputRef) {
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (!inp) return;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = true;
      if (k === 's' || k === 'arrowdown') inp.keys.back = true;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = true;
      if (k === 'd' || k === 'arrowright') inp.keys.right = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (!inp) return;
      if (k === 'w' || k === 'arrowup') inp.keys.fwd = false;
      if (k === 's' || k === 'arrowdown') inp.keys.back = false;
      if (k === 'a' || k === 'arrowleft') inp.keys.left = false;
      if (k === 'd' || k === 'arrowright') inp.keys.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);
}

// --- terrain ---------------------------------------------------------------
// Same 180×180 m seeded ground as Mars 1: vertex-coloured rust
// bands with the marsRegolith dune map + bump multiplied over them.
function Mars2Terrain({ profile }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(180, 180, 96, 96);
    g.rotateX(-Math.PI / 2);
    const posAttr = g.attributes.position;
    const colors = [];
    const cLow = profile.groundColor.clone().multiplyScalar(0.55);
    const cMid = profile.groundColor.clone();
    const cHigh = profile.groundAccentColor.clone();
    const cPeak = new THREE.Color('#f8fafc');
    const col = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = getTerrainHeight(vx, vz, profile);
      posAttr.setY(i, vy);
      if (vy < -0.2) {
        col.copy(cLow);
      } else if (vy < 2.2) {
        col.lerpColors(cMid, cHigh, (vy + 0.2) / 2.4);
      } else {
        col.copy(cHigh).lerp(cPeak, Math.min(0.45, (vy - 2.2) * 0.12));
      }
      colors.push(col.r, col.g, col.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [profile]);
  const material = useMemo(() => terrainMaterial(profile), [profile]);
  useEffect(() => () => {
    geo.dispose();
    disposeTerrainMaterial(material);
  }, [geo, material]);
  return <mesh geometry={geo} material={material} />;
}

// --- Olympus Mons ------------------------------------------------------------
// Broad shield cone, rust slopes, pale ice-cap summit — the same
// seeded site Mars 1 stands on. Visual only: the walker and the
// rover both stand on getTerrainHeight, never on the cone.
function OlympusMons({ profile }) {
  const site = useMemo(() => monsSite(profile), [profile]);
  const slopeMat = useMemo(() => monsSlopeMaterial(profile), [profile]);
  const capMat = useMemo(() => monsCapMaterial(profile), [profile]);
  return (
    <group position={[site.x, site.y - site.sink, site.z]}>
      <mesh position={[0, site.height / 2, 0]} material={slopeMat}>
        <coneGeometry args={[site.radius, site.height, 64]} />
      </mesh>
      <mesh position={[0, site.capY, 0]} material={capMat}>
        <coneGeometry args={[site.capRadius, site.capHeight, 64]} />
      </mesh>
      <Html position={[0, site.height + 3.5, 0]} center distanceFactor={60}
        style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap',
          color: '#ffe3cc', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>OLYMPUS MONS</div>
      </Html>
    </group>
  );
}

// --- CGI: dust, dust devils, storm haze --------------------------------------
// Same planet-cgi kit as Mars 1: the dust motes wander, the devils
// live ~40 s then reseed elsewhere, the haze breathes — all pure
// functions of the device clock. dayF dims them at night.
function Mars2Cgi({ profile, dayF }) {
  const dust = useMemo(() => makeDustField({
    count: 260, width: 170, height: 8, depth: 170, yBase: 0.3,
    seed: profile.seed + '-dust', color: '#d9a06a', size: 0.12, opacity: 0.5, sprite: 'grain',
  }), [profile]);
  const devilGeo = useMemo(() => new THREE.CylinderGeometry(0.7, 1, 1, 20, 1, true), []);
  const devilTex = useMemo(() => devilStreakTexture(), []);
  const devilMats = useMemo(() => Array.from({ length: DUST_DEVIL_COUNT }, () => ({
    outer: new THREE.MeshBasicMaterial({ map: devilTex, color: '#d9b28c', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    inner: new THREE.MeshBasicMaterial({ map: devilTex, color: '#e8c9a0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  })), [devilTex]);
  const devilRefs = useRef([]);
  const haze = useMemo(() => {
    const rng = new SeedRNG(profile.seed + '-HAZE');
    const tex = hazeSpriteTexture();
    const list = [];
    for (let i = 0; i < HAZE_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: '#c98a5a', transparent: true, opacity: 0.08, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const sc = rng.range(42, 72);
      s.scale.set(sc, sc * 0.45, 1);
      const bx = rng.range(-55, 55);
      const bz = rng.range(-55, 55);
      s.position.set(bx, rng.range(7, 15), bz);
      list.push({ sprite: s, baseX: bx, baseZ: bz, phase: rng.range(0, Math.PI * 2) });
    }
    return { tex, list };
  }, [profile]);
  useEffect(() => () => {
    dust.geometry.dispose();
    dust.material.dispose();
    devilGeo.dispose();
    devilTex.dispose();
    devilMats.forEach((m) => { m.outer.dispose(); m.inner.dispose(); });
    haze.tex.dispose();
    haze.list.forEach((h) => h.sprite.material.dispose());
  }, [dust, devilGeo, devilTex, devilMats, haze]);
  useFrame(() => {
    const now = Date.now();
    updateDustField(dust, now);
    dust.material.opacity = 0.18 + 0.34 * dayF;
    const t = (now - PLANET_CGI_EPOCH_MS) / 1000;
    const vis = 0.45 + 0.55 * dayF;
    // The Thule wind pushes the haze downwind too — the same wind
    // the sand field rides (lib/mars2/weather.js).
    const wind = thuleWindAt(now);
    const windX = wind.dirX * wind.speed * 0.9;
    const windZ = wind.dirZ * wind.speed * 0.9;
    for (let i = 0; i < DUST_DEVIL_COUNT; i++) {
      const d = devilFor(i, now, DUST_DEVIL_AREA);
      const g = devilRefs.current[i];
      if (!g) continue;
      g.visible = d.alive;
      if (!d.alive) continue;
      const gy = getTerrainHeight(d.x, d.z, profile);
      g.position.set(d.x, gy + d.height / 2, d.z);
      g.rotation.y = d.spin;
      g.scale.set(d.radius, d.height, d.radius);
      devilMats[i].outer.opacity = 0.10 * d.opacity * vis;
      devilMats[i].inner.opacity = 0.24 * d.opacity * vis;
    }
    for (let i = 0; i < haze.list.length; i++) {
      const h = haze.list[i];
      h.sprite.position.x = h.baseX + Math.sin(t * 0.02 + h.phase) * 9 + windX;
      h.sprite.position.z = h.baseZ + Math.cos(t * 0.016 + h.phase) * 9 + windZ;
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.045 + h.phase * 2.3);
      h.sprite.material.opacity = (0.04 + 0.10 * breathe) * (0.45 + 0.55 * dayF);
    }
  });
  return (
    <>
      <primitive object={dust} />
      {devilMats.map((m, i) => (
        <group key={i} ref={(el) => { devilRefs.current[i] = el; }} visible={false}>
          <mesh geometry={devilGeo} material={m.outer} scale={[1.6, 1, 1.6]} />
          <mesh geometry={devilGeo} material={m.inner} scale={[0.85, 1, 0.85]} />
        </group>
      ))}
      {haze.list.map((h, i) => (
        <primitive key={i} object={h.sprite} />
      ))}
    </>
  );
}

// --- Thule wind + blowing sand --------------------------------------------
// Merlin's weather system: the Thule wind owns a direction and a
// speed that vary on the real clock (lib/mars2/weather.js), and the
// sand blows with it — 420 grains advected downwind, thicker in
// gusts, thin in the lulls. One Points field, no new lights, no
// per-frame allocations.
function Mars2Weather({ profile, dayF }) {
  const sand = useMemo(() => makeSandField({ seed: profile.seed + '-thule' }), [profile]);
  useEffect(() => () => {
    sand.geometry.dispose();
    sand.material.dispose();
  }, [sand]);
  useFrame((state, rawDt) => {
    const now = Date.now();
    const wind = thuleWindAt(now);
    updateSandField(sand, wind, Math.min(rawDt, 0.05), now, 0.45 + 0.55 * dayF);
  });
  return <primitive object={sand} />;
}

// --- starfield ---------------------------------------------------------------
function Mars2Stars({ profile, opacity }) {
  const points = useMemo(() => {
    const rng = new SeedRNG(profile.seed + '-STARS');
    const starCount = 450;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = rng.range(0, Math.PI * 2);
      const phi = rng.range(0.08, Math.PI * 0.52);
      const r = 420;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xf3e9d8, size: 1.6, map: getParticleTexture('star') || undefined, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    return new THREE.Points(starGeo, starMat);
  }, [profile]);
  useEffect(() => () => {
    points.geometry.dispose();
    points.material.dispose();
  }, [points]);
  points.material.opacity = opacity;
  return <primitive object={points} />;
}

// --- ARES outpost ------------------------------------------------------------
// The rovers' home: two habitat domes, a connector tube, a landing
// pad, a comms mast and solar panels — procedural, no models.
// Wrapped in texture (lib/mars2/textures.js): dusty habitat fabric,
// worn orange hull, scuffed pad deck, dusty solar cells, brushed
// mast. Labelled, so the walker spawns looking at somewhere to
// drive to. Layout and positions are exactly as built — texture
// only, no geometry moves.
// RED SCRATCHED-METAL WRAP (Merlin, 2026-11-15): the domes, the
// connector tube and the mast wear red scratched metal (see the
// useScratchedMaterial calls in Outpost below). The pad, its ring,
// the beacon and the solar panels keep their own materials — a
// deck, a marker, a light and PV cells are not metal hardware.

// Fallback props for a scratched wrap: the structure's exact existing
// procedural material (map + bump + roughness + metalness), so the
// surface wears what it wore before until the red texture lands.
// Every materialForHardware call site in this file tints white, so
// the fallback colour is '#ffffff' — the exact tint in use.
function scratchedFallback(mat) {
  return {
    map: mat.map,
    bumpMap: mat.bumpMap,
    bumpScale: mat.bumpScale,
    roughness: mat.roughness,
    metalness: mat.metalness,
    color: '#ffffff',
  };
}

function Outpost({ profile }) {
  const site = useMemo(() => outpostSite(profile), [profile]);
  const mats = useMemo(() => ({
    dome: materialForHardware('domeFabric', profile.seed),
    hull: materialForHardware('hullOrange', profile.seed),
    tube: materialForHardware('hullGrey', profile.seed),
    pad: materialForHardware('padDeck', profile.seed),
    mast: materialForHardware('brushedMetal', profile.seed),
    solar: materialForHardware('solarCells', profile.seed),
  }), [profile]);
  // Red scratched metal on the domes, the connector tube and the
  // mast; the fallback in each call is that part's exact existing
  // procedural material, so a surface never goes blank.
  const redDome = useScratchedMaterial('red', scratchedFallback(mats.dome));
  const redHull = useScratchedMaterial('red', scratchedFallback(mats.hull));
  const redTube = useScratchedMaterial('red', scratchedFallback(mats.tube));
  const redMast = useScratchedMaterial('red', scratchedFallback(mats.mast));
  return (
    <group position={[site.x, site.y, site.z]} rotation={[0, site.angle, 0]}>
      {/* habitat domes */}
      <mesh position={[-4, 0, 0]}>
        <meshStandardMaterial {...redDome} />
        <sphereGeometry args={[3.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[4, 0, 0]}>
        <meshStandardMaterial {...redHull} />
        <sphereGeometry args={[2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* connector tube between domes */}
      <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial {...redTube} />
        <cylinderGeometry args={[0.9, 0.9, 5.4, 16]} />
      </mesh>
      {/* landing pad + ring */}
      <mesh position={[0, 0.12, 9]} material={mats.pad}>
        <cylinderGeometry args={[5, 5, 0.24, 32]} />
      </mesh>
      <mesh position={[0, 0.26, 9]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.1, 4.6, 32]} />
        <meshBasicMaterial color="#ffb37a" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      {/* comms mast + beacon */}
      <mesh position={[-7.5, 3.5, -3]}>
        <meshStandardMaterial {...redMast} />
        <cylinderGeometry args={[0.08, 0.12, 7, 8]} />
      </mesh>
      <mesh position={[-7.5, 7.2, -3]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial color="#ff5a3c" />
      </mesh>
      {/* solar panels */}
      <mesh position={[7.5, 1.1, -3]} rotation={[0, 0.4, -0.5]} material={mats.solar}>
        <boxGeometry args={[3.4, 0.08, 2.2]} />
      </mesh>
      <mesh position={[7.5, 1.1, 2.5]} rotation={[0, 0.4, -0.5]} material={mats.solar}>
        <boxGeometry args={[3.4, 0.08, 2.2]} />
      </mesh>
      <Html position={[0, 7.5, 0]} center distanceFactor={60} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap',
          color: '#ffe3cc', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>ARES OUTPOST</div>
      </Html>
    </group>
  );
}

// --- the procedural rover ----------------------------------------------------
// Built to read as a rover, not a car: a low deck on six wheels
// with rocker arms, a camera mast up front, a high-gain dish and
// an RTG at the rear, headlights for the night drive. The model
// faces -Z (rotation.y = heading puts -Z on the forward vector).
// Wheels: steer groups (front pair yaws) around spin groups
// (rotation.x = wheelSpin) around the cylinder mesh.
const WHEEL_SPOTS = [
  { x: -0.95, z: -1.05, front: true },
  { x: 0.95, z: -1.05, front: true },
  { x: -0.95, z: 0, front: false },
  { x: 0.95, z: 0, front: false },
  { x: -0.95, z: 1.05, front: false },
  { x: 0.95, z: 1.05, front: false },
];

function RoverModel({ roverRef }) {
  const groupRef = useRef();
  const spinRefs = useRef([]);
  const steerRefs = useRef([]);
  // Wrapped in texture (lib/mars2/textures.js): dusty livery hull,
  // chevron-tread wheels, brushed mast and arms. Same rover, same
  // physics, same speed — texture only.
  const mats = useMemo(() => ({
    hull: materialForHardware('roverHull', 'MARS-2'),
    metal: materialForHardware('brushedMetal', 'MARS-2'),
    dish: materialForHardware('hullGrey', 'MARS-2', '#ffffff', { side: THREE.DoubleSide }),
    tread: materialForHardware('wheelTread', 'MARS-2'),
  }), []);
  // RED SCRATCHED-METAL WRAP (Merlin, 2026-11-15): hull, deck,
  // RTG, mast, camera head, dish, dish post, wheel hubs and
  // rocker arms wear red scratched metal; the fallback in each
  // call is that part's exact existing procedural material, so a
  // surface never goes blank. Rubber treads, camera lenses and
  // headlights keep their own materials.
  const redHull = useScratchedMaterial('red', scratchedFallback(mats.hull));
  const redMetal = useScratchedMaterial('red', scratchedFallback(mats.metal));
  const redDish = useScratchedMaterial('red', scratchedFallback(mats.dish));
  useFrame(() => {
    const g = groupRef.current;
    const rover = roverRef.current;
    if (!g) return;
    if (!rover) { g.visible = false; return; }
    g.visible = true;
    g.position.set(rover.x, rover.y, rover.z);
    g.rotation.y = rover.heading;
    for (let i = 0; i < ROVER_WHEEL_COUNT; i++) {
      const spin = spinRefs.current[i];
      if (spin) spin.rotation.x = rover.wheelSpin;
      const steer = steerRefs.current[i];
      if (steer) steer.rotation.y = rover.steer * 0.35;
    }
  });
  return (
    <group ref={groupRef} visible={false}>
      {/* chassis + deck */}
      <mesh position={[0, 0.78, 0]}>
        <meshStandardMaterial {...redHull} />
        <boxGeometry args={[1.7, 0.42, 2.9]} />
      </mesh>
      <mesh position={[0, 1.08, 0.3]}>
        <meshStandardMaterial {...redMetal} />
        <boxGeometry args={[1.3, 0.22, 1.9]} />
      </mesh>
      {/* RTG at the rear */}
      <mesh position={[0, 1.05, 1.35]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial {...redMetal} />
        <cylinderGeometry args={[0.22, 0.22, 0.7, 16]} />
      </mesh>
      {/* camera mast + head, up front */}
      <mesh position={[-0.45, 1.65, -1.15]}>
        <meshStandardMaterial {...redMetal} />
        <cylinderGeometry args={[0.05, 0.07, 1.1, 8]} />
      </mesh>
      <mesh position={[-0.45, 2.25, -1.15]}>
        <meshStandardMaterial {...redHull} />
        <boxGeometry args={[0.55, 0.2, 0.22]} />
      </mesh>
      <mesh position={[-0.62, 2.25, -1.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
        <meshBasicMaterial color="#111418" />
      </mesh>
      <mesh position={[-0.28, 2.25, -1.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
        <meshBasicMaterial color="#111418" />
      </mesh>
      {/* high-gain antenna dish, rear deck */}
      <mesh position={[0.45, 1.35, 1.0]} rotation={[0.5, 0, 0]}>
        <meshStandardMaterial {...redDish} side={THREE.DoubleSide} />
        <coneGeometry args={[0.42, 0.22, 24, 1, true]} />
      </mesh>
      <mesh position={[0.45, 1.2, 1.0]}>
        <meshStandardMaterial {...redMetal} />
        <cylinderGeometry args={[0.03, 0.03, 0.35, 8]} />
      </mesh>
      {/* headlights */}
      <mesh position={[-0.55, 0.85, -1.48]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#fff2c8" />
      </mesh>
      <mesh position={[0.55, 0.85, -1.48]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#fff2c8" />
      </mesh>
      {/* wheels on rocker arms */}
      {WHEEL_SPOTS.map((spot, i) => (
        <group key={i} position={[spot.x, ROVER_WHEEL_RADIUS_M, spot.z]}
          ref={(el) => { if (spot.front) steerRefs.current[i] = el; }}>
          <group ref={(el) => { spinRefs.current[i] = el; }}>
            <mesh rotation={[0, 0, Math.PI / 2]} material={mats.tread}>
              <cylinderGeometry args={[ROVER_WHEEL_RADIUS_M, ROVER_WHEEL_RADIUS_M, 0.3, 20]} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <meshStandardMaterial {...redMetal} />
              <cylinderGeometry args={[0.2, 0.2, 0.32, 12]} />
            </mesh>
          </group>
          {/* rocker arm up to the chassis */}
          <mesh position={[(spot.x < 0 ? 0.35 : -0.35), 0.32, 0]} rotation={[0, 0, spot.x < 0 ? -0.5 : 0.5]}>
            <meshStandardMaterial {...redMetal} />
            <boxGeometry args={[0.7, 0.08, 0.12]} />
          </mesh>
        </group>
      ))}
      <Html position={[0, 3.1, 0]} center distanceFactor={46} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 11, letterSpacing: 2, whiteSpace: 'nowrap',
          color: '#ffe3cc', textShadow: '0 1px 6px #000', fontWeight: 700,
        }}>ARES-2 ROVER</div>
      </Html>
    </group>
  );
}

// --- walk + drive rig ----------------------------------------------------------
// Walk: first-person, drag to look, stick/WASD, eye 1.7 m over the
// terrain, 3 m/s — now on the shared flat walker (lib/planet-walker.js)
// under real Mars gravity (3.71 m/s²): the eye rides the terrain on
// foot and arcs under Mars gravity in the air (Space or the page's
// JUMP button). Drive: the same keys drive the rover (fwd/back
// throttle, left/right steer) and the camera chases 7.5 m behind
// it; drag swings the chase angle. Dismount puts the walker back
// on foot beside the rover, facing the same way.
function WalkerRig({ inputRef, mode, groundHeight, walkerRef, yawRef, pitchRef, roverRef, onRoverChange, jumpRef }) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef([0, 0]);
  const chaseOffset = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const lastTelemetry = useRef(0);
  const lastSpeedKmh = useRef(0);
  const jumpQueued = useRef(false);
  const vyRef = useRef(0);
  const groundedRef = useRef(true);

  // Space jumps — walk mode only (the rover has no jump).
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !e.repeat && modeRef.current === 'walk') {
        jumpQueued.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const el = gl.domElement;
    const s = (e) => { dragging.current = true; last.current = [e.clientX, e.clientY]; };
    const m = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      if (modeRef.current === 'drive') {
        chaseOffset.current -= dx * 0.004;
      } else {
        yawRef.current -= dx * 0.0042;
        pitchRef.current = Math.max(-1.35, Math.min(1.35, pitchRef.current - dy * 0.0042));
      }
    };
    const e = () => { dragging.current = false; };
    const ts = (e2) => {
      const t = e2.touches[0];
      dragging.current = true;
      last.current = [t.clientX, t.clientY];
    };
    const tm = (e2) => {
      const t = e2.touches[0];
      if (!dragging.current) return;
      const dx = t.clientX - last.current[0];
      const dy = t.clientY - last.current[1];
      last.current = [t.clientX, t.clientY];
      if (modeRef.current === 'drive') {
        chaseOffset.current -= dx * 0.005;
      } else {
        yawRef.current -= dx * 0.005;
        pitchRef.current = Math.max(-1.35, Math.min(1.35, pitchRef.current - dy * 0.005));
      }
    };
    el.addEventListener('mousedown', s);
    window.addEventListener('mousemove', m);
    window.addEventListener('mouseup', e);
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: true });
    el.addEventListener('touchend', e);
    return () => {
      el.removeEventListener('mousedown', s);
      window.removeEventListener('mousemove', m);
      window.removeEventListener('mouseup', e);
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', e);
      camera.rotation.order = 'XYZ';
    };
  }, [camera, gl, yawRef, pitchRef]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = inputRef.current.keys;
    const rover = roverRef.current;
    if (mode === 'drive' && rover && rover.active) {
      updateRover(rover, k, dt, groundHeight, WORLD_RADIUS);
      // Chase camera: behind the rover on its heading + drag offset.
      const chaseYaw = rover.heading + chaseOffset.current;
      const bx = rover.x + Math.sin(chaseYaw) * 7.5;
      const bz = rover.z + Math.cos(chaseYaw) * 7.5;
      camera.position.set(bx, rover.y + 3.4, bz);
      camera.lookAt(rover.x, rover.y + 1.1, rover.z);
      // The walker rides with the rover, so dismount starts here.
      // A dismount never resumes a stale mid-air state.
      walkerRef.current.set(rover.x, rover.y + EYE_HEIGHT, rover.z);
      vyRef.current = 0;
      groundedRef.current = true;
      yawRef.current = rover.heading;
      const now = state.clock.elapsedTime;
      if (now - lastTelemetry.current > 0.25) {
        // Clamped + smoothed needle (lib/mars2/rovers.js): the raw
        // converter alone would jump with every 0.25 s poll and
        // cliff-dive on the rim shed, so the HUD reads the
        // smoothed value, stepped over the real poll interval.
        const dtMs = (now - lastTelemetry.current) * 1000;
        lastTelemetry.current = now;
        const nextKmh = smoothRoverSpeedKmh(lastSpeedKmh.current, roverSpeedKmh(Math.abs(rover.speed)), dtMs);
        lastSpeedKmh.current = nextKmh;
        if (onRoverChange) onRoverChange({ active: true, speedKmh: nextKmh });
      }
      return;
    }
    // Not driving: the needle rests at 0, so a fresh summon
    // starts from 0 instead of smoothing down from a stale speed.
    lastSpeedKmh.current = 0;
    // Walk (also the fallback if drive was asked for with no rover).
    const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    // The JUMP button (page HUD) arms the same edge as the Space key.
    if (jumpRef && jumpRef.current) {
      jumpQueued.current = true;
      jumpRef.current = false;
    }
    const p = walkerRef.current;
    // Mars gravity (3.71 m/s²) on the shared flat walker: the eye
    // rides the terrain on foot and arcs under real Mars gravity
    // in the air (1.21 m apex, 1.62 s hang at the shared take-off).
    const next = stepFlatWalker(
      { pos: { x: p.x, y: p.y, z: p.z }, vy: vyRef.current, grounded: groundedRef.current },
      { fwd, strafe, jump: jumpQueued.current, yaw: yawRef.current },
      dt,
      MARS_PLANET,
      groundHeight
    );
    jumpQueued.current = false;
    vyRef.current = next.vy;
    groundedRef.current = next.grounded;
    p.set(next.pos.x, next.pos.y, next.pos.z);
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD_RADIUS) { p.x *= WORLD_RADIUS / r; p.z *= WORLD_RADIUS / r; }
    camera.position.copy(p);
    camera.rotation.set(pitchRef.current, yawRef.current, 0);
  });
  return null;
}

// --- scene composition ---------------------------------------------------------
function SceneContent({ profile, timeOfDay, mode, inputRef, roverCmd, onRoverChange, jumpRef }) {
  const orbitRef = useRef();
  const walkerRef = useRef(new THREE.Vector3(WALKER_SPAWN.x, EYE_HEIGHT, WALKER_SPAWN.z));
  const yawRef = useRef(0.6);
  const pitchRef = useRef(-0.05);
  const roverRef = useRef(null);
  const dayF = mars2DayFactor(timeOfDay);
  const groundHeight = (x, z) => getTerrainHeight(x, z, profile);

  // Rover commands from the page: summon boards the rover at the
  // walker's side; dismount steps the walker out beside it and
  // leaves the rover parked where it stands.
  useEffect(() => {
    if (!roverCmd) return;
    if (roverCmd.action === 'summon') {
      const walker = {
        x: walkerRef.current.x,
        z: walkerRef.current.z,
        heading: yawRef.current,
      };
      const rover = summonRover(roverRef.current, walker);
      rover.y = groundHeight(rover.x, rover.z);
      roverRef.current = rover;
      if (onRoverChange) onRoverChange({ active: true, speedKmh: 0 });
    } else if (roverCmd.action === 'dismount') {
      const rover = roverRef.current;
      if (rover && rover.active) {
        const spot = dismountRover(rover);
        walkerRef.current.set(spot.x, groundHeight(spot.x, spot.z) + EYE_HEIGHT, spot.z);
        yawRef.current = spot.heading;
        pitchRef.current = -0.05;
        if (onRoverChange) onRoverChange({ active: false, speedKmh: 0 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roverCmd]);

  return (
    <>
      <DayNightRig shade="earth" fogDensity={0.004} />
      <Mars2Stars profile={profile} opacity={1 - dayF} />
      <Mars2Terrain profile={profile} />
      <OlympusMons profile={profile} />
      <Mars2Cgi profile={profile} dayF={dayF} />
      <Mars2Weather profile={profile} dayF={dayF} />
      <Outpost profile={profile} />
      <RoverModel roverRef={roverRef} />

      {mode === 'orbit' && (
        <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.52} minDistance={5} maxDistance={170}
          target={[0, 6, 0]} />
      )}
      {mode !== 'orbit' && (
        <WalkerRig
          inputRef={inputRef} mode={mode} groundHeight={groundHeight}
          walkerRef={walkerRef} yawRef={yawRef} pitchRef={pitchRef}
          roverRef={roverRef} onRoverChange={onRoverChange} jumpRef={jumpRef}
        />
      )}
    </>
  );
}

// --- Thule wind readout ------------------------------------------------------
// A small live pill (top-right of the stage): the wind's speed and
// compass bearing, refreshed once a second. "GUSTING" when the
// gust factor is high — so the weather is readable, not just felt.
function ThuleWindPill() {
  const [wind, setWind] = useState(() => thuleWindAt(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setWind(thuleWindAt(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, zIndex: 5,
      color: '#ffe3cc', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
      background: 'rgba(0,0,0,0.35)', padding: '6px 12px', borderRadius: 8,
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      🌬 THULE WIND {wind.speed.toFixed(0)} m/s {windCompass(wind.bearingDeg)}{wind.gust > 0.6 ? ' · GUSTING' : ''}
    </div>
  );
}

export default function Mars2Scene({
  profile, worldKey, timeOfDay = 0.32, mode = 'orbit',
  inputRef, roverCmd, onRoverChange, jumpRef,
}) {
  useKeys(inputRef);
  const [ready, setReady] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [34, 20, 46], fov: 55, near: 0.1, far: 900 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <SceneContent
          key={worldKey || profile.seed}
          profile={profile} timeOfDay={timeOfDay} mode={mode}
          inputRef={inputRef} roverCmd={roverCmd} onRoverChange={onRoverChange} jumpRef={jumpRef}
        />
      </Canvas>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#ffa658', letterSpacing: 3, fontSize: 12,
        }}>SYNTHESIZING MARS 2…</div>
      )}
      {mode !== 'orbit' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          color: '#ffe3cc', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
          background: 'rgba(0,0,0,0.35)', padding: '6px 14px', borderRadius: 8,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {mode === 'walk' ? 'STICK / WASD MOVE · DRAG LOOK · SPACE / JUMP' : 'STICK / WASD DRIVE · DRAG TO SWING CAMERA'}
        </div>
      )}
      <ThuleWindPill />
      {mode !== 'orbit' && <TouchControls inputRef={inputRef} fly={false} />}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 5 }}>
        <BackpackHud realm="mars" realmLabel="Mars 2" docked
          displayNote="Mars keeps its own arms — the pack rides along." />
      </div>
    </div>
  );
}
