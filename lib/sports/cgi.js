// lib/sports/cgi.js — procedural CGI surfaces for the Olympus sports games.
//
// Seeded PRNG + THREE.DataTexture colour/bump maps, exactly the Earth 4
// creature-textures pattern: pure JS, no DOM canvas, no Tripo, no paid
// assets, so the node test suite can build every texture. The same seed
// always wears the same coat; maps are cached per (kind, seed) by the
// caller-facing builders below.
//
// Used by soccer, hockey, basketball and volleyball pages for:
// players (jersey weave + idle breathing), ball/puck (panelled leather,
// spin), field/court/ice/sand (grain, scratches, planks, mow stripes)
// and the environment (crowd speckle, netting).
//
// RENDER ONLY: nothing here touches game rules, controls or scoring.

import * as THREE from 'three';

export const CGI_TEXTURE_SIZE = 128;

// Deterministic PRNG (mulberry32) — same seed, same surface, every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Smooth value noise over a seeded grid — cheap grain for ice/sand/wood.
export function valueNoise2D(seed, cols, rows) {
  const rng = mulberry32(seed);
  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    // x, y in 0..1
    const gx = x * cols;
    const gy = y * rows;
    const x0 = Math.min(Math.floor(gx), cols - 1);
    const y0 = Math.min(Math.floor(gy), rows - 1);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const a = grid[y0 * (cols + 1) + x0];
    const b = grid[y0 * (cols + 1) + x0 + 1];
    const c = grid[(y0 + 1) * (cols + 1) + x0];
    const d = grid[(y0 + 1) * (cols + 1) + x0 + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Core builder: paint(x, y, u, v, rng, noise) returns [r, g, b, bump]
// (bump 0..255). Returns { map, bumpMap } DataTextures, RepeatWrapping.
function buildMaps(size, seed, paint) {
  const color = new Uint8Array(size * size * 4);
  const bump = new Uint8Array(size * size);
  const rng = mulberry32(seed);
  const noise = valueNoise2D(seed ^ 0x9e3779b9, 8, 8);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b, h] = paint(x, y, x / size, y / size, rng, noise);
      color[i * 4] = clamp255(r);
      color[i * 4 + 1] = clamp255(g);
      color[i * 4 + 2] = clamp255(b);
      color[i * 4 + 3] = 255;
      bump[i] = clamp255(h);
    }
  }
  const map = new THREE.DataTexture(color, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  const bumpMap = new THREE.DataTexture(bump, size, size, THREE.RedFormat);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.needsUpdate = true;
  return { map, bumpMap };
}

// Grass: mown stripes baked in (8 bands along v) + blade speckle.
// Base green matches the shipped pitch (#2d8a2d / #359535).
export function grassMaps(seed = 0x5a0cc4) {
  const stripes = 8;
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const stripe = Math.floor(v * stripes) % 2 === 0 ? 1.0 : 1.14;
    const n = noise(u, v);
    const blade = 0.9 + rng() * 0.2 + (n - 0.5) * 0.16;
    const f = stripe * blade;
    return [45 * f, 138 * f, 45 * f, 90 + (n - 0.5) * 90 + rng() * 40];
  });
}

// Ice: pale blue-white with skate scratches (long faint arcs) + scuff.
// Scratches are drawn as a second pass: pixels near a seeded arc darken.
export function iceMaps(seed = 0x1ce5) {
  const rng = mulberry32(seed ^ 0x51);
  const arcs = [];
  for (let i = 0; i < 46; i++) {
    arcs.push({
      x: rng() * 128, y: rng() * 128,
      a: rng() * Math.PI * 2, len: 12 + rng() * 42,
      dark: rng() < 0.6,
    });
  }
  return buildMaps(256, seed, (x, y, u, v, r2, noise) => {
    const n = noise(u, v);
    let f = 0.94 + (n - 0.5) * 0.1 + (r2() - 0.5) * 0.06;
    let scratch = 0;
    const px = x % 128;
    const py = y % 128;
    for (const arc of arcs) {
      const dx = px - arc.x;
      const dy = py - arc.y;
      const along = dx * Math.cos(arc.a) + dy * Math.sin(arc.a);
      const across = Math.abs(-dx * Math.sin(arc.a) + dy * Math.cos(arc.a));
      if (along > 0 && along < arc.len && across < 0.9) {
        scratch = arc.dark ? -0.1 : 0.06;
        break;
      }
    }
    f += scratch;
    return [219 * f, 234 * f, 254 * f, 128 + (n - 0.5) * 60 + scratch * 400];
  });
}

// Sand: warm grain + wind ripples running across v.
export function sandMaps(seed = 0x5a4d) {
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const n = noise(u, v);
    const ripple = Math.sin(v * Math.PI * 2 * 6 + n * 3) * 0.05;
    const f = 0.9 + (n - 0.5) * 0.14 + (rng() - 0.5) * 0.12 + ripple;
    return [232 * f, 213 * f, 163 * f, 110 + (n - 0.5) * 90 + rng() * 50];
  });
}

// Wood court: planks along u with per-plank tone, grain streaks, seams.
export function woodMaps(seed = 0xc0e77) {
  const plankH = 16; // px per plank at 256
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const plank = Math.floor(y / plankH);
    const tone = 0.88 + ((plank * 2654435761) % 100) / 100 * 0.24;
    const grain = Math.sin(x * 0.35 + noise(u, v) * 6) * 0.05;
    const seam = y % plankH < 1 ? 0.55 : 1.0;
    const f = tone * seam + grain;
    return [146 * f, 96 * f, 52 * f, 100 + (noise(u, v) - 0.5) * 70];
  });
}

// Crowd: dark stand base with dense multicolour speckles (the crowd) in
// loose horizontal seat rows.
export function crowdMaps(seed = 0xc0d) {
  const palette = [
    [226, 232, 240], [59, 130, 246], [239, 68, 68], [250, 204, 21],
    [34, 197, 94], [249, 115, 22], [168, 85, 247], [236, 72, 153],
    [245, 158, 11], [148, 163, 184],
  ];
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const row = Math.floor(y / 8);
    const rowWobble = ((row * 2654435761) % 100) / 100;
    if (rng() < 0.42 + rowWobble * 0.1) {
      const c = palette[Math.floor(rng() * palette.length)];
      const f = 0.75 + rng() * 0.45;
      return [c[0] * f, c[1] * f, c[2] * f, 150 + rng() * 80];
    }
    const n = noise(u, v);
    return [10 + n * 14, 16 + n * 14, 32 + n * 18, 90];
  });
}

// Netting: white woven grid on transparency (RGBA alpha channel).
// Use with transparent: true, side: DoubleSide.
export function netTexture(size = 128, cell = 10) {
  const color = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const onLine = x % cell < 1 || y % cell < 1;
      color[i * 4] = 245;
      color[i * 4 + 1] = 245;
      color[i * 4 + 2] = 245;
      color[i * 4 + 3] = onLine ? 235 : 0;
    }
  }
  const tex = new THREE.DataTexture(color, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Soccer ball: white leather, faint panel shading + dark pentagon patches.
export function soccerBallMaps(seed = 0xba11) {
  const rng = mulberry32(seed);
  const patches = [];
  for (let i = 0; i < 10; i++) {
    patches.push({ u: rng(), v: rng(), r: 0.07 + rng() * 0.05 });
  }
  return buildMaps(128, seed, (x, y, u, v, r2, noise) => {
    let dark = 0;
    for (const p of patches) {
      let du = Math.abs(u - p.u);
      du = Math.min(du, 1 - du);
      const dv = v - p.v;
      const d = Math.hypot(du, dv);
      if (d < p.r) dark = Math.max(dark, 1 - d / p.r);
    }
    const n = noise(u, v);
    const f = 0.94 + (n - 0.5) * 0.08;
    const base = 245 * f;
    const k = dark * 0.85;
    return [base * (1 - k) + 30 * k, base * (1 - k) + 41 * k, base * (1 - k) + 59 * k, 120 + (n - 0.5) * 50];
  });
}

// Volleyball: white with wavy blue / yellow / red panels.
export function volleyballMaps(seed = 0xb011) {
  const panels = ['#2563eb', '#facc15', '#ef4444'];
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const wobble = Math.sin(v * Math.PI * 2 * 2 + noise(u, v) * 2) * 0.06;
    const band = Math.floor(((u + wobble) % 1 + 1) % 1 * 3);
    const n = noise(u, v);
    if (band === 0 && ((u + wobble) % 1 + 1) % 1 < 0.12) {
      // white seam between panels
      return [245, 245, 245, 120];
    }
    const hex = panels[band % 3];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const f = 0.92 + (n - 0.5) * 0.1;
    // one in three bands stays white for the classic look
    if (band === 2) return [242 * f, 242 * f, 240 * f, 120 + (n - 0.5) * 40];
    return [r * f, g * f, b * f, 120 + (n - 0.5) * 40];
  });
}

// Basketball: pebbled orange leather + black channel seams (the classic
// vertical / horizontal / curved side seams).
export function basketballMaps(seed = 0xba5e) {
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const pebble = (rng() - 0.5) * 0.14 + (noise(u, v) - 0.5) * 0.1;
    const seam = (t) => Math.exp(-((t * t) / 0.0004));
    let s = 0;
    s = Math.max(s, seam(u - 0.5), seam(v - 0.5));
    // curved side seams: arcs centred off-canvas
    const dLeft = Math.abs(Math.hypot(u - 0, v - 0.5) - 0.42);
    const dRight = Math.abs(Math.hypot(u - 1, v - 0.5) - 0.42);
    s = Math.max(s, seam(dLeft), seam(dRight));
    const f = 1 + pebble;
    const k = Math.min(1, s);
    const r = 226 * f;
    const g = 105 * f;
    const b = 30 * f;
    return [r * (1 - k) + 26 * k, g * (1 - k) + 13 * k, b * (1 - k) + 5 * k, 150 + pebble * 300];
  });
}

// Jersey fabric: team colour with a fine weave (±5% checker) so the
// flat solid jerseys read as cloth under the lights.
export function jerseyMaps(seed, baseHex) {
  const r0 = parseInt(baseHex.slice(1, 3), 16);
  const g0 = parseInt(baseHex.slice(3, 5), 16);
  const b0 = parseInt(baseHex.slice(5, 7), 16);
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const weave = ((x + y) % 2 === 0 ? 1.04 : 0.96) + (noise(u, v) - 0.5) * 0.06;
    return [r0 * weave, g0 * weave, b0 * weave, 130];
  });
}

// Idle life: breathing scale + sway tilt for a player group standing
// still. phase is per-player (seeded from the player id); t is seconds.
export function breathScale(t, phase) {
  return 1 + 0.016 * Math.sin(t * 1.5 + phase);
}

export function breathTilt(t, phase) {
  return 0.02 * Math.sin(t * 1.1 + phase);
}

// Cheap per-player phase from any id string — stable across frames.
export function phaseFor(id) {
  return (hashString(String(id)) % 628) / 100;
}

// Shared cache: one texture pair per (kind, seed) — never per player.
const cache = new Map();
export function cachedMaps(kind, seed, builder) {
  const key = `${kind}:${seed}`;
  if (!cache.has(key)) cache.set(key, builder(seed));
  return cache.get(key);
}

// ===========================================================================
// Racket games + dodgeball (tennis, table-tennis, dodgeball, air-hockey
// support) — appended 2026-11-14, same DataTexture pattern as above.
// ===========================================================================

// Blue hardcourt: speckle + faint pale wear patches where play wears it.
export function hardcourtMaps(seed = 0xc0d7) {
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const n = noise(u, v);
    const wear = Math.sin(u * Math.PI * 2 * 2 + n * 4) * Math.sin(v * Math.PI * 2 * 3 + n * 3);
    const f = 0.94 + (n - 0.5) * 0.12 + (rng() - 0.5) * 0.08 + Math.max(0, wear) * 0.08;
    return [59 * f, 130 * f, 196 * f, 120 + (n - 0.5) * 60 + rng() * 30];
  });
}

// Green surround: darker mow stripes + speckle (the apron around the blue).
export function surroundMaps(seed = 0x5e1d) {
  const stripes = 8;
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const stripe = Math.floor(v * stripes) % 2 === 0 ? 1.0 : 1.16;
    const n = noise(u, v);
    const f = stripe * (0.9 + (n - 0.5) * 0.14 + (rng() - 0.5) * 0.1);
    return [45 * f, 106 * f, 45 * f, 100 + (n - 0.5) * 70 + rng() * 30];
  });
}

// Table-tennis table top: matte competition blue, fine grain, centre sheen.
export function tableTopMaps(seed = 0x7a81e) {
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const n = noise(u, v);
    const sheen = 1 + 0.05 * Math.sin(u * Math.PI);
    const f = (0.94 + (n - 0.5) * 0.08 + (rng() - 0.5) * 0.05) * sheen;
    return [29 * f, 78 * f, 216 * f, 110 + (n - 0.5) * 50];
  });
}

// Wall pads / hall panels: base colour, per-panel tone, dark seams.
export function panelMaps(seed = 0x9a1e, baseHex = '#334155') {
  const r0 = parseInt(baseHex.slice(1, 3), 16);
  const g0 = parseInt(baseHex.slice(3, 5), 16);
  const b0 = parseInt(baseHex.slice(5, 7), 16);
  return buildMaps(256, seed, (x, y, u, v, rng, noise) => {
    const col = Math.floor(u * 6);
    const row = Math.floor(v * 2);
    const tone = 0.92 + ((col * 7 + row * 13) % 10) / 100 * 1.6;
    const seam = (x % 43 < 2 || y % 128 < 2) ? 0.5 : 1.0;
    const n = noise(u, v);
    const f = tone * seam * (0.96 + (n - 0.5) * 0.08);
    return [r0 * f, g0 * f, b0 * f, 110 + (n - 0.5) * 50];
  });
}

// Tennis ball felt: optic yellow-green fibre + two white curved seams.
export function tennisBallMaps(seed = 0x7e44a) {
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const n = noise(u, v);
    const f = 0.92 + (n - 0.5) * 0.12 + (rng() - 0.5) * 0.12;
    // Two seam curves sweeping across the wrap (classic ball seam).
    const s1 = Math.abs(v - (0.5 + 0.32 * Math.sin(u * Math.PI * 2)));
    const s2 = Math.abs(v - (0.5 - 0.32 * Math.sin(u * Math.PI * 2)));
    const seam = Math.min(s1, s2);
    const k = seam < 0.035 ? 1 - seam / 0.035 : 0;
    const r = 204 * f;
    const g = 255 * f;
    const b = 0 * f;
    return [r * (1 - k) + 248 * k, g * (1 - k) + 250 * k, b * (1 - k) + 250 * k, 150 + (n - 0.5) * 60];
  });
}

// Table-tennis ball: white celluloid, faint equator seam, speckle.
export function tableBallMaps(seed = 0x7a1e) {
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const n = noise(u, v);
    const f = 0.95 + (n - 0.5) * 0.06 + (rng() - 0.5) * 0.05;
    const seam = Math.abs(v - 0.5) < 0.012 ? 0.5 : 0;
    const base = 248 * f;
    return [base * (1 - seam) + 148 * seam, base * (1 - seam) + 163 * seam, base * (1 - seam) + 184 * seam, 120];
  });
}

// Foam dodgeball: off-white with red / blue / amber panel wedges + seams.
export function dodgeballMaps(seed = 0xd06e) {
  const panels = [[239, 68, 68], [59, 130, 246], [245, 158, 11]];
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const n = noise(u, v);
    const wedge = Math.floor(((u * 6) % 6 + 6) % 6);
    const panel = panels[wedge % 3];
    const seam = Math.abs(((u * 6) % 1 + 1) % 1 - 0.5) > 0.47 ? 0.45 : 0;
    const f = 0.9 + (n - 0.5) * 0.1 + (rng() - 0.5) * 0.08;
    const base = 241 * f;
    // Panels tint the foam; seams darken it.
    const k = 0.55;
    const r = base * (1 - k) + panel[0] * k * f;
    const g = base * (1 - k) + panel[1] * k * f;
    const b = base * (1 - k) + panel[2] * k * f;
    return [r * (1 - seam) + 15 * seam, g * (1 - seam) + 23 * seam, b * (1 - seam) + 42 * seam, 150 + (n - 0.5) * 60];
  });
}

// Paddle rubber face: base colour, pimple dots, speckle.
export function paddleFaceMaps(seed = 0x9a1d, baseHex = '#dc2626') {
  const r0 = parseInt(baseHex.slice(1, 3), 16);
  const g0 = parseInt(baseHex.slice(3, 5), 16);
  const b0 = parseInt(baseHex.slice(5, 7), 16);
  return buildMaps(128, seed, (x, y, u, v, rng, noise) => {
    const pip = (x % 8 < 3 && y % 8 < 3) ? 1.18 : 1.0;
    const n = noise(u, v);
    const f = pip * (0.94 + (n - 0.5) * 0.08);
    return [r0 * f, g0 * f, b0 * f, 150 + (n - 0.5) * 50];
  });
}

// ---------------------------------------------------------------------------
// Per-frame life (pure — node-testable with a fake { rotation } mesh)
// ---------------------------------------------------------------------------
// Roll a ball mesh from its ground-plane velocity (spin you can see).
export function rollBall(mesh, vx, vz, dt) {
  mesh.rotation.x += vz * dt * 2.2;
  mesh.rotation.z -= vx * dt * 2.2;
}

// Squash factor for a ball near the ground: 1 in the air, ~0.65 on impact.
export function squashY(y, threshold = 0.35) {
  if (y >= threshold) return 1;
  return 0.65 + 0.35 * (y / threshold);
}

// ---------------------------------------------------------------------------
// Environment builders (THREE only, no DOM — safe in node with a Scene)
// ---------------------------------------------------------------------------
// Radial white glow texture (cloud puffs, light glows, contact shadows).
export function radialGlowTexture(size = 64) {
  const color = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.hypot(dx, dy) * 2; // 0 centre → 1 edge
      const a = d >= 1 ? 0 : Math.round(255 * (1 - d) * (1 - d * 0.4));
      const i = (y * size + x) * 4;
      color[i] = 255;
      color[i + 1] = 255;
      color[i + 2] = 255;
      color[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(color, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Gradient sky dome (Earth 4 buildSky method): vertex-coloured sphere.
export function skyDome(scene, radius = 180) {
  const geo = new THREE.SphereGeometry(radius, 24, 12);
  const top = new THREE.Color(0x2e7cd6);
  const mid = new THREE.Color(0x8ec8ee);
  const hor = new THREE.Color(0xd8f0f7);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius;
    if (y > 0.25) tmp.lerpColors(mid, top, Math.min(1, (y - 0.25) / 0.75));
    else tmp.lerpColors(hor, mid, Math.max(0, Math.min(1, (y + 0.08) / 0.33)));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  scene.add(mesh);
  return mesh;
}

// Drifting cloud sprites. Returns { update(t, dt) }.
export function makeClouds(scene, seed, { count = 8, spread = 90, yMin = 28, yMax = 48 } = {}) {
  const rng = mulberry32(seed);
  const tex = radialGlowTexture();
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.5 + rng() * 0.3, depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    const w = 18 + rng() * 22;
    s.scale.set(w, w * 0.38, 1);
    s.position.set((rng() - 0.5) * spread * 2, yMin + rng() * (yMax - yMin), (rng() - 0.5) * spread * 2);
    s.userData.v = 0.6 + rng() * 1.2;
    scene.add(s);
    clouds.push(s);
  }
  return {
    update(t, dt) {
      void t;
      for (const c of clouds) {
        c.position.x += c.userData.v * dt;
        if (c.position.x > spread) c.position.x = -spread;
      }
    },
  };
}

// Floodlight poles: pole + head + emissive bulbs + glow sprite. Visual only.
export function makeFloodlights(scene, positions, height = 12) {
  const tex = radialGlowTexture();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fefce8' });
  for (const [x, z] of positions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, height, 8), poleMat);
    pole.position.set(x, height / 2, z);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.25), headMat);
    head.position.set(x, height + 0.4, z);
    head.lookAt(0, 1, 0);
    scene.add(head);
    for (let b = 0; b < 3; b++) {
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), bulbMat);
      bulb.position.set(x + (b - 1) * 0.45, height + 0.4, z);
      bulb.lookAt(0, 1, 0);
      scene.add(bulb);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xfff7cc, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    glow.scale.set(5, 5, 1);
    glow.position.set(x, height + 0.4, z);
    scene.add(glow);
  }
}

// Seated crowd: two InstancedMeshes (bodies + heads), seeded shirt/skin
// colours, per-instance bob + lean. spots: [[x, y, z], ...] (y = seat height).
// Returns { group, update(t) }.
export function makeCrowd(scene, { seed = 1, spots = [], palette = ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#f8fafc'] } = {}) {
  const rng = mulberry32(seed);
  const count = spots.length;
  const group = new THREE.Group();
  scene.add(group);
  if (count === 0) return { group, update() {} };
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.55, 3, 8);
  const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
  const skinTones = ['#d9a066', '#b07a4a', '#e8b98a', '#8a5a33'];
  const dummy = new THREE.Object3D();
  const phases = [];
  const speeds = [];
  for (let i = 0; i < count; i++) {
    const [x, y, z] = spots[i];
    dummy.position.set(x, y + 0.55, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + 1.12;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, new THREE.Color(palette[Math.floor(rng() * palette.length)]));
    heads.setColorAt(i, new THREE.Color(skinTones[Math.floor(rng() * skinTones.length)]));
    phases.push(rng() * Math.PI * 2);
    speeds.push(1.6 + rng() * 1.4);
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  group.add(bodies, heads);
  return {
    group,
    update(t) {
      for (let i = 0; i < count; i++) {
        const [x, y, z] = spots[i];
        const bob = Math.abs(Math.sin(t * speeds[i] + phases[i])) * 0.07;
        const lean = Math.sin(t * 0.9 + phases[i]) * 0.05;
        dummy.position.set(x, y + 0.55 + bob, z);
        dummy.rotation.set(lean, 0, 0);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.y = y + 1.12 + bob;
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
  };
}

// Flat dark contact shadow disc that follows a player/ball.
export function makeContactShadow(radius = 0.6, opacity = 0.32) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: radialGlowTexture(), color: 0x000000, transparent: true, opacity, depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}
