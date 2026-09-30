// game.js — PILOT mode for the Life orbital matrix.
//
// A playable layer over the orbital visualization: guide your spark with
// pointer or arrow keys, dodge void shards (blockers), grab golden surges
// (boosts) and the occasional shield ring. Difficulty ramps: shards spawn
// faster, fly quicker, and eventually home in on you.
//
// Pure logic (createGame / levelParams / stepGame / spawn helpers) runs in
// plain Node for tests. createPilot() wires DOM input + localStorage best.

import { mulberry32 } from './orbits.js';
import { fx } from '../../lib/fx.js';

export const PLAYER_R = 10;
export const MAX_HULL = 3;
export const LEVEL_SECONDS = 22; // seconds per level
export const SHIELD_SECONDS = 12; // how long a picked-up shield lasts

// Tuning per level. spawnInterval shrinks, shard speed grows, homing kicks
// in at level 4. maxBlockers caps on-screen chaos.
export function levelParams(level) {
  const lv = Math.max(1, Math.floor(level));
  return {
    level: lv,
    spawnInterval: Math.max(0.45, 1.7 - lv * 0.13),
    shardSpeedMin: 60 + lv * 12,
    shardSpeedMax: 110 + lv * 20,
    maxBlockers: Math.min(4 + lv, 14),
    homing: lv >= 4 ? Math.min(0.9, 0.25 + (lv - 4) * 0.12) : 0,
    shieldEvery: [26, 38], // seconds between shield-ring spawns (occasional)
    boostEvery: [6, 10], // seconds between surge spawns
  };
}

export function createGame(w, h, seed = (Math.random() * 1e9) | 0) {
  const rng = mulberry32(seed >>> 0);
  return {
    w: Math.max(1, w),
    h: Math.max(1, h),
    rng,
    playing: false,
    gameOver: false,
    time: 0,
    level: 1,
    levelT: 0,
    score: 0,
    best: 0,
    player: {
      x: w / 2,
      y: h / 2,
      tx: w / 2,
      ty: h / 2,
      hull: MAX_HULL,
      shieldT: 0,
      invulnT: 0,
      surgeT: 0,
    },
    blockers: [], // void shards
    boosts: [], // golden surges
    shieldPickups: [], // cyan rings
    particles: [],
    spawnT: 0.8,
    boostT: 3,
    shieldT: 14, // first shield arrives early so players learn it
    flashT: 0, // hit flash timer (skipped under reduced motion)
    events: [], // drained by the HUD each frame: 'hit' | 'shatter' | 'boost' | 'shieldup' | 'levelup' | 'gameover'
  };
}

export function startGame(g) {
  const { w, h, rng, best } = g;
  const fresh = createGame(w, h, 1);
  // Keep the rng stream + best score; reset everything else.
  fresh.rng = rng;
  fresh.best = best;
  fresh.playing = true;
  Object.assign(g, fresh);
}

function edgePoint(g) {
  const r = g.rng;
  const side = Math.floor(r() * 4);
  const m = 30; // spawn just off-screen
  if (side === 0) return { x: r() * g.w, y: -m };
  if (side === 1) return { x: g.w + m, y: r() * g.h };
  if (side === 2) return { x: r() * g.w, y: g.h + m };
  return { x: -m, y: r() * g.h };
}

// A void shard: spawns at one edge, drifts across the screen.
export function spawnBlocker(g, params) {
  if (g.blockers.length >= params.maxBlockers) return null;
  const p = edgePoint(g);
  const r = g.rng;
  // Aim at a random point on the far side so shards cross the playfield.
  const aim = { x: g.w * (0.2 + r() * 0.6), y: g.h * (0.2 + r() * 0.6) };
  const dx = aim.x - p.x;
  const dy = aim.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = params.shardSpeedMin + r() * (params.shardSpeedMax - params.shardSpeedMin);
  const b = {
    x: p.x,
    y: p.y,
    vx: (dx / d) * speed,
    vy: (dy / d) * speed,
    r: 11 + r() * 9,
    spin: (r() - 0.5) * 3,
    rot: r() * Math.PI * 2,
  };
  g.blockers.push(b);
  return b;
}

export function spawnBoost(g) {
  const r = g.rng;
  const b = {
    x: 40 + r() * (g.w - 80),
    y: 40 + r() * (g.h - 80),
    r: 9,
    ttl: 9,
    ph: r() * Math.PI * 2,
  };
  g.boosts.push(b);
  return b;
}

// Occasional shield ring pickup.
export function spawnShieldPickup(g) {
  const r = g.rng;
  const s = {
    x: 50 + r() * (g.w - 100),
    y: 50 + r() * (g.h - 100),
    r: 11,
    ttl: 12,
    ph: r() * Math.PI * 2,
  };
  g.shieldPickups.push(s);
  return s;
}

function burst(g, x, y, color, n = 14, speed = 160) {
  for (let i = 0; i < n; i++) {
    if (g.particles.length > 140) return;
    const a = g.rng() * Math.PI * 2;
    const v = speed * (0.3 + g.rng() * 0.7);
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      ttl: 0.5 + g.rng() * 0.4,
      age: 0,
      color,
    });
  }
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function stepGame(g, dt, opts = {}) {
  const reduced = !!opts.reducedMotion;
  if (!g.playing || g.gameOver) return g;
  const step = Math.max(0, Math.min(dt, 0.1));
  const speedScale = reduced ? 0.6 : 1;
  const p = g.player;
  const params = levelParams(g.level);

  g.time += step;
  g.score += step * 2; // surviving pays

  // Level ramp — increasingly harder.
  g.levelT += step;
  if (g.levelT >= LEVEL_SECONDS) {
    g.levelT -= LEVEL_SECONDS;
    g.level += 1;
    g.score += 50 * g.level;
    g.events.push('levelup');
  }

  // Player eases toward its target.
  const ease = Math.min(1, step * (p.surgeT > 0 ? 9 : 6));
  p.x += (p.tx - p.x) * ease;
  p.y += (p.ty - p.y) * ease;
  p.x = Math.max(PLAYER_R, Math.min(g.w - PLAYER_R, p.x));
  p.y = Math.max(PLAYER_R, Math.min(g.h - PLAYER_R, p.y));
  if (p.invulnT > 0) p.invulnT -= step;
  if (p.shieldT > 0) p.shieldT -= step;
  if (p.surgeT > 0) p.surgeT -= step;
  if (g.flashT > 0) g.flashT -= step;

  // Spawners.
  g.spawnT -= step;
  if (g.spawnT <= 0) {
    g.spawnT = params.spawnInterval * (0.7 + g.rng() * 0.6);
    spawnBlocker(g, params);
  }
  g.boostT -= step;
  if (g.boostT <= 0) {
    g.boostT = params.boostEvery[0] + g.rng() * (params.boostEvery[1] - params.boostEvery[0]);
    if (g.boosts.length < 3) spawnBoost(g);
  }
  g.shieldT -= step;
  if (g.shieldT <= 0) {
    g.shieldT = params.shieldEvery[0] + g.rng() * (params.shieldEvery[1] - params.shieldEvery[0]);
    if (g.shieldPickups.length < 1) spawnShieldPickup(g);
  }

  // Move shards (with late-game homing).
  for (const b of g.blockers) {
    if (params.homing > 0) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const steer = params.homing * step * 60 * speedScale;
      b.vx += (dx / d) * steer;
      b.vy += (dy / d) * steer;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const max = params.shardSpeedMax * 1.15;
      if (sp > max) {
        b.vx = (b.vx / sp) * max;
        b.vy = (b.vy / sp) * max;
      }
    }
    b.x += b.vx * step * speedScale;
    b.y += b.vy * step * speedScale;
    b.rot += b.spin * step;
  }
  // Drop shards that left the screen.
  g.blockers = g.blockers.filter(
    (b) => b.x > -60 && b.x < g.w + 60 && b.y > -60 && b.y < g.h + 60
  );

  // Pickups age out.
  for (const b of g.boosts) b.ttl -= step;
  g.boosts = g.boosts.filter((b) => b.ttl > 0);
  for (const s of g.shieldPickups) s.ttl -= step;
  g.shieldPickups = g.shieldPickups.filter((s) => s.ttl > 0);

  // Particles.
  for (const pt of g.particles) {
    pt.age += step;
    pt.x += pt.vx * step;
    pt.y += pt.vy * step;
  }
  g.particles = g.particles.filter((pt) => pt.age < pt.ttl);

  // Collisions: shards vs player.
  for (let i = g.blockers.length - 1; i >= 0; i--) {
    const b = g.blockers[i];
    if (dist(p.x, p.y, b.x, b.y) < PLAYER_R + b.r) {
      if (p.invulnT > 0) continue;
      if (p.shieldT > 0) {
        // Shield absorbs the shard — shatter it for bonus points.
        g.blockers.splice(i, 1);
        p.shieldT = 0;
        p.invulnT = 1;
        g.score += 40;
        if (!reduced) burst(g, b.x, b.y, '#00f2ff', 18, 220);
        g.events.push('shatter');
      } else {
        g.blockers.splice(i, 1);
        p.hull -= 1;
        p.invulnT = 1.5;
        if (!reduced) {
          g.flashT = 0.3;
          burst(g, p.x, p.y, '#fb7185', 16, 200);
        }
        g.events.push('hit');
        if (p.hull <= 0) {
          g.gameOver = true;
          g.playing = false;
          g.score = Math.floor(g.score);
          if (g.score > g.best) g.best = g.score;
          g.events.push('gameover');
        }
      }
    }
  }

  // Collisions: surges (boosts).
  for (let i = g.boosts.length - 1; i >= 0; i--) {
    const b = g.boosts[i];
    if (dist(p.x, p.y, b.x, b.y) < PLAYER_R + b.r + 4) {
      g.boosts.splice(i, 1);
      g.score += 25;
      p.surgeT = 4;
      if (!reduced) burst(g, b.x, b.y, '#ffd700', 10, 140);
      g.events.push('boost');
    }
  }

  // Collisions: shield rings.
  for (let i = g.shieldPickups.length - 1; i >= 0; i--) {
    const s = g.shieldPickups[i];
    if (dist(p.x, p.y, s.x, s.y) < PLAYER_R + s.r + 4) {
      g.shieldPickups.splice(i, 1);
      p.shieldT = SHIELD_SECONDS;
      if (!reduced) burst(g, s.x, s.y, '#00f2ff', 12, 150);
      g.events.push('shieldup');
    }
  }

  return g;
}

// Drain queued events (HUD toasts, sounds if ever added).
export function drainEvents(g) {
  const e = g.events;
  g.events = [];
  return e;
}

// ---------------------------------------------------------------------------
// Rendering — dependency-free 2D, drawn by the orbital renderer each frame.
// ---------------------------------------------------------------------------

export function drawGame(ctx, g, t, opts = {}) {
  const reduced = !!opts.reducedMotion;
  if (!g.playing && !g.gameOver && g.time === 0) return;
  const p = g.player;

  // Hit flash: soft red vignette, skipped under reduced motion.
  if (g.flashT > 0 && !reduced) {
    const a = Math.min(0.28, g.flashT);
    const grad = ctx.createRadialGradient(
      g.w / 2, g.h / 2, Math.min(g.w, g.h) * 0.3,
      g.w / 2, g.h / 2, Math.max(g.w, g.h) * 0.7
    );
    grad.addColorStop(0, 'rgba(251,113,133,0)');
    grad.addColorStop(1, `rgba(251,113,133,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, g.w, g.h);
  }

  // Shield-ring pickups.
  for (const s of g.shieldPickups) {
    const pulse = 1 + 0.12 * Math.sin(t * 4 + s.ph);
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.95)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(34,211,238,0.8)';
    ctx.shadowBlur = reduced ? 0 : 12;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * pulse, 0, 6.2832);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.45 * pulse, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  // Surge pickups (boosts).
  for (const b of g.boosts) {
    const pulse = 1 + 0.15 * Math.sin(t * 5 + b.ph);
    const r = b.r * pulse;
    ctx.save();
    ctx.shadowColor = 'rgba(251,191,36,0.9)';
    ctx.shadowBlur = reduced ? 0 : 12;
    ctx.fillStyle = 'rgba(251,191,36,0.95)';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - r);
    ctx.lineTo(b.x + r * 0.7, b.y);
    ctx.lineTo(b.x, b.y + r);
    ctx.lineTo(b.x - r * 0.7, b.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Void shards (blockers): dark spinning diamonds with a hot rim.
  for (const b of g.blockers) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.shadowColor = 'rgba(244,63,94,0.7)';
    ctx.shadowBlur = reduced ? 0 : 10;
    ctx.fillStyle = 'rgba(24,8,18,0.92)';
    ctx.strokeStyle = 'rgba(244,63,94,0.9)';
    ctx.lineWidth = 2;
    const r = b.r;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.75, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.75, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Particles.
  for (const pt of g.particles) {
    const k = 1 - pt.age / pt.ttl;
    ctx.globalAlpha = Math.max(0, k);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // The spark (player).
  const blink = p.invulnT > 0 && !reduced ? 0.45 + 0.35 * Math.sin(t * 30) : 1;
  ctx.save();
  ctx.globalAlpha = blink;
  if (p.shieldT > 0) {
    ctx.strokeStyle = 'rgba(34,211,238,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(34,211,238,0.8)';
    ctx.shadowBlur = reduced ? 0 : 14;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R + 7 + Math.sin(t * 6) * 1.5, 0, 6.2832);
    ctx.stroke();
  }
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = reduced ? 0 : 16;
  const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, PLAYER_R * 1.8);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.5, 'rgba(165,243,252,0.9)');
  core.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_R * 1.8, 0, 6.2832);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// DOM wiring: pointer + keyboard input, best-score persistence.
// ---------------------------------------------------------------------------

const BEST_KEY = 'life-pilot-best';

export function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage unavailable — best simply won't persist */
  }
}

// Creates the pilot controller. The orbital renderer calls tick()/draw() via
// the hooks passed to createOrbitalRenderer; the page calls start()/stop().
export function createPilot(canvas, matrixState, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const rect = () => canvas.getBoundingClientRect();
  const g = createGame(
    Math.max(1, Math.round(rect().width)),
    Math.max(1, Math.round(rect().height))
  );
  g.best = loadBest();

  const keys = new Set();
  const KEY_SPEED = 420; // px/s for keyboard steering

  function toLocal(e) {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e) {
    if (!g.playing) return;
    const p = toLocal(e);
    g.player.tx = p.x;
    g.player.ty = p.y;
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    }
  }

  function onPointerMove(e) {
    if (!g.playing) return;
    // Mouse hover steers; touch steers while dragging (buttons pressed).
    if (e.pointerType === 'mouse' || e.buttons > 0) {
      const p = toLocal(e);
      g.player.tx = p.x;
      g.player.ty = p.y;
    }
  }

  function onKeyDown(e) {
    if (!g.playing) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }

  function onResize() {
    const r = rect();
    g.w = Math.max(1, Math.round(r.width));
    g.h = Math.max(1, Math.round(r.height));
    const p = g.player;
    p.x = Math.min(p.x, g.w - PLAYER_R);
    p.y = Math.min(p.y, g.h - PLAYER_R);
    p.tx = Math.min(p.tx, g.w);
    p.ty = Math.min(p.ty, g.h);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);

  return {
    game: g,
    start() {
      onResize();
      startGame(g);
      matrixState.playing = true;
    },
    stop() {
      g.playing = false;
      matrixState.playing = false;
    },
    get playing() {
      return g.playing;
    },
    tick(dt) {
      // Keyboard steering nudges the target point.
      if (g.playing && keys.size > 0) {
        const p = g.player;
        let dx = 0;
        let dy = 0;
        if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
        if (keys.has('arrowright') || keys.has('d')) dx += 1;
        if (keys.has('arrowup') || keys.has('w')) dy -= 1;
        if (keys.has('arrowdown') || keys.has('s')) dy += 1;
        const d = Math.hypot(dx, dy) || 1;
        p.tx = Math.max(0, Math.min(g.w, p.tx + (dx / d) * KEY_SPEED * dt));
        p.ty = Math.max(0, Math.min(g.h, p.ty + (dy / d) * KEY_SPEED * dt));
      }
      const before = g.best;
      stepGame(g, dt, { reducedMotion: reduced });
      if (g.gameOver) {
        matrixState.playing = false;
        if (g.best > before) saveBest(g.best);
      }
    },
    draw(ctx, w, h, t) {
      drawGame(ctx, g, t, { reducedMotion: reduced });
    },
    hud() {
      const p = g.player;
      // Game-feel FX: translate drained logic events into matched
      // sound+haptic pairs. fx is a no-op before the first user gesture.
      for (const e of drainEvents(g)) {
        if (e === 'hit') fx.hit(); // shard hit the hull: dull thud
        else if (e === 'shatter') fx.hit(); // shield absorbed a shard
        else if (e === 'boost') fx.boost(); // golden surge: speed whoosh
        else if (e === 'shieldup') fx.coin(); // shield ring pickup: sparkle
        else if (e === 'levelup') fx.levelUp(); // difficulty ramp: arpeggio
        else if (e === 'gameover') fx.death(); // hull gone: long rumble
      }
      return {
        playing: g.playing,
        gameOver: g.gameOver,
        score: Math.floor(g.score),
        best: g.best,
        hull: p.hull,
        maxHull: MAX_HULL,
        shield: p.shieldT > 0,
        shieldT: Math.ceil(p.shieldT),
        level: g.level,
        events: [],
      };
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      matrixState.playing = false;
    },
  };
}
