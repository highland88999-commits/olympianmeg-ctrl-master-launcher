'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SeedRNG, getTerrainHeight } from '@/lib/mars/engine';
import { terrainMaterial, disposeTerrainMaterial, monsSite, monsSlopeMaterial, monsCapMaterial, hazeSpriteTexture, devilStreakTexture, DUST_DEVIL_COUNT, DUST_DEVIL_AREA, HAZE_COUNT } from '@/lib/mars/cgi';
import { makeDustField, updateDustField, devilFor, PLANET_CGI_EPOCH_MS } from '@/lib/planet-cgi/motion';
import { getParticleTexture } from '@/lib/particles/sprites';
import DayNightRig from '@/components/DayNightRig';
import BackpackHud from '@/components/backpack/BackpackHud';
import { mars2DayFactor, outpostSite, WALKER_SPAWN, EYE_HEIGHT } from '@/lib/mars2/world';
import {
  outpostDoorAngle, outpostCollide, outpostLocalToWorld, isShelteredAt,
  OUTPOST_SCALE, OUTPOST_DOOR_WEDGE_RAD, OUTPOST_DOOR_THETA,
  OUTPOST_TUBE_X0_LOCAL, OUTPOST_TUBE_X1_LOCAL,
  OUTPOST_WALKER_BODY_R_M, OUTPOST_ROVER_BODY_R_M,
} from '@/lib/mars2/world';
import { dayNightFor, dateMsForSolarTime, getDayNightPlace, rgbStr } from '@/lib/day-night';
import { makeMoonTexture } from '../HubMoon';
import { materialForHardware } from '@/lib/mars2/textures';
import { useScratchedMaterial } from '@/lib/portal/scratched-textures';
import { thuleWindAt, makeSandField, updateSandField, windCompass, sandstormAt, sandstormWarningAt } from '@/lib/mars2/weather';
import { MARS2_MAX_HP, tickMars2Health } from '@/lib/mars2/health';
// Endless free roam (Merlin, Nov 18, 2026): the ground streams in
// chunks around the camera — lib/mars2/streaming.js.
import { CHUNK_M, chunksAround, chunkHeightField } from '@/lib/mars2/streaming';
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

// --- the streaming terrain -------------------------------------------------
// Mars 2 is ENDLESS (Merlin, Nov 18, 2026): no edge, no wall, no
// turn-back. The old fixed 180 m plane is gone; the ground now
// streams in 64 m chunks around the camera, built from the same
// seeded height field the old plane used — the dunes, the basins
// and the crater rim all continue as far as the walker roams.
// The ring follows the CAMERA (walk, drive, orbit and flight all
// move it — the orbit camera can sit 200 m from the walker and
// still stay inside the 448 m ring). Chunks build a couple per
// frame so crossing a boundary never hitches, and chunks that
// leave the ring are disposed. Chunk geometry is chunk-local
// (vertices 0..64 m, the world offset on the mesh), so precision
// never degrades with distance; the regolith map tiles every
// 30 m through UVs baked in tile units, continuous across chunk
// borders, so the material's repeat is 1 here (the old plane
// repeated it 6 times across its 180 m).
function buildChunkGeometry(profile, cx, cz) {
  const field = chunkHeightField(profile, cx, cz);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(field.colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(field.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(field.indices, 1));
  geo.computeVertexNormals();
  return geo;
}

function Mars2StreamingTerrain({ profile }) {
  const { camera } = useThree();
  const groupRef = useRef();
  const chunksRef = useRef(new Map());
  const queueRef = useRef([]);
  const material = useMemo(() => {
    const m = terrainMaterial(profile);
    if (m.map) m.map.repeat.set(1, 1);
    if (m.bumpMap) m.bumpMap.repeat.set(1, 1);
    return m;
  }, [profile]);
  useEffect(() => () => {
    for (const entry of chunksRef.current.values()) entry.geometry.dispose();
    chunksRef.current.clear();
    disposeTerrainMaterial(material);
  }, [material]);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const wanted = chunksAround(camera.position.x, camera.position.z);
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const chunks = chunksRef.current;
    for (const [key, entry] of chunks) {
      if (!wantedKeys.has(key)) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
        chunks.delete(key);
      }
    }
    // Drop queued chunks the camera has already left behind, then
    // queue the missing ones — centre first, so the ground under
    // the walker builds before the far edge.
    const queue = queueRef.current.filter((k) => wantedKeys.has(k));
    for (const w of wanted) {
      if (!chunks.has(w.key) && !queue.includes(w.key)) queue.push(w.key);
    }
    queueRef.current = queue;
    let built = 0;
    while (queue.length && built < 2) {
      const key = queue.shift();
      if (chunks.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      const geometry = buildChunkGeometry(profile, cx, cz);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx * CHUNK_M, 0, cz * CHUNK_M);
      group.add(mesh);
      chunks.set(key, { mesh, geometry });
      built++;
    }
  });
  return <group ref={groupRef} />;
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
    </group>
  );
}

// --- CGI: dust, dust devils, storm haze --------------------------------------
// Same planet-cgi kit as Mars 1: the dust motes wander, the devils
// live ~40 s then reseed elsewhere, the haze breathes — all pure
// functions of the device clock. dayF dims them at night.
function Mars2Cgi({ profile, dayF }) {
  // The ambient fields follow the camera (Merlin, Nov 18, 2026 —
  // the world is endless): the dust box, the devils and the haze
  // are all local around the origin, so they ride in a group
  // parked on the camera's xz each frame. The devils' ground
  // height is still sampled at their WORLD position (camera +
  // local offset), so they stand on the dunes wherever they are.
  const followRef = useRef();
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
  useFrame((state) => {
    const cam = state.camera.position;
    if (followRef.current) followRef.current.position.set(cam.x, 0, cam.z);
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
      const gy = getTerrainHeight(cam.x + d.x, cam.z + d.z, profile);
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
    <group ref={followRef}>
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
    </group>
  );
}

// --- Thule wind + blowing sand --------------------------------------------
// Merlin's weather system: the Thule wind owns a direction and a
// speed that vary on the real clock (lib/mars2/weather.js), and the
// sand blows with it — 420 grains advected downwind, thicker in
// gusts, thin in the lulls. One Points field, no new lights, no
// per-frame allocations.
//
// Sandstorms (Merlin, Nov 17, 2026): a second, denser field wears
// the sand-textured graphic and only reads while a storm is on —
// its opacity rides the storm factor — while the ambient field
// rides the storm harder too. The storm also closes the air: the
// scene fog thickens with it (set every frame, so the rig's
// once-a-second fog re-attach never holds the clear value).
function Mars2Weather({ profile, dayF }) {
  // The sand fields follow the camera (Merlin, Nov 18, 2026 —
  // the world is endless): both Points fields are local boxes
  // around the origin, so they ride in a group parked on the
  // camera's xz each frame — the wind still blows around the
  // walker wherever they roam.
  const followRef = useRef();
  const sand = useMemo(() => makeSandField({ seed: profile.seed + '-thule' }), [profile]);
  const stormSand = useMemo(() => makeSandField({
    count: 900, width: 170, height: 10, depth: 170, yBase: 0.2,
    seed: profile.seed + '-storm', color: '#c98a5a', size: 0.3, opacity: 0.9, sprite: 'sand',
  }), [profile]);
  const { scene } = useThree();
  useEffect(() => () => {
    sand.geometry.dispose();
    sand.material.dispose();
    stormSand.geometry.dispose();
    stormSand.material.dispose();
  }, [sand, stormSand]);
  useFrame((state, rawDt) => {
    const now = Date.now();
    const cam = state.camera.position;
    if (followRef.current) followRef.current.position.set(cam.x, 0, cam.z);
    const wind = thuleWindAt(now);
    const storm = sandstormAt(now);
    const dt = Math.min(rawDt, 0.05);
    updateSandField(sand, wind, dt, now, 0.45 + 0.55 * dayF, storm.intensity);
    updateSandField(stormSand, wind, dt, now, storm.intensity, storm.intensity);
    if (scene.fog) scene.fog.density = 0.004 + storm.intensity * 0.016;
  });
  return (
    <group ref={followRef}>
      <primitive object={sand} />
      <primitive object={stormSand} />
    </group>
  );
}

// --- starfield ---------------------------------------------------------------
function Mars2Stars({ profile, opacity }) {
  // The star dome follows the camera (Merlin, Nov 18, 2026 —
  // the world is endless): a r420 dome centred on the origin
  // reads wrong a kilometre out, so the group rides on the
  // camera each frame — the stars stay overhead wherever the
  // walker roams, at the same apparent size.
  const followRef = useRef();
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
  useFrame((state) => {
    const cam = state.camera.position;
    if (followRef.current) followRef.current.position.set(cam.x, cam.y, cam.z);
  });
  points.material.opacity = opacity;
  return (
    <group ref={followRef}>
      <primitive object={points} />
    </group>
  );
}

// --- the red moon ------------------------------------------------------------
// Mars's own moon, red (Merlin, Nov 17, 2026): Merlin's photo
// surface — the same map the rig's grey moon wears — tinted
// blood-red, with a red halo, on the rig's real moon direction,
// so it hangs where the moonlight comes from. Its light IS the
// rig's moonlight, tinted red via moonColor on the rig tag. Gone
// by day and at new moon, like the moonlight it already drives —
// a new moon gives no light, red or otherwise.
function Mars2RedMoon({ timeOfDay }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const dn = useMemo(() => {
    const place = getDayNightPlace();
    const dateMs = Number.isFinite(timeOfDay)
      ? dateMsForSolarTime(timeOfDay, place.lat, place.lon, now)
      : now;
    return dayNightFor(dateMs, place.lat, place.lon);
  }, [now, timeOfDay]);
  const moonMaps = useMemo(() => makeMoonTexture(), []);
  const glowTex = useMemo(() => getParticleTexture('glow') || undefined, []);
  const vis = dn.palette.night
    * Math.max(0, Math.min(1, dn.moon.illum))
    * Math.max(0, Math.min(1, dn.moon.altDeg / 20));
  // The moon follows the camera (Merlin, Nov 18, 2026 — the
  // world is endless): the disc sits at moonVec*380 from the
  // group's origin, so the group rides on the camera each frame
  // and the moon stays in the true moon direction from the
  // walker's eye, at a constant apparent size, at any distance.
  const followRef = useRef();
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (followRef.current) followRef.current.position.set(camera.position.x, camera.position.y, camera.position.z);
  });
  if (vis <= 0.01 || dn.moon.altDeg < -2) return null;
  const pos = [dn.moonVec.x * 380, dn.moonVec.y * 380, dn.moonVec.z * 380];
  return (
    <group ref={followRef}>
      <mesh position={pos}>
        <sphereGeometry args={[9, 32, 32]} />
        <meshBasicMaterial map={moonMaps.map} color="#ff6a4a" fog={false} transparent opacity={0.95 * vis} depthWrite={false} />
      </mesh>
      <sprite position={pos} scale={[110, 110, 1]}>
        <spriteMaterial map={glowTex} color="#ff4a2a" fog={false} transparent opacity={0.4 * vis} depthWrite={false} />
      </sprite>
    </group>
  );
}

// --- the sun, following the camera -------------------------------------------
// Mars 2 is endless (Merlin, Nov 18, 2026): the rig's sun disc sits
// at sunVec*380 from the ORIGIN, so far from home it hangs in the
// wrong place. Mars 2 draws its own sun instead — the same law the
// rig's disc used (core disc + glow halo, same sizes, same
// opacities), centred on the camera, so the disc always sits in the
// true sun direction from the walker's eye, at a constant apparent
// size. The rig tag runs with sun off; it still owns the daylight,
// the moonlight and the fog.
function Mars2Sun({ timeOfDay }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const dn = useMemo(() => {
    const place = getDayNightPlace();
    const dateMs = Number.isFinite(timeOfDay)
      ? dateMsForSolarTime(timeOfDay, place.lat, place.lon, now)
      : now;
    return dayNightFor(dateMs, place.lat, place.lon);
  }, [now, timeOfDay]);
  const glowTex = useMemo(() => getParticleTexture('glow') || undefined, []);
  const sunVis = Math.max(0, Math.min(1, dn.palette.sunIntensity / 0.9));
  const groupRef = useRef();
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (groupRef.current) groupRef.current.position.set(camera.position.x, camera.position.y, camera.position.z);
  });
  if (sunVis <= 0.01) return null;
  const pos = [dn.sunVec.x * 380, dn.sunVec.y * 380, dn.sunVec.z * 380];
  return (
    <group ref={groupRef}>
      <mesh position={pos}>
        <sphereGeometry args={[6, 20, 20]} />
        <meshBasicMaterial color={rgbStr(dn.palette.sunColor)} fog={false} transparent opacity={0.95 * sunVis} depthWrite={false} />
      </mesh>
      <sprite position={pos} scale={[64, 64, 1]}>
        <spriteMaterial map={glowTex} color={rgbStr(dn.palette.sunColor)} fog={false} transparent opacity={0.55 * sunVis} depthWrite={false} />
      </sprite>
    </group>
  );
}


// --- the orbit target --------------------------------------------------------
// Orbit mode looks at the walker, not the origin (Merlin, Nov 18,
// 2026 — the world is endless; the origin is just where home is).
// The target follows the walker's feet every frame, so the camera
// orbits wherever the walker has roamed to.
function OrbitTargetFollower({ orbitRef, walkerRef }) {
  useFrame(() => {
    const controls = orbitRef.current;
    const p = walkerRef.current;
    if (!controls || !p) return;
    controls.target.set(p.x, p.y, p.z);
  });
  return null;
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

// A terrain-hugging interior floor: a radial fan centred on the
// big dome whose vertices sit 8 cm over the dirt, so the floor
// never floats over a dip or lets a dune poke through it. The
// fan is in local coords; floorY converts local (lx, lz) to the
// local floor height above the site.
function buildInteriorFloor(floorY) {
  const cx = -4;
  const cz = 0;
  const rings = [0, 0.8, 1.6, 2.4, 3.0];
  const segs = 16;
  const positions = [cx, floorY(cx, cz), cz];
  const uvs = [0.5, 0.5];
  const index = [];
  for (let r = 1; r < rings.length; r++) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const lx = cx + Math.cos(a) * rings[r];
      const lz = cz + Math.sin(a) * rings[r];
      positions.push(lx, floorY(lx, lz), lz);
      uvs.push(0.5 + (Math.cos(a) * rings[r]) / 6, 0.5 + (Math.sin(a) * rings[r]) / 6);
    }
  }
  for (let i = 0; i < segs; i++) {
    index.push(0, 1 + ((i + 1) % segs), 1 + i);
  }
  for (let r = 1; r < rings.length - 1; r++) {
    const base = 1 + (r - 1) * segs;
    const next = base + segs;
    for (let i = 0; i < segs; i++) {
      const a = base + i;
      const b = base + ((i + 1) % segs);
      const c = next + i;
      const d = next + ((i + 1) % segs);
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// A lit window on a dome: a warm plane on the shell at (phi,
// theta) — the quaternion turns its +Z to the outward normal, so
// it sits flush on the curve. Part of why the domes read at
// night now (Merlin's Nov 17 phone check: pure black silhouettes).
function DomeWindow({ cx, phi, theta, radius }) {
  const q = useMemo(() => {
    const n = new THREE.Vector3(
      -Math.cos(phi) * Math.sin(theta),
      Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
    ).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }, [phi, theta]);
  const pos = useMemo(() => ([
    cx - Math.cos(phi) * Math.sin(theta) * radius,
    Math.cos(theta) * radius,
    Math.sin(phi) * Math.sin(theta) * radius,
  ]), [cx, phi, theta, radius]);
  return (
    <mesh position={pos} quaternion={q}>
      <planeGeometry args={[0.55, 0.38]} />
      <meshBasicMaterial color="#ffca7a" />
    </mesh>
  );
}

// --- the airlock door --------------------------------------------------------
// OUTPOST ROUND 2 (Merlin, Nov 17, 2026): "One should not be able to
// see inside unless they are inside the outpost." The doorway stood
// open — from outside, at the right angle, the lit room showed
// straight through the airlock. The door closes that: a real panel
// in the airlock mouth, closed by default, swinging open (inward,
// flat against the corridor wall) when the walker comes within
// 1.5 m, closing again when they leave. The trigger is tight on
// purpose: the walker spawns ~2.1 m from the mouth, so a 3 m
// trigger would leave the door standing open from the first
// frame — and the room visible from outside, the thing this
// door exists to stop. At 1.5 m it is closed at spawn and opens
// as the walker steps up to it. It is visual only — the
// collision law already blocks wall-passing, and the door opens
// before the walker reaches it, so it never traps anyone. The
// panel is the outpost's own red scratched hull, with an amber
// strip so the door reads at night.
const AIRLOCK_DOOR_OPEN_M = 1.5; // walker this close swings the door open
const AIRLOCK_DOOR_CLOSE_M = 2.0; // ...and this far lets it close again
// Swung exactly 90°: the panel lies flat against the corridor's
// -Z wall, fully inside the 1.4 m corridor — any further and its
// tip would clip through the wall.
const AIRLOCK_DOOR_OPEN_RAD = Math.PI / 2;

function AirlockDoor({ site, walkerRef, doorMat }) {
  const pivotRef = useRef();
  const angleRef = useRef(0);
  const openRef = useRef(false);
  const mouth = useMemo(() => outpostLocalToWorld(-8.62, 0, site), [site]);
  useFrame((state, dt) => {
    const p = walkerRef && walkerRef.current;
    const pivot = pivotRef.current;
    if (!p || !pivot) return;
    const d = Math.hypot(p.x - mouth.x, p.z - mouth.z);
    if (d < AIRLOCK_DOOR_OPEN_M) openRef.current = true;
    else if (d > AIRLOCK_DOOR_CLOSE_M) openRef.current = false;
    const target = openRef.current ? AIRLOCK_DOOR_OPEN_RAD : 0;
    const cur = angleRef.current;
    angleRef.current = cur + (target - cur) * Math.min(1, Math.max(0, dt) * 5);
    pivot.rotation.y = angleRef.current;
  });
  return (
    <group position={[-8.55, 0, -0.57]} ref={pivotRef}>
      {/* the panel: 1.14 m wide, 1.74 m tall, hinged on the -Z post;
          it spans the doorway (z -0.57..+0.57 from the hinge) */}
      <mesh position={[0, 0.87, 0.57]}>
        <meshStandardMaterial {...doorMat} />
        <boxGeometry args={[0.08, 1.74, 1.14]} />
      </mesh>
      {/* amber strip on the panel — the door reads after dark */}
      <mesh position={[-0.05, 1.2, 0.57]}>
        <boxGeometry args={[0.02, 0.06, 0.7]} />
        <meshBasicMaterial color="#ffb37a" />
      </mesh>
    </group>
  );
}

function Outpost({ profile, walkerRef }) {
  const site = useMemo(() => outpostSite(profile), [profile]);
  const angle = useMemo(() => outpostDoorAngle(site), [site]);
  const mats = useMemo(() => ({
    dome: materialForHardware('domeFabric', profile.seed),
    hull: materialForHardware('hullOrange', profile.seed),
    tube: materialForHardware('hullGrey', profile.seed),
    pad: materialForHardware('padDeck', profile.seed),
    mast: materialForHardware('brushedMetal', profile.seed),
    solar: materialForHardware('solarCells', profile.seed),
    // Interior: warm canvas floor, warm inner shell, wood-tone
    // crates, brushed console, blue bunks, green plant corner.
    floor: materialForHardware('domeFabric', profile.seed, '#d9b98a', { side: THREE.DoubleSide }),
    interior: materialForHardware('domeFabric', profile.seed, '#f5e3c2', { side: THREE.BackSide }),
    skirt: materialForHardware('hullGrey', profile.seed, '#8a6a4a', { side: THREE.DoubleSide }),
    crate: materialForHardware('hullGrey', profile.seed, '#c9a06a'),
    console: materialForHardware('brushedMetal', profile.seed, '#cfd6dd'),
    bunk: materialForHardware('domeFabric', profile.seed, '#7a9cc9'),
    plant: materialForHardware('domeFabric', profile.seed, '#5a8a4a'),
  }), [profile]);
  // Red scratched metal on the domes, the connector tube and the
  // mast; the fallback in each call is that part's exact existing
  // procedural material, so a surface never goes blank.
  const redDome = useScratchedMaterial('red', scratchedFallback(mats.dome));
  const redHull = useScratchedMaterial('red', scratchedFallback(mats.hull));
  const redTube = useScratchedMaterial('red', scratchedFallback(mats.tube));
  const redMast = useScratchedMaterial('red', scratchedFallback(mats.mast));
  // Interior floor heights: local y for a local (lx, lz), hugging
  // the dirt — the group's rotation is what maps local to world.
  const floorY = useMemo(() => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return (lx, lz) => {
      const wx = site.x + (lx * c + lz * s) * OUTPOST_SCALE;
      const wz = site.z + (-lx * s + lz * c) * OUTPOST_SCALE;
      return (getTerrainHeight(wx, wz, profile) + 0.08 - site.y) / OUTPOST_SCALE;
    };
  }, [site, angle, profile]);
  const floorGeo = useMemo(() => buildInteriorFloor(floorY), [floorY]);
  useEffect(() => () => { floorGeo.dispose(); }, [floorGeo]);
  // The portal ring faces -X (out of the door): +Z to -X.
  const doorQ = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0),
  ), []);
  return (
    <group position={[site.x, site.y, site.z]} rotation={[0, angle, 0]} scale={OUTPOST_SCALE}>
      {/* habitat domes — the big one carries the doorway wedge.
          The domes read at night now: a faint warm emissive lift
          on the metal, so they never go pure black again. */}
      <mesh position={[-4, 0, 0]}>
        <meshStandardMaterial {...redDome} emissive="#201009" />
        <sphereGeometry args={[3.2, 32, 16, -OUTPOST_DOOR_WEDGE_RAD / 2, Math.PI * 2 - OUTPOST_DOOR_WEDGE_RAD, 0, Math.PI / 2]} />
      </mesh>
      {/* wedge patch above the lintel: the doorway is door-high, not dome-high */}
      <mesh position={[-4, 0, 0]}>
        <meshStandardMaterial {...redDome} emissive="#201009" />
        <sphereGeometry args={[3.2, 8, 6, -OUTPOST_DOOR_WEDGE_RAD / 2, OUTPOST_DOOR_WEDGE_RAD, 0, OUTPOST_DOOR_THETA]} />
      </mesh>
      {/* inner shell: what you see from inside (BackSide) + its patch */}
      <mesh position={[-4, 0, 0]} material={mats.interior}>
        <sphereGeometry args={[3.12, 32, 16, -OUTPOST_DOOR_WEDGE_RAD / 2, Math.PI * 2 - OUTPOST_DOOR_WEDGE_RAD, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[-4, 0, 0]} material={mats.interior}>
        <sphereGeometry args={[3.12, 8, 6, -OUTPOST_DOOR_WEDGE_RAD / 2, OUTPOST_DOOR_WEDGE_RAD, 0, OUTPOST_DOOR_THETA]} />
      </mesh>
      {/* interior floor, hugging the dirt */}
      <mesh geometry={floorGeo} material={mats.floor} />
      {/* foundation skirts: the domes sit on the dirt, no daylight under the walls */}
      <mesh position={[-4, 0.12, 0]} material={mats.skirt}>
        <cylinderGeometry args={[3.35, 3.45, 0.7, 32, 1, true]} />
      </mesh>
      <mesh position={[4, 0.12, 0]} material={mats.skirt}>
        <cylinderGeometry args={[2.55, 2.65, 0.7, 32, 1, true]} />
      </mesh>
      {/* glowing rims on the skirt tops — the outpost's feet read at night */}
      <mesh position={[-4, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.36, 0.035, 8, 48]} />
        <meshBasicMaterial color="#ff8a3c" />
      </mesh>
      <mesh position={[4, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.56, 0.035, 8, 48]} />
        <meshBasicMaterial color="#ff8a3c" />
      </mesh>
      {/* airlock tunnel out of the big dome's door, facing the spawn */}
      <mesh position={[-7.9, 0.87, -0.63]}>
        <meshStandardMaterial {...redTube} />
        <boxGeometry args={[1.4, 1.74, 0.12]} />
      </mesh>
      <mesh position={[-7.9, 0.87, 0.63]}>
        <meshStandardMaterial {...redTube} />
        <boxGeometry args={[1.4, 1.74, 0.12]} />
      </mesh>
      <mesh position={[-7.9, 1.8, 0]}>
        <meshStandardMaterial {...redTube} />
        <boxGeometry args={[1.4, 0.12, 1.38]} />
      </mesh>
      <mesh position={[-7.9, floorY(-7.9, 0) + 0.05, 0]} material={mats.floor}>
        <boxGeometry args={[1.4, 0.1, 1.26]} />
      </mesh>
      {/* the portal: a glowing ring in the airlock mouth + frame posts.
          Round 2: the ring is bigger (0.6 m) so it frames the doorway
          instead of floating inside it, and a lit lintel strip marks
          the entry after dark — the portal must read as a door. */}
      <mesh position={[-8.62, 0.95, 0]} quaternion={doorQ} scale={[1, 1.4, 1]}>
        <torusGeometry args={[0.6, 0.06, 8, 24]} />
        <meshBasicMaterial color="#ff7a2a" />
      </mesh>
      {/* the airlock door: closed by default, opens on approach —
          the interior is visible only from inside (or at the door). */}
      <AirlockDoor site={site} walkerRef={walkerRef} doorMat={redHull} />
      <mesh position={[-8.62, 0.9, -0.62]}>
        <meshStandardMaterial {...redMast} />
        <boxGeometry args={[0.1, 1.8, 0.1]} />
      </mesh>
      {/* lit lintel strip under the header — the doorway reads after dark */}
      <mesh position={[-8.62, 1.72, 0]}>
        <boxGeometry args={[0.04, 0.04, 1.2]} />
        <meshBasicMaterial color="#ffb37a" />
      </mesh>
      <mesh position={[-8.62, 0.9, 0.62]}>
        <meshStandardMaterial {...redMast} />
        <boxGeometry args={[0.1, 1.8, 0.1]} />
      </mesh>
      <mesh position={[-8.62, 1.8, 0]}>
        <meshStandardMaterial {...redMast} />
        <boxGeometry args={[0.1, 0.12, 1.34]} />
      </mesh>
      {/* lit windows — the domes read at night */}
      <DomeWindow cx={-4} phi={1.1} theta={1.1} radius={3.22} />
      <DomeWindow cx={-4} phi={2.2} theta={1.0} radius={3.22} />
      <DomeWindow cx={-4} phi={-1.1} theta={1.15} radius={3.22} />
      <DomeWindow cx={-4} phi={-2.2} theta={1.05} radius={3.22} />
      <DomeWindow cx={4} phi={1.3} theta={1.0} radius={2.42} />
      <DomeWindow cx={4} phi={-1.3} theta={1.0} radius={2.42} />
      {/* interior decor: bunks, table + chairs, console, greenhouse, crates */}
      {/* bunks — two stacked, against the -Z wall */}
      <mesh position={[-5.2, floorY(-5.2, -1.9) + 0.35, -1.9]} material={mats.crate}>
        <boxGeometry args={[1.9, 0.1, 0.85]} />
      </mesh>
      <mesh position={[-5.2, floorY(-5.2, -1.9) + 0.43, -1.9]} material={mats.bunk}>
        <boxGeometry args={[1.85, 0.12, 0.8]} />
      </mesh>
      <mesh position={[-5.2, floorY(-5.2, -1.9) + 1.0, -1.9]} material={mats.crate}>
        <boxGeometry args={[1.9, 0.1, 0.85]} />
      </mesh>
      <mesh position={[-5.2, floorY(-5.2, -1.9) + 1.08, -1.9]} material={mats.bunk}>
        <boxGeometry args={[1.85, 0.12, 0.8]} />
      </mesh>
      <mesh position={[-6.05, floorY(-5.2, -1.9) + 0.65, -1.9]} material={mats.crate}>
        <boxGeometry args={[0.08, 1.3, 0.08]} />
      </mesh>
      <mesh position={[-4.35, floorY(-5.2, -1.9) + 0.65, -1.9]} material={mats.crate}>
        <boxGeometry args={[0.08, 1.3, 0.08]} />
      </mesh>
      {/* table + two chairs */}
      <mesh position={[-3.2, floorY(-3.2, 1.2) + 0.72, 1.2]} material={mats.crate}>
        <boxGeometry args={[1.4, 0.08, 0.9]} />
      </mesh>
      <mesh position={[-3.8, floorY(-3.2, 1.2) + 0.36, 0.85]} material={mats.crate}>
        <boxGeometry args={[0.07, 0.72, 0.07]} />
      </mesh>
      <mesh position={[-2.6, floorY(-3.2, 1.2) + 0.36, 0.85]} material={mats.crate}>
        <boxGeometry args={[0.07, 0.72, 0.07]} />
      </mesh>
      <mesh position={[-3.8, floorY(-3.2, 1.2) + 0.36, 1.55]} material={mats.crate}>
        <boxGeometry args={[0.07, 0.72, 0.07]} />
      </mesh>
      <mesh position={[-2.6, floorY(-3.2, 1.2) + 0.36, 1.55]} material={mats.crate}>
        <boxGeometry args={[0.07, 0.72, 0.07]} />
      </mesh>
      <mesh position={[-3.2, floorY(-3.2, 1.2) + 0.42, 0.35]} material={mats.crate}>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
      </mesh>
      <mesh position={[-3.2, floorY(-3.2, 1.2) + 0.67, 0.12]} material={mats.crate}>
        <boxGeometry args={[0.45, 0.5, 0.06]} />
      </mesh>
      <mesh position={[-3.2, floorY(-3.2, 1.2) + 0.42, 2.05]} material={mats.crate}>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
      </mesh>
      <mesh position={[-3.2, floorY(-3.2, 1.2) + 0.67, 2.28]} material={mats.crate}>
        <boxGeometry args={[0.45, 0.5, 0.06]} />
      </mesh>
      {/* console with two glowing screens, facing the room */}
      <mesh position={[-2.8, floorY(-2.8, -1.6) + 0.78, -1.6]} rotation={[0, 0.6, 0]} material={mats.console}>
        <boxGeometry args={[1.5, 0.08, 0.6]} />
      </mesh>
      <mesh position={[-3.35, floorY(-2.8, -1.6) + 0.39, -1.85]} material={mats.console}>
        <boxGeometry args={[0.07, 0.78, 0.07]} />
      </mesh>
      <mesh position={[-2.25, floorY(-2.8, -1.6) + 0.39, -1.35]} material={mats.console}>
        <boxGeometry args={[0.07, 0.78, 0.07]} />
      </mesh>
      <mesh position={[-3.05, floorY(-2.8, -1.6) + 1.18, -1.5]} rotation={[-0.35, 0.6, 0]}>
        <planeGeometry args={[0.55, 0.35]} />
        <meshBasicMaterial color="#7fd4ff" />
      </mesh>
      <mesh position={[-2.55, floorY(-2.8, -1.6) + 1.18, -1.75]} rotation={[-0.35, 0.6, 0]}>
        <planeGeometry args={[0.55, 0.35]} />
        <meshBasicMaterial color="#9dffb0" />
      </mesh>
      {/* greenhouse rack with grow-light strip */}
      <mesh position={[-5.0, floorY(-5.0, 1.6) + 0.5, 1.6]} material={mats.crate}>
        <boxGeometry args={[1.6, 0.06, 0.5]} />
      </mesh>
      <mesh position={[-5.0, floorY(-5.0, 1.6) + 1.1, 1.6]} material={mats.crate}>
        <boxGeometry args={[1.6, 0.06, 0.5]} />
      </mesh>
      <mesh position={[-5.75, floorY(-5.0, 1.6) + 0.6, 1.6]} material={mats.crate}>
        <boxGeometry args={[0.06, 1.2, 0.5]} />
      </mesh>
      <mesh position={[-4.25, floorY(-5.0, 1.6) + 0.6, 1.6]} material={mats.crate}>
        <boxGeometry args={[0.06, 1.2, 0.5]} />
      </mesh>
      <mesh position={[-5.4, floorY(-5.0, 1.6) + 0.66, 1.6]} material={mats.plant}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      <mesh position={[-4.6, floorY(-5.0, 1.6) + 0.66, 1.6]} material={mats.plant}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      <mesh position={[-5.4, floorY(-5.0, 1.6) + 1.26, 1.6]} material={mats.plant}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      <mesh position={[-4.6, floorY(-5.0, 1.6) + 1.26, 1.6]} material={mats.plant}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      <mesh position={[-5.0, floorY(-5.0, 1.6) + 1.45, 1.6]}>
        <boxGeometry args={[1.6, 0.04, 0.12]} />
        <meshBasicMaterial color="#ff9dff" />
      </mesh>
      {/* storage crates, stacked by the door */}
      <mesh position={[-6.4, floorY(-6.2, 0.8) + 0.3, 0.6]} material={mats.crate}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
      </mesh>
      <mesh position={[-5.8, floorY(-6.2, 0.8) + 0.3, 1.0]} material={mats.crate}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
      </mesh>
      <mesh position={[-6.1, floorY(-6.2, 0.8) + 0.9, 0.8]} material={mats.crate}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
      </mesh>
      {/* interior lights: ceiling + console corner, warm; the porch
          light over the door spills onto the dome's flank at night */}
      <pointLight position={[-4, 2.3, 0]} color="#ffc98a" intensity={10} distance={12} decay={2} />
      <pointLight position={[-2.6, 1.9, 1.5]} color="#ffd9a0" intensity={5} distance={8} decay={2} />
      <pointLight position={[-9.2, 2.1, 0]} color="#ffb37a" intensity={6} distance={10} decay={2} />
      {/* ceiling light strip — the visible source of the ceiling light */}
      <mesh position={[-4, 2.55, 0]}>
        <boxGeometry args={[2.2, 0.06, 0.3]} />
        <meshBasicMaterial color="#ffd9a0" />
      </mesh>
      {/* smaller dome */}
      <mesh position={[4, 0, 0]}>
        <meshStandardMaterial {...redHull} emissive="#201009" />
        <sphereGeometry args={[2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* connector tube between domes — wall-to-wall only
          (OUTPOST_TUBE_X0/X1_LOCAL): it must not poke into either
          room. Round 2: the old 5.4 m tube stuck 1.9 local into
          the big dome and read as a dark red dome inside the room. */}
      <mesh position={[(OUTPOST_TUBE_X0_LOCAL + OUTPOST_TUBE_X1_LOCAL) / 2, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial {...redTube} />
        <cylinderGeometry args={[0.9, 0.9, OUTPOST_TUBE_X1_LOCAL - OUTPOST_TUBE_X0_LOCAL, 16]} />
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
    if (!rover) {
      g.visible = false;
      return;
    }
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
function WalkerRig({ inputRef, mode, groundHeight, walkerRef, yawRef, pitchRef, roverRef, onRoverChange, jumpRef, outpost }) {
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
      updateRover(rover, k, dt, groundHeight);
      // The outpost's domes and tube are solid to the rover too —
      // it cannot drive through the habitat (or into the doorway,
      // which is walker-sized). Re-ground after the push.
      if (outpost) {
        const c = outpostCollide(rover.x, rover.z, outpost, OUTPOST_ROVER_BODY_R_M);
        rover.x = c.x; rover.z = c.z;
        rover.y = groundHeight(rover.x, rover.z);
      }
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
        // Smoothed needle (lib/mars2/rovers.js): the raw converter
        // alone would jump with every 0.25 s poll, so the HUD reads
        // the smoothed value, stepped over the real poll interval.
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
    // No rim clamp: the world is endless (Merlin, Nov 18, 2026) —
    // the walker roams as far as they like and the ground streams
    // on under them.
    // The outpost's domes and tube are solid — the doorway is the
    // way in, not through a wall. Re-ground after the push when
    // the walker is on foot (a push can move them across a dune).
    if (outpost) {
      const c = outpostCollide(p.x, p.z, outpost, OUTPOST_WALKER_BODY_R_M);
      p.x = c.x; p.z = c.z;
      if (groundedRef.current) p.y = groundHeight(p.x, p.z) + EYE_HEIGHT;
    }
    camera.position.copy(p);
    camera.rotation.set(pitchRef.current, yawRef.current, 0);
  });
  return null;
}

// --- screen-space world labels (clamped inside the stage) --------
// Merlin, Nov 17: the 3D labels must stay inside the frame and
// clear of the controls. drei Html centres on the anchor, so an
// anchor at the frame's edge clipped half the label (and
// distanceFactor blew it up at close range). These project the
// anchor to screen space every frame and clamp the label's
// centre inside the stage, so the whole label always reads.
// The rover label only exists while a rover does.
const WORLD_LABELS = [
  { key: 'mons', text: 'OLYMPUS MONS' },
  { key: 'outpost', text: 'ARES OUTPOST' },
  { key: 'rover', text: 'ARES-2 ROVER' },
];

function LabelProjector({ profile, roverRef, labelRef }) {
  const { camera, size } = useThree();
  const mons = useMemo(() => monsSite(profile), [profile]);
  const outpost = useMemo(() => outpostSite(profile), [profile]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const nodes = labelRef.current.nodes || {};
    const place = (key, x, y, z) => {
      const node = nodes[key];
      if (!node) return;
      tmp.set(x, y, z).project(camera);
      if (tmp.z > 1) { node.style.visibility = 'hidden'; return; }
      const sx = (tmp.x * 0.5 + 0.5) * size.width;
      const sy = (-tmp.y * 0.5 + 0.5) * size.height;
      const w = node.offsetWidth || 120;
      const h = node.offsetHeight || 17;
      const cx = Math.max(w / 2 + 6, Math.min(size.width - w / 2 - 6, sx));
      const cy = Math.max(h / 2 + 6, Math.min(size.height - h / 2 - 6, sy));
      node.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      node.style.visibility = 'visible';
    };
    place('mons', mons.x, mons.y - mons.sink + mons.height + 3.5, mons.z);
    place('outpost', outpost.x, outpost.y + 7.5 * OUTPOST_SCALE, outpost.z);
    const rover = roverRef.current;
    if (rover) place('rover', rover.x, rover.y + 3.1, rover.z);
    else if (nodes.rover) nodes.rover.style.visibility = 'hidden';
  });
  return null;
}

// --- storm health ------------------------------------------------------------
// OUTPOST ROUND 2 (Merlin, Nov 17, 2026): being exposed to a
// sandstorm drains health. The ticker runs inside the Canvas (it
// needs the walker's live position): every half-second it reads
// the storm, checks shelter — inside the outpost (big dome room
// or airlock passage) or in the ship's enclosed orb — and ticks
// the health law (lib/mars2/health.js). The rover does NOT
// shelter: it is open, so driving through a storm still drains.
// Orbit mode is a spectator camera, not a body — the ticker
// skips it entirely. At 0 HP the walker respawns on foot at the
// back to 100, and the page is told (onRespawn) to drop the mode
// to walk. HP changes reach the HUD through onHpChange (throttled
// to whole points, like the rover telemetry).
function Mars2HealthTicker({ walkerRef, yawRef, modeRef, outpost, onHpChange, onRespawn }) {
  const hpRef = useRef(MARS2_MAX_HP);
  const accRef = useRef(0);
  const lastSentRef = useRef(MARS2_MAX_HP);
  useFrame((state, dt) => {
    accRef.current += Math.min(Math.max(dt, 0), 0.05);
    if (accRef.current < 0.5) return;
    const step = accRef.current;
    accRef.current = 0;
    const p = walkerRef.current;
    if (!p) return;
    const storm = sandstormAt(Date.now());
    // Orbit mode is a spectator camera, not a body on the dunes:
    // no drain and no regen while orbiting. Walk/drive are bodies
    // (the rover does not shelter — it is open); fly is the
    // ship's enclosed orb, which shelters.
    const mode = modeRef.current;
    if (mode !== 'walk' && mode !== 'drive' && mode !== 'fly') return;
    const sheltered = mode === 'fly' || isShelteredAt(p.x, p.z, outpost);
    const next = tickMars2Health(hpRef.current, { dt: step, stormIntensity: storm.intensity, sheltered });
    hpRef.current = next.hp;
    if (next.died) {
      hpRef.current = MARS2_MAX_HP;
      p.set(WALKER_SPAWN.x, EYE_HEIGHT, WALKER_SPAWN.z);
      yawRef.current = 0.6;
      if (onRespawn) onRespawn();
    }
    if (Math.abs(hpRef.current - lastSentRef.current) >= 1 || next.died) {
      lastSentRef.current = hpRef.current;
      if (onHpChange) onHpChange({ hp: Math.round(hpRef.current), maxHp: MARS2_MAX_HP });
    }
  });
  return null;
}

// --- scene composition ---------------------------------------------------------
function SceneContent({ profile, timeOfDay, mode, inputRef, roverCmd, onRoverChange, jumpRef, labelRef, onHpChange, onRespawn }) {
  const orbitRef = useRef();
  const walkerRef = useRef(new THREE.Vector3(WALKER_SPAWN.x, EYE_HEIGHT, WALKER_SPAWN.z));
  const yawRef = useRef(0.6);
  const pitchRef = useRef(-0.05);
  const roverRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const dayF = mars2DayFactor(timeOfDay);
  const groundHeight = (x, z) => getTerrainHeight(x, z, profile);
  const outpost = useMemo(() => outpostSite(profile), [profile]);

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
      // A summon never lands the rover inside the outpost's domes
      // or tube — the walker may be standing in the doorway.
      const c = outpostCollide(rover.x, rover.z, outpost, OUTPOST_ROVER_BODY_R_M);
      rover.x = c.x; rover.z = c.z;
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
      {/* The page's timeOfDay drives the rig's cycle (the TIME
          slider + presets move the real sun). The rig runs with
          sun OFF — Mars 2 draws its own sun disc (Mars2Sun below),
          which follows the camera so it stays in the true sun
          direction at any distance. moonColor red: Mars's nights
          are lit red by its moon (the red moon disc below rides
          the same direction). */}
      <DayNightRig shade="earth" fogDensity={0.004} timeOfDay={timeOfDay} moonColor="#ff5040" moonIntensity={2.5} />
      <Mars2Sun timeOfDay={timeOfDay} />
      <Mars2RedMoon timeOfDay={timeOfDay} />
      {/* cool fill from the opposite side so the night never goes
          black (the Mars 1 pattern — same light, same reason). */}
      <directionalLight position={[-40, 24, 40]} intensity={0.18} color="#7a86a8" />
      <Mars2Stars profile={profile} opacity={1 - dayF} />
      <Mars2StreamingTerrain profile={profile} />
      <OlympusMons profile={profile} />
      <Mars2Cgi profile={profile} dayF={dayF} />
      <Mars2Weather profile={profile} dayF={dayF} />
      <Outpost profile={profile} walkerRef={walkerRef} />
      {/* Storm health: the ticker watches the storm + shelter and
          reports HP to the page; death respawns at the outpost. */}
      <Mars2HealthTicker walkerRef={walkerRef} yawRef={yawRef} modeRef={modeRef} outpost={outpost} onHpChange={onHpChange} onRespawn={onRespawn} />
      <RoverModel roverRef={roverRef} />
      <LabelProjector profile={profile} roverRef={roverRef} labelRef={labelRef} />

      {mode === 'orbit' && (
        <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.52} minDistance={5} maxDistance={200}
          target={[0, 6, 0]} />
      )}
      {mode === 'orbit' && (
        <OrbitTargetFollower orbitRef={orbitRef} walkerRef={walkerRef} />
      )}
      {mode !== 'orbit' && (
        <WalkerRig
          inputRef={inputRef} mode={mode} groundHeight={groundHeight}
          walkerRef={walkerRef} yawRef={yawRef} pitchRef={pitchRef}
          roverRef={roverRef} onRoverChange={onRoverChange} jumpRef={jumpRef}
          outpost={outpost}
        />
      )}
    </>
  );
}

// --- Thule wind readout ------------------------------------------------------
// A small live pill down the right side of the stage (second row,
// under the roverbar and the fullscreen orb — never behind them):
// the wind's speed and compass bearing, refreshed once a second.
// "GUSTING" when the gust factor is high — so the weather is
// readable, not just felt. A sandstorm rides the same pill — no
// new HUD chrome (orb law) — as "· SANDSTORM" while one is on.
function ThuleWindPill() {
  const [wind, setWind] = useState(() => thuleWindAt(Date.now()));
  const [storm, setStorm] = useState(() => sandstormAt(Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      setWind(thuleWindAt(Date.now()));
      setStorm(sandstormAt(Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      position: 'absolute', top: 96, right: 10, zIndex: 5,
      color: '#ffe3cc', fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
      background: 'rgba(0,0,0,0.35)', padding: '6px 12px', borderRadius: 8,
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      🌬 THULE WIND {wind.speed.toFixed(0)} m/s {windCompass(wind.bearingDeg)}{wind.gust > 0.6 ? ' · GUSTING' : ''}{storm.active ? ' · SANDSTORM' : ''}
    </div>
  );
}

// --- storm warning + health pills -------------------------------------------
// OUTPOST ROUND 2 (Merlin, Nov 17, 2026): "a warning before
// windstorms to get inside should occur, with a 2 minute warning."
// The banner polls the same 1 s clock as the Thule pill and shows
// only inside the 120 s lead: a countdown to the storm's first
// sand and the words GET INSIDE THE OUTPOST. It sits centred
// below the Thule + HP pills (top 172), so it never covers them.
// The HP pill sits under the Thule pill (top 132): the walker's
// health, green to red as it falls.
function StormWarningBanner() {
  const [warn, setWarn] = useState(() => sandstormWarningAt(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setWarn(sandstormWarningAt(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  if (!warn.warning) return null;
  const s = Math.max(0, Math.ceil(warn.secondsUntil || 0));
  const mm = String(Math.floor(s / 60)).padStart(1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <div style={{
      position: 'absolute', top: 172, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
      color: '#fff3e0', fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
      textShadow: '0 1px 4px #000', textAlign: 'center',
      background: 'rgba(160, 40, 0, 0.72)', padding: '8px 14px', borderRadius: 8,
      border: '1px solid #ff8a3c', pointerEvents: 'none',
      maxWidth: '92%', lineHeight: 1.4,
    }}>
      ⚠ SANDSTORM IN {mm}:{ss} — GET INSIDE THE OUTPOST
    </div>
  );
}

function Mars2HpPill({ hp, maxHp }) {
  const pct = maxHp > 0 ? hp / maxHp : 1;
  const color = pct > 0.5 ? '#ffe3cc' : pct > 0.25 ? '#ffb37a' : '#ff6a5a';
  return (
    <div style={{
      position: 'absolute', top: 132, right: 10, zIndex: 5,
      color, fontSize: 11, letterSpacing: 2, textShadow: '0 1px 4px #000',
      background: 'rgba(0,0,0,0.35)', padding: '6px 12px', borderRadius: 8,
      pointerEvents: 'none', whiteSpace: 'nowrap', fontWeight: 700,
    }}>
      ♥ {hp}
    </div>
  );
}

export default function Mars2Scene({
  profile, worldKey, timeOfDay = 0.32, mode = 'orbit',
  inputRef, roverCmd, onRoverChange, jumpRef,
  onRespawn,
}) {
  useKeys(inputRef);
  const [ready, setReady] = useState(false);
  // Storm health (round 2): the in-Canvas ticker reports HP here;
  // the pill above the stage shows it, and death drops the mode
  // to walk at the page (onRespawn).
  const [hp, setHp] = useState(MARS2_MAX_HP);
  const handleHpChange = (next) => {
    if (next && Number.isFinite(next.hp)) setHp(Math.round(next.hp));
  };
  // The world labels' DOM nodes, shared with the projector
  // inside the Canvas (it positions them every frame).
  const labelRef = useRef({ nodes: {} });
  // The Canvas props are constants — memoised so a page
  // re-render (rover telemetry every 0.25 s) never hands R3F a
  // fresh camera object and re-applies the start position over
  // the chase camera. The start sits pulled back (46, 26, 62)
  // so orbit mode opens on the whole reach — outpost and label
  // clear in frame — instead of parked against them.
  const cameraProps = useMemo(() => ({ position: [46, 26, 62], fov: 55, near: 0.1, far: 900 }), []);
  const dprProps = useMemo(() => [1, 1.75], []);
  const glProps = useMemo(() => ({ antialias: true, powerPreference: 'high-performance' }), []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={dprProps}
        camera={cameraProps}
        gl={glProps}
        onCreated={() => setReady(true)}
      >
        <SceneContent
          key={worldKey || profile.seed}
          profile={profile} timeOfDay={timeOfDay} mode={mode}
          inputRef={inputRef} roverCmd={roverCmd} onRoverChange={onRoverChange} jumpRef={jumpRef}
          labelRef={labelRef}
          onHpChange={handleHpChange} onRespawn={onRespawn}
        />
      </Canvas>
      {/* World labels — screen-space, clamped inside the stage by
          the projector (see LabelProjector above). Plain divs, no
          z-index, so they sit under the HUD pills. */}
      {WORLD_LABELS.map(({ key, text }) => (
        <div key={key}
          ref={(el) => { labelRef.current.nodes[key] = el; }}
          style={{
            position: 'absolute', left: 0, top: 0, pointerEvents: 'none',
            fontSize: 11, letterSpacing: 3, whiteSpace: 'nowrap',
            color: '#ffe3cc', textShadow: '0 1px 6px #000', fontWeight: 700,
            visibility: 'hidden', willChange: 'transform',
          }}>
          {text}
        </div>
      ))}
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#ffa658', letterSpacing: 3, fontSize: 12,
        }}>SYNTHESIZING MARS 2…</div>
      )}
      {/* No hint pill here: the roverbar above already carries the
          instructions, and a centred pill at the top only ever
          hid behind it. The one stick is the core's WalkJoystick
          (bottom-left, fixed) — the scene's own TouchControls
          stick is gone, so there is exactly one joystick and it
          is the one wired to the walker and the rover. */}
      <ThuleWindPill />
      {/* Round 2: walker health (from the storm ticker) + the
          2-minute storm warning — get inside before the sand hits. */}
      <Mars2HpPill hp={hp} maxHp={MARS2_MAX_HP} />
      <StormWarningBanner />
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 5 }}>
        <BackpackHud realm="mars" realmLabel="Mars 2" docked
          displayNote="Mars keeps its own arms — the pack rides along." />
      </div>
    </div>
  );
}
