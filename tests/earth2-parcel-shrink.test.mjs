// tests/earth2-parcel-shrink.test.mjs
// EARTH 2 — PARCEL SHRINK (Merlin, 2026-11-13): walking into an
// owned parcel shrinks the walker to fit that world; walking out
// grows them back to normal size, exactly. Built objects on that
// parcel shrink with them (including pieces placed before this
// law), and the build ghost + orbit scale so placing while small
// is WYSIWYG. Free Commons never shrink anyone.
//
// Grid notes (lib/earth2/world.js): parcels are 28 m cells on a
// 50×50 grid, world 1400×1400. E2-0619 (index 618: col 18, row 12)
// spans x [-196,-168], z [-364,-336], centre (-182,-350).
// E2-0669 (index 668: col 18, row 13) sits directly south of it,
// centre (-182,-322), sharing the z = -336 border. E2-0569
// (index 568: col 18, row 11) sits directly north, centre
// (-182,-378), sharing the z = -364 border.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARCEL_SHRINK_SCALE,
  NORMAL_SCALE,
  SHRINK_EDGE_M,
  isOwnedParcel,
  shrinkScaleForParcel,
  walkerEyeM,
  walkerSpeedMps,
  walkerRadiusM,
  buildPieceScale,
  miniatureScaleForParcel,
  miniaturePositionForParcel,
  vehicleScaleFor,
  applyVehicleParcelScale,
  migrateParcelVehicleScale,
  walkerMotionSpeedScale,
  nextShrinkState,
} from '../lib/earth2/parcel-shrink.js';
import {
  parcelAtWorld,
  parcelCenterWorld,
  stepWorldWalker,
  pushOutOfCircles,
  WALK_EYE_M,
  WALK_SPEED_MPS,
  TRAVEL_SPEED_MPS,
  WALKER_RADIUS_M,
} from '../lib/earth2/world.js';
import { stepBridgeWalker } from '../lib/earth2/bridges.js';

// Merlin's base + the parcel directly south of it, both titled
// in this fixture (E2-0669 is Merlin's for-sale parcel). The
// parcel north of E2-0619 (E2-0569) is left untitled: Commons.
const owners = new Map([
  ['E2-0619', { owner: 'olympiannexus@gmail.com' }],
  ['E2-0669', { owner: 'olympiannexus@gmail.com' }],
]);
const commonsOwners = new Map();

test('scale law: a quarter, and the walker numbers that follow from it', () => {
  assert.equal(PARCEL_SHRINK_SCALE, 0.25);
  assert.equal(NORMAL_SCALE, 1);
  assert.equal(SHRINK_EDGE_M, 0.5);
  // Eye: 1.7 m normal, 0.425 m shrunken — the parcel reads 4x bigger.
  assert.equal(walkerEyeM(1), WALK_EYE_M);
  assert.equal(walkerEyeM(0.25), 0.425);
  // Speed (Merlin, 2026-11-14): miniature mode moves at NORMAL
  // speed — 6 m/s walk / 26 m/s travel, whatever the scale. The
  // small eye is what makes the parcel read big, not a slow walk.
  // The eye stays small; the hunter-chase concern goes away too
  // (a shrunken walker is no longer slower than what's hunting).
  assert.equal(walkerSpeedMps(1, false), WALK_SPEED_MPS);
  assert.equal(walkerSpeedMps(0.25, false), WALK_SPEED_MPS);
  assert.equal(walkerSpeedMps(1, true), TRAVEL_SPEED_MPS);
  assert.equal(walkerSpeedMps(0.25, true), TRAVEL_SPEED_MPS);
  assert.equal(walkerMotionSpeedScale(), 1);
  // Radius: 0.55 m normal, 0.1375 m shrunken.
  assert.equal(walkerRadiusM(1), WALKER_RADIUS_M);
  assert.equal(walkerRadiusM(0.25), 0.1375);
});

test('ownership: only titled parcels shrink, Commons never do', () => {
  const base = parcelAtWorld(-182, -350);
  assert.equal(base.id, 'E2-0619');
  const commons = parcelAtWorld(-182, -378);
  assert.equal(commons.id, 'E2-0569');
  assert.equal(isOwnedParcel(base, owners), true);
  assert.equal(isOwnedParcel(commons, owners), false);
  // Titles still loading (null / empty map) read as "not owned":
  // normal size until proven owned — never shrink by default.
  assert.equal(isOwnedParcel(base, null), false);
  assert.equal(isOwnedParcel(base, commonsOwners), false);
  assert.equal(isOwnedParcel(base, {}), false);
  // A plain-object owners map works the same as a Map.
  assert.equal(isOwnedParcel(base, { 'E2-0619': { owner: 'x' } }), true);
  assert.equal(shrinkScaleForParcel(base, owners), 0.25);
  assert.equal(shrinkScaleForParcel(commons, owners), 1);
  assert.equal(shrinkScaleForParcel(base, null), 1);
});

test('state machine: first evaluation settles at once (spawn inside an owned parcel starts shrunken)', () => {
  const s = nextShrinkState(null, -182, -350, owners);
  assert.deepEqual({ parcelId: s.parcelId, scale: s.scale, changed: s.changed }, { parcelId: 'E2-0619', scale: 0.25, changed: true });
  const c = nextShrinkState(null, -182, -378, owners);
  assert.deepEqual({ parcelId: c.parcelId, scale: c.scale }, { parcelId: 'E2-0569', scale: 1 });
});

test('state machine: titles arriving late flip the scale in place (no walk needed)', () => {
  // The walker stands on E2-0619 before the titles load: normal.
  const before = nextShrinkState(null, -182, -350, commonsOwners);
  assert.equal(before.scale, 1);
  // The titles arrive; same parcel, same spot — shrink applies.
  const after = nextShrinkState(before, -182, -350, owners);
  assert.deepEqual({ parcelId: after.parcelId, scale: after.scale, changed: after.changed }, { parcelId: 'E2-0619', scale: 0.25, changed: true });
  // Steady afterwards: no change, no flicker.
  assert.equal(nextShrinkState(after, -182, -350, owners).changed, false);
});

test('state machine: the border has a dead band — no flicker within 0.5 m of the line', () => {
  // Standing on E2-0669 (owned), 0.2 m inside E2-0619: still E2-0669.
  const prev = { parcelId: 'E2-0669', scale: 0.25 };
  const edge = nextShrinkState(prev, -182, -336.2, owners);
  assert.equal(edge.changed, false);
  assert.equal(edge.parcelId, 'E2-0669');
  // 0.4 m inside: still the old parcel.
  assert.equal(nextShrinkState(prev, -182, -336.4, owners).changed, false);
  // 0.5 m inside: the new parcel takes over.
  const inside = nextShrinkState(prev, -182, -336.5, owners);
  assert.deepEqual({ parcelId: inside.parcelId, scale: inside.scale, changed: inside.changed }, { parcelId: 'E2-0619', scale: 0.25, changed: true });
});

test('transitions: walk owned -> owned -> Commons and back, scale is always exactly 0.25 or exactly 1', () => {
  // Start in the middle of E2-0669, walk north in 0.1 m steps
  // through E2-0619 and out into E2-0569 (Commons), then back.
  const walk = (from, to, state) => {
    const steps = Math.round(Math.abs(to - from) / 0.1);
    const flips = [];
    let s = state;
    for (let i = 1; i <= steps; i++) {
      const z = from + ((to - from) / steps) * i;
      const next = nextShrinkState(s, -182, z, owners);
      assert.ok(next.scale === 0.25 || next.scale === 1, `scale must be exactly 0.25 or 1, got ${next.scale} at z=${z}`);
      if (next.changed) flips.push({ z: Math.round(z * 10) / 10, parcelId: next.parcelId, scale: next.scale });
      s = next;
    }
    return { state: s, flips };
  };

  let s = nextShrinkState(null, -182, -322, owners);
  assert.equal(s.scale, 0.25);

  // E2-0669 -> E2-0619 (both owned): scale stays 0.25, parcel flips
  // once, and only once the walker is 0.5 m inside E2-0619.
  const north = walk(-322, -350, s);
  assert.equal(north.flips.length, 1);
  assert.equal(north.flips[0].parcelId, 'E2-0619');
  assert.equal(north.flips[0].scale, 0.25);
  assert.ok(north.flips[0].z <= -336.5 && north.flips[0].z > -337, `flip at z=${north.flips[0].z}, expected just inside -336.5`);

  // E2-0619 -> E2-0569 (Commons): grow back, exactly 1, once the
  // walker is 0.5 m inside the Commons parcel.
  const out = walk(-350, -378, north.state);
  assert.equal(out.flips.length, 1);
  assert.equal(out.flips[0].parcelId, 'E2-0569');
  assert.equal(out.flips[0].scale, 1);
  assert.ok(out.flips[0].z <= -364.5 && out.flips[0].z > -365, `flip at z=${out.flips[0].z}, expected just inside -364.5`);

  // Walk back south: shrink again on re-entering E2-0619, and the
  // owned->owned flip back to E2-0669 keeps the scale at 0.25.
  const back = walk(-378, -322, out.state);
  assert.deepEqual(back.flips.map((f) => [f.parcelId, f.scale]), [['E2-0619', 0.25], ['E2-0669', 0.25]]);
  assert.equal(back.state.scale, 0.25);
});

test('exact restore: leaving an owned parcel returns normal size exactly — never a near-1 drift', () => {
  const shrunk = { parcelId: 'E2-0619', scale: 0.25 };
  const out = nextShrinkState(shrunk, -182, -378, owners);
  assert.equal(out.scale, 1);
  assert.equal(walkerEyeM(out.scale), 1.7);
  assert.equal(walkerSpeedMps(out.scale, false), 6);
  assert.equal(walkerRadiusM(out.scale), 0.55);
});

test('built pieces: on an owned parcel they render miniature to EVERYONE (Merlin, 2026-11-14)', () => {
  // A passerby walking past an owned base sees its built stuff
  // as a little miniature — not only the shrunken occupant.
  // The scale reads the parcel's ownership, not the viewer.
  assert.equal(buildPieceScale('E2-0619', owners), 0.25);
  assert.equal(buildPieceScale('E2-0669', owners), 0.25);
  assert.equal(miniatureScaleForParcel('E2-0619', owners), 0.25);
  // Free Commons: nothing built there, nothing shrinks.
  assert.equal(buildPieceScale('E2-0569', owners), 1);
  assert.equal(miniatureScaleForParcel('E2-0569', owners), 1);
  // Titles still loading (null / empty map) read as not owned:
  // full size until proven owned — never shrink by default.
  assert.equal(buildPieceScale('E2-0619', null), 1);
  assert.equal(buildPieceScale('E2-0619', commonsOwners), 1);
  assert.equal(buildPieceScale(null, owners), 1);
});

test('miniature position: built stuff clusters at the parcel center (Merlin, 2026-11-14)', () => {
  // A piece 8 m east of Merlin's parcel center (-182,-350) pulls
  // to 2 m east: the whole base reads as a ~7 m model sitting in
  // the middle of the 28 m parcel.
  assert.deepEqual(miniaturePositionForParcel('E2-0619', -174, -350, owners), { x: -180, z: -350 });
  assert.deepEqual(miniaturePositionForParcel('E2-0619', -182, -342, owners), { x: -182, z: -348 });
  // The center itself does not move.
  assert.deepEqual(miniaturePositionForParcel('E2-0619', -182, -350, owners), { x: -182, z: -350 });
  // Commons: positions are never touched.
  assert.deepEqual(miniaturePositionForParcel('E2-0569', -174, -378, owners), { x: -174, z: -378 });
  // Titles loading: no rescale either.
  assert.deepEqual(miniaturePositionForParcel('E2-0619', -174, -350, null), { x: -174, z: -350 });
});

test('stacked pieces seat at miniature scale: a roof at y=3 sits on a 0.75 m wall, not floating at 3 m', () => {
  // The scene seats a piece at heightAt + piece.y * pieceScale:
  // a roof 3 m up on Merlin's base renders at 0.75 m over the
  // 0.75 m wall. The y law is piece.y * buildPieceScale.
  const pieceScale = buildPieceScale('E2-0619', owners);
  assert.equal(pieceScale, 0.25);
  assert.equal(3 * pieceScale, 0.75);
  // Commons: no scaling, the roof stays at 3 m.
  assert.equal(3 * buildPieceScale('E2-0569', owners), 3);
});

test('vehicle parcel scale: a machine on an owned base renders miniature, and board-and-leave restores both', () => {
  // Parked: miniature.
  assert.equal(vehicleScaleFor({ miniature: true }), 0.25);
  assert.equal(vehicleScaleFor({ miniature: false }), 1);
  assert.equal(vehicleScaleFor({}), 1);
  assert.equal(vehicleScaleFor(null), 1);
  // Driving INTO Merlin's parcel from the Commons: the machine
  // shrinks toward the parcel center as it crosses the line.
  const entered = applyVehicleParcelScale(
    { x: -182, z: -365, miniature: false }, // Commons, just north of the line
    { x: -182, z: -363, miniature: false }, // one step south, inside E2-0619
    owners,
  );
  assert.equal(entered.miniature, true);
  // (-182,-363) is 13 m north of the center: at 0.25x it reads
  // 3.25 m north of the center.
  assert.equal(entered.x, -182);
  assert.ok(Math.abs(entered.z - (-353.25)) < 1e-9, `entered z=${entered.z}, expected -353.25`);
  // Driving OUT again: the machine grows back ×4 from the parcel
  // it just left, exactly restoring the world position — the
  // step that crosses the miniature line (-353.5) lands just
  // past the full-size line (-364), no teleport.
  const left = applyVehicleParcelScale(
    { x: -182, z: -353.4, miniature: true }, // inside, near the miniature line
    { x: -182, z: -353.6, miniature: true }, // one step north, past it
    owners,
  );
  assert.equal(left.miniature, false);
  assert.equal(left.x, -182);
  assert.ok(Math.abs(left.z - (-364.4)) < 1e-9, `left z=${left.z}, expected -364.4`);
  // The ride is a no-op while it stays in one scale's parcel.
  const staying = applyVehicleParcelScale(
    { x: -182, z: -353, miniature: true },
    { x: -182, z: -352, miniature: true },
    owners,
  );
  assert.deepEqual(staying, { x: -182, z: -352, miniature: true });
  // Owned -> owned (E2-0619 into E2-0669): rebase through full
  // size, staying miniature the whole time. The step crosses
  // E2-0619's miniature south line (-346.5) and lands just
  // inside E2-0669's miniature rect (north edge -325.5).
  const rebased = applyVehicleParcelScale(
    { x: -182, z: -346.4, miniature: true }, // inside E2-0619
    { x: -182, z: -346.3, miniature: true }, // one step south, past the line
    owners,
  );
  assert.equal(rebased.miniature, true);
  // Full size the step lands at (-182,-335.2), 13.2 m north of
  // E2-0669's center (-182,-322) — rebased, 3.3 m north of it.
  assert.equal(rebased.x, -182);
  assert.ok(Math.abs(rebased.z - (-325.3)) < 1e-9, `rebased z=${rebased.z}, expected -325.3`);
  // A boat on an owned waterfront parcel follows the same rule
  // (the helper is spec-agnostic — x/z and ownership only).
  const boat = applyVehicleParcelScale(
    { x: -182, z: -365, miniature: false, slug: 'river-runner' },
    { x: -182, z: -363, miniature: false, slug: 'river-runner' },
    owners,
  );
  assert.equal(boat.miniature, true);
  assert.equal(boat.slug, 'river-runner');
});

test('vehicle migration: a pre-law parcel-vehicle save renders miniature on its home parcel', () => {
  // Merlin's VTOL seed (full-size offsets, no miniature flag):
  // the migration pulls it toward the center and marks it.
  const migrated = migrateParcelVehicleScale({ parcelId: 'E2-0619', x: -182, z: -356, heading: 0 });
  assert.deepEqual(migrated, { parcelId: 'E2-0619', x: -182, z: -351.5, heading: 0, miniature: true });
  // A save that already carries the flag is untouched (no
  // double-shrink, even if it is parked away from home).
  assert.deepEqual(migrateParcelVehicleScale({ parcelId: 'E2-0619', x: -182, z: -350, miniature: true }), { parcelId: 'E2-0619', x: -182, z: -350, miniature: true });
  assert.deepEqual(migrateParcelVehicleScale({ parcelId: 'E2-0619', x: -500, z: -500, miniature: false }), { parcelId: 'E2-0619', x: -500, z: -500, miniature: false });
  // No flag, but parked away from its home parcel: untouched.
  assert.deepEqual(migrateParcelVehicleScale({ parcelId: 'E2-0619', x: -500, z: -500, heading: 0 }), { parcelId: 'E2-0619', x: -500, z: -500, heading: 0 });
  // No parcel id at all: nothing to migrate against.
  assert.deepEqual(migrateParcelVehicleScale({ x: -182, z: -356, heading: 0 }), { x: -182, z: -356, heading: 0 });
});

test('walker step: miniature mode walks at normal speed (Merlin, 2026-11-14 — world.js opts)', () => {
  const centre = parcelCenterWorld(parcelAtWorld(-182, -350));
  assert.deepEqual({ x: centre.x, z: centre.z }, { x: -182, z: -350 });
  const input = { fwd: 1, strafe: 0 };
  // Full size: 1 s forward at 6 m/s, yaw 0 faces -z.
  const full = stepWorldWalker({ x: -182, z: -350 }, 0, input, 1, [], false);
  assert.equal(full.z, -356);
  // Miniature: the scene passes walkerMotionSpeedScale() = 1, so
  // the same second covers the same 6 m — the parcel reads big
  // because the eye is small, not because the walk is slow.
  const small = stepWorldWalker({ x: -182, z: -350 }, 0, input, 1, [], false, { speedScale: walkerMotionSpeedScale() });
  assert.equal(small.z, -356);
  // Travel mode the same: 26 m/s, whatever the scale.
  const travel = stepWorldWalker({ x: -182, z: -350 }, 0, input, 1, [], true, { speedScale: walkerMotionSpeedScale() });
  assert.equal(travel.z, -376);
  // The stepper's speedScale option itself still works (the old
  // quarter-pace is a caller choice now, not the law).
  const quarter = stepWorldWalker({ x: -182, z: -350 }, 0, input, 1, [], false, { speedScale: 0.25 });
  assert.equal(quarter.z, -351.5);
  // No opts: exactly the old behaviour (backwards compatible).
  const legacy = stepWorldWalker({ x: -182, z: -350 }, 0, input, 1, [], false);
  assert.equal(legacy.z, -356);
});

test('walker collision: the shrunken radius is the one that pushes (world.js opts)', () => {
  const collider = [{ x: 0, z: 0, r: 1 }];
  // 1.2 m from a r=1 boulder: full-size radius (0.55) is inside
  // the push zone (1.55) and gets pushed out; shrunken (0.1375)
  // is outside it (1.1375) and stands where it is.
  assert.deepEqual(pushOutOfCircles(1.2, 0, collider), { x: 1.55, z: 0 });
  assert.deepEqual(pushOutOfCircles(1.2, 0, collider, 0.1375), { x: 1.2, z: 0 });
  // The shrunken walker is still pushed when it actually touches.
  assert.deepEqual(pushOutOfCircles(1.0, 0, collider, 0.1375), { x: 1.1375, z: 0 });
});

test('door sectors: the shrunken radius flows through the door math (world.js opts)', () => {
  // A doorway (gap 1.3 m, wall at r=2, door facing bearing 0 =
  // -z). The walker stands in the wall band (d=1.9) at 30 deg off
  // the door centreline: the full-size walker is inside the door
  // sector and passes; the shrunken walker must aim closer to
  // the centre.
  const door = [{ x: 0, z: 0, r: 2, door: { wallM: 0.2, doorWidthM: 1.3, bearingDeg: 0 } }];
  const rad = (30 * Math.PI) / 180;
  const px = 1.9 * Math.sin(rad);
  const pz = -1.9 * Math.cos(rad);
  const full = pushOutOfCircles(px, pz, door);
  assert.ok(Math.abs(full.x - px) < 1e-9 && Math.abs(full.z - pz) < 1e-9, 'full-size walker passes the doorway');
  const small = pushOutOfCircles(px, pz, door, 0.1375);
  const dSmall = Math.hypot(small.x, small.z);
  // The walker stands in the wall band (1.8 < 1.9 < 2.0), so the
  // push goes inward, back into the room — it does NOT pass.
  assert.ok(Math.abs(dSmall - 1.8) < 1e-9, `shrunken walker is pushed back into the room, got d=${dSmall}`);
  // Approaching from outside the wall (d=2.1, same 30 deg off):
  // the push goes outward to the wall face.
  const ox = 2.1 * Math.sin(rad);
  const oz = -2.1 * Math.cos(rad);
  const outside = pushOutOfCircles(ox, oz, door, 0.1375);
  assert.ok(Math.abs(Math.hypot(outside.x, outside.z) - (2 + 0.1375)) < 1e-9, 'shrunken walker outside is pushed to the wall face');
  // Dead centre of the doorway: both pass.
  const centre = pushOutOfCircles(0, -1.9, door, 0.1375);
  assert.ok(Math.abs(centre.z - (-1.9)) < 1e-9, 'shrunken walker passes dead centre');
});

test('bridge walker: speed and radius scale the same way (bridges.js env)', () => {
  const env = {
    heightAt: () => 0,
    waterDepthAt: () => 0,
    bridgeHeightAt: () => 0,
    colliders: [],
    travel: false,
  };
  const input = { fwd: 1, strafe: 0 };
  const full = stepBridgeWalker({ x: 0, z: 0 }, 0, input, 1, env);
  assert.equal(full.z, -6);
  // The scene passes speedScale = walkerMotionSpeedScale() = 1,
  // so a shrunken walker crosses a bridge at normal speed; the
  // stepper's option below still works when a caller asks for it.
  const small = stepBridgeWalker({ x: 0, z: 0 }, 0, input, 1, { ...env, speedScale: walkerMotionSpeedScale() });
  assert.equal(small.z, -6);
  // A collider just off the destination pushes the full-size
  // walker out but lets the shrunken one stand closer (its
  // 1.5 m step never reaches the collider at all).
  const blocked = { ...env, colliders: [{ x: 0.5, z: -6, r: 1 }] };
  const pushedFull = stepBridgeWalker({ x: 0, z: 0 }, 0, input, 1, blocked);
  assert.ok(Math.abs(pushedFull.x - (0.5 - 1.55)) < 1e-9 && pushedFull.z === -6, `full-size pushed to (${pushedFull.x}, ${pushedFull.z})`);
  const pushedSmall = stepBridgeWalker({ x: 0, z: 0 }, 0, input, 1, { ...blocked, speedScale: 0.25, radiusM: 0.1375 });
  assert.equal(pushedSmall.z, -1.5);
});
