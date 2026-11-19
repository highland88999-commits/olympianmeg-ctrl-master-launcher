// app/swamp-run/engine.js
// SWAMP RUN — pure game logic. No DOM, no rendering. Headless-testable.
//
// The run: paddle a canoe through a seeded Florida swamp while a crocodile
// patrols below the surface. Stay quiet, stay hidden behind the cypress —
// awareness builds from sight (line of sight + range) and noise (fast
// paddling is LOUD). Get spotted in the canoe and the chase is a paddle
// sprint: PADDLE. If it catches the canoe it RAMS you into the water and
// you get exactly 10 seconds of grace, circled by those eyes, to swim.
// Then it hunts — water AND land — until it eats you.
// Score = survival seconds x distance metres.

import {
  generateWorld,
  terrainAt,
  isWater,
  lineOfSight,
  collideTrees,
  nearestWater,
  WORLD_HALF,
  dist,
} from '../../lib/swamp-run/world.js';
import { computeScore } from '../../lib/swamp-run/board.js';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';
import { createGatorAgent } from '../../lib/swamp-run/gator-agent.js';
import { headingTo, turnToward, moveForward } from '../../lib/world/character-agent.js';

export const TUNING = {
  graceSeconds: 10,
  sightRange: 38,
  catchCanoe: 2.6, // metres — close enough to ram
  catchBody: 1.8, // metres — close enough to eat
  circleRadius: 7.5, // how wide it circles you during grace
  canoeSpeed: 6.1,
  canoeSprintSpeed: 10.6,
  swimSpeed: 2.35,
  footSpeed: 3.65,
  crocPatrolSpeed: 3.1,
  crocChaseSpeed: 9.7,
  crocHuntWaterSpeed: 8.3,
  crocHuntLandSpeed: 4.45,
  // Alligator (ambush predator): lurks near banks, bursts when you're close.
  gatorLurkSpeed: 0.4, // barely drifts while lurking
  gatorBurstSpeed: 11.5, // explosive short sprint — faster than your sprint
  gatorBurstRange: 13, // metres — triggers the ambush
  gatorGiveUpSeconds: 6, // bursts are short; it tires fast
  gatorCatchBody: 1.9,
  boardRange: 4, // metres — click/tap the canoe within this to board
};

/** How far the croc can hear the player right now (metres). */
export function noiseRadiusFor(state) {
  const p = state.player;
  const moving = Math.abs(p.speed) > 0.4;
  if (!moving) return 0;
  switch (p.mode) {
    case 'canoe':
      return state.input.sprint ? 26 : 14; // sprint paddling carries far
    case 'swim':
      return 9; // splashing, but small
    case 'foot':
      return 11; // crashing through palmettos
    default:
      return 0;
  }
}

/**
 * Awareness gain this tick, 0..1 per second before dt scaling.
 * Sight: needs line of sight inside sightRange; closer fills faster.
 * Sound: inside the noise radius the croc hears you through the trees.
 */
export function detectionRate(state) {
  const { player, croc, world } = state;
  const d = dist(player.x, player.z, croc.x, croc.z);
  let rate = 0;
  if (d <= TUNING.sightRange && lineOfSight(world.trees, croc.x, croc.z, player.x, player.z)) {
    const closeness = 1 - d / TUNING.sightRange; // 0 at edge, 1 at the snout
    rate += 0.85 + closeness * 1.3;
  }
  const noise = noiseRadiusFor(state);
  if (noise > 0 && d <= noise) rate += 0.95;
  return rate;
}

export function createGame(seed = 1) {
  const world = generateWorld(seed);
  // Player starts ON FOOT at the shore — the canoe floats parked nearby.
  // Click/tap the canoe (or walk into the water beside it) to board.
  // The player stands 2.5m from the canoe: inside tap-to-board range,
  // on the nearest dry footing.
  const shore = findShore(world.seed, world.spawn.x, world.spawn.z);
  const sx = shore.x - world.spawn.x;
  const sz = shore.z - world.spawn.z;
  const sd = Math.hypot(sx, sz) || 1;
  const startX = world.spawn.x + (sx / sd) * Math.min(sd, 2.5);
  const startZ = world.spawn.z + (sz / sd) * Math.min(sd, 2.5);
  const state = {
    status: 'ready', // ready -> playing -> dead
    readyTimer: 1.1,
    time: 0,
    survival: 0,
    distance: 0,
    seed: world.seed,
    world,
    player: {
      x: startX,
      z: startZ,
      heading: world.spawn.heading,
      speed: 0,
      mode: 'foot', // foot | canoe | swim — you board the canoe to start
    },
    canoe: {
      x: world.spawn.x,
      z: world.spawn.z,
      heading: world.spawn.heading,
      alive: true,
      parked: true, // waiting at the shore for its paddler
    },
    croc: {
      x: world.crocSpawn.x,
      z: world.crocSpawn.z,
      heading: 0,
      speed: 0,
      mode: 'patrol', // patrol | chase | circle | hunt
      awareness: 0,
      waypoint: 0,
      circleAngle: 0,
      growlTimer: 4,
    },
    gator: {
      x: world.gatorSpawn.x,
      z: world.gatorSpawn.z,
      heading: 0,
      speed: 0,
      mode: 'lurk', // lurk | burst | rest — ambush predator near the banks
      burstTimer: 0,
      restTimer: 0,
      growlTimer: 8,
    },
    graceTimer: null, // seconds left of post-ram grace (null = not in grace)
    graceWhole: null, // last whole second announced (tick events)
    input: { thrust: 0, turn: 0, sprint: false },
    events: [],
    death: null,
    paddleTimer: 0,
    stepTimer: 0,
  };
  // The alligator's brain: one agent per game (see gatorAgents above).
  gatorAgents.set(state, createGatorAgent(TUNING));
  return state;
}

/**
 * Click/tap-to-board: the player boards the parked canoe.
 * Works when on foot within boardRange of the canoe. Emits 'board'.
 * Returns true when boarding happened.
 */
export function tryBoardCanoe(state) {
  const p = state.player;
  if (state.status !== 'playing') return false;
  if (p.mode !== 'foot') return false;
  if (!state.canoe.alive || !state.canoe.parked) return false;
  if (dist(p.x, p.z, state.canoe.x, state.canoe.z) > TUNING.boardRange) return false;
  p.mode = 'canoe';
  p.heading = state.canoe.heading;
  p.speed = 0;
  state.canoe.parked = false;
  emit(state, 'board');
  return true;
}

/** Nearest land point to (x,z) — the shore where the player starts on foot. */
export function findShore(seed, x, z) {
  for (let r = 0; r <= 120; r += 3) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const nx = x + Math.cos(a) * r;
      const nz = z + Math.sin(a) * r;
      if (Math.abs(nx) > 305 || Math.abs(nz) > 305) continue;
      if (terrainAt(seed, nx, nz) !== 'water') return { x: nx, z: nz };
    }
  }
  return { x, z };
}

export function setInput(state, input) {
  if (!input) return;
  state.input.thrust = Math.max(-1, Math.min(1, Number(input.thrust) || 0));
  state.input.turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
  state.input.sprint = !!input.sprint;
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

export function currentScore(state) {
  return computeScore(state.survival, state.distance);
}

function emit(state, type, extra = {}) {
  state.events.push({ type, ...extra });
}

// The gator's brain lives in lib/swamp-run/gator-agent.js — one agent per
// game, held in a WeakMap keyed by state so the state shape stays
// byte-identical (nothing serializes state whole, and the agent is
// functions + no stored state of its own beyond the gator record).
const gatorAgents = new WeakMap();

function gatorAgentFor(state) {
  let agent = gatorAgents.get(state);
  if (!agent) {
    agent = createGatorAgent(TUNING);
    gatorAgents.set(state, agent);
  }
  return agent;
}

// ---------------------------------------------------------------- player --
function stepPlayer(state, dt) {
  const p = state.player;
  const { input } = state;
  const turnRate = p.mode === 'canoe' ? 1.85 : p.mode === 'swim' ? 2.7 : 3.4;
  p.heading += input.turn * turnRate * dt;

  let cruise = TUNING.canoeSpeed;
  if (p.mode === 'swim') cruise = TUNING.swimSpeed;
  if (p.mode === 'foot') cruise = TUNING.footSpeed;
  let target = cruise * Math.max(0, input.thrust); // no reverse — swamp rules
  if (p.mode === 'canoe' && input.sprint) {
    target = TUNING.canoeSprintSpeed * Math.max(0, input.thrust);
  }
  const accel = p.mode === 'canoe' ? 5.5 : 7;
  p.speed += Math.max(-accel * dt, Math.min(accel * dt, target - p.speed));
  if (Math.abs(p.speed) < 0.02 && target === 0) p.speed = 0;

  if (p.speed !== 0) {
    const stepLen = p.speed * dt;
    let nx = p.x + Math.sin(p.heading) * stepLen;
    let nz = p.z + Math.cos(p.heading) * stepLen;
    const pushed = collideTrees(state.world.trees, nx, nz, p.mode === 'canoe' ? 0.9 : 0.45);
    nx = pushed.x;
    nz = pushed.z;
    const here = terrainAt(state.seed, nx, nz);
    const moved = dist(p.x, p.z, nx, nz);
    state.distance += moved;

    if (p.mode === 'canoe') {
      if (here !== 'water') {
        // Beached! Hop out on foot; the canoe waits at the shore.
        p.x = nx;
        p.z = nz;
        p.mode = 'foot';
        p.speed = 0;
        state.canoe.parked = true;
        state.canoe.x = state.player.x - Math.sin(p.heading) * 1.4;
        state.canoe.z = state.player.z - Math.cos(p.heading) * 1.4;
        state.canoe.heading = p.heading;
        emit(state, 'beach');
      } else {
        p.x = nx;
        p.z = nz;
        state.canoe.x = nx;
        state.canoe.z = nz;
        state.canoe.heading = p.heading;
      }
    } else if (p.mode === 'foot') {
      if (here === 'water') {
        // Stepping off the bank: back in the canoe if it's waiting close,
        // otherwise you're swimming.
        const nearCanoe =
          state.canoe.alive &&
          state.canoe.parked &&
          dist(nx, nz, state.canoe.x, state.canoe.z) < 3;
        p.x = nx;
        p.z = nz;
        if (nearCanoe) {
          p.mode = 'canoe';
          state.canoe.parked = false;
          p.heading = state.canoe.heading;
          emit(state, 'board');
        } else {
          p.mode = 'swim';
          emit(state, 'splash');
        }
      } else {
        p.x = nx;
        p.z = nz;
      }
    } else {
      // swimming
      if (here === 'land') {
        p.x = nx;
        p.z = nz;
        p.mode = 'foot';
        emit(state, 'ashore');
      } else {
        p.x = nx;
        p.z = nz;
      }
    }
  }

  // Paddle / step audio cadence.
  if (p.speed > 0.6 && p.mode === 'canoe') {
    state.paddleTimer -= dt * (state.input.sprint ? 1.9 : 1);
    if (state.paddleTimer <= 0) {
      state.paddleTimer = 0.62;
      emit(state, state.input.sprint ? 'sprintPaddle' : 'paddle');
    }
  } else if (p.speed > 0.6 && p.mode === 'foot') {
    state.stepTimer -= dt;
    if (state.stepTimer <= 0) {
      state.stepTimer = 0.34;
      emit(state, 'step');
    }
  } else if (p.speed > 0.6 && p.mode === 'swim') {
    state.paddleTimer -= dt;
    if (state.paddleTimer <= 0) {
      state.paddleTimer = 0.8;
      emit(state, 'swimStroke');
    }
  }
}

// --------------------------------------------------------------- gator --
// The alligator is an AMBUSH predator — the crocodile's opposite, and the
// pilot for agent-driven movement (Merlin, Nov 18 ~23:23). Its brain lives
// in lib/swamp-run/gator-agent.js: the agent perceives the player, decides
// lurk / burst / rest, and steers through the shared character-agent
// primitives. The engine stays the single death path — a catch the agent
// reports becomes killPlayer here, and only here.
function stepGator(state, dt) {
  const events = gatorAgentFor(state).step(state, dt);
  for (const ev of events) {
    if (ev.type === 'catch') {
      killPlayer(state, 'gator');
      return;
    }
    emit(state, ev.type);
  }
}

// ------------------------------------------------------------------ croc --
function stepCroc(state, dt) {
  const c = state.croc;
  const p = state.player;
  const d = dist(c.x, c.z, p.x, p.z);
  const escalation = Math.min(1.3, state.survival / 240); // it learns you

  if (c.mode === 'patrol') {
    // Endless world: when the player has paddled far from the home
    // region, the croc patrols the water near the player instead of
    // the home waypoints — otherwise fleeing far out would end the
    // hunt for good. The far waypoint refreshes on arrival.
    const farOut = Math.hypot(p.x, p.z) > WORLD_HALF + 100;
    let target;
    if (farOut) {
      if (!c.farWp || dist(c.x, c.z, c.farWp.x, c.farWp.z) < 6) {
        c.farWp = nearestWater(state.seed, p.x + 60, p.z + 40);
      }
      target = c.farWp;
    } else {
      c.farWp = null;
      const wp = state.world.waypoints[c.waypoint % state.world.waypoints.length];
      if (dist(c.x, c.z, wp.x, wp.z) < 6) c.waypoint += 1;
      target = state.world.waypoints[c.waypoint % state.world.waypoints.length];
    }
    turnToward(c, headingTo(c.x, c.z, target.x, target.z), 1.2, dt);
    c.speed = TUNING.crocPatrolSpeed;
    moveForward(c, dt);
    // Ambient menace: a growl when it drifts close, seen or not.
    c.growlTimer -= dt;
    if (d < 20 && c.growlTimer <= 0) {
      c.growlTimer = 6 + (d / 20) * 4;
      emit(state, 'growl');
    }
    return;
  }

  if (c.mode === 'chase') {
    // Canoe chase: it wants the boat. Slightly slower than a sprinting
    // paddler in a straight line — but it never gets tired and cuts the
    // bends. Catch the canoe and it RAMS.
    turnToward(c, headingTo(c.x, c.z, p.x, p.z), 1.55, dt);
    c.speed = TUNING.crocChaseSpeed + escalation;
    moveForward(c, dt);
    if (p.mode === 'canoe' && dist(c.x, c.z, p.x, p.z) < TUNING.catchCanoe) {
      ramPlayer(state);
    } else if (p.mode !== 'canoe') {
      c.mode = 'hunt'; // you bailed onto land mid-chase — it follows
    }
    return;
  }

  if (c.mode === 'circle') {
    // Grace: it circles you in the water, eyes up, counting with you.
    c.circleAngle += dt * 0.85;
    const tx = p.x + Math.sin(c.circleAngle) * TUNING.circleRadius;
    const tz = p.z + Math.cos(c.circleAngle) * TUNING.circleRadius;
    const spot = { x: tx, z: tz };
    turnToward(c, headingTo(c.x, c.z, spot.x, spot.z), 2.2, dt);
    c.speed = 4.2;
    moveForward(c, dt);
    c.heading = headingTo(c.x, c.z, p.x, p.z); // always watching you
    return;
  }

  if (c.mode === 'hunt') {
    // Everywhere hunt: water speed on water, slower but relentless on land.
    turnToward(c, headingTo(c.x, c.z, p.x, p.z), 1.9, dt);
    const onWater = isWater(state.seed, c.x, c.z);
    c.speed = (onWater ? TUNING.crocHuntWaterSpeed : TUNING.crocHuntLandSpeed) + escalation;
    moveForward(c, dt);
    if (state.graceTimer === null && dist(c.x, c.z, p.x, p.z) < TUNING.catchBody) {
      killPlayer(state);
    }
  }
}

function ramPlayer(state) {
  const p = state.player;
  p.mode = 'swim';
  p.speed = 0;
  state.canoe.alive = false; // capsized and drifting — gone
  state.canoe.parked = false;
  state.graceTimer = TUNING.graceSeconds;
  state.graceWhole = TUNING.graceSeconds;
  state.croc.mode = 'circle';
  state.croc.circleAngle = Math.atan2(state.croc.x - p.x, state.croc.z - p.z);
  emit(state, 'ram');
  emit(state, 'swimStart', { seconds: TUNING.graceSeconds });
}

function killPlayer(state, killer = 'croc') {
  state.status = 'dead';
  const g = state.gator;
  const killerPos = killer === 'gator'
    ? { x: g.x, z: g.z, heading: g.heading }
    : { x: state.croc.x, z: state.croc.z, heading: state.croc.heading };
  // The Land of the Dead (Merlin, Nov 16 ~04:17): being eaten
  // arrives there too — additive only, the death record below is
  // untouched. killPlayer is the single death path (both callers —
  // gator and croc — route through it) and the step guards return
  // once status is 'dead', so this fires once per run.
  recordSoulArrival({ kind: 'user', origin: 'swamp-run', diedAt: Date.now() });
  state.death = {
    x: state.player.x,
    z: state.player.z,
    crocX: killerPos.x,
    crocZ: killerPos.z,
    crocHeading: killerPos.heading,
    killer,
    seconds: Math.floor(state.survival),
    distance: Math.floor(state.distance),
    score: currentScore(state),
  };
  emit(state, 'death', { killer });
}

// -------------------------------------------------------------- detection --
function stepDetection(state, dt) {
  const c = state.croc;
  if (c.mode !== 'patrol') return; // already knows — awareness is moot
  const rate = detectionRate(state);
  if (rate > 0) {
    c.awareness = Math.min(1, c.awareness + rate * dt);
  } else {
    c.awareness = Math.max(0, c.awareness - 0.22 * dt);
  }
  if (c.awareness >= 1) {
    c.awareness = 1;
    emit(state, 'spotted');
    if (state.player.mode === 'canoe') {
      c.mode = 'chase';
    } else {
      c.mode = 'hunt'; // caught swimming or sneaking — no grace for that
    }
  }
}

// ------------------------------------------------------------------ main --
export function stepGame(state, dt) {
  if (state.status === 'dead') return;
  state.time += dt;

  if (state.status === 'ready') {
    state.readyTimer -= dt;
    if (state.readyTimer <= 0) {
      state.status = 'playing';
      emit(state, 'start');
    }
    return;
  }

  state.survival += dt;
  stepPlayer(state, dt);
  stepDetection(state, dt);
  stepGator(state, dt);

  // Grace countdown (post-ram): croc circles, ticks each second, and when
  // the count dies, the hunt begins.
  if (state.graceTimer !== null) {
    state.graceTimer -= dt;
    const whole = Math.ceil(state.graceTimer);
    if (whole < state.graceWhole && whole > 0) {
      state.graceWhole = whole;
      emit(state, 'tick', { remaining: whole });
    }
    if (state.graceTimer <= 0) {
      state.graceTimer = null;
      state.graceWhole = null;
      state.croc.mode = 'hunt';
      emit(state, 'graceEnd');
    }
  }

  stepCroc(state, dt);
}
