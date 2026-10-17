// tests/earth-roam.test.mjs — street-level free roam math for the
// hub Earth (campaign Day 2): spawn integrity against the bridge,
// great-circle stepping, tangent frames, and the third-person
// camera rig's grounding on the real terrain sampler.
// Run: node tests/earth-roam.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  landmarkSpawns,
  createRoamState,
  beginRoam,
  endRoam,
  destinationPoint,
  stepRoam,
  tangentFrame,
  headingVector,
  cameraRig,
  ROAM_MAX_SPEED,
  ROAM_HEAD_M,
  ROAM_MIN_CAM_ABOVE_GROUND_M,
} from '../lib/earth/roam.js';
import { DISPLAY_UNITS_PER_METRE, surfaceRadiusAt } from '../lib/earth/placements.js';
import { latLonToVec3, EARTH_RADIUS } from '../lib/geo.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

const OW = 64, OH = 32;
const seaLevel = new Uint8Array(OW * OH).fill(12); // sample == TERRAIN_SEA_LEVEL -> radius 55
const land = new Uint8Array(OW * OH).fill(200);

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const mag = (a) => Math.hypot(a.x, a.y, a.z);

check('spawn list: the 25 exact singles, true coordinates, named', () => {
  const spawns = landmarkSpawns();
  assert.equal(spawns.length, 25);
  for (const s of spawns) {
    assert.ok(typeof s.name === 'string' && s.name.length > 0, s.id);
    assert.ok(s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180, s.id);
  }
  const eiffel = spawns.find((s) => s.id.startsWith('e049'));
  assert.ok(eiffel && near(eiffel.lat, 48.8584, 1e-9) && near(eiffel.lon, 2.2945, 1e-9));
  const fuji = spawns.find((s) => s.id.startsWith('e042'));
  assert.ok(fuji && near(fuji.lat, 35.3606, 1e-9) && near(fuji.lon, 138.7274, 1e-9));
});

check('destination point: one degree of arc, cardinal bearings', () => {
  const oneDeg = Math.PI / 180;
  const east = destinationPoint(0, 0, 90, oneDeg);
  assert.ok(near(east.lat, 0, 1e-9) && near(east.lon, 1, 1e-9), JSON.stringify(east));
  const north = destinationPoint(0, 0, 0, oneDeg);
  assert.ok(near(north.lat, 1, 1e-9) && near(north.lon, 0, 1e-9), JSON.stringify(north));
  const back = destinationPoint(10, 20, 180, oneDeg);
  assert.ok(near(back.lat, 9, 1e-9) && near(back.lon, 20, 1e-6), JSON.stringify(back));
});

check('step: full-tilt forward walks the heading at max speed', () => {
  const st = beginRoam(createRoamState(), 48.8584, 2.2945, 0); // Paris, facing north
  stepRoam(st, { forward: 1, strafe: 0 }, 1, { radius: EARTH_RADIUS });
  const expectDeg = (ROAM_MAX_SPEED / EARTH_RADIUS) * (180 / Math.PI);
  assert.ok(st.moving && st.sprinting, 'full tilt is a run');
  assert.ok(near(st.lat, 48.8584 + expectDeg, 1e-6), `lat ${st.lat}`);
  assert.ok(near(st.lon, 2.2945, 1e-6), `lon ${st.lon}`);
  assert.ok(near(st.faceDeg, 0, 1e-9));
});

check('step: strafe right from north heads east; idle input parks', () => {
  const st = beginRoam(createRoamState(), 0, 0, 0);
  stepRoam(st, { forward: 0, strafe: 1 }, 1, { radius: EARTH_RADIUS });
  assert.ok(st.lon > 0.2 && Math.abs(st.lat) < 0.01, JSON.stringify(st));
  assert.ok(near(st.faceDeg, 90, 1e-6));
  const before = { lat: st.lat, lon: st.lon };
  stepRoam(st, { forward: 0, strafe: 0 }, 1, { radius: EARTH_RADIUS });
  assert.ok(!st.moving && st.lat === before.lat && st.lon === before.lon);
});

check('step: analog magnitude curves the speed (half tilt < half speed)', () => {
  const a = beginRoam(createRoamState(), 0, 0, 0);
  const b = beginRoam(createRoamState(), 0, 0, 0);
  stepRoam(a, { forward: 1, strafe: 0 }, 1, { radius: EARTH_RADIUS });
  stepRoam(b, { forward: 0.5, strafe: 0 }, 1, { radius: EARTH_RADIUS });
  assert.ok(b.lat < a.lat * 0.55 && b.lat > a.lat * 0.35, `half-tilt lat ${b.lat} vs full ${a.lat}`);
  assert.ok(!b.sprinting && a.sprinting);
});

check('tangent frame: orthonormal, east x north = normal', () => {
  for (const [lat, lon] of [[0, 0], [48.85, 2.29], [-33.96, 18.41], [64, -21]]) {
    const f = tangentFrame(lat, lon);
    assert.ok(near(mag(f.normal), 1, 1e-12) && near(mag(f.east), 1, 1e-12) && near(mag(f.north), 1, 1e-12));
    assert.ok(near(dot(f.normal, f.east), 0, 1e-12) && near(dot(f.normal, f.north), 0, 1e-12));
    const cross = {
      x: f.east.y * f.north.z - f.east.z * f.north.y,
      y: f.east.z * f.north.x - f.east.x * f.north.z,
      z: f.east.x * f.north.y - f.east.y * f.north.x,
    };
    assert.ok(near(cross.x, f.normal.x, 1e-12) && near(cross.y, f.normal.y, 1e-12) && near(cross.z, f.normal.z, 1e-12),
      `handedness at ${lat},${lon}`);
    const p = latLonToVec3(lat, lon, 1);
    assert.ok(near(f.normal.x, p.x, 1e-12) && near(f.normal.y, p.y, 1e-12) && near(f.normal.z, p.z, 1e-12));
  }
});

check('heading vector: 0 faces north, 90 faces east', () => {
  const f = tangentFrame(40, -105);
  const n = headingVector(f, 0);
  const e = headingVector(f, 90);
  assert.ok(near(n.x, f.north.x, 1e-12) && near(n.y, f.north.y, 1e-12));
  assert.ok(near(e.x, f.east.x, 1e-12) && near(e.y, f.east.y, 1e-12));
});

check('camera rig: grounded on the sampled terrain, camera behind the head', () => {
  const st = beginRoam(createRoamState(), 54, -115, 90); // facing east
  const rig = cameraRig(st, land, OW, OH);
  const expectR = surfaceRadiusAt(land, OW, OH, 54, -115);
  assert.ok(near(rig.surfaceRadius, expectR, 1e-9));
  assert.ok(near(mag(rig.ground), expectR, 1e-9));
  // Head is ROAM_HEAD_M display-metres straight up the normal.
  const headOff = {
    x: rig.head.x - rig.ground.x, y: rig.head.y - rig.ground.y, z: rig.head.z - rig.ground.z,
  };
  assert.ok(near(mag(headOff), ROAM_HEAD_M * DISPLAY_UNITS_PER_METRE, 1e-9));
  assert.ok(near(dot(headOff, rig.normal), ROAM_HEAD_M * DISPLAY_UNITS_PER_METRE, 1e-9));
  // Camera sits behind the facing direction and above the ground.
  const camRel = { x: rig.camPos.x - rig.head.x, y: rig.camPos.y - rig.head.y, z: rig.camPos.z - rig.head.z };
  assert.ok(dot(camRel, rig.forward) < 0, 'camera must trail the facing direction');
  assert.ok(mag(rig.camPos) > mag(rig.ground), 'camera above the surface');
  // Look target leads the head along the facing direction.
  const lookRel = { x: rig.lookTarget.x - rig.head.x, y: rig.lookTarget.y - rig.head.y, z: rig.lookTarget.z - rig.head.z };
  assert.ok(dot(lookRel, rig.forward) > 0);
});

check('camera rig: without height data it grounds on the base sphere', () => {
  const st = beginRoam(createRoamState(), 10, 10, 0);
  const rig = cameraRig(st, null, 0, 0);
  assert.ok(near(rig.surfaceRadius, EARTH_RADIUS, 1e-12));
  const flat = cameraRig(st, seaLevel, OW, OH);
  assert.ok(near(flat.surfaceRadius, EARTH_RADIUS, 1e-6), `sea-level radius ${flat.surfaceRadius}`);
});

check('begin/end roam toggles the session flags cleanly', () => {
  const st = createRoamState();
  assert.ok(!st.active && !st.moving);
  beginRoam(st, 1, 2, 45);
  assert.ok(st.active && st.lat === 1 && st.lon === 2 && st.yawDeg === 45 && st.faceDeg === 45);
  endRoam(st);
  assert.ok(!st.active && !st.moving && !st.sprinting && st.speed01 === 0);
});

check('camera rig: absolute floor holds at the steepest negative pitch', () => {
  const st = beginRoam(createRoamState(), 54, -115, 90);
  st.pitchDeg = -28; // ROAM_PITCH_MIN: boom dips the lens toward the dirt
  const rig = cameraRig(st, land, OW, OH);
  const camAboveM = dot(
    { x: rig.camPos.x - rig.ground.x, y: rig.camPos.y - rig.ground.y, z: rig.camPos.z - rig.ground.z },
    rig.normal,
  ) / DISPLAY_UNITS_PER_METRE;
  assert.ok(
    camAboveM >= ROAM_MIN_CAM_ABOVE_GROUND_M - 1e-9,
    `camera ${camAboveM.toFixed(3)}m above ground, floor is ${ROAM_MIN_CAM_ABOVE_GROUND_M}m`,
  );
});

check('camera rig: absolute floor holds across the full pitch sweep', () => {
  for (const pitch of [-28, -15, 0, 14, 30, 55]) {
    const st = beginRoam(createRoamState(), -33.86, 151.21, 180);
    st.pitchDeg = pitch;
    const rig = cameraRig(st, land, OW, OH);
    const camAboveM = dot(
      { x: rig.camPos.x - rig.ground.x, y: rig.camPos.y - rig.ground.y, z: rig.camPos.z - rig.ground.z },
      rig.normal,
    ) / DISPLAY_UNITS_PER_METRE;
    assert.ok(
      camAboveM >= ROAM_MIN_CAM_ABOVE_GROUND_M - 1e-9,
      `pitch ${pitch}: camera ${camAboveM.toFixed(3)}m above ground`,
    );
  }
});

check('camera rig: avatar stays planted on the ground (floor is for the lens)', () => {
  const st = beginRoam(createRoamState(), 54, -115, 90);
  st.pitchDeg = -28;
  const rig = cameraRig(st, land, OW, OH);
  assert.ok(near(mag(rig.avatarPos), mag(rig.ground), 1e-9), 'avatar sits exactly on the surface');
});

console.log(`earth-roam: ${passed} checks passed`);
