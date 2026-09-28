/**
 * Prometheus' Forge — fire/ember/spark simulation. Pure logic, no DOM, no network.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ember spawns in the fire bed (fx,fy) with upward velocity scaled by heat. */
export function spawnEmber(fx, fy, heat, rng) {
  const a = (rng() - 0.5) * 0.9;
  const s = (60 + rng() * 120) * (0.5 + heat * 0.9);
  return {
    x: fx + (rng() - 0.5) * 60,
    y: fy - rng() * 10,
    vx: Math.sin(a) * s * 0.35,
    vy: -s,
    life: 1.2 + rng() * 2.2,
    maxLife: 3.4,
    size: 1 + rng() * 2.4,
    seed: rng() * 1000,
  };
}

/** Spark burst: fast radial shards from a hammer strike. */
export function spawnSparks(x, y, n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const s = 120 + rng() * 420;
    out.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 160,
      life: 0.5 + rng() * 1.1,
      maxLife: 1.6,
      size: 0.8 + rng() * 1.6,
      seed: rng() * 1000,
    });
  }
  return out;
}

/**
 * Advance ember/spark. wind = {x,y} force; heat 0..1 scales turbulence.
 * Returns false when dead.
 */
export function stepFire(p, wind, heat, t, dt) {
  const turb = (0.4 + heat * 1.6);
  p.vx += Math.sin(p.y * 0.02 + t * 3 + p.seed) * 90 * turb * dt;
  p.vx += wind.x * dt;
  p.vy += wind.y * dt;
  // buoyancy for embers (negative vy), gravity-ish drag for sparks
  p.vx *= 0.985;
  p.vy = p.vy * 0.985 - 26 * heat * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  return p.life > 0;
}

/** Fire color ramp: hue 55 (cool) -> 15 (hot) by heat; fade by life fraction. */
export function fireColor(p, heat) {
  const fade = Math.max(0, p.life / p.maxLife);
  return {
    hue: 52 - heat * 34 + (1 - fade) * 10,
    sat: 100,
    light: 32 + fade * 40,
    alpha: Math.min(1, fade * 1.4),
  };
}

/** Flame column height for the fire bed, procedural flicker. */
export function flameHeight(heat, t, seed) {
  return (40 + heat * 130) * (0.82 + 0.18 * Math.sin(t * 9 + seed) * Math.sin(t * 5.3 + seed * 2));
}
