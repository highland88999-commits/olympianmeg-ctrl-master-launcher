// app/crocodile-swamp/engine.js
// CROCODILE SWAMP — pure game logic for a Florida survival chase.
// No DOM, no rendering, no audio. Shared by the page (rAF driver) and the
// headless tests. The page drains state.events to fire sound + haptics.
//
// The run: paddle your canoe around the swamp. The crocodile spots you and
// charges. It bumps you off your boat — then you have 10 seconds to swim
// away. After that it hunts you on water AND land until it eats you.
// Score = how long you survive + how far you travel.

import {
  WORLD,
  isLand,
  clampToWorld,
  threatConfig,
  mulberry32,
} from '../../lib/crocodile-swamp/levels.js';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';

export const PHASES = {
  paddling: 'paddling', // in the canoe, not yet caught
  swim: 'swim', // knocked off the boat — 10s grace window
  hunted: 'hunted', // the hunt is on, both terrains
};

export const SPEEDS = {
  canoe: 7.6,
  swim: 4.3,
  run: 7.0,
};

export const SWIM_WINDOW = 10; // seconds to swim away after the bump
export const BUMP_DISTANCE = 2.4;
export const CATCH_DISTANCE = 1.9;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function moveToward(actor, target, speed, dt) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const step = Math.min(d, speed * dt);
  actor.x += (dx / d) * step;
  actor.z += (dz / d) * step;
  actor.dir = Math.atan2(dx, dz);
  return step;
}

export function createGame(seed = 20261019) {
  const rand = mulberry32(seed);
  // The crocodile starts lurking at a random water's-edge point.
  const ang = rand() * Math.PI * 2;
  const croc = {
    x: Math.cos(ang) * WORLD.waterRx * 0.82,
    z: Math.sin(ang) * WORLD.waterRz * 0.82,
    dir: rand() * Math.PI * 2,
    mode: 'lurk', // lurk -> charge -> circle -> hunt
    wanderAt: 0,
    wanderTarget: null,
  };
  return {
    status: 'ready', // ready (brief) -> playing -> gameover
    statusTimer: 1.2,
    phase: PHASES.paddling,
    time: 0, // survival seconds
    distance: 0, // world units travelled
    score: 0,
    seed,
    rand,
    player: { x: 0, z: 6, dir: 0, vx: 0, vz: 0, onLand: false },
    canoe: { x: 0, z: 6, dir: 0, adrift: false, vx: 0, vz: 0 },
    croc,
    input: { x: 0, z: 0 },
    swimTimer: 0,
    spottedAt: -1,
    events: [],
  };
}

/** Set the desired move direction (normalized by the engine). */
export function setInput(state, x, z) {
  const m = Math.hypot(x, z);
  if (m < 1e-6) {
    state.input.x = 0;
    state.input.z = 0;
  } else {
    state.input.x = x / m;
    state.input.z = z / m;
  }
}

function emit(state, type) {
  state.events.push({ type });
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

function updateScore(state) {
  state.score = Math.floor(state.time) * 10 + Math.floor(state.distance) * 5;
}

function stepPlayer(state, dt) {
  const p = state.player;
  const cfg = threatConfig(state.time);
  let speed = SPEEDS.canoe;
  if (state.phase === PHASES.swim) speed = SPEEDS.swim;
  else if (state.phase === PHASES.hunted) speed = p.onLand ? SPEEDS.run : SPEEDS.swim + 0.6;
  else if (p.onLand) speed = SPEEDS.run; // beached the canoe — you can run

  const targetVx = state.input.x * speed;
  const targetVz = state.input.z * speed;
  const accel = state.phase === PHASES.paddling && !p.onLand ? 3.2 : 6.5;
  p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
  p.vz += (targetVz - p.vz) * Math.min(1, accel * dt);
  const ox = p.x;
  const oz = p.z;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  clampToWorld(p);
  const moved = Math.hypot(p.x - ox, p.z - oz);
  state.distance += moved;
  if (Math.hypot(p.vx, p.vz) > 0.4) p.dir = Math.atan2(p.vx, p.vz);

  const wasLand = p.onLand;
  p.onLand = isLand(p.x, p.z);
  if (state.phase === PHASES.swim && !wasLand && p.onLand) {
    // Made the bank inside the window — the hunt begins on land.
    state.phase = PHASES.hunted;
    state.croc.mode = 'hunt';
    emit(state, 'landfall');
  }

  // The canoe stays with the paddler; once adrift it drifts and slows.
  if (state.phase === PHASES.paddling) {
    state.canoe.x = p.x;
    state.canoe.z = p.z;
    state.canoe.dir = p.dir;
  } else if (state.canoe.adrift) {
    state.canoe.x += state.canoe.vx * dt;
    state.canoe.z += state.canoe.vz * dt;
    state.canoe.vx *= 1 - 0.8 * dt;
    state.canoe.vz *= 1 - 0.8 * dt;
    clampToWorld(state.canoe);
  }
  return cfg;
}

function stepCroc(state, dt, cfg) {
  const c = state.croc;
  const p = state.player;
  const d = dist(c, p);

  if (state.phase === PHASES.paddling) {
    if (c.mode === 'lurk') {
      // Slow patrol until it spots the canoe.
      if (state.time > cfg.graceSeconds && d < cfg.spotRadius) {
        c.mode = 'charge';
        state.spottedAt = state.time;
        emit(state, 'spotted');
      } else {
        if (!c.wanderTarget || state.time >= c.wanderAt) {
          const a = state.rand() * Math.PI * 2;
          const r = 0.35 + state.rand() * 0.5;
          c.wanderTarget = {
            x: Math.cos(a) * WORLD.waterRx * r,
            z: Math.sin(a) * WORLD.waterRz * r,
          };
          c.wanderAt = state.time + 4 + state.rand() * 4;
        }
        moveToward(c, c.wanderTarget, 1.6, dt);
        return;
      }
    }
    if (c.mode === 'charge') {
      moveToward(c, p, cfg.crocWaterSpeed, dt);
      if (dist(c, p) < BUMP_DISTANCE) {
        // THE BUMP — off the boat, into the water, clock starts.
        state.phase = PHASES.swim;
        state.swimTimer = SWIM_WINDOW;
        c.mode = 'circle';
        state.canoe.adrift = true;
        const push = 3.2;
        state.canoe.vx = Math.sin(p.dir) * push + p.vx * 0.4;
        state.canoe.vz = Math.cos(p.dir) * push + p.vz * 0.4;
        p.x += Math.sin(p.dir + Math.PI / 2) * 2.2;
        p.z += Math.cos(p.dir + Math.PI / 2) * 2.2;
        clampToWorld(p);
        p.onLand = isLand(p.x, p.z);
        emit(state, 'bump');
      }
    }
    return;
  }

  if (state.phase === PHASES.swim) {
    // It circles, watching. It does not strike during the window — those
    // are the rules of the swamp. Get to the bank or get distance.
    const orbit = {
      x: p.x + Math.cos(state.time * 0.9) * 7,
      z: p.z + Math.sin(state.time * 0.9) * 7,
    };
    moveToward(c, orbit, 5.2, dt);
    state.swimTimer -= dt;
    if (state.swimTimer <= 0) {
      state.swimTimer = 0;
      if (state.phase === PHASES.swim) {
        state.phase = PHASES.hunted;
        c.mode = 'hunt';
        emit(state, 'hunt');
      }
    }
    return;
  }

  if (state.phase === PHASES.hunted) {
    const speed = isLand(c.x, c.z) ? cfg.crocLandSpeed : cfg.crocHuntWaterSpeed;
    // Aim slightly ahead of the runner — it has done this before.
    const lead = 0.35;
    const target = { x: p.x + p.vx * lead, z: p.z + p.vz * lead };
    moveToward(c, target, speed, dt);
    if (dist(c, p) < CATCH_DISTANCE) {
      state.status = 'gameover';
      // The Land of the Dead (Merlin, Nov 16 ~04:17): being eaten
      // arrives there too — additive only, the 'caught' event below
      // is untouched. stepGame returns early once status is
      // 'gameover', so this fires once per run.
      recordSoulArrival({ kind: 'user', origin: 'crocodile-swamp', diedAt: Date.now() });
      emit(state, 'caught');
    }
  }
}

export function stepGame(state, dt) {
  if (state.status === 'gameover') return state;
  if (state.status === 'ready') {
    state.statusTimer -= dt;
    if (state.statusTimer <= 0) {
      state.status = 'playing';
      emit(state, 'start');
    }
    return state;
  }
  state.time += dt;
  const cfg = stepPlayer(state, dt);
  stepCroc(state, dt, cfg);
  updateScore(state);
  return state;
}

export { WORLD, isLand };
