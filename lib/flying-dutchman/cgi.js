// lib/flying-dutchman/cgi.js — the CGI makeover for the Flying Dutchman
// (Merlin, Nov 15, 2026).
//
// The upgrade here is the SEA and the SKY — storms over open water, and
// the ship herself. The operators already exist (operators.js,
// humanoid-operators.js) and are left exactly as they are.
//
// HOUSE RULES, kept:
// - Procedural only, no new assets, no spending. Seeded DataTextures
//   (the planet-cgi idiom: lib/planet-cgi/textures.js) — node-safe,
//   deterministic, the same storm on every phone.
// - Pure functions of the device clock (the planet-cgi law:
//   lib/planet-cgi/motion.js, lib/jupiter2/storm.js): the storm
//   breathes, veers and flashes on the clock, so every phone stands
//   in the same squall at the same moment. The scene only renders
//   what these say.
// - NO NEW REAL LIGHTS anywhere (the standing rule): lightning lights
//   the clouds by brightening their material colour, bolts are
//   additive lines, foam/spray are transparent textures. The only
//   lights in the world stay the ones sea3d.js / ship3d.js /
//   world3d.js already own.
// - CONFLICT RULE: the coloured-wraps worker is wrapping the
//   Dutchman's sea metal in BLUE. This module NEVER edits an existing
//   surface or material — it only ADDS new objects (a cloud dome, a
//   foam overlay, spray, bolts, rigging, weed, patches, deck
//   clutter) and never touches sea3d.js or ship3d.js. If in doubt,
//   a surface is left alone.
//
// What was flat before this module (read from code, Nov 15):
// - Sea: one flat Phong colour (0x06283a) + vertex-colour foam on
//   crests only; no swell detail, no whitecaps, no depth colour,
//   no spray anywhere.
// - Sky: a static 4-stop gradient dome and 700 stars — a STORM sky
//   with zero clouds, and lightning that was only a flashing
//   directional light (no visible bolt, no lit cloud).
// - Ship: the hull wears NO texture at all (flat colour); the masts
//   stand bare — no stays, no shrouds, no ratlines; sails billow
//   but carry no patches; the waterline is clean (no weed /
//   barnacle crust); the deck is empty.
// - Weather: rain falls straight down (no wind slant, no gusts),
//   nothing blows spray off the bow, the fog never closes in.
//
// Worker's-choice numbers (Merlin gave no numbers — flag if he
// wants them tuned): storm breathes 0.35…1 over a 4-minute cycle;
// lightning on ~22% of 90 ms slices; storm wind 6–18 m/s from the
// northwest, veering ±20° over 3 minutes; cloud deck at ~150 m;
// foam overlay 0.18–0.53 opaque with the storm.

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';
import { lightningFlash, PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';
import { getParticleTexture } from '../particles/sprites.js';
import { waveHeight, SHIP } from '../../app/flying-dutchman/engine.js';

export const DUTCHMAN_STORM_SEED = 'flying-dutchman-storm';
export const DUTCHMAN_FLASH_CHANCE = 0.22;
export const DUTCHMAN_STORM_PERIOD_S = 240; // one full squall cycle
export const DUTCHMAN_CLOUD_DECK_M = 150; // where the bolts start
export const DUTCHMAN_BOLT_STRIKE_R_M = 260; // bolts strike near the camera
export const DUTCHMAN_FOAM_SIZE_M = 1400; // overlay matches the ocean
export const DUTCHMAN_FOAM_SEG = 48;
export const DUTCHMAN_SPRAY_COUNT = 320;
export const DUTCHMAN_SPRAY_AREA_M = 140;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// ---------------------------------------------------------------------------
// Storm clock — pure functions of nowMs
// ---------------------------------------------------------------------------

/** Storm strength 0.35…1: squalls roll in and out over ~4 minutes. */
export function stormIntensity(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  return 0.65 + 0.35 * Math.sin((t / DUTCHMAN_STORM_PERIOD_S) * Math.PI * 2 + 1.1);
}

/** Lightning flash 0…1 at an instant (the shared seeded-flash law). */
export function dutchmanFlashAt(nowMs = Date.now()) {
  return lightningFlash(nowMs, DUTCHMAN_STORM_SEED, 9000, DUTCHMAN_FLASH_CHANCE);
}

/**
 * A seeded lightning-bolt path: a jagged polyline from the cloud
 * deck down to the sea, for the flash instant. Empty (no bolt) when
 * the flash is below the visible threshold — the scene only draws a
 * bolt while the sky is actually flashing. `slotOffset` staggers a
 * second bolt off the same clock. Pure function of the clock.
 */
export function boltFor(nowMs = Date.now(), slotOffset = 0) {
  const flash = dutchmanFlashAt(nowMs);
  if (flash < 0.5) return { flash, points: [] };
  const t = Number(nowMs) - PLANET_CGI_EPOCH_MS;
  const slot = Math.floor(t / 90) + slotOffset;
  const rnd = mulberry32(hashString(`${DUTCHMAN_STORM_SEED}:bolt:${slot}`));
  const x0 = (rnd() - 0.5) * DUTCHMAN_BOLT_STRIKE_R_M * 2;
  const z0 = (rnd() - 0.5) * DUTCHMAN_BOLT_STRIKE_R_M * 2;
  const segments = 8;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const spread = 7 * (1 - f * 0.7);
    points.push({
      x: x0 + (rnd() - 0.5) * spread * 2,
      y: DUTCHMAN_CLOUD_DECK_M * (1 - f),
      z: z0 + (rnd() - 0.5) * spread * 2,
    });
  }
  return { flash, points };
}

/**
 * The visual storm wind: prevailing from the northwest (315°),
 * veering ±20° over 3 minutes, 6 m/s in the lull rising to 18 m/s
 * at the top of a squall. Pure function of the clock. This is the
 * WEATHER wind (rain slant, spray) — the gameplay sailing wind
 * still lives in engine.js and is untouched.
 */
export function stormWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const storm = stormIntensity(nowMs);
  const bearingDeg = 315 + 20 * Math.sin((t / 180) * Math.PI * 2 + 0.7);
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    speed: 6 + storm * 12,
    bearingDeg,
    dirX: -Math.sin(rad),
    dirZ: Math.cos(rad),
    storm,
  };
}

/**
 * Sea colours for the storm + night: the deep water darkens as the
 * squall closes in, the crest foam stays pale so the swell reads.
 * Returns hex numbers (the ocean material keeps its own colour —
 * this is the palette the overlay / spray are tinted from).
 */
export function seaColors(storm = 0.65, nightF = 1) {
  const s = clamp01(storm);
  const n = clamp01(nightF);
  const deep = new THREE.Color(0x06283a).lerp(new THREE.Color(0x030f18), s * 0.7);
  deep.multiplyScalar(0.55 + 0.45 * (1 - n * 0.6));
  const crest = new THREE.Color(0x9fd8e8).lerp(new THREE.Color(0xd8f2f8), s * 0.5);
  return { deep: deep.getHex(), crest: crest.getHex() };
}

/** Cloud-dome opacity: thicker in a squall, thinner by day. */
export function cloudOpacity(storm = 0.65, nightF = 1) {
  return clamp01(0.3 + 0.45 * clamp01(storm)) * (0.55 + 0.45 * clamp01(nightF));
}

/** Fog closes in with the storm: { near, far } in metres. */
export function stormFog(storm = 0.65) {
  const s = clamp01(storm);
  return { near: 120 - 40 * s, far: 900 - 350 * s };
}

// ---------------------------------------------------------------------------
// Textures — DataTextures, seeded, node-safe (the planet-cgi idiom)
// ---------------------------------------------------------------------------

/**
 * Storm-cloud billows for the cloud dome: dark slate bellies with
 * paler lit rims, alpha where the cloud actually is. 256×128.
 */
export function stormCloudTexture(seed = DUTCHMAN_STORM_SEED) {
  const W = 256;
  const H = 128;
  const seedInt = hashString(`dutchman:clouds:${seed}`);
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const billow = fbm(u * 7, v * 4, seedInt);
      const puff = fbm(u * 18 + 40, v * 11, seedInt);
      const a = clamp01((billow - 0.42) * 2.4) * (0.6 + puff * 0.4);
      // Dark belly, paler where the cloud is thickest (the rim the
      // lightning catches).
      const l = 0.10 + billow * 0.22 + puff * 0.06;
      const i = (y * W + x) * 4;
      color[i] = Math.round(255 * l * 0.85);
      color[i + 1] = Math.round(255 * l * 0.95);
      color[i + 2] = Math.round(255 * l * 1.15);
      color[i + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sea detail: foam streaks + whitecap speckle on transparency.
 * Stretched horizontally so the streaks read as wind-blown foam
 * lanes. 256×256, tiled over the foam overlay.
 */
export function seaDetailTexture(seed = DUTCHMAN_STORM_SEED) {
  const W = 256;
  const H = 256;
  const seedInt = hashString(`dutchman:sea:${seed}`);
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const streak = fbm(u * 3, v * 14, seedInt);
      const cap = valueNoise(u * 90, v * 90, seedInt);
      const lane = clamp01((streak - 0.58) * 4);
      const speck = cap > 0.93 ? 0.8 : 0;
      const a = Math.max(lane * 0.75, speck);
      const i = (y * W + x) * 4;
      color[i] = 216;
      color[i + 1] = 236;
      color[i + 2] = 242;
      color[i + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Worn, salt-stained hull planks for the deck clutter (barrels):
 * dark wood, grain lines, pale salt bleach, barnacle speckle
 * toward the bottom rows. The SHIP's own hull is never re-textured
 * here — the wraps worker owns those surfaces.
 */
export function wornWoodTexture(seed = DUTCHMAN_STORM_SEED) {
  const W = 256;
  const H = 256;
  const seedInt = hashString(`dutchman:wood:${seed}`);
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const plank = Math.floor(v * 8);
      const grain = valueNoise(u * 40, v * 220, seedInt);
      const salt = fbm(u * 5, v * 9, seedInt + 3);
      let r = 52 + (plank % 2) * 10 + (grain - 0.5) * 22;
      let g = 38 + (plank % 2) * 7 + (grain - 0.5) * 16;
      let b = 24 + (plank % 2) * 5 + (grain - 0.5) * 12;
      // Salt bleach on the upper rows.
      if (salt > 0.62 && v < 0.5) { r += 26; g += 24; b += 20; }
      // Barnacle speckle toward the bottom (the waterline rows).
      if (v > 0.8 && valueNoise(u * 160, v * 160, seedInt + 9) > 0.86) {
        r = 96; g = 104; b = 88;
      }
      // Plank seams.
      if ((v * 8) % 1 < 0.06) { r *= 0.45; g *= 0.45; b *= 0.45; }
      const i = (y * W + x) * 4;
      color[i] = Math.max(0, Math.min(255, r));
      color[i + 1] = Math.max(0, Math.min(255, g));
      color[i + 2] = Math.max(0, Math.min(255, b));
      color[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Storm sea + sky — one group added to the scene, updated per frame.
// No lights: lightning brightens the cloud material, bolts are
// additive lines, foam and spray are transparent textures.
// ---------------------------------------------------------------------------

function makeBoltLine() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((8 + 1) * 3), 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xd8ecff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function makeSprayField() {
  const rnd = mulberry32(hashString(`dutchman:spray:${DUTCHMAN_STORM_SEED}`));
  const count = DUTCHMAN_SPRAY_COUNT;
  const pos = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const factor = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * DUTCHMAN_SPRAY_AREA_M;
    pos[i * 3 + 1] = 0.5 + rnd() * 11;
    pos[i * 3 + 2] = (rnd() - 0.5) * DUTCHMAN_SPRAY_AREA_M;
    baseY[i] = pos[i * 3 + 1];
    factor[i] = 0.55 + rnd() * 0.45;
    phase[i] = rnd() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.sprayBaseY = baseY;
  geo.userData.sprayFactor = factor;
  geo.userData.sprayPhase = phase;
  geo.userData.sprayCount = count;
  const mat = new THREE.PointsMaterial({
    color: 0xbfe0ea, size: 0.6,
    map: getParticleTexture('mist') || undefined,
    transparent: true, opacity: 0.3, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

function wrapRange(v, half) {
  if (v > half) return v - half * 2;
  if (v < -half) return v + half * 2;
  return v;
}

/**
 * The storm layer: cloud dome + visible lightning bolts + a foam
 * overlay riding the same swell as the ocean + wind-blown spray +
 * fog that closes in with the squall. Adds itself to `scene`.
 * Returns { group, update }.
 *
 * update(t, dt, camX, camZ, player, nightF, nowMs):
 *   t — world clock (seconds, for the swell); dt — frame step;
 *   camX/camZ — the camera target (the player ship); player —
 *   the player ship { x, z, speed, heading } (bow spray thickens
 *   with way); nightF — 0.15 day … 1 night; nowMs — the real clock
 *   (defaults to Date.now()).
 */
export function createDutchmanStorm(scene) {
  const group = new THREE.Group();
  group.name = 'dutchman-storm-cgi';

  // Cloud dome — inside the existing gradient dome (radius 3000),
  // so the gradient still reads behind the cloud breaks.
  const cloudTex = stormCloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, opacity: 0.6,
    side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const cloudDome = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), cloudMat);
  cloudDome.renderOrder = 1;
  group.add(cloudDome);

  // Two staggered bolts — the second is a fork off the same storm.
  const boltA = makeBoltLine();
  const boltB = makeBoltLine();
  group.add(boltA, boltB);

  // Foam overlay — its own displaced plane riding the same
  // waveHeight() as the ocean, so the whitecaps sit on the swell
  // instead of floating flat above it.
  const foamGeo = new THREE.PlaneGeometry(
    DUTCHMAN_FOAM_SIZE_M, DUTCHMAN_FOAM_SIZE_M,
    DUTCHMAN_FOAM_SEG, DUTCHMAN_FOAM_SEG,
  );
  foamGeo.rotateX(-Math.PI / 2);
  const foamTex = seaDetailTexture();
  foamTex.repeat.set(6, 6);
  const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex, transparent: true, opacity: 0.3, depthWrite: false,
  });
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.frustumCulled = false;
  foam.renderOrder = 2;
  group.add(foam);

  // Wind-blown spray around the camera.
  const spray = makeSprayField();
  group.add(spray);

  scene.add(group);

  const foamBase = foamGeo.attributes.position.array.slice();

  function setBolt(line, bolt, camX, camZ) {
    if (!bolt.points.length) {
      line.visible = false;
      line.material.opacity = 0;
      return;
    }
    const attr = line.geometry.getAttribute('position');
    const arr = attr.array;
    for (let i = 0; i < bolt.points.length; i++) {
      arr[i * 3] = camX + bolt.points[i].x;
      arr[i * 3 + 1] = bolt.points[i].y;
      arr[i * 3 + 2] = camZ + bolt.points[i].z;
    }
    attr.needsUpdate = true;
    line.visible = true;
    line.material.opacity = Math.min(1, bolt.flash);
  }

  return {
    group,
    cloudDome,
    foam,
    spray,
    bolts: [boltA, boltB],
    update(t, dt, camX, camZ, player, nightF = 1, nowMs = Date.now()) {
      const storm = stormIntensity(nowMs);
      const flash = dutchmanFlashAt(nowMs);
      const wind = stormWindAt(nowMs);
      const nF = clamp01(typeof nightF === 'number' ? nightF : 1);

      // Clouds drift slowly and thicken in the squall; a flash
      // lights the bellies (material brighten, not a light).
      cloudDome.position.set(camX, 0, camZ);
      cloudDome.rotation.y += Math.max(0, dt) * 0.004;
      cloudMat.opacity = cloudOpacity(storm, nF);
      cloudMat.color.setScalar(1 + flash * 1.6);

      // Bolts strike near the camera, only while flashing.
      setBolt(boltA, boltFor(nowMs, 0), camX, camZ);
      setBolt(boltB, boltFor(nowMs, 37), camX, camZ);

      // Foam rides the swell under the camera; thicker in a squall,
      // thicker still when the ship has way (bow foam).
      const speed = player && Number.isFinite(player.speed) ? Math.abs(player.speed) : 0;
      const wayK = Math.min(1, speed / 10);
      foam.position.set(camX, 0, camZ);
      const fpos = foamGeo.attributes.position;
      const farr = fpos.array;
      for (let i = 0; i < fpos.count; i++) {
        const lx = foamBase[i * 3];
        const lz = foamBase[i * 3 + 2];
        farr[i * 3 + 1] = waveHeight(camX + lx, camZ + lz, t) + 0.12;
      }
      fpos.needsUpdate = true;
      foamMat.opacity = 0.18 + 0.35 * storm + 0.08 * wayK;

      // Spray blows downwind and wraps around the camera box.
      const sgeo = spray.geometry;
      const sarr = sgeo.getAttribute('position').array;
      const baseY = sgeo.userData.sprayBaseY;
      const factor = sgeo.userData.sprayFactor;
      const phase = sgeo.userData.sprayPhase;
      const count = sgeo.userData.sprayCount;
      const step = Math.max(0, Math.min(dt, 0.05));
      const clockT = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
      const vx = wind.dirX * wind.speed;
      const vz = wind.dirZ * wind.speed;
      const half = DUTCHMAN_SPRAY_AREA_M / 2;
      for (let i = 0; i < count; i++) {
        const f = factor[i];
        sarr[i * 3] = wrapRange(sarr[i * 3] + vx * f * step, half);
        sarr[i * 3 + 1] = Math.max(0.2, baseY[i] + Math.sin(clockT * 1.9 + phase[i]) * 0.4);
        sarr[i * 3 + 2] = wrapRange(sarr[i * 3] + vz * f * step, half);
      }
      sgeo.getAttribute('position').needsUpdate = true;
      spray.position.set(camX, 0, camZ);
      spray.material.opacity = 0.12 + 0.4 * storm;

      // The fog closes in with the squall.
      if (scene.fog) {
        const fg = stormFog(storm);
        scene.fog.near = fg.near;
        scene.fog.far = fg.far;
      }

      return { storm, flash, wind };
    },
  };
}

// ---------------------------------------------------------------------------
// Ship dressing — rigging, waterline weed, sail patches, deck clutter.
//
// dressShip(group) ADDS children to a ship group built by ship3d.js.
// It never edits an existing mesh or material (the wraps worker owns
// those surfaces): masts are FOUND by traversing for the tall
// vertical cylinders, sails by their userData.base. Idempotent — a
// second call on the same group is a no-op. Safe on any group that
// is not a ship (adds nothing, never throws).
// ---------------------------------------------------------------------------

const RIGGING_COLOR = 0x14100b;
const WEED_COLOR = 0x1e2b1a;

/** Half-beam of the hull at length fraction t (mirrors ship3d.js). */
function hullHalfBeam(t) {
  const fullness = Math.sin(Math.PI * Math.min(0.985, Math.max(0.015, 0.12 + t * 0.82)));
  return (SHIP.beam / 2) * (0.28 + 0.72 * Math.pow(fullness, 0.65));
}

function findMasts(group) {
  const masts = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'CylinderGeometry') return;
    const p = o.geometry.parameters;
    if (!p || typeof p.height !== 'number' || p.height < 13) return;
    if (Math.abs(o.rotation.x) > 0.05 || Math.abs(o.rotation.z) > 0.05) return;
    masts.push({
      x: o.position.x,
      topY: o.position.y + p.height / 2,
      z: o.position.z,
      height: p.height,
    });
  });
  masts.sort((a, b) => b.z - a.z); // bow first
  return masts;
}

function findBowspritTip(group) {
  let tip = null;
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'CylinderGeometry') return;
    const p = o.geometry.parameters;
    if (!p || typeof p.height !== 'number' || p.height < 6 || p.height > 8) return;
    if (Math.abs(o.rotation.x) < 0.5) return; // near-horizontal spar
    const half = p.height / 2;
    tip = {
      x: o.position.x,
      y: o.position.y + Math.sin(Math.PI / 2 - o.rotation.x) * half,
      z: o.position.z + Math.cos(Math.PI / 2 - o.rotation.x) * half,
    };
  });
  // Fallback: the ship3d.js bowsprit pose (0, 3.6, L/2 + 2.6), 7 m.
  if (!tip) tip = { x: 0, y: 4.6, z: SHIP.length / 2 + 6 };
  return tip;
}

function findBigSails(group) {
  const sails = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'PlaneGeometry') return;
    if (!o.userData || !o.userData.base) return;
    const p = o.geometry.parameters;
    if (!p || typeof p.width !== 'number' || p.width < 5) return;
    sails.push(o);
  });
  sails.sort((a, b) => b.geometry.parameters.width - a.geometry.parameters.width);
  return sails;
}

/**
 * Dress one ship group. Returns the group. Safe to call on any
 * group; a group with no masts gets deck clutter only.
 */
export function dressShip(group) {
  if (!group || !group.isGroup) return group;
  if (group.userData && group.userData._cgiDressed) return group;
  if (group.userData) group.userData._cgiDressed = true;

  const dressed = new THREE.Group();
  dressed.name = 'dutchman-ship-cgi';

  // --- rigging: stays, shrouds, ratlines, one LineSegments ---
  const masts = findMasts(group);
  const linePts = [];
  const seg = (a, b) => { linePts.push(a.x, a.y, a.z, b.x, b.y, b.z); };
  if (masts.length > 0) {
    const bow = masts[0]; // bow-most mast
    const tip = findBowspritTip(group);
    seg({ x: bow.x, y: bow.topY, z: bow.z }, tip); // forestay
    const stern = masts[masts.length - 1];
    seg(
      { x: stern.x, y: stern.topY, z: stern.z },
      { x: 0, y: 5.2, z: -SHIP.length / 2 + 0.5 },
    ); // backstay to the sterncastle
    // Stays between mastheads.
    for (let i = 0; i < masts.length - 1; i++) {
      const a = masts[i];
      const b = masts[i + 1];
      seg(
        { x: a.x, y: a.topY, z: a.z },
        { x: b.x, y: b.topY - (b.height * 0.25), z: b.z },
      );
    }
    // Shrouds + ratlines per mast, both sides.
    for (const m of masts) {
      for (const s of [-1, 1]) {
        const railA = { x: s * 2.7, y: 2.4, z: m.z - 1.5 };
        const railB = { x: s * 2.7, y: 2.4, z: m.z + 1.5 };
        const top = { x: m.x, y: m.topY, z: m.z };
        seg(top, railA);
        seg(top, railB);
        // Ratlines: rungs between the two shrouds at five heights.
        for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          const pa = {
            x: top.x + (railA.x - top.x) * f,
            y: top.y + (railA.y - top.y) * f,
            z: top.z + (railA.z - top.z) * f,
          };
          const pb = {
            x: top.x + (railB.x - top.x) * f,
            y: top.y + (railB.y - top.y) * f,
            z: top.z + (railB.z - top.z) * f,
          };
          seg(pa, pb);
        }
      }
    }
  }
  if (linePts.length > 0) {
    const rigGeo = new THREE.BufferGeometry();
    rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    const rigging = new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({
      color: RIGGING_COLOR, transparent: true, opacity: 0.85,
    }));
    rigging.name = 'dutchman-rigging';
    dressed.add(rigging);
  }

  // --- waterline weed / barnacle crust: a tube hugging the hull at
  // the waterline, both sides (the hull itself is never touched). ---
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(new THREE.Vector3(s * hullHalfBeam(t) * 0.99, 0.05, (t - 0.5) * SHIP.length));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const weed = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, 0.32, 6),
      new THREE.MeshStandardMaterial({ color: WEED_COLOR, roughness: 1, metalness: 0 }),
    );
    weed.name = 'dutchman-waterline-weed';
    dressed.add(weed);
  }

  // --- sail patches: darker cloth on the two biggest sails. ---
  const bigSails = findBigSails(group);
  const patchMat = new THREE.MeshStandardMaterial({
    color: 0x6a6a58, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  const patchOffsets = [[-1.4, -0.6], [1.1, 0.9]];
  bigSails.slice(0, 2).forEach((sail, i) => {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), patchMat);
    const off = patchOffsets[i % patchOffsets.length];
    patch.position.set(off[0], off[1], 0.06);
    patch.name = 'dutchman-sail-patch';
    sail.add(patch);
  });

  // --- deck clutter: a rope coil and two worn-wood barrels by the
  // sterncastle (the deck itself is never touched). ---
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.18, 8, 16), ropeMat);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(2.0, 1.46, -8.5);
  coil.name = 'dutchman-rope-coil';
  dressed.add(coil);
  const barrelMat = new THREE.MeshStandardMaterial({
    map: wornWoodTexture(), roughness: 0.95, metalness: 0,
  });
  for (const [bx, bz] of [[-2.0, -8.0], [-1.2, -8.8]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.1, 10), barrelMat);
    barrel.position.set(bx, 1.83, bz);
    barrel.name = 'dutchman-barrel';
    dressed.add(barrel);
  }

  group.add(dressed);
  if (group.userData) group.userData._cgiDressedGroup = dressed;
  return group;
}
