// OLYMPIAN MONSTERVERSE — per-band ambient particles (G-04, WS4).
//
// One shared THREE.Points system with per-band colour/region/
// drift, wearing the shared particle sprite (lib/particles/
// sprites.js getParticleTexture, as Jupiter 2 does). Positions
// follow the biome weight field (same > 0.35 gate as scatter),
// drift by the device clock, recycle in place. Emissive-coloured
// points, additive — ZERO new real lights.
// Pure-ish builder: takes R + readers; the texture is passed in
// (null in node tests -> plain points, never a crash).

import { biomeWeights, BIOMES } from './biomes.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Per-band particle law: colour, sprite is the shared glow,
 * count, vertical drift (rise +, fall -), sway, height band.
 * Counts are small (550 total) — J2's rain is 900 in one box.
 * Poison is topped up to 100 for the G-06 spore garden
 * (2026-11-16): the violet spores are the garden's air. */
export const AMBIENT_BANDS = {
  acid: { color: 0xb6e33c, count: 90, rise: 1.2, sway: 0.8, yMin: 0.5, yMax: 6, spread: 120 },
  fire: { color: 0xff6a22, count: 70, rise: 0.8, sway: 0.6, yMin: 0.5, yMax: 8, spread: 120 },
  lightning: { color: 0xffe14d, count: 60, rise: 0.4, sway: 1.4, yMin: 1, yMax: 10, spread: 120 },
  poison: { color: 0xc06ae0, count: 100, rise: 0.3, sway: 1.0, yMin: 0.5, yMax: 6, spread: 120 },
  shadow: { color: 0x8a8a9a, count: 60, rise: 0.5, sway: 0.7, yMin: 0.5, yMax: 7, spread: 130 },
  sand: { color: 0xe8c87a, count: 60, rise: 0.2, sway: 1.2, yMin: 0.5, yMax: 5, spread: 130 },
  mountain: { color: 0xd8d8e0, count: 50, rise: -0.5, sway: 0.9, yMin: 1, yMax: 9, spread: 120 },
  frost: { color: 0xe8f4f8, count: 60, rise: -0.6, sway: 0.8, yMin: 0.5, yMax: 8, spread: 120 },
};

export const AMBIENT_TOTAL = Object.values(AMBIENT_BANDS)
  .reduce((n, b) => n + b.count, 0);

/* Seeded sample of points whose band weight clears 0.35 around
 * an anchor — the scatter gate, reused for the air. */
export function ambientBandPoints(band, count, rng, weightsAt) {
  const anchor = BIOMES[band].anchor;
  const spread = AMBIENT_BANDS[band].spread;
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < 400) {
    const x = anchor.x + (rng() - 0.5) * spread;
    const z = anchor.z + (rng() - 0.5) * spread;
    if ((weightsAt(x, z)[band] || 0) >= 0.35) pts.push({ x, z });
  }
  while (pts.length < count) pts.push({ x: anchor.x, z: anchor.z });
  return pts;
}

export function buildAmbientParticles(R, opts = {}) {
  const heightAt = opts.heightAt || (() => 0);
  const weightsAt = opts.biomeWeights || biomeWeights;
  const rng = opts.rng || mulberry32(77704);
  const group = new R.Group();
  const total = AMBIENT_TOTAL;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  // SPHERE PROJECTION (Nov 16 inner sphere): a particle's
  // height is a LIFT above its ground point along the local
  // up, and its sway runs in the tangent plane (a stored
  // per-point e1/e2 basis), not in world x/z — flat-world
  // sway would slide far-side particles through the shell.
  // Without opts the module falls back to flat placement, so
  // the ambient tests keep passing untouched. meta.y / yMin /
  // yMax are lifts (with heightAt 0 they read as absolute y,
  // exactly as the tests pin them).
  const groundPoint = opts.groundPoint || ((x, z, lift = 0) => ({ x, y: heightAt(x, z) + lift, z }));
  const groundUp = opts.groundUp || (() => ({ x: 0, y: 1, z: 0 }));
  const tangentBasis = (x, z) => {
    const u = groundUp(x, z);
    const ul = Math.hypot(u.x, u.y, u.z) || 1;
    const up = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
    const ref = Math.abs(up.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const e1 = {
      x: up.y * ref.z - up.z * ref.y,
      y: up.z * ref.x - up.x * ref.z,
      z: up.x * ref.y - up.y * ref.x,
    };
    const e1l = Math.hypot(e1.x, e1.y, e1.z) || 1;
    const e1n = { x: e1.x / e1l, y: e1.y / e1l, z: e1.z / e1l };
    const e2 = {
      x: up.y * e1n.z - up.z * e1n.y,
      y: up.z * e1n.x - up.x * e1n.z,
      z: up.x * e1n.y - up.y * e1n.x,
    };
    return { e1: e1n, e2 };
  };
  // Per-point drift state, recycled in place by update().
  const meta = [];
  let i = 0;
  for (const band of Object.keys(AMBIENT_BANDS)) {
    const cfg = AMBIENT_BANDS[band];
    const pts = ambientBandPoints(band, cfg.count, rng, weightsAt);
    const cr = ((cfg.color >> 16) & 255) / 255;
    const cg = ((cfg.color >> 8) & 255) / 255;
    const cb = (cfg.color & 255) / 255;
    for (const p of pts) {
      const lift0 = cfg.yMin + rng() * (cfg.yMax - cfg.yMin);
      const gp = groundPoint(p.x, p.z, lift0);
      positions[i * 3] = gp.x;
      positions[i * 3 + 1] = gp.y;
      positions[i * 3 + 2] = gp.z;
      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
      const { e1, e2 } = tangentBasis(p.x, p.z);
      meta.push({
        band, x: p.x, z: p.z, y: lift0,
        yMin: cfg.yMin,
        yMax: cfg.yMax,
        rise: cfg.rise, sway: cfg.sway, phase: rng() * Math.PI * 2,
        e1, e2,
      });
      i++;
    }
  }
  const geo = new R.BufferGeometry();
  geo.setAttribute('position', new R.BufferAttribute(positions, 3));
  geo.setAttribute('color', new R.BufferAttribute(colors, 3));
  const mat = new R.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.85,
    depthWrite: false, blending: R.AdditiveBlending, sizeAttenuation: true,
    map: opts.texture || undefined,
  });
  const points = new R.Points(geo, mat);
  points.userData.ambientParticles = true;
  group.add(points);
  group.userData.ambient = { points, meta, total };

  function update(dt, t) {
    const step = (typeof dt === 'number' && dt > 0 && dt < 5) ? dt : 0.016;
    const pos = geo.attributes.position.array;
    for (let k = 0; k < meta.length; k++) {
      const m = meta[k];
      m.y += m.rise * step;
      if (m.rise >= 0 && m.y > m.yMax) m.y = m.yMin;
      if (m.rise < 0 && m.y < m.yMin) m.y = m.yMax;
      // Radial lift + tangent sway: the point rises/falls
      // toward/away from the core and sways in the plane
      // tangent to the shell under it.
      const base = groundPoint(m.x, m.z, m.y);
      const sx = Math.sin(t * 0.5 + m.phase) * m.sway;
      const sz = Math.cos(t * 0.4 + m.phase) * m.sway;
      pos[k * 3] = base.x + m.e1.x * sx + m.e2.x * sz;
      pos[k * 3 + 1] = base.y + m.e1.y * sx + m.e2.y * sz;
      pos[k * 3 + 2] = base.z + m.e1.z * sx + m.e2.z * sz;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { group, update };
}
