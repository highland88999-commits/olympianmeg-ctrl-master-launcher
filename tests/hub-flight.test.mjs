// Hub TIE fly-through pins, round 2 (Merlin, 2026-10-23): ships at
// QUADRUPLE size (60-unit wingspan), a pass roughly every 24
// seconds, a seeded-random heading per pass drawn from the
// proven-safe azimuth family, short ion-blue trails, and the
// synthesized flyby roar's pure envelope. The lane proof samples
// (a) seeded passes 0..23 and (b) the FULL parameter family —
// azimuths across every allowed sector at the parameter corners —
// for every ship, against every protected volume in
// lib/hub-flight.js (Earth, the Moon shell, Mars + its rings, the
// Sun, both arches, the asteroid field, every outer planet +
// Saturn's ring disc, the tower ring band and the planet band),
// with the 60-unit hull (SHIP_RADIUS) deducted before the
// SHIP_CLEARANCE gate. All volumes are rebuilt from the same layout
// constants the scene renders from, so the proof cannot drift from
// the picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  FIGHTER_URL,
  FIGHTER_WINGSPAN,
  SHIP_RADIUS,
  SHIP_COUNT,
  SHIP_CLEARANCE,
  FIRST_PASS_DELAY_S,
  PASS_CYCLE_S,
  PASS_CYCLE_JITTER_S,
  LANE_RHO_MIN,
  LANE_RHO_MAX,
  AZIMUTH_SECTORS,
  azimuthAllowed,
  altBoundsFor,
  createFlightClock,
  passDuration,
  passParams,
  laneFromParams,
  poseOnLaneInto,
  poseAtParamsInto,
  poseAt,
  speedAt,
  clearanceToVolumes,
  MAX_BANK_RAD,
  TRAIL_CAPACITY,
  TRAIL_SPACING,
  createTrailBuffer,
  FLYBY_RANGE,
  FLYBY_MAX_GAIN,
  flybyEnvelope,
} from '../lib/hub-flight.js';
import { ORBIT_CENTER } from '../lib/god-orbits.js';

const TAU = Math.PI * 2;
const distToHub = (p) =>
  Math.hypot(p.x - ORBIT_CENTER.x, p.y - ORBIT_CENTER.y, p.z - ORBIT_CENTER.z);

test('the fighter asset is on disk and the fit is quadruple size', () => {
  assert.ok(existsSync('public' + FIGHTER_URL), FIGHTER_URL + ' exists');
  assert.equal(SHIP_COUNT, 3);
  // Merlin's round-2 order: quadruple the round-1 15-unit fit.
  assert.equal(FIGHTER_WINGSPAN, 60);
  assert.equal(SHIP_RADIUS, 30, 'the clearance proof deducts the full hull');
});

test('schedule: first pass at ~8s, then a pass roughly every 24 seconds', () => {
  const clock = createFlightClock();
  assert.equal(FIRST_PASS_DELAY_S, 8);
  assert.equal(clock.at(0), null);
  assert.equal(clock.at(FIRST_PASS_DELAY_S - 0.01), null);
  const first = clock.at(FIRST_PASS_DELAY_S + 0.01);
  assert.ok(first, 'first pass is flying just after the delay');
  assert.equal(first.passIndex, 0);
  // Walk an hour of scene time and record pass starts and ends.
  const seen = [];
  let current = null;
  for (let t = 0; t < 3600; t += 0.25) {
    const win = clock.at(t);
    if (win && !current) current = { index: win.passIndex, start: t };
    if (!win && current) {
      seen.push({ ...current, end: t });
      current = null;
    }
  }
  assert.ok(seen.length >= 120, 'threat presence: >=120 passes an hour, got ' + seen.length);
  for (let i = 0; i < seen.length; i++) {
    const dur = seen[i].end - seen[i].start;
    assert.ok(dur > 11.4 && dur < 18.6, `pass ${i} duration ${dur.toFixed(1)}s in the 12-18s band`);
    if (i > 0) {
      const cycle = seen[i].start - seen[i - 1].start;
      assert.ok(
        cycle >= PASS_CYCLE_S - PASS_CYCLE_JITTER_S - 0.5 &&
          cycle <= PASS_CYCLE_S + PASS_CYCLE_JITTER_S + 0.5,
        `cycle before pass ${i} is ${cycle.toFixed(1)}s — ~24s start-to-start`,
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
  const signs = new Set();
  const azimuths = [];
  for (let i = 0; i < 48; i++) {
    const p = passParams(i);
    assert.ok(azimuthAllowed(p.azimuth), `pass ${i} azimuth is inside the safe family`);
    assert.ok(p.rho >= LANE_RHO_MIN && p.rho <= LANE_RHO_MAX, 'rho in band');
    const bounds = altBoundsFor(p.azimuth);
    assert.ok(p.alt >= bounds.min && p.alt <= bounds.max, 'alt inside the per-azimuth bounds');
    assert.ok(p.sign === 1 || p.sign === -1);
    signs.add(p.sign);
    azimuths.push(p.azimuth);
    assert.ok(p.arcY >= -12 && p.arcY <= 12, 'arcY in range');
    assert.ok(p.arcR >= -12 && p.arcR <= 8, 'arcR in range');
    assert.ok(p.duration >= 12 && p.duration <= 18, 'duration 12-18s');
    assert.equal(passDuration(i), p.duration);
    assert.ok(p.cycle >= 21 && p.cycle <= 27, 'cycle 21-27s');
    assert.ok(Math.abs(p.gapAfter - (p.cycle - p.duration)) < 1e-9, 'gap is the cycle remainder');
    assert.ok(p.gapAfter >= 3 && p.gapAfter <= 15, 'idle gap 3-15s');
  }
  assert.equal(signs.size, 2, 'passes fly both directions across the envelope');
  const span = Math.max(...azimuths) - Math.min(...azimuths);
  assert.ok(span > 0.4, 'azimuths genuinely vary across passes (span ' + span.toFixed(2) + ')');
});

test('the safe azimuth family is exactly the two proven sectors', () => {
  // Pinned from the dense clearance sweep: Saturn\'s whole
  // neighbourhood and the wide Jupiter/Uranus bands are closed at
  // a 60-unit hull; what remains is two sectors.
  assert.equal(AZIMUTH_SECTORS.length, 2);
  const expect = [
    [1.126, 1.75],
    [3.397, 3.65],
  ];
  for (let i = 0; i < expect.length; i++) {
    assert.ok(Math.abs(AZIMUTH_SECTORS[i][0] - expect[i][0]) < 0.005, `sector ${i} start`);
    assert.ok(Math.abs(AZIMUTH_SECTORS[i][1] - expect[i][1]) < 0.005, `sector ${i} end`);
  }
  // Saturn's own azimuth (the round-1 trap) is closed, core included.
  assert.equal(azimuthAllowed(Math.atan2(-340, 430)), false, 'Saturn azimuth closed');
  assert.equal(azimuthAllowed(Math.atan2(-60, -560) + 0.5), false, 'Jupiter band closed');
  for (const [s, e] of AZIMUTH_SECTORS) {
    assert.ok(azimuthAllowed((s + e) / 2), 'sector midpoint is allowed');
  }
});

test('CLEARANCE: no ship on any seeded pass ever enters a protected volume', () => {
  let worst = Infinity;
  let worstWhere = '';
  for (let passIndex = 0; passIndex < 24; passIndex++) {
    for (let ship = 0; ship < SHIP_COUNT; ship++) {
      for (let s = 0; s <= 200; s++) {
        const u = s / 200;
        const pose = poseAt(passIndex, u, ship);
        const c = clearanceToVolumes(pose) - SHIP_RADIUS;
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

test('CLEARANCE: the full random family clears at its parameter corners', () => {
  // Every allowed azimuth (0.01 rad steps) x rho/alt corners x both
  // directions x arc corners x all ships along the lane. This is
  // the standing proof that random-within-the-family can never
  // reach scenery: the seeded passes are drawn from exactly this
  // family.
  const pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, bank: 0 };
  let sampledAzimuths = 0;
  let worst = Infinity;
  let worstWhere = '';
  for (let phi = 0; phi < TAU; phi += 0.01) {
    if (!azimuthAllowed(phi)) continue;
    sampledAzimuths++;
    const bounds = altBoundsFor(phi);
    for (const rho of [LANE_RHO_MIN, LANE_RHO_MAX]) {
      for (const alt of [bounds.min, bounds.max]) {
        for (const sign of [1, -1]) {
          for (const arcY of [-12, 12]) {
            for (const arcR of [-12, 8]) {
              const pts = laneFromParams({ azimuth: phi, rho, alt, sign, arcY, arcR });
              for (let s = 0; s <= 40; s++) {
                const u = s / 40;
                for (let ship = 0; ship < SHIP_COUNT; ship++) {
                  poseOnLaneInto(pts, u, ship, pose);
                  const c = clearanceToVolumes(pose) - SHIP_RADIUS;
                  if (c < worst) {
                    worst = c;
                    worstWhere = `phi=${phi.toFixed(2)} rho=${rho} alt=${alt} sign=${sign} arcY=${arcY} arcR=${arcR} u=${u.toFixed(2)} ship=${ship}`;
                  }
                  assert.ok(
                    c >= SHIP_CLEARANCE,
                    `family clearance ${c.toFixed(1)} < ${SHIP_CLEARANCE} at phi=${phi.toFixed(2)} rho=${rho} alt=${alt} u=${u.toFixed(2)} ship=${ship}`,
                  );
                }
              }
            }
          }
        }
      }
    }
  }
  assert.ok(sampledAzimuths >= 60, 'the sweep really covered the family (' + sampledAzimuths + ' azimuths)');
  assert.ok(worst >= SHIP_CLEARANCE, 'family worst ' + worst.toFixed(1) + ' at ' + worstWhere);
});

test('passes begin and end well out of view', () => {
  for (let passIndex = 0; passIndex < 4; passIndex++) {
    const start = poseAt(passIndex, 0, 0);
    const end = poseAt(passIndex, 1, 0);
    assert.ok(distToHub(start) > 650, 'entry distance ' + distToHub(start).toFixed(0));
    assert.ok(distToHub(end) > 650, 'exit distance ' + distToHub(end).toFixed(0));
  }
});

test('cruise profile: gentle at the ends, fast mid-pass, always sane', () => {
  const endSpeed = speedAt(0, 0.001);
  const midSpeed = speedAt(0, 0.5);
  assert.ok(endSpeed < midSpeed, `entry ${endSpeed.toFixed(1)} < mid ${midSpeed.toFixed(1)}`);
  assert.ok(midSpeed > 90 && midSpeed < 220, 'mid-pass speed ' + midSpeed.toFixed(1) + ' u/s — a fast crossing at the new cadence');
});

test('formation: scaled with the hull, no two ships ever overlap', () => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  for (let passIndex = 0; passIndex < 6; passIndex++) {
    for (const u of [0.25, 0.5, 0.75]) {
      const ships = [0, 1, 2].map((s) => poseAt(passIndex, u, s));
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          assert.ok(
            d(ships[i], ships[j]) > FIGHTER_WINGSPAN,
            `ships ${i}/${j} centres ${d(ships[i], ships[j]).toFixed(1)} apart — hulls (60) must not touch`,
          );
        }
      }
      assert.ok(d(ships[1], ships[2]) > 100, 'wingmen are spread wide at the new scale');
    }
  }
});

test('banking: the flight banks into its arc, mirrored lanes bank mirrored', () => {
  let peak = 0;
  for (let passIndex = 0; passIndex < 6; passIndex++) {
    for (let s = 0; s <= 100; s++) {
      peak = Math.max(peak, Math.abs(poseAt(passIndex, s / 100, 0).bank));
    }
  }
  assert.ok(peak > 0.05, 'bank peaks at ' + peak.toFixed(3) + ' rad somewhere on the arcs');
  assert.ok(peak <= MAX_BANK_RAD + 1e-9, 'bank never exceeds the cap');
  // The sign flip flies the same lane backwards: the leader at u on
  // a +1 lane sits where the -1 lane puts it at 1-u, rolled the
  // opposite way.
  const base = { azimuth: (AZIMUTH_SECTORS[0][0] + AZIMUTH_SECTORS[0][1]) / 2, rho: 280, alt: 277, arcY: 6, arcR: -2 };
  const out = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, bank: 0 };
  for (const u of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const fwd = poseAtParamsInto({ ...base, sign: 1 }, u, 0, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, bank: 0 });
    const rev = poseAtParamsInto({ ...base, sign: -1 }, 1 - u, 0, out);
    const gap = Math.hypot(fwd.x - rev.x, fwd.y - rev.y, fwd.z - rev.z);
    assert.ok(gap < 0.01, `mirrored lanes meet at u=${u} (gap ${gap.toFixed(4)})`);
    assert.ok(Math.abs(fwd.bank + rev.bank) < 0.02, `mirrored banks cancel at u=${u}`);
  }
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

test('trail buffer: oldest-first ring, wraps by dropping the oldest, resets clean', () => {
  const buf = createTrailBuffer();
  const s = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
  assert.equal(buf.count(), 0);
  buf.push(1, 0, 0, 0, 0, 1);
  buf.push(2, 0, 0, 0, 0, 1);
  buf.push(3, 0, 0, 0, 0, 1);
  assert.equal(buf.count(), 3);
  assert.equal(buf.sampleInto(0, s).x, 1, 'i=0 is the tail (oldest)');
  assert.equal(buf.sampleInto(2, s).x, 3, 'last index is the freshest sample');
  // Overflow: pushing past capacity keeps the newest TRAIL_CAPACITY.
  for (let x = 4; x <= TRAIL_CAPACITY + 4; x++) buf.push(x, 0, 0, 0, 0, 1);
  assert.equal(buf.count(), TRAIL_CAPACITY);
  assert.equal(buf.sampleInto(0, s).x, 5, 'the oldest retained sample is push #5');
  assert.equal(buf.sampleInto(TRAIL_CAPACITY - 1, s).x, TRAIL_CAPACITY + 4, 'newest is last');
  buf.reset();
  assert.equal(buf.count(), 0, 'reset empties the trail (passes leave nothing behind)');
  // The trail is SHORT: capacity x spacing is 2-3.5 ship lengths.
  const lengths = (TRAIL_CAPACITY * TRAIL_SPACING) / FIGHTER_WINGSPAN;
  assert.ok(lengths >= 2 && lengths <= 3.5, 'trail reach is ' + lengths.toFixed(2) + ' ship lengths');
});

test('flyby envelope: silent beyond range, swells in, doppler pitch through the pass', () => {
  const far = flybyEnvelope(FLYBY_RANGE + 50, 120);
  assert.equal(far.gain, 0, 'silent beyond earshot');
  assert.equal(far.inRange, false);
  assert.equal(flybyEnvelope(FLYBY_RANGE, 0).gain, 0, 'silent at the range edge');
  assert.equal(flybyEnvelope(NaN, 0).gain, 0, 'bad geometry stays silent');
  const g100 = flybyEnvelope(100, 0).gain;
  const g300 = flybyEnvelope(300, 0).gain;
  const g500 = flybyEnvelope(500, 0).gain;
  assert.ok(g100 > g300 && g300 > g500 && g500 > 0, 'gain rises as the pass nears');
  assert.ok(g100 <= FLYBY_MAX_GAIN, 'gain is capped at ' + FLYBY_MAX_GAIN);
  // Pitch: >1 while closing, 1 at closest approach, <1 receding.
  assert.ok(flybyEnvelope(200, 140).pitch > 1, 'pitch rises on approach');
  assert.equal(flybyEnvelope(200, 0).pitch, 1, 'pitch is neutral at closest approach');
  assert.ok(flybyEnvelope(200, -140).pitch < 1, 'pitch falls away after the pass');
  assert.equal(flybyEnvelope(200, 100000).pitch, 1.42, 'pitch clamps high');
  assert.equal(flybyEnvelope(200, -100000).pitch, 0.72, 'pitch clamps low');
});
