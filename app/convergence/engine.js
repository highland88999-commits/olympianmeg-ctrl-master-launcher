/**
 * Convergence — audio-reactive convergence field, pure logic. No DOM, no network.
 */

/** World radius of the 3D convergence field (world units). */
export const FIELD_R = 30;

/** Average a frequency-data slice into bass/mid/treble (0..1). */
export function bandLevels(freqData) {
  const n = freqData.length;
  if (n === 0) return { bass: 0, mid: 0, treble: 0 };
  const avg = (a, b) => {
    const s = Math.max(0, a), e = Math.min(n, b);
    if (e <= s) return 0;
    let sum = 0;
    for (let i = s; i < e; i++) sum += freqData[i];
    return sum / (e - s) / 255;
  };
  return {
    bass: avg(0, Math.floor(n * 0.12)),
    mid: avg(Math.floor(n * 0.12), Math.floor(n * 0.45)),
    treble: avg(Math.floor(n * 0.45), n),
  };
}

/**
 * Deterministic demo signal (no mic needed): sum of oscillators.
 * t in seconds; returns freqData-like array of 0..255.
 */
export function demoSignal(t, bins = 128) {
  const out = new Array(bins).fill(0);
  const pulse = (f, amp, width) => {
    for (let b = 0; b < bins; b++) {
      const d = b - f * bins;
      out[b] += amp * Math.exp(-(d * d) / (2 * width * width));
    }
  };
  const wob = 0.5 + 0.5 * Math.sin(t * 0.9);
  pulse(0.08 + 0.02 * Math.sin(t * 0.5), 200 * wob, 3); // bass kick
  pulse(0.28 + 0.05 * Math.sin(t * 1.7), 130 * (0.4 + 0.6 * wob), 5); // mid
  pulse(0.62 + 0.08 * Math.sin(t * 2.3), 90 * (0.3 + 0.7 * Math.abs(Math.sin(t * 3.1))), 8); // treble
  return out.map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

/** One particle in the convergence field. */
export function makeParticle(w, h, rng) {
  const a = rng() * Math.PI * 2;
  const r = Math.min(w, h) * (0.3 + rng() * 0.5);
  return {
    x: w / 2 + Math.cos(a) * r,
    y: h / 2 + Math.sin(a) * r,
    vx: 0,
    vy: 0,
    hue: rng() * 360,
    size: 0.8 + rng() * 2.2,
    orbit: 0.3 + rng() * 0.9,
  };
}

/**
 * Convergence force: pull toward center ∝ bass, tangential swirl ∝ mid,
 * scatter ∝ treble. Pure function of levels.
 */
export function stepConvergence(p, levels, w, h, dt, strength = 1) {
  const cx = w / 2, cy = h / 2;
  const dx = cx - p.x, dy = cy - p.y;
  const d = Math.hypot(dx, dy) + 1;
  const pull = levels.bass * 900 * strength;
  p.vx += (dx / d) * pull * dt;
  p.vy += (dy / d) * pull * dt;
  // swirl
  const sw = levels.mid * 320 * strength * p.orbit;
  p.vx += (-dy / d) * sw * dt;
  p.vy += (dx / d) * sw * dt;
  // treble scatter
  const sc = levels.treble * 260 * strength;
  p.vx += (p.x < cx ? -1 : 1) * sc * dt * 0.5;
  p.vy += (p.y < cy ? -1 : 1) * sc * dt * 0.5;
  // gentle re-centering drag
  p.vx *= 0.985;
  p.vy *= 0.985;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // keep on screen
  if (p.x < 0) p.x = 0;
  if (p.x > w) p.x = w;
  if (p.y < 0) p.y = 0;
  if (p.y > h) p.y = h;
  return p;
}

// ---------------------------------------------------------------------------
// 3D field: same force model as the 2D version, extended into a volume.
// Particles live in a sphere of radius FIELD_R around the origin.
// ---------------------------------------------------------------------------

/** One particle in the 3D convergence field. */
export function makeParticle3D(rng) {
  // random direction, radius biased toward the shell so the core reads hollow
  const u = rng() * 2 - 1;
  const th = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const r = FIELD_R * (0.35 + rng() * 0.6);
  return {
    x: s * Math.cos(th) * r,
    y: u * r * 0.7,
    z: s * Math.sin(th) * r,
    vx: 0,
    vy: 0,
    vz: 0,
    hue: rng() * 360,
    size: 0.8 + rng() * 2.2,
    orbit: 0.3 + rng() * 0.9,
  };
}

/**
 * 3D convergence force: pull toward the core ∝ bass, swirl around the
 * vertical (Y) axis ∝ mid, scatter ∝ treble. Pure function of levels.
 */
export function stepConvergence3D(p, levels, dt, strength = 1) {
  const d = Math.hypot(p.x, p.y, p.z) + 1;
  // bass: pull toward the core
  const pull = levels.bass * 900 * strength;
  p.vx += (-p.x / d) * pull * dt;
  p.vy += (-p.y / d) * pull * dt;
  p.vz += (-p.z / d) * pull * dt;
  // mid: swirl around the Y axis (tangential in the XZ plane)
  const sw = levels.mid * 320 * strength * p.orbit;
  p.vx += (-p.z / d) * sw * dt;
  p.vz += (p.x / d) * sw * dt;
  // treble: scatter outward along each axis
  const sc = levels.treble * 260 * strength * 0.5 * dt;
  p.vx += (p.x < 0 ? -1 : 1) * sc;
  p.vy += (p.y < 0 ? -1 : 1) * sc;
  p.vz += (p.z < 0 ? -1 : 1) * sc;
  // gentle drag
  p.vx *= 0.985;
  p.vy *= 0.985;
  p.vz *= 0.985;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  // keep inside the field sphere
  const rr = Math.hypot(p.x, p.y, p.z);
  if (rr > FIELD_R) {
    const k = FIELD_R / rr;
    p.x *= k;
    p.y *= k;
    p.z *= k;
  }
  return p;
}

/** Mean distance of particles from the core (0..FIELD_R). Pure diagnostic. */
export function meanRadius(particles) {
  if (particles.length === 0) return 0;
  let sum = 0;
  for (const p of particles) sum += Math.hypot(p.x, p.y, p.z);
  return sum / particles.length;
}
