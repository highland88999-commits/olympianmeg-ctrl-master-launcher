// tests/earth-view-mode.test.mjs — Earth street view modes +
// the 2026-10-20 quantum/street repair batch (Merlin's recording:
// character not visibly shrunk, no first/third toggle, quantum
// sky "upside down", black floating giant, black clawed hands).
//
// Covered here, headlessly:
//  - view-mode state: default third, persistence, and the
//    Quantum Realm forcing third person for the whole micro stay
//    (restoring the traveler's choice on grow-back untouched);
//  - cameraRig first person: the lens sits in the head and the
//    pitch model matches the boom rig's;
//  - frame math at Merlin's spot (53.63N, 113.41W): tangent frame
//    orthonormal/right-handed, MicroGroundDisc basis det +1,
//    QuantumSkyDome basis puts local +Y on the surface normal
//    with the horizon band at eye level for every heading (the
//    dome shipped with NO orientation — its gradient keyed on
//    the globe's pole axis, 36.4 deg off true up there);
//  - the pose driver's unitScale: arena-metre lift constants
//    (floor margins idle 0.014 / walk 0.020) must scale to the
//    wrapper — unscaled, they floated Earth's 0.032-unit walker
//    ~half a body-height with its guard hands at the sky;
//  - displayScaleFor's per-asset height cap (the e045 peaks).
import assert from 'node:assert';

// localStorage stub BEFORE the view-mode module is imported (it
// reads storage lazily, but the stub keeps the test hermetic).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { parachuteState } = await import('../lib/earth/parachute.js');
const viewMode = await import('../lib/earth/view-mode.js');
const { cameraRig, tangentFrame, headingVector, createRoamState } = await import('../lib/earth/roam.js');
const { displayScaleFor } = await import('../lib/earth/placements.js');
const { getEarthAsset } = await import('../lib/earth/assets.js');
const { createPoseDriver } = await import('../lib/kombat/pose-driver.js');
const THREE = await import('three');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- view mode
check('view mode: defaults to third person', () => {
  assert.equal(viewMode.getUserViewMode(), 'third');
  assert.equal(viewMode.effectiveEarthViewMode(), 'third');
});

check('view mode: choice persists under olympus.earth.viewMode', () => {
  viewMode.setUserViewMode('first');
  assert.equal(viewMode.getUserViewMode(), 'first');
  assert.equal(store.get('olympus.earth.viewMode'), 'first');
  assert.equal(viewMode.effectiveEarthViewMode(), 'first');
});

check('view mode: the Quantum Realm forces third, choice restored on grow-back', () => {
  parachuteState.scale = 0.1;
  assert.equal(viewMode.isMicroScale(), true);
  assert.equal(viewMode.effectiveEarthViewMode(), 'third');
  parachuteState.scale = 0.00001;
  assert.equal(viewMode.effectiveEarthViewMode(), 'third');
  parachuteState.scale = 1;
  assert.equal(viewMode.isMicroScale(), false);
  // the stored choice was never overwritten by the forcing
  assert.equal(viewMode.getUserViewMode(), 'first');
  assert.equal(viewMode.effectiveEarthViewMode(), 'first');
  viewMode.setUserViewMode('third');
});

// ---------------------------------------------------------------- first person rig
function rigAt(opts, pitchDeg = 14) {
  const st = createRoamState();
  st.active = true;
  st.lat = 53.63; st.lon = -113.41;
  st.yawDeg = 140; st.faceDeg = 140; st.pitchDeg = pitchDeg;
  return cameraRig(st, null, 0, 0, opts);
}

check('cameraRig first person: the lens sits in the head', () => {
  const rig = rigAt({ firstPerson: true });
  assert.equal(rig.firstPerson, true);
  assert.ok(near(rig.camPos.x, rig.head.x) && near(rig.camPos.y, rig.head.y) && near(rig.camPos.z, rig.head.z));
  const third = rigAt({});
  assert.ok(!near(third.camPos.x, third.head.x) || !near(third.camPos.y, third.head.y));
});

check('cameraRig first person: pitch tilts the gaze like the boom rig', () => {
  const level = rigAt({ firstPerson: true }, 0);
  const dirLevel = {
    x: level.lookTarget.x - level.head.x,
    y: level.lookTarget.y - level.head.y,
    z: level.lookTarget.z - level.head.z,
  };
  // level pitch: gaze is purely the compass forward (no normal component)
  const n = level.normal;
  assert.ok(Math.abs(dirLevel.x * n.x + dirLevel.y * n.y + dirLevel.z * n.z) < 1e-9);
  const down = rigAt({ firstPerson: true }, 30);
  const dirDown = {
    x: down.lookTarget.x - down.head.x,
    y: down.lookTarget.y - down.head.y,
    z: down.lookTarget.z - down.head.z,
  };
  const downComp = dirDown.x * n.x + dirDown.y * n.y + dirDown.z * n.z;
  assert.ok(downComp < 0, 'positive pitch must tilt the gaze DOWN toward the ground');
});

// ---------------------------------------------------------------- frame math (53.63N, 113.41W)
const V3 = (o) => new THREE.Vector3(o.x, o.y, o.z);

check('tangent frame at 53.63N: orthonormal and right-handed', () => {
  const f = tangentFrame(53.63, -113.41);
  const n = V3(f.normal), e = V3(f.east), no = V3(f.north);
  assert.ok(near(n.length(), 1) && near(e.length(), 1) && near(no.length(), 1));
  assert.ok(Math.abs(n.dot(e)) < 1e-12 && Math.abs(n.dot(no)) < 1e-12 && Math.abs(e.dot(no)) < 1e-12);
  const exn = new THREE.Vector3().crossVectors(e, no);
  assert.ok(near(exn.dot(n), 1), 'east x north must equal the normal');
});

check('MicroGroundDisc + EarthWalker bases: determinant +1 (never mirrored)', () => {
  const f = tangentFrame(53.63, -113.41);
  const n = V3(f.normal), e = V3(f.east), no = V3(f.north);
  const disc = new THREE.Matrix4().makeBasis(e, no, n);
  assert.ok(near(disc.determinant(), 1));
  const fwd = V3(headingVector(f, 140));
  const xAxis = new THREE.Vector3().crossVectors(n, fwd);
  const walker = new THREE.Matrix4().makeBasis(xAxis, n, fwd);
  assert.ok(near(walker.determinant(), 1));
});

check('QuantumSkyDome basis: local +Y lands on the surface normal, horizon at eye level', () => {
  const f = tangentFrame(53.63, -113.41);
  const n = V3(f.normal), e = V3(f.east), no = V3(f.north);
  // the component's construction: makeBasis(east, normal, east x normal)
  const zAx = new THREE.Vector3().crossVectors(e, n);
  const basis = new THREE.Matrix4().makeBasis(e, n, zAx);
  assert.ok(near(basis.determinant(), 1));
  const yUp = new THREE.Vector3(0, 1, 0).applyMatrix4(basis);
  assert.ok(near(yUp.dot(n), 1), 'dome zenith must be the walker up');
  const inv = basis.clone().invert();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const d = no.clone().multiplyScalar(Math.cos(a)).add(e.clone().multiplyScalar(Math.sin(a)));
    const dl = d.applyMatrix4(inv);
    assert.ok(Math.abs(dl.y) < 1e-9, `horizon dir ${i} must sit at local y=0 (the glow band)`);
  }
  // and the un-oriented dome it replaces was 36+ degrees off here:
  const poleTilt = Math.acos(THREE.MathUtils.clamp(n.dot(new THREE.Vector3(0, 1, 0)), -1, 1)) * 180 / Math.PI;
  assert.ok(poleTilt > 30 && poleTilt < 42, `pole-axis tilt at 53.63N measured ${poleTilt.toFixed(1)} deg`);
});

// ---------------------------------------------------------------- pose-driver unit scale
check('pose driver unitScale: arena-metre margins shrink to the wrapper', () => {
  const margins = { idle: 0.014, walk: 0.02 };
  const mk = (unitScale) => createPoseDriver({
    kind: 'humanoid', bones: new Map(), profile: undefined,
    size: { x: 0.014, y: 0.032, z: 0.008 }, floorMargins: margins, unitScale,
  });
  const arena = mk(1);
  const earth = mk(0.032 / 1.9);
  let la = 0, le = 0;
  for (let i = 0; i < 200; i++) {
    la = arena.apply('idle', 0.05, 0, {}).lift;
    le = earth.apply('idle', 0.05, 0, {}).lift;
  }
  assert.ok(Math.abs(la - 0.014) < 0.002, `arena idle lift should stay ~0.014, got ${la}`);
  assert.ok(Math.abs(le - 0.014 * (0.032 / 1.9)) < 0.0002,
    `earth idle lift should be ~0.000236 (1.4 cm of the body), got ${le}`);
});

// ---------------------------------------------------------------- e045 display cap
check('displayScaleFor: per-asset height cap tames the Moraine Lake peaks', () => {
  const peaks = getEarthAsset('e045-moraine-lake-peaks');
  assert.ok(peaks, 'e045 exists in the bridge');
  const uncapped = displayScaleFor(peaks);
  assert.equal(uncapped.heightM, 250);
  const capped = displayScaleFor(peaks, 0.016, 60);
  assert.equal(capped.heightM, 60);
  assert.ok(Math.abs(capped.displayHeight - 0.96) < 1e-9);
  // other assets are untouched by an absent cap
  const hoodoos = getEarthAsset('e007-badlands-hoodoos');
  assert.equal(displayScaleFor(hoodoos).heightM, 12);
});

console.log(`\nearth-view-mode: ${passed} checks passed`);
