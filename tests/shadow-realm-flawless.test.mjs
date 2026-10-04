// tests/shadow-realm-flawless.test.mjs — Headless tests for Merlin's
// 2026-10-03 "make it flawless" pass (7 flaws from the VS-AI footage):
//
//  1. TRAIL-AHEAD WARNING (lib/shadow-realm/trails.js): trailAheadWarning()
//     fires when a rival trail sits in the forward path cone, never on the
//     rider's own trail, never behind, never on fresh (unkillable) segments.
//  2. START/FINISH ARCH + 3. MOON: visual — asserted via wiring checks
//     (the gantry rebuild + single shaded moon exist in scene.jsx).
//  4. RESPAWN CLEARANCE (findSafeSpot): 3x kill-radius margin AND a clear
//     forward corridor — the rider spawns facing the next centerline point,
//     so the ground they ride into must be trail-free too.
//  5. RECENTER HARDENING (lib/shadow-realm/recenter.js): genuine double-taps
//     fire; grip adjustments, drags, far-apart taps, slow pairs, and
//     control-adjacent taps are all rejected with a logged reason.
//  6. BOOST METER (lib/shadow-realm/boost-meter.js): charge 0..1 maps to
//     the ring arc + percentage, clamped, NaN-safe.
//  7. HUD CLIPPING: safe-area insets + wrapping asserted via source checks.
//
// Run: node --test tests/shadow-realm-flawless.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  Trail,
  TRAIL_KILL_RADIUS,
  TRAIL_FRESH_S,
  trailAheadWarning,
  findSafeSpot,
  hitTest,
  RESPAWN_MARGIN_MULT,
  RESPAWN_CORRIDOR_LEN,
  TRAIL_WARN_AHEAD_MIN,
  TRAIL_WARN_AHEAD_MAX,
  TRAIL_WARN_LATERAL,
} from '../lib/shadow-realm/trails.js';
import {
  createTapState,
  tapDown,
  tapUp,
  markControlUse,
  RECENTER_TAP_WINDOW_MS,
  RECENTER_TAP_MAX_DIST,
  RECENTER_DRAG_TOLERANCE,
  RECENTER_CONTROL_COOLDOWN_MS,
} from '../lib/shadow-realm/recenter.js';
import { boostMeter, BOOST_RING_R } from '../lib/shadow-realm/boost-meter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

// A rival trail along a straight line, stamped old enough to dodge the
// freshness skip (so it is genuinely lethal).
function oldTrail(pts, now = 1000) {
  const t = new Trail();
  for (const [x, z] of pts) t.points.push({ x, z, t: now - TRAIL_FRESH_S - 10 });
  return t;
}

// Horizontal wall of trail at fixed x values, spanning z in [-20, 20].
function wallTrails(xs, now = 1000) {
  return xs.map((x) => {
    const pts = [];
    for (let z = -20; z <= 20; z += 2) pts.push([x, z]);
    return { trail: oldTrail(pts, now), name: 'WALL' };
  });
}

describe('trailAheadWarning (fairness)', () => {
  // Bike at origin, heading 0 (nose +Z). Rival trail crosses the path at z=10.
  const crossing = [{ trail: oldTrail([[-20, 10], [20, 10]]), name: 'RIVAL-1' }];

  it('warns when a rival trail crosses the forward path cone', () => {
    const w = trailAheadWarning({ x: 0, z: 0, heading: 0 }, crossing, 1000);
    assert.ok(w, 'warning fires');
    assert.equal(w.owner, 'RIVAL-1');
    assert.ok(Math.abs(w.dist - 10) < 1.5, `dist ~10, got ${w.dist}`);
  });

  it('returns the NEAREST threat when several are ahead', () => {
    const rivals = [
      { trail: oldTrail([[-20, 14], [20, 14]]), name: 'FAR' },
      { trail: oldTrail([[-20, 8], [20, 8]]), name: 'NEAR' },
    ];
    const w = trailAheadWarning({ x: 0, z: 0, heading: 0 }, rivals, 1000);
    assert.ok(w);
    assert.equal(w.owner, 'NEAR');
  });

  it('never warns on the rider\'s own trail (skip by identity)', () => {
    const own = oldTrail([[-20, 10], [20, 10]]);
    const w = trailAheadWarning({ x: 0, z: 0, heading: 0 }, [{ trail: own, name: 'ME' }], 1000, { skip: own });
    assert.equal(w, null);
  });

  it('no warning for a trail behind the bike', () => {
    const behind = [{ trail: oldTrail([[-20, -10], [20, -10]]), name: 'R' }];
    assert.equal(trailAheadWarning({ x: 0, z: 0, heading: 0 }, behind, 1000), null);
  });

  it('no warning beyond the lookahead window', () => {
    const far = [{ trail: oldTrail([[-20, 40], [20, 40]]), name: 'R' }];
    assert.equal(trailAheadWarning({ x: 0, z: 0, heading: 0 }, far, 1000), null);
  });

  it('no warning for a trail outside the lateral tolerance', () => {
    // Parallel to the path, 6 units to the side — not in the cone.
    const side = [{ trail: oldTrail([[6, 0], [6, 20]]), name: 'R' }];
    assert.equal(trailAheadWarning({ x: 0, z: 0, heading: 0 }, side, 1000), null);
  });

  it('skips fresh (unkillable) segments, mirroring hitTest', () => {
    const t = new Trail();
    t.points.push({ x: -20, z: 10, t: 999.9 }, { x: 20, z: 10, t: 999.9 });
    const w = trailAheadWarning({ x: 0, z: 0, heading: 0 }, [{ trail: t, name: 'R' }], 1000);
    assert.equal(w, null, 'fresh trail cannot kill, so it must not warn');
  });

  it('side: +1 = threat on screen-right (screen-right is -X at heading 0)', () => {
    // Diagonal trail entering the cone from screen-right (lat +2.6 edge).
    const right = [{ trail: oldTrail([[-6, 4], [2, 14]]), name: 'R' }];
    const w = trailAheadWarning({ x: 0, z: 0, heading: 0 }, right, 1000);
    assert.ok(w, 'warning fires');
    assert.equal(w.side, 1);
  });

  it('side: -1 = threat on screen-left', () => {
    const left = [{ trail: oldTrail([[6, 4], [-2, 14]]), name: 'R' }];
    const w = trailAheadWarning({ x: 0, z: 0, heading: 0 }, left, 1000);
    assert.ok(w, 'warning fires');
    assert.equal(w.side, -1);
  });

  it('respects heading: a trail ahead after a 90° turn still warns', () => {
    // Heading π/2: nose +X. Trail crosses at x=10.
    const w = trailAheadWarning(
      { x: 0, z: 0, heading: Math.PI / 2 },
      [{ trail: oldTrail([[10, -20], [10, 20]]), name: 'R' }],
      1000
    );
    assert.ok(w, 'warning follows the heading, not the world axes');
  });

  it('non-finite bike pose -> null (never warns on garbage)', () => {
    assert.equal(trailAheadWarning({ x: NaN, z: 0, heading: 0 }, crossing, 1000), null);
    assert.equal(trailAheadWarning(null, crossing, 1000), null);
  });

  it('lookahead constants match the spec (~8–15 units)', () => {
    assert.ok(TRAIL_WARN_AHEAD_MIN >= 4 && TRAIL_WARN_AHEAD_MIN <= 8);
    assert.ok(TRAIL_WARN_AHEAD_MAX >= 14 && TRAIL_WARN_AHEAD_MAX <= 20);
    assert.ok(TRAIL_WARN_LATERAL > 0 && TRAIL_WARN_LATERAL <= 4);
  });
});

describe('findSafeSpot (respawn clearance: margin + corridor)', () => {
  const line = [];
  for (let i = 0; i <= 40; i++) line.push({ x: i * 5, z: 0 });

  it('requires a clear forward corridor, not just a clear point', () => {
    // A trail WALL ahead at x = 56..72 (the rider at (50,0) faces +X).
    // (50,0) itself is point-clear (6u from the wall) but its runway is not.
    const rivals = wallTrails([56, 58, 60, 62, 64, 66, 68, 70, 72]);
    const spot = findSafeSpot({ x: 50, z: 0, centerline: line, rivalTrails: rivals, now: 1000 });
    assert.ok(spot, 'found a spot');
    // Nearest-first with a 14u corridor: (35,0) is the first candidate
    // whose runway (39,0)→(47,0) clears the wall with margin.
    assert.ok(spot.x <= 40, `spot.x ${spot.x} pulled back from the wall`);
    // And the picked spot genuinely has a clear runway:
    const killR = TRAIL_KILL_RADIUS * RESPAWN_MARGIN_MULT + 3;
    for (let d = 4; d <= RESPAWN_CORRIDOR_LEN; d += 4) {
      for (const r of rivals) {
        assert.equal(
          hitTest(r.trail, spot.x + d, spot.z, killR, 1000),
          false,
          `runway point (${spot.x + d},0) must be trail-clear`
        );
      }
    }
  });

  it('uses a 3x kill-radius margin (up from 2x)', () => {
    assert.equal(RESPAWN_MARGIN_MULT, 3);
    const rivals = [{ trail: oldTrail([[40, 0], [40, 2]]), name: 'R' }];
    // Trail segment at x=40; death at (44,0): 4u away.
    // 2x margin (3.2u) would accept it; 3x (4.8u) must reject it.
    const spot = findSafeSpot({
      x: 44, z: 0,
      centerline: [{ x: 44, z: 0 }, { x: 60, z: 0 }, { x: 80, z: 0 }],
      rivalTrails: rivals, now: 1000,
    });
    assert.ok(spot);
    assert.ok(spot.x !== 44, 'the 4u-away point is inside the 3x margin — rejected');
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

describe('recenter gesture hardening', () => {
  it('a genuine double-tap (same spot, tight window) fires', () => {
    const st = createTapState();
    tapDown(st, 100, 200);
    assert.equal(tapUp(st, 100, 200, 1000).fire, false);
    tapDown(st, 102, 201);
    const r = tapUp(st, 102, 201, 1200);
    assert.equal(r.fire, true);
    assert.equal(r.reason, 'double-tap');
  });

  it('a slow pair does not fire (and the late tap re-arms)', () => {
    const st = createTapState();
    tapDown(st, 100, 200);
    tapUp(st, 100, 200, 1000);
    tapDown(st, 100, 200);
    const r = tapUp(st, 100, 200, 1000 + RECENTER_TAP_WINDOW_MS + 50);
    assert.equal(r.fire, false);
    assert.equal(r.reason, 'too-slow');
    // The late tap became the new first tap — a quick follow-up still works.
    tapDown(st, 100, 200);
    assert.equal(tapUp(st, 100, 200, 1000 + RECENTER_TAP_WINDOW_MS + 200).fire, true);
  });

  it('two taps far apart do not fire', () => {
    const st = createTapState();
    tapDown(st, 50, 50);
    tapUp(st, 50, 50, 1000);
    tapDown(st, 50 + RECENTER_TAP_MAX_DIST + 20, 50);
    const r = tapUp(st, 50 + RECENTER_TAP_MAX_DIST + 20, 50, 1100);
    assert.equal(r.fire, false);
    assert.equal(r.reason, 'too-far');
  });

  it('a drag is not a tap (and breaks a pending pair)', () => {
    const st = createTapState();
    tapDown(st, 100, 200);
    tapUp(st, 100, 200, 1000); // first tap armed
    tapDown(st, 100, 200);
    const r = tapUp(st, 100 + RECENTER_DRAG_TOLERANCE + 10, 200, 1100);
    assert.equal(r.fire, false);
    assert.equal(r.reason, 'drag');
    // The drag cleared the pending pair — a lone tap now is just first-tap.
    tapDown(st, 100, 200);
    assert.equal(tapUp(st, 100, 200, 1200).reason, 'first-tap');
  });

  it('taps right after a control press are ignored', () => {
    const st = createTapState();
    markControlUse(st, 1000); // e.g. boost pressed
    tapDown(st, 100, 200);
    const r = tapUp(st, 100, 200, 1100);
    assert.equal(r.fire, false);
    assert.equal(r.reason, 'control-cooldown');
    // After the cooldown, taps count again.
    tapDown(st, 100, 200);
    assert.equal(tapUp(st, 100, 200, 1000 + RECENTER_CONTROL_COOLDOWN_MS + 100).reason, 'first-tap');
  });

  it('a completed pair clears — no phantom third-tap pairing', () => {
    const st = createTapState();
    tapDown(st, 100, 200); tapUp(st, 100, 200, 1000);
    tapDown(st, 100, 200); tapUp(st, 100, 200, 1100); // fires
    tapDown(st, 100, 200);
    assert.equal(tapUp(st, 100, 200, 1150).reason, 'first-tap');
  });

  it('constants match the spec (tight window, same spot, drag reject, cooldown)', () => {
    assert.equal(RECENTER_TAP_WINDOW_MS, 320);
    assert.equal(RECENTER_TAP_MAX_DIST, 48);
    assert.equal(RECENTER_DRAG_TOLERANCE, 14);
    assert.equal(RECENTER_CONTROL_COOLDOWN_MS, 600);
  });
});

describe('boostMeter (charge ring mapping)', () => {
  it('empty -> empty ring, 0%', () => {
    const m = boostMeter(0);
    assert.equal(m.pct, 0);
    assert.ok(Math.abs(m.dashoffset - m.circumference) < 1e-9);
  });

  it('full -> full ring, 100%', () => {
    const m = boostMeter(1);
    assert.equal(m.pct, 100);
    assert.ok(Math.abs(m.dashoffset) < 1e-9);
  });

  it('half charge -> half arc, 50%', () => {
    const m = boostMeter(0.5);
    assert.equal(m.pct, 50);
    assert.ok(Math.abs(m.dashoffset - m.circumference / 2) < 1e-9);
  });

  it('clamps out-of-range and NaN-safe', () => {
    assert.equal(boostMeter(1.5).charge, 1);
    assert.equal(boostMeter(-0.2).charge, 0);
    assert.equal(boostMeter(NaN).charge, 0);
    assert.equal(boostMeter(undefined).charge, 0);
    assert.equal(boostMeter('junk').charge, 0);
  });

  it('ring radius matches the rendered SVG', () => {
    assert.equal(BOOST_RING_R, 40);
  });
});

describe('wiring (source checks)', () => {
  it('scene.jsx: trail-ahead warning gated with the lethal-trail check', () => {
    const s = src('app/shadow-realm/scene.jsx');
    assert.ok(s.includes('trailAheadWarning('), 'Rig calls trailAheadWarning');
    assert.ok(s.includes('s.trailWarn'), 'warn state lives on the sim');
    assert.ok(s.includes('trailWarn:'), 'warn state reaches the HUD');
    assert.ok(s.includes('skip: s.trail'), 'own trail excluded by identity');
  });

  it('scene.jsx: gantry arch rebuilt as a real gate (not a flat beam)', () => {
    const s = src('app/shadow-realm/scene.jsx');
    assert.ok(s.includes('neon power bands'), 'posts carry neon bands');
    assert.ok(s.includes('neon trim'), 'beam carries neon trim');
    assert.ok(s.includes('chevron'), 'chevron plate present');
  });

  it('scene.jsx: single shaded moon (no ambiguous overlapping discs)', () => {
    const s = src('app/shadow-realm/scene.jsx');
    assert.ok(s.includes('moonTexture'), 'canvas-shaded moon texture');
    assert.ok(s.includes('Terminator'), 'terminator shading = intentional moon');
    assert.ok(s.includes('ringGeometry'), 'atmosphere rim ring, not a second disc');
  });

  it('page.jsx: warning overlay + rising-edge blip', () => {
    const p = src('app/shadow-realm/page.jsx');
    assert.ok(p.includes('TRAIL AHEAD'), 'warning flash pill');
    assert.ok(p.includes('trailWarnPulse'), 'pulse animation');
    assert.ok(p.includes('fx.warn()'), 'rising-edge audio blip');
    assert.ok(p.includes('trailWarn.side'), 'edge glow follows the threat side');
  });

  it('page.jsx: boost ring reads the live charge', () => {
    const p = src('app/shadow-realm/page.jsx');
    assert.ok(p.includes('boostMeter(hud.boostCharge)'), 'ring driven by hud.boostCharge');
    assert.ok(p.includes('role="meter"'), 'accessible meter role');
  });

  it('page.jsx: hardened recenter replaces the bare onDoubleClick', () => {
    const p = src('app/shadow-realm/page.jsx');
    assert.ok(!p.includes('onDoubleClick={'), 'no bare onDoubleClick handler remains');
    assert.ok(p.includes('tapUp('), 'custom tap detector wired');
    assert.ok(p.includes("motion.recenter('double-tap')"), 'double-tap source logged');
    assert.ok(p.includes("motion.recenter('button')"), 'button source logged');
    assert.ok(p.includes('noteControlUse()'), 'controls feed the cooldown');
  });

  it('page.jsx: HUD is safe-area aware and wraps instead of clipping', () => {
    const p = src('app/shadow-realm/page.jsx');
    assert.ok(p.includes('env(safe-area-inset-top'), 'top safe-area inset');
    assert.ok(p.includes('env(safe-area-inset-left'), 'left safe-area inset');
    assert.ok(p.includes("flexWrap: 'wrap'"), 'pills wrap on narrow screens');
    assert.ok(!p.includes('minWidth: 86'), 'the overflow-forcing minWidth is gone');
  });

  it('use-bike-motion.js: recenter logs its trigger source', () => {
    const u = src('lib/use-bike-motion.js');
    assert.ok(u.includes('recenter via'), 'source logged for diagnosability');
  });

  it('fx.js: warn() blip exists and is throttled', () => {
    const f = src('lib/fx.js');
    assert.ok(f.includes('warn()'), 'fx.warn exists');
    assert.ok(f.includes("throttle('fx:warn'"), 'throttled against flurries');
  });
});
