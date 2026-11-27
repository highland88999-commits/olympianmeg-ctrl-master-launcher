// tests/hub-baseball-flight.test.mjs
// Headless tests for lib/hub-baseball/flight.js — seeded ball flight.
// Run: node --test tests/hub-baseball-flight.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_MAX_SPEED,
  EAT_MARGIN,
  LAUNCH_SPEED,
  MAX_RANGE_M,
  createFlight,
  endFlight,
  generateHoles,
  stepFlight,
} from '../lib/hub-baseball/flight.js';
import { BALL_REST, PLATE_POS } from '../lib/hub-baseball/placement.js';

function speedOf(st) {
  return Math.sqrt(st.vel.x ** 2 + st.vel.y ** 2 + st.vel.z ** 2);
}

function stepMany(st, input, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) stepFlight(st, input, dt);
  return st;
}

/** Yaw change wrapped to [-π, π] — atan2 re-derives yaw, so a turn
 *  past ±π wraps (launch yaw is π, so a left turn wraps at once). */
function yawDelta(from, to) {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

describe('launch', () => {
  it('launches at LAUNCH_SPEED, outward from the hub and slightly up', () => {
    const st = createFlight({ seed: 7 });
    assert.equal(Math.round(speedOf(st)), LAUNCH_SPEED);
    // Outward from the hub centre: the rest sits past the asteroid
    // belt at [-320, 25, -620], so "outward" is the radial direction
    // through the rest — mostly -X and -Z, away from the hub.
    const outward = { x: -320, z: -540 };
    const oLen = Math.hypot(outward.x, outward.z);
    const along = (st.vel.x * outward.x + st.vel.z * outward.z) / oLen;
    assert.ok(along > 190, `outward speed ${along} should be ~cruise`);
    assert.ok(st.vel.x < -90, `vel.x ${st.vel.x} should point -X (outward)`);
    assert.ok(st.vel.z < -160, `vel.z ${st.vel.z} should point -Z (outward)`);
    // Small +up component from the launch pitch.
    assert.ok(st.vel.y > 0 && st.vel.y < 30, `vel.y ${st.vel.y} should be small and positive`);
    // Starts at the ball rest, past the asteroid belt.
    assert.deepEqual([st.pos.x, st.pos.y, st.pos.z], BALL_REST);
    assert.deepEqual(st.origin, BALL_REST);
    assert.deepEqual(st.plate, PLATE_POS);
    assert.equal(st.ended, false);
    assert.equal(st.eaten, false);
    assert.equal(st.distanceM, 0);
    assert.equal(st.maxDistanceM, 0);
  });

  it('spawns 6 holes, 2 per band, radii 60-140, in their bands', () => {
    const holes = generateHoles(7);
    assert.equal(holes.length, 6);
    for (const band of ['close', 'mid', 'far']) {
      assert.equal(holes.filter((h) => h.band === band).length, 2, band);
    }
    for (const h of holes) {
      assert.ok(h.radius >= 60 && h.radius <= 140, `radius ${h.radius}`);
      const d = Math.hypot(h.center.x - BALL_REST[0], h.center.y - BALL_REST[1], h.center.z - BALL_REST[2]);
      assert.ok(Math.abs(d - h.distance) < 1e-6, 'hole distance matches its centre');
      const [lo, hi] = h.band === 'close' ? [250, 500] : h.band === 'mid' ? [500, 1000] : [1000, 1600];
      assert.ok(h.distance >= lo && h.distance <= hi, `${h.band} hole at ${h.distance}`);
    }
  });
});

describe('steering', () => {
  it('steer yaws the heading (right = decreasing yaw, bike convention)', () => {
    const st = createFlight({ seed: 7 });
    st.holes = []; // isolate steering from black-hole gravity
    const yaw0 = st.yaw;
    stepMany(st, { throttle: 0, steer: 1, vertical: false }, 1);
    assert.ok(yawDelta(yaw0, st.yaw) < -0.5, `yaw delta ${yawDelta(yaw0, st.yaw)} should drop with right steer`);
    // Heading actually changed: facing -Z, a right turn swings the
    // velocity toward +X (right = forward x up for a -Z heading).
    assert.ok(st.vel.x > 50, `vel.x ${st.vel.x} should swing toward +X on a right turn`);
  });

  it('left steer turns the other way', () => {
    const st = createFlight({ seed: 7 });
    st.holes = [];
    const yaw0 = st.yaw;
    stepMany(st, { throttle: 0, steer: -1, vertical: false }, 1);
    assert.ok(yawDelta(yaw0, st.yaw) > 0.5, `yaw delta ${yawDelta(yaw0, st.yaw)} should rise with left steer`);
    assert.ok(st.vel.x < -50, `vel.x ${st.vel.x} should swing toward -X on a left turn`);
  });

  it('vertical-axis stick pitches the ball up and down', () => {
    const up = createFlight({ seed: 7 });
    up.holes = [];
    const pitch0 = up.pitch;
    stepMany(up, { throttle: 1, steer: 0, vertical: true }, 1);
    assert.ok(up.pitch > pitch0 + 0.3, `pitch ${pitch0} -> ${up.pitch} should climb`);

    const down = createFlight({ seed: 7 });
    down.holes = [];
    stepMany(down, { throttle: -1, steer: 0, vertical: true }, 1);
    assert.ok(down.pitch < pitch0 - 0.3, `pitch ${pitch0} -> ${down.pitch} should dive`);
  });

  it('throttle scales speed 0.5x-1.5x of cruise and the ball never stops', () => {
    const slow = createFlight({ seed: 7 });
    slow.holes = [];
    stepMany(slow, { throttle: -1, steer: 0, vertical: false }, 3);
    assert.ok(slow.speed >= 95 && slow.speed <= 105, `full-back speed ${slow.speed} should be ~100`);

    const fast = createFlight({ seed: 7 });
    fast.holes = [];
    stepMany(fast, { throttle: 1, steer: 0, vertical: false }, 3);
    assert.ok(fast.speed >= 295 && fast.speed <= 305, `full-forward speed ${fast.speed} should be ~300`);
    assert.ok(fast.speed <= BALL_MAX_SPEED);
  });
});

describe('black holes', () => {
  it('gravity pulls the ball toward a hole off its path', () => {
    // Hole 100 m to the side of the launch path: 200 m along the
    // launch direction from the rest, then 100 m sideways (perp of the
    // launch dir). The pull bends the ball toward the hole vs control.
    const probe = createFlight({ seed: 7 });
    const sp = Math.hypot(probe.vel.x, probe.vel.z);
    const dx = probe.vel.x / sp, dz = probe.vel.z / sp;
    const hole = {
      band: 'close',
      distance: 100,
      radius: 60,
      center: {
        x: BALL_REST[0] + dx * 200 - dz * 100,
        y: BALL_REST[1] + 16,
        z: BALL_REST[2] + dz * 200 + dx * 100,
      },
    };
    const withHole = createFlight({ seed: 7 });
    withHole.holes = [hole];
    const control = createFlight({ seed: 7 });
    control.holes = [];
    stepMany(withHole, { throttle: 0, steer: 0, vertical: false }, 1);
    stepMany(control, { throttle: 0, steer: 0, vertical: false }, 1);
    // Same launch, same input — the only difference is the hole's pull.
    assert.ok(withHole.pos.x > control.pos.x + 10,
      `ball x ${withHole.pos.x} should bend toward the hole vs control ${control.pos.x}`);
  });

  it('eat triggers when the ball centre enters a hole', () => {
    const st = createFlight({ seed: 7 });
    const hole = { band: 'close', distance: 300, radius: 100, center: { x: 0, y: 150, z: -380 } };
    st.holes = [hole];
    // Ball centre 50 m from the hole centre: inside radius + BALL_RADIUS*0.5.
    st.pos = { x: 0, y: 150, z: -330 };
    st.distanceM = 250;
    st.maxDistanceM = 250;
    stepFlight(st, { throttle: 0, steer: 0, vertical: false }, 1 / 60);
    assert.equal(st.eaten, true);
    assert.equal(st.ended, true);
    assert.equal(st.reason, 'eaten');
  });

  it('a finished flight does not move', () => {
    const st = createFlight({ seed: 7 });
    endFlight(st, 'quit');
    const before = { ...st.pos };
    stepFlight(st, { throttle: 1, steer: 1, vertical: false }, 1);
    assert.deepEqual(st.pos, before);
  });
});

describe('range and ending', () => {
  it('flight ends with reason range past MAX_RANGE_M from the flight origin', () => {
    const st = createFlight({ seed: 7 });
    st.holes = [];
    // 1700 m out along the launch direction from the rest, then one
    // second of cruise (~200 m) carries it past 1800 m.
    const sp = Math.hypot(st.vel.x, st.vel.y, st.vel.z);
    st.pos = {
      x: BALL_REST[0] + (st.vel.x / sp) * 1700,
      y: BALL_REST[1] + (st.vel.y / sp) * 1700,
      z: BALL_REST[2] + (st.vel.z / sp) * 1700,
    };
    st.distanceM = 1700;
    st.maxDistanceM = 1700;
    stepMany(st, { throttle: 0, steer: 0, vertical: false }, 1);
    assert.equal(st.ended, true);
    assert.equal(st.reason, 'range');
    assert.ok(st.maxDistanceM > MAX_RANGE_M, `max ${st.maxDistanceM} should pass ${MAX_RANGE_M}`);
  });

  it('endFlight sets ended + reason (quit path)', () => {
    const st = createFlight({ seed: 7 });
    endFlight(st, 'quit');
    assert.equal(st.ended, true);
    assert.equal(st.reason, 'quit');
  });

  it('maxDistanceM tracks the furthest point from the flight origin', () => {
    const st = createFlight({ seed: 7 });
    st.holes = [];
    stepMany(st, { throttle: 0, steer: 0, vertical: false }, 2);
    assert.ok(st.maxDistanceM > 350, `maxDistanceM ${st.maxDistanceM} should grow with flight`);
    assert.ok(st.maxDistanceM >= st.distanceM);
  });
});

describe('determinism', () => {
  it('same seed -> identical hole layout', () => {
    assert.deepEqual(generateHoles(42), generateHoles(42));
    assert.deepEqual(createFlight({ seed: 42 }).holes, createFlight({ seed: 42 }).holes);
  });

  it('different seed -> different hole layout', () => {
    const a = generateHoles(1);
    const b = generateHoles(2);
    const same = a.every((h, i) =>
      h.center.x === b[i].center.x && h.center.y === b[i].center.y &&
      h.center.z === b[i].center.z && h.radius === b[i].radius);
    assert.equal(same, false);
  });

  it('same seed + same inputs -> identical flight path', () => {
    const run = () => {
      const st = createFlight({ seed: 9 });
      stepMany(st, { throttle: 0.5, steer: 0.2, vertical: false }, 2);
      return st;
    };
    const a = run();
    const b = run();
    assert.deepEqual(a.pos, b.pos);
    assert.deepEqual(a.vel, b.vel);
    assert.equal(a.maxDistanceM, b.maxDistanceM);
  });
});
