// lib/omega-500/race.js — Omega 500 race logic (pure — safe in node tests).
//
// Model: every car rides the track's centerline spline. A car holds
//   p — progress in metres from the start/finish line (negative on the grid),
//   lateral — metres across the track (0 = centerline),
//   slip — heading relative to the track tangent (radians),
//   speed — m/s.
// The car's world position is centerline(p) + lateral * normal, and its
// heading is tangent(p) + slip. Steering changes slip; slip moves the car
// across the track; speed moves it along it. The car can never leave the
// ribbon, spin out, or get lost — the model is arcade-tight by design.
//
// Speed/accel/turn/brake/boost numbers come straight from each car's
// Earth 1 tuning in lib/earth/vehicles.js — the wedge-supercar keeps its
// exact 90 base x 2.0 boost and stays Earth's fastest. Surface grip
// scales accel and turn (ice = 0.7).

import { buildCenterline, sampleAt, lapsForTrack } from './tracks.js';
import { getVehicle } from '../earth/vehicles.js';

/** The 9 race cars — Earth 1 cars only. Bikes, trucks, rovers, skiff and
 *  hauler are NOT race cars and are deliberately excluded. */
export const RACE_CAR_IDS = [
  'wedge-supercar',
  'blue-sports-car',
  'sports-car',
  'street-racer',
  'luxury-gt-1',
  'luxury-gt-2',
  'luxury-car',
  'teardrop-coupe',
  'muscle-car',
];

/** The 9 race cars with their real Earth 1 records (GLB + tuning). */
export function raceCars() {
  return RACE_CAR_IDS.map((id) => getVehicle(id)).filter(Boolean);
}

export const MS_TO_MPH = 2.23694;
export const MAX_SLIP = 0.6; // radians — the car can point at most ~34° off tangent
export const WALL_RESTITUTION = 0.55; // bounce off the barricade keeps 55% of the outward speed

/** Deterministic pseudo-random from a seed (AI variety without Math.random). */
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

/** One racer's state. skill 0..1 (AI only — the player is always 1.0). */
export function createRacer(vehicle, opts = {}) {
  return {
    vehicle,
    isPlayer: !!opts.isPlayer,
    skill: opts.skill ?? 1,
    lane: opts.lane ?? 0, // preferred lateral offset (m)
    phase: opts.phase ?? 0, // weave phase
    p: opts.p ?? 0,
    lateral: opts.lateral ?? 0,
    slip: 0,
    speed: 0,
    boost: 100, // boost meter 0..100
    lap: 0, // 0 = still on the grid / before the line
    lapStartMs: 0,
    lastLapMs: null,
    bestLapMs: null,
    finished: false,
    finishMs: null,
    position: 0,
  };
}

/** Curvature (1/m) of the centerline a little ahead of p. */
export function curvatureAhead(line, p, aheadM = 25) {
  const a1 = sampleAt(line, p).angle;
  const a2 = sampleAt(line, p + aheadM).angle;
  let d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) / aheadM;
}

/** Step one car one frame. input: { throttle 0..1, brake 0..1, steer -1..1, boost bool }. */
export function stepRacer(racer, input, dt, ctx) {
  const { line, halfWidth, grip } = ctx;
  const t = racer.vehicle.tuning;
  const offTrack = Math.abs(racer.lateral) > halfWidth; // the wall below keeps cars on the ribbon, so this never trips in normal racing — it stays as a safety net
  const gripNow = grip * (offTrack ? 0.5 : 1);
  const maxSpeed = t.maxSpeed * (input.boost && racer.boost > 0 ? t.boostMult : 1);
  // Boost meter: drains while boosting, refills otherwise.
  if (input.boost && racer.speed > 5) racer.boost = Math.max(0, racer.boost - 40 * dt);
  else racer.boost = Math.min(100, racer.boost + 12 * dt);
  // Speed: approaches maxSpeed asymptotically under throttle.
  if (input.throttle > 0) {
    const accel = t.accel * gripNow * input.throttle;
    racer.speed += accel * (1 - Math.max(0, racer.speed) / maxSpeed) * dt;
  } else {
    racer.speed -= 2 * dt; // coast drag
  }
  if (input.brake > 0) racer.speed -= t.brakeRate * input.brake * dt;
  if (offTrack) racer.speed -= racer.speed * 0.8 * dt; // scrubbing off-track
  racer.speed = Math.max(0, Math.min(maxSpeed, racer.speed));
  // Steering: slip follows the wheel, self-centres when released.
  const speedFactor = Math.min(1, racer.speed / 12);
  if (input.steer !== 0) {
    racer.slip += input.steer * t.turnRate * gripNow * speedFactor * dt;
  } else {
    racer.slip -= racer.slip * Math.min(1, 1.5 * dt);
  }
  racer.slip = Math.max(-MAX_SLIP, Math.min(MAX_SLIP, racer.slip));
  // Move: forward along the tangent, sideways across the track.
  racer.p += Math.cos(racer.slip) * racer.speed * dt;
  racer.lateral += Math.sin(racer.slip) * racer.speed * dt;
  // Wall: the ribbon edge is a solid barricade (see the wall meshes in
  // RaceScene / CheckerScene). A car that reaches it is pushed back to
  // the wall face and its outward velocity reflects with restitution
  // 0.55 — the shadow-realm resolveBarrier pattern: the tangential
  // component is kept, so a graze keeps your speed. No pass-through.
  if (racer.lateral > halfWidth || racer.lateral < -halfWidth) {
    const side = racer.lateral > 0 ? 1 : -1;
    racer.lateral = side * halfWidth;
    const vLat = Math.sin(racer.slip) * racer.speed;
    if (vLat * side > 0) { // still moving outward — reflect it
      const vFwd = Math.cos(racer.slip) * racer.speed;
      const vLatOut = -WALL_RESTITUTION * vLat;
      racer.speed = Math.hypot(vFwd, vLatOut);
      racer.slip = Math.atan2(vLatOut, vFwd);
    }
  }
  return racer;
}

/** AI input for one frame: follow the racing line, brake for corners. */
export function aiInput(racer, ctx, raceMs) {
  const { line } = ctx;
  const t = racer.vehicle.tuning;
  const ahead = curvatureAhead(line, racer.p, 30);
  const cornerSpeed = Math.sqrt(28 / Math.max(ahead, 0.0004));
  const target = Math.min(t.maxSpeed * racer.skill, cornerSpeed);
  // Desired lateral: the AI's lane, weaving gently so they don't convoy.
  const desired = racer.lane + 1.5 * Math.sin(racer.p * 0.01 + racer.phase);
  const slipTarget = Math.atan2(desired - racer.lateral, 20);
  const steer = Math.max(-1, Math.min(1, (slipTarget - racer.slip) * 2));
  const throttle = racer.speed < target ? 1 : 0;
  const brake = racer.speed > target * 1.05 ? 0.8 : 0;
  const boost = ahead < 0.002 && racer.boost > 50 && racer.speed > t.maxSpeed * 0.7;
  return { throttle, brake, steer, boost };
}

/** World position + heading for rendering a racer. */
export function racerPose(racer, line) {
  const p = sampleAt(line, racer.p);
  const x = p.x + -p.tz * racer.lateral;
  const z = p.z + p.tx * racer.lateral;
  return { x, z, heading: p.angle + racer.slip };
}

// ---------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------

/** Create a race: track + distance + the player's car id. 9 cars on the grid. */
export function createRace(track, distanceMiles, playerCarId) {
  const line = buildCenterline(track);
  const totalLaps = lapsForTrack(track, distanceMiles);
  const cars = raceCars();
  const rand = mulberry32(20261109);
  // Grid: player starts 9th (last), AI ahead in staggered rows.
  const order = cars.filter((c) => c.id !== playerCarId);
  order.push(cars.find((c) => c.id === playerCarId));
  const racers = order.map((vehicle, i) => {
    const isPlayer = vehicle.id === playerCarId;
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    return createRacer(vehicle, {
      isPlayer,
      skill: isPlayer ? 1 : 0.86 + rand() * 0.11,
      lane: (rand() - 0.5) * 6,
      phase: rand() * Math.PI * 2,
      p: -8 - row * 8,
      lateral: side * 3,
    });
  });
  const race = {
    track,
    line,
    distanceMiles,
    totalLaps,
    halfWidth: track.widthM / 2,
    grip: track.grip,
    racers,
    status: 'countdown', // countdown -> racing -> finished
    countdownMs: 3000,
    raceMs: 0,
    results: null,
  };
  updatePositions(race); // grid order: player starts 9th
  return race;
}

function updatePositions(race) {
  const sorted = [...race.racers].sort((a, b) => {
    if (a.finished && b.finished) return a.finishMs - b.finishMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.p - a.p;
  });
  sorted.forEach((r, i) => { r.position = i + 1; });
  return sorted;
}

function noteLap(racer, race) {
  const lap = Math.floor(racer.p / race.line.totalM) + 1;
  if (lap > racer.lap) {
    const now = race.raceMs;
    if (racer.lap >= 1) {
      const lapMs = now - racer.lapStartMs;
      racer.lastLapMs = lapMs;
      if (racer.bestLapMs === null || lapMs < racer.bestLapMs) racer.bestLapMs = lapMs;
    }
    racer.lap = lap;
    racer.lapStartMs = now;
    if (lap > race.totalLaps && !racer.finished) {
      racer.finished = true;
      racer.finishMs = now;
    }
  }
}

/**
 * Step the whole race one frame. playerInput: { throttle, brake, steer, boost }.
 * Returns the race (mutated).
 */
export function stepRace(race, playerInput, dt) {
  if (race.status === 'finished') return race;
  if (race.status === 'countdown') {
    race.countdownMs -= dt * 1000;
    if (race.countdownMs <= 0) race.status = 'racing';
    return race;
  }
  race.raceMs += dt * 1000;
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  for (const racer of race.racers) {
    if (racer.finished) continue;
    const input = racer.isPlayer ? playerInput : aiInput(racer, ctx, race.raceMs);
    stepRacer(racer, input, dt, ctx);
    noteLap(racer, race);
  }
  updatePositions(race);
  const player = race.racers.find((r) => r.isPlayer);
  if (player.finished) {
    race.status = 'finished';
    race.results = buildResults(race);
  }
  return race;
}

/** Finishing order + gaps, for the results screen. */
export function buildResults(race) {
  const sorted = updatePositions(race);
  return sorted.map((r) => {
    const lapsDone = Math.min(r.lap, race.totalLaps);
    let gap;
    if (r.finished) gap = r.finishMs;
    else gap = `+${race.totalLaps - lapsDone} lap${race.totalLaps - lapsDone === 1 ? '' : 's'}`;
    return {
      position: r.position,
      carId: r.vehicle.id,
      name: r.vehicle.name,
      isPlayer: r.isPlayer,
      finished: r.finished,
      finishMs: r.finishMs,
      gap,
      bestLapMs: r.bestLapMs,
      lapsDone,
    };
  });
}

/** Format milliseconds as M:SS.mmm for timing displays. */
export function fmtTime(ms) {
  if (ms === null || ms === undefined) return '--:--.---';
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const mm = total % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}
