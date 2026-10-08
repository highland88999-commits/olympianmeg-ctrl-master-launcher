// app/undulatus/game.js — UNDULATUS core logic. No DOM, no canvas, no network.
// A sky-swimmer rides an endless rippled cloud sea. Pure state + update.

export const TUNE = {
  baseSpeed: 265, // px/s world scroll
  maxSpeed: 560,
  flowBoost: 0.6, // +60% speed when riding with the ripple
  stormSpeed: 1.5, // storm multiplier
  zapSlow: 0.65, // speed factor for 1s after a zap
  playerRadius: 16,
  playerScreenXFrac: 0.34, // player sits 34% across the screen
  surfaceBaseFrac: 0.6, // cloud sea rests ~60% down the screen
  waveA1: 44,
  waveA2: 20,
  threadScore: 25,
  thermalScore: 100,
  stormScoreMult: 2,
  zapPenalty: 0.65,
  boltTelegraph: 0.7, // seconds of warning before a strike
  boltBandHalf: 46, // half-height of the strike band
  stormDuration: 8,
  stormEveryMin: 38,
  stormEveryMax: 55,
};

const HS_KEY = 'undulatus-best';

export function loadBest() {
  try {
    const v = window.localStorage.getItem(HS_KEY);
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBest(v) {
  try {
    window.localStorage.setItem(HS_KEY, String(v));
  } catch {
    /* ignore */
  }
}

// Cloud sea surface height (screen px) at a world x and time t.
export function surfaceY(wx, t, h) {
  const base = h * TUNE.surfaceBaseFrac;
  return (
    base +
    TUNE.waveA1 * Math.sin(wx * 0.008 - t * 1.7) +
    TUNE.waveA2 * Math.sin(wx * 0.021 + t * 1.15 + 1.7)
  );
}

// Vertical velocity of the surface at (wx, t) — the ripple's own motion.
export function surfaceVel(wx, t) {
  return (
    -TUNE.waveA1 * 1.7 * Math.cos(wx * 0.008 - t * 1.7) +
    TUNE.waveA2 * 1.15 * Math.cos(wx * 0.021 + t * 1.15 + 1.7)
  );
}

// Treeline (floor) height at world x. Touching it ends the run.
export function treeTop(wx, h) {
  return h * 0.88 + 13 * Math.sin(wx * 0.045) + 7 * Math.sin(wx * 0.12 + 2.3);
}

export function createGame(w, h) {
  return {
    w,
    h,
    phase: 'menu', // menu | playing | paused | over
    t: 0, // world clock (seconds)
    runT: 0, // time since run start
    worldX: 0, // how far the world has scrolled
    speed: TUNE.baseSpeed,
    // player
    px: 0, // player world x (screen x derived)
    py: h * 0.42,
    vy: 0,
    // flow (riding with the ripple)
    flow: 0, // smoothed 0..1
    flowing: false,
    // scoring
    score: 0,
    combo: 0,
    bestCombo: 0,
    best: 0,
    newBest: false,
    // entities
    wires: [], // { wx, gapTop, gapBottom, passed, zapped }
    thermals: [], // { wx, w }
    bolts: [], // { y, timer, struck, missed }
    particles: [], // { x, y, vx, vy, life, maxLife, kind, size }
    // storm
    stormMode: 0, // seconds remaining
    stormWallX: null, // approaching wall world x (null when none)
    nextStormAt: 24, // first storm comes early so players see it
    // thermal slow-mo
    slowmo: 0,
    // zap feedback
    zapTimer: 0,
    flash: 0, // screen flash 0..1
    thermalGlow: 0,
    // spawners
    nextWireAt: 0,
    nextThermalAt: 0,
    nextBoltAt: 0,
    wireId: 0,
    // events for the page (sound/haptics), drained each frame
    events: [],
  };
}

export function startRun(s, best) {
  const fresh = createGame(s.w, s.h);
  fresh.phase = 'playing';
  fresh.best = best || 0;
  fresh.py = s.h * 0.42;
  fresh.nextWireAt = 1.2;
  fresh.nextThermalAt = 6;
  return fresh;
}

export function resizeGame(s, w, h) {
  const yFrac = s.py / s.h;
  s.w = w;
  s.h = h;
  s.py = yFrac * h;
}

function emit(s, type, data) {
  s.events.push({ type, data });
}

function spawnWire(s) {
  const gapH = Math.max(120, 190 - s.runT * 1.1); // shrinks with difficulty
  const mid = s.h * (0.22 + Math.random() * 0.42); // gap center in the sky band
  s.wires.push({
    id: s.wireId++,
    wx: s.worldX + s.w + 80,
    gapTop: mid - gapH / 2,
    gapBottom: mid + gapH / 2,
    passed: false,
    zapped: false,
  });
  const interval = Math.max(1.5, 3.1 - s.runT * 0.012);
  s.nextWireAt = s.runT + interval + Math.random() * 0.9;
}

function spawnThermal(s) {
  s.thermals.push({ wx: s.worldX + s.w + 120, w: 84 + Math.random() * 40 });
  s.nextThermalAt = s.runT + 9 + Math.random() * 9;
}

function spawnBolt(s) {
  // Telegraph locks onto the player's CURRENT height — dodge vertically.
  s.bolts.push({ y: s.py, timer: TUNE.boltTelegraph, struck: false, missed: false, flash: 0 });
  s.nextBoltAt = s.runT + 0.55 + Math.random() * 0.5;
}

function addParticles(s, x, y, kind, n, spread) {
  for (let i = 0; i < n; i++) {
    if (s.particles.length > 130) return;
    const a = Math.random() * Math.PI * 2;
    const sp = (spread || 120) * (0.3 + Math.random() * 0.7);
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.6,
      kind,
      size: 2 + Math.random() * 3.5,
    });
  }
}

// input: { pointerY: number|null, keyDir: -1|0|1 }
export function updateGame(s, input, rawDt) {
  if (s.phase !== 'playing') return;

  // Slow-mo eases the world clock.
  const timeScale = s.slowmo > 0 ? 0.45 : 1;
  const dt = Math.min(rawDt, 0.05) * timeScale;
  s.t += dt;
  s.runT += dt;
  if (s.slowmo > 0) s.slowmo -= rawDt;
  if (s.zapTimer > 0) s.zapTimer -= rawDt;
  if (s.flash > 0) s.flash = Math.max(0, s.flash - rawDt * 2.2);
  if (s.thermalGlow > 0) s.thermalGlow = Math.max(0, s.thermalGlow - rawDt * 1.4);

  const playerScreenX = s.w * TUNE.playerScreenXFrac;

  // --- steering ---
  const steerAccel = 2600;
  const maxVy = 560;
  let targetVy = 0;
  if (input.pointerY != null) {
    const dy = input.pointerY - s.py;
    targetVy = Math.max(-maxVy, Math.min(maxVy, dy * 9));
  } else if (input.keyDir !== 0) {
    targetVy = input.keyDir * maxVy * 0.85;
  }
  s.vy += (targetVy - s.vy) * Math.min(1, 10 * dt);

  // Storm gusts shove the player — dodge the wires anyway.
  if (s.stormMode > 0) {
    s.vy += Math.sin(s.t * 7.3) * 320 * dt;
  }

  s.py += s.vy * dt;
  if (s.py < 24) {
    s.py = 24;
    s.vy = Math.max(0, s.vy);
  }

  // --- cloud surface interaction ---
  const surf = surfaceY(s.worldX, s.t, s.h);
  const sv = surfaceVel(s.worldX, s.t);
  const distToSurface = surf - s.py; // >0 means player is above the sea

  // Buoyancy: dunked under the sea gets pushed back up, slowly.
  if (distToSurface < -14) {
    s.vy -= 900 * dt;
    s.vy *= 1 - Math.min(1, 3 * dt);
  }

  // Flow: moving WITH the ripple's own motion, near the surface.
  const nearSurface = distToSurface > -14 && distToSurface < 120;
  const aligned = Math.sign(s.vy) === Math.sign(sv) && Math.abs(s.vy) > 60 && Math.abs(sv) > 20;
  const wantFlow = nearSurface && aligned ? 1 : 0;
  s.flow += (wantFlow - s.flow) * Math.min(1, 4 * dt);
  const wasFlowing = s.flowing;
  s.flowing = s.flow > 0.55;
  if (s.flowing && !wasFlowing) emit(s, 'flow');

  // --- speed ---
  let target = TUNE.baseSpeed * (1 + TUNE.flowBoost * s.flow);
  if (s.stormMode > 0) target *= TUNE.stormSpeed;
  if (s.zapTimer > 0) target *= TUNE.zapSlow;
  target = Math.min(target, TUNE.maxSpeed);
  s.speed += (target - s.speed) * Math.min(1, 2.5 * dt);
  s.worldX += s.speed * dt;
  s.px = s.worldX;

  // --- score: distance ---
  const mult = s.stormMode > 0 ? TUNE.stormScoreMult : 1;
  s.score += dt * s.speed * 0.055 * mult;

  // --- spawners ---
  if (s.runT >= s.nextWireAt) spawnWire(s);
  if (s.runT >= s.nextThermalAt) spawnThermal(s);

  // Storm cycle.
  if (s.stormWallX == null && s.stormMode <= 0 && s.runT >= s.nextStormAt) {
    s.stormWallX = s.worldX + s.w * 1.6;
  }
  if (s.stormWallX != null) {
    if (s.stormWallX <= s.worldX + playerScreenX) {
      s.stormWallX = null;
      s.stormMode = TUNE.stormDuration;
      s.nextStormAt = s.runT + TUNE.stormEveryMin + Math.random() * (TUNE.stormEveryMax - TUNE.stormEveryMin);
      s.nextBoltAt = s.runT + 0.4;
      emit(s, 'storm');
    }
  }
  if (s.stormMode > 0) {
    s.stormMode -= dt;
    if (s.runT >= s.nextBoltAt) spawnBolt(s);
    if (s.stormMode <= 0) s.stormMode = 0;
  }

  const px = playerScreenX;
  const pr = TUNE.playerRadius;

  // --- wires: threading ---
  for (const wr of s.wires) {
    const sx = px + (wr.wx - s.worldX);
    if (!wr.passed && !wr.zapped && Math.abs(sx - px) < pr + 6) {
      if (s.py < wr.gapTop + 6 || s.py > wr.gapBottom - 6) {
        // clipped a wire
        wr.zapped = true;
        s.combo = 0;
        s.zapTimer = 1;
        s.flash = 0.85;
        addParticles(s, px, s.py, 'zap', 14, 220);
        emit(s, 'zap');
      } else {
        // clean thread
        wr.passed = true;
        s.combo += 1;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        const pts = TUNE.threadScore * s.combo * mult;
        s.score += pts;
        addParticles(s, px + 20, s.py, 'thread', 8, 120);
        emit(s, 'thread', { combo: s.combo });
      }
    }
  }
  s.wires = s.wires.filter((wr) => wr.wx > s.worldX - 200);

  // --- thermals: golden lift ---
  let inThermal = false;
  for (const th of s.thermals) {
    const sx = px + (th.wx - s.worldX);
    if (Math.abs(sx - px) < th.w / 2 && s.py < surf + 30) {
      inThermal = true;
      break;
    }
  }
  s.thermals = s.thermals.filter((th) => th.wx > s.worldX - 200);
  if (inThermal && s.slowmo <= 0) {
    s.slowmo = 2.6;
    s.score += TUNE.thermalScore * mult;
    s.thermalGlow = 1;
    addParticles(s, px, s.py, 'gold', 18, 150);
    emit(s, 'thermal');
  }
  if (s.slowmo > 0) {
    // gentle lift during the glide
    s.vy += (-140 - s.vy) * Math.min(1, 3 * rawDt);
    if (Math.random() < 0.5) {
      s.particles.push({
        x: px + (Math.random() - 0.5) * 60,
        y: s.py + 30 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 30,
        vy: -120 - Math.random() * 80,
        life: 0,
        maxLife: 0.9,
        kind: 'gold',
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  // --- lightning: telegraphed horizontal strikes at your height ---
  for (const b of s.bolts) {
    if (!b.struck) {
      b.timer -= dt;
      if (b.timer <= 0.25 && !b.warned) {
        b.warned = true;
        emit(s, 'boltWarn');
      }
      if (b.timer <= 0) {
        b.struck = true;
        b.flash = 1;
        s.flash = Math.max(s.flash, 0.5);
        if (Math.abs(s.py - b.y) < TUNE.boltBandHalf + pr) {
          s.combo = 0;
          s.zapTimer = 1;
          addParticles(s, px, s.py, 'zap', 16, 260);
          emit(s, 'zap');
        } else {
          b.missed = true;
          emit(s, 'boltDodge');
        }
      }
    } else if (b.flash > 0) {
      b.flash = Math.max(0, b.flash - rawDt * 4);
    }
  }
  s.bolts = s.bolts.filter((b) => !b.struck || b.flash > 0);

  // --- flow trail particles ---
  if (s.flowing && Math.random() < 0.6 && s.particles.length < 120) {
    s.particles.push({
      x: px - 14,
      y: s.py + (Math.random() - 0.5) * 18,
      vx: -s.speed * 0.55,
      vy: (Math.random() - 0.5) * 40,
      life: 0,
      maxLife: 0.55,
      kind: 'trail',
      size: 2.5 + Math.random() * 2.5,
    });
  }

  // --- particles ---
  for (const p of s.particles) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  s.particles = s.particles.filter((p) => p.life < p.maxLife);

  // --- trees: the floor ---
  const floor = treeTop(s.worldX, s.h);
  if (s.py + pr * 0.6 > floor) {
    s.phase = 'over';
    const finalScore = Math.floor(s.score);
    s.newBest = finalScore > s.best;
    if (s.newBest) {
      s.best = finalScore;
      saveBest(finalScore);
      emit(s, 'newBest');
    }
    emit(s, 'over');
  }

  s.score = Math.max(0, s.score);
}

export function pauseGame(s) {
  if (s.phase === 'playing') s.phase = 'paused';
}

export function resumeGame(s) {
  if (s.phase === 'paused') s.phase = 'playing';
}
