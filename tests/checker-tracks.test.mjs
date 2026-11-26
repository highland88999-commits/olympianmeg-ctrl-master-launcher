// tests/checker-tracks.test.mjs — Checker Tracks data + demo gate.
// Run: node tests/checker-tracks.test.mjs (from the repo root).
// Pure data + geometry checks: 11 tracks, lap rule, closed centerlines
// at the stated lengths, hero speed variation, demo track free.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHECKER_TRACKS, listCheckerTracks, getCheckerTrack, lapsForTrack,
  RACE_DISTANCES, DEFAULT_DISTANCE_MILES, DEMO_TRACK_ID, HERO_TRACK_ID,
  isFreeTrack,
} from '../lib/checker-tracks/tracks.js';
import {
  TRACKS as OMEGA_TRACKS, lapsForTrack as omegaLaps, buildCenterline,
  sampleAt, MILES_TO_M, RACE_DISTANCES as OMEGA_DISTANCES,
  DEFAULT_DISTANCE_MILES as OMEGA_DEFAULT,
} from '../lib/omega-500/tracks.js';
import { curvatureAhead } from '../lib/omega-500/race.js';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log(`  ok ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n    ${e.message}`); process.exitCode = 1; }
}

ok('exactly 11 tracks, unique ids', () => {
  assert.equal(CHECKER_TRACKS.length, 11);
  assert.equal(listCheckerTracks().length, 11);
  const ids = CHECKER_TRACKS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.some((id) => OMEGA_TRACKS.some((o) => o.id === id)), 'no id collides with Omega 500');
});

ok('every track has the full Omega 500 record shape', () => {
  for (const t of CHECKER_TRACKS) {
    assert.equal(typeof t.id, 'string');
    assert.equal(typeof t.name, 'string');
    assert.equal(typeof t.type, 'string');
    assert.ok(t.lengthMiles > 0, `${t.id} lengthMiles`);
    assert.ok(Number.isInteger(t.turns) && t.turns > 0, `${t.id} turns`);
    assert.equal(typeof t.banking, 'string');
    assert.equal(typeof t.surface, 'string');
    assert.ok(t.widthM >= 10, `${t.id} widthM`);
    assert.ok(t.grip > 0 && t.grip <= 1, `${t.id} grip`);
    assert.ok(t.shape.kind === 'oval' || t.shape.kind === 'circuit', `${t.id} shape kind`);
    assert.equal(typeof t.theme.sky, 'string');
    assert.equal(typeof t.theme.ground, 'string');
    assert.equal(typeof t.theme.wall, 'string');
    assert.equal(typeof t.blurb, 'string');
  }
});

ok('every track builds a valid closed centerline at the stated length', () => {
  for (const t of CHECKER_TRACKS) {
    const line = buildCenterline(t);
    assert.equal(line.count, 400);
    const targetM = t.lengthMiles * MILES_TO_M;
    assert.ok(
      Math.abs(line.totalM - targetM) / targetM < 0.01,
      `${t.id}: totalM ${line.totalM.toFixed(1)} vs target ${targetM.toFixed(1)}`,
    );
    // Closed loop: sampling at 0 and at totalM gives the same point.
    const a = sampleAt(line, 0);
    const b = sampleAt(line, line.totalM);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01, `${t.id}: loop not closed`);
    for (let i = 0; i < line.count; i++) {
      assert.ok(Number.isFinite(line.xs[i]) && Number.isFinite(line.zs[i]), `${t.id}: non-finite point ${i}`);
    }
  }
});

ok('lapsForTrack gives the Omega 500 rule on every distance', () => {
  assert.deepEqual(RACE_DISTANCES, OMEGA_DISTANCES);
  assert.equal(DEFAULT_DISTANCE_MILES, OMEGA_DEFAULT);
  for (const t of CHECKER_TRACKS) {
    for (const d of RACE_DISTANCES) {
      assert.equal(lapsForTrack(t, d), omegaLaps(t, d), `${t.id} @ ${d}mi`);
      assert.equal(lapsForTrack(t, d), Math.max(1, Math.round(d / t.lengthMiles)));
    }
  }
});

ok('hero track has real speed variation (not one flat speed)', () => {
  const hero = getCheckerTrack(HERO_TRACK_ID);
  assert.ok(hero, 'hero track exists');
  const line = buildCenterline(hero);
  // Corner speed the AI targets: sqrt(28 / curvature). Sample the loop.
  const speeds = [];
  for (let i = 0; i < 60; i++) {
    const s = (i / 60) * line.totalM;
    const curv = curvatureAhead(line, s, 30);
    speeds.push(Math.sqrt(28 / Math.max(curv, 0.0004)));
  }
  const lo = Math.min(...speeds);
  const hi = Math.max(...speeds);
  assert.ok(hi / lo > 1.5, `hero corner-speed range ${lo.toFixed(1)}..${hi.toFixed(1)} m/s, ratio ${(hi / lo).toFixed(2)}`);
  console.log(`    hero corner-speed range ${lo.toFixed(1)}..${hi.toFixed(1)} m/s (ratio ${(hi / lo).toFixed(2)})`);
});

ok('every circuit track varies in speed; ovals are fast throughout', () => {
  for (const t of CHECKER_TRACKS) {
    if (t.shape.kind !== 'circuit') continue;
    const line = buildCenterline(t);
    const speeds = [];
    for (let i = 0; i < 40; i++) {
      const curv = curvatureAhead(line, (i / 40) * line.totalM, 30);
      speeds.push(Math.sqrt(28 / Math.max(curv, 0.0004)));
    }
    const ratio = Math.max(...speeds) / Math.min(...speeds);
    assert.ok(ratio > 1.3, `${t.id}: corner-speed ratio ${ratio.toFixed(2)}`);
  }
});

ok('demo track exists, is free, and is a short loop of the family', () => {
  const demo = getCheckerTrack(DEMO_TRACK_ID);
  assert.ok(demo, 'demo track exists');
  assert.equal(DEMO_TRACK_ID, 'checker-tunnel-demo');
  assert.ok(isFreeTrack(DEMO_TRACK_ID));
  assert.equal(getCheckerTrack(HERO_TRACK_ID).id, HERO_TRACK_ID);
  assert.ok(!isFreeTrack(HERO_TRACK_ID), 'hero is not free');
  assert.ok(demo.lengthMiles < getCheckerTrack(HERO_TRACK_ID).lengthMiles, 'demo shorter than hero');
  assert.equal(CHECKER_TRACKS.filter((t) => isFreeTrack(t.id)).length, 1, 'exactly one free track');
  assert.equal(getCheckerTrack('no-such-track'), null);
});

ok('page ships no reel video (placeholder slot only)', () => {
  const page = readFileSync(new URL('../app/checker-tracks/page.jsx', import.meta.url), 'utf8');
  assert.ok(!page.includes('.mp4'), 'page references no video file');
  assert.ok(page.includes('TRAILER — COMING SOON'), 'trailer placeholder present');
  // Free window (Nov 25, 2026 – Feb 25, 2027): no payments are taken, so
  // the page wires none — no eligibility check, no checkout, no price,
  // no subscribe button. All 11 tracks are free; the note says so.
  assert.ok(!page.includes('/api/checker-tracks/eligibility'), 'no eligibility check in free version');
  assert.ok(!page.includes('/api/checker-tracks/checkout'), 'no checkout call in free version');
  assert.ok(!page.includes('$6.00'), 'no paywall price in free version');
  assert.ok(!page.includes('SUBSCRIBE'), 'no subscribe button in free version');
  assert.ok(page.includes('February 25, 2027'), 'free-window note present');
  assert.ok(page.includes('IslandCarousel'), 'island carousel present');
  assert.ok(page.includes('SELECT'), 'SELECT orb present');
});

console.log(`\nchecker-tracks: ${pass} passed`);
