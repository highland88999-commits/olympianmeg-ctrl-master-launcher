/**
 * Abyssal Voyage — pure game logic (no DOM, no network).
 * Endless vertical dive: steer a submersible through rock gates, collect pearls.
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

export const DIFFICULTY = {
  calm: { speed: 130, gap: 220, density: 0.75, pearlRate: 0.55, label: "CALM" },
  abyssal: { speed: 190, gap: 180, density: 1.0, pearlRate: 0.45, label: "ABYSSAL" },
  chaos: { speed: 265, gap: 150, density: 1.35, pearlRate: 0.35, label: "CHAOS" },
};

export const WORLD = { width: 720, height: 960 };

export function createGame(difficultyKey = "abyssal", seed = 1) {
  const d = DIFFICULTY[difficultyKey] || DIFFICULTY.abyssal;
  return {
    difficultyKey,
    diff: d,
    rng: mulberry32(seed),
    seed,
    phase: "title", // title | playing | paused | over
    t: 0,
    depth: 0,
    score: 0,
    pearls: 0,
    hull: 100,
    invuln: 0,
    player: { x: WORLD.width / 2, y: WORLD.height * 0.72, targetX: WORLD.width / 2, r: 22 },
    obstacles: [], // { x, w, gapY, gapH, passed }
    bits: [], // debris/pearl particles {x,y,vx,vy,kind,r,life}
    nextSpawn: 0,
    flash: 0,
    causeOfDeath: "",
  };
}

function spawnObstacle(g) {
  const r = g.rng;
  const d = g.diff;
  const w = 90 + r() * 130;
  const x = 40 + r() * (WORLD.width - 80 - w);
  const gapH = d.gap * (0.9 + r() * 0.25);
  const gapY = 120 + r() * (WORLD.height * 0.55 - gapH - 40);
  g.obstacles.push({ x, w, gapY, gapH, passed: false });
  // ambient debris around the gate
  const n = 4 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    g.bits.push({
      x: x + r() * w,
      y: -20 - r() * 120,
      vx: (r() - 0.5) * 30,
      vy: 40 + r() * 60,
      kind: "debris",
      r: 1 + r() * 3,
      life: 3 + r() * 2,
    });
  }
  // maybe a pearl inside the gap
  if (r() < d.pearlRate) {
    g.bits.push({
      x: x + w / 2,
      y: -30,
      vx: 0,
      vy: d.speed,
      kind: "pearl",
      r: 9,
      life: 30,
    });
  }
}

export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

/** input: { left:boolean, right:boolean, targetX:number|null, keyboardAxis:-1..1 } */
export function stepGame(g, input, dt) {
  g.t += dt;
  if (g.phase !== "playing") return g;
  const d = g.diff;

  // player steering
  const p = g.player;
  if (input.targetX !== null && input.targetX !== undefined) {
    p.targetX = input.targetX;
  }
  const steer = 520 * dt;
  const dx = p.targetX - p.x;
  if (Math.abs(dx) > 2) p.x += Math.sign(dx) * Math.min(Math.abs(dx), steer);
  if (input.keyboardAxis) p.targetX = p.x + input.keyboardAxis * 80;
  p.x = Math.max(p.r, Math.min(WORLD.width - p.r, p.x));

  // depth & difficulty ramp
  g.depth += d.speed * dt * 0.55;
  const speed = d.speed * (1 + Math.min(0.8, g.depth / 9000));

  // spawn gates
  g.nextSpawn -= dt;
  if (g.nextSpawn <= 0) {
    spawnObstacle(g);
    g.nextSpawn = (900 / d.density / speed) * (0.8 + g.rng() * 0.5);
  }

  if (g.invuln > 0) g.invuln -= dt;
  if (g.flash > 0) g.flash -= dt;

  // obstacles fall toward viewer (downward scroll)
  for (const o of g.obstacles) {
    o.gapY += speed * dt;
  }
  g.obstacles = g.obstacles.filter((o) => o.gapY - o.gapH / 2 < WORLD.height + 120);

  // pearls / debris drift
  for (const b of g.bits) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  }
  g.bits = g.bits.filter((b) => b.life > 0 && b.y < WORLD.height + 60);

  // collision with rock above/below the gap
  const top = { x: o => o.x, y: -200, w: o => o.w, h: o => o.gapY - o.gapH / 2 + 200 };
  for (const o of g.obstacles) {
    const topRect = { x: o.x, y: -400, w: o.w, h: o.gapY - o.gapH / 2 + 400 };
    const botRect = { x: o.x, y: o.gapY + o.gapH / 2, w: o.w, h: WORLD.height };
    const hit =
      circleRect(p.x, p.y, p.r * 0.75, topRect.x, topRect.y, topRect.w, topRect.h) ||
      circleRect(p.x, p.y, p.r * 0.75, botRect.x, botRect.y, botRect.w, botRect.h);
    if (hit && g.invuln <= 0) {
      g.hull -= 17;
      g.invuln = 1.1;
      g.flash = 0.25;
      for (let i = 0; i < 14; i++) {
        g.bits.push({
          x: p.x,
          y: p.y,
          vx: (g.rng() - 0.5) * 300,
          vy: (g.rng() - 0.5) * 300,
          kind: "spark",
          r: 1 + g.rng() * 3,
          life: 0.5 + g.rng() * 0.5,
        });
      }
      if (g.hull <= 0) {
        g.hull = 0;
        g.phase = "over";
        g.causeOfDeath = "HULL BREACH";
      }
    }
    // score when a gate is fully cleared
    if (!o.passed && o.gapY + o.gapH / 2 > p.y + 60) {
      o.passed = true;
      g.score += 25;
    }
  }

  // pearl collection
  for (const b of g.bits) {
    if (b.kind !== "pearl") continue;
    const dxp = b.x - p.x;
    const dyp = b.y - p.y;
    if (dxp * dxp + dyp * dyp < (p.r + b.r) * (p.r + b.r)) {
      b.life = 0;
      b.kind = "collected";
      g.pearls += 1;
      g.score += 100;
      g.hull = Math.min(100, g.hull + 4);
    }
  }

  g.score += dt * 5; // survival trickle
  return g;
}

export function depthZone(depth) {
  if (depth < 1500) return "TWILIGHT ZONE";
  if (depth < 4500) return "MIDNIGHT ZONE";
  if (depth < 9000) return "ABYSSAL ZONE";
  return "HADAL TRENCH";
}

export function resetGame(g, seed) {
  const fresh = createGame(g.difficultyKey, seed === undefined ? (g.seed + 1) >>> 0 : seed);
  fresh.phase = "playing";
  return fresh;
}
