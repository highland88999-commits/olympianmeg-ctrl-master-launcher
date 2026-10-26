// tests/earth-round4.test.mjs — Earth street ROUND 4 (Merlin's
// 113-second phone recording of the round-3 build, 2026-10-21:
// parachute into the Arctic tile at 84.82°N 118.47°W, swim,
// Quantum Realm, grow back, dive, return to orbit).
//
//   A. Dry Earth × parachute: no swim state exists at any scale
//      (water removed 2026-10-26) — the Quantum dive/shrink
//      neither suspends nor restores anything.
//   B. Camera clamps read the DRAWN surface: the higher of the
//      true sampled surface and the coarse globe-grid surface
//      (defect 5).
//   C. Polar color law: with no water left, ice sits at polar
//      latitudes outright (no land gate); the former polar ocean
//      floor is dry seabed tan; the globe shader carries the
//      same outright ice plus an ambient floor under the night
//      side (defect 4, re-lawed 2026-10-26).
//   D. The Quantum Realm seal (defect 1), the swim-controls
//      removal (defect 2 UI, water gone), the atmosphere shell gate
//      (defect 5), the micro disc texture work (defect 3), and
//      the console ghost fix (defect 6) — source contracts.
//   E. The underwater veil is gone: veilOpacityFor always reads
//      0 on dry Earth (defect 7 retired 2026-10-26).
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

// Former-ocean fixture: height 0 sat 7.65 m deep in Merlin's
// Arctic footage — since the 2026-10-26 water removal it reads
// as dry walkable seabed, depth always 0.
const oceanHD = { data: new Uint8Array(64 * 32).fill(0), w: 64, h: 32 };

// ------------------------------------------------------------ A. dry Earth × parachute (water removed 2026-10-26)
//
// No swim state exists at any scale: the Quantum dive/shrink
// no longer suspends or restores anything, because there is no
// water to swim in. The former Arctic ocean is dry walkable
// seabed, and stepRoam walks it at full pace.
check('A: water depth at the all-zero heightmap is 0 — the former Arctic ocean reads dry', () => {
  assert.equal(swim.waterDepthM(oceanHD.data, 64, 32, 84.82, -118.47), 0);
  assert.equal(swim.swimAltMFor(), 0);
  assert.equal(swim.maxSubmergeM(), 0);
});

check('A: stepSwim never activates, suspended or not', () => {
  const s = roam.createRoamState();
  roam.beginRoam(s, 84.82, -118.47, 90);
  for (let i = 0; i < 120; i++) swim.stepSwim(s, { dive: true }, 1 / 60, oceanHD.data, 64, 32);
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.submergeM, 0);
  assert.equal(s.swim.altM, 0);
  assert.equal(s.swim.depthM, 0);
  // the old suspension option is ignored, never re-armed
  swim.stepSwim(s, {}, 1 / 60, oceanHD.data, 64, 32, { suspended: true });
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.submergeM, 0);
  assert.equal(s.swim.altM, 0);
  for (let i = 0; i < 120; i++) {
    swim.stepSwim(s, { dive: true }, 1 / 60, oceanHD.data, 64, 32, { suspended: true });
  }
  assert.equal(s.swim.active, false);
  assert.equal(s.swim.submergeM, 0);
  assert.equal(s.swim.altM, 0);
});

check('A: stepRoam at any scale carries no swim state — shrink/grow-back changes nothing', () => {
  const opts = { heightData: oceanHD, radius: EARTH_RADIUS };
  const s = roam.createRoamState();
  try {
    parachute.parachuteState.scale = 1;
    roam.beginRoam(s, 84.82, -118.47, 90);
    roam.stepRoam(s, { forward: 0, strafe: 0, dive: true }, 1 / 60, opts);
    roam.stepRoam(s, { forward: 0, strafe: 0, dive: true }, 1 / 60, opts);
    assert.equal(s.swim, undefined, 'no swim state at normal scale');
    parachute.parachuteState.scale = 0.00001; // shrunk into the tile
    for (let i = 0; i < 30; i++) roam.stepRoam(s, { forward: 0, strafe: 0, dive: true }, 1 / 60, opts);
    assert.equal(s.swim, undefined, 'no swim state in the Quantum Realm either');
    parachute.parachuteState.scale = 1; // REANIMATE
    roam.stepRoam(s, { forward: 0, strafe: 0 }, 1 / 60, opts);
    assert.equal(s.swim, undefined, 'grow-back restores no swim state');
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
check('C: former polar ocean floor is dry seabed tan, and polar ice sits outright', () => {
  const vPolar = (84.82 + 90) / 180;
  const c = streetPatch.hypsometricColor(0, vPolar); // h = 0 at polar lat: ice outright
  assert.ok(near(c[0], 0.93, 1e-9) && near(c[2], 0.98, 1e-9), `polar ice color [${c}]`);
  const e = streetPatch.hypsometricColor(0, 0.5); // h = 0 at the equator: dry seabed
  assert.ok(e[0] > e[2] && e[0] > 0.4 && e[2] < 0.35, `seabed color [${e}] must be tan, not blue`);
});

check('C: polar LAND still wears its ice cap', () => {
  const vPolar = (84.82 + 90) / 180;
  const c = streetPatch.hypsometricColor(0.3, vPolar); // well above sea level
  assert.ok(near(c[0], 0.93, 1e-9) && near(c[2], 0.98, 1e-9), `ice color [${c}]`);
});

check('C: the globe shader carries outright polar ice (no land gate) and a night ambient floor', () => {
  const src = readFileSync(new URL('../components/ProceduralEarthGlobe.jsx', import.meta.url), 'utf8');
  assert.match(src, /float ice = smoothstep\(0\.80, 0\.88, lat\);/);
  assert.ok(!src.match(/ice = smoothstep\(0\.80, 0\.88, lat\) \* landAmt/),
    'the old land-gated ice must be gone');
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

check('D2: SwimControls are gone from BOTH console branches (water removed)', () => {
  assert.ok(!consoleSrc.includes('<SwimControls'), 'no SwimControls mount remains');
  assert.ok(!consoleSrc.includes('swimUi'), 'no swim UI state remains');
  assert.match(consoleSrc, /SwimControls REMOVED 2026-10-26/);
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

// ------------------------------------------------------------ E. veil is gone (water removed 2026-10-26)
check('E: veilOpacityFor always reads 0 on dry Earth — no veil at any camera seat or depth', () => {
  assert.equal(swim.veilOpacityFor({ camUnder: false, submergeM: 0 }), 0);
  assert.equal(swim.veilOpacityFor({ camUnder: true, submergeM: 0 }), 0);
  // Merlin's old footage case: a swimmer 6.4 m down, lens lifted out.
  assert.equal(swim.veilOpacityFor({ camUnder: false, submergeM: 6.4 }), 0);
  assert.equal(swim.veilOpacityFor({ camUnder: true, submergeM: 6.4 }), 0);
  assert.equal(swim.veilOpacityFor(), 0);
});

console.log(`earth-round4: ${passed} checks passed`);
