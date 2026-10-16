// tests/shadow-realm-trails.test.mjs — Headless tests for lethal light
// trails (Merlin 2026-10-03, the classic Tron rule): lib/shadow-realm/trails.js
// collision math, own-trail safety, immunity, respawn selection, beacon
// round-trip, and the AI avoidance helper.
//
// Run: node --test tests/shadow-realm-trails.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  Trail,
  TRAIL_SPACING,
  TRAIL_MAX_POINTS,
  TRAIL_LIFETIME_S,
  TRAIL_KILL_RADIUS,
  TRAIL_FRESH_S,
  TRAIL_IMMUNITY_S,
  BEACON_TRAIL_POINTS,
  TRAIL_HALF_WIDTH,
  TRAIL_RIBBON_Y,
  TRAIL_TAPER_START,
  TRAIL_PEAK_ALPHA,
  writeTrailRibbon,
  pointToSegmentDist,
  hitTest,
  checkRivalTrails,
  nearestTrailDist,
  findSafeSpot,
  serializeTrail,
  deserializeTrail,
} from '../lib/shadow-realm/trails.js';
import {
  makeBots,
  advanceBot,
  botPose,
  buildTrackData,
  trailAvoidance,
  respawnBot,
  BOT_TRAIL_IMMUNITY_S,
} from '../app/shadow-realm/ai.js';
import { beaconRow } from '../lib/shadow-realm/net.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

// Build a trail along +X from (0,0), one point per TRAIL_SPACING, stamped
// old enough to dodge the freshness skip.
function straightTrail(len = 20, now = 1000) {
  const t = new Trail();
  for (let i = 0; i <= len; i++) {
    t.points.push({ x: i * TRAIL_SPACING, z: 0, t: now - TRAIL_FRESH_S - 10 });
  }
  return t;
}

describe('Trail ring buffer', () => {
  it('records a point every TRAIL_SPACING of travel', () => {
    const t = new Trail();
    assert.equal(t.record(0, 0, 0), true);
    assert.equal(t.record(1, 0, 1), false, '1m < 2m spacing: no record');
    assert.equal(t.record(2, 0, 2), true);
    assert.equal(t.length, 2);
  });

  it('caps at TRAIL_MAX_POINTS (ring)', () => {
    const t = new Trail();
    for (let i = 0; i < TRAIL_MAX_POINTS + 50; i++) {
      t.record(i * TRAIL_SPACING, 0, i);
    }
    assert.equal(t.length, TRAIL_MAX_POINTS);
    // Oldest surviving point is #50.
    assert.equal(t.points[0].x, 50 * TRAIL_SPACING);
  });

  it('prunes points older than TRAIL_LIFETIME_S', () => {
    const t = new Trail();
    t.points.push({ x: 0, z: 0, t: 0 });   // age 161 -> pruned
    t.points.push({ x: 2, z: 0, t: 120 }); // age 41 -> survives
    const dropped = t.prune(161);
    assert.equal(dropped, 1);
    assert.equal(t.length, 1);
    assert.equal(t.points[0].x, 2);
  });

  it('constants match the spec', () => {
    assert.equal(TRAIL_SPACING, 2);
    assert.equal(TRAIL_MAX_POINTS, 600);
    assert.equal(TRAIL_LIFETIME_S, 60);
    assert.equal(TRAIL_IMMUNITY_S, 10);
  });
});

describe('pointToSegmentDist', () => {
  it('perpendicular distance', () => {
    assert.equal(pointToSegmentDist(5, 3, 0, 0, 10, 0), 3);
  });
  it('clamps to endpoints', () => {
    assert.equal(pointToSegmentDist(-4, 0, 0, 0, 10, 0), 4);
    assert.equal(pointToSegmentDist(14, 0, 0, 0, 10, 0), 4);
  });
  it('zero-length segment = point distance', () => {
    assert.equal(pointToSegmentDist(3, 4, 1, 1, 1, 1), Math.hypot(2, 3));
  });
});

describe('hitTest: lethal segments', () => {
  it('crossing a rival trail kills', () => {
    const t = straightTrail();
    assert.equal(hitTest(t, 10, 0, TRAIL_KILL_RADIUS, 1000), true);
  });
  it('grazing inside the kill radius kills', () => {
    const t = straightTrail();
    assert.equal(hitTest(t, 10, TRAIL_KILL_RADIUS * 0.9, TRAIL_KILL_RADIUS, 1000), true);
  });
  it('riding parallel outside the radius is safe', () => {
    const t = straightTrail();
    assert.equal(hitTest(t, 10, TRAIL_KILL_RADIUS * 2, TRAIL_KILL_RADIUS, 1000), false);
  });
  it('a trail with < 2 points never kills', () => {
    const t = new Trail();
    t.record(0, 0, 0);
    assert.equal(hitTest(t, 0, 0, TRAIL_KILL_RADIUS, 1000), false);
  });
  it('brand-fresh segments are forgiven (launch forgiveness)', () => {
    const t = new Trail();
    const now = 5000;
    t.points.push({ x: 0, z: 0, t: now - 0.5 });
    t.points.push({ x: 2, z: 0, t: now - 0.2 });
    assert.equal(hitTest(t, 1, 0, TRAIL_KILL_RADIUS, now), false);
    // ...but the same geometry aged past freshness is lethal.
    assert.equal(hitTest(t, 1, 0, TRAIL_KILL_RADIUS, now + TRAIL_FRESH_S + 1), true);
  });
});

describe('checkRivalTrails', () => {
  it('returns the trail owner on a kill', () => {
    const rivals = [{ trail: straightTrail(), name: 'RIVAL-3' }];
    const hit = checkRivalTrails(rivals, 10, 0, 1000, {});
    assert.deepEqual(hit, { owner: 'RIVAL-3' });
  });
  it('null when clear', () => {
    const rivals = [{ trail: straightTrail(), name: 'RIVAL-3' }];
    assert.equal(checkRivalTrails(rivals, 10, 50, 1000, {}), null);
  });
  it('immunity blocks the kill', () => {
    const rivals = [{ trail: straightTrail(), name: 'RIVAL-3' }];
    assert.equal(checkRivalTrails(rivals, 10, 0, 1000, { immune: true }), null);
  });
  it('skips malformed rival entries', () => {
    assert.equal(checkRivalTrails([null, {}, { trail: null }], 10, 0, 1000, {}), null);
  });
  it('own trail is never passed (caller contract) — documented', () => {
    // The lib trusts the caller to exclude the bike's own trail; the Rig
    // builds rival lists that never include self. This test pins the
    // contract: checkRivalTrails has no self concept.
    const own = straightTrail();
    const hit = checkRivalTrails([{ trail: own, name: 'ME' }], 10, 0, 1000, {});
    assert.deepEqual(hit, { owner: 'ME' }, 'if you pass your own trail it WOULD kill — so never pass it');
  });
});

describe('nearestTrailDist (AI avoidance input)', () => {
  it('finds the nearest approach and the point to steer from', () => {
    const rivals = [{ trail: straightTrail(), name: 'RIVAL-1' }];
    const n = nearestTrailDist(rivals, 10, 5, 1000, 10);
    assert.ok(n, 'found');
    assert.ok(Math.abs(n.dist - 5) < 1e-9, `dist ${n.dist}`);
    assert.equal(n.nx, 10);
    assert.equal(n.nz, 0);
  });
  it('null when nothing within maxDist', () => {
    const rivals = [{ trail: straightTrail(), name: 'RIVAL-1' }];
    assert.equal(nearestTrailDist(rivals, 10, 50, 1000, 10), null);
  });
});

describe('findSafeSpot (respawn)', () => {
  const line = [];
  for (let i = 0; i <= 40; i++) line.push({ x: i * 5, z: 0 });

  it('picks the nearest centerline point clear of rival trails', () => {
    // Rival trail covers x in [0, 40] at z=0.
    const rivals = [{ trail: straightTrail(20), name: 'R' }];
    const spot = findSafeSpot({ x: 100, z: 0, centerline: line, rivalTrails: rivals, now: 1000 });
    assert.ok(spot, 'found a spot');
    // x=100 is the nearest clear point (trail ends at x=40, 2x margin).
    assert.ok(spot.x >= 60, `spot.x ${spot.x} clear of the trail`);
  });

  it('falls back to the nearest point when nowhere is fully safe', () => {
    const t = new Trail();
    for (let i = 0; i <= 100; i++) t.points.push({ x: i * 2, z: 0, t: 0 });
    const spot = findSafeSpot({
      x: 100, z: 0, centerline: line,
      rivalTrails: [{ trail: t, name: 'R' }], now: 1000,
    });
    assert.ok(spot, 'fallback exists');
    assert.equal(spot.x, 100);
  });

  it('null centerline -> null', () => {
    assert.equal(findSafeSpot({ x: 0, z: 0, centerline: [], rivalTrails: [], now: 0 }), null);
  });
});

describe('beacon trail round-trip', () => {
  it('serialize -> deserialize preserves the shape', () => {
    const t = straightTrail(30);
    const arr = serializeTrail(t);
    assert.ok(arr.length <= BEACON_TRAIL_POINTS * 2, 'bounded payload');
    assert.equal(arr.length % 2, 0);
    const back = deserializeTrail(arr, 2000);
    assert.ok(back.length > 0);
    assert.equal(back.points[0].x, 0);
    // Quantized to integers.
    assert.ok(arr.every(Number.isInteger), 'integers only');
  });
  it('defensive: caps a lying beacon, skips junk', () => {
    const big = new Array((TRAIL_MAX_POINTS + 100) * 2).fill(7);
    const back = deserializeTrail(big, 0);
    assert.equal(back.length, TRAIL_MAX_POINTS);
    assert.equal(deserializeTrail('junk', 0).length, 0);
    assert.equal(deserializeTrail([1, NaN, 3], 0).length, 0);
  });
});

describe('Rig wiring (source checks)', () => {
  it('scene.jsx creates per-bike Trails and checks rivals only', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    assert.ok(scene.includes('lib/shadow-realm/trails'), 'imports the trail lib');
    assert.ok(scene.includes('new Trail()'), 'per-bike Trail objects');
    assert.ok(scene.includes('checkRivalTrails'), 'uses the rival check');
  });
  it('trails are lethal in race + bump, never in roam', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    assert.ok(scene.includes('trailsLethal'), 'lethality flag');
  });
  it('net.js beacon carries trail + deaths', () => {
    const net = src('lib/shadow-realm/net.js');
    assert.ok(net.includes('deaths'), 'deaths counter in beaconRow');
    assert.ok(net.includes('trail'), 'trail payload in beaconRow');
  });
  it('death effect: pixelated dissolve + burst + shield ring', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    assert.ok(scene.includes('DeathBurst'), 'particle burst component');
    assert.ok(scene.includes('shieldRef'), 'immunity shield ring');
    assert.ok(scene.includes('s.dying'), 'death animation timer');
  });
  it('HUD: immune pill + death toast', () => {
    const page = src('app/shadow-realm/page.jsx');
    assert.ok(page.includes('IMMUNE'), 'immunity pill');
    assert.ok(page.includes("SHREDDED BY"), 'death toast names the owner');
  });
});

describe('AI trail avoidance + death (ai.js)', () => {
  // Minimal fake track: straight 200m corridor along +X, width 14.
  function fakeTrack() {
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push({ x: i * 12.5, z: 0 });
    return {
      pts,
      cum: null, tx: null, tz: null, n: 17,
      lapLen: 200, halfW: 7, maxSpeed: 45, raceLaps: 3, accel: 30, brake: 60,
    };
  }
  // Build a real trackData via buildTrackData on a stub track object.
  function trackData() {
    const stub = {
      width: 14,
      center: () => {
        const p = [];
        for (let i = 0; i <= 32; i++) p.push({ x: i * 6.25, z: 0 });
        return p;
      },
    };
    // buildTrackData needs centerline(track, n) — use a direct fake instead.
    const td = fakeTrack();
    // Fill tx/tz/cum for sampleTrack.
    const n = td.pts.length;
    td.cum = new Float64Array(n);
    td.tx = new Float64Array(n);
    td.tz = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      td.cum[i] = total;
      const q = td.pts[Math.min(n - 1, i + 1)];
      total += Math.hypot(q.x - td.pts[i].x, q.z - td.pts[i].z);
    }
    for (let i = 0; i < n; i++) {
      td.tx[i] = 1;
      td.tz[i] = 0;
    }
    return td;
  }

  it('bots are born with a Trail', () => {
    const stub = { width: 14 };
    const bots = makeBots({ count: 2, track: stub, seed: 7 });
    assert.ok(bots[0].trail instanceof Trail, 'bot.trail is a Trail');
    assert.equal(bots[0].trailImmuneT, 0);
    assert.equal(bots[0].deadT, 0);
  });

  it('trailAvoidance steers away from a trail on the racing line', () => {
    const td = trackData();
    const bot = {
      s: 50, speed: 30, offset: 0,
      skill: { topSpeedFrac: 1, cornerFrac: 1, wobbleAmp: 0, wobblePhase: 0 },
    };
    // Rival trail straight ahead on the bot's line (z=0), aged past fresh.
    const rt = new Trail();
    for (let i = 0; i < 10; i++) rt.points.push({ x: 80 + i * 2, z: 0, t: 0 });
    const avoid = trailAvoidance(bot, td, [{ trail: rt, name: 'R' }], 1000);
    assert.notEqual(avoid, 0, 'steers away from the trap');
  });

  it('trailAvoidance returns 0 when clear', () => {
    const td = trackData();
    const bot = { s: 50, speed: 30, offset: 0 };
    const rt = new Trail();
    for (let i = 0; i < 10; i++) rt.points.push({ x: 80 + i * 2, z: 50, t: 0 });
    assert.equal(trailAvoidance(bot, td, [{ trail: rt, name: 'R' }], 1000), 0);
  });

  it('a bot riding a rival trail dies (deadT + deaths)', () => {
    const td = trackData();
    const bots = makeBots({ count: 1, track: { width: 14 }, seed: 11 });
    const bot = bots[0];
    bot.s = 50;
    bot.speed = 30;
    // Park a rival trail right on the bot's nose.
    const pose = botPose(bot, td);
    const rt = new Trail();
    rt.points.push({ x: pose.x - 4, z: pose.z, t: 0 });
    rt.points.push({ x: pose.x - 2, z: pose.z, t: 0 });
    rt.points.push({ x: pose.x, z: pose.z, t: 0 });
    rt.points.push({ x: pose.x + 2, z: pose.z, t: 0 });
    advanceBot(bot, 0.016, td, 0, null, [{ trail: rt, name: 'RIVAL-9' }], 1000);
    assert.ok(bot.deadT > 0, 'bot is dissolving');
    assert.equal(bot.deaths, 1);
  });

  it('an immune bot does not die on a rival trail', () => {
    const td = trackData();
    const bots = makeBots({ count: 1, track: { width: 14 }, seed: 13 });
    const bot = bots[0];
    bot.s = 50;
    bot.speed = 30;
    bot.trailImmuneT = BOT_TRAIL_IMMUNITY_S;
    const pose = botPose(bot, td);
    const rt = new Trail();
    rt.points.push({ x: pose.x - 2, z: pose.z, t: 0 });
    rt.points.push({ x: pose.x + 2, z: pose.z, t: 0 });
    advanceBot(bot, 0.016, td, 0, null, [{ trail: rt, name: 'R' }], 1000);
    assert.equal(bot.deadT, 0, 'no death while immune');
    assert.equal(bot.deaths, 0);
  });

  it('respawnBot clears the trail and grants immunity', () => {
    const td = trackData();
    const bots = makeBots({ count: 1, track: { width: 14 }, seed: 17 });
    const bot = bots[0];
    bot.s = 50;
    bot.trail.points.push({ x: 1, z: 1, t: 0 });
    respawnBot(bot, td, [], 1000);
    assert.equal(bot.trail.length, 0, 'trail cleared');
    assert.equal(bot.trailImmuneT, BOT_TRAIL_IMMUNITY_S);
    assert.equal(bot.speed, 0);
  });
});

describe('trail ribbon geometry (2026-10-15 demo: slab trails)', () => {
  const RGB = { r: 0.33, g: 0.88, b: 0.91 };

  // Ride a straight line along +Z, recording through the real Trail at a
  // constant speed — the ring buffer keeps one point per TRAIL_SPACING,
  // so cruise and boost produce the same spatial path at different ages.
  function rideTrail(speed, dist) {
    const t = new Trail();
    let now = 0;
    let z = 0;
    t.record(0, 0, 0);
    while (z < dist) {
      z += 0.5;
      now += 0.5 / speed;
      t.record(0, z, now);
    }
    return { trail: t, now };
  }

  function ribbonFor(trail, now) {
    const pos = new Float32Array(TRAIL_MAX_POINTS * 2 * 3);
    const col = new Float32Array(TRAIL_MAX_POINTS * 2 * 4);
    const n = writeTrailRibbon(trail.points, now, RGB, pos, col, TRAIL_MAX_POINTS);
    return { pos, col, n };
  }

  // Cross-section i: midpoint, width, alpha, read back from the arrays.
  function section(pos, col, i) {
    const o = i * 6;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    return {
      mx: (ax + bx) / 2, mz: (az + bz) / 2,
      width: Math.hypot(bx - ax, bz - az),
      // Float32 storage: compare against the plane with float tolerance.
      flat: Math.abs(ay - TRAIL_RIBBON_Y) < 1e-6 && Math.abs(by - TRAIL_RIBBON_Y) < 1e-6,
      alpha: col[i * 8 + 3],
    };
  }

  it('ribbon width is thin and constant at cruise AND boost speed', () => {
    for (const speed of [8, 55]) {
      const { trail, now } = rideTrail(speed, 400);
      const { pos, col, n } = ribbonFor(trail, now);
      assert.ok(n > 150, `drew the ride (n=${n})`);
      for (let i = 0; i < n; i++) {
        const s = section(pos, col, i);
        assert.ok(Math.abs(s.width - 2 * TRAIL_HALF_WIDTH) < 1e-5,
          `speed ${speed}: section ${i} width ${s.width} != ${2 * TRAIL_HALF_WIDTH}`);
      }
      // Regression bound vs the old 1.7-wide carpet.
      assert.ok(2 * TRAIL_HALF_WIDTH <= 0.3, 'ribbon stays a thin line of light');
    }
  });

  it('ribbon is a flat plane centered on the lethal centerline', () => {
    const { trail, now } = rideTrail(30, 200);
    const { pos, col, n } = ribbonFor(trail, now);
    for (let i = 0; i < n; i++) {
      const s = section(pos, col, i);
      const p = trail.points[trail.points.length - n + i];
      assert.ok(s.flat, `section ${i} leaves the ribbon plane`);
      assert.ok(Math.abs(s.mx - p.x) < 1e-9 && Math.abs(s.mz - p.z) < 1e-9,
        `section ${i} midpoint drifts off the trail point`);
    }
  });

  it('width stays constant through a turn', () => {
    const t = new Trail();
    let now = 0;
    for (let z = 0; z <= 60; z += 2) { t.record(0, z, now); now += 0.05; }
    for (let x = 2; x <= 60; x += 2) { t.record(x, 60, now); now += 0.05; }
    const { pos, col, n } = ribbonFor(t, now);
    for (let i = 0; i < n; i++) {
      const s = section(pos, col, i);
      assert.ok(Math.abs(s.width - 2 * TRAIL_HALF_WIDTH) < 1e-5,
        `corner section ${i} width ${s.width}`);
    }
  });

  it('alpha tapers by distance behind the head, never a uniform sheet', () => {
    // Fast ride: the whole trail is young, so the age fade is ~flat and
    // the distance taper is what shapes the alpha.
    const { trail, now } = rideTrail(55, 500);
    const { pos, col, n } = ribbonFor(trail, now);
    const alphaAt = (distBehind) => {
      const i = n - 1 - Math.round(distBehind / TRAIL_SPACING);
      return col[i * 8 + 3];
    };
    const head = alphaAt(0);
    assert.ok(head > 0 && head <= TRAIL_PEAK_ALPHA + 1e-6, `head alpha ${head}`);
    assert.ok(alphaAt(TRAIL_TAPER_START) > alphaAt(120), 'taper bites by 120 units back');
    assert.ok(alphaAt(120) > alphaAt(300), 'taper keeps falling to 300 units back');
    assert.ok(alphaAt(300) < head * 0.5, 'far tail is well under half the head alpha');
    // Non-increasing from head to tail on a uniform young trail.
    let prev = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      const a = col[i * 8 + 3];
      assert.ok(a <= prev + 1e-9, `alpha rises toward the tail at ${i}`);
      prev = a;
    }
  });

  it('a fresh spawn draws only its own points (no phantom slab)', () => {
    const t = new Trail();
    t.record(0, 0, 0);
    t.record(0, 2, 0.1);
    const { pos, col, n } = ribbonFor(t, 0.1);
    assert.equal(n, 2);
    for (let i = 2; i < TRAIL_MAX_POINTS; i++) {
      assert.equal(col[i * 8 + 3], 0, `undrawn section ${i} must be invisible`);
    }
    void pos;
  });

  it('renderer + menu contracts (source)', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    assert.ok(scene.includes('writeTrailRibbon'), 'TrailMesh uses the shared ribbon writer');
    assert.ok(!scene.includes('const w = 0.85'), 'the 0.85 half-width slab is gone');
    const page = src('app/shadow-realm/page.jsx');
    assert.ok(page.includes('sr-menu-scroll'), 'menu carries the phone gutter class');
    assert.ok(page.includes('max-width: 700px'), 'gutter is phone-width only');
    assert.ok(page.includes('safe-area-inset-bottom'), 'Safari bottom clearance kept');
  });
});

describe('beacon deaths round-trip (net.js)', () => {
  it('beaconRow carries trail + deaths + died_at', () => {
    const row = beaconRow({
      roomCode: 'ABC123', userId: 'u1', callsign: 'Rider',
      x: 1, z: 2, heading: 0, speed: 10, boosting: false,
      progress: 0.5, finished: false, finishMs: null, lives: 3,
      trail: [10, 20, 12, 22], deaths: 2, diedAt: '2026-10-04T00:00:00.000Z',
    });
    assert.deepEqual(row.trail, [10, 20, 12, 22]);
    assert.equal(row.deaths, 2);
    assert.equal(row.died_at, '2026-10-04T00:00:00.000Z');
  });
  it('defaults: deaths 0, trail null when absent', () => {
    const row = beaconRow({
      roomCode: 'ABC123', userId: 'u1', callsign: 'Rider',
      x: 0, z: 0, heading: 0, speed: 0, boosting: false,
      progress: 0, finished: false,
    });
    assert.equal(row.deaths, 0);
    assert.equal(row.trail, null);
    assert.equal(row.died_at, null);
  });
  it('clamps a hostile trail payload', () => {
    const big = new Array(1000).fill(5);
    const row = beaconRow({
      roomCode: 'ABC123', userId: 'u1', callsign: 'Rider',
      x: 0, z: 0, heading: 0, speed: 0, boosting: false, progress: 0,
      trail: big, deaths: -3,
    });
    assert.ok(row.trail.length <= 240, 'trail bounded');
    assert.equal(row.deaths, 0, 'negative deaths clamped');
  });
});
