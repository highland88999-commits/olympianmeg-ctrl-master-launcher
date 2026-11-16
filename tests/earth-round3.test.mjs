// tests/earth-round3.test.mjs — Earth street ROUND 3 (Merlin's
// phone test of 30fee4f9, 2026-10-20 ~22:24 MDT: "Definitely
// getting closer though").
//
//   A. CharacterPicker containment in the Earth console (source
//      contract: an `embedded` in-flow mode, console passes it).
//   B. The Quantum Realm is REMOVED (Merlin, 2026-10-26): no
//      Quantum button, no size row, no tile-selection DROP flow,
//      no master flag module — the console has one level only.
//   C. Raptor scale class + 3rd-person framing: cameraRig's
//      character-aware boom puts the whole body inside the
//      frustum at rest, and the camera-local ground clamp keeps
//      the lens above the terrain at ITS OWN lat/lon (the
//      black-band fix).
//   D. Dry Earth (water removed 2026-10-26): the swim stub
//      always reports dry land — no swim, dive, lift, or pace
//      penalty anywhere, seabed included.
//   E. Street patch grid clearance: every patch vertex rides at
//      or above the globe-grid surface (no facet can slice the
//      foreground into flat green again).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const THREE = await import('three');
const { latLonToVec3, vec3ToLatLon, EARTH_RADIUS } = await import('../lib/geo.js');
const roam = await import('../lib/earth/roam.js');
const swim = await import('../lib/earth/swim.js');
const placements = await import('../lib/earth/placements.js');
const streetPatch = await import('../lib/earth/street-patch.js');
const terrain = await import('../lib/terrain.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const UPM = placements.DISPLAY_UNITS_PER_METRE;

// ------------------------------------------------------------ A + B (source contracts)
const pickerSrc = readFileSync(new URL('../components/characters/CharacterPicker.jsx', import.meta.url), 'utf8');
const consoleSrc = readFileSync(new URL('../components/EarthConsole.jsx', import.meta.url), 'utf8');

check('A: CharacterPicker has an embedded in-flow mode, default off', () => {
  assert.match(pickerSrc, /embedded = false/);
  assert.match(pickerSrc, /position: 'static', width: '100%'/); // panel in flow
  assert.match(pickerSrc, /\{!embedded && \(/); // "CHARACTER" word gated
});

check('A: EarthConsole never mounts the picker (vehicles only — no character, 2026-11-15)', () => {
  assert.ok(!consoleSrc.includes('<CharacterPicker'), 'no picker mount in the console');
  assert.ok(!consoleSrc.includes('characters/CharacterPicker'), 'no picker import in the console');
});

check('B: the Quantum Realm is GONE from the console (no button, no size row, no drop flow)', () => {
  assert.ok(!consoleSrc.includes('Quantum Realm'), 'no Quantum Realm text in the console');
  assert.ok(!consoleSrc.includes('onDropToTile'), 'no drop-to-tile prop in the console');
  assert.ok(!consoleSrc.includes('selectedTile'), 'no tile-selection state in the console');
  assert.ok(!consoleSrc.includes('QUANTUM_ENABLED'), 'no quantum flag in the console');
  assert.ok(!consoleSrc.includes('sizeUi'), 'no size row in the console');
  assert.ok(!consoleSrc.includes('Normal View'), 'no Normal View button in the console');
  assert.ok(!consoleSrc.includes('beginReanimate'), 'no reanimate call in the console');
});

// ------------------------------------------------------------ geo inverse
check('geo: vec3ToLatLon inverts latLonToVec3 (Merlin’s spot)', () => {
  const p = latLonToVec3(53.63, -113.41, 55.4);
  const ll = vec3ToLatLon(p);
  assert.ok(near(ll.lat, 53.63, 1e-9), `lat ${ll.lat}`);
  assert.ok(near(ll.lon, -113.41, 1e-9), `lon ${ll.lon}`);
  assert.ok(near(ll.radius, 55.4, 1e-9));
});

// ------------------------------------------------------------ synthetic worlds
// Former-ocean world: every sample 0 -> below the old sea level
// (r = 55 + (0 - 12/255)*2.6); since the 2026-10-26 water removal
// this reads as dry walkable seabed, depth always 0.
const oceanHD = { data: new Uint8Array(64 * 32).fill(0), w: 64, h: 32 };
// Land world: every sample 200 -> well above sea level.
const landHD = { data: new Uint8Array(64 * 32).fill(200), w: 64, h: 32 };
// Shore world: height depends only on longitude (all rows equal),
// west half ocean (0), east half land (200). w=720 -> lon x index:
// u=(lon+180)/360, x=u*(w-1); the seam sits at x=360 (lon 0).
const shoreData = new Uint8Array(720 * 4);
for (let y = 0; y < 4; y++) {
  for (let x = 0; x < 720; x++) shoreData[y * 720 + x] = x < 360 ? 0 : 200;
}
const shoreHD = { data: shoreData, w: 720, h: 4 };



// ------------------------------------------------------------ D. dry Earth (water removed 2026-10-26)
//
// Earth 1 has no water: the swim state machine is gone, replaced
// by an inert stub (lib/earth/swim.js) that always reports dry
// land. The former ocean is ordinary walkable terrain — the
// walker stands on the heightmap surface everywhere, at full
// walk pace, with no lift off the ground.
check('D: water depth is always 0 — the former ocean reads dry', () => {
  assert.equal(swim.waterDepthM(oceanHD.data, 64, 32, 53.63, -113.41), 0);
  assert.equal(swim.waterDepthM(landHD.data, 64, 32, 53.63, -113.41), 0);
  assert.equal(swim.waterDepthM(null, 0, 0, 0, 0), 0);
  assert.equal(swim.swimAltMFor(), 0);
  assert.equal(swim.maxSubmergeM(), 0);
  assert.equal(swim.veilOpacityFor(), 0);
});

check('D: stepSwim clears to dry and never activates, even on the former ocean', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 10, -90, 0);
  swim.stepSwim(s, {}, 1 / 60, oceanHD.data, 64, 32);
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.submergeM, 0);
  assert.equal(s.swim.altM, 0);
  assert.equal(s.swim.depthM, 0);
  // dive/surface inputs are ignored, never re-armed
  for (let i = 0; i < 60; i++) swim.stepSwim(s, { dive: true }, 1 / 60, oceanHD.data, 64, 32);
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.altM, 0);
  for (let i = 0; i < 60; i++) swim.stepSwim(s, { surface: true }, 1 / 60, oceanHD.data, 64, 32);
  assert.equal(s.swim.active, false);
});

check('D: a fresh roam state carries no swim sub-state', () => {
  const s = roam.createRoamState();
  assert.equal(s.swim, undefined);
});

check('D: stepRoam walks the former seabed at full pace — no swim penalty', () => {
  const mk = () => { const s = roam.createRoamState(); roam.beginRoam(s, 10, -90, 0); return s; };
  const dry = mk();
  const wet = mk();
  roam.stepRoam(dry, { forward: 1, strafe: 0 }, 1, { heightData: { data: landHD.data, w: 64, h: 32 }, radius: EARTH_RADIUS });
  roam.stepRoam(wet, { forward: 1, strafe: 0 }, 1, { heightData: { data: oceanHD.data, w: 64, h: 32 }, radius: EARTH_RADIUS });
  const dDry = Math.abs(dry.lat - 10);
  const dWet = Math.abs(wet.lat - 10);
  assert.ok(dWet > 0 && dDry > 0);
  assert.ok(near(dWet / dDry, 1, 0.02), `pace ratio ${dWet / dDry} (was ${swim.SWIM_SPEED_FACTOR} when water existed)`);
  // dive input is ignored: same distance with dive held
  const diver = mk();
  roam.stepRoam(diver, { forward: 1, strafe: 0, dive: true }, 1, { heightData: { data: oceanHD.data, w: 64, h: 32 }, radius: EARTH_RADIUS });
  assert.ok(near(Math.abs(diver.lat - 10), dWet, 1e-9));
});

check('D: cameraRig stands the avatar on the ground — swimAltM accepted and ignored', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 10, -90, 0);
  const plain = roam.cameraRig(s, oceanHD.data, 64, 32, {});
  const lifted = roam.cameraRig(s, oceanHD.data, 64, 32, { swimAltM: 5 });
  for (const rig of [plain, lifted]) {
    const lift = Math.hypot(rig.avatarPos.x - rig.ground.x, rig.avatarPos.y - rig.ground.y, rig.avatarPos.z - rig.ground.z);
    assert.ok(near(lift, 0), `avatar lift ${lift / UPM} m`);
  }
});

// ------------------------------------------------------------ C. framing + clamps
// Claw's MEASURED size through the real attach path (headless
// harness, real GLB, 2026-10-20): 3.50 m long, bbox top 2.19 m.
const RAPTOR = { heightM: 2.19, lengthM: 3.5 };

check('C: the boom stretches for a raptor and stays 7.5 m for the native figure', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 53.63, -113.41, 0);
  const native = roam.cameraRig(s, landHD.data, 64, 32, {});
  assert.ok(near(native.boomM, roam.ROAM_CAM_BACK_M, 1e-9), `native boom ${native.boomM}`);
  const raptor = roam.cameraRig(s, landHD.data, 64, 32, { charSizeM: RAPTOR });
  assert.ok(raptor.boomM > 9.9 && raptor.boomM < 10.1, `raptor boom ${raptor.boomM}`);
});

// Project the raptor's bbox corners through the rig's own view
// (lookAt from camPos to lookTarget, up = surface normal) with the
// street FOV (55) at portrait and landscape aspects. Every corner
// must land inside the frustum: the whole animal in front of the
// camera, at rest, at Merlin's spot.
function frustumCheck(charSizeM, aspect, label) {
  const s = roam.createRoamState();
  roam.beginRoam(s, 53.63, -113.41, 0);
  const rig = roam.cameraRig(s, landHD.data, 64, 32, { charSizeM });
  const cam = new THREE.Vector3(rig.camPos.x, rig.camPos.y, rig.camPos.z);
  const look = new THREE.Vector3(rig.lookTarget.x, rig.lookTarget.y, rig.lookTarget.z);
  const up = new THREE.Vector3(rig.normal.x, rig.normal.y, rig.normal.z);
  // The renderer's own pipeline: a PerspectiveCamera seated at the
  // rig's lens, aimed at the rig's look target.
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.01, 500);
  camera.position.copy(cam);
  camera.up.copy(up);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const fwd = new THREE.Vector3(rig.forward.x, rig.forward.y, rig.forward.z);
  const nrm = up.clone();
  const side = new THREE.Vector3().crossVectors(nrm, fwd).normalize();
  const base = new THREE.Vector3(rig.avatarPos.x, rig.avatarPos.y, rig.avatarPos.z);
  const H = charSizeM.heightM * UPM;
  const L = charSizeM.lengthM * UPM;
  const W = 0.9 * UPM;
  for (const a of [-0.5, 0.5]) for (const b of [0, 1]) for (const c of [-0.5, 0.5]) {
    const p = base.clone()
      .addScaledVector(fwd, a * L)
      .addScaledVector(nrm, b * H)
      .addScaledVector(side, c * W);
    const v = p.clone().applyMatrix4(m);
    // applyMatrix4 on Vector3 does the perspective divide
    assert.ok(Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1,
      `${label} corner (${a},${b},${c}) NDC (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
  }
  // and the camera itself is in FRONT of the tail: the body centre
  // is ahead of the lens along the view direction
  const viewDir = look.clone().sub(cam).normalize();
  const toBody = base.clone().addScaledVector(nrm, H / 2).sub(cam);
  assert.ok(toBody.dot(viewDir) > 0, `${label}: body ahead of camera`);
}

check('C: raptor fully inside the frustum at rest — portrait phone', () => {
  frustumCheck(RAPTOR, 1179 / 2556, 'portrait');
});
check('C: raptor fully inside the frustum at rest — landscape', () => {
  frustumCheck(RAPTOR, 2556 / 1179, 'landscape');
});
check('C: T-Rex class (12 m) also frames whole', () => {
  frustumCheck({ heightM: 4.5, lengthM: 12 }, 1179 / 2556, 'trex portrait');
});

check('C: camera-local clamp — a wall of terrain behind the walker lifts the lens', () => {
  // Height as a function of longitude only, sampled finely
  // (w=360000 -> 0.001 deg/px ~ 66 m at this latitude): flat at
  // the walker (sample 26), rising steeply to the WEST.
  const W = 360000; const H = 4;
  const data = new Uint8Array(W * H);
  const xWalker = Math.floor((( -113.41 + 180) / 360) * (W - 1));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      data[y * W + x] = x >= xWalker ? 26 : Math.min(255, 26 + (xWalker - x) * 24);
    }
  }
  const s = roam.createRoamState();
  roam.beginRoam(s, 53.63, -113.41, 90); // facing east; camera hangs WEST, into the rise
  s.pitchDeg = roam.ROAM_PITCH_MIN; // lens swung low
  const rig = roam.cameraRig(s, data, W, H, {});
  const camLL = vec3ToLatLon(rig.camPos);
  const surfR = placements.surfaceRadiusAt(data, W, H, camLL.lat, camLL.lon);
  const minR = surfR + roam.ROAM_MIN_CAM_ABOVE_GROUND_M * UPM;
  assert.ok(camLL.radius >= minR - 1e-9,
    `camera radius ${camLL.radius} vs local floor ${minR} at ${camLL.lat},${camLL.lon}`);
});

check('C: on flat ground the clamp never perturbs the rig', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 53.63, -113.41, 200);
  s.pitchDeg = 85; // extreme down-look
  const rig = roam.cameraRig(s, landHD.data, 64, 32, {});
  const camLL = vec3ToLatLon(rig.camPos);
  const surfR = placements.surfaceRadiusAt(landHD.data, 64, 32, camLL.lat, camLL.lon);
  assert.ok(camLL.radius >= surfR + roam.ROAM_MIN_CAM_ABOVE_GROUND_M * UPM - 1e-9);
});

// ------------------------------------------------------------ E. patch clearance
check('E: street patch rides at/above BOTH the true surface and the globe grid', () => {
  // Deterministic rough terrain (rolling values, sharp relief).
  const W = 256; const H = 128;
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      data[y * W + x] = Math.floor(120 + 90 * Math.sin(x * 0.31) * Math.cos(y * 0.47) + 40 * Math.sin(x * 1.7 + y * 2.3));
    }
  }
  const geo = streetPatch.buildStreetPatchGeometryData(data, W, H, 53.63, -113.41);
  assert.equal(geo.positions.length / 3, geo.vertexCount);
  let minClear = Infinity;
  for (let i = 0; i < geo.vertexCount; i++) {
    const p = { x: geo.positions[i * 3], y: geo.positions[i * 3 + 1], z: geo.positions[i * 3 + 2] };
    const ll = vec3ToLatLon(p);
    const gridR = streetPatch.globeGridSurfaceRadius(data, W, H, ll.lat, ll.lon);
    const trueR = placements.surfaceRadiusAt(data, W, H, ll.lat, ll.lon);
    minClear = Math.min(minClear, ll.radius - Math.max(gridR, trueR));
  }
  // eps covers the float round-trip position -> lat/lon -> surface
  // on deliberately cliff-steep synthetic terrain (1e-5 hub units
  // is ~0.6 display mm; the measured worst case was 2.7e-6 under).
  assert.ok(minClear >= streetPatch.PATCH_LIFT - 1e-5,
    `worst clearance ${minClear} hub units (lift ${streetPatch.PATCH_LIFT})`);
});

check('E: patch coverage tripled to ~338 m with centre-dense rings (Merlin, 2026-10-22: render range ×3)', () => {
  assert.ok(near(streetPatch.STREET_PATCH_RADIUS, 5.4), `radius ${streetPatch.STREET_PATCH_RADIUS}`);
  const geo = streetPatch.buildStreetPatchGeometryData(landHD.data, 64, 32, 53.63, -113.41);
  // vertex budget stays phone-sane (one geometry, no textures)
  assert.ok(geo.vertexCount < 8000, `vertices ${geo.vertexCount}`);
});

console.log(`earth-round3: ${passed} checks passed`);
