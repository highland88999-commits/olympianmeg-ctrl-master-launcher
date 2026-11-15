// Mounts: Embermane + Frostbite — prompt range, mount/dismount
// positions, ride speed, dismount beside the mount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONSTER_TYPES, createMonster, strike, spawnField,
} from '../spawns.js';
import { PLACED_FIELD_KEYS } from '../models.js';
import {
  PROMPT_REACH_M, RIDE_SPEED_MULT, RIDE_SPEED_MIN_MPS,
  RIDE_SADDLE_FRACTION, RIDER_HIP_FRACTION, DISMOUNT_CLEAR_M,
  isMountMonster, promptRangeForMount, rideSpeedForMount,
  dismountSideForMount, nearestMountInRange, riderSeatOffsetY,
  mountYawForWalker, dismountSpot,
} from '../riding.js';

const rng = () => 0.5;
function mon(type, x, z, faceYaw = 0) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng);
  m.faceYaw = faceYaw;
  m.active = true;
  return m;
}

test('both mount candidates are flagged mount: true with their family stats', () => {
  for (const key of ['embermane-horse', 'frostbite-lizard']) {
    assert.equal(MONSTER_TYPES[key].mount, true, `${key} is not flagged mount`);
  }
  assert.equal(MONSTER_TYPES['embermane-horse'].speed, 5.6);
  assert.equal(MONSTER_TYPES['embermane-horse'].scaleM, 2.4);
  assert.equal(MONSTER_TYPES['embermane-horse'].footprintR, 1.6);
  assert.equal(MONSTER_TYPES['frostbite-lizard'].speed, 3.4);
  assert.equal(MONSTER_TYPES['frostbite-lizard'].scaleM, 3.0);
  assert.equal(MONSTER_TYPES['frostbite-lizard'].footprintR, 2.0);
  // No other family is a mount.
  const mounts = Object.entries(MONSTER_TYPES).filter(([, t]) => t.mount).map(([k]) => k);
  assert.deepEqual(mounts.sort(), ['embermane-horse', 'frostbite-lizard']);
});

test('prompt range is footprintR + 3 m per mount', () => {
  assert.equal(promptRangeForMount(MONSTER_TYPES['embermane-horse']), 4.6);
  assert.equal(promptRangeForMount(MONSTER_TYPES['frostbite-lizard']), 5.0);
  assert.equal(PROMPT_REACH_M, 3);
});

test('nearestMountInRange finds the nearest mountable monster in its own range', () => {
  const emb = mon('embermane-horse', 4, 0); // 4 m out — inside 4.6
  const frost = mon('frostbite-lizard', 4.8, 0); // 4.8 m out — inside 5.0
  const other = mon('slot-01', 1, 0); // not a mount, right on top
  assert.equal(nearestMountInRange([other, emb, frost], 0, 0), emb);
  assert.equal(nearestMountInRange([other, frost], 0, 0), frost);
  assert.equal(nearestMountInRange([other], 0, 0), null);
  // Past the prompt range: no prompt, even for a mount.
  assert.equal(nearestMountInRange([mon('embermane-horse', 4.7, 0)], 0, 0), null);
  assert.equal(nearestMountInRange([mon('frostbite-lizard', 5.1, 0)], 0, 0), null);
  // Dead or inactive mounts never prompt.
  const dead = mon('embermane-horse', 1, 0); dead.dead = true;
  const idle = mon('embermane-horse', 1, 0); idle.active = false;
  assert.equal(nearestMountInRange([dead, idle], 0, 0), null);
  assert.equal(nearestMountInRange([], 0, 0), null);
  assert.equal(nearestMountInRange(null, 0, 0), null);
});

test('ride speed is the family speed × 3.5, floored at 12 — both beat the 10 m/s walk', () => {
  assert.equal(RIDE_SPEED_MULT, 3.5);
  assert.equal(RIDE_SPEED_MIN_MPS, 12);
  assert.ok(Math.abs(rideSpeedForMount(MONSTER_TYPES['embermane-horse']) - 19.6) < 1e-9);
  assert.equal(rideSpeedForMount(MONSTER_TYPES['frostbite-lizard']), 12); // 3.4 × 3.5 = 11.9, floored
  for (const key of ['embermane-horse', 'frostbite-lizard']) {
    assert.ok(rideSpeedForMount(MONSTER_TYPES[key]) > 10, `${key} rides slower than the walk`);
  }
  // Embermane beats the 18 m/s foot sprint; Frostbite does not —
  // that is the Patient's character, not a bug.
  assert.ok(rideSpeedForMount(MONSTER_TYPES['embermane-horse']) > 18);
  assert.ok(rideSpeedForMount(MONSTER_TYPES['frostbite-lizard']) < 18);
});

test('seat offset puts the rider\'s hips on the saddle for each mount', () => {
  // Embermane (2.4 m): 0.68 × 2.4 − 0.51 × 1.9 = 0.663.
  // Frostbite (3.0 m): 0.68 × 3.0 − 0.51 × 1.9 = 1.071.
  const emb = riderSeatOffsetY(2.4, 1.9);
  const frost = riderSeatOffsetY(3.0, 1.9);
  assert.ok(Math.abs(emb - 0.663) < 1e-9, `embermane seat ${emb}`);
  assert.ok(Math.abs(frost - 1.071) < 1e-9, `frostbite seat ${frost}`);
  assert.ok(frost > emb, 'the taller mount seats the rider higher');
  assert.equal(RIDE_SADDLE_FRACTION, 0.68);
  assert.equal(RIDER_HIP_FRACTION, 0.51);
  // A halfling (1.15 m) needs a larger origin offset — shorter
  // legs, so the origin rides higher for the hips to reach the
  // same saddle — but the halfling's HEAD still sits lower, as
  // a halfling would (offset + height: 2.20 vs 2.56).
  assert.ok(riderSeatOffsetY(2.4, 1.15) > emb);
  assert.ok(riderSeatOffsetY(2.4, 1.15) + 1.15 < emb + 1.9);
});

test('mount yaw faces the mount the way the walker faces', () => {
  assert.equal(mountYawForWalker(0), Math.PI);
  assert.equal(mountYawForWalker(1.2), 1.2 + Math.PI);
});

test('dismount lands beside the mount, flank side, clear of its collider', () => {
  assert.equal(dismountSideForMount(MONSTER_TYPES['embermane-horse']), 2.2);
  assert.equal(dismountSideForMount(MONSTER_TYPES['frostbite-lizard']), 2.6);
  assert.equal(DISMOUNT_CLEAR_M, 0.6);
  // Mount facing +Z (faceYaw 0): flank is +X.
  const m = mon('embermane-horse', 10, 20, 0);
  assert.deepEqual(dismountSpot(m), { x: 12.2, z: 20 });
  // Mount facing −X (faceYaw −PI/2): flank is −Z... (cos, −sin) at
  // −PI/2 is (0, +1) in x, z − sin(−PI/2) = z + side.
  const m2 = mon('frostbite-lizard', 10, 20, -Math.PI / 2);
  const spot2 = dismountSpot(m2);
  assert.ok(Math.abs(spot2.x - 10) < 1e-9, `x ${spot2.x}`);
  assert.ok(Math.abs(spot2.z - 22.6) < 1e-9, `z ${spot2.z}`);
  // Never at the mount's centre, never far away.
  for (const mm of [m, m2]) {
    const s = dismountSpot(mm);
    const d = Math.hypot(s.x - mm.x, s.z - mm.z);
    assert.ok(d > mm.stats.footprintR, 'dismount clears the mount');
    assert.ok(d < 4, 'dismount stays close');
  }
});

test('a mounted monster is never a strike target — the rider cannot hit their own mount', () => {
  const spec = { dmg: 10, range: 2.4, arcCos: Math.cos(1.22), cooldown: 0.45 };
  const m = mon('embermane-horse', 0, -1); // point-blank, dead ahead
  assert.equal(strike([m], 0, 0, 0, spec).length, 1);
  m.mounted = true;
  assert.equal(strike([m], 0, 0, 0, spec).length, 0);
  m.mounted = false;
  assert.equal(strike([m], 0, 0, 0, spec).length, 1);
});

test('isMountMonster only admits living, active, mount-flagged monsters', () => {
  assert.equal(isMountMonster(mon('embermane-horse', 0, 0)), true);
  assert.equal(isMountMonster(mon('frostbite-lizard', 0, 0)), true);
  assert.equal(isMountMonster(mon('slot-01', 0, 0)), false);
  const dead = mon('embermane-horse', 0, 0); dead.dead = true;
  assert.equal(isMountMonster(dead), false);
  const idle = mon('embermane-horse', 0, 0); idle.active = false;
  assert.equal(isMountMonster(idle), false);
  assert.equal(isMountMonster(null), false);
});

test('Embermane spawns in the field (placed GLB); the mount code needs no special case per family', () => {
  assert.ok(PLACED_FIELD_KEYS.includes('embermane-horse'), 'embermane GLB is placed');
  const recs = spawnField(77701, { habitatAt: () => 'mountain' });
  assert.ok(recs.some((r) => r.type === 'embermane-horse'), 'embermane spawns in its mountain band');
  // NOTE (live gap, deliberately NOT locked in a test — it flips
  // when the re-send lands): Frostbite's GLB is truncated
  // (models.js TRUNCATED_AWAITING_RESEND, 48,903 bytes missing),
  // so no Frostbite spawns today and its mount is code-ready but
  // unrideable until the re-send lands. No test should go red for
  // that fix landing.
});
