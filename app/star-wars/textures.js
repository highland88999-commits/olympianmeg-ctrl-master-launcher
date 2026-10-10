/*
 * STAR WARS pocket universe — procedural canvas textures.
 *
 * Zero external network at runtime: every texture is painted on an offscreen
 * canvas when its maker is called. No document/window access at module import
 * time — only inside the maker functions, which run client-side (or under the
 * node test DOM stub).
 *
 * Draw code uses only flat fill/stroke calls (no gradients, no chained calls
 * on paint objects) so it also runs against a minimal canvas stub.
 */
import * as THREE from 'three';

/* Seeded PRNG so textures are stable across sessions. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a canvas, run drawFn(ctx, size), return a THREE.CanvasTexture
 * with Repeat wrapping. Called client-side only.
 */
export function makeCanvasTexture(size, drawFn) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  if (ctx) drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Scatter n small rects of random palette colors. */
function speckle(ctx, size, n, colors, rand, sMin, sMax) {
  sMin = sMin == null ? 1 : sMin; sMax = sMax == null ? 3 : sMax;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const s = sMin + rand() * (sMax - sMin);
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

/* Jagged crack polylines. */
function cracks(ctx, size, n, color, rand, wMax) {
  wMax = wMax == null ? 2 : wMax;
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.lineWidth = 0.5 + rand() * wMax;
    let x = rand() * size, y = rand() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 3 + ((rand() * 4) | 0);
    for (let s = 0; s < segs; s++) {
      x += (rand() - 0.5) * size * 0.28;
      y += (rand() - 0.5) * size * 0.28;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/* Soft blob (built from concentric flat circles — no gradients). */
function blob(ctx, x, y, r, color, steps) {
  steps = steps || 4;
  for (let i = steps; i >= 1; i--) {
    ctx.fillStyle = color.replace('A', String((0.9 / steps) * (steps - i + 1)));
    ctx.beginPath(); ctx.arc(x, y, (i / steps) * r, 0, Math.PI * 2); ctx.fill();
  }
}

/* --- Named makers: each returns a THREE.CanvasTexture (128-256px, cheap). --- */

export function sandTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(11);
    ctx.fillStyle = '#c9a06a'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(160,118,66,0.28)' : 'rgba(232,202,150,0.22)';
      ctx.fillRect(0, (i / 7) * size, size, size / 15);
    }
    speckle(ctx, size, 900, ['#b78f5c', '#dec198', '#a37f52'], rand);
  });
}

export function rockTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(22);
    ctx.fillStyle = '#7d6c58'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 700, ['#6b5c4a', '#8d7c66', '#5d5040'], rand);
    cracks(ctx, size, 10, 'rgba(40,32,24,0.55)', rand, 2.5);
  });
}

export function iceTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(33);
    ctx.fillStyle = '#cfe3f2'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) blob(ctx, rand() * size, rand() * size, 12 + rand() * 26, 'rgba(255,255,255,A)', 3);
    cracks(ctx, size, 8, 'rgba(127,178,221,0.6)', rand, 1.5);
    speckle(ctx, size, 200, ['#ffffff', '#a9c8e2'], rand, 1, 2);
  });
}

export function lavaTexture() {
  // Dark basalt with glowing cracks — emissive look comes from the material,
  // the texture only carries the colors.
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(44);
    ctx.fillStyle = '#16100c'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 500, ['#0d0a08', '#241a12', '#1c1410'], rand, 2, 6);
    cracks(ctx, size, 14, '#ff7a1f', rand, 2.5);
    cracks(ctx, size, 7, '#ffc23d', rand, 1.2);
    speckle(ctx, size, 60, ['#ff9a3d', '#ff5a1a'], rand, 1, 2);
  });
}

export function metalTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(55);
    ctx.fillStyle = '#70767e'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(20,22,26,0.7)'; ctx.lineWidth = 2;
    const step = size / 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,32,36,0.9)';
    for (let ix = 0; ix <= 4; ix++) for (let iy = 0; iy <= 4; iy++) {
      ctx.beginPath(); ctx.arc(ix * step, iy * step, 3, 0, Math.PI * 2); ctx.fill();
    }
    speckle(ctx, size, 350, ['#7d838b', '#5f656d', '#868c94'], rand, 1, 2);
  });
}

export function leafTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(66);
    ctx.fillStyle = '#2f6b2f'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(20,60,20,0.5)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const y = rand() * size;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rand() - 0.5) * 40); ctx.stroke();
    }
    speckle(ctx, size, 500, ['#3f8a3f', '#265a26', '#55a355'], rand, 1, 3);
  });
}

export function waterTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(77);
    ctx.fillStyle = '#1d5f8f'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + rand() * 0.08).toFixed(3) + ')';
      ctx.fillRect(rand() * size, rand() * size, 12 + rand() * 40, 1.5 + rand() * 2);
    }
    speckle(ctx, size, 250, ['#2a7ab0', '#164e75'], rand, 1, 3);
  });
}

/* Radial glow sprite (concentric flat circles — no gradient API). */
export function glowSprite() {
  const tex = makeCanvasTexture(128, (ctx, size) => {
    const c = size / 2;
    for (let i = 12; i >= 1; i--) {
      ctx.fillStyle = 'rgba(255,244,220,' + (0.75 * (13 - i) / 12).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(c, c, (i / 12) * c, 0, Math.PI * 2); ctx.fill();
    }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function cloudTexture() {
  const tex = makeCanvasTexture(128, (ctx, size) => {
    const rand = mulberry32(88);
    for (let i = 0; i < 26; i++) {
      blob(ctx, rand() * size, rand() * size, 10 + rand() * 22,
        'rgba(255,255,255,A)'.replace('A', (0.10 + rand() * 0.14).toFixed(3)), 3);
    }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* Crait: white salt flats with red mineral cracks. */
export function saltTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(99);
    ctx.fillStyle = '#eef1f4'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 500, ['#ffffff', '#dde3e9', '#cfd6dd'], rand, 1, 3);
    cracks(ctx, size, 12, '#b03a2e', rand, 2);
    cracks(ctx, size, 6, '#7e241c', rand, 1);
  });
}

export function swampTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(111);
    ctx.fillStyle = '#44502c'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 20; i++) blob(ctx, rand() * size, rand() * size, 14 + rand() * 30, 'rgba(30,38,20,A)', 3);
    ctx.fillStyle = '#3f7a3a';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath(); ctx.arc(rand() * size, rand() * size, 4 + rand() * 7, 0, Math.PI * 2); ctx.fill();
    }
    speckle(ctx, size, 300, ['#556636', '#37411f'], rand, 1, 3);
  });
}

/* Coruscant ground: dark city plane with a lit-window grid. */
export function cityTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(122);
    ctx.fillStyle = '#101218'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#2a2e38'; ctx.lineWidth = 3;
    const step = size / 6;
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    for (let ix = 0; ix < 6; ix++) for (let iy = 0; iy < 6; iy++) {
      for (let w = 0; w < 6; w++) {
        const lit = rand() < 0.45;
        ctx.fillStyle = lit ? (rand() < 0.8 ? '#ffd98a' : '#bfe3ff') : '#05070c';
        ctx.fillRect(ix * step + 6 + (w % 3) * 11, iy * step + 7 + ((w / 3) | 0) * 12, 7, 8);
      }
    }
  });
}

export const TEXTURE_NAMES = [
  'sandTexture', 'rockTexture', 'iceTexture', 'lavaTexture', 'metalTexture',
  'leafTexture', 'waterTexture', 'glowSprite', 'cloudTexture', 'saltTexture',
  'swampTexture', 'cityTexture',
];

/* ------------------------------------------------------------------
 * Galaxy-map sprite textures (NOT in TEXTURE_NAMES — they're UI/skybox
 * sprites, not terrain surfaces, and they use gradients which need a
 * real canvas 2d context). galaxy.js probes for these with typeof
 * checks and falls back to its own canvas painters when absent.
 * ------------------------------------------------------------------ */

/** Soft round star sprite, 64px. */
export function starTexture() {
  return makeCanvasTexture(64, (ctx, size) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Diffuse nebula glow, 256px. rgb is a 'r,g,b' string. */
export function nebulaTexture(rgb) {
  return makeCanvasTexture(256, (ctx, size) => {
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, `rgba(${rgb},0.5)`);
    g.addColorStop(0.5, `rgba(${rgb},0.22)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Padlock glyph for locked planets, 96px. */
export function lockTexture() {
  return makeCanvasTexture(96, (ctx) => {
    ctx.strokeStyle = 'rgba(175,180,195,0.95)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(48, 44, 20, Math.PI, 0);
    ctx.stroke();
    const x = 24, y = 42, w = 48, h = 38, r = 9;
    ctx.fillStyle = 'rgba(130,136,150,0.95)';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(20,20,28,0.9)';
    ctx.beginPath();
    ctx.arc(48, 56, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(45.5, 56, 5, 12);
  });
}
