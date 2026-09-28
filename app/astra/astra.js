// ASTRA — cockpit shooter logic (pure, DOM-free).
// The player ship holds the bottom of the lane; drones stream in from the
// dark. Cannon fire, seeker missiles, and a hyper burst are the tools.
// Levels scale drone speed and count; every third level a boss arrives.

export const FIELD = { w: 900, h: 1400 };

export const PLAYER_CFG = {
  radius: 22,
  speed: 460,
  shieldMax: 10,
  regenDelay: 5.0,
  cannonCooldown: 0.22,
  seekerCooldown: 1.6,
  hyperCooldown: 9.0,
  hyperTime: 1.6,
};

export const DRONE_CFG = {
  radius: 20,
  baseSpeed: 130,
  speedPerLevel: 14,
  hp: 1,
};

export const BOSS_CFG = {
  radius: 64,
  hp: 30,
  speed: 70,
};

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

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createBattle(seed = 1) {
  return {
    seed,
    time: 0,
    over: false,
    kills: 0,
    killsForLevel: 0,
    level: 1,
    player: {
      x: FIELD.w / 2,
      y: FIELD.h - 180,
      vx: 0,
      vy: 0,
      shield: PLAYER_CFG.shieldMax,
      lastDamage: -99,
      cannonT: 0,
      seekerT: 0,
      hyperT: 0,
      hyperActive: 0,
    },
    drones: [],
    shots: [],
    seekers: [],
    boss: null,
    bossSpawnedFor: 0,
    spawnT: 0,
    events: [],
  };
}

export function spawnDrone(b, rand) {
  const lvl = b.level;
  b.drones.push({
    x: 60 + rand() * (FIELD.w - 120),
    y: -40,
    vx: (rand() - 0.5) * 120,
    vy: DRONE_CFG.baseSpeed + DRONE_CFG.speedPerLevel * (lvl - 1),
    hp: DRONE_CFG.hp + Math.floor((lvl - 1) / 3),
    ph: rand() * Math.PI * 2,
    t: 0,
  });
}

export function spawnBoss(b) {
  b.boss = {
    x: FIELD.w / 2,
    y: -BOSS_CFG.radius - 10,
    vx: 90,
    hp: BOSS_CFG.hp + b.level * 4,
    maxHp: BOSS_CFG.hp + b.level * 4,
    t: 0,
  };
  b.bossSpawnedFor = b.level;
}

export function nearestDrone(b, x, y) {
  let best = null;
  let bestD = Infinity;
  const consider = (d) => {
    const dd = dist(x, y, d.x, d.y);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  };
  for (const d of b.drones) consider(d);
  if (b.boss) consider(b.boss);
  return best;
}

// input: { dx, dy } | { cannon, seeker, hyper } booleans. dt seconds.
// Mutates battle; pushes events into b.events (caller drains).
export function updateBattle(b, input, dt) {
  const p = b.player;
  if (b.over || dt <= 0) return;
  b.time += dt;
  const rand = mulberry32((b.seed + ((b.time * 1000) | 0)) >>> 0);

  // --- player movement ---
  let dx = input.dx || 0;
  let dy = input.dy || 0;
  const m = Math.hypot(dx, dy);
  if (m > 1) {
    dx /= m;
    dy /= m;
  }
  const spd = PLAYER_CFG.speed * (p.hyperActive > 0 ? 1.6 : 1);
  p.vx = dx * spd;
  p.vy = dy * spd;
  p.x = Math.max(PLAYER_CFG.radius, Math.min(FIELD.w - PLAYER_CFG.radius, p.x + p.vx * dt));
  p.y = Math.max(PLAYER_CFG.radius, Math.min(FIELD.h - PLAYER_CFG.radius, p.y + p.vy * dt));

  if (p.hyperActive > 0) p.hyperActive -= dt;
  if (p.hyperT > 0) p.hyperT -= dt;
  if (p.cannonT > 0) p.cannonT -= dt;
  if (p.seekerT > 0) p.seekerT -= dt;

  // --- weapons ---
  if (input.cannon && p.cannonT <= 0) {
    p.cannonT = PLAYER_CFG.cannonCooldown;
    b.shots.push({ x: p.x - 12, y: p.y - 24, vy: -900 });
    b.shots.push({ x: p.x + 12, y: p.y - 24, vy: -900 });
  }
  if (input.seeker && p.seekerT <= 0) {
    const target = nearestDrone(b, p.x, p.y);
    if (target) {
      p.seekerT = PLAYER_CFG.seekerCooldown;
      b.seekers.push({ x: p.x, y: p.y - 20, target, speed: 620, t: 0 });
    }
  }
  if (input.hyper && p.hyperT <= 0) {
    p.hyperT = PLAYER_CFG.hyperCooldown;
    p.hyperActive = PLAYER_CFG.hyperTime;
    // hyper burst clears nearby drones
    for (let i = b.drones.length - 1; i >= 0; i--) {
      if (dist(p.x, p.y, b.drones[i].x, b.drones[i].y) < 260) {
        b.drones.splice(i, 1);
        registerKill(b);
      }
    }
    b.events.push({ type: "hyper" });
  }

  // --- spawning ---
  const isBossLevel = b.level % 3 === 0;
  if (isBossLevel) {
    if (!b.boss && b.bossSpawnedFor !== b.level) spawnBoss(b);
  } else {
    b.spawnT -= dt;
    const interval = Math.max(0.35, 1.1 - b.level * 0.08);
    if (b.spawnT <= 0) {
      b.spawnT = interval;
      spawnDrone(b, rand);
    }
  }

  // --- drones ---
  for (let i = b.drones.length - 1; i >= 0; i--) {
    const d = b.drones[i];
    d.t += dt;
    d.x += (d.vx + Math.sin(d.t * 2.4 + d.ph) * 60) * dt;
    d.y += d.vy * dt;
    if (d.x < 20 || d.x > FIELD.w - 20) d.vx *= -1;
    if (d.y > FIELD.h + 60) {
      b.drones.splice(i, 1);
      continue;
    }
    if (dist(p.x, p.y, d.x, d.y) < PLAYER_CFG.radius + DRONE_CFG.radius) {
      b.drones.splice(i, 1);
      damagePlayer(b, 2);
    }
  }

  // --- boss ---
  if (b.boss) {
    const bo = b.boss;
    bo.t += dt;
    bo.y = Math.min(220, bo.y + BOSS_CFG.speed * dt);
    bo.x += bo.vx * dt;
    if (bo.x < BOSS_CFG.radius || bo.x > FIELD.w - BOSS_CFG.radius) bo.vx *= -1;
    if (dist(p.x, p.y, bo.x, bo.y) < PLAYER_CFG.radius + BOSS_CFG.radius) {
      damagePlayer(b, 4);
    }
  }

  // --- cannon shots ---
  for (let i = b.shots.length - 1; i >= 0; i--) {
    const sh = b.shots[i];
    sh.y += sh.vy * dt;
    if (sh.y < -30) {
      b.shots.splice(i, 1);
      continue;
    }
    let hit = false;
    for (let j = b.drones.length - 1; j >= 0; j--) {
      const d = b.drones[j];
      if (dist(sh.x, sh.y, d.x, d.y) < DRONE_CFG.radius + 6) {
        d.hp -= 1;
        hit = true;
        if (d.hp <= 0) {
          b.drones.splice(j, 1);
          registerKill(b);
        }
        break;
      }
    }
    if (!hit && b.boss) {
      if (dist(sh.x, sh.y, b.boss.x, b.boss.y) < BOSS_CFG.radius + 6) {
        b.boss.hp -= 1;
        hit = true;
        if (b.boss.hp <= 0) {
          b.boss = null;
          registerKill(b);
          registerKill(b);
          b.events.push({ type: "bossDown" });
        }
      }
    }
    if (hit) b.shots.splice(i, 1);
  }

  // --- seeker missiles ---
  for (let i = b.seekers.length - 1; i >= 0; i--) {
    const sk = b.seekers[i];
    sk.t += dt;
    const tgt = sk.target;
    const alive =
      tgt && (b.drones.includes(tgt) || b.boss === tgt);
    if (!alive || sk.t > 4) {
      b.seekers.splice(i, 1);
      continue;
    }
    const d = Math.max(1, dist(sk.x, sk.y, tgt.x, tgt.y));
    sk.x += ((tgt.x - sk.x) / d) * sk.speed * dt;
    sk.y += ((tgt.y - sk.y) / d) * sk.speed * dt;
    if (d < 30) {
      b.seekers.splice(i, 1);
      if (b.boss === tgt) {
        tgt.hp -= 3;
        if (tgt.hp <= 0) {
          b.boss = null;
          registerKill(b);
          registerKill(b);
          b.events.push({ type: "bossDown" });
        }
      } else {
        const idx = b.drones.indexOf(tgt);
        if (idx >= 0) {
          b.drones.splice(idx, 1);
          registerKill(b);
        }
      }
    }
  }

  // --- shield regen ---
  if (b.time - p.lastDamage > PLAYER_CFG.regenDelay && p.shield < PLAYER_CFG.shieldMax) {
    p.shield = Math.min(PLAYER_CFG.shieldMax, p.shield + dt * 1.5);
  }

  // --- level ups ---
  if (b.killsForLevel >= 20) {
    b.killsForLevel -= 20;
    b.level += 1;
    b.events.push({ type: "levelUp", level: b.level });
  }
}

function registerKill(b) {
  b.kills += 1;
  b.killsForLevel += 1;
}

function damagePlayer(b, amt) {
  const p = b.player;
  if (p.hyperActive > 0) return; // hyper burst grants brief immunity
  p.shield -= amt;
  p.lastDamage = b.time;
  b.events.push({ type: "damage", shield: p.shield });
  if (p.shield <= 0) {
    p.shield = 0;
    b.over = true;
    b.events.push({ type: "gameOver", kills: b.kills, level: b.level });
  }
}

export function drainEvents(b) {
  const e = b.events;
  b.events = [];
  return e;
}
