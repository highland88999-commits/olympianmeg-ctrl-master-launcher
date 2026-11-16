// app/babel/cgi.js — procedural CGI layer for the BABEL GTA district (Nov 15, 2026).
//
// What was flat (verified in code before building):
//   - Ground: one 1024px canvas stretched over 600 m — flat asphalt, no grain,
//     no wear, lane dashes drawn straight through the plaza, no crosswalks.
//     (Fixed in babel-district.js: grain, cracks, oil stains, zebra
//     crosswalks on the ±44 m roads, plaza pavers, gold inlay ring.)
//   - Buildings: an InstancedMesh of flat-colour boxes. The district data even
//     computes `windows: rand() > 0.25` per building — and nothing ever rendered
//     it. (Fixed by the shared layer: lib/gta/city-cgi.js materialForFacade,
//     already wired in gta-scene.js — not duplicated here.)
//   - Sky: a flat THREE.Color lerped day/night. No dome, no sun disc, no
//     clouds, no stars. (Fixed here — Babel's own gold palette, distinct
//     from the shared CITY_SKY blue Mega City uses.)
//   - Life: none. 8 parked cars, 2 cops that only exist while wanted. No
//     traffic, no pedestrians. (Fixed here — Babel-geometry operators.)
//   - Cars: box body + box cabin. No wheels, no headlights, no taillights.
//     (Fixed by the shared layer: buildVehicleMesh / buildCopMesh, already
//     wired in gta-scene.js — not duplicated here.)
//   - Tower: flat stone/glass. The vault sign was a blank dark box.
//     (Fixed here: seeded stone with gold veining, streaked glass; the
//     sign is lettered in babel-district.js.)
//
// House idiom (lib/planet-cgi/textures.js, lib/mars2/textures.js,
// app/star-wars/cgi.js): seeded colour + bump DataTextures (256x256,
// cached, node-safe, no canvas, no network); operators as pure
// functions of place/kind/device clock (same instant = same street
// on every phone).
//
// Babel's identity, distinct from Mega City's big-city feel and
// Truman's small-town feel: a golden tower district. Warm gold
// horizon by day, deep indigo night with the tower's gold still
// glowing, gold dust in the air, lit windows warm gold.
//
// NO new real lights anywhere (emissive maps + MeshBasicMaterial
// only — the standing rule). NO mechanics touched: missions, wanted,
// driving, walking, HUD, collisions, vehicle boarding and the vault
// door all live in gta-scene.js / lib/gta/ exactly as before.
// Traffic and pedestrians are ambient life: they yield (hold
// position) when the player or a parked car is in their way, but
// they carry no colliders — true traffic collision would need a
// shared-system change in lib/gta/ (vehicle.js / player.js take
// only static colliders), which belongs to the Mega City worker.
// See the follow-up note in the build report.

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../../lib/earth4/creature-textures.js';
import { PLANET_CGI_EPOCH_MS, spinAngle } from '../../lib/planet-cgi/motion.js';
import { buildVehicleMesh, buildPedestrianMesh } from '../../lib/gta/city-cgi.js';

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// ── spec: pure data, no THREE, no DOM ─────────────────────────────

export const BABEL_CGI = {
  id: 'babel',
  // One sun — Babel is not Tatooine. Low, golden, warm.
  sun: { color: 0xffe9b0, scale: 170 },
  sky: { top: 0x5ea9e8, horizon: 0xf2c979, bottom: 0x6b5a3a },
  night: { top: 0x070a1e, horizon: 0x2a1e3a, bottom: 0x0a0812 },
  clouds: { count: 12, yMin: 120, yMax: 200, radius: 420, color: 0xfff6e0, opacity: 0.7, driftRate: 0.004 },
  motes: { count: 180, color: 0xffd98a, size: 0.12, opacity: 0.55, area: 90, height: 12 },
  stars: { count: 350, radius: 850 },
  // Ring road the traffic loops: the road centreline at ±140 m
  // (grid lines -300 + 44k; buildings never reach the road — their
  // blocks end 7 m short of the centreline either side).
  trafficLoopHalf: 140,
  trafficLane: 3.5,
  trafficCount: 6,
  pedestrianCount: 10,
  pedestrianRing: 40, // plaza ring, between the gold inlay (35) and the trees (47)
};

/** The full CGI spec for Babel — a fresh object every call. */
export function babelCgiSpec() {
  return {
    id: BABEL_CGI.id,
    sun: { ...BABEL_CGI.sun },
    sky: { ...BABEL_CGI.sky },
    night: { ...BABEL_CGI.night },
    clouds: { ...BABEL_CGI.clouds },
    motes: { ...BABEL_CGI.motes },
    stars: { ...BABEL_CGI.stars },
    trafficLoopHalf: BABEL_CGI.trafficLoopHalf,
    trafficLane: BABEL_CGI.trafficLane,
    trafficCount: BABEL_CGI.trafficCount,
    pedestrianCount: BABEL_CGI.pedestrianCount,
    pedestrianRing: BABEL_CGI.pedestrianRing,
  };
}

// ── the Babel breeze (weather where it fits) ───────────────────────
// Gentle, gold-dust weather — not a Martian gale. Same rhythm as the
// Thule wind (47 s gusts, ±20° veer over 4 min), Babel's own numbers:
// base 2.5 m/s, gusts 1–6 m/s, prevailing FROM the west-northwest
// (285°) so the dust drifts across the plaza toward the tower's
// east face. Pure function of the device clock.

export const BABEL_WIND = {
  bearingDeg: 285,
  veerDeg: 20,
  veerPeriodS: 240,
  baseMps: 2.5,
  gustMinMps: 1,
  gustMaxMps: 6,
  gustPeriodS: 47,
};

export function babelWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const gustWave = 0.62 * Math.sin((t / BABEL_WIND.gustPeriodS) * Math.PI * 2)
    + 0.38 * Math.sin((t / 13.7) * Math.PI * 2 + 1.3);
  const speed = Math.max(
    BABEL_WIND.gustMinMps,
    Math.min(BABEL_WIND.gustMaxMps, BABEL_WIND.baseMps + gustWave * 1.8),
  );
  const bearingDeg = BABEL_WIND.bearingDeg
    + BABEL_WIND.veerDeg * Math.sin((t / BABEL_WIND.veerPeriodS) * Math.PI * 2 + 0.7);
  // Travel vector: a wind FROM bearingDeg travels toward bearingDeg + 180.
  const rad = ((bearingDeg + 180) * Math.PI) / 180;
  const dirX = -Math.sin(rad);
  const dirZ = Math.cos(rad);
  return {
    speed,
    bearingDeg,
    dirX,
    dirZ,
    gust: (speed - BABEL_WIND.gustMinMps) / (BABEL_WIND.gustMaxMps - BABEL_WIND.gustMinMps),
  };
}

// ── operators: pure functions of place/kind/device clock ──────────
// Babel's grid is 44 m (not Mega City's 40 m) and its centre is a
// 55 m plaza, so the shared city operators (40 m road centres,
// block-sidewalk rings) would drive through Babel's buildings.
// These two are cut to Babel's own geometry.

// Ring-road traffic. The loop is the square (±H, ±H); clockwise cars
// ride the outer lane (H + lane), counter-clockwise the inner lane
// (H - lane) — both stay on the 14 m road. Position is a pure
// function of the clock: s = phase + speed * t around the perimeter.
export const TRAFFIC_LOOP_PERIMETER = 8 * BABEL_CGI.trafficLoopHalf;

function trafficSeed(index) {
  const rnd = mulberry32(hashString(`babel:traffic:${index}`));
  return {
    speed: 8 + rnd() * 4, // 8–12 m/s, city pace
    dir: index < 3 ? 1 : -1,
    phase: rnd() * TRAFFIC_LOOP_PERIMETER,
  };
}

function pointOnLoop(s, half) {
  // Square corners in order: (H,-H) -> (H,H) -> (-H,H) -> (-H,-H).
  const side = 2 * half;
  const seg = Math.floor(s / side) % 4;
  const f = (s % side) / side;
  if (seg === 0) return { x: half, z: -half + f * side, heading: 0 };
  if (seg === 1) return { x: half - f * side, z: half, heading: -Math.PI / 2 };
  if (seg === 2) return { x: -half, z: half - f * side, heading: Math.PI };
  return { x: -half + f * side, z: -half, heading: Math.PI / 2 };
}

/**
 * Traffic car `index` at `nowMs`: { x, z, heading, speed, dir }.
 * Heading follows the loop tangent (atan2 convention shared with
 * lib/gta/vehicle.js: forward = (sin h, cos h)). Deterministic.
 */
export function trafficFor(index, nowMs = Date.now()) {
  const seed = trafficSeed(index);
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const half = BABEL_CGI.trafficLoopHalf + seed.dir * BABEL_CGI.trafficLane;
  const perimeter = 8 * half;
  let s = (seed.phase + seed.speed * t) % perimeter;
  if (s < 0) s += perimeter;
  if (seed.dir < 0) s = perimeter - s;
  const p = pointOnLoop(s, half);
  const heading = seed.dir > 0 ? p.heading : p.heading + Math.PI;
  return { x: p.x, z: p.z, heading, speed: seed.speed, dir: seed.dir, index };
}

// Plaza pedestrians. They walk the plaza ring (radius 40), half each
// way, at a strolling 1.0–1.6 m/s. walkPhase 0..1 drives the bob.
export function pedestrianFor(index, nowMs = Date.now()) {
  const rnd = mulberry32(hashString(`babel:pedestrian:${index}`));
  const speed = 1.0 + rnd() * 0.6;
  const dir = index % 2 === 0 ? 1 : -1;
  const phase0 = rnd() * Math.PI * 2;
  const r = BABEL_CGI.pedestrianRing;
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const angle = phase0 + dir * (speed / r) * t;
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  // Tangent heading: velocity dir is (-sin a, cos a) * dir.
  const heading = Math.atan2(-Math.sin(angle) * dir, Math.cos(angle) * dir);
  const walkPhase = ((t * speed * 1.4 + phase0) % 1 + 1) % 1;
  return { x, z, heading, walkPhase, speed, dir, index };
}

// ── textures: seeded colour + bump DataTextures, cached ────────────
// Only the tower's own stone + glass live here. Facades, vehicles,
// cops, harbour water and the shared sky builders live in
// lib/gta/city-cgi.js and are reused, never re-painted.

function makeMaps(size, paint, seedKey) {
  const W = size;
  const H = size;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const seedInt = hashString(seedKey);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = paint(x / W, y / H, { seed: seedInt });
      const i = (y * W + x) * 4;
      color[i] = px.r; color[i + 1] = px.g; color[i + 2] = px.b; color[i + 3] = 255;
      bump[y * W + x] = clamp255(px.bump);
    }
  }
  const map = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.DataTexture(bump, W, H, THREE.RedFormat);
  bumpMap.needsUpdate = true;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

/** Tower stone: dark panels with gold veining + speckle. */
export function babelStoneMaps(seed = 2026) {
  const key = `babel:stone:${seed}`;
  if (babelStoneMaps.cache.has(key)) return babelStoneMaps.cache.get(key);
  const { map, bumpMap } = makeMaps(256, (u, v, n) => {
    const gx = Math.abs(((u * 4) % 1) - 0.5);
    const gy = Math.abs(((v * 6) % 1) - 0.5);
    const seam = (gx > 0.47 || gy > 0.47) ? 1 : 0;
    const vein = fbm(u * 9 + 5, v * 9 + 11, n.seed);
    const gold = vein > 0.86 ? 1 : 0;
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const r = 42 - seam * 12 + (grain - 0.5) * 14 + gold * 120;
    const g = 45 - seam * 12 + (grain - 0.5) * 14 + gold * 92;
    const b = 56 - seam * 12 + (grain - 0.5) * 14 + gold * 40;
    const bump = 128 + (grain - 0.5) * 26 - seam * 40 + gold * 20;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump };
  }, key);
  const out = { map, bumpMap, roughness: 0.75, bumpScale: 0.03 };
  babelStoneMaps.cache.set(key, out);
  return out;
}
babelStoneMaps.cache = new Map();

/** Tower glass bands: dark blue-grey with vertical rain-washed streaks. */
export function babelGlassMaps(seed = 2026) {
  const key = `babel:glass:${seed}`;
  if (babelGlassMaps.cache.has(key)) return babelGlassMaps.cache.get(key);
  const { map, bumpMap } = makeMaps(256, (u, v, n) => {
    const streak = valueNoise(u * 90, v * 6, n.seed);
    const sheen = fbm(u * 4, v * 12, n.seed);
    const l = 0.85 + (streak > 0.9 ? 0.35 : 0) + (sheen - 0.5) * 0.2;
    return {
      r: clamp255(26 * l), g: clamp255(35 * l), b: clamp255(50 * l),
      bump: 128 + (streak - 0.5) * 30,
    };
  }, key);
  const out = { map, bumpMap, roughness: 0.15, bumpScale: 0.02 };
  babelGlassMaps.cache.set(key, out);
  return out;
}
babelGlassMaps.cache = new Map();

// Radial glow sprite (sun disc, star points) — painted, not canvas.
export function babelGlowTexture() {
  if (babelGlowTexture.cache) return babelGlowTexture.cache;
  const W = 64;
  const H = 64;
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2;
      const dy = (y / H - 0.5) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, 1 - d);
      const i = (y * W + x) * 4;
      color[i] = 255; color[i + 1] = 244; color[i + 2] = 220;
      color[i + 3] = Math.round(255 * a * a);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  babelGlowTexture.cache = tex;
  return tex;
}
babelGlowTexture.cache = null;

// Puffy cloud billboard sprite — fbm blobs on transparency.
export function babelCloudTexture(seed = 'babel-cloud') {
  if (babelCloudTexture.cache) return babelCloudTexture.cache;
  const W = 128;
  const H = 128;
  const color = new Uint8Array(W * H * 4);
  const seedInt = hashString(`babel:cloud:${seed}`);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const puff = fbm(u * 5 + 3, v * 4 + 7, seedInt);
      const puff2 = fbm(u * 11 + 9, v * 9 + 2, seedInt);
      const edge = 1 - Math.hypot(u - 0.5, (v - 0.5) * 1.6) * 2.2;
      const a = clamp01((puff - 0.42) * 2.4 + (puff2 - 0.5) * 0.5) * clamp01(edge);
      const i = (y * W + x) * 4;
      color[i] = 255; color[i + 1] = 255; color[i + 2] = 255;
      color[i + 3] = Math.round(255 * a * 0.85);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  babelCloudTexture.cache = tex;
  return tex;
}
babelCloudTexture.cache = null;

// ── shared materials (cached; callers never dispose them) ─────────

export function materialForBabelStone(seed = 2026) {
  const key = `stone|${seed}`;
  if (materialForBabelStone.cache.has(key)) return materialForBabelStone.cache.get(key);
  const maps = babelStoneMaps(seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map, bumpMap: maps.bumpMap, bumpScale: maps.bumpScale,
    roughness: maps.roughness, metalness: 0.25,
  });
  m.userData.shared = true;
  materialForBabelStone.cache.set(key, m);
  return m;
}
materialForBabelStone.cache = new Map();

export function materialForBabelGlass(seed = 2026) {
  const key = `glass|${seed}`;
  if (materialForBabelGlass.cache.has(key)) return materialForBabelGlass.cache.get(key);
  const maps = babelGlassMaps(seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map, bumpMap: maps.bumpMap, bumpScale: maps.bumpScale,
    roughness: maps.roughness, metalness: 0.85,
  });
  m.userData.shared = true;
  materialForBabelGlass.cache.set(key, m);
  return m;
}
materialForBabelGlass.cache = new Map();

// ── sky + life group ───────────────────────────────────────────────

function buildSkyDome(THREE_, spec) {
  const R = 900;
  const geo = new THREE_.SphereGeometry(R, 28, 16);
  const top = new THREE_.Color(spec.sky.top);
  const hor = new THREE_.Color(spec.sky.horizon);
  const bot = new THREE_.Color(spec.sky.bottom);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE_.Color();
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) / R + 1) / 2;
    if (y01 < 0.5) c.copy(bot).lerp(hor, y01 * 2);
    else c.copy(hor).lerp(top, (y01 - 0.5) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE_.BufferAttribute(colors, 3));
  const mat = new THREE_.MeshBasicMaterial({
    vertexColors: true, side: THREE_.BackSide, fog: false, depthWrite: false,
  });
  const dome = new THREE_.Mesh(geo, mat);
  dome.name = 'babel-sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  dome.userData.dayColors = { top, hor, bot };
  dome.userData.nightColors = {
    top: new THREE_.Color(spec.night.top),
    hor: new THREE_.Color(spec.night.horizon),
    bot: new THREE_.Color(spec.night.bottom),
  };
  return dome;
}

/**
 * Build the whole Babel CGI layer: sky dome, one golden sun sprite,
 * drifting clouds, night stars, gold-dust motes on the breeze,
 * ring-road traffic and plaza pedestrians. Traffic cars and
 * pedestrians reuse the shared mesh builders from lib/gta/city-cgi.js
 * (one car builder for every GTA scene); the sky, wind and operators
 * are Babel's own.
 *
 * Returns { group, spec, update, dispose }. update(nowMs, ctx) is a
 * pure function of the clock + observer: ctx = { player: {x, z},
 * dayness (0 night .. 1 day), sunDir: {x, y, z}, parked: [{x, z}],
 * dt (frame seconds, for wheel spin) }.
 * Traffic holds position when the player or a parked car is in its
 * way (yield — no pass-through theatre); pedestrians sidestep the
 * player on the plaza ring.
 */
export function buildBabelCgi(THREE_, opts = {}) {
  const THREE = THREE_ || THREE;
  const spec = babelCgiSpec();
  const group = new THREE.Group();
  group.name = 'babel-cgi';

  const dome = buildSkyDome(THREE, spec);
  group.add(dome);

  // The one golden sun.
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: babelGlowTexture(), color: spec.sun.color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunSprite.name = 'babel-sun';
  sunSprite.scale.set(spec.sun.scale, spec.sun.scale, 1);
  group.add(sunSprite);

  // Night stars (upper hemisphere only).
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(spec.stars.count * 3);
  const starRnd = mulberry32(hashString('babel:stars'));
  for (let i = 0; i < spec.stars.count; i++) {
    const a = starRnd() * Math.PI * 2;
    const el = Math.asin(starRnd() * 0.95 + 0.05);
    const r = spec.stars.radius;
    starPos[i * 3] = Math.cos(a) * Math.cos(el) * r;
    starPos[i * 3 + 1] = Math.sin(el) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xfff6dd, size: 2.2, sizeAttenuation: false, transparent: true,
    opacity: 0, map: babelGlowTexture(), depthWrite: false, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'babel-stars';
  stars.frustumCulled = false;
  group.add(stars);

  // Drifting cloud billboards.
  const clouds = new THREE.Group();
  clouds.name = 'babel-clouds';
  const cloudTex = babelCloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, color: spec.clouds.color, transparent: true,
    opacity: spec.clouds.opacity, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const cloudRnd = mulberry32(hashString('babel:clouds'));
  const cloudGeo = new THREE.PlaneGeometry(110, 44);
  for (let i = 0; i < spec.clouds.count; i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    const a = cloudRnd() * Math.PI * 2;
    const r = spec.clouds.radius * (0.55 + cloudRnd() * 0.45);
    m.position.set(
      Math.cos(a) * r,
      spec.clouds.yMin + cloudRnd() * (spec.clouds.yMax - spec.clouds.yMin),
      Math.sin(a) * r,
    );
    m.lookAt(0, m.position.y, 0);
    const s = 0.7 + cloudRnd() * 0.9;
    m.scale.set(s, s * (0.8 + cloudRnd() * 0.4), 1);
    m.name = 'babel-cloud';
    clouds.add(m);
  }
  clouds.userData.driftRate = spec.clouds.driftRate;
  group.add(clouds);

  // Gold-dust motes, following the observer, advected by the breeze.
  const moteCfg = spec.motes;
  const moteRnd = mulberry32(hashString('babel:motes'));
  const moteBase = new Float32Array(moteCfg.count * 3);
  const motePhase = new Float32Array(moteCfg.count);
  const moteFactor = new Float32Array(moteCfg.count);
  for (let i = 0; i < moteCfg.count; i++) {
    moteBase[i * 3] = (moteRnd() - 0.5) * moteCfg.area;
    moteBase[i * 3 + 1] = 0.3 + moteRnd() * moteCfg.height;
    moteBase[i * 3 + 2] = (moteRnd() - 0.5) * moteCfg.area;
    motePhase[i] = moteRnd() * Math.PI * 2;
    moteFactor[i] = 0.5 + moteRnd() * 0.9;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(moteBase), 3));
  moteGeo.userData.moteBase = moteBase;
  moteGeo.userData.motePhase = motePhase;
  moteGeo.userData.moteFactor = moteFactor;
  moteGeo.userData.moteCount = moteCfg.count;
  moteGeo.userData.moteArea = moteCfg.area;
  moteGeo.userData.moteHeight = moteCfg.height;
  moteGeo.userData.moteBaseOpacity = moteCfg.opacity;
  const moteMat = new THREE.PointsMaterial({
    color: moteCfg.color, size: moteCfg.size, transparent: true,
    opacity: moteCfg.opacity, depthWrite: false, sizeAttenuation: true,
    map: babelGlowTexture(),
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.name = 'babel-motes';
  motes.frustumCulled = false;
  group.add(motes);

  // Traffic: shared car builder, seeded Babel body colours.
  const trafficMeshes = [];
  const trafficColors = [0x8a6a2f, 0x2a2d38, 0xd4a24e, 0x4a5568, 0x1a1a1a, 0x7a2a20];
  const trafficTypes = ['sedan', 'taxi', 'sports', 'sedan', 'truck', 'sedan'];
  for (let i = 0; i < spec.trafficCount; i++) {
    const car = buildVehicleMesh(trafficTypes[i % trafficTypes.length], trafficColors[i % trafficColors.length]);
    car.name = 'babel-traffic';
    car.userData.trafficIndex = i;
    car.userData.lastX = null;
    car.userData.lastZ = null;
    group.add(car);
    trafficMeshes.push(car);
  }

  // Pedestrians: shared builder, seeded Babel coat colours.
  const pedMeshes = [];
  const coatColors = [0x8a6a2f, 0x4a5568, 0x7a2a20, 0x2d5a27, 0x5a4a7a, 0x9a7a3a, 0x333a44, 0xa88a5a, 0x6a3a4a, 0x3a5a6a];
  for (let i = 0; i < spec.pedestrianCount; i++) {
    const p = buildPedestrianMesh(coatColors[i % coatColors.length]);
    p.name = 'babel-pedestrian';
    p.userData.pedestrianIndex = i;
    group.add(p);
    pedMeshes.push(p);
  }

  const dayCol = new THREE.Color();
  const nightCol = new THREE.Color();

  function update(nowMs, ctx = {}) {
    const now = nowMs != null ? nowMs : Date.now();
    const dayness = clamp01(ctx.dayness != null ? ctx.dayness : 1);
    const nightness = 1 - dayness;
    const player = ctx.player || { x: 0, z: 0 };
    const parked = ctx.parked || [];
    const sunDir = ctx.sunDir || { x: 0, y: 1, z: 0 };

    // Sky dome: blend the day gradient into the night gradient.
    const pos = dome.geometry.getAttribute('position');
    const colors = dome.geometry.getAttribute('color');
    const dc = dome.userData.dayColors;
    const nc = dome.userData.nightColors;
    const R = 900;
    for (let i = 0; i < pos.count; i++) {
      const y01 = (pos.getY(i) / R + 1) / 2;
      if (y01 < 0.5) {
        dayCol.copy(dc.bot).lerp(dc.hor, y01 * 2);
        nightCol.copy(nc.bot).lerp(nc.hor, y01 * 2);
      } else {
        dayCol.copy(dc.hor).lerp(dc.top, (y01 - 0.5) * 2);
        nightCol.copy(nc.hor).lerp(nc.top, (y01 - 0.5) * 2);
      }
      dayCol.lerp(nightCol, nightness);
      colors.setXYZ(i, dayCol.r, dayCol.g, dayCol.b);
    }
    colors.needsUpdate = true;

    // The one golden sun rides the district's own sun vector.
    const sunUp = sunDir.y > -0.05;
    sunSprite.visible = sunUp;
    if (sunUp) {
      sunSprite.position.set(sunDir.x * 880, Math.max(sunDir.y, 0.02) * 880, sunDir.z * 880);
      sunSprite.material.opacity = 0.35 + 0.65 * dayness;
    }

    // Stars fade in at night; clouds drift on the real clock and dim.
    starMat.opacity = nightness * 0.9;
    clouds.rotation.y = spinAngle(clouds.userData.driftRate, now);
    cloudMat.color.setRGB(
      0.16 + 0.84 * dayness, 0.18 + 0.82 * dayness, 0.32 + 0.68 * dayness,
    );
    cloudMat.opacity = spec.clouds.opacity * (0.35 + 0.65 * dayness);

    // Gold dust: advected downwind by the Babel breeze, wrapping in
    // a box around the observer; dimmer at night.
    const wind = babelWindAt(now);
    const t = (now - PLANET_CGI_EPOCH_MS) / 1000;
    const attr = moteGeo.getAttribute('position');
    const arr = attr.array;
    const area = moteGeo.userData.moteArea;
    const wrap = (v, h) => (((v + h / 2) % h) + h) % h - h / 2;
    for (let i = 0; i < moteGeo.userData.moteCount; i++) {
      const f = moteGeo.userData.moteFactor[i];
      const p = moteGeo.userData.motePhase[i];
      arr[i * 3] = wrap(moteBase[i * 3] + wind.dirX * wind.speed * f * t, area);
      arr[i * 3 + 1] = Math.max(0.15, moteBase[i * 3 + 1] + Math.sin(t * 0.07 + p * 1.7) * 0.3);
      arr[i * 3 + 2] = wrap(moteBase[i * 3 + 2] + wind.dirZ * wind.speed * f * t, area);
    }
    attr.needsUpdate = true;
    motes.position.set(player.x, 0, player.z);
    moteMat.opacity = moteGeo.userData.moteBaseOpacity * (0.35 + 0.65 * dayness);

    // Traffic: clock position, held when the player or a parked car
    // is in the way (yield — the car waits rather than driving
    // through something solid).
    for (const car of trafficMeshes) {
      const st = trafficFor(car.userData.trafficIndex, now);
      let blocked = false;
      const pdx = player.x - st.x;
      const pdz = player.z - st.z;
      if (pdx * pdx + pdz * pdz < 81) blocked = true; // 9 m
      if (!blocked) {
        for (const v of parked) {
          const dx = v.x - st.x;
          const dz = v.z - st.z;
          if (dx * dx + dz * dz < 49) { blocked = true; break; } // 7 m
        }
      }
      if (blocked && car.userData.lastX != null) {
        car.position.set(car.userData.lastX, 0, car.userData.lastZ);
      } else {
        car.position.set(st.x, 0, st.z);
        car.rotation.y = st.heading;
        car.userData.lastX = st.x;
        car.userData.lastZ = st.z;
      }
      // Wheels spin with road speed (shared builder stores them).
      if (car.userData.wheels) {
        const step = (st.speed * (ctx.dt != null ? ctx.dt : 1 / 60)) / 0.42;
        for (const w of car.userData.wheels) w.rotation.x += step;
      }
    }

    // Pedestrians: clock position on the plaza ring, sidestepping
    // the player (push radially outward) and bobbing as they walk.
    for (const p of pedMeshes) {
      const st = pedestrianFor(p.userData.pedestrianIndex, now);
      let { x, z } = st;
      const dx = x - player.x;
      const dz = z - player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (3 - d) * 1.2;
        x += (dx / d) * push;
        z += (dz / d) * push;
      }
      p.position.set(x, Math.abs(Math.sin(st.walkPhase * Math.PI)) * 0.08, z);
      p.rotation.y = st.heading;
      // Legs swing with the walk phase (shared builder stores them).
      if (p.userData.legs) {
        const swing = Math.sin(st.walkPhase * Math.PI * 2) * 0.5;
        p.userData.legs.left.rotation.x = swing;
        p.userData.legs.right.rotation.x = -swing;
      }
    }
  }

  function dispose() {
    // Shared cached textures/materials are NOT owned here — they
    // live in the module caches. Everything else is freed.
    const sharedMaps = new Set([babelGlowTexture(), babelCloudTexture()]);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && !m.userData.shared) {
            if (m.map && !sharedMaps.has(m.map)) m.map.dispose();
            m.dispose();
          }
        }
      }
    });
  }

  return { group, spec, update, dispose };
}
