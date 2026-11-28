// lib/enyo/cgi.js — ENYO war dressing (Merlin, 2026-11-15).
//
// The ENYO arena shooter is a full 3D FPS, but the world never showed
// the goddess herself: the menu calls her "Goddess of war" while the
// maps are bare stone, neon, and dust. This module dresses all three
// maps in her colours — bronze + blood-red + gold — without touching
// a single rule, spawn, obstacle, or collider:
//
//   * a WAR-GODDESS MONUMENT — a procedural bronze figure (robe, winged
//     helmet, spear, round shield) standing on an existing solid per
//     map: the plaza fountain column, the depot west pylon, a hollow
//     canyon chunk. Her footprint sits INSIDE the anchor obstacle's
//     footprint, so she can never be walked through.
//   * WAR BANNERS — blood-red cloth with a gold spear sigil, hung on
//     the long faces of walls / containers / canyon chunks, swaying.
//   * SPEAR RACKS + SHIELD WALL — leaning bundles and round shields
//     mounted on obstacle faces, always touching stone.
//   * BRAZIERS — stone bowls with flickering flame, placed touching an
//     obstacle face, never floating in a lane.
//   * SMOKE + EMBER MOTES drifting over the field.
//   * RAVENS — five dark birds circling the monument, wings beating.
//
// RENDER ONLY. No new colliders, no moved spawns, no changed obstacles.
// Every placement is deterministic from the map seed; every solid prop
// is anchored to an existing obstacle (or skipped). Pure THREE + the
// shared world kit — no DOM, no Tripo, no GLB, no paid assets.
// Original designs only: Enyo is a Greek goddess of war, drawn from
// the myth, not from any game or film.

import * as THREE from 'three';
import { mulberry32 } from '../enyo-bots.js';
import { OBSTACLE_STYLE } from './maps.js';
import { glowSprite, particleField, mistBanks } from '../../lib/worlds/environment.js';

// ---------------------------------------------------------------------------
// Law — palette, anchors, budgets. Tests pin these.
// ---------------------------------------------------------------------------
export const ENYO_PALETTE = {
  bronze: 0x8c6a2f,
  bronzeDark: 0x5e4519,
  blood: 0x8e1f1f,
  bloodDark: 0x5e1414,
  gold: 0xd8a93a,
  ember: 0xff7a1a,
  smoke: 0x8a8578,
  raven: 0x14141c,
  stone: 0x4a4238,
};

// Monument anchor per map: the existing solid the goddess stands on.
// (x, z) of the anchor obstacle; the builder matches it in the real
// obstacle list and skips the monument if it is ever missing.
export const ENYO_MONUMENT_ANCHORS = {
  plaza: { x: 0, z: 0, scale: 1.0, dx: 0, dz: 0 }, // fountain column
  depot: { x: -24, z: 0, scale: 0.72, dx: 0.85, dz: 0.85 }, // west pylon, corner (neon strip stays visible)
  hollow: { x: -10, z: -40, scale: 1.25, dx: 0, dz: 0 }, // north canyon chunk
};

export const ENYO_CGI = {
  BANNER_COUNT: 4,
  BANNER_W: 1.6,
  BANNER_H: 2.4,
  RACK_COUNT: 2,
  SPEARS_PER_RACK: 5,
  SHIELD_COUNT: 3,
  BRAZIER_MAX: 3,
  RAVEN_COUNT: 5,
  EMBER_COUNT: 60,
  SMOKE_COUNT: 6,
  SPAWN_CLEAR_R: 3, // no solid prop within this of a spawn point
};

// Spawn points (mirrors lib/enyo/maps.js buildSpawns).
export const ENYO_SPAWNS = [
  { x: -14, z: 45 }, { x: 0, z: 47 }, { x: 14, z: 45 },
  { x: -14, z: -45 }, { x: 0, z: -47 }, { x: 14, z: -45 },
];

// ---------------------------------------------------------------------------
// Banner sigil — a DataTexture (node-safe, deterministic, testable):
// blood-red field, gold border, a gold spear + laurel.
// ---------------------------------------------------------------------------
export function bannerSigilTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // blood-red field, darker toward the edges
      const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      const f = 1 - edge * 0.35;
      let r = 142 * f;
      let g = 31 * f;
      let b = 31 * f;
      // gold border
      if (edge > 0.86) { r = 216; g = 169; b = 58; }
      // gold spear: shaft + head down the centre
      const dx = Math.abs(u - 0.5);
      const shaft = dx < 0.018 && v > 0.2 && v < 0.8;
      const headW = 0.05 * (0.82 - v) / 0.12;
      const head = v >= 0.7 && v < 0.82 && dx < Math.max(0, headW);
      // laurel: two arcs of gold dots low on the cloth
      let laurel = false;
      for (const s of [-1, 1]) {
        const lx = 0.5 + s * 0.26 * Math.cos((v - 0.14) * 9);
        if (Math.abs(u - lx) < 0.02 && v > 0.12 && v < 0.3) laurel = true;
      }
      if (shaft || head || laurel) { r = 216; g = 169; b = 58; }
      // bronze hem at the bottom
      if (v < 0.06) { r = 140; g = 106; b = 47; }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  void cx;
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry helpers — pure, testable.
// ---------------------------------------------------------------------------
// Distance from (x, z) to an obstacle AABB (0 when inside).
export function distToObstacle(x, z, o) {
  const dx = Math.max(o.x - o.w / 2 - x, 0, x - (o.x + o.w / 2));
  const dz = Math.max(o.z - o.d / 2 - z, 0, z - (o.z + o.d / 2));
  return Math.hypot(dx, dz);
}

// True when the point is clear of every spawn point and spawn lane.
export function clearOfSpawns(x, z) {
  for (const s of ENYO_SPAWNS) {
    if (Math.hypot(x - s.x, z - s.z) < ENYO_CGI.SPAWN_CLEAR_R) return false;
  }
  if (Math.abs(x) < 20 && Math.abs(z) > 42 && Math.abs(z) < 50) return false;
  return true;
}

// Height of the highest obstacle top under (x, z) — what a prop rests on.
export function supportTop(x, z, obstacles) {
  let top = 0;
  for (const o of obstacles) {
    if (Math.abs(x - o.x) <= o.w / 2 && Math.abs(z - o.z) <= o.d / 2) {
      if (o.h > top) top = o.h;
    }
  }
  return top;
}

// The long faces banners hang on: stone walls, containers, canyon chunks.
export function bannerHosts(obstacles) {
  return obstacles.filter((o) => (
    (o.c === 'stone' || o.c === 'containerA' || o.c === 'containerB' || o.c === 'canyon')
    && Math.max(o.w, o.d) >= 6 && o.h >= 2.4
  ));
}

// Inner face of an obstacle (the face toward the map centre): the face
// whose outward normal points most directly at (0, 0). Returns
// { x, z, nx, nz } — face centre + outward normal (toward centre).
export function innerFace(o) {
  const len = Math.hypot(o.x, o.z) || 1;
  const dx = -o.x / len;
  const dz = -o.z / len;
  const faces = [
    { x: o.x - o.w / 2, z: o.z, nx: -1, nz: 0 },
    { x: o.x + o.w / 2, z: o.z, nx: 1, nz: 0 },
    { x: o.x, z: o.z - o.d / 2, nx: 0, nz: -1 },
    { x: o.x, z: o.z + o.d / 2, nx: 0, nz: 1 },
  ];
  let best = faces[0];
  let bestDot = -Infinity;
  for (const f of faces) {
    const dot = f.nx * dx + f.nz * dz;
    if (dot > bestDot) { bestDot = dot; best = f; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pure placement — deterministic from (mapKey, obstacles, seed).
// Tests assert on this without building a scene.
// ---------------------------------------------------------------------------
export function dressingPlacements(mapKey, obstacles, seed) {
  const rng = mulberry32(seed + 77);
  const anchorSpec = ENYO_MONUMENT_ANCHORS[mapKey] || ENYO_MONUMENT_ANCHORS.plaza;
  const anchor = obstacles.find((o) => Math.abs(o.x - anchorSpec.x) < 0.5 && Math.abs(o.z - anchorSpec.z) < 0.5) || null;

  const monument = anchor ? {
    anchor: { x: anchor.x, z: anchor.z, w: anchor.w, d: anchor.d, h: anchor.h },
    x: anchor.x + anchorSpec.dx,
    z: anchor.z + anchorSpec.dz,
    baseY: anchor.h,
    scale: anchorSpec.scale,
  } : null;

  // Banners: up to 4, spread across the long faces.
  const hosts = bannerHosts(obstacles);
  const banners = [];
  if (hosts.length > 0) {
    const step = Math.max(1, Math.floor(hosts.length / ENYO_CGI.BANNER_COUNT));
    for (let i = 0; i < hosts.length && banners.length < ENYO_CGI.BANNER_COUNT; i += step) {
      const o = hosts[i];
      const f = innerFace(o);
      const y = Math.min(o.h - 0.2 - ENYO_CGI.BANNER_H / 2, 2.6);
      banners.push({
        x: f.x + f.nx * 0.08, z: f.z + f.nz * 0.08,
        y: Math.max(y, 1.2), ry: Math.atan2(f.nx, f.nz),
        host: { x: o.x, z: o.z },
      });
    }
  }

  // Spear racks: lean on the monument anchor's two side faces.
  const racks = [];
  if (anchor) {
    const faces = [
      { nx: 1, nz: 0 }, { nx: -1, nz: 0 },
    ];
    for (const f of faces.slice(0, ENYO_CGI.RACK_COUNT)) {
      const x = anchor.x + f.nx * (anchor.w / 2 + 0.45);
      const z = anchor.z + f.nz * (anchor.d / 2 + 0.45);
      if (!clearOfSpawns(x, z)) continue;
      racks.push({ x, z, ry: Math.atan2(f.nx, f.nz), lean: 0.26 });
    }
  }

  // Shield wall: three round shields on the anchor's centre-facing face.
  const shields = [];
  if (anchor) {
    const f = innerFace(anchor);
    const tx = -f.nz; // tangent along the face
    const tz = f.nx;
    for (let k = -1; k <= 1; k++) {
      shields.push({
        x: f.x + f.nx * 0.14 + tx * k * 0.85,
        z: f.z + f.nz * 0.14 + tz * k * 0.85,
        y: 1.55 + (k === 0 ? 0.35 : 0),
        ry: Math.atan2(f.nx, f.nz),
      });
    }
  }

  // Braziers: candidates along banner-host faces, kept only when they
  // touch stone and stay clear of the spawn lanes.
  const braziers = [];
  const candidates = [];
  for (const o of hosts) {
    const f = innerFace(o);
    const tx = -f.nz;
    const tz = f.nx;
    for (const frac of [-0.33, 0.33]) {
      const along = (Math.max(o.w, o.d) / 2) * frac;
      // 0.55 m out from the face: the bowl (r 0.4) sits snug against
      // the stone, and the touch filter (<= 0.6 m) keeps it.
      candidates.push({
        x: f.x + f.nx * 0.55 + tx * along,
        z: f.z + f.nz * 0.55 + tz * along,
      });
    }
  }
  // seeded shuffle, take the first few that pass the filters
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const c of candidates) {
    if (braziers.length >= ENYO_CGI.BRAZIER_MAX) break;
    if (!clearOfSpawns(c.x, c.z)) continue;
    const touching = obstacles.some((o) => distToObstacle(c.x, c.z, o) <= 0.6);
    if (!touching) continue;
    if (monument && Math.hypot(c.x - monument.x, c.z - monument.z) < 2.5) continue;
    braziers.push({ x: c.x, z: c.z, y: supportTop(c.x, c.z, obstacles) });
  }

  // Ravens circle the monument (or the map centre when it is missing).
  const cx = monument ? monument.x : 0;
  const cz = monument ? monument.z : 0;
  const ravens = [];
  for (let i = 0; i < ENYO_CGI.RAVEN_COUNT; i++) {
    ravens.push({
      r: 9 + i * 1.2,
      y: 9 + (i % 3) * 1.6,
      speed: 0.22 + i * 0.035,
      phase: i * 1.31,
      cx, cz,
    });
  }

  return {
    monument, banners, racks, shields, braziers, ravens,
    counts: {
      banners: banners.length,
      racks: racks.length,
      shields: shields.length,
      braziers: braziers.length,
      ravens: ravens.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Scene build. Returns { group, update, placements }.
// ---------------------------------------------------------------------------
const _bronze = new THREE.MeshStandardMaterial({ color: ENYO_PALETTE.bronze, roughness: 0.45, metalness: 0.75 });
const _bronzeDark = new THREE.MeshStandardMaterial({ color: ENYO_PALETTE.bronzeDark, roughness: 0.55, metalness: 0.6 });
const _blood = new THREE.MeshStandardMaterial({ color: ENYO_PALETTE.blood, roughness: 0.85, metalness: 0.05 });
const _gold = new THREE.MeshStandardMaterial({ color: ENYO_PALETTE.gold, roughness: 0.35, metalness: 0.85, emissive: ENYO_PALETTE.gold, emissiveIntensity: 0.25 });
const _stone = new THREE.MeshStandardMaterial({ color: ENYO_PALETTE.stone, roughness: 0.95 });
const _ravenMat = new THREE.MeshStandardMaterial({ color: ENYO_PALETTE.raven, roughness: 0.9 });

function _mesh(geo, mat, x, y, z, kind = 'solid') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.userData.kind = kind;
  return m;
}

function buildGoddess(scale) {
  const g = new THREE.Group();
  g.name = 'enyo-monument';
  const s = scale;
  // plinth
  g.add(_mesh(new THREE.BoxGeometry(1.5 * s, 0.5 * s, 1.5 * s), _bronzeDark, 0, 0.25 * s, 0));
  // robe — blood-red, flaring to the plinth
  g.add(_mesh(new THREE.ConeGeometry(0.62 * s, 1.7 * s, 10), _blood, 0, 1.35 * s, 0));
  // torso — bronze cuirass
  g.add(_mesh(new THREE.CylinderGeometry(0.34 * s, 0.42 * s, 0.85 * s, 10), _bronze, 0, 2.55 * s, 0));
  // gold belt + skirt hem
  g.add(_mesh(new THREE.CylinderGeometry(0.46 * s, 0.46 * s, 0.12 * s, 10), _gold, 0, 2.18 * s, 0));
  // head + winged helmet
  g.add(_mesh(new THREE.SphereGeometry(0.26 * s, 12, 10), _bronze, 0, 3.25 * s, 0));
  g.add(_mesh(new THREE.SphereGeometry(0.3 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), _bronzeDark, 0, 3.3 * s, 0));
  const crest = _mesh(new THREE.BoxGeometry(0.08 * s, 0.34 * s, 0.62 * s), _gold, 0, 3.52 * s, 0);
  g.add(crest);
  // wings at the shoulders — small swept gold blades
  for (const side of [-1, 1]) {
    const wing = _mesh(new THREE.ConeGeometry(0.16 * s, 0.7 * s, 4), _gold, side * 0.42 * s, 2.95 * s, -0.08 * s);
    wing.rotation.z = side * -0.9;
    g.add(wing);
  }
  // right arm + spear, held upright
  const arm = _mesh(new THREE.CylinderGeometry(0.09 * s, 0.09 * s, 0.7 * s, 8), _bronze, 0.48 * s, 2.7 * s, 0.1 * s);
  arm.rotation.z = -0.5;
  g.add(arm);
  const shaft = _mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 3.1 * s, 8), _bronzeDark, 0.62 * s, 3.4 * s, 0.12 * s);
  g.add(shaft);
  const tip = _mesh(new THREE.ConeGeometry(0.11 * s, 0.42 * s, 8), _gold, 0.62 * s, 5.05 * s, 0.12 * s);
  g.add(tip);
  // left arm + round shield
  const armL = _mesh(new THREE.CylinderGeometry(0.09 * s, 0.09 * s, 0.6 * s, 8), _bronze, -0.46 * s, 2.65 * s, 0.1 * s);
  armL.rotation.z = 0.6;
  g.add(armL);
  const shield = _mesh(new THREE.CylinderGeometry(0.5 * s, 0.5 * s, 0.08 * s, 18), _bronze, -0.62 * s, 2.5 * s, 0.22 * s);
  shield.rotation.x = Math.PI / 2;
  g.add(shield);
  const boss = _mesh(new THREE.SphereGeometry(0.14 * s, 10, 8), _gold, -0.62 * s, 2.5 * s, 0.28 * s);
  g.add(boss);
  return g;
}

export function buildEnyoDressing(scene, map, obstacles, seed) {
  const placements = dressingPlacements(map.key, obstacles, seed ?? map.seed);
  const group = new THREE.Group();
  group.name = 'enyo-dressing';
  const updaters = [];

  // ---- the goddess herself, on her anchor ----
  if (placements.monument) {
    const m = placements.monument;
    const figure = buildGoddess(m.scale);
    figure.position.set(m.x, m.baseY, m.z);
    figure.rotation.y = 0.6;
    group.add(figure);
  }

  // ---- war banners on the long faces, swaying ----
  const sigil = bannerSigilTexture();
  const bannerMat = new THREE.MeshStandardMaterial({
    map: sigil, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  });
  const bannerMeshes = [];
  for (const b of placements.banners) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(ENYO_CGI.BANNER_W, ENYO_CGI.BANNER_H), bannerMat);
    cloth.position.set(b.x, b.y, b.z);
    cloth.rotation.y = b.ry;
    cloth.userData.kind = 'fx';
    cloth.userData.baseRy = b.ry;
    cloth.userData.phase = b.x * 0.7 + b.z * 0.5;
    group.add(cloth);
    bannerMeshes.push(cloth);
    // a bronze rod the banner hangs from
    const rod = _mesh(new THREE.CylinderGeometry(0.04, 0.04, ENYO_CGI.BANNER_W + 0.2, 6), _bronzeDark,
      b.x, b.y + ENYO_CGI.BANNER_H / 2 + 0.04, b.z, 'fx');
    rod.rotation.z = Math.PI / 2;
    rod.rotation.y = b.ry;
    group.add(rod);
  }
  updaters.push((dt, t) => {
    for (const c of bannerMeshes) {
      c.rotation.y = c.userData.baseRy + Math.sin(t * 0.8 + c.userData.phase) * 0.045;
    }
  });

  // ---- spear racks leaning on the anchor ----
  const spearShaft = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
  const spearTip = new THREE.ConeGeometry(0.07, 0.3, 6);
  for (const r of placements.racks) {
    const rack = new THREE.Group();
    rack.position.set(r.x, 0, r.z);
    rack.rotation.y = r.ry;
    for (let k = 0; k < ENYO_CGI.SPEARS_PER_RACK; k++) {
      const off = (k - 2) * 0.16;
      const fan = (k - 2) * 0.05;
      const spear = new THREE.Group();
      spear.position.set(off, 0, 0);
      spear.rotation.x = r.lean;
      spear.rotation.z = fan;
      const shaft = _mesh(spearShaft, _bronzeDark, 0, 1.05, 0);
      spear.add(shaft);
      const tip = _mesh(spearTip, _gold, 0, 2.28, 0);
      spear.add(tip);
      rack.add(spear);
    }
    group.add(rack);
  }

  // ---- shield wall on the anchor's centre face ----
  for (const s of placements.shields) {
    const shield = _mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.07, 18), _bronze, s.x, s.y, s.z);
    shield.rotation.x = Math.PI / 2;
    shield.rotation.z = s.ry;
    group.add(shield);
    const boss = _mesh(new THREE.SphereGeometry(0.13, 10, 8), _gold, s.x, s.y, s.z);
    boss.position.x += Math.sin(s.ry) * 0.06;
    boss.position.z += Math.cos(s.ry) * 0.06;
    group.add(boss);
  }

  // ---- braziers touching stone, flame flickering ----
  const flames = [];
  for (const b of placements.braziers) {
    const base = _mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.9, 8), _stone, b.x, b.y + 0.45, b.z);
    group.add(base);
    const bowl = _mesh(new THREE.CylinderGeometry(0.46, 0.26, 0.3, 8), _bronzeDark, b.x, b.y + 1.0, b.z);
    group.add(bowl);
    const flame = glowSprite(ENYO_PALETTE.ember, 1.4, 0.85);
    flame.position.set(b.x, b.y + 1.35, b.z);
    group.add(flame);
    const glow = glowSprite(ENYO_PALETTE.ember, 3.2, 0.28);
    glow.position.set(b.x, b.y + 1.3, b.z);
    group.add(glow);
    flames.push({ flame, ph: b.x * 1.7 + b.z });
  }
  updaters.push((dt, t) => {
    for (const f of flames) {
      const k = 1 + Math.sin(t * 9 + f.ph) * 0.15;
      f.flame.scale.set(1.4 * k, 1.4 * (2 - k) * 0.9 + 0.35, 1);
    }
  });

  // ---- smoke over the field + embers around the monument ----
  const smoke = mistBanks({
    count: ENYO_CGI.SMOKE_COUNT, color: ENYO_PALETTE.smoke, opacity: 0.12,
    y: 4, z: 0, spread: 80, scale: [14, 4], speed: 0.35, seed: (seed ?? map.seed) + 13,
  });
  group.add(smoke.group);
  updaters.push(smoke.update);
  const mx = placements.monument ? placements.monument.x : 0;
  const mz = placements.monument ? placements.monument.z : 0;
  const embers = particleField({
    count: ENYO_CGI.EMBER_COUNT, area: { x: 20, y: 8, z: [-10, 10] },
    color: ENYO_PALETTE.ember, size: 0.13, opacity: 0.9,
    mode: 'rise', speed: 1.0, seed: (seed ?? map.seed) + 17,
  });
  embers.points.position.set(mx, 0, mz);
  group.add(embers.points);
  updaters.push(embers.update);

  // ---- ravens circling the monument ----
  const ravens = [];
  for (const r of placements.ravens) {
    const bird = new THREE.Group();
    const body = _mesh(new THREE.ConeGeometry(0.14, 0.7, 6), _ravenMat, 0, 0, 0, 'fx');
    body.rotation.x = Math.PI / 2;
    bird.add(body);
    const wingGeo = new THREE.BoxGeometry(0.85, 0.03, 0.3);
    const wingL = _mesh(wingGeo, _ravenMat, -0.45, 0, 0, 'fx');
    const wingR = _mesh(wingGeo, _ravenMat, 0.45, 0, 0, 'fx');
    bird.add(wingL, wingR);
    bird.userData.wings = [wingL, wingR];
    group.add(bird);
    ravens.push({ bird, ...r });
  }
  updaters.push((dt, t) => {
    for (const r of ravens) {
      const a = r.phase + t * r.speed;
      r.bird.position.set(r.cx + Math.cos(a) * r.r, r.y + Math.sin(t * 0.7 + r.phase) * 0.5, r.cz + Math.sin(a) * r.r);
      r.bird.rotation.y = -a;
      const flap = Math.sin(t * 6 + r.phase) * 0.5;
      r.bird.userData.wings[0].rotation.z = 0.25 + flap;
      r.bird.userData.wings[1].rotation.z = -0.25 - flap;
    }
  });

  scene.add(group);
  const update = (dt, t) => { for (const u of updaters) u(dt, t); };
  return { group, update, placements };
}

// ---------------------------------------------------------------------------
// ROUND 2 (2026-11-28) — bots, weapons, ground, sky: the second CGI pass.
//
// Round 1 dressed the arena (goddess, banners, braziers, ravens). The
// bots were still flat-colour boxes, the weapons flat metal, the ground a
// speckle wash and the sky a flat colour. Round 2 textures those four:
// camo cloth + brushed armor + skin on the bots (same boxes, same sizes,
// same 0.55 r / 2.0 h hit cylinder), brushed/stippled weapon metal (same
// muzzleZ outputs), per-map ground (flagstones / asphalt / dune sand)
// and a gradient sky dome with stars on the night map. No new lights,
// no new colliders, no AI/ballistics/AABB changes anywhere.
// ---------------------------------------------------------------------------

export const ENYO_CGI_ROUND2 = {
  SKY_RADIUS: 360, // inside the camera far plane (400)
  GROUND_REPEAT: 14, // matches the old makeGroundTexture repeat
  WALK_SWING_LEG: 0.5,
  WALK_SWING_ARM: 0.35,
  WALK_RATE: 9, // same cadence as the old walk bob
};

// Generic node-safe DataTexture builder: fn(x, y, data, i) writes RGBA.
// Deterministic from the seed — the same seed paints the same pixels.
function dataTexture(size, fn) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x, y, data, (y * size + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function hexRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// Brushed metal: horizontal streaks over a base grey. The map multiplies
// the material colour, so the base sits near mid-grey (128) and the
// material colour carries the tint.
function brushedTexture(seed, base = 128) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let y = 0; y < 128; y++) rows.push(base + (rng() - 0.5) * 22);
  const streaks = [];
  for (let i = 0; i < 60; i++) streaks.push({ x: rng() * 128, w: 1 + rng() * 2, d: (rng() - 0.5) * 40 });
  return dataTexture(128, (x, y, d, i) => {
    let v = rows[y];
    for (const s of streaks) {
      if (Math.abs(x - s.x) < s.w) v += s.d;
    }
    v = Math.max(0, Math.min(255, v));
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  });
}

// Stippled polymer: fine dark speckle — the grip/stock look.
function stippleTexture(seed, base = 40) {
  const rng = mulberry32(seed);
  return dataTexture(128, (x, y, d, i) => {
    const n = rng();
    const v = base + (n < 0.12 ? 26 : n < 0.5 ? -8 : 4);
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  });
}

// Camo cloth: blocky blotches in dark tones over the base, plus speckle.
// Palette is dark so the bots keep their silhouette at range.
function camoTexture(seed, palette) {
  const rng = mulberry32(seed);
  const cells = [];
  for (let c = 0; c < 64; c++) cells.push(Math.floor(rng() * palette.length));
  const cols = palette.map(hexRgb);
  return dataTexture(128, (x, y, d, i) => {
    const cell = cells[Math.floor(y / 16) * 8 + Math.floor(x / 16)];
    const [r, g, b] = cols[cell];
    const n = (rng() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, r + n));
    d[i + 1] = Math.max(0, Math.min(255, g + n));
    d[i + 2] = Math.max(0, Math.min(255, b + n));
    d[i + 3] = 255;
  });
}

// Skin: warm base with soft mottling, so the face isn't a flat ball.
function skinTexture(seed) {
  const rng = mulberry32(seed);
  const [r0, g0, b0] = hexRgb(0x8a6f5c);
  return dataTexture(128, (x, y, d, i) => {
    const m = Math.sin(x * 0.35 + rng() * 0.6) * 6 + Math.cos(y * 0.3) * 5 + (rng() - 0.5) * 10;
    d[i] = Math.max(0, Math.min(255, r0 + m));
    d[i + 1] = Math.max(0, Math.min(255, g0 + m * 0.8));
    d[i + 2] = Math.max(0, Math.min(255, b0 + m * 0.7));
    d[i + 3] = 255;
  });
}

// Corrugated container steel: vertical ridges over the base grey.
function corrugatedTexture(seed, base = 128) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let y = 0; y < 128; y++) rows.push((rng() - 0.5) * 10);
  return dataTexture(128, (x, y, d, i) => {
    const ridge = Math.sin((x / 128) * Math.PI * 2 * 16) * 26;
    const v = Math.max(0, Math.min(255, base + ridge + rows[y]));
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  });
}

// Warm rock: dark basalt with pink-rust cracks (the hollow's canyon
// stone, in the same family as the neon-racer asteroids).
function rockTexture(seed) {
  const rng = mulberry32(seed);
  const cracks = [];
  for (let i = 0; i < 7; i++) {
    let cx = rng() * 128;
    let cy = rng() * 128;
    const pts = [];
    for (let k = 0; k < 14; k++) {
      pts.push([cx, cy]);
      cx += (rng() - 0.5) * 22;
      cy += (rng() - 0.5) * 22;
    }
    cracks.push(pts);
  }
  return dataTexture(128, (x, y, d, i) => {
    const n = (rng() - 0.5) * 22;
    let r = 128 + n;
    let g = 88 + n * 0.7;
    let b = 62 + n * 0.6;
    for (const pts of cracks) {
      for (const [px, py] of pts) {
        if (Math.hypot(x - px, y - py) < 1.6) { r = 205; g = 92; b = 110; }
      }
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
}

// --- cached textures (one per seed; bots/weapons share them) ---------------
const _texCache = {};
function cachedTex(key, make) {
  if (!_texCache[key]) _texCache[key] = make();
  return _texCache[key];
}

// --- bot materials ----------------------------------------------------------
// Same colours as the flat build, now with texture: camo cloth, brushed
// armor, mottled skin, glowing team trim. Cached per team; shared by
// every bot on that team (nothing mutates them per bot).
const _botMatCache = {};
export function botMaterials(team) {
  if (_botMatCache[team]) return _botMatCache[team];
  const trim = team === 'blue' ? 0x3b82f6 : 0xef4444;
  const mats = {
    armor: new THREE.MeshStandardMaterial({
      map: cachedTex('armor-brushed', () => brushedTexture(4101)),
      color: 0x2b303c, roughness: 0.55, metalness: 0.55,
    }),
    cloth: new THREE.MeshStandardMaterial({
      map: cachedTex('cloth-camo', () => camoTexture(4102, [0x23262e, 0x2e3238, 0x1c1f24, 0x3a3f45])),
      color: 0xffffff, roughness: 0.9, metalness: 0.1,
    }),
    skin: new THREE.MeshStandardMaterial({
      map: cachedTex('skin', () => skinTexture(4103)),
      color: 0xffffff, roughness: 0.8, metalness: 0,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: trim, emissive: trim, emissiveIntensity: 1.1, roughness: 0.4,
    }),
    trimHex: trim,
  };
  _botMatCache[team] = mats;
  return mats;
}

// --- weapon materials -------------------------------------------------------
// Brushed dark metal, stippled polymer, bright brushed steel, flat gold
// (the Omega gold is already right). Cached singletons — the viewmodel
// swap removes the old group without disposing, so shared materials
// are safe here.
let _weaponMats = null;
export function weaponMaterials() {
  if (_weaponMats) return _weaponMats;
  _weaponMats = {
    dark: new THREE.MeshStandardMaterial({
      map: cachedTex('weapon-dark', () => brushedTexture(4201, 96)),
      color: 0x1c1f26, roughness: 0.5, metalness: 0.6,
    }),
    poly: new THREE.MeshStandardMaterial({
      map: cachedTex('weapon-poly', () => stippleTexture(4202)),
      color: 0x14161a, roughness: 0.7, metalness: 0.3,
    }),
    steel: new THREE.MeshStandardMaterial({
      map: cachedTex('weapon-steel', () => brushedTexture(4203, 160)),
      color: 0x3a3f47, roughness: 0.35, metalness: 0.8,
    }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.3, metalness: 0.9 }),
  };
  return _weaponMats;
}

// --- obstacle materials -----------------------------------------------------
// One cached material per OBSTACLE_STYLE key: the same colours and
// roughness/metalness/emissive as the flat build, now with a map that
// belongs to the style. AABBs and sizes are untouched (the page still
// builds the same BoxGeometry/DodecahedronGeometry from the same data).
const _obstacleMatCache = {};
export function obstacleMaterial(styleKey) {
  if (_obstacleMatCache[styleKey]) return _obstacleMatCache[styleKey];
  const s = OBSTACLE_STYLE[styleKey] || OBSTACLE_STYLE.crate;
  let map = null;
  if (styleKey === 'stone' || styleKey === 'stoneDark') {
    map = cachedTex(`ob-${styleKey}`, () => stippleTexture(styleKey === 'stone' ? 4301 : 4302, 150));
  } else if (styleKey === 'crate') {
    map = cachedTex('ob-crate', () => brushedTexture(4303, 150));
  } else if (styleKey === 'containerA' || styleKey === 'containerB') {
    map = cachedTex(`ob-${styleKey}`, () => corrugatedTexture(styleKey === 'containerA' ? 4304 : 4305));
  } else if (styleKey === 'rock' || styleKey === 'canyon') {
    map = cachedTex(`ob-${styleKey}`, () => rockTexture(styleKey === 'rock' ? 4306 : 4307));
  } else if (styleKey === 'neonPylon') {
    map = cachedTex('ob-neonPylon', () => brushedTexture(4308, 60));
  }
  const mat = new THREE.MeshStandardMaterial({
    map,
    color: s.color,
    roughness: s.rough,
    metalness: s.metal || 0,
    emissive: s.emissive || 0x000000,
    emissiveIntensity: s.emissiveI || 0,
  });
  _obstacleMatCache[styleKey] = mat;
  return mat;
}

// --- ground -----------------------------------------------------------------
// Per-map ground: the old makeGroundTexture was one speckle wash for all
// three maps. Each map now gets its own floor — flagstones in the plaza,
// asphalt with lane paint in the depot, wind-blown dune sand in the
// hollow. Same 256 px, same repeat 14, same roughness 1.
export function groundTexture(map, seed) {
  const key = `ground-${map.key}`;
  if (_texCache[key]) return _texCache[key];
  const rng = mulberry32((seed ?? map.seed) + 501);
  let tex;
  if (map.key === 'plaza') {
    const [br, bg, bb] = hexRgb(0x9a917f);
    const tiles = [];
    for (let i = 0; i < 16; i++) tiles.push((rng() - 0.5) * 26);
    tex = dataTexture(256, (x, y, d, i) => {
      const tx = Math.floor(x / 64);
      const ty = Math.floor(y / 64);
      const grout = (x % 64 < 3 || y % 64 < 3);
      const n = (rng() - 0.5) * 12 + tiles[ty * 4 + tx];
      if (grout) { d[i] = 62; d[i + 1] = 58; d[i + 2] = 50; }
      else {
        d[i] = Math.max(0, Math.min(255, br + n));
        d[i + 1] = Math.max(0, Math.min(255, bg + n));
        d[i + 2] = Math.max(0, Math.min(255, bb + n));
      }
      d[i + 3] = 255;
    });
  } else if (map.key === 'depot') {
    const [br, bg, bb] = hexRgb(0x232838);
    const stains = [];
    for (let i = 0; i < 6; i++) stains.push({ x: rng() * 256, y: rng() * 256, r: 14 + rng() * 26 });
    tex = dataTexture(256, (x, y, d, i) => {
      const n = (rng() - 0.5) * 16;
      let r = br + n;
      let g = bg + n;
      let b = bb + n;
      // faded painted lane dash, running along x
      if (Math.abs(y - 128) < 5 && (x % 64) < 34) { r = 150; g = 128; b = 40; }
      for (const s of stains) {
        if (Math.hypot(x - s.x, y - s.y) < s.r) { r *= 0.55; g *= 0.55; b *= 0.55; }
      }
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
      d[i + 3] = 255;
    });
  } else {
    const [br, bg, bb] = hexRgb(0xa9743f);
    tex = dataTexture(256, (x, y, d, i) => {
      const dune = Math.sin((y / 256) * Math.PI * 6 + Math.sin(x * 0.05) * 1.2) * 14;
      const n = (rng() - 0.5) * 14;
      d[i] = Math.max(0, Math.min(255, br + dune + n));
      d[i + 1] = Math.max(0, Math.min(255, bg + dune * 0.8 + n));
      d[i + 2] = Math.max(0, Math.min(255, bb + dune * 0.6 + n));
      d[i + 3] = 255;
    });
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ENYO_CGI_ROUND2.GROUND_REPEAT, ENYO_CGI_ROUND2.GROUND_REPEAT);
  _texCache[key] = tex;
  return tex;
}

// --- sky dome ---------------------------------------------------------------
// A gradient dome that replaces the flat scene.background colour: pale
// blue over warm stone (plaza), near-black blue with stars over a teal
// horizon glow (depot), dusty orange over deep amber (hollow). BackSide,
// fog off, depthWrite off — it is the backdrop, never an occluder.
// scene.background keeps the map sky colour as a fallback.
export function skyDome(map) {
  const top = hexRgb(map.key === 'depot' ? 0x04060f : map.key === 'hollow' ? 0xc97e3e : 0x8fb4dd);
  const horizon = hexRgb(map.key === 'depot' ? 0x14324a : map.key === 'hollow' ? 0xe8b07a : 0xcfd8e3);
  const rng = mulberry32(map.seed + 601);
  // 64x64: wide enough that the depot star field (6% of the high rows)
  // reliably holds stars, tall enough for a smooth gradient.
  const tex = dataTexture(64, (x, y, d, i) => {
    // DataTexture rows run bottom-to-top in UV space: y=0 is the horizon.
    const k = y / 63;
    let r = horizon[0] + (top[0] - horizon[0]) * k;
    let g = horizon[1] + (top[1] - horizon[1]) * k;
    let b = horizon[2] + (top[2] - horizon[2]) * k;
    // stars on the night map, only high in the dome
    if (map.key === 'depot' && k > 0.66 && rng() < 0.06) { r = 255; g = 255; b = 255; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
  const mat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(ENYO_CGI_ROUND2.SKY_RADIUS, 24, 16), mat);
  dome.name = 'enyo-sky-dome';
  return dome;
}

// --- walk cycle -------------------------------------------------------------
// Limbs swing only while the bot is actually moving; the amplitude eases
// in/out so a bot that stops doesn't snap back to attention. The body
// bob rides the same phase (the old bob used clock.t * 9; walkT advances
// at the same 9/s while moving). No-op on a mesh without limb pivots
// (e.g. a test stub) so the call site stays one line.
export function applyBotWalk(mesh, dt, moving) {
  const limbs = mesh.userData?.limbs;
  if (!limbs) return;
  const ud = mesh.userData;
  ud.walkT = (ud.walkT || 0) + (moving ? dt * ENYO_CGI_ROUND2.WALK_RATE : 0);
  const target = moving ? 1 : 0;
  const amp = (ud.swingAmp ?? 0) + (target - (ud.swingAmp ?? 0)) * Math.min(1, dt * 8);
  ud.swingAmp = amp;
  const s = Math.sin(ud.walkT);
  limbs.hipL.rotation.x = s * ENYO_CGI_ROUND2.WALK_SWING_LEG * amp;
  limbs.hipR.rotation.x = -s * ENYO_CGI_ROUND2.WALK_SWING_LEG * amp;
  limbs.armL.rotation.x = -s * ENYO_CGI_ROUND2.WALK_SWING_ARM * amp;
  limbs.armR.rotation.x = s * ENYO_CGI_ROUND2.WALK_SWING_ARM * amp;
  mesh.position.y = Math.abs(Math.sin(ud.walkT)) * 0.05 * amp;
}
