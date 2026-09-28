// ARACHNID WEAVER — survival chase game logic.
// Pure, DOM-free: the whole simulation (player movement, stamina, spider AI,
// web traps, caught sequence) lives here so it can run headless in tests.
//
// Game fiction: you are a torch-bearer trapped in the Weaver's nest. The
// spider patrols, then hunts you. If it catches you, you are rolled up
// and eaten. Survive as long as you can.

export const ARENA = { w: 1800, h: 1100 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 235,
  sprintSpeed: 350,
  staminaMax: 100,
  staminaDrain: 34, // per second while sprinting
  staminaRegen: 22, // per second while not sprinting
  webSlow: 0.55, // speed multiplier inside a web trap
};

export const SPIDER = {
  radius: 26,
  patrolSpeed: 135,
  chaseBase: 290,
  chaseRamp: 0.6, // up to +60% chase speed over rampTime seconds
  rampTime: 150,
  lungeSpeed: 575,
  lungeRange: 160,
  lungeWindup: 0.55,
  lungeTime: 0.5,
  recoverTime: 0.8,
  lungeCooldown: 2.4,
  detectRadius: 420,
  loseRadius: 660,
  catchRadius: 36,
  nearMissRadius: 78,
};

export const CAUGHT_DURATION = 2.4; // seconds of "rolled up" before 'dead'
export const WEB_COUNT = 7;
export const WEB_RADIUS = 70;

// Deterministic RNG so runs and tests are reproducible.
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
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function createGame(seed = 1) {
  const rand = mulberry32(seed);
  const webs = [];
  for (let i = 0; i < WEB_COUNT; i++) {
    webs.push({
      x: 150 + rand() * (ARENA.w - 300),
      y: 150 + rand() * (ARENA.h - 300),
      r: WEB_RADIUS * (0.8 + rand() * 0.5),
      seed: rand() * 1000,
    });
  }
  return {
    phase: "play", // play | caught | dead
    time: 0,
    nearMisses: 0,
    caughtT: 0,
    player: {
      x: ARENA.w / 2,
      y: ARENA.h - 140,
      vx: 0,
      vy: 0,
      stamina: PLAYER.staminaMax,
      sprinting: false,
      slowed: false,
    },
    spider: {
      x: ARENA.w / 2,
      y: 220,
      vx: 0,
      vy: 0,
      mode: "patrol", // patrol | chase | windup | lunge | recover
      modeT: 0,
      tx: ARENA.w / 2,
      ty: 320,
      lungeDx: 0,
      lungeDy: 0,
      cooldown: 0,
      nearMissAwarded: false,
    },
    webs,
  };
}

// input: { dx, dy } desired direction (any magnitude, normalized internally),
//        { sprint } boolean. dt: seconds.
// Returns an array of events: [{ type: 'nearMiss'|'caught'|'dead' }, ...]
export function updateGame(g, input, dt) {
  const events = [];
  if (dt <= 0 || g.phase === "dead") return events;

  const p = g.player;
  const s = g.spider;

  // --- caught sequence: the Weaver has you; struggle, then it is over ---
  if (g.phase === "caught") {
    g.caughtT += dt;
    // spider drags you toward its web anchor (its current position)
    p.x += (s.x - p.x) * Math.min(1, dt * 3);
    p.y += (s.y - p.y) * Math.min(1, dt * 3);
    if (g.caughtT >= CAUGHT_DURATION) {
      g.phase = "dead";
      events.push({ type: "dead" });
    }
    return events;
  }

  g.time += dt;

  // --- player movement ---
  let dx = input.dx || 0;
  let dy = input.dy || 0;
  const mag = Math.hypot(dx, dy);
  if (mag > 1) {
    dx /= mag;
    dy /= mag;
  }
  p.slowed = false;
  for (const w of g.webs) {
    if (dist(p.x, p.y, w.x, w.y) < w.r) {
      p.slowed = true;
      break;
    }
  }
  const wantSprint = !!input.sprint && mag > 0.01 && p.stamina > 0;
  p.sprinting = wantSprint;
  let speed = wantSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (p.slowed) speed *= PLAYER.webSlow;
  p.vx = dx * speed;
  p.vy = dy * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = Math.max(PLAYER.radius, Math.min(ARENA.w - PLAYER.radius, p.x));
  p.y = Math.max(PLAYER.radius, Math.min(ARENA.h - PLAYER.radius, p.y));

  if (wantSprint) {
    p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
  } else {
    const regenBoost = mag < 0.01 ? 1.6 : 1.0;
    p.stamina = Math.min(
      PLAYER.staminaMax,
      p.stamina + PLAYER.staminaRegen * regenBoost * dt
    );
  }

  // --- spider AI ---
  const dPlayer = dist(s.x, s.y, p.x, p.y);
  const chaseSpeed =
    SPIDER.chaseBase * (1 + SPIDER.chaseRamp * Math.min(1, g.time / SPIDER.rampTime));
  if (s.cooldown > 0) s.cooldown -= dt;
  s.modeT -= dt;

  const moveToward = (tx, ty, spd) => {
    const d = dist(s.x, s.y, tx, ty);
    if (d < 1) {
      s.vx = 0;
      s.vy = 0;
      return;
    }
    s.vx = ((tx - s.x) / d) * spd;
    s.vy = ((ty - s.y) / d) * spd;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  };

  switch (s.mode) {
    case "patrol": {
      moveToward(s.tx, s.ty, SPIDER.patrolSpeed);
      if (dist(s.x, s.y, s.tx, s.ty) < 40) {
        // pick a new patrol target away from the player
        const rand = mulberry32((g.time * 997 + 13) | 0);
        s.tx = 120 + rand() * (ARENA.w - 240);
        s.ty = 120 + rand() * (ARENA.h - 240);
      }
      if (dPlayer < SPIDER.detectRadius) {
        s.mode = "chase";
        s.modeT = 0;
      }
      break;
    }
    case "chase": {
      moveToward(p.x, p.y, chaseSpeed);
      if (dPlayer > SPIDER.loseRadius) {
        s.mode = "patrol";
        s.tx = s.x;
        s.ty = s.y;
      } else if (dPlayer < SPIDER.lungeRange && s.cooldown <= 0) {
        s.mode = "windup";
        s.modeT = SPIDER.lungeWindup;
        s.vx = 0;
        s.vy = 0;
      }
      break;
    }
    case "windup": {
      // crouches and trembles, then strikes along the locked bearing
      if (s.modeT <= 0) {
        const d = Math.max(1, dPlayer);
        s.lungeDx = (p.x - s.x) / d;
        s.lungeDy = (p.y - s.y) / d;
        s.mode = "lunge";
        s.modeT = SPIDER.lungeTime;
        s.nearMissAwarded = false;
      }
      break;
    }
    case "lunge": {
      s.vx = s.lungeDx * SPIDER.lungeSpeed;
      s.vy = s.lungeDy * SPIDER.lungeSpeed;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (
        !s.nearMissAwarded &&
        dPlayer < SPIDER.nearMissRadius &&
        dPlayer >= SPIDER.catchRadius
      ) {
        s.nearMissAwarded = true;
        g.nearMisses += 1;
        events.push({ type: "nearMiss" });
      }
      if (s.modeT <= 0) {
        s.mode = "recover";
        s.modeT = SPIDER.recoverTime;
        s.cooldown = SPIDER.lungeCooldown;
      }
      break;
    }
    case "recover": {
      s.vx *= 0.9;
      s.vy *= 0.9;
      if (s.modeT <= 0) {
        s.mode = dPlayer < SPIDER.loseRadius ? "chase" : "patrol";
      }
      break;
    }
  }

  // keep the spider in the arena
  s.x = Math.max(SPIDER.radius, Math.min(ARENA.w - SPIDER.radius, s.x));
  s.y = Math.max(SPIDER.radius, Math.min(ARENA.h - SPIDER.radius, s.y));

  // --- the catch ---
  if (dist(s.x, s.y, p.x, p.y) < SPIDER.catchRadius) {
    g.phase = "caught";
    g.caughtT = 0;
    events.push({ type: "caught" });
  }

  return events;
}

export function scoreOf(g) {
  return Math.floor(g.time * 10) + g.nearMisses * 250;
}
