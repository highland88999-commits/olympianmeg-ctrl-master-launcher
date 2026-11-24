// tests/sunbase-doorway-exit.test.mjs — SUN-BASE DOORWAY EXIT
// (Merlin, Nov 24, 2026): walking through the farmhouse doorway
// in /sun-base takes the user out of the base and back into the
// hub — the same walk-through travel as a portal piece set to
// Main Hub. No button, no tap, no menu: crossing the doorway
// threshold travels. The doorway keeps looking exactly as it is
// (bright glowing doorway); only the behaviour changes.
// Run: node tests/sunbase-doorway-exit.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  buildInteriorRoom,
  interiorRoomDoor,
  isDoorwayPoint,
} from '../lib/earth2/interior-room.js';
import { sunBaseSpecFor } from '../lib/sun-base-spec.js';
import { SUN_BASE_DOORWAY_TRIGGER_DEPTH_M } from '../lib/sun-base.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, want ${b}`);

const FARMHOUSE = 'e023-prairie-farmhouse';
const BARN = 'e021-red-gambrel-barn';
const WINDMILL = 'e024-farm-windmill';

test('the farmhouse door geometry matches the factory math', () => {
  const spec = sunBaseSpecFor(FARMHOUSE);
  assert.ok(spec, 'farmhouse spec resolves');
  const door = interiorRoomDoor(spec);
  // 9 m room, inset 94%: W = D = 8.46, H = 9.
  approx(door.roomW, 8.46, 'room width');
  approx(door.roomD, 8.46, 'room depth');
  approx(door.roomH, 9, 'room height');
  // doorW = min(1.3 * (8.46 / 9) * 1.6, 8.46 * 0.44) = 1.9552.
  approx(door.doorW, 1.9552, 'door width');
  // doorH = min(2.4, 9 * 0.62) = 2.4.
  approx(door.doorH, 2.4, 'door height');
  // The wall plane the gap sits in.
  approx(door.doorZ, 4.23, 'door wall plane');
});

test('the built room agrees with the helper: spill plane + real door gap', () => {
  const spec = sunBaseSpecFor(FARMHOUSE);
  const door = interiorRoomDoor(spec);
  const { group } = buildInteriorRoom(spec, 0);
  const meshes = [];
  group.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  // The light-spill plane: additive, doorW x doorH, 0.05 m inside
  // the wall plane — the glow in the video.
  const spills = meshes.filter(
    (m) => m.geometry && m.geometry.type === 'PlaneGeometry' && m.material && m.material.blending === THREE.AdditiveBlending
  );
  assert.equal(spills.length, 1, 'exactly one additive spill plane');
  const spill = spills[0];
  approx(spill.geometry.parameters.width, door.doorW, 'spill width is the door width');
  approx(spill.geometry.parameters.height, door.doorH, 'spill height is the door height');
  approx(spill.position.x, 0, 'spill centred on the door');
  approx(spill.position.y, door.doorH / 2, 'spill sits on the floor');
  approx(spill.position.z, door.doorZ - 0.05, 'spill 0.05 m inside the wall plane');
  // The +Z wall: two flank segments + a lintel above the gap, and
  // NO wall box covering the doorway below the lintel. Wall boxes
  // are the only boxes 0.22 deep on the +Z face (trim is 0.3).
  const wallT = Math.min(0.22, door.roomW * 0.04);
  const face = meshes.filter(
    (m) =>
      m.geometry &&
      m.geometry.type === 'BoxGeometry' &&
      Math.abs(m.geometry.parameters.depth - wallT) < 1e-9 &&
      Math.abs(m.position.z - door.doorZ) < 1e-9
  );
  assert.equal(face.length, 3, 'two segments + lintel on the door face');
  const segW = (door.roomW - door.doorW) / 2;
  const segs = face.filter((m) => Math.abs(m.geometry.parameters.width - segW) < 1e-9);
  assert.equal(segs.length, 2, 'two flank segments');
  assert.ok(
    segs.some((m) => Math.abs(m.position.x + (door.doorW / 2 + segW / 2)) < 1e-9),
    'left segment flanks the gap'
  );
  assert.ok(
    segs.some((m) => Math.abs(m.position.x - (door.doorW / 2 + segW / 2)) < 1e-9),
    'right segment flanks the gap'
  );
  const lintel = face.filter((m) => Math.abs(m.geometry.parameters.width - door.doorW) < 1e-9);
  assert.equal(lintel.length, 1, 'one lintel above the gap');
  assert.ok(lintel[0].position.y > door.doorH, 'lintel sits above the door height');
});

test('the doorway mouth is a threshold band, not the whole wall', () => {
  const spec = sunBaseSpecFor(FARMHOUSE);
  const door = interiorRoomDoor(spec);
  const d = SUN_BASE_DOORWAY_TRIGGER_DEPTH_M;
  assert.equal(d, 0.5, 'trigger reaches 0.5 m out from the wall');
  // Inside the mouth: centre, near the wall, at the near edge.
  assert.ok(isDoorwayPoint(door, 0, door.doorZ - 0.1, d), 'centre, at the glow');
  assert.ok(isDoorwayPoint(door, 0, door.doorZ - d, d), 'centre, at the near edge');
  assert.ok(isDoorwayPoint(door, door.doorW / 2 - 0.01, door.doorZ - 0.25, d), 'just inside the frame');
  assert.ok(isDoorwayPoint(door, -(door.doorW / 2 - 0.01), door.doorZ - 0.25, d), 'just inside the other frame');
  // Outside: short of the mouth, past the wall, beside the door,
  // at the back of the room, at the room centre.
  assert.ok(!isDoorwayPoint(door, 0, door.doorZ - d - 0.01, d), 'a step short of the mouth');
  assert.ok(!isDoorwayPoint(door, 0, door.doorZ + 0.01, d), 'past the wall plane');
  assert.ok(!isDoorwayPoint(door, door.doorW / 2 + 0.2, door.doorZ - 0.1, d), 'beside the door, at the wall');
  assert.ok(!isDoorwayPoint(door, 0, 0, d), 'room centre');
  assert.ok(!isDoorwayPoint(door, 0, -door.doorZ + 0.1, d), 'back wall');
  // The walker can reach the mouth: the clamp stops 0.14 m short
  // of the wall, inside the 0.5 m trigger band.
  assert.ok(door.doorZ - 0.14 >= door.doorZ - d, 'clamp max z is inside the trigger band');
  // Bad inputs never fire.
  assert.ok(!isDoorwayPoint(null, 0, door.doorZ, d), 'no door, no fire');
  assert.ok(!isDoorwayPoint(door, 0, door.doorZ, 0), 'no depth, no fire');
  assert.ok(!isDoorwayPoint(door, 'x', door.doorZ, d), 'bad x, no fire');
});

test('all three interiors have a working doorway', () => {
  for (const assetId of [FARMHOUSE, BARN, WINDMILL]) {
    const spec = sunBaseSpecFor(assetId);
    assert.ok(spec, `${assetId} resolves`);
    const door = interiorRoomDoor(spec);
    assert.ok(door.doorW > 0 && door.doorW <= door.roomW * 0.44, `${assetId} door width sane`);
    assert.ok(door.doorH > 0, `${assetId} door height sane`);
    approx(door.doorZ, door.roomD / 2, `${assetId} door sits in the wall plane`);
    assert.ok(
      isDoorwayPoint(door, 0, door.doorZ - 0.1, SUN_BASE_DOORWAY_TRIGGER_DEPTH_M),
      `${assetId} doorway mouth fires`
    );
    assert.ok(
      !isDoorwayPoint(door, 0, 0, SUN_BASE_DOORWAY_TRIGGER_DEPTH_M),
      `${assetId} room centre does not fire`
    );
  }
});

test('the scene wires the doorway to the hub via the portal path', () => {
  const scene = src('../components/SunBaseScene.jsx');
  assert.ok(scene.includes('interiorRoomDoor'), 'scene reads the door geometry');
  assert.ok(scene.includes('isDoorwayPoint('), 'scene checks the doorway mouth');
  assert.ok(scene.includes('SUN_BASE_DOORWAY_TRIGGER_DEPTH_M'), 'scene uses the trigger depth');
  assert.ok(
    scene.includes("inside = { kind: 'map', id: 'map:hub', label: 'Main Hub' }"),
    'doorway fires the Main Hub destination through onPortalWalk'
  );
  assert.ok(!scene.includes('door is a view, not an exit'), 'the old door-is-a-view rule is gone');
  assert.ok(scene.includes('<SunBaseCgi spec={spec} />'), 'the CGI overlay is untouched');
  assert.ok(scene.includes('circleGeometry'), 'the sun disc outside the door is untouched');
});

test('the doorway constant lives in the sun-base module', () => {
  const lib = src('../lib/sun-base.js');
  assert.ok(
    lib.includes('SUN_BASE_DOORWAY_TRIGGER_DEPTH_M = 0.5'),
    'trigger depth is 0.5 m in lib/sun-base.js'
  );
});

test('the page keeps its existing exits: back orb + style orb untouched', () => {
  const page = src('../app/sun-base/page.jsx');
  assert.ok(page.includes('Back to hub'), 'the back-to-hub orb label is still there');
  assert.ok(page.includes('Change interior'), 'the style orb is still there');
  assert.ok(page.includes('router.push(backRoute)'), 'the back orb still exits via backRoute');
  assert.ok(page.includes('onPortalWalk={portalWalk}'), 'the scene still reports walk-throughs to the page');
});
