// tests/earth-quantum-removal.test.mjs — the quantum removal
// contract (Merlin, 2026-10-26: "Remove the quantum realm
// completely") + the vehicle vanish law from the same orders
// ("character hidden while riding; on exit, the vehicle
// vanishes and the character takes its place") + the orbit-globe
// ocean fix (photographic blue seas neutralized in-shader) +
// the spawn law (street entry lands at normal size).
//
// These are source contracts + module contracts: they pin the
// removal so no later edit can quietly re-introduce a shrink
// path, a quantum button, or a second walking layer on hub
// Earth. Run: node tests/earth-quantum-removal.test.mjs
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

// ------------------------------------------------------------ removal: modules gone
check('removal: the quantum modules are deleted from the repo', () => {
  assert.equal(existsSync(join(root, 'lib/earth/quantum.js')), false);
  assert.equal(existsSync(join(root, 'components/QuantumSkyDome.jsx')), false);
});

check('removal: no Earth file imports the quantum flag or the shrink state', () => {
  for (const f of [
    'app/page.jsx',
    'components/NexusEarth.jsx',
    'components/HomeScene.jsx',
    'components/EarthConsole.jsx',
    'components/EarthFlightController.jsx',
    'components/EarthWalker.jsx',
    'components/EarthBike.jsx',
    'components/EarthSupercar.jsx',
    'components/EarthViewToggle.jsx',
    'components/StreetGroundPatch.jsx',
    'components/GoogleEarthTiles.jsx',
    'components/ProceduralEarthGlobe.jsx',
    'lib/earth/view-mode.js',
    'lib/earth/roam.js',
    'lib/earth/street-patch.js',
  ]) {
    const src = read(f);
    assert.ok(!src.includes('QUANTUM_ENABLED'), `${f} references the quantum flag`);
    assert.ok(!src.includes('parachuteState'), `${f} references the shrink state`);
    assert.ok(!src.includes('beginParachuteDive'), `${f} references the shrink entry`);
    assert.ok(!src.includes('beginReanimate'), `${f} references the grow-back entry`);
    assert.ok(!src.includes('stepParachute'), `${f} references the shrink stepper`);
    assert.ok(!src.includes('isAtStreetScale'), `${f} references the shrink scale check`);
  }
});

check('removal: no quantum UI survives anywhere on hub Earth', () => {
  const consoleSrc = read('components/EarthConsole.jsx');
  assert.ok(!consoleSrc.includes('Quantum Realm'), 'console mentions the realm');
  assert.ok(!consoleSrc.includes('NORMAL VIEW'), 'console keeps a Normal View button');
  assert.ok(!consoleSrc.includes('sizeUi'), 'console keeps a size row');
  assert.ok(!consoleSrc.includes('onDropToTile'), 'console keeps a drop-to-tile prop');
  assert.ok(!consoleSrc.includes('selectedTile'), 'console keeps tile-selection state');
  const toggleSrc = read('components/EarthViewToggle.jsx');
  // Comments may explain the removal; the rendered UI must not
  // carry a Quantum label. Strip comment lines before checking.
  const toggleCode = toggleSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!toggleCode.includes('Quantum'), 'view toggle keeps a Quantum label');
  assert.ok(!toggleCode.includes('micro'), 'view toggle keeps a micro lock');
  const pageSrc = read('app/page.jsx');
  assert.ok(!pageSrc.includes('parachuteTo'), 'page keeps the parachute funnel');
  assert.ok(!pageSrc.includes('onParachute'), 'page keeps a parachute prop');
  assert.ok(!pageSrc.includes('onTileSelect'), 'page keeps a tile-select prop');
});

check('removal: no dual-level code paths survive (no gate, dome, disc, or micro scale)', () => {
  assert.ok(!read('components/HomeScene.jsx').includes('QuantumGate'));
  assert.ok(!read('components/NexusEarth.jsx').includes('QuantumSkyDome'));
  assert.ok(!read('components/NexusEarth.jsx').includes('MicroGroundDisc'));
  assert.ok(!read('components/NexusEarth.jsx').includes('microMode'));
  assert.ok(!read('components/NexusEarth.jsx').includes('deepMicro'));
  assert.ok(!read('components/StreetGroundPatch.jsx').includes('MicroGroundDisc'));
  assert.ok(!read('components/GoogleEarthTiles.jsx').includes('onParachute'));
  assert.ok(!read('components/ProceduralEarthGlobe.jsx').includes('onParachute'));
  const viewMode = read('lib/earth/view-mode.js');
  assert.ok(!viewMode.includes('MICRO_SCALE'), 'view-mode keeps a micro threshold');
  assert.ok(!viewMode.includes('isMicroScale'), 'view-mode keeps a micro check');
});

// ------------------------------------------------------------ spawn law
check('spawn law: the street dive is a pure camera descent at normal size', () => {
  const flight = read('components/EarthFlightController.jsx');
  // The diving_to_street branch no longer shrinks anything.
  assert.ok(!flight.includes('beginParachuteDive'));
  assert.ok(!flight.includes('stepParachute'));
  assert.ok(!flight.includes('scaleFromGround'));
  assert.match(flight, /diving_to_street/);
  assert.match(flight, /liftFromGround/);
  // The street rig world is unscaled: no setScalar on the rig.
  assert.ok(!flight.includes('scale.setScalar'));
});

// ------------------------------------------------------------ vehicle vanish law
check('vehicle law: dismount vanishes the bike AND the car', () => {
  const bike = read('components/EarthBike.jsx');
  assert.match(bike, /summoned = false/);
  assert.match(bike, /speed = 0/);
  const car = read('components/EarthSupercar.jsx');
  assert.match(car, /summoned = false/);
  assert.match(car, /speed = 0/);
  // Dismount hands the vehicle position to the walker (the
  // character takes its place), via the shared roam state.
  assert.ok(bike.includes('roamState'));
  assert.ok(car.includes('roamState'));
});

check('vehicle law: the walker hides its rig while mounted (bike or car)', () => {
  const walker = read('components/EarthWalker.jsx');
  // Effective visibility = roamState.active AND neither vehicle
  // mounted: the frame first returns hidden when roam is inactive,
  // then hides the rig while the bike or the car is mounted.
  assert.match(walker, /if \(!roamState\.active\) \{\s*rig\.visible = false;/);
  assert.match(walker, /rig\.visible = !bikeState\.mounted && !carState\.mounted;/);
  // No shrink scale compensates the rig anymore.
  assert.ok(!walker.includes('parachuteState'));
  assert.ok(!walker.includes('rig.scale.setScalar'));
});

// ------------------------------------------------------------ globe ocean fix
check('globe: ocean-blue photo texels are neutralized to terrain before the day mix', () => {
  const globe = read('components/ProceduralEarthGlobe.jsx');
  assert.match(globe, /oceanness = smoothstep\(0\.05, 0\.15, photo\.b - max\(photo\.r, photo\.g\)\)/);
  assert.match(globe, /photo = mix\(photo, terrain, oceanness\)/);
  // The neutralization must run BEFORE the 0.55 photo/terrain mix.
  const oceIdx = globe.indexOf('oceanness = smoothstep');
  const mixIdx = globe.indexOf('mix(photo, terrain, 0.55)');
  assert.ok(oceIdx >= 0 && mixIdx > oceIdx, 'ocean neutralization must precede the day mix');
});

// ------------------------------------------------------------ what survived (no collateral)
check('survivors: the vehicle + climb state module keeps its exports', async () => {
  const parachute = await import('../lib/earth/parachute.js');
  assert.ok(parachute.bikeState, 'bikeState survives');
  assert.ok(parachute.carState, 'carState survives');
  assert.ok(parachute.climbState, 'climbState survives');
  assert.equal(parachute.parachuteState, undefined, 'shrink state is gone');
  assert.equal(parachute.beginParachuteDive, undefined, 'shrink entry is gone');
  assert.equal(parachute.stepParachute, undefined, 'shrink stepper is gone');
});

check('survivors: the view toggle still offers first/third choice', () => {
  const toggle = read('components/EarthViewToggle.jsx');
  assert.match(toggle, /first/);
  assert.match(toggle, /third/);
});

console.log(`\nearth-quantum-removal: ${passed} checks passed`);
