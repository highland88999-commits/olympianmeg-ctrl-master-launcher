// DK Hero — "Barrel Siege" — pure game logic (no DOM, no canvas, no network).
// Original arcade climber: climb girders, dodge rolling barrels, reach the ship.
// This module is fully unit-testable: createLevel() + step() are deterministic
// given explicit dimensions and input.

import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';

export const GIRDER_COUNT = 4;
export const TOP_LEVEL = GIRDER_COUNT - 1;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function girderYAt(girder, x) {
  const span = girder.span;
  const slope = (girder.yRight - girder.yLeft) / span;
  return girder.yLeft + slope * x;
}

// Build a fresh level. W/H are canvas CSS pixels. score/lives carry over.
export function createLevel(levelNum, W, H, carry) {
  const S = clamp(W / 900, 0.55, 1.6); // global scale factor
  const girders = [];
  const fractions = [0.8, 0.6, 0.4, 0.22]; // girder rows, bottom -> top
  for (let i = 0; i < GIRDER_COUNT; i++) {
    const slant = i % 2 === 0 ? 1 : -1;
    const base = fractions[i] * H;
    girders.push({
      yLeft: base + (slant === 1 ? -0.022 * H : 0.022 * H),
      yRight: base + (slant === 1 ? 0.022 * H : -0.022 * H),
      span: W,
      level: i,
    });
  }

  // Ladders connect girder i to girder i+1, alternating sides (classic layout).
  const ladders = [];
  for (let i = 0; i < GIRDER_COUNT - 1; i++) {
    const x = (i % 2 === 0 ? 0.8 : 0.2) * W;
    ladders.push({
      x,
      topY: girderYAt(girders[i + 1], x),
      bottomY: girderYAt(girders[i], x),
      lower: i,
      upper: i + 1,
    });
  }

  const heroW = 24 * S;
  const heroH = 38 * S;
  const heroX = 0.08 * W;
  const state = {
    W, H, S,
    levelNum,
    score: carry ? carry.score : 0,
    lives: carry ? carry.lives : 3,
    status: 'playing', // playing | dying | levelclear | gameover
    dieTimer: 0,
    clearTimer: 0,
    girders,
    ladders,
    ship: { x: 0.3 * W, flash: 0 },
    barrels: [],
    spawnTimer: 1.2,
    hero: {
      x: heroX,
      y: girderYAt(girders[0], heroX) - heroH,
      w: heroW,
      h: heroH,
      level: 0,
      vx: 0,
      vy: 0,
      airborne: false,
      climb: null, // { ladder, feetY }
      facing: 1,
      dead: false,
    },
    events: [],
  };
  return state;
}

function barrelSpeed(state) {
  return (95 + (state.levelNum - 1) * 28) * state.S;
}

function spawnInterval(state) {
  return Math.max(0.55, 2.1 - (state.levelNum - 1) * 0.24);
}

function heroCenterX(state) {
  return state.hero.x + state.hero.w / 2;
}

function tryStartClimb(state, input) {
  const hero = state.hero;
  const cx = heroCenterX(state);
  const grab = 16 * state.S;
  for (const lad of state.ladders) {
    if (Math.abs(cx - lad.x) > grab) continue;
    if (input.up && hero.level === lad.lower) {
      hero.climb = { ladder: lad, feetY: lad.bottomY };
      hero.x = lad.x - hero.w / 2;
      hero.airborne = false;
      hero.vy = 0;
      return true;
    }
    if (input.down && hero.level === lad.upper) {
      hero.climb = { ladder: lad, feetY: lad.topY };
      hero.x = lad.x - hero.w / 2;
      hero.airborne = false;
      hero.vy = 0;
      return true;
    }
  }
  return false;
}

function updateClimb(state, input, dt) {
  const hero = state.hero;
  const { ladder } = hero.climb;
  const speed = 170 * state.S;
  if (input.up) hero.climb.feetY -= speed * dt;
  if (input.down) hero.climb.feetY += speed * dt;
  hero.climb.feetY = clamp(hero.climb.feetY, ladder.topY, ladder.bottomY);
  hero.x = ladder.x - hero.w / 2;
  hero.y = hero.climb.feetY - hero.h;

  if (hero.climb.feetY <= ladder.topY + 0.5) {
    hero.level = ladder.upper;
    hero.climb = null;
    hero.y = ladder.topY - hero.h;
  } else if (hero.climb.feetY >= ladder.bottomY - 0.5) {
    hero.level = ladder.lower;
    hero.climb = null;
    hero.y = ladder.bottomY - hero.h;
  }
}

function rectCircleOverlap(rx, ry, rw, rh, cx, cy, r) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function updateBarrels(state, dt) {
  const S = state.S;
  for (let i = state.barrels.length - 1; i >= 0; i--) {
    const b = state.barrels[i];
    if (b.falling) {
      b.vy += 2200 * S * dt;
      b.y += b.vy * dt;
      const target = state.girders[b.level - 1];
      const gy = girderYAt(target, b.x);
      if (b.y >= gy - b.r) {
        b.level -= 1;
        b.falling = false;
        b.vy = 0;
        b.y = gy - b.r;
      }
      continue;
    }
    const dir = b.level % 2 === 0 ? 1 : -1;
    b.x += dir * b.speed * dt;
    b.rot += 0.12 * dir * (b.speed / (100 * S));
    b.y = girderYAt(state.girders[b.level], b.x) - b.r;

    const pastEdge =
      (dir === 1 && b.x > state.W - b.r) || (dir === -1 && b.x < b.r);
    if (pastEdge) {
      if (b.level > 0) {
        b.falling = true;
        b.vy = 0;
        b.x = dir === 1 ? state.W - b.r - 1 : b.r + 1;
      } else {
        state.barrels.splice(i, 1);
      }
    }
  }
}

function updateHero(state, input, dt) {
  const hero = state.hero;
  const S = state.S;

  if (hero.climb) {
    updateClimb(state, input, dt);
    return;
  }

  // Start climbing?
  if (!hero.airborne && (input.up || input.down)) {
    if (tryStartClimb(state, input)) return;
  }

  // Horizontal movement
  const speed = 230 * S;
  let move = 0;
  if (input.left) move -= 1;
  if (input.right) move += 1;
  hero.x = clamp(hero.x + move * speed * dt, 0, state.W - hero.w);
  hero.vx = move * speed;
  if (move !== 0) hero.facing = move;

  // Jump (edge-triggered by caller setting input.jump)
  const girder = state.girders[hero.level];
  const groundY = girderYAt(girder, heroCenterX(state)) - hero.h;
  if (input.jump && !hero.airborne) {
    hero.airborne = true;
    hero.vy = -680 * S;
    state.events.push('jump');
  }

  if (hero.airborne) {
    hero.vy += 1900 * S * dt;
    hero.y += hero.vy * dt;
    if (hero.y >= groundY && hero.vy > 0) {
      hero.y = groundY;
      hero.airborne = false;
      hero.vy = 0;
      state.events.push('land');
    }
  } else {
    // Stick to the slanted girder
    hero.y = groundY;
  }
}

function checkBarrelHits(state) {
  const hero = state.hero;
  const cx = heroCenterX(state);
  const heroFeet = hero.y + hero.h;
  for (const b of state.barrels) {
    // Jump-over bonus: airborne hero, barrel passes underneath on the same girder.
    if (!b.falling && b.level === hero.level && hero.airborne && !b.scored) {
      if (Math.abs(b.x - cx) < hero.w / 2 + b.r && heroFeet < b.y - b.r) {
        b.scored = true;
        state.score += 100;
        state.events.push('jumped-over');
      }
    }
    // Solid hit.
    if (
      rectCircleOverlap(hero.x, hero.y, hero.w, hero.h, b.x, b.y, b.r) &&
      state.status === 'playing'
    ) {
      state.status = 'dying';
      state.dieTimer = 1.2;
      // The Land of the Dead (Merlin, Nov 16 ~04:17): the hero's death
      // arrives there too — additive only, the die timer and the
      // lives/respawn below are untouched. Guarded by
      // `state.status === 'playing'`, so this fires once per death.
      recordSoulArrival({ kind: 'user', origin: 'dk-hero', diedAt: Date.now() });
      state.events.push('died');
      return;
    }
  }
}

function checkWin(state) {
  const hero = state.hero;
  if (hero.level === TOP_LEVEL && !hero.climb) {
    if (Math.abs(heroCenterX(state) - state.ship.x) < 75 * state.S) {
      state.status = 'levelclear';
      state.clearTimer = 1.6;
      state.score += 250 * state.levelNum;
      state.events.push('level-clear');
    }
  }
}

// Advance the simulation by dt seconds. input: {left,right,up,down,jump}.
// Returns the events raised this step; state.events is reset each call.
export function step(state, input, dt) {
  state.events = [];
  input = input || {};
  const noop = { left: false, right: false, up: false, down: false, jump: false };
  const inp = Object.assign(noop, input);

  if (state.status === 'dying') {
    state.dieTimer -= dt;
    if (state.dieTimer <= 0) {
      state.lives -= 1;
      if (state.lives <= 0) {
        state.status = 'gameover';
        state.events.push('game-over');
      } else {
        // Respawn on the bottom girder.
        const fresh = createLevel(state.levelNum, state.W, state.H, {
          score: state.score,
          lives: state.lives,
        });
        Object.assign(state, fresh);
        state.events.push('respawn');
      }
    }
    return state.events;
  }

  if (state.status === 'levelclear') {
    state.clearTimer -= dt;
    if (state.clearTimer <= 0) state.events.push('next-level');
    return state.events;
  }

  if (state.status !== 'playing') return state.events;

  // Ship flash decay + barrel spawning.
  if (state.ship.flash > 0) state.ship.flash -= dt;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    const top = state.girders[TOP_LEVEL];
    const bx = state.ship.x + 85 * state.S;
    state.barrels.push({
      x: bx,
      y: girderYAt(top, bx) - 14 * state.S,
      r: 14 * state.S,
      level: TOP_LEVEL,
      speed: barrelSpeed(state),
      vy: 0,
      rot: 0,
      falling: false,
      scored: false,
    });
    state.ship.flash = 0.35;
    state.spawnTimer = spawnInterval(state) * (0.7 + Math.random() * 0.6);
    state.events.push('barrel-spawned');
  }

  updateBarrels(state, dt);
  updateHero(state, inp, dt);
  checkBarrelHits(state);
  if (state.status === 'playing') checkWin(state);

  // Consume edge-triggered jump on the caller's input object.
  if (input) input.jump = false;
  return state.events;
}

// Rebuild layout on resize, preserving score/lives/level.
export function resizeLevel(state, W, H) {
  const fresh = createLevel(state.levelNum, W, H, {
    score: state.score,
    lives: state.lives,
  });
  Object.assign(state, fresh);
}
