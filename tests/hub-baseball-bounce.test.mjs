// tests/hub-baseball-bounce.test.mjs
// Headless tests for lib/hub-baseball/colliders.js + the bounce wiring
// in lib/hub-baseball/flight.js — Merlin, Nov 27, 2026: "No passing
// through for the ball. Bouncing off of and changing direction
// according to the physics of how it hits" + "Anything."
// Run: node --test tests/hub-baseball-bounce.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNCE_RESTITUTION,
  buildColliders,
  countColliders,
  reflectVelocity,
  resolveBounces,
} from '../lib/hub-baseball/colliders.js';
import { createFlight, stepFlight } from '../lib/hub-baseball/flight.js';
import { BALL_RADIUS, BALL_REST } from '../lib/hub-baseball/placement.js';
import { EARTH_CENTER, MARS_CENTER, menuSatellitePosition } from '../lib/god-orbits.js';
import { SUN_CENTER } from '../lib/omega-arch.js';
import { moonPositionAt } from '../lib/hub-layout.js';
import { makeBelt, asteroidPositionAt } from '../lib/asteroid-belt.js';

const approx = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

function speedOf(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function stepMany(st, input, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) stepFlight(st, input, dt);
  return st;
}

describe('reflectVelocity — real impact physics', () => {
  it('head-on bounce reverses the normal component, speed kept', () => {
    const v = reflectVelocity({ x: 0, y: 0, z: -200 }, { x: 0, y: 0, z: 1 });
    assert.deepEqual(v, { x: 0, y: 0, z: 200 });
    assert.equal(speedOf(v), 200);
  });

  it('45° incidence reflects at 45°: tangential kept, normal flips', () => {
    const v = reflectVelocity({ x: 100, y: 0, z: -100 }, { x: 0, y: 0, z: 1 });
    approx(v.x, 100, 1e-9, 'tangential kept');
    approx(v.z, 100, 1e-9, 'normal flips');
    approx(speedOf(v), Math.hypot(100, 100), 1e-9, 'speed kept');
  });

  it('restitution is 1.0: a bounce never slows the ball', () => {
    assert.equal(BOUNCE_RESTITUTION, 1.0);
    const v = reflectVelocity({ x: 60, y: -80, z: 120 }, { x: 0, y: 1, z: 0 });
    approx(speedOf(v), speedOf({ x: 60, y: -80, z: 120 }), 1e-9, 'speed kept');
    assert.deepEqual(v, { x: 60, y: 80, z: 120 });
  });

  it('the restitution parameter itself works (e=0.5 halves the normal)', () => {
    const v = reflectVelocity({ x: 0, y: -100, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5);
    assert.deepEqual(v, { x: 0, y: 50, z: 0 });
  });
});

describe('buildColliders — the bounce set', () => {
  it('counts: 128 spheres, 24 tower boxes, 1 Saturn ring disc', () => {
    const c = buildColliders(0);
    assert.deepEqual(countColliders(c), { spheres: 128, boxes: 24, rings: 1, total: 153 });
  });

  it('contains every solid by name — and nothing else', () => {
    const c = buildColliders(0);
    const ids = [...c.spheres.map((s) => s.id), ...c.boxes.map((b) => b.id), ...c.rings.map((r) => r.id)];
    for (const want of ['earth', 'mars', 'sun', 'blue-star', 'moon', 'scoreboard',
      'planet-jupiter', 'planet-saturn', 'planet-neptune', 'planet-uranus',
      'planet-venus', 'planet-tempest', 'planet-vesta', 'planet-mercury',
      'rings-saturn', 'god-planet-0', 'god-planet-23', 'asteroid-0', 'asteroid-89']) {
      assert.ok(ids.includes(want), `missing ${want}`);
    }
    assert.equal(c.boxes.filter((b) => b.id.startsWith('tower-')).length, 24);
    // No starfield (background points, no surface), no plate (the
    // batting marker — the ball rests against it), no Mars system
    // rings (0.2 tube, no surface at ball scale), no bike.
    for (const banned of ['starfield', 'plate', 'system-ring', 'bike']) {
      assert.ok(!ids.some((id) => id.includes(banned)), `must not contain ${banned}`);
    }
  });

  it('moving bodies are analytic in the orbit clock', () => {
    const c0 = buildColliders(0);
    const god0 = c0.spheres.find((s) => s.id === 'god-planet-0');
    assert.deepEqual(god0.centerAt(0), menuSatellitePosition(0, 0));
    assert.deepEqual(god0.centerAt(100), menuSatellitePosition(0, 100));
    assert.notDeepEqual(god0.centerAt(0), god0.centerAt(100), 'god planet moves');
    const moon = c0.spheres.find((s) => s.id === 'moon');
    assert.deepEqual(moon.centerAt(0), moonPositionAt(0));
    assert.notDeepEqual(moon.centerAt(0), moon.centerAt(60), 'moon moves (quarter orbit)');
    const rock0 = c0.spheres.find((s) => s.id === 'asteroid-0');
    const belt = makeBelt();
    assert.deepEqual(rock0.centerAt(0), asteroidPositionAt(belt[0], 0));
    assert.notDeepEqual(rock0.centerAt(0), rock0.centerAt(500), 'rock drifts');
  });

  it('the bounce set is deterministic per orbit time', () => {
    const a = buildColliders(1234);
    const b = buildColliders(1234);
    for (let i = 0; i < a.spheres.length; i++) {
      assert.deepEqual(a.spheres[i].centerAt(0), b.spheres[i].centerAt(0));
    }
  });
});

describe('resolveBounces — spheres', () => {
  it('head-on bounce reverses the velocity, speed kept, never inside', () => {
    // A lone sphere: the exact reflection, no neighbours in the way.
    const solo = {
      spheres: [
        { kind: 'sphere', id: 'earth', radius: 55, centerAt: () => ({ x: 0, y: -30, z: -80 }) },
      ],
      boxes: [],
      rings: [],
    };
    const res = resolveBounces(
      { x: 0, y: 200, z: -80 }, { x: 0, y: -20, z: -80 },
      { x: 0, y: -200, z: 0 }, solo, 0, BALL_RADIUS,
    );
    assert.deepEqual(res.hits, ['earth']);
    assert.deepEqual(res.vel, { x: 0, y: 200, z: 0 });
    // Contact at y=80 (110 from Earth's centre); the remaining 100 of
    // the step carries on up: 80.05 + 100.
    approx(res.pos.y, 180.05, 0.01, 'pos y after bounce');
    assert.ok(dist3(res.pos, EARTH_CENTER) >= 55 + BALL_RADIUS, 'never ends inside Earth');
  });

  it('the real Earth bounces the ball (approached from below the tower ring)', () => {
    // The blue giant star sits directly above Earth and the tower
    // boxes wall the ring at y -56..131, so the clean approach to
    // Earth comes from below: (300,-200,-80) -> (-100,50,-80) dives
    // under the towers (y -112 at the ring) and clears the star by ~28.
    const c = buildColliders(0);
    const dir = { x: -400, y: 250, z: 0 };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= len;
    dir.y /= len;
    const res = resolveBounces(
      { x: 300, y: -200, z: -80 }, { x: -100, y: 50, z: -80 },
      { x: dir.x * 200, y: dir.y * 200, z: 0 }, c, 0, BALL_RADIUS,
    );
    assert.equal(res.hits[0], 'earth');
    approx(speedOf(res.vel), 200, 1e-9, 'speed kept');
    assert.ok(dist3(res.pos, EARTH_CENTER) >= 55 + BALL_RADIUS, 'never ends inside Earth');
    const away = (res.pos.x - EARTH_CENTER.x) * res.vel.x
      + (res.pos.y - EARTH_CENTER.y) * res.vel.y
      + (res.pos.z - EARTH_CENTER.z) * res.vel.z;
    assert.ok(away > 0, 'ball moves away from Earth after the bounce');
  });

  it('45° off Jupiter: tangential kept, normal flips, speed kept', () => {
    const c = buildColliders(0);
    // Surface point on Jupiter's +X side; incoming at 45° to the normal.
    const s = { x: -560 + 88 + 55, y: 150, z: -140 };
    const vDir = { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 };
    const prev = { x: s.x - vDir.x * 100, y: s.y, z: s.z - vDir.z * 100 };
    const pos = { x: s.x + vDir.x * 100, y: s.y, z: s.z + vDir.z * 100 };
    const res = resolveBounces(prev, pos, { x: vDir.x * 200, y: 0, z: vDir.z * 200 }, c, 0, BALL_RADIUS);
    assert.deepEqual(res.hits, ['planet-jupiter']);
    approx(res.vel.x, 141.42, 0.01, 'normal flips to +X');
    approx(res.vel.z, 141.42, 0.01, 'tangential kept');
    approx(speedOf(res.vel), 200, 1e-9, 'speed kept');
  });

  it('a segment that misses everything is untouched', () => {
    // Far out in open space, past every body: no phantom hits.
    const c = buildColliders(0);
    const prev = { x: 2000, y: 2000, z: 2000 };
    const pos = { x: 1800, y: 2000, z: 2000 };
    const vel = { x: -200, y: 0, z: 0 };
    const res = resolveBounces(prev, pos, vel, c, 0, BALL_RADIUS);
    assert.deepEqual(res.hits, []);
    assert.deepEqual(res.pos, pos);
    assert.deepEqual(res.vel, vel);
  });

  it('two bounces in one step (synthetic pair) both redirect', () => {
    const pair = {
      spheres: [
        { kind: 'sphere', id: 'a', radius: 10, centerAt: () => ({ x: 0, y: 0, z: 0 }) },
        { kind: 'sphere', id: 'b', radius: 10, centerAt: () => ({ x: 0, y: 0, z: 100 }) },
      ],
      boxes: [],
      rings: [],
    };
    const res = resolveBounces(
      { x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: -60 },
      { x: 0, y: 0, z: -200 }, pair, 0, 5,
    );
    assert.deepEqual(res.hits, ['a', 'b']);
    assert.deepEqual(res.vel, { x: 0, y: 0, z: -200 });
    approx(res.pos.z, 79.9, 0.01, 'ends back between the pair');
  });
});

describe('resolveBounces — towers, rings, stars, moving bodies', () => {
  it('a tower box bounces the ball off its face', () => {
    const box = {
      spheres: [],
      boxes: [
        { kind: 'box', id: 'tower', half: { x: 10, y: 10, z: 10 }, yaw: 0, centerAt: () => ({ x: 0, y: 0, z: 0 }) },
      ],
      rings: [],
    };
    const res = resolveBounces(
      { x: 0, y: 0, z: -30 }, { x: 0, y: 0, z: 5 },
      { x: 0, y: 0, z: 200 }, box, 0, 5,
    );
    assert.deepEqual(res.hits, ['tower']);
    assert.deepEqual(res.vel, { x: 0, y: 0, z: -200 });
    approx(res.pos.z, -35.05, 0.01, 'ends back outside the face');
    assert.ok(res.pos.z < -15, 'never ends inside the expanded box');
  });

  it('Saturn’s ring disc bounces the ball; the gap beside it does not', () => {
    const c = buildColliders(0);
    const centre = { x: 430, y: 260, z: -420 };
    const n = { x: -Math.sin(0.42), y: Math.cos(0.42), z: 0 };
    const e1 = { x: Math.cos(0.42), y: Math.sin(0.42), z: 0 };
    const atRadial = (r) => ({
      x: centre.x + e1.x * r,
      y: centre.y + e1.y * r,
      z: centre.z,
    });
    const vel = { x: -n.x * 200, y: -n.y * 200, z: 0 };
    // Through the disc at radial 120: inside the annulus (78–132)
    // AND outside Saturn's expanded sphere (60 + 55 = 115) — the
    // only window where the ring itself can be hit.
    const p = atRadial(120);
    const hit = resolveBounces(
      { x: p.x + n.x * 120, y: p.y + n.y * 120, z: p.z },
      { x: p.x - n.x * 120, y: p.y - n.y * 120, z: p.z },
      vel, c, 0, BALL_RADIUS,
    );
    assert.deepEqual(hit.hits, ['rings-saturn']);
    approx(speedOf(hit.vel), 200, 1e-9, 'speed kept off the ring');
    const dHit = (hit.pos.x - centre.x) * n.x + (hit.pos.y - centre.y) * n.y;
    assert.ok(dHit > BALL_RADIUS, 'ends on the incoming side of the plane');
    // Through the plane at radial 150 (outside the disc): no ring, no hit.
    const p2 = atRadial(150);
    const miss = resolveBounces(
      { x: p2.x + n.x * 120, y: p2.y + n.y * 120, z: p2.z },
      { x: p2.x - n.x * 120, y: p2.y - n.y * 120, z: p2.z },
      vel, c, 0, BALL_RADIUS,
    );
    assert.deepEqual(miss.hits, []);
  });

  it('stars with surfaces bounce: the Sun and the blue giant star', () => {
    const c = buildColliders(0);
    const sun = resolveBounces(
      { x: SUN_CENTER.x + 300, y: SUN_CENTER.y, z: SUN_CENTER.z },
      { x: SUN_CENTER.x - 100, y: SUN_CENTER.y, z: SUN_CENTER.z },
      { x: -200, y: 0, z: 0 }, c, 0, BALL_RADIUS,
    );
    assert.deepEqual(sun.hits, ['sun']);
    assert.deepEqual(sun.vel, { x: 200, y: 0, z: 0 });
    const star = resolveBounces(
      { x: 300, y: 150, z: -80 }, { x: -100, y: 150, z: -80 },
      { x: -200, y: 0, z: 0 }, c, 0, BALL_RADIUS,
    );
    assert.deepEqual(star.hits, ['blue-star']);
    assert.deepEqual(star.vel, { x: 200, y: 0, z: 0 });
  });

  it('a god planet bounces the ball — and has moved on by orbit time 1000', () => {
    const c0 = buildColliders(0);
    const p0 = menuSatellitePosition(0, 0);
    const hit = resolveBounces(
      { x: p0.x + 200, y: p0.y, z: p0.z },
      { x: p0.x - 100, y: p0.y, z: p0.z },
      { x: -200, y: 0, z: 0 }, c0, 0, BALL_RADIUS,
    );
    assert.deepEqual(hit.hits, ['god-planet-0']);
    const c1000 = buildColliders(1000);
    const miss = resolveBounces(
      { x: p0.x + 200, y: p0.y, z: p0.z },
      { x: p0.x - 100, y: p0.y, z: p0.z },
      { x: -200, y: 0, z: 0 }, c1000, 0, BALL_RADIUS,
    );
    assert.ok(!miss.hits.includes('god-planet-0'), 'planet moved away');
  });

  it('the Moon and a belt rock bounce the ball', () => {
    // Isolated single-collider lists (the real positions, from the
    // real build): the Moon's orbit threads the tower ring, so a
    // full-set approach would meet a tower first — the contact math
    // for the moving bodies is what's pinned here.
    const c = buildColliders(0);
    const moonOnly = {
      spheres: c.spheres.filter((s) => s.id === 'moon'),
      boxes: [],
      rings: [],
    };
    const m = moonPositionAt(0);
    const moonHit = resolveBounces(
      { x: m.x + 200, y: m.y, z: m.z },
      { x: m.x - 100, y: m.y, z: m.z },
      { x: -200, y: 0, z: 0 }, moonOnly, 0, BALL_RADIUS,
    );
    assert.deepEqual(moonHit.hits, ['moon']);
    const rockOnly = {
      spheres: c.spheres.filter((s) => s.id === 'asteroid-0'),
      boxes: [],
      rings: [],
    };
    const rock = asteroidPositionAt(makeBelt()[0], 0);
    const rockHit = resolveBounces(
      { x: rock.x + 200, y: rock.y, z: rock.z },
      { x: rock.x - 100, y: rock.y, z: rock.z },
      { x: -200, y: 0, z: 0 }, rockOnly, 0, BALL_RADIUS,
    );
    assert.deepEqual(rockHit.hits, ['asteroid-0']);
  });
});

describe('flight-level bounce', () => {
  it('a ball aimed at Mars bounces, keeps its speed, and the flight goes on', () => {
    const st = createFlight({ seed: 7, orbitTime0: 0 });
    assert.equal(st.time, 0);
    assert.equal(st.bounces, 0);
    assert.equal(st.lastBounce, null);
    assert.ok(st.colliders && st.colliders.spheres.length === 128);
    st.holes = []; // isolate the bounce from black-hole gravity
    // Aim from 200 out of Mars's centre, head-on.
    const raw = {
      x: MARS_CENTER.x - BALL_REST[0],
      y: MARS_CENTER.y - BALL_REST[1],
      z: MARS_CENTER.z - BALL_REST[2],
    };
    const rawLen = Math.hypot(raw.x, raw.y, raw.z);
    const dir = { x: raw.x / rawLen, y: raw.y / rawLen, z: raw.z / rawLen };
    st.pos = {
      x: MARS_CENTER.x - dir.x * 200,
      y: MARS_CENTER.y - dir.y * 200,
      z: MARS_CENTER.z - dir.z * 200,
    };
    st.yaw = Math.atan2(dir.x, dir.z);
    st.pitch = Math.asin(dir.y);
    stepMany(st, { throttle: 0, steer: 0, vertical: false }, 1);
    assert.ok(st.bounces >= 1, `bounces ${st.bounces} should be ≥ 1`);
    assert.equal(st.lastBounce, 'mars');
    assert.equal(st.ended, false, 'a bounce never ends the flight');
    assert.equal(st.eaten, false);
    // Restitution 1.0 + throttle 0 (cruise 200): speed kept.
    approx(Math.hypot(st.vel.x, st.vel.y, st.vel.z), 200, 5, 'speed kept after bounce');
    // Moving away from Mars after the bounce.
    const away = (st.pos.x - MARS_CENTER.x) * st.vel.x
      + (st.pos.y - MARS_CENTER.y) * st.vel.y
      + (st.pos.z - MARS_CENTER.z) * st.vel.z;
    assert.ok(away > 0, 'ball moves away from Mars after the bounce');
    // Scoring is untouched by the bounce: the furthest point from the
    // origin still counts (contact was ~643 from the origin).
    assert.ok(st.maxDistanceM > 600 && st.maxDistanceM < 700, `max ${st.maxDistanceM}`);
    assert.ok(st.time > 0.9 && st.time < 1.1, `time ${st.time} tracks the flight`);
  });

  it('orbitTime0 pins the moving bodies to the swing', () => {
    const a = createFlight({ seed: 5, orbitTime0: 100 });
    const g = a.colliders.spheres.find((s) => s.id === 'god-planet-0');
    assert.deepEqual(g.centerAt(0), menuSatellitePosition(0, 100));
    const b = createFlight({ seed: 5, orbitTime0: 0 });
    const g0 = b.colliders.spheres.find((s) => s.id === 'god-planet-0');
    assert.deepEqual(g0.centerAt(0), menuSatellitePosition(0, 0));
    assert.notDeepEqual(g.centerAt(0), g0.centerAt(0));
  });

  it('the ball starts clear of every collider (no launch-time bounce)', () => {
    const st = createFlight({ seed: 7, orbitTime0: 0 });
    st.holes = [];
    stepMany(st, { throttle: 0, steer: 0, vertical: false }, 2);
    assert.equal(st.bounces, 0, 'a straight launch out hits nothing');
  });
});
