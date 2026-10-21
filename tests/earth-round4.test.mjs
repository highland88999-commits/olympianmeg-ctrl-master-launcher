// tests/earth-round4.test.mjs — Earth street ROUND 4 (Merlin's
// 113-second phone recording of the round-3 build, 2026-10-21:
// parachute into the Arctic tile at 84.82°N 118.47°W, swim,
// Quantum Realm, grow back, dive, return to orbit).
//
//   A. Swim × parachute: the Quantum dive SUSPENDS the swim
//      state (cleared, inputs inert), growing back restores a
//      sane surface swim (defect 2).
//   B. Camera clamps read the DRAWN surface: the higher of the
//      true sampled surface and the coarse globe-grid surface
//      (defect 5).
//   C. Polar color law: ice is a LAND color in the hypsometric
//      ramp — open polar ocean stays clear bright blue; the
//      globe shader carries the same gate plus an ambient floor
//      under the night side (defect 4).
//   D. The Quantum Realm seal (defect 1), the swim-controls
//      stand-down (defect 2 UI), the atmosphere shell gate
//      (defect 5), the micro disc texture work (defect 3), and
//      the console ghost fix (defect 6) — source contracts.
//   E. The underwater veil answers to the swimmer, not only the
//      camera (defect 7): veilOpacityFor's decision table.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { vec3ToLatLon, EARTH_RADIUS } = await import('../lib/geo.js');
const roam = await import('../lib/earth/roam.js');
const swim = await import('../lib/earth/swim.js');
const parachute = await import('../lib/earth/parachute.js');
const placements = await import('../lib/earth/placements.js');
const streetPatch = await import('../lib/earth/street-patch.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const UPM = placements.DISPLAY_UNITS_PER_METRE;

// Open ocean everywhere: height 0 reads 7.65 m deep — the same
// depth as Merlin's Arctic landing spot (7.6 m in his footage).
const oceanHD = { data: new Uint8Array(64 * 32).fill(0), w: 64, h: 32 };

// ------------------------------------------------------------ A. swim × parachute
check('A: water depth at the all-zero heightmap matches the footage (7.6 m)', () => {
  const d = swim.waterDepthM(oceanHD.data, 64, 32, 84.82, -118.47);
  assert.ok(near(d, 7.65, 0.05), `depth ${d}`);
});

check('A: suspension clears the swim state but keeps the true depth', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 84.82, -118.47, 90);
  for (let i = 0; i < 120; i++) swim.stepSwim(s, { dive: true }, 1 / 60, oceanHD.data, 64, 32);
  assert.ok(s.swim.active && s.swim.submergeM > 2.5, `dived to ${s.swim.submergeM}`);
  swim.stepSwim(s, {}, 1 / 60, oceanHD.data, 64, 32, { suspended: true });
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.submergeM, 0);
  assert.equal(s.swim.altM, 0);
  assert.ok(near(s.swim.depthM, 7.65, 0.05), `depth still tracked: ${s.swim.depthM}`);
});

check('A: dive/surface inputs are inert while suspended', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 84.82, -118.47, 90);
  for (let i = 0; i < 120; i++) {
    swim.stepSwim(s, { dive: true }, 1 / 60, oceanHD.data, 64, 32, { suspended: true });
  }
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.submergeM, 0);
  assert.equal(s.swim.altM, 0);
});

check('A: growing back restores a surface swim (dive reset, still in water)', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 84.82, -118.47, 90);
  for (let i = 0; i < 120; i++) swim.stepSwim(s, { dive: true }, 1 / 60, oceanHD.data, 64, 32);
  swim.stepSwim(s, {}, 1 / 60, oceanHD.data, 64, 32, { suspended: true });
  swim.stepSwim(s, {}, 1 / 60, oceanHD.data, 64, 32); // first normal frame back
  assert.equal(s.swim.active, true);
  assert.equal(s.swim.submergeM, 0);
  assert.ok(s.swim.altM > 0, 'floating at the surface again');
});

check('A: stepRoam suspends the swim below Ant-Man scale and restores it on grow-back', () => {
  const opts = { heightData: oceanHD, radius: EARTH_RADIUS };
  const s = roam.createRoamState();
  try {
    parachute.parachuteState.scale = 1;
    roam.beginRoam(s, 84.82, -118.47, 90);
    roam.stepRoam(s, { forward: 0, strafe: 0, dive: true }, 1 / 60, opts);
    roam.stepRoam(s, { forward: 0, strafe: 0, dive: true }, 1 / 60, opts);
    assert.equal(s.swim.active, true, 'swimming at normal scale');
    parachute.parachuteState.scale = 0.00001; // shrunk into the tile
    for (let i = 0; i < 30; i++) roam.stepRoam(s, { forward: 0, strafe: 0, dive: true }, 1 / 60, opts);
    assert.equal(s.swim.active, false, 'no swimming in the Quantum Realm');
    assert.equal(s.swim.submergeM, 0);
    parachute.parachuteState.scale = 1; // REANIMATE
    roam.stepRoam(s, { forward: 0, strafe: 0 }, 1 / 60, opts);
    assert.equal(s.swim.active, true, 'surface swim restored on grow-back');
    assert.equal(s.swim.submergeM, 0);
  } finally {
    parachute.parachuteState.scale = 1;
  }
});

// ------------------------------------------------------------ B. camera clamps read the drawn surface
check('B: globeGridSurfaceRadius lives in placements and street-patch re-exports the same function', () => {
  assert.equal(typeof placements.globeGridSurfaceRadius, 'function');
  assert.equal(streetPatch.globeGridSurfaceRadius, placements.globeGridSurfaceRadius);
  assert.equal(streetPatch.GLOBE_GRID_W, placements.GLOBE_GRID_W);
});

// A plateau at height 200 with a one-pixel notch carved at the
// centre of a coarse globe-grid cell (fixture dimensions make the
// cell centre land exactly on a fine pixel: 385 = 4*96+1,
// 145 = 2*72+1). Inside the cell the DRAWN (grid) surface is the
// plateau; the TRUE sampled surface at the notch is sea level.
const notchW = 385;
const notchH = 145;
const notchData = new Uint8Array(notchW * notchH).fill(200);
const cellI = 48;
const cellJ = 20;
const notchX = (cellI + 0.5) * 4;
// sampleHeight flips v (data row 0 is the north edge), so the
// cell centre's data row counts from the bottom of the array.
const notchY = (notchH - 1) - (cellJ + 0.5) * 2;
notchData[notchY * notchW + notchX] = 12;
const notchU = (cellI + 0.5) / placements.GLOBE_GRID_W;
const notchV = (cellJ + 0.5) / placements.GLOBE_GRID_H;
const notchLat = notchV * 180 - 90;
const notchLon = notchU * 360 - 180;

check('B: fixture is non-vacuous — the grid surface towers over the true surface in the notch cell', () => {
  const gridR = placements.globeGridSurfaceRadius(notchData, notchW, notchH, notchLat, notchLon);
  const trueR = placements.surfaceRadiusAt(notchData, notchW, notchH, notchLat, notchLon);
  assert.ok(gridR > trueR + 1.0, `grid ${gridR} vs true ${trueR}`);
});

check('B: cameraRig lifts the lens over the DRAWN surface, not just the true one', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, notchLat, notchLon, 90);
  s.pitchDeg = 85; // lens low, at head height behind the walker
  const rig = roam.cameraRig(s, notchData, notchW, notchH, {});
  const camLL = vec3ToLatLon(rig.camPos);
  const gridR = placements.globeGridSurfaceRadius(notchData, notchW, notchH, camLL.lat, camLL.lon);
  const trueR = placements.surfaceRadiusAt(notchData, notchW, notchH, camLL.lat, camLL.lon);
  const minR = gridR + roam.ROAM_MIN_CAM_ABOVE_GROUND_M * UPM;
  assert.ok(camLL.radius >= minR - 1e-9,
    `camera radius ${camLL.radius} vs drawn-surface floor ${minR}`);
  assert.ok(camLL.radius > trueR + 1.0,
    `the grid term did the lifting (true surface only ${trueR})`);
});

// ------------------------------------------------------------ C. polar color law
check('C: open polar ocean is bright blue, NOT ice white (hypsometric ramp)', () => {
  const vPolar = (84.82 + 90) / 180;
  const c = streetPatch.hypsometricColor(0, vPolar); // h = 0: deep open water
  assert.ok(c[0] < 0.05 && c[2] > 0.15, `ocean color [${c}] must be blue, not ice`);
  assert.ok(c[2] > c[0] * 3, 'blue channel dominates');
});

check('C: polar LAND still wears its ice cap', () => {
  const vPolar = (84.82 + 90) / 180;
  const c = streetPatch.hypsometricColor(0.3, vPolar); // well above sea level
  assert.ok(near(c[0], 0.93, 1e-9) && near(c[2], 0.98, 1e-9), `ice color [${c}]`);
});

check('C: the globe shader carries the same land-gated ice and a night ambient floor', () => {
  const src = readFileSync(new URL('../components/ProceduralEarthGlobe.jsx', import.meta.url), 'utf8');
  assert.match(src, /float ice = smoothstep\(0\.80, 0\.88, lat\) \* landAmt;/);
  assert.match(src, /col \+= dayColor \* 0\.14 \* \(1\.0 - dayMix\);/);
});

// ------------------------------------------------------------ D. source contracts: seal, gates, textures, console
const homeSrc = readFileSync(new URL('../components/HomeScene.jsx', import.meta.url), 'utf8');
const nexusSrc = readFileSync(new URL('../components/NexusEarth.jsx', import.meta.url), 'utf8');
const consoleSrc = readFileSync(new URL('../components/EarthConsole.jsx', import.meta.url), 'utf8');
const patchSrc = readFileSync(new URL('../components/StreetGroundPatch.jsx', import.meta.url), 'utf8');
const flightSrc = readFileSync(new URL('../components/EarthFlightController.jsx', import.meta.url), 'utf8');

check('D1: the QuantumGate seals the hub in HomeScene (towers, rings, labels, Mars, decor, stars)', () => {
  assert.match(homeSrc, /function QuantumGate/);
  assert.match(homeSrc, /visible=\{!micro\}/);
  for (const sealed of ['GodOrbitRings', 'MarsBackground', 'SystemRings', 'SeasonalDecor', 'TextureProvider', 'BikeRig']) {
    const gateOpen = homeSrc.indexOf('<QuantumGate>');
    const inside = homeSrc.indexOf(`<${sealed}`); // the render site, not the import
    const gateClose = homeSrc.indexOf('</QuantumGate>', inside);
    assert.ok(gateOpen >= 0 && inside > gateOpen && gateClose > inside,
      `${sealed} must render inside a QuantumGate`);
  }
  // NexusEarth (globe + realm) stays OUTSIDE the gates.
  const nexusAt = homeSrc.indexOf('<NexusEarth');
  const before = homeSrc.lastIndexOf('<QuantumGate>', nexusAt);
  const closedBefore = homeSrc.lastIndexOf('</QuantumGate>', nexusAt);
  assert.ok(closedBefore > before || before === -1, 'NexusEarth is not inside a QuantumGate');
});

check('D1: at deep micro the globe itself stands down inside NexusEarth', () => {
  assert.match(nexusSrc, /const DEEP_MICRO_SCALE = 0\.05;/);
  assert.match(nexusSrc, /effectiveLayer === 'terrain' && !deepMicro && <ProceduralEarthGlobe/);
});

check('D2: SwimControls stand down at micro in BOTH console branches', () => {
  const gates = consoleSrc.match(/swimUi\.active && !sizeUi\.micro/g) || [];
  assert.equal(gates.length, 2);
});

check('D5: the atmosphere shell is camera-distance gated (no white transit)', () => {
  assert.match(nexusSrc, /const SHELL_CAMERA_MIN_DIST = 57\.5;/);
  assert.match(nexusSrc, /shellRef\.current\.visible = state\.camera\.position\.distanceTo\(EARTH_CENTER_WORLD\) > SHELL_CAMERA_MIN_DIST;/);
  assert.match(nexusSrc, /<group ref=\{shellRef\} visible=\{false\}>/);
});

check('D5: the flight controller backstop reads the grid surface too', () => {
  assert.match(flightSrc, /globeGridSurfaceRadius\(hdClamp\.data, hdClamp\.w, hdClamp\.h, camLat, camLon\)/);
});

check('D3: the micro disc carries wide-contrast grain and vertex mottling on a ring grid', () => {
  assert.match(patchSrc, /100 \+ Math\.floor\(rnd\(\) \* 140\)/);
  assert.match(patchSrc, /<ringGeometry args=\{\[0, MICRO_DISC_RADIUS_U, 48, 6\]\} \/>/);
  assert.match(patchSrc, /matRef\.current\.vertexColors = true;/);
});

check('D6: the console card centers by flex, carries its own layer, no translate centering', () => {
  assert.ok(!consoleSrc.includes('-translate-x-1/2 -translate-y-1/2'),
    'the transform-centered wrapper is gone');
  assert.match(consoleSrc, /flex items-center justify-center pointer-events-none/);
  assert.match(consoleSrc, /\[transform:translateZ\(0\)\]/);
});

// ------------------------------------------------------------ E. veil decision table
check('E: veilOpacityFor — air reads air, water reads water at any camera seat', () => {
  assert.equal(swim.veilOpacityFor({ camUnder: false, submergeM: 0 }), 0);
  assert.ok(near(swim.veilOpacityFor({ camUnder: true, submergeM: 0 }), 0.3, 1e-9));
  // Merlin's footage case: swimmer 6.4 m down, lens lifted out.
  assert.ok(near(swim.veilOpacityFor({ camUnder: false, submergeM: 6.4 }), 0.52, 1e-9));
  assert.ok(near(swim.veilOpacityFor({ camUnder: true, submergeM: 6.4 }), 0.52, 1e-9));
  // Deepening is monotonic and caps.
  const a = swim.veilOpacityFor({ camUnder: false, submergeM: 1 });
  const b = swim.veilOpacityFor({ camUnder: false, submergeM: 3 });
  assert.ok(b > a && b <= 0.52);
});

console.log(`earth-round4: ${passed} checks passed`);
