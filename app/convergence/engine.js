/**
 * Convergence — audio-reactive convergence field, pure logic. No DOM, no network.
 */

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
