/**
 * Storm Bolt — pure lightning/rain simulation logic. No DOM, no network.
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
 * Midpoint-displacement lightning bolt from (x1,y1) to (x2,y2).
 * Returns array of segments {x1,y1,x2,y2}; branches have gen>0.
 */
export function buildBolt(x1, y1, x2, y2, rng, opts = {}) {
  const displace = opts.displace ?? 0.28;
  const minLen = opts.minLen ?? 14;
  const branchChance = opts.branchChance ?? 0.22;
  const main = [{ x1, y1, x2, y2, gen: 0 }];
  const out = [];
  const stack = [{ x1, y1, x2, y2, gen: 0 }];
  while (stack.length) {
    const seg = stack.pop();
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if (len < minLen) {
      out.push(seg);
      continue;
    }
    const mx = (seg.x1 + seg.x2) / 2;
    const my = (seg.y1 + seg.y2) / 2;
    const nx = -dy / len;
    const ny = dx / len;
    const off = (rng() - 0.5) * 2 * len * displace;
    const px = mx + nx * off;
    const py = my + ny * off;
    stack.push({ x1: px, y1: py, x2: seg.x2, y2: seg.y2, gen: seg.gen });
    stack.push({ x1: seg.x1, y1: seg.y1, x2: px, y2: py, gen: seg.gen });
    // occasional fork
    if (seg.gen === 0 && rng() < branchChance) {
      const bl = len * (0.3 + rng() * 0.35);
      const ba = Math.atan2(dy, dx) + (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.6);
      stack.push({
        x1: px, y1: py,
        x2: px + Math.cos(ba) * bl, y2: py + Math.sin(ba) * bl,
        gen: seg.gen + 1,
      });
    }
  }
  return out.concat(main.slice(0, 0));
}

/** Rain field: create drops covering w×h. */
export function makeRain(n, w, h, rng) {
  const drops = [];
  for (let i = 0; i < n; i++) {
    drops.push({
      x: rng() * w,
      y: rng() * h,
      speed: 520 + rng() * 380,
      len: 10 + rng() * 14,
    });
  }
  return drops;
}

export function stepRain(drops, dt, w, h, wind = 60) {
  for (const d of drops) {
    d.y += d.speed * dt;
    d.x += wind * dt;
    if (d.y > h) {
      d.y = -20;
      d.x = (d.x + h * 3) % (w + 40);
    }
    if (d.x > w + 20) d.x -= w + 40;
  }
  return drops;
}

/** Strike scheduling: ms until next automatic strike in storm mode. */
export function nextStrikeDelay(rng) {
  return 900 + rng() * 3200;
}

/** Flash envelope: 1 at t=0 decaying fast; returns 0..1 for age in ms. */
export function flashEnvelope(ageMs) {
  if (ageMs < 0) return 0;
  return Math.exp(-ageMs / 90);
}
