/**
 * Tornado — volcanic storm particle engine (no DOM, no network).
 * Vortex columns, lava streams, ash plume, rain, lightning, drifting clouds.
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

// ---- tornado vortex ----
export function createVortex(rng, x, z, seedTint) {
  const N = 420;
  const particles = [];
  for (let i = 0; i < N; i++) {
    const h = Math.pow(rng(), 1.7) * 300;
    particles.push({
      angle: rng() * Math.PI * 2,
      height: h,
      radius: 6 + h * 0.22 + rng() * 14,
      size: 1 + rng() * 2.5,
    });
  }
  return { x, z, seedTint, particles, drift: 0 };
}

export function stepVortex(v, dt, t, windX) {
  for (const p of v.particles) {
    const spin = 2.2 + (300 - p.height) * 0.012;
    p.angle += spin * dt;
  }
  v.x += (6 + windX * 2) * dt;
  v.drift += dt;
  return v;
}

export function vortexScreenPos(p, v, t) {
  const wob = Math.sin(t * 2 + p.height * 0.03) * p.height * 0.05;
  return {
    x: v.x + Math.cos(p.angle) * p.radius + wob,
    y: p.height,
  };
}

// ---- lava streams on the cone ----
export function createLava(rng, n, coneTop, coneBottom, coneR) {
  const drops = [];
  for (let i = 0; i < n; i++) {
    drops.push({
      angle: rng() * Math.PI * 2,
      y: coneTop + rng() * (coneBottom - coneTop),
      speed: 60 + rng() * 120,
    });
  }
  return { drops, coneTop, coneBottom, coneR };
}

export function stepLava(lava, dt) {
  for (const d of lava.drops) {
    d.y += d.speed * dt;
    if (d.y > lava.coneBottom) {
      d.y = lava.coneTop;
      d.angle = Math.random() * Math.PI * 2;
    }
  }
  return lava;
}

export function lavaScreenPos(d, lava, cx, t) {
  const frac = (d.y - lava.coneTop) / (lava.coneBottom - lava.coneTop);
  const r = lava.coneR * (0.12 + frac * 0.88);
  return { x: cx + Math.cos(d.angle + t * 0.4) * r, y: d.y };
}

// ---- ash plume ----
export function createPlume(rng, n) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(resetAsh(rng, {}));
  return parts;
}

export function resetAsh(rng, p) {
  p.x = (rng() - 0.5) * 60;
  p.y = 0;
  p.vx = (rng() - 0.5) * 30;
  p.vy = 40 + rng() * 60;
  p.life = 2 + rng() * 3;
  p.maxLife = p.life;
  p.size = 3 + rng() * 9;
  p.spark = rng() > 0.72;
  return p;
}

export function stepPlume(parts, dt, windX, rng) {
  for (const p of parts) {
    p.life -= dt;
    p.vy -= 12 * dt;
    p.x += (p.vx + windX * 14) * dt;
    p.y += p.vy * dt;
    if (p.life <= 0 || p.y < -40) resetAsh(rng, p);
  }
  return parts;
}

// ---- rain ----
export function createRain(rng, n, W, H) {
  const drops = [];
  for (let i = 0; i < n; i++) {
    drops.push({ x: rng() * W, y: rng() * H, v: 500 + rng() * 400, len: 10 + rng() * 14 });
  }
  return drops;
}

export function stepRain(drops, dt, W, H, windX) {
  for (const d of drops) {
    d.y += d.v * dt;
    d.x += windX * 60 * dt;
    if (d.y > H) { d.y = -20; d.x = Math.random() * W; }
    if (d.x > W) d.x = 0;
    if (d.x < 0) d.x = W;
  }
  return drops;
}

// ---- lightning ----
export function makeBolt(rng, W, topY) {
  const pts = [];
  let x = W * 0.2 + rng() * W * 0.6;
  let y = topY;
  pts.push({ x, y });
  while (y < topY + 420) {
    y += 24 + rng() * 40;
    x += (rng() - 0.5) * 70;
    pts.push({ x, y });
  }
  return { pts, life: 1 };
}

export function stepBolts(bolts, dt) {
  for (const b of bolts) b.life -= dt * 4;
  return bolts.filter((b) => b.life > 0);
}

// ---- clouds ----
export function createClouds(rng, n, W) {
  const clouds = [];
  for (let i = 0; i < n; i++) {
    clouds.push({
      x: rng() * W,
      y: 30 + rng() * 150,
      w: 120 + rng() * 220,
      h: 26 + rng() * 40,
      speed: 6 + rng() * 14,
    });
  }
  return clouds;
}

export function stepClouds(clouds, dt, W, windX) {
  for (const c of clouds) {
    c.x += (c.speed + windX * 20) * dt;
    if (c.x - c.w > W) c.x = -c.w;
    if (c.x + c.w < 0) c.x = W + c.w;
  }
  return clouds;
}
