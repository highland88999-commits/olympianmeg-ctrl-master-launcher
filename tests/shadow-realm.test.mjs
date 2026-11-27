// tests/shadow-realm.test.mjs — headless tests for the SHADOW REALM module.
// Run: node --test tests/shadow-realm.test.mjs
// Covers: track table validity (20 unique, closed barrier loops), light-trail
// color schemes, lap/barrier math, prefs keys, entry URL contract.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, trackByKey, centerline, barrierLoops, startPose } from '../app/shadow-realm/tracks.js';
import { TRAIL_SCHEMES, SCHEME_FILMS, schemeByKey, VEHICLES, vehicleByKey } from '../app/shadow-realm/schemes.js';
import { closestOnPolyline, resolveBarrier, LapTracker, clampHeadingForward } from '../app/shadow-realm/race.js';
import { shadowKey, loadPrefs, savePrefs, DEFAULT_PREFS, SHADOW_SCOPING } from '../app/shadow-realm/prefs.js';
import { SHADOW_REALM_ROUTE, parseShadowMode, shadowRealmUrl } from '../app/shadow-realm/launch.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const EXPECTED_LAYOUTS = new Set([
  'oval', 'ring', 'tri-oval', 'kidney', 'figure-eight', 'canyon', 'switchback',
  'comet', 'volcano', 'starburst', 'chicane', 'diamond', 'hairpin', 'thunder',
  'coil', 'crossover', 'wave', 'speedway', 'keyhole', 'circuit',
]);

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

// ---------------------------------------------------------------- tracks
describe('track table', () => {
  it('has exactly 21 tracks: 20 race + the eternal-flame bump arena', () => {
    assert.equal(TRACKS.length, 21);
    assert.equal(TRACKS.filter((t) => t.bump).length, 1);
    assert.equal(trackByKey('eternal-flame').key, 'eternal-flame');
  });

  it('keys and names are unique; layouts unique except the shared ring', () => {
    assert.equal(new Set(TRACKS.map((t) => t.key)).size, 21);
    assert.equal(new Set(TRACKS.map((t) => t.name)).size, 21);
    // neon-ring + eternal-flame both ride the 'ring' layout.
    assert.equal(new Set(TRACKS.map((t) => t.layout)).size, 20);
  });

  it('covers 20 distinct layout types', () => {
    for (const t of TRACKS) assert.ok(EXPECTED_LAYOUTS.has(t.layout), `unknown layout ${t.layout}`);
  });

  it('every track has sane params', () => {
    for (const t of TRACKS) {
      assert.ok(t.R > 50 && t.R < 300, `${t.key}: R`);
      assert.ok(t.width >= 10 && t.width <= 36, `${t.key}: width`);
      assert.ok(typeof t.desc === 'string' && t.desc.length > 10, `${t.key}: desc`);
    }
  });

  // WIDER TRACK (1.5x, rounded to whole metres): every width scaled from
  // the pre-widening table — 13-16 -> 20-24, eternal-flame 24 -> 36.
  it('widths are the 1.5x widening of the original table', () => {
    const expected = {
      'gridiron-oval': 24, 'neon-ring': 21, 'tri-oval-prime': 23,
      'kidney-run': 21, 'figure-eight': 20, 'canyon-carve': 23,
      'switchback': 20, 'comet-tail': 21, 'volcano': 21, 'starburst': 20,
      'chicane-alley': 21, 'diamond-cut': 21, 'hairpin-heights': 23,
      'thunder-loop': 20, 'coil': 21, 'crossover': 20, 'wave-rider': 23,
      'neon-mile': 24, 'keyhole': 21, 'grand-circuit': 23,
      'eternal-flame': 36,
    };
    for (const t of TRACKS) {
      assert.equal(t.width, expected[t.key], `${t.key}: width ${t.width} !== ${expected[t.key]}`);
    }
    // No race track narrower than 20 m after widening.
    for (const t of TRACKS.filter((x) => !x.bump)) {
      assert.ok(t.width >= 20, `${t.key}: race track still narrow (${t.width})`);
    }
  });

  it('barrier loops follow the widened widths', () => {
    for (const t of TRACKS) {
      const { halfW } = barrierLoops(t, 128);
      assert.equal(halfW, t.width / 2, `${t.key}: halfW must track width`);
    }
    // The width-less fallback matches the widened default (14 -> 21).
    assert.equal(barrierLoops({ R: 100 }, 64).halfW, 21 / 2);
  });

  it('centerlines are closed loops with no NaN', () => {
    for (const t of TRACKS) {
      const pts = centerline(t, 128);
      assert.equal(pts.length, 128);
      for (const p of pts) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `${t.key}: NaN point`);
      }
      // Closed by construction (t wraps 0 -> 2PI). Sanity: the closing
      // chord between last and first sample stays on the track's scale.
      // (Squircle layouts have a vertical tangent at edge midpoints, so
      // the chord there is long — a sampling artifact, not an open loop.)
      const a = pts[0];
      const b = pts[pts.length - 1];
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      assert.ok(gap < t.R, `${t.key}: closing chord ${gap.toFixed(1)} exceeds track scale`);
    }
  });

  it('barrier loops are closed and straddle the centerline', () => {
    for (const t of TRACKS) {
      const { center, inner, outer, halfW } = barrierLoops(t, 128);
      assert.equal(inner.length, 128);
      assert.equal(outer.length, 128);
      assert.ok(halfW > 0);
      for (let i = 0; i < 128; i += 16) {
        const c = center[i];
        const di = Math.hypot(inner[i].x - c.x, inner[i].z - c.z);
        const doo = Math.hypot(outer[i].x - c.x, outer[i].z - c.z);
        assert.ok(Math.abs(di - halfW) < 1.5, `${t.key}: inner offset drift`);
        assert.ok(Math.abs(doo - halfW) < 1.5, `${t.key}: outer offset drift`);
        // inner and outer are on opposite sides of the center
        const v1x = inner[i].x - c.x;
        const v2x = outer[i].x - c.x;
        assert.ok(v1x * v2x + (inner[i].z - c.z) * (outer[i].z - c.z) < 0, `${t.key}: same side`);
      }
    }
  });

  it('trackByKey falls back to the first track', () => {
    assert.equal(trackByKey('nope').key, TRACKS[0].key);
    assert.equal(trackByKey('neon-ring').name, 'Neon Ring');
  });

  it('startPose sits on the loop facing forward', () => {
    const t = trackByKey('gridiron-oval');
    const pose = startPose(t, 128);
    const near = closestOnPolyline(pose, centerline(t, 128));
    assert.ok(near.dist < 20, 'spawn too far from centerline');
    assert.ok(Number.isFinite(pose.heading));
  });
});

// ---------------------------------------------------------------- schemes
describe('light-trail schemes', () => {
  it('all three films represented, plus extras', () => {
    const films = new Set(TRAIL_SCHEMES.map((s) => s.film));
    assert.ok(films.has('Tron (1982)'));
    assert.ok(films.has('Tron: Legacy (2010)'));
    assert.ok(films.has('Tron: Ares (2025)'));
    for (const s of TRAIL_SCHEMES) assert.ok(SCHEME_FILMS.includes(s.film), s.key);
  });

  it('unique keys, valid hex colors', () => {
    assert.equal(new Set(TRAIL_SCHEMES.map((s) => s.key)).size, TRAIL_SCHEMES.length);
    for (const s of TRAIL_SCHEMES) {
      for (const c of [s.primary, s.secondary, s.trail, s.trailGlow]) {
        assert.ok(HEX.test(c), `${s.key}: bad color ${c}`);
      }
    }
  });

  it('1982 scheme is cyan-blue + red-orange', () => {
    const s = TRAIL_SCHEMES.find((x) => x.film === 'Tron (1982)');
    assert.ok(s.primary.toLowerCase().includes('d3') || s.primary.startsWith('#1'));
    assert.ok(/^#ff/i.test(s.secondary), '1982 secondary should be red-orange');
  });

  it('Ares (2025) scheme is red', () => {
    const s = TRAIL_SCHEMES.find((x) => x.film === 'Tron: Ares (2025)');
    assert.ok(/^#ff/i.test(s.primary), 'Ares primary should be red');
  });

  it('schemeByKey falls back safely', () => {
    assert.equal(schemeByKey('nope').key, TRAIL_SCHEMES[0].key);
  });
});

describe('vehicles', () => {
  it('offers the three trim bikes with distinct tuning', () => {
    assert.deepEqual(VEHICLES.map((v) => v.key), ['wisp', 'comet', 'atlas']);
    const speeds = new Set(VEHICLES.map((v) => v.maxSpeed));
    assert.equal(speeds.size, 3, 'each bike must feel different');
    const turns = new Set(VEHICLES.map((v) => v.turnRate));
    assert.equal(turns.size, 3);
  });

  it('Wisp fastest, Atlas slowest and most planted', () => {
    const w = vehicleByKey('wisp');
    const a = vehicleByKey('atlas');
    assert.ok(w.maxSpeed > a.maxSpeed);
    assert.ok(w.turnRate > a.turnRate);
    assert.ok(w.accel > a.accel);
  });

  it('all tuning values positive and finite', () => {
    for (const v of VEHICLES) {
      for (const k of ['maxSpeed', 'accel', 'turnRate', 'boostMult', 'brakeRate']) {
        assert.ok(Number.isFinite(v[k]) && v[k] > 0, `${v.key}.${k}`);
      }
      assert.ok(v.boostMult > 1, `${v.key}: boost must multiply`);
    }
  });
});

// ---------------------------------------------------------------- race math
describe('barrier collision', () => {
  const track = trackByKey('gridiron-oval');
  const { center, halfW } = barrierLoops(track, 128);

  it('rider inside the corridor is untouched', () => {
    const p = { ...center[10] };
    const v = { x: 10, z: 0 };
    const r = resolveBarrier(p, v, center, halfW);
    assert.equal(r.bounced, false);
    assert.deepEqual(r.pos, p);
    assert.deepEqual(r.vel, v);
  });

  it('rider outside is pushed back inside and deflected, never killed', () => {
    // fling the rider hard at the outer wall
    const c = center[10];
    const near = closestOnPolyline({ x: c.x + halfW + 6, z: c.z }, center);
    const p = { x: c.x + near.nx * (halfW + 6), z: c.z + near.nz * (halfW + 6) };
    const v = { x: near.nx * 50, z: near.nz * 50 };
    const r = resolveBarrier(p, v, center, halfW);
    assert.equal(r.bounced, true);
    const after = closestOnPolyline(r.pos, center);
    assert.ok(after.dist <= halfW + 1e-6, 'rider must end up inside');
    const speedBefore = Math.hypot(v.x, v.z);
    const speedAfter = Math.hypot(r.vel.x, r.vel.z);
    assert.ok(speedAfter > 0, 'bounce must never kill the rider');
    assert.ok(speedAfter < speedBefore, 'wall absorbs some energy');
    // outward component reversed
    const outBefore = v.x * near.nx + v.z * near.nz;
    const outAfter = r.vel.x * near.nx + r.vel.z * near.nz;
    assert.ok(outBefore > 0 && outAfter < 0, 'velocity must reflect off the wall');
  });

  it('a graze keeps tangential speed', () => {
    const c = center[30];
    const near = closestOnPolyline({ x: c.x, z: c.z }, center);
    // tangent direction at nearest point
    const a = center[near.segIndex];
    const b = center[(near.segIndex + 1) % center.length];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz);
    const p = { x: c.x + near.nx * (halfW + 0.5), z: c.z + near.nz * (halfW + 0.5) };
    const v = { x: (tx / tl) * 40 + near.nx * 2, z: (tz / tl) * 40 + near.nz * 2 };
    const r = resolveBarrier(p, v, center, halfW);
    const tangAfter = Math.abs(r.vel.x * (tx / tl) + r.vel.z * (tz / tl));
    assert.ok(tangAfter > 35, 'graze should keep tangential speed');
  });

  it('widened walls still bounce with restitution 0.55 on every track', () => {
    // Widening must not change the wall contract: outside -> pushed back
    // inside, outward velocity reflected, never killed, never through.
    for (const t of TRACKS) {
      const { center: c, halfW: hw } = barrierLoops(t, 128);
      const p0 = c[10];
      const near = closestOnPolyline({ x: p0.x + hw + 6, z: p0.z }, c);
      const p = { x: p0.x + near.nx * (hw + 6), z: p0.z + near.nz * (hw + 6) };
      // The normal resolveBarrier uses is the one at p itself.
      const nAtP = closestOnPolyline(p, c);
      const v = { x: nAtP.nx * 50, z: nAtP.nz * 50 };
      const r = resolveBarrier(p, v, c, hw);
      assert.equal(r.bounced, true, `${t.key}: must bounce`);
      const after = closestOnPolyline(r.pos, c);
      assert.ok(after.dist <= hw + 1e-6, `${t.key}: must end up inside`);
      const outAfter = r.vel.x * nAtP.nx + r.vel.z * nAtP.nz;
      assert.ok(outAfter < 0, `${t.key}: outward velocity must reflect`);
      // Restitution 0.55: outward speed after = -0.55 * outward before.
      assert.ok(Math.abs(outAfter - -0.55 * 50) < 1e-6, `${t.key}: restitution must stay 0.55`);
      assert.ok(Math.hypot(r.vel.x, r.vel.z) > 0, `${t.key}: bounce must never kill`);
    }
  });
});

describe('no turning around (forward-only heading clamp)', () => {
  const track = trackByKey('neon-ring');
  const { center } = barrierLoops(track, 128);

  // Tangent angle at the NEAREST segment to centerline index i — the same
  // segment clampHeadingForward reads (a vertex sits on two segments).
  // (nose-+Z yaw convention.)
  function tangentAt(i) {
    const near = closestOnPolyline(center[i], center);
    const a = center[near.segIndex];
    const b = center[(near.segIndex + 1) % center.length];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  it('forward and inside-hemisphere headings pass through untouched', () => {
    for (const i of [0, 10, 64, 100]) {
      const pos = center[i];
      const ta = tangentAt(i);
      assert.ok(Math.abs(clampHeadingForward(ta, pos, center) - ta) < 1e-9, `i=${i}: forward untouched`);
      assert.ok(Math.abs(clampHeadingForward(ta + 0.5, pos, center) - (ta + 0.5)) < 1e-9, `i=${i}: +0.5 untouched`);
      assert.ok(Math.abs(clampHeadingForward(ta - 1.2, pos, center) - (ta - 1.2)) < 1e-9, `i=${i}: -1.2 untouched`);
    }
  });

  it('backwards headings clamp to the forward hemisphere edge', () => {
    for (const i of [0, 10, 64, 100]) {
      const pos = center[i];
      const ta = tangentAt(i);
      const fwd = clampHeadingForward(ta + 2.0, pos, center);
      assert.ok(Math.abs(fwd - (ta + Math.PI / 2)) < 1e-9, `i=${i}: +2.0 clamps to +90deg`);
      const back = clampHeadingForward(ta - 2.5, pos, center);
      assert.ok(Math.abs(back - (ta - Math.PI / 2)) < 1e-9, `i=${i}: -2.5 clamps to -90deg`);
      const rev = clampHeadingForward(ta + Math.PI, pos, center);
      assert.ok(Math.abs(rev - (ta + Math.PI / 2)) < 1e-9, `i=${i}: full reverse clamps to +90deg`);
    }
  });

  it('a rider steering into a U-turn is held at sideways, never reversed', () => {
    // Simulate holding full steer from straight ahead: the heading walks
    // away from the tangent and must pin at +90deg, never past it.
    const pos = center[20];
    const ta = tangentAt(20);
    let heading = ta;
    for (let step = 0; step < 600; step++) {
      heading = clampHeadingForward(heading + 0.01, pos, center);
    }
    let err = heading - ta;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    assert.ok(Math.abs(err - Math.PI / 2) < 1e-9, `pinned at +90deg, got ${err}`);
  });

  it('holds on every track in the widened roster', () => {
    for (const t of TRACKS) {
      const { center: c } = barrierLoops(t, 128);
      for (let i = 0; i < c.length; i += 16) {
        const a = c[i];
        const near = closestOnPolyline(a, c);
        const s0 = c[near.segIndex];
        const s1 = c[(near.segIndex + 1) % c.length];
        const ta = Math.atan2(s1.x - s0.x, s1.z - s0.z);
        const clamped = clampHeadingForward(ta + Math.PI, a, c);
        let err = clamped - ta;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        assert.ok(Math.abs(err) <= Math.PI / 2 + 1e-9, `${t.key}@${i}: must stay in forward hemisphere`);
      }
    }
  });
});

describe('lap counting', () => {
  const track = trackByKey('neon-ring');
  const { center } = barrierLoops(track, 128);

  // Start the simulated ride mid-loop (index 32): the lap line sits at
  // index 0, and starting exactly ON it would push the side-flip onto the
  // first step of the following loop — a test-boundary artifact, not a bug.
  function rideLoop(tracker, t0, startIdx = 32) {
    // ride the full centerline once, forward, at constant speed
    let time = t0;
    const speed = 40;
    for (let k = 0; k < center.length; k++) {
      const i = (startIdx + k) % center.length;
      const a = center[i];
      const b = center[(i + 1) % center.length];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.ceil(segLen / 4));
      for (let sN = 0; sN <= steps; sN++) {
        const f = sN / steps;
        const px = a.x + (b.x - a.x) * f;
        const pz = a.z + (b.z - a.z) * f;
        time += 4 / speed;
        const ev = tracker.update({ x: px, z: pz }, { x: (b.x - a.x) / (segLen || 1) * speed, z: (b.z - a.z) / (segLen || 1) * speed }, time);
        if (ev) return { ev, time };
      }
    }
    return { ev: null, time };
  }

  it('counts one lap per clean loop', () => {
    const tracker = new LapTracker(center);
    let time = 0;
    // Gun lap: the first forward crossing STARTS the race (starts the
    // clock) but does NOT count a lap — the old armed=true counted the
    // start crossing as a full lap, so a 1-lap race "finished" 0.8s after
    // spawn (see race.js). The first rideLoop is the gun lap.
    const gun = rideLoop(tracker, time);
    time = gun.time;
    assert.equal(gun.ev, null, 'gun lap must not count');
    assert.equal(tracker.laps, 0);
    for (let lap = 1; lap <= 3; lap++) {
      const { ev, time: t2 } = rideLoop(tracker, time);
      time = t2;
      assert.equal(ev, 'lap', `lap ${lap} should count`);
      assert.equal(tracker.laps, lap);
    }
  });

  it('wrong-direction crossing does not count', () => {
    const tracker = new LapTracker(center);
    // walk backward across the line
    const p0 = center[0];
    const p1 = center[1];
    const dx = p0.x - p1.x;
    const dz = p0.z - p1.z;
    const l = Math.hypot(dx, dz) || 1;
    tracker.update({ x: p1.x, z: p1.z }, { x: 0, z: 0 }, 0);
    const ev = tracker.update({ x: p0.x - (dx / l) * 2, z: p0.z - (dz / l) * 2 }, { x: (dx / l) * 10, z: (dz / l) * 10 }, 1);
    assert.equal(ev, null);
    assert.equal(tracker.laps, 0);
  });

  it('line-farming without the midway checkpoint does not count', () => {
    const tracker = new LapTracker(center);
    tracker.armed = false; // simulate having just crossed
    const p0 = center[0];
    const p1 = center[1];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const l = Math.hypot(dx, dz) || 1;
    tracker.update({ x: p0.x - (dx / l) * 3, z: p0.z - (dz / l) * 3 }, { x: 0, z: 0 }, 0);
    const ev = tracker.update(
      { x: p0.x + (dx / l) * 3, z: p0.z + (dz / l) * 3 },
      { x: (dx / l) * 10, z: (dz / l) * 10 },
      1
    );
    assert.equal(ev, null);
    assert.equal(tracker.laps, 0);
  });

  it('records lap times', () => {
    const tracker = new LapTracker(center);
    let time = 0;
    ({ time } = rideLoop(tracker, time));
    ({ time } = rideLoop(tracker, time));
    assert.ok(tracker.lastLapTime > 0, 'should record a lap time');
  });
});

// ---------------------------------------------------------------- prefs
describe('rider prefs (account-scoped)', () => {
  it('keys are namespaced per account, device fallback otherwise', () => {
    assert.equal(shadowKey('abc123'), 'shadow:v1:account:abc123');
    assert.equal(shadowKey(''), 'shadow:v1:device');
    assert.equal(shadowKey(null), 'shadow:v1:device');
  });

  it('scoping rule is encoded as data', () => {
    assert.equal(SHADOW_SCOPING.riderPrefs, 'per-account');
    assert.equal(SHADOW_SCOPING.leaderboards, 'universal');
  });

  it('round-trips prefs and never leaks across accounts', () => {
    const store = memStore();
    savePrefs(store, 'acct-a', { vehicleKey: 'wisp', schemeKey: 'ares-red' });
    savePrefs(store, 'acct-b', { vehicleKey: 'atlas', schemeKey: 'legacy' });
    const a = loadPrefs(store, 'acct-a');
    const b = loadPrefs(store, 'acct-b');
    assert.equal(a.vehicleKey, 'wisp');
    assert.equal(a.schemeKey, 'ares-red');
    assert.equal(b.vehicleKey, 'atlas');
    assert.equal(b.schemeKey, 'legacy');
  });

  it('falls back to defaults on missing or corrupt data', () => {
    const store = memStore();
    assert.deepEqual(loadPrefs(store, 'nobody'), DEFAULT_PREFS);
    store.setItem(shadowKey('x'), 'not-json{{{');
    assert.deepEqual(loadPrefs(store, 'x'), DEFAULT_PREFS);
  });
});

// ---------------------------------------------------------------- launch
describe('entry contract', () => {
  it('route is /shadow-realm', () => {
    assert.equal(SHADOW_REALM_ROUTE, '/shadow-realm');
  });

  it('parses mode, defaulting to race', () => {
    assert.equal(parseShadowMode('race'), 'race');
    assert.equal(parseShadowMode('roam'), 'roam');
    assert.equal(parseShadowMode('ROAM'), 'roam');
    assert.equal(parseShadowMode('bogus'), 'race');
    assert.equal(parseShadowMode(null), 'race');
  });

  it('builds hub-linkable URLs', () => {
    assert.equal(shadowRealmUrl('race'), '/shadow-realm?mode=race');
    assert.equal(shadowRealmUrl('roam'), '/shadow-realm?mode=roam');
    assert.equal(
      shadowRealmUrl('race', { track: 'volcano', vehicle: 'wisp' }),
      '/shadow-realm?mode=race&track=volcano&vehicle=wisp'
    );
  });
});
