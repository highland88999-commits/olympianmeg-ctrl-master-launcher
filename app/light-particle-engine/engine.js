/**
 * Light Particle Engine — pure simulation logic.
 * No DOM, no network. Seeded RNG makes every run reproducible.
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

/**
 * @param {object} emitter { type: 'point'|'fountain'|'ring'|'vortex', x, y, speed, spread }
 * @returns {object} particle { x, y, vx, vy, life, maxLife, hue, size }
 */
export function spawnParticle(emitter, rng, baseHue = 190) {
  const { type, x, y, speed } = emitter;
  let vx = 0;
  let vy = 0;
  let px = x;
  let py = y;
  const ang0 = rng() * Math.PI * 2;
  if (type === "point") {
    const a = ang0;
    const s = speed * (0.3 + rng() * 0.7);
    vx = Math.cos(a) * s;
    vy = Math.sin(a) * s;
  } else if (type === "fountain") {
    const a = -Math.PI / 2 + (rng() - 0.5) * (emitter.spread ?? 0.6);
    const s = speed * (0.6 + rng() * 0.6);
    vx = Math.cos(a) * s;
    vy = Math.sin(a) * s;
  } else if (type === "ring") {
    const r = emitter.radius ?? 40;
    px = x + Math.cos(ang0) * r;
    py = y + Math.sin(ang0) * r;
    const s = speed * (0.5 + rng() * 0.5);
    vx = Math.cos(ang0) * s;
    vy = Math.sin(ang0) * s;
  } else if (type === "vortex") {
    const r = 20 + rng() * 90;
    px = x + Math.cos(ang0) * r;
    py = y + Math.sin(ang0) * r;
    const dir = emitter.clockwise === false ? -1 : 1;
    const s = speed * (0.6 + rng() * 0.4);
    vx = -Math.sin(ang0) * s * dir;
    vy = Math.cos(ang0) * s * dir;
  }
  const maxLife = emitter.life * (0.6 + rng() * 0.8);
  return {
    x: px,
    y: py,
    vx,
    vy,
    life: maxLife,
    maxLife,
    hue: baseHue + (rng() - 0.5) * (emitter.hueSpread ?? 40),
    size: 1 + rng() * (emitter.size ?? 2.2),
  };
}

/**
 * Apply force fields to one particle. Fields are pure data:
 * { kind: 'well'|'repulsor'|'turbulence'|'wind'|'gravity', x, y, strength, dx, dy, scale }
 */
export function applyField(p, field, t, dt) {
  if (field.kind === "well" || field.kind === "repulsor") {
    const dx = field.x - p.x;
    const dy = field.y - p.y;
    const d2 = dx * dx + dy * dy + 400;
    const d = Math.sqrt(d2);
    const sign = field.kind === "well" ? 1 : -1;
    const f = (sign * field.strength) / d2;
    p.vx += (dx / d) * f * dt;
    p.vy += (dy / d) * f * dt;
  } else if (field.kind === "turbulence") {
    const s = field.strength * (field.scale ?? 0.004);
    p.vx += Math.sin(p.y * 0.004 + t * 1.7) * s * dt * 60;
    p.vy += Math.cos(p.x * 0.004 - t * 1.3) * s * dt * 60;
  } else if (field.kind === "wind") {
    p.vx += (field.dx ?? 0) * field.strength * dt;
    p.vy += (field.dy ?? 0) * field.strength * dt;
  } else if (field.kind === "gravity") {
    p.vy += field.strength * dt;
  }
}

/** Advance a particle by dt seconds. Returns false when the particle died. */
export function stepParticle(p, fields, t, dt, drag = 0.995) {
  for (const f of fields) applyField(p, f, t, dt);
  p.vx *= drag;
  p.vy *= drag;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  return p.life > 0;
}

/** Color for a particle given mode; hue stored per-particle. */
export function particleColor(p, mode) {
  const fade = Math.max(0, p.life / p.maxLife);
  if (mode === "ember") return { hue: 18 + fade * 24, sat: 95, light: 30 + fade * 35 };
  if (mode === "ice") return { hue: 200 + fade * 30, sat: 90, light: 35 + fade * 40 };
  if (mode === "mono") return { hue: 0, sat: 0, light: 25 + fade * 60 };
  if (mode === "prism") return { hue: p.hue, sat: 95, light: 35 + fade * 35 };
  return { hue: p.hue, sat: 90, light: 40 + fade * 30 };
}
