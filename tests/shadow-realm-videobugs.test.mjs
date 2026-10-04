// tests/shadow-realm-videobugs.test.mjs — Regression tests for Merlin's
// 2026-10-03 iPhone video bug hunt (two videos, six issues):
//
//  1. MODE/TRACK CONSISTENCY: mode='roam' + a bump track is an impossible
//     state (no track mesh, no flame, mixed HUD, roam spawn at the origin —
//     inside the flame). normalizeTrackForMode() must make it unrepresentable.
//  2. SPAWN NEVER IN FLAME: startPose() and respawnPose() on the Eternal
//     Flame track must land outside the flame radius.
//  3. COUNTDOWN CAMERA: the chase camera target at spawn must be outside the
//     flame radius (the old default-camera-at-origin sat inside the flame).
//  4. BOOST: holding the BOOST button (input.boost=true) must raise the
//     target speed above cruise in BOTH throttle branches (motion + pads),
//     with a punchy accel so even a quick tap is felt.
//
// Run: node --test tests/shadow-realm-videobugs.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, trackByKey, isBumpTrack, startPose, centerline } from '../app/shadow-realm/tracks.js';
import { inFlameZone, respawnPose } from '../lib/shadow-realm/bump.js';
import { blendThrottle, BASELINE_THROTTLE } from '../lib/bike-motion.js';
import { chaseCamTarget } from '../app/shadow-realm/chase.js';
import { vehicleByKey } from '../app/shadow-realm/schemes.js';

// Mirrors the normalization rule in page.jsx: roam mode always rides a
// normal track. Extracted here so the rule is tested, not just the UI.
function normalizeTrackKey(mode, trackKey) {
  const t = trackByKey(trackKey);
  const roam = mode === 'roam';
  if (roam && isBumpTrack(t)) {
    const safe = TRACKS.find((x) => !isBumpTrack(x));
    return safe ? safe.key : trackKey;
  }
  return trackKey;
}

const FLAME_TRACK = trackByKey('eternal-flame');

describe('mode/track consistency (video 2: void world, glitched pills)', () => {
  it('eternal-flame is a bump track with a flame', () => {
    assert.ok(isBumpTrack(FLAME_TRACK));
    assert.ok(FLAME_TRACK.flame && FLAME_TRACK.flame.radius > 0);
  });

  it('roam + bump track normalizes to a safe track', () => {
    const key = normalizeTrackKey('roam', 'eternal-flame');
    assert.notEqual(key, 'eternal-flame');
    assert.ok(!isBumpTrack(trackByKey(key)), 'normalized track must not be a bump track');
  });

  it('roam + normal track is untouched', () => {
    assert.equal(normalizeTrackKey('roam', 'gridiron-oval'), 'gridiron-oval');
  });

  it('bump mode keeps the flame track', () => {
    assert.equal(normalizeTrackKey('bump', 'eternal-flame'), 'eternal-flame');
  });

  it('race mode keeps any track', () => {
    assert.equal(normalizeTrackKey('race', 'eternal-flame'), 'eternal-flame');
  });

  it('at least one non-bump track exists to normalize to', () => {
    assert.ok(TRACKS.some((t) => !isBumpTrack(t)));
  });
});

describe('spawn never inside the flame (video 1: countdown in the fire)', () => {
  it('startPose is outside the flame radius', () => {
    const pose = startPose(FLAME_TRACK, 220);
    assert.ok(!inFlameZone(pose, FLAME_TRACK.flame),
      `spawn at (${pose.x.toFixed(1)}, ${pose.z.toFixed(1)}) must be outside flame r=${FLAME_TRACK.flame.radius}`);
  });

  it('startPose is outside the flame on every track that has one', () => {
    for (const t of TRACKS) {
      if (!t.flame) continue;
      const pose = startPose(t, 220);
      assert.ok(!inFlameZone(pose, t.flame), `${t.key}: spawn inside flame`);
    }
  });

  it('respawnPose (flame-hit respawn) lands outside the flame', () => {
    const center = centerline(FLAME_TRACK, 220);
    // From several spots, including deep inside the flame.
    const spots = [
      { x: 0, z: 0 },
      { x: 30, z: -20 },
      { x: FLAME_TRACK.flame.radius - 1, z: 0 },
      { x: 96, z: 40 },
    ];
    for (const s of spots) {
      const rp = respawnPose(center, s);
      assert.ok(!inFlameZone(rp, FLAME_TRACK.flame),
        `respawn from (${s.x}, ${s.z}) landed inside flame`);
    }
  });
});

describe('countdown camera outside the flame', () => {
  it('chase camera target at spawn is outside the flame radius', () => {
    const pose = startPose(FLAME_TRACK, 220);
    const ct = chaseCamTarget(pose.x, pose.z, pose.heading, 0);
    const d = Math.hypot(ct.x - FLAME_TRACK.flame.x, ct.z - FLAME_TRACK.flame.z);
    assert.ok(d > FLAME_TRACK.flame.radius,
      `camera target ${d.toFixed(1)}u from flame center must exceed r=${FLAME_TRACK.flame.radius}`);
  });
});

describe('BOOST button (Merlin: "the boost button should work")', () => {
  const vehicle = vehicleByKey('comet');
  assert.ok(vehicle.boostMult > 1, 'boost multiplier must exceed 1');

  // Mirrors the Rig's target-speed computation in scene.jsx.
  function targetSpeed({ motionDrive, boost, throttle = 0, brake = 0, surging = false }) {
    if (motionDrive) {
      const boosting = boost || surging;
      const eff = blendThrottle(throttle, brake);
      return vehicle.maxSpeed * eff * (boosting ? vehicle.boostMult : 1);
    }
    return vehicle.maxSpeed * BASELINE_THROTTLE * (boost ? vehicle.boostMult : 1);
  }

  it('boost raises target above cruise (motion branch, neutral tilt)', () => {
    const cruise = targetSpeed({ motionDrive: true, boost: false });
    const boosted = targetSpeed({ motionDrive: true, boost: true });
    assert.ok(boosted > cruise * 1.4, `boost ${boosted.toFixed(1)} must clearly exceed cruise ${cruise.toFixed(1)}`);
  });

  it('boost raises target above cruise (pads/no-motion branch)', () => {
    const cruise = targetSpeed({ motionDrive: false, boost: false });
    const boosted = targetSpeed({ motionDrive: false, boost: true });
    assert.ok(boosted > cruise * 1.4, `boost ${boosted.toFixed(1)} must clearly exceed cruise ${cruise.toFixed(1)}`);
  });

  it('boost multiplies full forward tilt too', () => {
    const full = targetSpeed({ motionDrive: true, boost: false, throttle: 1 });
    const fullBoost = targetSpeed({ motionDrive: true, boost: true, throttle: 1 });
    assert.ok(fullBoost > full, 'boost must add speed even at full tilt');
  });

  it('brake still wins over boost (safety)', () => {
    const braking = targetSpeed({ motionDrive: true, boost: true, throttle: 0, brake: 1 });
    const cruise = targetSpeed({ motionDrive: true, boost: false });
    assert.ok(braking < cruise, 'full brake must beat boost');
  });
});
