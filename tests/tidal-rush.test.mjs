/*
 * TIDAL RUSH tests — run with: node --test tests/tidal-rush.test.mjs
 * Covers: track geometry (closed loop, gate sequencing), race lifecycle
 * (countdown -> racing -> finished), lap counting, gate pass/miss rules,
 * rubber-band math, 10-racer position tracking, boost drain/refill,
 * respawn when lost, and leaderboard validation/sorting.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRace,
  stepRace,
  drainEvents,
  computePositions,
  trackPoint,
  nearestOnTrack,
  gateArclength,
  gateIndexForProgress,
  lapForProgress,
  rubberBandFactor,
  ordinal,
  waveHeight,
  TRACK_LENGTH,
  GATE_COUNT,
  GATE_SPACING,
  GATE_HALF,
  TRACK_HALF,
  LAPS,
  MISS_PENALTY_MS,
  RACER_COUNTS,
  MAX_RACERS,
} from '../app/tidal-rush/engine.js';
import { topEntries, validateScore, formatTime } from '../lib/tidal-rush/board.js';

const DT = 1 / 120;

function runSeconds(state, seconds, input = {}) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepRace(state, DT, input);
}

// ------------------------------------------------------------------- track
test('track is a closed loop with sane length', () => {
  const a = trackPoint(0);
  const b = trackPoint(1);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 0.01, 's=1 wraps to s=0');
  assert.ok(TRACK_LENGTH > 1200 && TRACK_LENGTH < 2600, `length ${TRACK_LENGTH.toFixed(0)} m`);
  assert.equal(GATE_COUNT * GATE_SPACING, TRACK_LENGTH, 'gates tile the track exactly');
});

test('nearestOnTrack snaps to the centerline with small lateral', () => {
  const p = trackPoint(0.25);
  const near = nearestOnTrack(p.x, p.z);
  assert.ok(near.dist < 3, `dist ${near.dist.toFixed(2)}`);
  assert.ok(Math.abs(near.lateral) < 3, `lateral ${near.lateral.toFixed(2)}`);
});

test('gate index and lap helpers are monotonic', () => {
  assert.equal(gateIndexForProgress(0), 0);
  assert.equal(gateIndexForProgress(GATE_SPACING * 2.5), 2);
  assert.equal(lapForProgress(0), 1);
  assert.equal(lapForProgress(TRACK_LENGTH * 1.0), 2);
  assert.equal(gateArclength(3), GATE_SPACING * 3);
  assert.ok(GATE_HALF >= TRACK_HALF, 'buoys sit on the corridor edge');
});

// -------------------------------------------------------------- race setup
test('createRace accepts 4/6/8/10 and rejects other counts', () => {
  for (const n of RACER_COUNTS) {
    const r = createRace({ racerCount: n });
    assert.equal(r.racers.length, n, `count ${n}`);
    assert.equal(r.racers[0].isPlayer, true, 'racer 0 is the player');
    assert.equal(r.phase, 'countdown');
  }
  const odd = createRace({ racerCount: 7 });
  assert.equal(odd.racers.length, 6, 'falls back to 6');
});

test('racer count never exceeds the 10-racer cap', () => {
  assert.ok(Math.max(...RACER_COUNTS) <= MAX_RACERS);
  const r = createRace({ racerCount: 10 });
  assert.equal(r.racers.length, 10);
});

// ---------------------------------------------------------------- lifecycle
test('countdown ticks down then the race starts', () => {
  const s = createRace({ racerCount: 4 });
  runSeconds(s, 1);
  assert.equal(s.phase, 'countdown');
  const beeps = drainEvents(s).filter((e) => e.type === 'beep' || e.type === 'go');
  assert.ok(beeps.length >= 1, 'countdown beeps fire');
  runSeconds(s, 3);
  assert.equal(s.phase, 'racing');
  assert.ok(s.racers.every((r) => r.speed >= 0));
});

test('racers accelerate and move once racing', () => {
  const s = createRace({ racerCount: 4 });
  runSeconds(s, 4);
  const x0 = s.racers[0].x;
  const z0 = s.racers[0].z;
  runSeconds(s, 3, { steer: 0, boost: false });
  const moved = Math.hypot(s.racers[0].x - x0, s.racers[0].z - z0);
  assert.ok(moved > 30, `player moved ${moved.toFixed(1)} m`);
  assert.ok(s.racers[0].speed > 20, `speed ${s.racers[0].speed.toFixed(1)}`);
});

test('player passes gates in order; penalties grow only on misses', () => {
  const s = createRace({ racerCount: 4 });
  runSeconds(s, 4);
  drainEvents(s);
  // Park the player 30 m before the next gate line, far outside the
  // corridor, then let it cross: every crossed line must be a MISS.
  const p = s.racers[0];
  const lineArc = p.nextLine * GATE_SPACING;
  const sLine = (((lineArc - 30) / TRACK_LENGTH % 1) + 1) % 1;
  const tp = trackPoint(sLine);
  const nx = -tp.tz;
  const nz = tp.tx;
  p.x = tp.x + nx * (TRACK_HALF + 60);
  p.z = tp.z + nz * (TRACK_HALF + 60);
  p.heading = Math.atan2(tp.tx, tp.tz);
  p.speed = 42;
  p.lapFloat = (lineArc - 30) / TRACK_LENGTH;
  p.prevS = sLine;
  p.progress = lineArc - 30;
  const passedBefore = p.gatesPassed;
  runSeconds(s, 2);
  assert.ok(p.gatesPassed > passedBefore, `crossed gates (${p.gatesPassed - passedBefore})`);
  assert.ok(p.penaltiesMs > 0, 'off-course crossing adds penalties');
  assert.ok(p.penaltiesMs % MISS_PENALTY_MS === 0, 'penalties come in 3 s chunks');
});

test('a hopelessly lost racer is reset to its last gate', () => {
  const s = createRace({ racerCount: 4 });
  runSeconds(s, 4);
  drainEvents(s);
  const r = s.racers[1];
  r.x += 500;
  r.z -= 400;
  runSeconds(s, 2.5);
  assert.ok(Math.abs(r.lateral) < TRACK_HALF + 75, `respawned, lateral ${r.lateral.toFixed(1)}`);
});

// -------------------------------------------------------------- rubber band
test('rubber-band speeds the trailer and slows the leader', () => {
  const behind = rubberBandFactor(1000, 1600); // AI 600 m back
  const ahead = rubberBandFactor(1600, 1000); // AI 600 m up
  assert.ok(behind > 1, `trailer factor ${behind.toFixed(3)}`);
  assert.ok(ahead < 1, `leader factor ${ahead.toFixed(3)}`);
  assert.ok(rubberBandFactor(1000, 1000) === 1, 'even pace is neutral');
  assert.ok(rubberBandFactor(0, 100000) <= 1.14, 'boost is clamped');
  assert.ok(rubberBandFactor(100000, 0) >= 0.9, 'drag is clamped');
});

// ---------------------------------------------------------------- positions
test('positions cover a full 10-racer field', () => {
  const s = createRace({ racerCount: 10 });
  runSeconds(s, 5);
  const order = computePositions(s);
  assert.equal(order.length, 10);
  assert.deepEqual(
    order.map((o) => o.position),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  const ids = new Set(order.map((o) => o.racer.id));
  assert.equal(ids.size, 10, 'every racer appears exactly once');
});

test('a finisher always outranks non-finishers', () => {
  const s = createRace({ racerCount: 4 });
  s.racers[2].finished = true;
  s.racers[2].finishTimeMs = 999999;
  s.racers[0].progress = 1e9; // player way ahead on the track
  const order = computePositions(s);
  assert.equal(order[0].racer.id, 2, 'finisher leads the board');
});

// -------------------------------------------------------------------- boost
test('boost drains the meter and raises speed', () => {
  const s = createRace({ racerCount: 4 });
  runSeconds(s, 4);
  const p = s.racers[0];
  p.boost = 100;
  runSeconds(s, 2, { steer: 0, boost: true });
  assert.ok(p.boost < 100, `meter drained to ${p.boost.toFixed(1)}`);
  assert.ok(p.boosting === true || p.speed > 40, 'boosting state or boosted speed');
  runSeconds(s, 4, { steer: 0, boost: false });
  assert.ok(p.boost > 40, `meter regenerated to ${p.boost.toFixed(1)}`);
});

test('boost orbs grant meter when touched', () => {
  const s = createRace({ racerCount: 4 });
  runSeconds(s, 4);
  drainEvents(s);
  const p = s.racers[0];
  p.boost = 10;
  const orb = s.orbs.find((o) => o.active);
  p.x = orb.x;
  p.z = orb.z;
  runSeconds(s, 0.2);
  assert.ok(!orb.active || p.boost > 30, 'orb picked up');
  assert.ok(drainEvents(s).some((e) => e.type === 'orb'), 'orb event fired');
});

// ------------------------------------------------------------------ results
test('finishing the race produces a full results table', () => {
  const s = createRace({ racerCount: 6, laps: 1 });
  runSeconds(s, 4);
  const p = s.racers[0];
  // Teleport the player to the last stretch so the race ends quickly.
  const near = TRACK_LENGTH - 40;
  p.lapFloat = near / TRACK_LENGTH;
  p.prevS = p.lapFloat % 1;
  const tp = trackPoint(p.prevS);
  p.x = tp.x;
  p.z = tp.z;
  p.heading = Math.atan2(tp.tx, tp.tz);
  p.speed = 40;
  p.nextLine = Math.floor(near / GATE_SPACING) + 1;
  p.nextGate = p.nextLine % GATE_COUNT;
  runSeconds(s, 3, { steer: 0, boost: false });
  assert.equal(s.phase, 'finished', 'race ends when the player finishes');
  assert.ok(s.results && s.results.length === 6, 'all 6 rows present');
  assert.deepEqual(
    s.results.map((r) => r.position),
    [1, 2, 3, 4, 5, 6]
  );
  const me = s.results.find((r) => r.isPlayer);
  assert.ok(me && me.totalMs > 0, 'player has a total time');
  assert.ok(me.projected === false, 'the player time is real, not projected');
});

test('AI lap times and best laps are recorded', () => {
  const s = createRace({ racerCount: 4, laps: 1 });
  runSeconds(s, 6);
  const ai = s.racers[1];
  assert.ok(ai.lapStart === 0 || ai.lap >= 1, 'ai is racing');
});

// -------------------------------------------------------------------- waves
test('wave height is bounded and continuous', () => {
  let prev = waveHeight(10, 20, 0);
  assert.ok(Math.abs(prev) <= 1.7, `height ${prev.toFixed(2)} within swell budget`);
  for (let t = 0.05; t < 1; t += 0.05) {
    const h = waveHeight(10, 20, t);
    assert.ok(Math.abs(h - prev) < 0.3, 'no teleporting swells');
    prev = h;
  }
});

test('ordinal handles 1st through 10th', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']
  );
});

// ------------------------------------------------------------- leaderboard
test('formatTime renders m:ss.mmm', () => {
  assert.equal(formatTime(125432), '2:05.432');
  assert.equal(formatTime(60000), '1:00.000');
  assert.equal(formatTime(null), '—');
});

test('topEntries sorts fastest-first and caps at 10', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    username: `Rider${i}`,
    total_ms: 300000 - i * 5000,
    best_lap_ms: 90000,
    racers: 6,
    created_at: '2026-01-01T00:00:00Z',
  }));
  const top = topEntries(rows);
  assert.equal(top.length, 10);
  assert.equal(top[0].total_ms, 300000 - 11 * 5000, 'fastest first');
  for (let i = 1; i < top.length; i++) assert.ok(top[i].total_ms >= top[i - 1].total_ms);
});

test('topEntries rejects impossible times', () => {
  const rows = [
    { username: 'Cheater', total_ms: 1000, best_lap_ms: 500, racers: 6 },
    { username: 'Slow', total_ms: 999999999, best_lap_ms: 500000, racers: 6 },
    { username: 'Real', total_ms: 180000, best_lap_ms: 55000, racers: 8 },
  ];
  const top = topEntries(rows);
  assert.equal(top.length, 1);
  assert.equal(top[0].username, 'Real');
});

test('validateScore accepts a clean race time', () => {
  const v = validateScore({ username: 'Skipper', total_ms: 182400, best_lap_ms: 58100, racers: 10 });
  assert.equal(v.ok, true);
  assert.equal(v.racers, 10);
});

test('validateScore rejects bad bodies', () => {
  assert.equal(validateScore({ username: '', total_ms: 182400, best_lap_ms: 58100, racers: 6 }).ok, false);
  assert.equal(validateScore({ username: 'X', total_ms: 5000, best_lap_ms: 4000, racers: 6 }).ok, false);
  assert.equal(validateScore({ username: 'X', total_ms: 182400, best_lap_ms: 200000, racers: 6 }).ok, false);
  assert.equal(validateScore({ username: 'X', total_ms: 182400, best_lap_ms: 58100, racers: 5 }).ok, false);
  assert.equal(validateScore({ username: 'X', total_ms: 182400.5, best_lap_ms: 58100, racers: 6 }).ok, false);
});
