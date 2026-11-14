// lib/portal-swirl.js
// The living swirl — the face of a portal whose video has not arrived
// yet. Painted ONCE onto a small canvas and shared by every minimized
// portal in the Concourse's 3D hall (components/concourse/
// PortalHallScene.jsx): one texture, tinted per section, slowly
// rotating — instead of 165 separate effects.
//
// Pure by design: it draws onto a caller-provided 2D context and never
// touches document/canvas/THREE itself, so node tests can drive it
// with a recording stub. The painter runs in three layers:
//   1. a deep-space disc (violet core falling off to near-black),
//   2. spiral arms wound with a conic-style sweep of translucent arcs,
//   3. a bright heart + rim, so the disc reads as a lit portal mouth.
// The scene tints the result per instance (instanceColor multiplies
// the texture), so the arms are painted in a warm-neutral range that
// takes a hue well.

export const PORTAL_SWIRL_SIZE = 256;

// The default palette — the violet deep-space face every Concourse
// portal wears. A caller may pass its own palette (same shape) to
// paint the same vortex in another world's colours; the default call
// is byte-for-byte the original painting.
export const PORTAL_SWIRL_PALETTE = {
  base: [
    [0, '#4c2a9e'],
    [0.35, '#2c1660'],
    [0.72, '#150b33'],
    [1, '#070313'],
  ],
  arms: ['rgba(0,229,255,0.20)', 'rgba(150,110,255,0.22)', 'rgba(255,190,90,0.16)'],
  dust: 'rgba(230,240,255,0.5)',
  heart: [
    [0, 'rgba(255,246,220,0.85)'],
    [0.4, 'rgba(190,160,255,0.35)'],
    [1, 'rgba(120,80,255,0)'],
  ],
  rim: 'rgba(160,220,255,0.55)',
};

// Deterministic pseudo-random (mulberry32) — the swirl must look the
// same on every mount and in tests; no Math.random here.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The AURORA BOOT colours — the conic-gradient disc of the PortalRoom
// boot sequence (components/PortalRoom.jsx: 'AURORA SYSTEM Booting…'),
// the same four stops the transit wears. The hub gates wear them as a
// ring (paintAuroraBootRing) so a gate reads as the transit itself,
// not a different effect.
export const AURORA_BOOT_COLORS = ['#7ef0c8', '#8fd8ff', '#c084fc', '#ff7a1a'];

// Paint the transit's aurora ring: an annulus of short arc segments
// cycling through AURORA_BOOT_COLORS, wound the same way as the swirl
// arms (fixed seed — deterministic on every mount and in tests).
// The colour sweep is directional, so the ring's rotation is visible
// — it is the boot disc's spin made into a gate ring.
export function paintAuroraBootRing(ctx, size = PORTAL_SWIRL_SIZE, colors = AURORA_BOOT_COLORS) {
  const c = size / 2;
  const R = size / 2;
  const rand = rng(0x51ab3); // fixed seed — see note above
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();
  // Annulus band: 0.60R to 1.0R of the canvas — wide enough to cover
  // the whole ring-geometry band it textures (RingGeometry UVs map
  // the canvas's inscribed circle onto the ring's outer edge).
  const segments = 72;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.55 + rand() * 0.4;
    ctx.lineWidth = R * 0.40;
    ctx.beginPath();
    ctx.arc(c, c, R * 0.80, a0, a1);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return ctx;
}

// Paint the swirl into ctx, filling a size×size square. The portal
// disc samples the inscribed circle, so the corners stay transparent.
// `palette` defaults to PORTAL_SWIRL_PALETTE (the violet original).
export function paintPortalSwirl(ctx, size = PORTAL_SWIRL_SIZE, palette = PORTAL_SWIRL_PALETTE) {
  const c = size / 2;
  const R = size / 2;
  const rand = rng(0x9e3779); // fixed seed — see note above

  ctx.clearRect(0, 0, size, size);

  // 1 · the deep disc: a lit heart sinking to near-black at the rim.
  const base = ctx.createRadialGradient(c, c, 0, c, c, R);
  for (const [offset, color] of palette.base) base.addColorStop(offset, color);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();

  // 2 · spiral arms: three wound bands of short translucent arcs,
  // each ring of strokes rotated a little further than the last, so
  // the eye reads a turning vortex. Warm-cool alternation keeps the
  // tint-agnostic balance (cyan ice / violet depth / molten gold).
  const armColors = palette.arms;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();
  for (let arm = 0; arm < 3; arm += 1) {
    ctx.strokeStyle = armColors[arm];
    for (let ringI = 0; ringI < 9; ringI += 1) {
      const r = R * (0.16 + ringI * 0.095);
      const start = arm * ((Math.PI * 2) / 3) + ringI * 0.42;
      const sweep = 1.15 + rand() * 0.5;
      ctx.lineWidth = Math.max(2, R * 0.055 * (1 - ringI * 0.05));
      ctx.beginPath();
      ctx.arc(c, c, r, start, start + sweep);
      ctx.stroke();
    }
  }
  // Star-dust: a sparse scatter of bright motes caught in the turn.
  ctx.fillStyle = palette.dust;
  for (let i = 0; i < 46; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = R * (0.12 + rand() * 0.8);
    const s = rand() * 1.6 + 0.4;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 3 · the heart + rim: a bright core the tint can warm, and a lit
  // edge so each mini portal reads as a ring of light, not a smudge.
  const heart = ctx.createRadialGradient(c, c, 0, c, c, R * 0.3);
  for (const [offset, color] of palette.heart) heart.addColorStop(offset, color);
  ctx.fillStyle = heart;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = Math.max(2, size * 0.012);
  ctx.beginPath();
  ctx.arc(c, c, R - ctx.lineWidth, 0, Math.PI * 2);
  ctx.stroke();

  return ctx;
}
