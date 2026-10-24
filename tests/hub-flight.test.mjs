// Hub TIE fly-through pins (Merlin, 2026-10-23): occasional passes,
// a lane that provably never touches the scenery, and a formation
// that banks. The lane proof samples the full seeded envelope —
// passes 0..11 cover both directions and the whole jitter range —
// for every ship, against every protected volume in lib/hub-flight.js
// (Earth, the Moon shell, Mars + its rings, the Sun, both arches,
// the asteroid field, every outer planet + Saturn's ring disc, the
// tower ring band and the planet band), all rebuilt from the same
// layout constants the scene renders from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  FIGHTER_URL,
  SHIP_COUNT,
  SHIP_CLEARANCE,
  FIRST_PASS_DELAY_S,
  PASS_GAP_MIN_S,
  PASS_GAP_MAX_S,
  createFlightClock,
  passDuration,
  passParams,
  poseAt,
  speedAt,
  clearanceToVolumes,
  MAX_BANK_RAD,
} from '../lib/hub-flight.js';
import { ORBIT_CENTER } from '../lib/god-orbits.js';

const distToHub = (p) =>
  Math.hypot(p.x - ORBIT_CENTER.x, p.y - ORBIT_CENTER.y, p.z - ORBIT_CENTER.z);

test('the fighter asset is on disk at the module URL', () => {
  assert.ok(existsSync('public' + FIGHTER_URL), FIGHTER_URL + ' exists');
  assert.equal(SHIP_COUNT, 3);
});

test('schedule: first pass comes soon, later passes stay occasional', () => {
  const clock = createFlightClock();
  assert.equal(clock.at(0), null);
  assert.equal(clock.at(FIRST_PASS_DELAY_S - 0.01), null);
  const first = clock.at(FIRST_PASS_DELAY_S + 0.01);
  assert.ok(first, 'first pass is flying just after the delay');
  assert.equal(first.passIndex, 0);
  // Walk the clock and record each pass's start/end + the idle gap.
  const seen = [];
  let current = null;
  for (let t = 0; t < 3600; t += 0.5) {
    const win = clock.at(t);
    if (win && !current) current = { index: win.passIndex, start: t };
    if (!win && current) {
      seen.push({ ...current, end: t });
      current = null;
    }
  }
  assert.ok(seen.length >= 6, 'several passes in an hour, got ' + seen.length);
  for (let i = 0; i < seen.length; i++) {
    const dur = seen[i].end - seen[i].start;
    assert.ok(dur > 25 && dur < 45, `pass ${i} duration ${dur.toFixed(1)}s is a pass, not a fixture`);
    if (i > 0) {
      const gap = seen[i].start - seen[i - 1].end;
      assert.ok(
        gap >= PASS_GAP_MIN_S - 1 && gap <= PASS_GAP_MAX_S + 1,
        `gap after pass ${i - 1} is ${gap.toFixed(1)}s — occasional, not a metronome`,
      );
    }
  }
});

test('schedule is deterministic and pass params stay in their ranges', () => {
  const a = createFlightClock();
  const b = createFlightClock();
  for (let t = 0; t < 1800; t += 3.7) {
    assert.deepEqual(a.at(t), b.at(t), 'same seed, same sky at t=' + t);
  }
  for (let i = 0; i < 24; i++) {
    const p = passParams(i);
    assert.ok(p.direction === 1 || p.direction === -1);
    assert.ok(p.gapAfter >= PASS_GAP_MIN_S && p.gapAfter <= PASS_GAP_MAX_S);
    assert.ok(passDuration(i) >= 30 && passDuration(i) <= 38);
  }
  const dirs = new Set();
  for (let i = 0; i < 12; i++) dirs.add(passParams(i).direction);
  assert.equal(dirs.size, 2, 'passes fly both directions across the envelope');
});

test('CLEARANCE: no ship on any sampled pass ever enters a protected volume', () => {
  let worst = Infinity;
  let worstWhere = '';
  for (let passIndex = 0; passIndex < 12; passIndex++) {
    for (let ship = 0; ship < SHIP_COUNT; ship++) {
      for (let s = 0; s <= 400; s++) {
        const u = s / 400;
        const pose = poseAt(passIndex, u, ship);
        const c = clearanceToVolumes(pose);
        if (c < worst) {
          worst = c;
          worstWhere = `pass ${passIndex} ship ${ship} u=${u.toFixed(2)}`;
        }
        assert.ok(
          c >= SHIP_CLEARANCE,
          `clearance ${c.toFixed(1)} < ${SHIP_CLEARANCE} at pass ${passIndex} ship ${ship} u=${u.toFixed(2)}`,
        );
      }
    }
  }
  assert.ok(worst >= SHIP_CLEARANCE, 'worst clearance ' + worst.toFixed(1) + ' at ' + worstWhere);
});

test('passes begin and end well out of view', () => {
  for (let passIndex = 0; passIndex < 4; passIndex++) {
    const start = poseAt(passIndex, 0, 0);
    const end = poseAt(passIndex, 1, 0);
    assert.ok(distToHub(start) > 650, 'entry distance ' + distToHub(start).toFixed(0));
    assert.ok(distToHub(end) > 650, 'exit distance ' + distToHub(end).toFixed(0));
  }
});

test('cruise profile: gentle at the ends, faster mid-pass, always sane', () => {
  const endSpeed = speedAt(0, 0.001);
  const midSpeed = speedAt(0, 0.5);
  assert.ok(endSpeed < midSpeed, `entry ${endSpeed.toFixed(1)} < mid ${midSpeed.toFixed(1)}`);
  assert.ok(midSpeed > 30 && midSpeed < 90, 'mid-pass speed ' + midSpeed.toFixed(1) + ' u/s');
});

test('formation: three distinct ships, wingmen trailing the leader', () => {
  const leader = poseAt(2, 0.5, 0);
  const left = poseAt(2, 0.5, 1);
  const right = poseAt(2, 0.5, 2);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  assert.ok(d(leader, left) > 8, 'left wingman is offset, not stacked');
  assert.ok(d(leader, right) > 8, 'right wingman is offset, not stacked');
  assert.ok(d(left, right) > 15, 'wingmen are spread apart');
});

test('banking: the flight banks into its arc, mirrored lanes bank mirrored', () => {
  let peak = 0;
  for (let s = 0; s <= 100; s++) {
    peak = Math.max(peak, Math.abs(poseAt(0, s / 100, 0).bank));
  }
  assert.ok(peak > 0.05, 'bank peaks at ' + peak.toFixed(3) + ' rad somewhere on the arc');
  assert.ok(peak <= MAX_BANK_RAD + 1e-9, 'bank never exceeds the cap');
  // Find a pass of each direction and compare bank at the same u:
  // the mirrored lane must roll the opposite way.
  let plus = -1;
  let minus = -1;
  for (let i = 0; i < 12 && (plus < 0 || minus < 0); i++) {
    if (passParams(i).direction === 1 && plus < 0) plus = i;
    if (passParams(i).direction === -1 && minus < 0) minus = i;
  }
  assert.ok(plus >= 0 && minus >= 0, 'both directions exist in the envelope');
  let mirrored = false;
  for (let s = 10; s <= 90 && !mirrored; s++) {
    const bp = poseAt(plus, s / 100, 0).bank;
    const bm = poseAt(minus, s / 100, 0).bank;
    if (Math.abs(bp) > 0.03 && Math.abs(bm) > 0.03 && Math.sign(bp) !== Math.sign(bm)) {
      mirrored = true;
    }
  }
  assert.ok(mirrored, 'opposite lanes bank opposite ways');
});

test('forward vectors stay unit-length and continuous (no flips)', () => {
  for (let passIndex = 0; passIndex < 3; passIndex++) {
    let prev = poseAt(passIndex, 0, 0);
    assert.ok(Math.abs(Math.hypot(prev.fx, prev.fy, prev.fz) - 1) < 1e-6, 'unit forward');
    for (let s = 1; s <= 200; s++) {
      const pose = poseAt(passIndex, s / 200, 0);
      const dot = prev.fx * pose.fx + prev.fy * pose.fy + prev.fz * pose.fz;
      assert.ok(dot > 0.99, `forward flipped at pass ${passIndex} step ${s}: dot ${dot}`);
      prev = pose;
    }
  }
});
