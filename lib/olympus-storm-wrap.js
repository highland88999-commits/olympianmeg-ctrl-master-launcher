// lib/olympus-storm-wrap.js — "Olympus Storm" livery for the HUB bike.
//
// Merlin ordered a graphic wrap for the main-hub bike (2026-10-21). The
// design language is fixed: a deep violet-to-black base, a molten-gold
// Greek-key (meander) band, electric-cyan light-line pinstripes echoing
// the bike's glow, a lightning-bolt motif on the side fairing, and a
// subtle nebula fleck.
//
// This module is pure canvas-2D drawing (no THREE, no DOM beyond the
// canvas factory) so the design is headless-testable against a stub ctx.
// BikeRig turns the canvas into a THREE.CanvasTexture and hands it to
// WispBike as a PER-INSTANCE wrap; the Earth bike and the nova/argo bikes
// keep the shared brand wrap (public/textures/nova/TronBikes/wisp-wrap.png)
// and never see this texture.
//
// Canvas orientation contract (audited against three r164 BoxGeometry
// UVs, hull box 0.42 x 0.34 x 2.6, nose = +Z):
//   u runs STERN (u = 0) -> NOSE (u = 1); canvas top (y = 0) is the TOP
//   of the panel (v = 1 on both flanks, flipY default).
//   The -X flank reads u stern->nose directly. The +X flank reads the
//   same texture nose->stern, so WispBike gives the +X flank a
//   horizontally flipped clone (repeat.x = -1) and the design — bolt
//   toward the nose, meander running the same way — reads correctly on
//   BOTH sides.

export const STORM_WRAP_WIDTH = 1024;
export const STORM_WRAP_HEIGHT = 256;

// Deterministic PRNG (mulberry32) so the nebula fleck is identical on
// every load — no shimmering re-rolls between mounts.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLECK_COLORS = [
  'rgba(196,181,253,', // pale violet
  'rgba(240,171,252,', // magenta mist
  'rgba(103,232,249,', // cyan spark
  'rgba(255,233,168,', // gold dust
];

/**
 * Draw the Olympus Storm wrap onto a 2D context of size w x h.
 * Returns true on success. Uses only standard Canvas2D calls.
 */
export function drawOlympusStormWrap(ctx, w = STORM_WRAP_WIDTH, h = STORM_WRAP_HEIGHT) {
  if (!ctx || typeof ctx.fillRect !== 'function') return false;
  const rnd = mulberry32(0x57a11);

  // --- Base: deep violet melting into black, top to bottom. -------------
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#3d1473');
  base.addColorStop(0.45, '#20083f');
  base.addColorStop(1, '#040109');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // --- Nebula wash: a few soft colour clouds under everything. ---------
  const nebulae = [
    [0.18, 0.30, 0.30, 'rgba(124,58,237,0.20)'],
    [0.52, 0.72, 0.26, 'rgba(217,70,239,0.12)'],
    [0.84, 0.24, 0.24, 'rgba(34,211,238,0.10)'],
    [0.68, 0.80, 0.34, 'rgba(76,29,149,0.18)'],
  ];
  for (const [fx, fy, fr, col] of nebulae) {
    const r = fr * w;
    const g = ctx.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx * w - r, fy * h - r, r * 2, r * 2);
  }

  // --- Nebula fleck: hundreds of tiny seeded specks. --------------------
  for (let i = 0; i < 460; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.4 + rnd() * 1.5;
    const col = FLECK_COLORS[Math.floor(rnd() * FLECK_COLORS.length)];
    ctx.fillStyle = col + (0.12 + rnd() * 0.55).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- The molten-gold Greek-key (meander) band. ------------------------
  const bandH = Math.round(h * 0.17); // ~44px at 256
  const bandY = Math.round(h * 0.56);
  const gold = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  gold.addColorStop(0, '#8a5a00');
  gold.addColorStop(0.30, '#f6c453');
  gold.addColorStop(0.55, '#ffe9a8');
  gold.addColorStop(0.82, '#d97706');
  gold.addColorStop(1, '#7c4a03');
  ctx.fillStyle = gold;
  ctx.fillRect(0, bandY, w, bandH);
  // Dark rules framing the band.
  ctx.fillStyle = 'rgba(26,5,46,0.9)';
  ctx.fillRect(0, bandY - 2, w, 3);
  ctx.fillRect(0, bandY + bandH - 1, w, 3);
  // Meander key line-work in deep violet over the gold. One squared-spiral
  // unit, tiled the length of the band; the motif reads the same on both
  // flanks because the +X flank's texture is mirrored back (see header).
  ctx.strokeStyle = '#2a0a2e';
  ctx.lineWidth = Math.max(4, Math.round(bandH * 0.13));
  ctx.lineCap = 'square';
  const s = bandH; // unit cell = band height
  const m = s * 0.18; // motif inset
  for (let x = -s; x < w + s; x += s * 0.82) {
    ctx.beginPath();
    ctx.moveTo(x + m, bandY + s - m);
    ctx.lineTo(x + s - m, bandY + s - m);
    ctx.lineTo(x + s - m, bandY + m);
    ctx.lineTo(x + m * 2.1, bandY + m);
    ctx.lineTo(x + m * 2.1, bandY + s * 0.58);
    ctx.lineTo(x + s * 0.60, bandY + s * 0.58);
    ctx.stroke();
  }

  // --- Electric-cyan light-line pinstripes flanking the band. -----------
  // They echo the hub bike's cyan glow (AccentStripe / engine / pods).
  const stripeGrad = ctx.createLinearGradient(0, 0, w, 0);
  stripeGrad.addColorStop(0, '#0e7490');
  stripeGrad.addColorStop(0.5, '#67e8f9');
  stripeGrad.addColorStop(1, '#0e7490');
  ctx.strokeStyle = stripeGrad;
  ctx.lineWidth = 3;
  if ('shadowBlur' in ctx) {
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
  }
  for (const sy of [bandY - 11, bandY + bandH + 11]) {
    ctx.beginPath();
    ctx.moveTo(6, sy);
    ctx.lineTo(w - 6, sy);
    ctx.stroke();
  }
  if ('shadowBlur' in ctx) ctx.shadowBlur = 0;

  // --- Lightning bolt on the forward fairing (nose third of the panel). -
  const bx = w * 0.70; // bolt anchor, forward third
  const bolt = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.95);
  bolt.addColorStop(0, '#ffe9a8');
  bolt.addColorStop(0.55, '#f59e0b');
  bolt.addColorStop(1, '#22d3ee');
  ctx.beginPath();
  ctx.moveTo(bx + w * 0.055, h * 0.05);
  ctx.lineTo(bx - w * 0.035, h * 0.54);
  ctx.lineTo(bx + w * 0.015, h * 0.54);
  ctx.lineTo(bx - w * 0.015, h * 0.95);
  ctx.lineTo(bx + w * 0.115, h * 0.40);
  ctx.lineTo(bx + w * 0.055, h * 0.40);
  ctx.closePath();
  ctx.fillStyle = bolt;
  if ('shadowBlur' in ctx) {
    ctx.shadowColor = '#f6c453';
    ctx.shadowBlur = 14;
  }
  ctx.fill();
  if ('shadowBlur' in ctx) ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(10,2,16,0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- Stern falloff: keep the engine-glow zone dark. -------------------
  const stern = ctx.createLinearGradient(0, 0, w * 0.14, 0);
  stern.addColorStop(0, 'rgba(0,0,0,0.38)');
  stern.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = stern;
  ctx.fillRect(0, 0, w * 0.14, h);

  return true;
}

/**
 * Build a canvas with the wrap drawn. `doc` is injectable for tests;
 * defaults to the global document. Returns null when no canvas exists.
 */
export function makeStormWrapCanvas(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.createElement !== 'function') return null;
  const c = d.createElement('canvas');
  c.width = STORM_WRAP_WIDTH;
  c.height = STORM_WRAP_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  drawOlympusStormWrap(ctx, c.width, c.height);
  return c;
}
