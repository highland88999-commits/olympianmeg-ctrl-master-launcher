// tests/omega-500-tracks.test.mjs — Omega 500 track data.
// Run: node tests/omega-500-tracks.test.mjs (from the repo root).
// Pure data + geometry checks: 20 tracks, lap rule, closed centerlines
// at the stated lengths, no duplicate ids, no real-world branding.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRACKS, listTracks, getTrack, lapsForTrack, buildCenterline, sampleAt, MILES_TO_M,
  RACE_DISTANCES,
} from '../lib/omega-500/tracks.js';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log(`  ok ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n    ${e.message}`); process.exitCode = 1; }
}

ok('exactly 20 tracks', () => {
  assert.equal(TRACKS.length, 20);
  assert.equal(listTracks().length, 20);
});

ok('track ids are unique', () => {
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, 20);
});

ok('every track has name, type, length, turns, surface and shape', () => {
  for (const t of TRACKS) {
    assert.ok(t.name && t.name.length > 3, t.id);
    assert.ok(['speedway', 'road', 'street', 'themed'].includes(t.type), t.id);
    assert.ok(t.lengthMiles >= 1 && t.lengthMiles <= 5, `${t.id} length`);
    assert.ok(Number.isInteger(t.turns) && t.turns >= 4, `${t.id} turns`);
    assert.ok(t.widthM >= 10 && t.widthM <= 15, `${t.id} width`);
    assert.ok(t.grip > 0.5 && t.grip <= 1, `${t.id} grip`);
    assert.ok(t.shape && (t.shape.kind === 'oval' || t.shape.kind === 'circuit'), t.id);
    assert.ok(t.theme && t.theme.sky && t.theme.ground, t.id);
  }
});

ok('no Daytona / NASCAR / real-world track branding anywhere', () => {
  const src = readFileSync(new URL('../lib/omega-500/tracks.js', import.meta.url), 'utf8');
  assert.ok(!/daytona/i.test(src), 'daytona');
  assert.ok(!/nascar/i.test(src), 'nascar');
  assert.ok(!/indianapolis/i.test(src), 'indianapolis');
  assert.ok(!/monza|spa-francorchamps|silverstone|lemans/i.test(src), 'real circuits');
});

ok('lap rule: 500 miles on every track (laps = round(500 / length))', () => {
  for (const t of TRACKS) {
    const laps = lapsForTrack(t, 500);
    assert.equal(laps, Math.max(1, Math.round(500 / t.lengthMiles)), t.id);
    assert.ok(laps >= 111 && laps <= 500, `${t.id}: ${laps} laps`);
  }
  assert.equal(lapsForTrack(getTrack('olympus-superspeedway'), 500), 200);
  assert.equal(lapsForTrack(getTrack('golden-mile-oval'), 500), 500);
  assert.equal(lapsForTrack(getTrack('atlas-mountain-pass'), 500), 111);
  assert.equal(lapsForTrack(getTrack('olympus-superspeedway'), 250), 100);
  assert.equal(lapsForTrack(getTrack('olympus-superspeedway'), 100), 40);
  assert.equal(lapsForTrack(getTrack('olympus-superspeedway'), 25), 10);
  assert.equal(lapsForTrack(getTrack('olympus-superspeedway'), 5), 2);
  // Shortest races never drop below 1 lap, even on the longest track.
  assert.equal(lapsForTrack(getTrack('atlas-mountain-pass'), 5), 1);
  assert.deepEqual(RACE_DISTANCES, [500, 250, 100, 25, 5]);
});

ok('every centerline is a closed loop at the stated length (±2%)', () => {
  for (const t of TRACKS) {
    const line = buildCenterline(t);
    const target = t.lengthMiles * MILES_TO_M;
    assert.ok(Math.abs(line.totalM - target) / target < 0.02, `${t.id}: ${line.totalM} vs ${target}`);
    // Closed: first and last samples meet.
    const first = sampleAt(line, 0);
    const last = sampleAt(line, line.totalM - 1);
    assert.ok(Math.hypot(first.x - last.x, first.z - last.z) < 30, `${t.id} not closed`);
    // Even spacing: cumulative array is monotonic and ends at totalM.
    assert.equal(line.cum.length, line.count + 1);
    assert.ok(line.cum[line.count] === line.totalM, `${t.id} cum end`);
    for (let i = 1; i <= line.count; i++) assert.ok(line.cum[i] >= line.cum[i - 1], `${t.id} cum`);
  }
});

ok('sampleAt wraps and tangents are unit length', () => {
  const line = buildCenterline(getTrack('redwater-ridge-road'));
  const a = sampleAt(line, 10);
  const b = sampleAt(line, 10 + line.totalM);
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6, 'wrap');
  assert.ok(Math.abs(Math.hypot(a.tx, a.tz) - 1) < 1e-9, 'tangent unit');
});

ok('track type mix: 5 speedways, 7 road, 4 street, 4 themed', () => {
  const counts = {};
  for (const t of TRACKS) counts[t.type] = (counts[t.type] || 0) + 1;
  assert.deepEqual(counts, { speedway: 5, road: 7, street: 4, themed: 4 });
});

console.log(`\n${pass} track checks passed.`);
