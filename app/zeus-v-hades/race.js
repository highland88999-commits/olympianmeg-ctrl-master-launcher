'use strict';

// Pure game logic for Zeus vs Hades: Neon Soul Race.
// A 3-lane neon lane racer: dodge underworld obstacles, collect souls to
// charge a lightning boost, and beat Hades (rubber-banding AI) to the finish.
// No DOM, no canvas — fully unit-testable.

export const LANES = 3;
export const RACE_DISTANCE = 3000; // meters
export const BOOST_DURATION = 3.0; // seconds
export const BOOST_MULTIPLIER = 1.8;
export const HIT_SLOW_DURATION = 1.0;
export const HIT_INVULN_DURATION = 1.4;
export const SPAWN_AHEAD = 340; // meters ahead of the player kept populated
export const COLLIDE_RANGE = 9; // meters
export const PICKUP_RANGE = 10; // meters
export const RIVAL_GIVE_UP_GAP = 500; // meters behind -> race called for Hades

export const DIFFICULTIES = {
  gates: {
    key: 'gates',
    label: 'Gates of the Underworld',
    baseSpeed: 58,
    obstacleGap: 62,
    doubleChance: 0.25,
    rivalPace: 0.93,
  },
  styx: {
    key: 'styx',
    label: 'River Styx',
    baseSpeed: 68,
    obstacleGap: 48,
    doubleChance: 0.4,
    rivalPace: 1.0,
  },
  tartarus: {
    key: 'tartarus',
    label: 'Tartarus',
    baseSpeed: 80,
    obstacleGap: 38,
    doubleChance: 0.55,
    rivalPace: 1.07,
  },
};

const OBSTACLE_KINDS = ['pillar', 'spire', 'ember'];

// Deterministic RNG so races (and tests) are reproducible from a seed.
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

export function createRace(seed, difficultyKey = 'styx') {
  const difficulty = DIFFICULTIES[difficultyKey] || DIFFICULTIES.styx;
  return {
    seed: seed >>> 0,
    difficulty,
    status: 'countdown', // countdown | racing | finished
    time: 0,
    player: {
      lane: 1,
      speed: 0,
      distance: 0,
      souls: 0,
      boostMeter: 0, // 0..100
      boostTime: 0,
      slowTime: 0,
      invulnTime: 0,
      finished: false,
      finishTime: null,
    },
    rival: {
      distance: 0,
      speed: 0,
      finished: false,
      finishTime: null,
    },
    obstacles: [], // { id, lane, s, kind }
    pickups: [], // { id, lane, s, kind: 'soul' | 'bolt' }
    nextSpawnAt: 140,
    nextId: 1,
    result: null, // 'win' | 'lose'
    events: [], // drained by the UI each frame: 'hit' | 'soul' | 'bolt' | 'boostReady' | 'boost'
    rng: mulberry32(seed >>> 0),
  };
}

function shuffledLanes(rng) {
  const lanes = [0, 1, 2];
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}

// Spawn one obstacle row plus pickups. Never blocks all 3 lanes at one
// position, so every row is dodgeable.
function spawnRow(race) {
  const { rng, difficulty } = race;
  const s = race.nextSpawnAt;
  const lanes = shuffledLanes(rng);
  const blockCount = rng() < difficulty.doubleChance ? 2 : 1;
  const blocked = lanes.slice(0, blockCount);
  const free = lanes.slice(blockCount);

  blocked.forEach((lane, i) => {
    race.obstacles.push({
      id: race.nextId++,
      lane,
      s: s + i * 4, // slight stagger so doubles read clearly
      kind: OBSTACLE_KINDS[Math.floor(rng() * OBSTACLE_KINDS.length)],
    });
  });

  // Soul runs or a lightning bolt in a free lane, between obstacle rows.
  const lane = free[Math.floor(rng() * free.length)];
  if (rng() < 0.14) {
    race.pickups.push({ id: race.nextId++, lane, s: s + difficulty.obstacleGap / 2, kind: 'bolt' });
  } else {
    for (let k = 0; k < 3; k++) {
      race.pickups.push({ id: race.nextId++, lane, s: s + difficulty.obstacleGap / 2 + k * 14, kind: 'soul' });
    }
  }

  race.nextSpawnAt = s + difficulty.obstacleGap * (0.85 + rng() * 0.3);
}

export function movePlayer(race, dir) {
  const p = race.player;
  const next = Math.max(0, Math.min(LANES - 1, p.lane + dir));
  const changed = next !== p.lane;
  p.lane = next;
  return changed;
}

export function boostReady(race) {
  return race.player.boostMeter >= 100 && race.player.boostTime <= 0;
}

export function activateBoost(race) {
  const p = race.player;
  if (race.status !== 'racing' || !boostReady(race)) return false;
  p.boostMeter = 0;
  p.boostTime = BOOST_DURATION;
  p.invulnTime = Math.max(p.invulnTime, BOOST_DURATION);
  race.events.push('boost');
  return true;
}

function collectPickup(race, pickup) {
  const p = race.player;
  const wasReady = p.boostMeter >= 100;
  if (pickup.kind === 'soul') {
    p.souls += 1;
    p.boostMeter = Math.min(100, p.boostMeter + 20);
    race.events.push('soul');
  } else {
    p.souls += 2;
    p.boostMeter = Math.min(100, p.boostMeter + 40);
    race.events.push('bolt');
  }
  if (!wasReady && p.boostMeter >= 100) race.events.push('boostReady');
}

function hitObstacle(race, obstacle) {
  const p = race.player;
  obstacle.hit = true;
  p.slowTime = HIT_SLOW_DURATION;
  p.invulnTime = HIT_INVULN_DURATION;
  race.events.push('hit');
}

export function updateRace(race, dt) {
  if (race.status !== 'racing') return;
  dt = Math.min(Math.max(dt, 0), 0.05);

  const p = race.player;
  const r = race.rival;
  const d = race.difficulty;
  race.time += dt;

  if (p.boostTime > 0) p.boostTime -= dt;
  if (p.slowTime > 0) p.slowTime -= dt;
  if (p.invulnTime > 0) p.invulnTime -= dt;

  const boosting = p.boostTime > 0;
  let target = d.baseSpeed;
  if (boosting) target *= BOOST_MULTIPLIER;
  if (p.slowTime > 0) target *= 0.45;
  p.speed += (target - p.speed) * Math.min(1, dt * 4);
  p.distance += p.speed * dt;

  // Hades rubber-bands: presses when behind, eases when ahead.
  const baseRival = d.baseSpeed * d.rivalPace;
  const gap = p.distance - r.distance;
  const band = 1 + Math.max(-0.2, Math.min(0.3, gap / 600));
  r.speed = baseRival * band;
  r.distance += r.speed * dt;

  while (race.nextSpawnAt < p.distance + SPAWN_AHEAD) spawnRow(race);

  const vulnerable = p.invulnTime <= 0 && !boosting;
  for (const o of race.obstacles) {
    if (!o.hit && o.lane === p.lane && Math.abs(o.s - p.distance) < COLLIDE_RANGE && vulnerable) {
      hitObstacle(race, o);
      break; // one hit per frame is plenty
    }
  }
  for (const pk of race.pickups) {
    if (!pk.taken && pk.lane === p.lane && Math.abs(pk.s - p.distance) < PICKUP_RANGE) {
      pk.taken = true;
      collectPickup(race, pk);
    }
  }

  const cull = p.distance - 40;
  race.obstacles = race.obstacles.filter((o) => o.s > cull && !o.hit);
  race.pickups = race.pickups.filter((pk) => pk.s > cull && !pk.taken);

  // Finishes.
  if (!r.finished && r.distance >= RACE_DISTANCE) {
    r.finished = true;
    r.finishTime = race.time;
  }
  if (!p.finished && p.distance >= RACE_DISTANCE) {
    p.finished = true;
    p.finishTime = race.time;
  }

  if (p.finished && r.finished) {
    race.status = 'finished';
    race.result = p.finishTime <= r.finishTime ? 'win' : 'lose';
  } else if (p.finished) {
    race.status = 'finished';
    race.result = 'win';
  } else if (r.finished && RACE_DISTANCE - p.distance > RIVAL_GIVE_UP_GAP) {
    // Hades is long gone; call it.
    race.status = 'finished';
    race.result = 'lose';
  }
}

// 1 while ahead of Hades, 2 while behind.
export function playerPosition(race) {
  return race.player.distance >= race.rival.distance ? 1 : 2;
}

export function rivalBaseSpeed(difficultyKey) {
  const d = DIFFICULTIES[difficultyKey] || DIFFICULTIES.styx;
  return d.baseSpeed * d.rivalPace;
}

export function formatTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
