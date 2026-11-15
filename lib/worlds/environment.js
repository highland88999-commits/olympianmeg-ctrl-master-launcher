// =====================================================================
// lib/worlds/environment.js — the Olympus WORLD ENVIRONMENT KIT.
//
// Shared, world-agnostic building blocks for 3D environments across the
// multiverse (first consumer: Kombat arenas — app/kombat/arenas.js).
// Any scene family can adopt these helpers to meet the world-quality
// standard (see WORLD_STANDARD.md in the arena-upgrade workspace):
//
//   * Layered depth — vista / midground / foreground groups, never a
//     flat backdrop strip.
//   * Texture-wrapped surfaces — procedural canvas textures, generated
//     once and cached; zero downloads, tileable, wrap-friendly.
//   * LIGHTING LAW — light must never drown out texture wraps. Glow is
//     faked with sprites and emissive maps, kept LOCAL. Scenes add few
//     real lights; materials stay readable.
//   * Solid geometry — decor is placed outside the play space by
//     construction; the kit stamps every mesh with userData.kind so
//     tests can prove the play band stays clear ('solid' | 'ground' |
//     'flat' | 'fx').
//   * Phone budget — instancing for repeated set pieces, shared
//     geometries/materials/textures, sprite particles instead of
//     per-particle meshes.
//
// Everything here is deterministic (seeded RNG) so scenes render the
// same on every load and headless proof stills are reproducible.
// =====================================================================

import * as THREE from 'three';
import { getParticleTexture } from '../particles/sprites.js';

// ---------------------------------------------------------------------
// Deterministic RNG (mulberry32) — stable scenes, reproducible stills.
// ---------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rr = (rng, a, b) => a + rng() * (b - a);

// ---------------------------------------------------------------------
// Materials — one factory so the lighting law has one dial. Roughness
// defaults high, metalness low: texture does the talking, not specular.
// ---------------------------------------------------------------------
export function wmat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.88,
    metalness: opts.metalness ?? 0.04,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    map: opts.map ?? null,
    emissiveMap: opts.emissiveMap ?? null,
    alphaMap: opts.alphaMap ?? null,
    side: opts.side ?? THREE.FrontSide,
  });
}

// ---------------------------------------------------------------------
// Procedural canvas textures — generated once per key, cached, shared.
// Painters draw tileable 2D art; the same texture serves as map and
// (where lit detail matters) emissiveMap/alphaMap. In non-DOM runtimes
// (node tests) a blank texture is returned so scene graphs still build.
// ---------------------------------------------------------------------
const texCache = new Map();
const hasDOM = typeof document !== 'undefined';

function makeCanvas(w, h) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(key, w, h, draw, opts = {}) {
  if (texCache.has(key)) return texCache.get(key);
  let tex;
  const cv = makeCanvas(w, h);
  if (cv) {
    const ctx = cv.getContext('2d');
    draw(ctx, w, h);
    tex = new THREE.CanvasTexture(cv);
  } else {
    tex = new THREE.Texture();
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = 4;
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

function speckle(ctx, w, h, rng, n, colors, sMin = 1, sMax = 3, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    const s = rr(rng, sMin, sMax);
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}
function grainLines(ctx, w, h, rng, n, color, alpha = 0.12, horizontal = true) {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.5 + rng() * 0.5);
    ctx.lineWidth = rr(rng, 0.6, 1.6);
    ctx.beginPath();
    if (horizontal) {
      const y = rng() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + rr(rng, -3, 3), w * 0.7, y + rr(rng, -3, 3), w, y);
    } else {
      const x = rng() * w;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rr(rng, -3, 3), h * 0.3, x + rr(rng, -3, 3), h * 0.7, x, h);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Generic painters — theme via colors, reusable by any world.
export const PAINTERS = {
  // Wooden boards (docks, cabins, gates, signs).
  planks: (base = '#4a3421', dark = '#2c1e12', light = '#6a4c2c') => (ctx, w, h) => {
    const rng = mulberry32(w * 7 + h);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const rows = 6, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = r % 2 ? base : light;
      ctx.globalAlpha = 0.35; ctx.fillRect(0, r * rh, w, rh); ctx.globalAlpha = 1;
      ctx.fillStyle = dark; ctx.fillRect(0, r * rh, w, 2.5);
      ctx.fillRect(rng() * w, r * rh, 2.5, rh); // butt joint
      ctx.fillStyle = '#191007';
      ctx.beginPath(); ctx.arc(8, r * rh + rh / 2, 2, 0, 7); ctx.arc(w - 8, r * rh + rh / 2, 2, 0, 7); ctx.fill();
    }
    grainLines(ctx, w, h, rng, 46, dark, 0.16);
    speckle(ctx, w, h, rng, 260, [dark, light], 1, 3, 0.15);
  },
  // Ashlar stone blocks (pillars, ruins, foundations).
  stone: (base = '#6a6a70', dark = '#3f3f45', light = '#8b8b92') => (ctx, w, h) => {
    const rng = mulberry32(w * 3 + h * 5);
    ctx.fillStyle = dark; ctx.fillRect(0, 0, w, h);
    const rows = 4, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (w / 4);
      for (let cx = -1; cx < 3; cx++) {
        ctx.fillStyle = [base, light, base][Math.floor(rng() * 3)];
        ctx.fillRect(cx * (w / 2) + off + 3, r * rh + 3, w / 2 - 6, rh - 6);
      }
    }
    speckle(ctx, w, h, rng, 700, [dark, light, '#2c2c30'], 1, 3, 0.2);
  },
  // Brick courses (parapets, chimneys, city walls).
  brick: (base = '#7a3b2a', dark = '#4a2418', mortar = '#9a8a7a') => (ctx, w, h) => {
    const rng = mulberry32(w + h * 11);
    ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
    const rows = 10, rh = h / rows, bw = w / 4;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw / 2);
      for (let cx = -1; cx < 5; cx++) {
        ctx.fillStyle = rng() < 0.2 ? dark : base;
        ctx.fillRect(cx * bw + off + 2, r * rh + 2, bw - 4, rh - 4);
      }
    }
    speckle(ctx, w, h, rng, 400, [dark, '#8a4630'], 1, 3, 0.18);
  },
  // Sand with wind ripples (desert floors).
  sand: (base = '#c98a4a', dark = '#a86c32', light = '#e8b878') => (ctx, w, h) => {
    const rng = mulberry32(w * 13 + h);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = dark;
    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = rr(rng, 1.5, 3.5);
      ctx.beginPath();
      const y = rng() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y - 7, w * 0.7, y + 7, w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    speckle(ctx, w, h, rng, 900, [dark, light, '#8a5426'], 1, 2.5, 0.22);
  },
  // Layered rock strata (mesas, cliffs, spires).
  strata: (bands = ['#8a4a2a', '#a85c34', '#75401f', '#b96f3a', '#8a4a2a']) => (ctx, w, h) => {
    const rng = mulberry32(w * 17 + h * 3);
    let y = 0;
    let i = 0;
    while (y < h) {
      const bh = rr(rng, h / 9, h / 4.5);
      ctx.fillStyle = bands[i % bands.length];
      ctx.fillRect(0, y, w, bh + 1);
      y += bh; i++;
    }
    grainLines(ctx, w, h, rng, 60, '#5e3016', 0.2);
    speckle(ctx, w, h, rng, 500, ['#5e3016', '#d89a5a'], 1, 3, 0.16);
  },
  // Dirt / forest floor (leaf litter, needles, packed earth).
  dirt: (base = '#2e2418', dark = '#1a120a', fleck = '#5a4630') => (ctx, w, h) => {
    const rng = mulberry32(w * 19 + h * 7);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, 1600, [dark, fleck, '#3e5a34', '#6a5638'], 1, 3.5, 0.3);
    grainLines(ctx, w, h, rng, 22, dark, 0.2);
  },
  // Dark cracked basalt / lava crust — dark plates, glowing cracks.
  // Use the same texture as map + emissiveMap: plates stay black in the
  // emissive channel, cracks glow. (Lighting law: the glow IS the light
  // story, localized to the cracks.)
  lavacrust: (crack = '#ff6a00') => (ctx, w, h) => {
    const rng = mulberry32(w * 23 + h);
    ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, 500, ['#1c1510', '#241a12'], 2, 6, 0.5);
    ctx.strokeStyle = crack;
    ctx.shadowColor = crack; ctx.shadowBlur = 6;
    for (let i = 0; i < 15; i++) {
      ctx.globalAlpha = rr(rng, 0.5, 1);
      ctx.lineWidth = rr(rng, 1, 2.6);
      ctx.beginPath();
      let x = rng() * w, y = rng() * h;
      ctx.moveTo(x, y);
      const segs = 3 + Math.floor(rng() * 4);
      for (let s = 0; s < segs; s++) {
        x += rr(rng, -52, 52); y += rr(rng, -30, 30);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  },
  // Metal deck plates (hangars, reactors, ships).
  deck: (base = '#3d4149', dark = '#26282e', light = '#565b66') => (ctx, w, h) => {
    const rng = mulberry32(w * 29 + h);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const cols = 2, rows = 2, pw = w / cols, ph = h / rows;
    ctx.strokeStyle = dark; ctx.lineWidth = 3;
    for (let cx = 0; cx <= cols; cx++) { ctx.beginPath(); ctx.moveTo(cx * pw, 0); ctx.lineTo(cx * pw, h); ctx.stroke(); }
    for (let cy = 0; cy <= rows; cy++) { ctx.beginPath(); ctx.moveTo(0, cy * ph); ctx.lineTo(w, cy * ph); ctx.stroke(); }
    ctx.fillStyle = light;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      for (const [ox, oy] of [[10, 10], [pw - 10, 10], [10, ph - 10], [pw - 10, ph - 10]]) {
        ctx.beginPath(); ctx.arc(cx * pw + ox, cy * ph + oy, 2.6, 0, 7); ctx.fill();
      }
    }
    speckle(ctx, w, h, rng, 500, [dark, light], 1, 3, 0.15);
    grainLines(ctx, w, h, rng, 18, dark, 0.14);
  },
  // Ribbed wall panels (hangars, industrial interiors).
  panels: (base = '#43464e', dark = '#2c2e34', light = '#5c606a') => (ctx, w, h) => {
    const rng = mulberry32(w * 31 + h);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const cols = 6, pw = w / cols;
    for (let cx = 0; cx < cols; cx++) {
      const grd = ctx.createLinearGradient(cx * pw, 0, (cx + 1) * pw, 0);
      grd.addColorStop(0, dark); grd.addColorStop(0.5, light); grd.addColorStop(1, dark);
      ctx.fillStyle = grd; ctx.globalAlpha = 0.5;
      ctx.fillRect(cx * pw, 0, pw, h); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = dark; ctx.fillRect(0, h * 0.32, w, 4); ctx.fillRect(0, h * 0.68, w, 4);
    speckle(ctx, w, h, rng, 350, [dark, light], 1, 3, 0.14);
  },
  // Rooftop tar + gravel.
  tarpaper: (base = '#33343a', dark = '#232429', light = '#4a4b52') => (ctx, w, h) => {
    const rng = mulberry32(w * 37 + h);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dark;
    for (let i = 1; i < 4; i++) ctx.fillRect(0, (h / 4) * i, w, 3);
    speckle(ctx, w, h, rng, 1500, [dark, light, '#5c5d64'], 1, 2.4, 0.3);
  },
  // Water — deep base with horizontal shimmer streaks (anim: offset.x).
  water: (base = '#16283e', streak = '#7fa8c8', deep = '#0a1624') => (ctx, w, h) => {
    const rng = mulberry32(w * 41 + h);
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, deep); grd.addColorStop(0.5, base); grd.addColorStop(1, deep);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = streak;
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = rr(rng, 0.05, 0.3);
      ctx.lineWidth = rr(rng, 0.7, 2);
      const y = rng() * h, x = rng() * w, len = rr(rng, 12, 60);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  // Diagonal hazard stripes (floor markings, barriers).
  hazard: (a = '#c9a227', b = '#17181c') => (ctx, w, h) => {
    ctx.fillStyle = b; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = a;
    const s = w / 6;
    for (let i = -2; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, h); ctx.lineTo(i * s + s / 2, h); ctx.lineTo(i * s + s / 2 + h, 0); ctx.lineTo(i * s + h, 0);
      ctx.closePath(); ctx.fill();
    }
  },
  // Dense foliage noise (jungle walls, hedges, canopy).
  foliage: (base = '#14280f', leaf = '#2a5426', dark = '#0a1806') => (ctx, w, h) => {
    const rng = mulberry32(w * 43 + h);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = [leaf, dark, '#38662e'][Math.floor(rng() * 3)];
      ctx.globalAlpha = rr(rng, 0.3, 0.8);
      ctx.beginPath();
      ctx.ellipse(rng() * w, rng() * h, rr(rng, 5, 15), rr(rng, 3, 8), rng() * 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

// Facade with a lit-window grid — pair as map + emissiveMap on a dark
// material and the windows glow while the wall stays near-black. One
// plane replaces dozens of window meshes (the old city builders' cost).
export function windowsTexture(key, { cols = 8, rows = 14, lit = 0.42, warm = '#ffd98a', cool = '#bfe0ff', wall = '#0a0c12' } = {}) {
  return canvasTexture(key, 256, 512, (ctx, w, h) => {
    const rng = mulberry32(key.length * 131 + cols * 17 + rows);
    ctx.fillStyle = wall; ctx.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const on = rng() < lit;
      ctx.fillStyle = on ? (rng() < 0.62 ? warm : cool) : '#131722';
      ctx.globalAlpha = on ? rr(rng, 0.75, 1) : 1;
      ctx.fillRect(cx * cw + 3, cy * ch + 4, cw - 6, ch - 8);
    }
    ctx.globalAlpha = 1;
  });
}

// Alpha silhouette (treelines, skylines, mesa rims) — black shape with a
// jagged top on transparency; used on vista planes for cheap depth.
export function silhouetteTexture(key, { color = '#060a08', jag = 0.35, seed = 7 } = {}) {
  return canvasTexture(key, 512, 256, (ctx, w, h) => {
    const rng = mulberry32(seed * 977 + key.length);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    let y = h * (1 - jag) + rng() * h * jag * 0.4;
    for (let x = 0; x <= w; x += 16) {
      y += rr(rng, -h * jag * 0.45, h * jag * 0.45);
      y = Math.max(h * 0.15, Math.min(h * 0.92, y));
      ctx.lineTo(x, y);
      if (rng() < 0.3) { // pine-spike
        ctx.lineTo(x + 4, y - rr(rng, 14, 42));
        ctx.lineTo(x + 8, y);
      }
    }
    ctx.lineTo(w, h);
    ctx.closePath(); ctx.fill();
  }, { srgb: true });
}

// Painted text panel (camp signs, gate beams, neon boards, billboards).
// Returns a draw fn for canvasTexture.
export function textPanel({ bg = '#2c1e12', fg = '#e8d8a8', lines = [], font = '900 64px system-ui, sans-serif', border = null } = {}) {
  return (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16); }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = Math.max(1, lines.length);
    lines.forEach((ln, i) => {
      ctx.font = font.replace('64px', `${Math.floor(h / (n + 0.6))}px`);
      ctx.fillText(ln, w / 2, (h / n) * (i + 0.5));
    });
  };
}

// ---------------------------------------------------------------------
// Sprites — localized glow + soft shadow. This is how the kit fakes
// light pools WITHOUT adding real lights (lighting law).
// ---------------------------------------------------------------------
let glowTexShared = null;
function glowTexture() {
  if (glowTexShared) return glowTexShared;
  glowTexShared = canvasTexture('__world_glow', 128, 128, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.32)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
  });
  return glowTexShared;
}
export function glowSprite(color, scale = 3, opacity = 0.5) {
  const m = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(scale, scale, 1);
  s.userData.kind = 'fx';
  return s;
}
// Soft dark pool — fake contact shadow under set pieces.
export function shadowPool(radius = 2, opacity = 0.42) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.userData.kind = 'flat';
  return m;
}

// ---------------------------------------------------------------------
// Mesh placement helpers. Every decor mesh is stamped with
// userData.kind: 'solid' (default) | 'ground' | 'flat' | 'fx'.
// 'ground' = the y=0 floor itself; 'flat' = floor-level detail no
// fighter can collide with (inlays, shadow pools); 'fx' = sprites,
// points, transparent atmosphere. Tests walk the graph and prove no
// 'solid' intrudes into the play band / play circle.
// ---------------------------------------------------------------------
export function put(parent, geo, mat, x = 0, y = 0, z = 0, kind = 'solid') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.userData.kind = kind;
  parent.add(m);
  return m;
}
export function layer(parent, name) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  return g;
}
// Ground plane whose TOP surface is the y=0 fight floor. Floor law:
// fighters plant on y=0; the ground mesh itself sits at y=0 exactly.
export function groundPlane(w, d, mat, x = 0, z = 0, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.userData.kind = 'ground';
  return m;
}
// Instanced set pieces — one draw call per piece type. Stamps
// userData.minRadius = closest horizontal approach of any instance
// center to the origin, minus footprint (tests use it for clearance).
export function instanced(geo, mat, items, footprint = 1) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  let minR = Infinity;
  items.forEach((it, i) => {
    const [x, y, z] = it.p;
    E.set(it.rx || 0, it.ry || 0, it.rz || 0);
    Q.setFromEuler(E);
    const s = it.s ?? 1;
    if (Array.isArray(s)) S.set(s[0], s[1], s[2]); else S.set(s, s, s);
    P.set(x, y, z);
    M.compose(P, Q, S);
    im.setMatrixAt(i, M);
    minR = Math.min(minR, Math.hypot(x, z));
  });
  im.instanceMatrix.needsUpdate = true;
  im.userData.kind = 'solid';
  im.userData.minRadius = minR - footprint;
  return im;
}

// ---------------------------------------------------------------------
// Atmosphere — Points fields with a behaviour mode. One geometry, one
// material, one draw call per field. Modes: 'rise' (embers, sparks,
// steam), 'fall' (ash, snow, rain), 'drift' (dust, motes), 'float'
// (fireflies — wander + pulse via material opacity in the host scene
// or the built-in gentle bob here).
// ---------------------------------------------------------------------
export function particleField({ count = 60, area = { x: 26, y: 9, z: [-3, -16] }, color = 0xffcc88, size = 0.12, opacity = 0.85, mode = 'rise', speed = 1, seed = 5, sprite = 'glow' } = {}) {
  const rng = mulberry32(seed * 331 + count);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count);
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * area.x;
    pos[i * 3 + 1] = rng() * area.y;
    pos[i * 3 + 2] = rr(rng, area.z[0], area.z[1]);
    vel[i] = (0.5 + rng() * 0.9) * speed;
    ph[i] = rng() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, map: getParticleTexture(sprite) || undefined });
  const points = new THREE.Points(geo, mat);
  points.userData.kind = 'fx';
  const update = (dt, t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const v = vel[i];
      if (mode === 'rise') {
        p[i * 3 + 1] += v * dt;
        p[i * 3] += Math.sin(p[i * 3 + 1] * 1.7 + ph[i]) * dt * 0.45;
        if (p[i * 3 + 1] > area.y) { p[i * 3 + 1] = 0; p[i * 3] = (rng() - 0.5) * area.x; }
      } else if (mode === 'fall') {
        p[i * 3 + 1] -= v * dt;
        p[i * 3] += Math.sin(t * 0.9 + ph[i]) * dt * 0.5;
        if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = area.y; p[i * 3] = (rng() - 0.5) * area.x; }
      } else if (mode === 'float') {
        p[i * 3] += Math.sin(t * 0.6 + ph[i]) * dt * 0.55;
        p[i * 3 + 1] += Math.cos(t * 0.8 + ph[i] * 2) * dt * 0.3;
      } else { // drift
        p[i * 3] += v * dt;
        p[i * 3 + 1] += Math.sin(t * 0.7 + ph[i]) * dt * 0.18;
        if (p[i * 3] > area.x / 2) p[i * 3] = -area.x / 2;
      }
    }
    geo.attributes.position.needsUpdate = true;
    if (mode === 'float') mat.opacity = opacity * (0.6 + 0.4 * Math.sin(t * 2.6));
  };
  return { points, update };
}

// Drifting mist — big soft sprites sliding slowly sideways. Reads as
// fog banks with volume; costs one sprite each, no real fog change.
export function mistBanks({ count = 6, color = 0x9aa4c0, opacity = 0.1, y = 0.7, z = -6, spread = 26, scale = [7, 2.2], speed = 0.22, seed = 9 } = {}) {
  const g = new THREE.Group();
  g.name = 'mist';
  const rng = mulberry32(seed * 771);
  const banks = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: opacity * rr(rng, 0.7, 1.3), depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.set(scale[0] * rr(rng, 0.8, 1.3), scale[1], 1);
    s.position.set(rr(rng, -spread / 2, spread / 2), y + rr(rng, -0.25, 0.45), z + rr(rng, -2.5, 2.5));
    s.userData.kind = 'fx';
    g.add(s);
    banks.push({ s, v: speed * rr(rng, 0.6, 1.4), ph: rng() * 6 });
  }
  const update = (dt, t) => {
    for (const b of banks) {
      b.s.position.x += b.v * dt;
      b.s.position.y += Math.sin(t * 0.5 + b.ph) * dt * 0.05;
      if (b.s.position.x > spread / 2 + 4) b.s.position.x = -spread / 2 - 4;
    }
  };
  return { group: g, update };
}

// Star points for night vistas.
export function starPoints({ count = 180, spread = 64, yMin = 6, yMax = 26, z = -26, color = 0xaabbff, size = 0.09, seed = 3 } = {}) {
  const rng = mulberry32(seed * 613);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * spread;
    pos[i * 3 + 1] = yMin + rng() * (yMax - yMin);
    pos[i * 3 + 2] = z - rng() * 8;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false, map: getParticleTexture('star') || undefined }));
  pts.userData.kind = 'fx';
  return pts;
}

// ---------------------------------------------------------------------
// Updater list — the house scene pattern: builders collect (dt, t)
// callbacks; the returned scene's update() runs them all.
// ---------------------------------------------------------------------
export function updaters() {
  const list = [];
  return {
    push: (...fns) => list.push(...fns),
    run: (dt, t) => { for (const u of list) u(dt, t); },
    get size() { return list.length; },
  };
}
// Gentle sway updater for a mesh (trees, banners, signs, vines).
export function sway(mesh, { amp = 0.03, speed = 1, phase = 0, axis = 'z' } = {}) {
  const base = mesh.rotation[axis];
  return (dt, t) => { mesh.rotation[axis] = base + Math.sin(t * speed + phase) * amp; };
}
