// tests/earth2-build-controls.test.mjs — Earth 2 build-mode
// controls rework (Merlin, 2026-10-24): camera moves the tile,
// joystick orbits the view, tap places.
//
//   A. Camera-aim march: centre ray → ground point, sky ray →
//      far point, slope respected.
//   B. Parcel clamp: inside unchanged, outside clamped to the
//      frame.
//   C. Orbit math: yaw/pitch conventions, pitch clamp, seed
//      round-trip (no jump on orbit entry), angle stepping with
//      deadzone, blend weight in/out.
//   D. Tap gating: ghost tap places at the ghost's spot, an
//      unlawful ghost refuses with its reason, anything else
//      falls through to tap-to-aim, non-place tools pass through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  PARCEL_BUILD_FRAME,
  BUILD_ORBIT_PITCH_MIN,
  BUILD_ORBIT_PITCH_MAX,
  BUILD_ORBIT_DIST_MIN,
  BUILD_ORBIT_DIST_MAX,
  marchCameraGroundPoint,
  clampAimToParcel,
  clampOrbitPitch,
  orbitCameraPosition,
  initOrbitFromCamera,
  stepOrbitAngles,
  stepOrbitWeight,
  stepOrbitPark,
  orbitBlendActive,
  EARTH2_PANEL_ORBS,
  collapsePanelLayout,
  classifyTapGesture,
  TAP_MAX_DISPLACEMENT_PX,
  TAP_MAX_DURATION_MS,
  BUILD_LEVEL_HEIGHT_M,
  BUILD_MAX_LEVEL,
  levelPlacementY,
  levelLabel,
  tapPointInGhostFootprint,
  decideBuildTapAction,
} from '../lib/earth2/building.js';
import { deriveBuildCandidate } from '../lib/building/placement.js';

const flat = () => 10; // flat ground at y = 10
const slope = (x) => 10 + x * 0.1; // rises with +x
const rect = { minX: 0, minZ: 0, maxX: 28, maxZ: 28 };

test('march: a level downward ray hits the ground below the camera', () => {
  const hit = marchCameraGroundPoint(
    { x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, flat,
  );
  // First sample at/below ground+0.05: y=20-10.4=9.6 < 10.05 → s≈10.4 → z stays 0.
  assert.equal(hit.x, 0);
  assert.equal(hit.z, 0);
});

test('march: a forward-down ray lands ahead on the slope', () => {
  const dir = { x: 0, y: -0.5, z: Math.sqrt(0.75) };
  const hit = marchCameraGroundPoint({ x: 0, y: 20, z: 0 }, dir, slope);
  assert.ok(hit.z > 5, `expected forward travel, got z=${hit.z}`);
  // The hit sits on the slope: ground at hit ≈ camera-ray height there.
  assert.ok(Math.abs((20 - 0.5 * (hit.z / dir.z)) - slope(hit.x)) < 1.5);
});

test('march: a sky ray never meets ground and lands at the far point', () => {
  const hit = marchCameraGroundPoint(
    { x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 }, flat,
  );
  // Loop runs to maxS=18 with x/z unmoved; the scene's own
  // fallback (nearest parcel point) handles the rest.
  assert.equal(hit.x, 0);
  assert.equal(hit.z, 0);
});

test('clamp: inside the parcel is untouched, outside clamps to the frame', () => {
  assert.deepEqual(clampAimToParcel(5, 7, rect), { x: 5, z: 7 });
  assert.deepEqual(clampAimToParcel(-4, 40, rect), { x: 0, z: PARCEL_BUILD_FRAME.depth });
  assert.deepEqual(clampAimToParcel(100, -1, rect), { x: PARCEL_BUILD_FRAME.width, z: 0 });
});

test('orbit position: yaw 0 sits at +Z, yaw π/2 at +X, pitch π/2 overhead', () => {
  const c = { x: 100, y: 10, z: 200 };
  const a = orbitCameraPosition(c, 0, 0, 16);
  assert.ok(Math.abs(a.x - 100) < 1e-9 && Math.abs(a.z - 216) < 1e-9 && Math.abs(a.y - 10) < 1e-9);
  const b = orbitCameraPosition(c, Math.PI / 2, 0, 16);
  assert.ok(Math.abs(b.x - 116) < 1e-9 && Math.abs(b.z - 200) < 1e-9);
  const d = orbitCameraPosition(c, 0, Math.PI / 2, 16);
  assert.ok(Math.abs(d.x - 100) < 1e-9 && Math.abs(d.z - 200) < 1e-9 && Math.abs(d.y - 26) < 1e-9);
});

test('orbit pitch clamps to the above-ground band', () => {
  assert.equal(clampOrbitPitch(-1), BUILD_ORBIT_PITCH_MIN);
  assert.equal(clampOrbitPitch(99), BUILD_ORBIT_PITCH_MAX);
  assert.equal(clampOrbitPitch(0.7), 0.7);
});

test('orbit seed round-trips: init from an orbit position recovers it', () => {
  const c = { x: 0, y: 5, z: 0 };
  const pos = orbitCameraPosition(c, 1.1, 0.8, 20);
  const seed = initOrbitFromCamera(pos, c);
  assert.ok(Math.abs(seed.yaw - 1.1) < 1e-9);
  assert.ok(Math.abs(seed.pitch - 0.8) < 1e-9);
  assert.ok(Math.abs(seed.dist - 20) < 1e-9);
});

test('orbit seed clamps distance into the band', () => {
  const c = { x: 0, y: 0, z: 0 };
  assert.equal(initOrbitFromCamera({ x: 0, y: 0, z: 500 }, c).dist, BUILD_ORBIT_DIST_MAX);
  assert.equal(initOrbitFromCamera({ x: 0, y: 0, z: 1 }, c).dist, BUILD_ORBIT_DIST_MIN);
});

test('orbit angles: deadzone holds, full deflection steps and clamps', () => {
  const held = stepOrbitAngles(0.5, 0.5, 0.05, 0.05, 1);
  assert.deepEqual(held, { yaw: 0.5, pitch: 0.5 });
  const moved = stepOrbitAngles(0, 0.5, 1, 1, 0.5);
  assert.ok(moved.yaw > 0 && moved.pitch > 0.5);
  const top = stepOrbitAngles(0, BUILD_ORBIT_PITCH_MAX, 0, 1, 5);
  assert.equal(top.pitch, BUILD_ORBIT_PITCH_MAX);
  const bottom = stepOrbitAngles(0, BUILD_ORBIT_PITCH_MIN, 0, -1, 5);
  assert.equal(bottom.pitch, BUILD_ORBIT_PITCH_MIN);
});

test('orbit weight: blends in while driven, out on release, never past 0..1', () => {
  assert.equal(stepOrbitWeight(0, true, 1), 1); // 4/s in → capped at 1
  assert.ok(Math.abs(stepOrbitWeight(0, true, 0.1) - 0.4) < 1e-9);
  assert.ok(Math.abs(stepOrbitWeight(1, false, 0.2) - 0.5) < 1e-9); // 2.5/s out
  assert.equal(stepOrbitWeight(0.1, false, 1), 0);
});

test('tap gating: ghost tap places at the ghost spot when lawful', () => {
  const placement = { pieceId: 'foundry', x: 3, z: 4 };
  const d = decideBuildTapAction({
    tool: 'place', ghostHit: true, ghostPlacement: placement, verdict: { ok: true },
  });
  assert.equal(d.action, 'place-ghost');
  assert.equal(d.placement, placement);
});

test('tap gating: ghost tap on an unlawful ghost refuses with the reason', () => {
  const d = decideBuildTapAction({
    tool: 'place',
    ghostHit: true,
    ghostPlacement: { pieceId: 'foundry', x: 3, z: 4 },
    verdict: { ok: false, reasons: ['Too close to the parcel edge.'] },
  });
  assert.equal(d.action, 'refuse');
  assert.equal(d.reason, 'Too close to the parcel edge.');
});

test('tap gating: no ghost hit falls through to tap-to-aim; other tools pass through', () => {
  assert.equal(decideBuildTapAction({
    tool: 'place', ghostHit: false, ghostPlacement: null, verdict: null,
  }).action, 'tap-aim');
  assert.equal(decideBuildTapAction({
    tool: 'edit', ghostHit: true, ghostPlacement: { x: 1, z: 1 }, verdict: { ok: true },
  }).action, 'other-tool');
});

// ── E. v3 tap classification: endpoint displacement, not path ─
// v2 called a tap "not a drag" when its total pointer PATH stayed
// under 7 px — but a finger tap jitters, so genuine taps were
// silently reclassified as drag-look (the view wiggled, nothing
// placed, no feedback). A tap is now judged by where the finger
// LIFTS versus where it LANDED.

test('v3 tap: a jittery tap that never leaves the spot still counts', () => {
  // The finger wandered (path well past 7 px) but lifted 4 px
  // from where it landed, inside 500 ms: a tap.
  assert.equal(classifyTapGesture({
    downX: 100, downY: 100, upX: 103, upY: 97, durationMs: 300,
  }), true);
});

test('v3 tap: a real drag ends far from its start and never taps', () => {
  assert.equal(classifyTapGesture({
    downX: 100, downY: 100, upX: 200, upY: 100, durationMs: 300,
  }), false);
  // 40 px away is a real drag; a 12 px slide is a shaky tap
  // under the generous window (see section J), not a drag.
  assert.equal(classifyTapGesture({
    downX: 100, downY: 100, upX: 100, upY: 140, durationMs: 300,
  }), false);
});

test('v3 tap: a slow press is not a tap, even on the spot', () => {
  // The window is 1000 ms now (section J): a deliberate 500 ms
  // press still counts, but a full second held is a hold.
  assert.equal(classifyTapGesture({
    downX: 100, downY: 100, upX: 100, upY: 100, durationMs: 1000,
  }), false);
  assert.equal(classifyTapGesture({
    downX: 100, downY: 100, upX: 100, upY: 100, durationMs: 999,
  }), true);
  assert.equal(classifyTapGesture({
    downX: 100, downY: 100, upX: 100, upY: 100, durationMs: 500,
  }), true);
});

// ── F. v3 no-slingshot orbit park ─────────────────────────────
// Release with the blend engaged PARKS the camera: weight
// frozen, position untouched, aim unfrozen. A fresh push seeds
// from the parked pose (the scene pins that by seeding from the
// camera's current pose — the machine's job is only the state).

test('v3 park: release mid-orbit parks with the weight frozen', () => {
  const parked = stepOrbitPark(
    { weight: 0.5, driving: true, parked: false },
    { joyDeflected: false, buildModeOn: true, drivingVehicle: false },
    0.016,
  );
  assert.equal(parked.parked, true);
  assert.equal(parked.weight, 0.5, 'the blend stops exactly where it stopped');
  assert.equal(parked.driving, false);
  assert.equal(parked.frozen, false, 'a parked camera leaves the tile-aim law alone');
});

test('v3 park: a parked camera survives further idle frames unchanged', () => {
  const again = stepOrbitPark(
    { weight: 0.5, driving: false, parked: true },
    { joyDeflected: false, buildModeOn: true, drivingVehicle: false },
    0.016,
  );
  assert.equal(again.parked, true);
  assert.equal(again.weight, 0.5);
});

test('v3 park: the next push unparks and drives from the kept pose', () => {
  const driving = stepOrbitPark(
    { weight: 0.5, driving: false, parked: true },
    { joyDeflected: true, buildModeOn: true, drivingVehicle: false },
    0.016,
  );
  assert.equal(driving.parked, false);
  assert.equal(driving.driving, true);
  assert.ok(driving.weight > 0.5, 'the blend resumes upward from the kept weight');
});

test('v3 park: exiting build mode unparks and glides the weight out', () => {
  const out = stepOrbitPark(
    { weight: 0.5, driving: false, parked: true },
    { joyDeflected: false, buildModeOn: false, drivingVehicle: false },
    0.2,
  );
  assert.equal(out.parked, false);
  assert.equal(out.weight, 0, '2.5/s out over 0.2 s drains the 0.5 blend');
  assert.equal(out.frozen, false);
});

test('v3 park: driving a vehicle always wins outright', () => {
  const v = stepOrbitPark(
    { weight: 0.8, driving: true, parked: true },
    { joyDeflected: true, buildModeOn: true, drivingVehicle: true },
    0.016,
  );
  assert.deepEqual(v, { weight: 0, driving: false, parked: false, frozen: false });
});

test('v3 park: a release with nothing blended does not park', () => {
  const idle = stepOrbitPark(
    { weight: 0.005, driving: false, parked: false },
    { joyDeflected: false, buildModeOn: true, drivingVehicle: false },
    0.016,
  );
  assert.equal(idle.parked, false);
});

// ── G. v3 vertical levels ──────────────────────────────────────
// One story is 3 m (the catalog's wall height). Ground level
// keeps today's stacking seat exactly; above ground, the level
// base wins unless something taller already stands under the
// footprint — a piece never sinks into what is beneath it.

test('v3 level: the constant is one 3 m story, capped by the 60 m frame', () => {
  assert.equal(BUILD_LEVEL_HEIGHT_M, 3);
  assert.equal(BUILD_MAX_LEVEL, 20);
  assert.equal(levelLabel(0), 'Ground');
  assert.equal(levelLabel(1), 'L1');
  assert.equal(levelLabel(3), 'L3');
});

test('v3 level: ground level is unchanged from today', () => {
  assert.equal(levelPlacementY(0, 0.6, 0), 0.6);
  assert.equal(levelPlacementY(0, 0, 0.5), 0.5);
});

test('v3 level: steps raise the ghost by exactly the constant', () => {
  assert.equal(levelPlacementY(1, 0, 0), 3);
  assert.equal(levelPlacementY(2, 0, 0), 6);
  assert.equal(levelPlacementY(2, 0, 0.5), 6.5);
});

test('v3 level: a piece stacks on what stands under it, never sinks', () => {
  // An L1 floor slab stands at 3 m; its top is 3.25 m. A wall
  // aimed there at L1 seats on the slab top, not the level base.
  assert.equal(levelPlacementY(1, 3.25, 0), 3.25);
});

test('v3 level: the support law still judges footing at height', () => {
  const frame = PARCEL_BUILD_FRAME;
  // A wall on an L1 floor slab: seats on the slab top (3.25 m)
  // and rests there — lawful.
  const onSlab = deriveBuildCandidate(
    [{ pieceId: 'floor-panel', x: 14, y: 3, z: 14, rotY: 0, finish: 'stone' }],
    { pieceId: 'wall', x: 14, y: 0, z: 14, rotY: 0, finish: 'stone' },
    { frame, lift: 0, baseY: 3 },
  );
  assert.equal(onSlab.placement.y, 3.25);
  assert.equal(onSlab.verdict.ok, true, onSlab.verdict.reasons.join(' | '));
  // A floor panel in mid-air at L1, nothing beneath it: refused
  // with the support law's own reason — the toggle lifts the
  // base, it does not waive footing.
  const floating = deriveBuildCandidate(
    [],
    { pieceId: 'floor-panel', x: 14, y: 0, z: 14, rotY: 0, finish: 'stone' },
    { frame, lift: 0, baseY: 3 },
  );
  assert.equal(floating.placement.y, 3);
  assert.equal(floating.verdict.ok, false);
  assert.ok(floating.verdict.reasons.some((r) => /Nothing holds it up/.test(r)),
    floating.verdict.reasons.join(' | '));
  // A foundation block is self-supporting by the same law, so it
  // is the lawful first piece at a new level.
  const firstAtHeight = deriveBuildCandidate(
    [],
    { pieceId: 'foundation-block', x: 14, y: 0, z: 14, rotY: 0, finish: 'stone' },
    { frame, lift: 0, baseY: 3 },
  );
  assert.equal(firstAtHeight.placement.y, 3);
  assert.equal(firstAtHeight.verdict.ok, true, firstAtHeight.verdict.reasons.join(' | '));
});

// ── H. v3 ghost-footprint tap ──────────────────────────────────
// A tap's terrain point inside the ghost's plan footprint counts
// as tapping the slab itself, even when the mesh raycast missed
// (a flat slab at a glancing camera angle). The footprint is the
// catalog's axis-aligned plan box, so rotation is folded in.

test('v3 footprint: taps on, near, and off the Wide Slab Foundation', () => {
  const ghost = { pieceId: 'foundation-slab-wide', x: 14, y: 0, z: 14, rotY: 0 };
  assert.equal(tapPointInGhostFootprint({ x: 14, z: 14 }, ghost), true);
  assert.equal(tapPointInGhostFootprint({ x: 11.2, z: 16.8 }, ghost), true);
  assert.equal(tapPointInGhostFootprint({ x: 17.4, z: 14 }, ghost), true, 'inside the 0.5 m margin');
  assert.equal(tapPointInGhostFootprint({ x: 18, z: 14 }, ghost), false);
  assert.equal(tapPointInGhostFootprint({ x: 14, z: 9 }, ghost), false);
  assert.equal(tapPointInGhostFootprint(null, ghost), false);
  assert.equal(tapPointInGhostFootprint({ x: 14, z: 14 }, null), false);
});

test('v3 footprint: rotation swaps the plan extents', () => {
  const upright = { pieceId: 'wall', x: 14, y: 0, z: 14, rotY: 0 };
  const turned = { pieceId: 'wall', x: 14, y: 0, z: 14, rotY: 90 };
  // Upright wall: 4 m along x, 0.3 m along z.
  assert.equal(tapPointInGhostFootprint({ x: 15.9, z: 14 }, upright), true);
  assert.equal(tapPointInGhostFootprint({ x: 14, z: 15.9 }, upright), false);
  // Turned 90°: 0.3 m along x, 4 m along z.
  assert.equal(tapPointInGhostFootprint({ x: 14, z: 15.9 }, turned), true);
  assert.equal(tapPointInGhostFootprint({ x: 15.9, z: 14 }, turned), false);
});

// ── I. Camera-move regression (Merlin's build video, 2026-10-26)
// "As soon as I move the camera view, manipulating the piece
// stops working." Two cooperating causes, both fixed:
//   1. A parked orbit kept re-blending the camera toward the
//      orbit pose every frame, overriding drag-look (at full
//      blend weight the view — and the camera-aimed ghost —
//      was pinned solid). The blend now runs only while driving
//      or gliding out, never while parked.
//   2. The camera-aim march capped at 18 m, so a shallow-down
//      or level view never met the ground and the ghost jumped
//      to the parcel edge. The march now reaches 400 m, and a
//      ray that still finds no ground holds the last aim.

test('march: the hit flag reports ground contact honestly', () => {
  const down = marchCameraGroundPoint({ x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, flat);
  assert.equal(down.hit, true);
  const sky = marchCameraGroundPoint({ x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 }, flat);
  assert.equal(sky.hit, false, 'a sky ray meets no ground');
  assert.equal(sky.x, 0);
  assert.equal(sky.z, 0, 'the far point is unchanged for old callers');
});

test('march: a shallow-down view misses at 18 m but hits at 400 m', () => {
  // Eye 1.7 m over flat ground, pitched 3° down: the ground is
  // ~33 m out — past the old cap, inside the new reach.
  const dir = { x: 0, y: -0.05, z: Math.sqrt(1 - 0.0025) };
  const capped = marchCameraGroundPoint({ x: 0, y: 11.7, z: 0 }, dir, flat);
  assert.equal(capped.hit, false, 'the old 18 m cap never reached it');
  const far = marchCameraGroundPoint({ x: 0, y: 11.7, z: 0 }, dir, flat, { maxS: 400 });
  assert.equal(far.hit, true);
  assert.ok(far.z > 30, `expected a ~33 m hit, got z=${far.z}`);
});

test('march: a level ray over flat ground never hits, at any reach', () => {
  const level = marchCameraGroundPoint({ x: 0, y: 11.7, z: 0 }, { x: 0, y: 0, z: 1 }, flat, { maxS: 400 });
  assert.equal(level.hit, false, 'a level ray stays above the ground forever');
});

test('orbit blend: parked never blends, driving and glide-out do', () => {
  assert.equal(orbitBlendActive({ weight: 1, parked: true, drivingVehicle: false }), false,
    'a parked camera already sits at the orbit pose — re-blending would pin drag-look and the ghost');
  assert.equal(orbitBlendActive({ weight: 0.5, parked: false, drivingVehicle: false }), true,
    'driving still blends toward the orbit pose');
  assert.equal(orbitBlendActive({ weight: 0.5, parked: false, drivingVehicle: true }), false,
    'a vehicle camera always wins outright');
  assert.equal(orbitBlendActive({ weight: 0, parked: false, drivingVehicle: false }), false,
    'nothing blended, nothing to blend');
});

test('panel orbs: three distinct boxes, each its own colour + glyph', () => {
  const ids = Object.keys(EARTH2_PANEL_ORBS);
  assert.deepEqual(ids.sort(), ['actions', 'build', 'parcel']);
  const colors = new Set(ids.map((id) => EARTH2_PANEL_ORBS[id].color));
  assert.equal(colors.size, 3, 'no two orbs share a colour');
  const glyphs = new Set(ids.map((id) => EARTH2_PANEL_ORBS[id].glyph));
  assert.equal(glyphs.size, 3, 'no two orbs share a glyph');
  for (const id of ids) {
    assert.ok(EARTH2_PANEL_ORBS[id].label, `${id} has a label`);
    assert.ok(EARTH2_PANEL_ORBS[id].glyph, `${id} has a glyph`);
  }
  assert.equal(EARTH2_PANEL_ORBS.actions.color, 'amber');
  assert.equal(EARTH2_PANEL_ORBS.build.color, 'emerald');
  assert.equal(EARTH2_PANEL_ORBS.parcel.color, 'sky');
});

// ── J. Tap-to-place repair (Merlin, 2026-10-26) ──────────────
// The tap window is generous on purpose: a one-handed tap made
// while holding a controller slides on lift and lands slowly.
// A real drag still ends far from its start, so it never
// places by accident.

test('tap window: a shaky one-handed tap still counts, a real drag never does', () => {
  assert.equal(TAP_MAX_DISPLACEMENT_PX, 24);
  assert.equal(TAP_MAX_DURATION_MS, 1000);
  // Slides 20 px on lift, 800 ms press: a genuine tap, not a drag.
  assert.equal(classifyTapGesture({ downX: 100, downY: 200, upX: 118, upY: 210, durationMs: 800 }), true);
  // Slow but steady: 950 ms on the spot still counts.
  assert.equal(classifyTapGesture({ downX: 50, downY: 50, upX: 53, upY: 52, durationMs: 950 }), true);
  // A real camera sweep ends far away: never a tap.
  assert.equal(classifyTapGesture({ downX: 100, downY: 200, upX: 220, upY: 240, durationMs: 200 }), false);
  // Boundaries stay exclusive: exactly at the window is not a tap.
  assert.equal(classifyTapGesture({ downX: 0, downY: 0, upX: 24, upY: 0, durationMs: 100 }), false);
  assert.equal(classifyTapGesture({ downX: 0, downY: 0, upX: 0, upY: 0, durationMs: 1000 }), false);
});

test('entering build mode collapses only the main controls', () => {
  const before = {
    parcel: { x: 10, y: 10, collapsed: false },
    actions: { x: 10, y: 176, collapsed: false },
    build: { x: 100, y: 200, collapsed: false },
  };
  const after = collapsePanelLayout(before, 'actions');
  assert.equal(after.actions.collapsed, true, 'CONTROLS shrinks to its orb so the workbench never opens on top of it');
  assert.equal(after.parcel.collapsed, false, 'the parcel panel is untouched');
  assert.equal(after.build.collapsed, false, 'the workbench itself stays open');
  assert.equal(after.actions.x, 10, 'position persists');
  assert.equal(collapsePanelLayout(after, 'actions').actions.collapsed, true, 'idempotent');
  assert.equal(collapsePanelLayout({}, 'actions').actions.collapsed, true, 'tolerates a missing entry');
});

test('panel orbs: each box carries its own served artwork, centred and uncropped', () => {
  const arts = new Set();
  for (const [id, orb] of Object.entries(EARTH2_PANEL_ORBS)) {
    assert.ok(orb.art, `${id} has artwork`);
    assert.ok(orb.art.startsWith('/earth2/controls/'), `${id} artwork is served from public/`);
    assert.ok(orb.art.endsWith('.webp'), `${id} artwork is a still graphic, not a video`);
    assert.ok(!arts.has(orb.art), `no two orbs share artwork`);
    arts.add(orb.art);
    assert.ok(existsSync(new URL(`../public${orb.art}`, import.meta.url)), `${orb.art} exists in the repo's served assets`);
  }
  assert.equal(EARTH2_PANEL_ORBS.actions.art, '/earth2/controls/main-controls.webp');
  assert.equal(EARTH2_PANEL_ORBS.build.art, '/earth2/controls/building-controls.webp');
  assert.equal(EARTH2_PANEL_ORBS.parcel.art, '/earth2/controls/environment.webp');
});
