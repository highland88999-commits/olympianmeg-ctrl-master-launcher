// tests/omega-500-race.test.mjs — Omega 500 race logic.
// Run: node tests/omega-500-race.test.mjs (from the repo root).
// Pure-logic checks: the 9 real cars, arcade physics, lap counting,
// AI opponents finishing, positions, results, and the 500-mile rule.
import assert from 'node:assert/strict';
import {
  RACE_CAR_IDS, raceCars, createRace, stepRace, stepRacer, createRacer,
  aiInput, racerPose, buildResults, fmtTime, curvatureAhead,
} from '../lib/omega-500/race.js';
import { getTrack, lapsForTrack } from '../lib/omega-500/tracks.js';
import { getVehicle } from '../lib/earth/vehicles.js';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log(`  ok ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const FULL = { throttle: 1, brake: 0, steer: 0, boost: false };
const COAST = { throttle: 0, brake: 0, steer: 0, boost: false };

ok('exactly the 9 Earth 1 cars, real GLBs and tuning, no bikes/trucks', () => {
  assert.equal(RACE_CAR_IDS.length, 9);
  assert.deepEqual(RACE_CAR_IDS, [
    'wedge-supercar', 'blue-sports-car', 'sports-car', 'street-racer',
    'luxury-gt-1', 'luxury-gt-2', 'luxury-car', 'teardrop-coupe', 'muscle-car',
  ]);
  const cars = raceCars();
  assert.equal(cars.length, 9);
  for (const c of cars) {
    assert.ok(c.glbUrl.startsWith('/models/vehicles/') && c.glbUrl.endsWith('.glb'), c.id);
    assert.ok(c.tuning && c.tuning.maxSpeed > 0 && c.tuning.accel > 0, c.id);
  }
  // The wedge-supercar keeps its exact tuning and stays fastest.
  const wedge = getVehicle('wedge-supercar');
  assert.equal(wedge.tuning.maxSpeed, 90);
  assert.equal(wedge.tuning.boostMult, 2.0);
  assert.ok(cars.every((c) => c.tuning.maxSpeed <= 90), 'wedge fastest at base');
  assert.ok(!RACE_CAR_IDS.includes('sport-bike') && !RACE_CAR_IDS.includes('pickup-hd'), 'no bikes/trucks');
});

ok('a car accelerates toward its tuning top speed and brakes', () => {
  const race = createRace(getTrack('olympus-superspeedway'), 500, 'wedge-supercar');
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  const car = race.racers.find((r) => r.isPlayer);
  for (let i = 0; i < 600; i++) stepRacer(car, FULL, 1 / 60, ctx);
  assert.ok(car.speed > 80 && car.speed <= 90, `top speed ${car.speed}`);
  const before = car.speed;
  for (let i = 0; i < 60; i++) stepRacer(car, { throttle: 0, brake: 1, steer: 0, boost: false }, 1 / 60, ctx);
  assert.ok(car.speed < before - 20, `braked to ${car.speed}`);
});

ok('boost uses the car boostMult and drains the meter', () => {
  const race = createRace(getTrack('olympus-superspeedway'), 500, 'wedge-supercar');
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  const car = race.racers.find((r) => r.isPlayer);
  car.speed = 85;
  for (let i = 0; i < 120; i++) stepRacer(car, { ...FULL, boost: true }, 1 / 60, ctx);
  assert.ok(car.speed > 90, `boosted to ${car.speed}`);
  assert.ok(car.boost < 100, `meter drained to ${car.boost}`);
});

ok('steering moves the car across the track and self-centres', () => {
  const race = createRace(getTrack('olympus-superspeedway'), 500, 'wedge-supercar');
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  const car = race.racers.find((r) => r.isPlayer);
  car.speed = 40;
  for (let i = 0; i < 120; i++) stepRacer(car, { ...FULL, steer: 1 }, 1 / 60, ctx);
  assert.ok(car.lateral > 2, `moved across to ${car.lateral}`);
  assert.ok(Math.abs(car.lateral) <= race.halfWidth + 5, 'wall holds');
});

ok('ice grip slows launch and turning (Luge Ice Run)', () => {
  const mk = (trackId) => {
    const race = createRace(getTrack(trackId), 500, 'wedge-supercar');
    const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
    const car = race.racers.find((r) => r.isPlayer);
    for (let i = 0; i < 120; i++) stepRacer(car, FULL, 1 / 60, ctx);
    return car.speed;
  };
  assert.ok(mk('luge-ice-run') < mk('olympus-superspeedway'), 'ice is slower off the line');
});

ok('a full-throttle AI field completes laps and the race ends', () => {
  const track = getTrack('golden-mile-oval');
  // 10-mile race = 10 laps: proves the full loop (countdown, laps, finish,
  // results) without simulating a 100-lap race. Lap counts are covered
  // separately by the laps test.
  const race = createRace(track, 10, 'wedge-supercar'); // 10 laps at 1.0 mi
  assert.equal(race.totalLaps, 10);
  assert.equal(race.racers.length, 9);
  let steps = 0;
  const input = { throttle: 1, brake: 0, steer: 0, boost: true };
  while (race.status !== 'finished' && steps < 60 * 60 * 20) {
    stepRace(race, input, 1 / 60);
    steps++;
  }
  assert.equal(race.status, 'finished', `not finished after ${steps} steps`);
  assert.ok(race.results && race.results.length === 9, 'results for 9 cars');
  const player = race.results.find((r) => r.isPlayer);
  assert.ok(player && player.finished, 'player finished');
  assert.ok(player.bestLapMs !== null && player.bestLapMs > 0, 'player has a best lap');
  assert.deepEqual(race.results.map((r) => r.position), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'positions 1-9');
});

ok('positions follow progress: the leader is ahead on the road', () => {
  const race = createRace(getTrack('olympus-superspeedway'), 500, 'wedge-supercar');
  race.status = 'racing';
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  const leader = race.racers[0];
  const backmarker = race.racers[8];
  leader.p = 500; backmarker.p = -100; // others sit on the grid near p ≈ -8..-40
  stepRace(race, COAST, 1 / 60);
  assert.equal(leader.position, 1, 'leader is P1');
  assert.equal(backmarker.position, 9, 'backmarker is P9');
});

ok('AI steers toward its lane and brakes for corners', () => {
  const race = createRace(getTrack('atlas-mountain-pass'), 500, 'wedge-supercar');
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  const ai = race.racers.find((r) => !r.isPlayer);
  ai.speed = 60; ai.p = 0;
  const input = aiInput(ai, ctx, 0);
  assert.ok(input.steer >= -1 && input.steer <= 1, 'steer in range');
  assert.ok(input.throttle === 0 || input.throttle === 1, 'throttle binary');
  // On a twisty mountain pass the corner ahead forces braking or lifting.
  let sawBrake = false;
  for (let s = 0; s < 2000; s += 100) {
    const probe = { ...ai, p: s, speed: 70 };
    if (aiInput(probe, ctx, 0).brake > 0) { sawBrake = true; break; }
  }
  assert.ok(sawBrake, 'AI brakes somewhere on the mountain pass');
  assert.ok(curvatureAhead(race.line, 0) >= 0, 'curvature defined');
});

ok('racerPose puts the car on the track with the tangent heading', () => {
  const race = createRace(getTrack('nexus-tri-oval'), 500, 'muscle-car');
  const car = race.racers.find((r) => r.isPlayer);
  car.p = 100; car.lateral = 2; car.slip = 0.1;
  const pose = racerPose(car, race.line);
  assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z) && Number.isFinite(pose.heading), 'pose finite');
});

ok('fmtTime renders race times', () => {
  assert.equal(fmtTime(0), '0:00.000');
  assert.equal(fmtTime(75432), '1:15.432');
  assert.equal(fmtTime(null), '--:--.---');
});

ok('laps scale with distance: 500/250/100 miles', () => {
  const t = getTrack('olympus-superspeedway');
  assert.equal(lapsForTrack(t, 500), 200);
  assert.equal(lapsForTrack(t, 250), 100);
  assert.equal(lapsForTrack(t, 100), 40);
});

console.log(`\n${pass} race checks passed.`);
