/**
 * Tree — The Cycle Tree logic (no DOM, no network).
 * 2D recursive branch generation + 12-second seasons leaf engine.
 * 12s = 1 year, 1s = 1 month.
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

export const CYCLE = 12.0;

export function buildTree(seed, maxDepth = 5) {
  const rng = mulberry32(seed);
  const segments = [];
  const tips = [];

  function branch(x, y, angle, len, width, depth) {
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    segments.push({ x1: x, y1: y, x2, y2, w: width, depth });
    if (depth === 0) {
      tips.push({ x: x2, y: y2 });
      return;
    }
    const kids = depth === maxDepth ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const spread = 0.55 + rng() * 0.25;
      const frac = kids === 1 ? 0 : i / (kids - 1) - 0.5;
      const childAngle = angle + frac * spread * 2 + (rng() - 0.5) * 0.3;
      branch(x2, y2, childAngle, len * (0.68 + rng() * 0.12), width * 0.62, depth - 1);
    }
  }

  branch(0, 0, -Math.PI / 2, 95, 15, maxDepth);
  return { segments, tips, maxDepth };
}

export function seasonPhase(month) {
  const m = ((month % CYCLE) + CYCLE) % CYCLE;
  if (m < 2) return { name: "SPRING", sub: "growth" };
  if (m < 6) return { name: "SUMMER", sub: "bloom" };
  if (m < 8) return { name: "AUTUMN", sub: "fall" };
  return { name: "WINTER", sub: "bare" };
}

/** sky gradient stops for the current month */
export function skyFor(month) {
  const m = ((month % CYCLE) + CYCLE) % CYCLE;
  if (m < 2) return { top: "#2a1e3f", mid: "#7a3f5e", bot: "#1a0f1e" }; // spring dawn
  if (m < 6) return { top: "#0e2a52", mid: "#1e5a8a", bot: "#0a1428" }; // summer day
  if (m < 8) return { top: "#3a1a2e", mid: "#a34a2a", bot: "#14101c" }; // autumn dusk
  return { top: "#060818", mid: "#101a34", bot: "#04060e" }; // winter night
}

/** Create leaf particles for tips. */
export function makeLeaves(tips, perTip, seed) {
  const rng = mulberry32(seed);
  const leaves = [];
  for (const tip of tips) {
    for (let i = 0; i < perTip; i++) {
      leaves.push({
        sx: tip.x + (rng() - 0.5) * 14,
        sy: tip.y + (rng() - 0.5) * 14,
        x: tip.x,
        y: tip.y,
        vx: 0,
        vy: 0,
        rot: rng() * Math.PI * 2,
        rotV: (rng() - 0.5) * 4,
        scale: 0,
        detached: false,
        dissolving: false,
        growthDelay: rng() * 1.5,
        detachTime: 6.0 + rng() * 0.8,
        seed: rng(),
        size: 5 + rng() * 5,
      });
    }
  }
  return leaves;
}

/** leaf color: cyan -> pink across the growing half of the year */
export function leafRGB(month) {
  const m = Math.max(0, Math.min(1, ((month % CYCLE) + CYCLE) % CYCLE / 6));
  return [
    Math.round(0 + 255 * m),
    Math.round(255 - 110 * m),
    Math.round(255 - 85 * m),
  ];
}

/**
 * Step one leaf. Pure-ish (mutates leaf, reads rng for burst velocity).
 * Returns nothing; leaf fields updated in place.
 */
export function stepLeaf(leaf, month, dt, t, rng) {
  if (month < leaf.detachTime && leaf.detached) {
    // new year reset
    leaf.detached = false;
    leaf.dissolving = false;
    leaf.x = leaf.sx;
    leaf.y = leaf.sy;
    leaf.vx = 0;
    leaf.vy = 0;
    leaf.scale = 0;
  }
  if (month < leaf.detachTime) {
    // attached
    leaf.x = leaf.sx;
    leaf.y = leaf.sy;
    const gs = leaf.growthDelay;
    const ge = gs + 1.5;
    leaf.scale = month < gs ? 0 : month < ge ? (month - gs) / 1.5 : 1;
    leaf.rot += Math.sin(t * 2.5 + leaf.seed * 10) * 0.02;
  } else {
    if (!leaf.detached) {
      leaf.detached = true;
      leaf.vx = (rng() - 0.5) * 40;
      leaf.vy = rng() * 20;
    }
    if (!leaf.dissolving) {
      leaf.vy += 120 * dt; // gravity: +y is downward in tree space
      const wind = Math.sin(t * 1.5 + leaf.y * 0.02) * 40;
      leaf.vx += (wind - leaf.vx) * 1.5 * dt;
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.rot += leaf.rotV * dt;
      if (leaf.y >= 0) {
        // reached ground (ground at y=0 in tree space)
        leaf.y = 0;
        leaf.vx = 0;
        leaf.vy = 0;
        leaf.dissolving = true;
      }
      if (leaf.scale > 0) leaf.scale = Math.min(1, leaf.scale);
    } else {
      leaf.scale -= 2 * dt;
      if (leaf.scale < 0) leaf.scale = 0;
    }
  }
  return leaf;
}

export function monthProgress(month) {
  return (((month % CYCLE) + CYCLE) % CYCLE) / CYCLE;
}
