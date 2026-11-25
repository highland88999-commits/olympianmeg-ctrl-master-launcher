/*
 * OLYMPIAN MONSTERVERSE — procedural canvas textures.
 * Same contract as the Middle-earth texture module: zero network
 * at runtime, no document/window access at import time, flat
 * canvas calls only (fillRect, arc+fill, moveTo/lineTo+stroke)
 * so the makers also run against a minimal canvas stub.
 */
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function speckle(ctx, size, count, colors, rand, minS, maxS) {
  minS = minS == null ? 1 : minS;
  maxS = maxS == null ? 3 : maxS;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const s = minS + rand() * (maxS - minS);
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

function cracks(ctx, size, count, color, rand, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width == null ? 2 : width;
  for (let i = 0; i < count; i++) {
    let x = rand() * size;
    let y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 4 + ((rand() * 5) | 0);
    for (let s = 0; s < steps; s++) {
      x += (rand() - 0.5) * 40;
      y += (rand() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function blobs(ctx, size, count, colors, rand, minR, maxR) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, minR + rand() * (maxR - minR), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Vertical strokes (pillar fluting, wood grain on end grain). */
function vlines(ctx, size, count, color, rand, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width == null ? 2 : width;
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rand() - 0.5) * 8, size);
    ctx.stroke();
  }
}

/* Horizontal strokes (planks, strata, course joints). */
function hlines(ctx, size, count, color, rand, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width == null ? 2 : width;
  for (let i = 0; i < count; i++) {
    const y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rand() - 0.5) * 8);
    ctx.stroke();
  }
}

function groundBase(ctx, size, base, rand) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], rand, 1, 3);
}

/* Sickly green flats, bubble pits. */
export function acidGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7101);
    groundBase(ctx, size, '#5f9434', rand);
    blobs(ctx, size, 26, ['#b6e33c', '#8fd43a', '#4a7a28'], rand, 4, 16);
    speckle(ctx, size, 260, ['#d8f26a', '#3c6a22'], rand, 1, 3);
  });
}

/* Black basalt, ember cracks. */
export function fireGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7102);
    groundBase(ctx, size, '#3a2c26', rand);
    cracks(ctx, size, 14, '#ff6a22', rand, 2);
    cracks(ctx, size, 8, '#ffb347', rand, 1);
    speckle(ctx, size, 200, ['#ff7a33', '#1e1712'], rand, 1, 3);
  });
}

/* Pale storm flats, charge streaks. */
export function lightningGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7103);
    groundBase(ctx, size, '#8a907e', rand);
    cracks(ctx, size, 16, '#ffe14d', rand, 1);
    speckle(ctx, size, 220, ['#f2e9a8', '#5a5a48'], rand, 1, 3);
  });
}

/* Violet mists, spore blobs. */
export function poisonGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7104);
    groundBase(ctx, size, '#423252', rand);
    blobs(ctx, size, 30, ['#c06ae0', '#7a4aa0', '#2e2140'], rand, 5, 18);
    speckle(ctx, size, 240, ['#d894f0', '#241a30'], rand, 1, 3);
  });
}

/* Grey gloom, smoke wisps. */
export function shadowGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7105);
    groundBase(ctx, size, '#35353a', rand);
    blobs(ctx, size, 22, ['#5a5a64', '#242428', '#6a6a76'], rand, 6, 20);
    speckle(ctx, size, 200, ['#7a7a86', '#1c1c20'], rand, 1, 3);
  });
}

/* Ochre dunes, wreck speckle. */
export function sandGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7106);
    groundBase(ctx, size, '#b4935a', rand);
    blobs(ctx, size, 18, ['#d8bc82', '#8a6a38'], rand, 6, 18);
    speckle(ctx, size, 300, ['#e8c87a', '#6a4e28'], rand, 1, 3);
  });
}

/* Jagged grey rock, pale scree. */
export function mountainGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7107);
    groundBase(ctx, size, '#6e6e78', rand);
    cracks(ctx, size, 12, '#4a4a52', rand, 2);
    speckle(ctx, size, 280, ['#d8d8e0', '#3c3c44'], rand, 1, 4);
  });
}

export function frostGroundTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(8107);
    groundBase(ctx, size, '#a8c8d8', rand);
    cracks(ctx, size, 10, '#7a9ab0', rand, 2);
    speckle(ctx, size, 280, ['#e8f4f8', '#6a8aa0'], rand, 1, 4);
  });
}

/* Neutral ground detail (G-01): a near-white grey grain + cracks +
 * speckle that multiplies over the terrain's vertex colours — the
 * per-band character stays in the vertex colours, this adds only
 * the grain the ground lacks. Base near white so the biome hues
 * survive; dark cracks + light speckle give the bump read too. */
export function groundDetailTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7109);
    groundBase(ctx, size, '#b4b4b4', rand);
    cracks(ctx, size, 12, '#5f5f5f', rand, 2);
    cracks(ctx, size, 8, '#8a8a8a', rand, 1);
    speckle(ctx, size, 420, ['#d8d8d8', '#6a6a6a', '#9a9a9a'], rand, 1, 3);
    blobs(ctx, size, 14, ['#c8c8c8', '#7a7a7a'], rand, 4, 14);
  });
}

/* Acid-river flow texture (G-05): the acidGroundTexture bubble
 * language on a PALE base, so it can ride as a map under the
 * ribbon's bright-green basic colour (map x colour) and still
 * read green, with lighter bubble streaks that scroll. */
export function acidRiverTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7110);
    groundBase(ctx, size, '#c8e89a', rand);
    blobs(ctx, size, 26, ['#ffffff', '#8fd43a', '#d8f26a'], rand, 4, 16);
    speckle(ctx, size, 260, ['#ffffff', '#8fd43a'], rand, 1, 3);
  });
}

/* The core-sun glow: concentric pale discs, flat calls only. */
export function coreGlowTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7108);
    const cx = size / 2;
    const cy = size / 2;
    for (let r = 120; r > 0; r -= 12) {
      ctx.fillStyle = r > 60 ? 'rgba(255,220,140,0.10)' : 'rgba(255,240,190,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, size, 60, ['rgba(255,255,220,0.5)'], rand, 1, 2);
  });
}

/* ---- Dive round (Merlin, Nov 24 ~16:51): graphic textures for
 * every object — the flat-colour bodies of the landmarks and the
 * scatter now wear procedural maps in the seven element colours
 * + biome accents. Colour rule: where the texture itself carries
 * the kind's colour (dark stone, ember rock, poison stone, wood,
 * acid) the material colour goes white; where the texture is a
 * pale/neutral grain the material keeps its old colour as the
 * multiplier, so the hue survives (the groundDetailTexture
 * pattern). Every maker is seeded, so the world reads the same
 * on every load. ---- */

/* Dark basalt/gloom stone: gloom-monolith, korus-throne,
 * court-brazier bowls, gloom-pillar scatter, unknown marker,
 * inverted-horizon cones. Texture carries the dark — colour white. */
export function darkStoneTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7201);
    groundBase(ctx, size, '#33333a', rand);
    blobs(ctx, size, 18, ['#45454e', '#26262c'], rand, 6, 18);
    cracks(ctx, size, 10, '#1c1c20', rand, 2);
    speckle(ctx, size, 320, ['#55555e', '#1e1e22', '#6a6a72'], rand, 1, 3);
  });
}

/* Pale carved pillar stone, fluted: the Haven's eight pillars.
 * Pale neutral grain — the pillar keeps its 0xd8d2c2 colour. */
export function palePillarTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7202);
    groundBase(ctx, size, '#ddd6c4', rand);
    vlines(ctx, size, 24, '#b8b09a', rand, 2);
    hlines(ctx, size, 6, '#c8c0a8', rand, 1);
    speckle(ctx, size, 200, ['#f2ecdc', '#a89e86'], rand, 1, 3);
  });
}

/* Ship's wood, planks + grain + knots: the wreck-hulk hull and
 * ribs. Texture carries the brown — colour white. */
export function woodTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7203);
    groundBase(ctx, size, '#6a4e28', rand);
    hlines(ctx, size, 8, '#4a3418', rand, 2);
    hlines(ctx, size, 14, '#7a5a32', rand, 1);
    blobs(ctx, size, 6, ['#3a2c1a'], rand, 3, 6);
    speckle(ctx, size, 200, ['#8a6a3a', '#3a2c1a'], rand, 1, 3);
  });
}

/* Rusted metal: the storm-pylon pole and the hulk's mast.
 * Light warm-grey base with rust blotches — the pylon keeps its
 * pale colour, the mast goes white (its old colour is too dark
 * to multiply through). */
export function rustedMetalTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7204);
    groundBase(ctx, size, '#b0a89e', rand);
    blobs(ctx, size, 22, ['#8a5a30', '#6a4a28', '#9a7a4a'], rand, 4, 14);
    cracks(ctx, size, 6, '#5a4a3a', rand, 1);
    speckle(ctx, size, 260, ['#7a5a40', '#d8d0c0'], rand, 1, 3);
  });
}

/* Pale blue-white ice, crack veins: frost-spire + frost-shard.
 * Pale grain — the pieces keep their frost colours. */
export function iceTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7205);
    groundBase(ctx, size, '#c8e0ea', rand);
    cracks(ctx, size, 10, '#7a9ab0', rand, 1);
    blobs(ctx, size, 16, ['#e8f4f8', '#9fd8e8'], rand, 5, 16);
    speckle(ctx, size, 240, ['#ffffff', '#6a8aa0'], rand, 1, 3);
  });
}

/* Ochre sandstone, strata bands: intro-arch pillars + lintel,
 * dune-bone scatter. Pale grain — colours kept. */
export function sandstoneTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7206);
    groundBase(ctx, size, '#c8a86a', rand);
    hlines(ctx, size, 8, '#a8824a', rand, 2);
    blobs(ctx, size, 14, ['#e8c87a', '#8a6a38'], rand, 6, 16);
    speckle(ctx, size, 280, ['#e8c87a', '#6a4e28'], rand, 1, 3);
  });
}

/* Black basalt, ember cracks: the ember-spire shaft + base and
 * ember-rock scatter. Texture carries the dark + fire — white. */
export function emberRockTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7207);
    groundBase(ctx, size, '#2a201c', rand);
    blobs(ctx, size, 10, ['#3a2c26'], rand, 5, 14);
    cracks(ctx, size, 12, '#ff6a22', rand, 2);
    cracks(ctx, size, 8, '#ffb347', rand, 1);
    speckle(ctx, size, 220, ['#ff7a33', '#1e1712'], rand, 1, 3);
  });
}

/* Acid green, bubble pits: ooze-pool rim + disc + bubbles and
 * ooze-bubble scatter. Texture carries the green — white. */
export function acidBubbleTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7208);
    groundBase(ctx, size, '#6da83c', rand);
    blobs(ctx, size, 26, ['#b6e33c', '#8fd43a', '#4a7a28'], rand, 4, 16);
    speckle(ctx, size, 260, ['#d8f26a', '#3c6a22'], rand, 1, 3);
  });
}

/* Violet poison stone: mire-arch pillars + lintel.
 * Texture carries the violet — colour white. */
export function poisonStoneTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7209);
    groundBase(ctx, size, '#423252', rand);
    blobs(ctx, size, 22, ['#7a4aa0', '#c06ae0', '#2e2140'], rand, 5, 16);
    cracks(ctx, size, 8, '#2e2140', rand, 1);
    speckle(ctx, size, 220, ['#d894f0', '#241a30'], rand, 1, 3);
  });
}

/* Jagged grey mountain rock, pale scree: peak-shrine tiers and
 * peak-rock scatter (incl. the Ghorrum dressing ring).
 * Neutral grain — the rock colours are kept. */
export function mountainStoneTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7210);
    groundBase(ctx, size, '#7a7a82', rand);
    blobs(ctx, size, 14, ['#8a8a92', '#5a5a64'], rand, 6, 16);
    cracks(ctx, size, 12, '#4a4a52', rand, 2);
    speckle(ctx, size, 280, ['#d8d8e0', '#3c3c44'], rand, 1, 4);
  });
}

/* Violet spore-cap skin, pale mottling + dark pores:
 * spore-cap scatter. Colour kept (0xc06ae0). */
export function sporeCapTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7211);
    groundBase(ctx, size, '#c06ae0', rand);
    blobs(ctx, size, 20, ['#d894f0', '#7a4aa0'], rand, 5, 14);
    speckle(ctx, size, 240, ['#e8b8f8', '#5a2a72'], rand, 1, 3);
    speckle(ctx, size, 60, ['#2e2140'], rand, 1, 2);
  });
}

/* Pale storm crystal, charge streaks: storm-crystal scatter.
 * Pale grain — the crystal keeps its yellow. */
export function stormCrystalTexture() {
  return makeCanvasTexture(256, (ctx, size) => {
    const rand = mulberry32(7212);
    groundBase(ctx, size, '#ffe9a8', rand);
    cracks(ctx, size, 10, '#ccaa00', rand, 1);
    blobs(ctx, size, 12, ['#fff2c8', '#f2d24a'], rand, 5, 14);
    speckle(ctx, size, 220, ['#ffffff', '#e8c84a'], rand, 1, 3);
  });
}

/* One shared instance per maker per textures module: every
 * landmark and scatter piece of a kind wears the SAME canvas
 * texture instead of minting one per mesh. Returns null when
 * the module has no such maker (a stub T, or an old caller) —
 * the caller then leaves the material flat, never a crash. */
const _sharedCache = new WeakMap();
export function sharedTexture(T, name) {
  const maker = T && T[name];
  if (typeof maker !== 'function') return null;
  let per = _sharedCache.get(T);
  if (!per) { per = new Map(); _sharedCache.set(T, per); }
  if (!per.has(name)) per.set(name, maker());
  return per.get(name);
}
