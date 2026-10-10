/*
 * MIDDLE-EARTH pocket universe — procedural canvas textures.
 *
 * Zero external network at runtime: every texture is painted on an offscreen
 * canvas when its maker is called. No document/window access at module import
 * time — only inside the maker functions, which run client-side (or under the
 * node test DOM stub).
 *
 * Draw code uses only flat fill/stroke calls (fillRect, arc+fill, moveTo/
 * lineTo+stroke, style assignments) so it also runs against a minimal canvas
 * stub: no gradients, no ImageData, no composite ops, no shadow API.
 *
 * Visual language adapts the mount-doom foundry (seeded PRNG, layered
 * speckle, bright crack random-walks) to the full journey west to east.
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
 * with Repeat wrapping and sRGB color space. Called client-side only.
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

/* --- helpers (flat calls only) --- */

function speckle(ctx, size, count, colors, rand, minS, maxS) {
  minS = minS == null ? 1 : minS;
  maxS = maxS == null ? 3 : maxS;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const s = minS + rand() * (maxS - minS);
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

/* Random-walk cracks, mount-doom style but flat. */
function cracks(ctx, size, count, color, rand, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width == null ? 2 : width;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rand() * size, y = rand() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 4 + ((rand() * 4) | 0);
    for (let s = 0; s < segs; s++) {
      x += (rand() - 0.5) * size * 0.3;
      y += (rand() - 0.5) * size * 0.3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/* Short blade/strand strokes for grass, thatch, bark. */
function strands(ctx, size, count, colors, rand, len, vertical) {
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = colors[(rand() * colors.length) | 0];
    ctx.lineWidth = 1 + rand() * 1.6;
    const x = rand() * size, y = rand() * size;
    const dx = vertical ? (rand() - 0.5) * 8 : (rand() - 0.5) * len;
    const dy = vertical ? (rand() - 0.5) * len : (rand() - 0.5) * 8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
}

/* Soft blob from concentric flat circles (no gradient API). */
function blob(ctx, x, y, r, rgb, alpha, steps) {
  steps = steps || 5;
  for (let i = steps; i >= 1; i--) {
    ctx.fillStyle = 'rgba(' + rgb + ',' + (alpha * (steps - i + 1) / steps).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, (i / steps) * r, 0, Math.PI * 2); ctx.fill();
  }
}

function spriteTexture(size, drawFn) {
  const tex = makeCanvasTexture(size, drawFn);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* --- Named makers: each takes no required args, returns a texture. --- */

export function grassTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(101);
    ctx.fillStyle = '#a9c47e'; ctx.fillRect(0, 0, size, size);
    strands(ctx, size, 900, ['#8fae5c', '#bcd694', '#7d9c4e', '#c4dc9c'], rand, 14, false);
    speckle(ctx, size, 500, ['#9dbb6a', '#b5d189', '#8aa854'], rand, 1, 3);
  });
}

export function forestFloorTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(102);
    ctx.fillStyle = '#4a3d28'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 700, ['#5d4c33', '#3a2f1f', '#6e5a3c', '#2e2517'], rand, 1, 4);
    // fallen leaves
    for (let i = 0; i < 130; i++) {
      ctx.fillStyle = ['#7a5a2e', '#8a6a3a', '#5d4423'][(rand() * 3) | 0];
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, 2 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    cracks(ctx, size, 6, 'rgba(20,14,8,0.5)', rand, 2);
  });
}

export function stoneTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(103);
    ctx.fillStyle = '#8d8d94'; ctx.fillRect(0, 0, size, size);
    // block courses
    ctx.strokeStyle = 'rgba(40,40,46,0.55)'; ctx.lineWidth = 3;
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * size;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      const off = (r % 2) * size / 4;
      for (let cx = 0; cx <= 2; cx++) {
        const x = ((cx / 2) * size + off) % size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + size / rows); ctx.stroke();
      }
    }
    speckle(ctx, size, 500, ['#7d7d84', '#9d9da4', '#6e6e75'], rand, 1, 3);
  });
}

export function marbleTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(104);
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(0, 0, size, size);
    cracks(ctx, size, 12, 'rgba(150,145,132,0.55)', rand, 1.2);
    cracks(ctx, size, 5, 'rgba(110,105,94,0.5)', rand, 2);
    speckle(ctx, size, 200, ['#f2efe6', '#dcd8cc'], rand, 1, 2);
  });
}

export function goldLeafTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(105);
    ctx.fillStyle = '#c9962e'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 600, ['#e0b44a', '#a87c1e', '#f2d67e', '#8a5f14'], rand, 1, 4);
    cracks(ctx, size, 7, 'rgba(120,80,16,0.5)', rand, 1.5);
  });
}

export function thatchTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(106);
    ctx.fillStyle = '#b99a55'; ctx.fillRect(0, 0, size, size);
    strands(ctx, size, 1100, ['#8f7439', '#d9bd7d', '#a3863f', '#c7a862'], rand, 26, true);
    speckle(ctx, size, 250, ['#9c803f', '#cbb06a'], rand, 1, 2);
  });
}

export function ashTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(107);
    ctx.fillStyle = '#3a3733'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 800, ['#55504a', '#2a2724', '#6e6a63', '#1f1d1b'], rand, 1, 4);
    cracks(ctx, size, 8, 'rgba(12,10,9,0.6)', rand, 2.5);
  });
}

/* Dark basalt plates with glowing cracks — emissive look comes from the
 * material; the texture only carries the colors. */
export function lavaTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(108);
    ctx.fillStyle = '#140d09'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 500, ['#0d0a08', '#241a12', '#1c1410'], rand, 2, 6);
    cracks(ctx, size, 14, '#ff7a1f', rand, 2.5);
    cracks(ctx, size, 7, '#ffc23d', rand, 1.2);
    speckle(ctx, size, 60, ['#ff9a3d', '#ff5a1a'], rand, 1, 2);
  });
}

export function rockTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(109);
    ctx.fillStyle = '#6f6257'; ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 700, ['#5d5047', '#7f7268', '#4e443c'], rand, 1, 4);
    cracks(ctx, size, 10, 'rgba(30,24,20,0.6)', rand, 2.5);
  });
}

export function barkTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(110);
    ctx.fillStyle = '#5d4630'; ctx.fillRect(0, 0, size, size);
    strands(ctx, size, 700, ['#42301e', '#74573a', '#33241a', '#6e5334'], rand, 40, true);
    speckle(ctx, size, 300, ['#4c3826', '#6b4f33'], rand, 1, 3);
  });
}

export function waterTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(111);
    ctx.fillStyle = '#2a6f9e'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + rand() * 0.08).toFixed(3) + ')';
      ctx.fillRect(rand() * size, rand() * size, 12 + rand() * 40, 1.5 + rand() * 2);
    }
    speckle(ctx, size, 250, ['#2a7ab0', '#164e75', '#3f96c4'], rand, 1, 3);
  });
}

/* --- sprites (transparent backgrounds, soft flat-circle falloff) --- */

export function leafSprite() {
  return spriteTexture(128, (ctx, size) => {
    const rand = mulberry32(112);
    const c = size / 2;
    for (let i = 0; i < 9; i++) {
      blob(ctx, c + (rand() - 0.5) * 30, c + (rand() - 0.5) * 30,
        14 + rand() * 22, '120,180,80', 0.5, 4);
    }
  });
}

export function emberSprite() {
  return spriteTexture(128, (ctx, size) => {
    const c = size / 2;
    blob(ctx, c, c, c * 0.95, '255,110,20', 0.55, 6);
    blob(ctx, c, c, c * 0.55, '255,200,80', 0.8, 5);
    blob(ctx, c, c, c * 0.28, '255,246,220', 1, 4);
  });
}

export function smokeSprite() {
  return spriteTexture(128, (ctx, size) => {
    const rand = mulberry32(114);
    const c = size / 2;
    for (let i = 0; i < 10; i++) {
      const g = 120 + ((rand() * 60) | 0);
      blob(ctx, c + (rand() - 0.5) * 44, c + (rand() - 0.5) * 36,
        16 + rand() * 24, g + ',' + g + ',' + g, 0.28, 4);
    }
  });
}

export function fireflySprite() {
  return spriteTexture(128, (ctx, size) => {
    const c = size / 2;
    blob(ctx, c, c, c * 0.95, '216,255,122', 0.5, 6);
    blob(ctx, c, c, c * 0.5, '240,255,170', 0.85, 5);
    blob(ctx, c, c, c * 0.24, '255,255,240', 1, 4);
  });
}
