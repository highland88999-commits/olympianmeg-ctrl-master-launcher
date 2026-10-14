// tests/characters-walkers.test.mjs — headless tests for WAVE 1 of
// the characters-everywhere program: the shared GTA walker adapter
// (lib/gta/walker-embodiment.js) that embodies the player's capsule
// in Mega City, Truman and the Babel district, plus the source
// wiring of the three scenes and their picker mounts.
// REVISED by the driving-embodiment follow-up wave: the adapter
// now carries a permanent seat group under the anchor (the driver
// mount), so §4/§5 child-bookkeeping pins name it explicitly, and
// §5's vehicle pins describe the UNMOUNTABLE-vehicle case (a
// vehicle without position/heading) — the mountable driving path
// itself is pinned by tests/characters-driving.test.mjs.
// Run: node tests/characters-walkers.test.mjs (from the repo root).
// No browser; the network is stubbed out — GLB loads are forced to
// fail so the fallback contract (capsule stays) is exercised, and
// an injectable embodiment scene exercises the ready path.
import fs from 'node:fs';
import * as THREE from 'three';
import {
  PROFILE_CHARACTER_LS_KEY, writeSurfaceOverride, readSurfaceOverride,
  resolveSurfaceCharacterId,
} from '../lib/characters/embodiment.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const JASON = 'q002-jason-voorhees';
const FREDDY = 'q001-freddy-krueger';
const WOLVERINE = 'q035-wolverine';

function fakeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

function fakePlayer(over) {
  return {
    x: 3, z: -7, y: 0, vx: 0, vz: 0, vy: 0, radius: 0.6,
    heading: 1.25, grounded: true, inVehicle: null, health: 100,
    moving: false, sprinting: false, ...(over || {}),
  };
}

// The network is stubbed BEFORE the adapter import: every real GLB
// load fails, which is the fallback world half these tests describe.
globalThis.fetch = () => Promise.reject(new Error('offline (test stub)'));
const {
  createWalkerEmbodiment, capsuleProcSize, walkerPoseFor, walkerShowing,
} = await import('../lib/gta/walker-embodiment.js');

// ==================================================================
// 1. Capsule measurement — the GLB takes the capsule's footprint
// ==================================================================
{
  const s = capsuleProcSize(0.5, 1.0);
  t('the worlds\' capsule (0.5, 1.0) measures 1 x 2 x 1',
    s.x === 1 && s.y === 2 && s.z === 1);
  const s2 = capsuleProcSize(0.3, 0.8);
  t('capsule math is diameter x (length + diameter)',
    s2.x === 0.6 && Math.abs(s2.y - 1.4) < 1e-9 && s2.z === 0.6);
  const bad = capsuleProcSize(NaN, -2);
  t('garbage dimensions fall back to the standard capsule',
    bad.x === 1 && bad.y === 2 && bad.z === 1);
  const bad2 = capsuleProcSize('x', null);
  t('non-numeric dimensions fall back too',
    bad2.x === 1 && bad2.y === 2 && bad2.z === 1);
}

// ==================================================================
// 2. Pose mapping from the world's own movement state
// ==================================================================
t('still player idles', walkerPoseFor(fakePlayer()) === 'idle');
t('moving player walks', walkerPoseFor(fakePlayer({ moving: true })) === 'walk');
t('sprinting player runs', walkerPoseFor(fakePlayer({ moving: true, sprinting: true })) === 'run');
t('sprint flag without motion still idles',
  walkerPoseFor(fakePlayer({ sprinting: true })) === 'idle');
t('in-vehicle maps to idle in the on-foot vocabulary (driving is the seat mount)',
  walkerPoseFor(fakePlayer({ moving: true, sprinting: true, inVehicle: {} })) === 'idle');
t('no player idles', walkerPoseFor(null) === 'idle' && walkerPoseFor(undefined) === 'idle');

// ==================================================================
// 3. Showing matrix — when the embodiment replaces the capsule
// ==================================================================
t('ready + handle + on foot + not hidden = showing',
  walkerShowing({ hasHandle: true, ready: true, inVehicle: false, hidden: false }) === true);
t('not ready = capsule stays',
  walkerShowing({ hasHandle: true, ready: false, inVehicle: false, hidden: false }) === false);
t('no handle = capsule stays',
  walkerShowing({ hasHandle: false, ready: true, inVehicle: false, hidden: false }) === false);
t('walkerShowing stays the on-foot question (in-vehicle = not on-foot showing)',
  walkerShowing({ hasHandle: true, ready: true, inVehicle: true, hidden: false }) === false);
t('world-hidden (subway train) = nothing shows',
  walkerShowing({ hasHandle: true, ready: true, inVehicle: false, hidden: true }) === false);
t('empty state = capsule', walkerShowing() === false && walkerShowing({}) === false);

// ==================================================================
// 4. Adapter contract over the pick chain (loads forced to fail)
// ==================================================================
{
  // (b) no pick anywhere -> no handle, capsule untouched
  const scene = new THREE.Scene();
  const w = createWalkerEmbodiment({
    scene, surface: 'mega-city', storage: fakeStorage(),
    procSize: capsuleProcSize(0.5, 1.0),
  });
  t('no pick -> no character resolved', w.characterId() === null);
  t('no pick -> no handle (GLB path never attempted)', w.hasHandle() === false);
  t('no pick -> update never shows the embodiment',
    w.update(fakePlayer({ moving: true }), 0.016, 1.0, {}) === false);
  t('no pick -> anchor added but invisible',
    scene.children.includes(w.group) && w.group.visible === false);
  w.dispose();
  t('dispose removes the anchor from the scene', !scene.children.includes(w.group));
}
{
  // (a) profile pick -> GLB path attempted; failed load -> capsule
  const scene = new THREE.Scene();
  const w = createWalkerEmbodiment({
    scene, surface: 'truman',
    storage: fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON }),
    procSize: capsuleProcSize(0.5, 1.0),
  });
  t('profile pick resolves to the embodiment', w.characterId() === JASON);
  t('profile pick attempts the GLB path (handle exists)', w.hasHandle() === true);
  t('handle group rides under the anchor, beside the seat group',
    w.group.children.length === 2 && w.group.children.includes(w.seat));
  t('while loading, update keeps the capsule',
    w.update(fakePlayer({ moving: true }), 0.016, 1.0, {}) === false);
  // the inner handle's ready promise settles false under the stub
  const inner = w.group.children.find((c) => c !== w.seat);
  t('anchor tracks the walker root (x, z, heading)',
    w.group.position.x === 3 && w.group.position.z === -7
    && Math.abs(w.group.rotation.y - 1.25) < 1e-9);
  // the shared clamp lives in the update path: shove the model
  // root below its floor and update — it must come back >= 0
  // (anchor-local: the floor at the walker's root)
  inner.position.y = -3;
  w.update(fakePlayer(), 0.016, 1.1, {});
  t('floor clamp runs in the update path (local root >= 0)', inner.position.y >= 0);
  // floor law at world scale: the anchor y IS the world's ground
  // offset (Mega City subway floor sits at player.y = -14; the
  // model must stand there, not get yanked to street level)
  w.update(fakePlayer({ y: -14 }), 0.016, 1.2, {});
  t('anchor y follows the world ground (subway floor -14)', w.group.position.y === -14);
  t('model root still floored locally at the subway depth', inner.position.y >= 0);
  w.dispose();
}
{
  // surface override beats the profile default
  const scene = new THREE.Scene();
  const storage = fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON });
  writeSurfaceOverride('babel', FREDDY, storage);
  const w = createWalkerEmbodiment({
    scene, surface: 'babel', storage, procSize: capsuleProcSize(0.5, 1.0),
  });
  t('surface override beats profile in the adapter', w.characterId() === FREDDY);
  w.dispose();
}
{
  // explicit characterId wins over the chain; swaps are validated
  const scene = new THREE.Scene();
  const w = createWalkerEmbodiment({
    scene, surface: 'mega-city', characterId: null,
    storage: fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON }),
    procSize: capsuleProcSize(0.5, 1.0),
  });
  t('explicit null pick beats the profile mirror', w.characterId() === null && !w.hasHandle());
  t('setCharacter accepts a roster id', w.setCharacter(WOLVERINE) === true
    && w.characterId() === WOLVERINE && w.hasHandle() === true);
  t('setCharacter refuses an unknown id and keeps the current',
    w.setCharacter('q999-nobody') === false && w.characterId() === WOLVERINE);
  t('setCharacter refuses non-strings', w.setCharacter(42) === false
    && w.characterId() === WOLVERINE);
  t('setCharacter same id is a no-op success', w.setCharacter(WOLVERINE) === true);
  t('setCharacter null returns to the native capsule',
    w.setCharacter(null) === true && w.characterId() === null && !w.hasHandle());
  w.dispose();
  t('setCharacter after dispose is refused', w.setCharacter(JASON) === false);
  t('update after dispose never shows', w.update(fakePlayer(), 0.016, 1, {}) === false);
}

// ==================================================================
// 5. Ready path — an injected embodiment scene whose handle is
//    already live: poses flow, showing flips, driving hides
// ==================================================================
{
  const calls = [];
  let disposedCount = 0;
  const fakeSceneFactory = () => ({
    registry: null,
    attach({ characterId, procSize }) {
      const group = new THREE.Group();
      group.name = `fake-${characterId}`;
      return {
        characterId, kind: 'glb', group,
        ready: Promise.resolve(true),
        isReady: () => true,
        isLiveGlb: () => true,
        update(pose, dt, now, ctx) { calls.push({ characterId, pose, dt, now, ctx, procSize }); },
        dispose() { disposedCount++; },
      };
    },
    prefetch() {},
  });
  const scene = new THREE.Scene();
  const w = createWalkerEmbodiment({
    scene, surface: 'mega-city', characterId: JASON,
    procSize: capsuleProcSize(0.5, 1.0),
    embodimentScene: fakeSceneFactory(),
  });
  t('ready handle shows the embodiment on foot',
    w.update(fakePlayer(), 0.016, 2.0, {}) === true && w.group.visible === true);
  t('idle pose flows to the driver', calls[calls.length - 1].pose === 'idle');
  t('walk pose flows when the world says moving',
    w.update(fakePlayer({ moving: true }), 0.016, 2.1, {}) === true
    && calls[calls.length - 1].pose === 'walk');
  t('run pose flows when sprinting',
    w.update(fakePlayer({ moving: true, sprinting: true }), 0.016, 2.2, {}) === true
    && calls[calls.length - 1].pose === 'run');
  t('moveDir ctx follows the world movement (heading-relative forward)',
    calls[calls.length - 1].ctx.moveDir === 1);
  t('the capsule footprint reached the attach (procSize.y = 2)',
    calls.every((c) => !c.procSize || c.procSize.y === 2));
  const before = calls.length;
  t('an unmountable vehicle (no position/heading) keeps the capsule',
    w.update(fakePlayer({ inVehicle: {}, moving: true }), 0.016, 2.3, {}) === false
    && w.group.visible === false);
  t('no pose is driven for an unmountable vehicle', calls.length === before);
  t('world-hidden hides the embodiment (subway train rule)',
    w.update(fakePlayer(), 0.016, 2.4, { hidden: true }) === false);
  t('anchor still tracks while hidden (no pop on reappear)',
    w.group.position.x === 3 && w.group.position.z === -7);
  t('swapping characters disposes the old handle',
    w.setCharacter(FREDDY) === true && disposedCount === 1
    && w.characterId() === FREDDY
    && w.group.children.some((c) => c.name === 'fake-' + FREDDY));
  w.dispose();
  t('adapter dispose disposes the live handle', disposedCount === 2);
}

// ==================================================================
// 6. Picker write path — validated overrides only (the exact calls
//    components/characters/CharacterPicker.jsx makes)
// ==================================================================
{
  const s = fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON });
  t('picker default state resolves to the profile pick',
    resolveSurfaceCharacterId('mega-city', { storage: s }) === JASON);
  t('picker write stores a roster id', writeSurfaceOverride('mega-city', FREDDY, s) === true
    && readSurfaceOverride('mega-city', s) === FREDDY);
  t('picker write of an unknown id is refused, prior pick kept',
    writeSurfaceOverride('mega-city', 'q999-nobody', s) === false
    && readSurfaceOverride('mega-city', s) === FREDDY);
  t('picker "profile default" clears the override',
    writeSurfaceOverride('mega-city', null, s) === true
    && resolveSurfaceCharacterId('mega-city', { storage: s }) === JASON);
  t('overrides are per-surface (truman unaffected)',
    resolveSurfaceCharacterId('truman', { storage: s }) === JASON
    && readSurfaceOverride('truman', s) === null);
}

// ==================================================================
// 7. Source wiring — all three worlds + their pages carry Wave 1
// ==================================================================
{
  const worlds = [
    { scene: 'app/mega-city/gta-scene.js', page: 'app/mega-city/page.jsx', surface: 'mega-city' },
    { scene: 'app/truman/gta-scene.js', page: 'app/truman/page.jsx', surface: 'truman' },
    { scene: 'app/babel/gta-scene.js', page: 'app/babel/page-gta.jsx', surface: 'babel' },
  ];
  for (const wd of worlds) {
    const sceneSrc = fs.readFileSync(new URL(`../${wd.scene}`, import.meta.url), 'utf8');
    const pageSrc = fs.readFileSync(new URL(`../${wd.page}`, import.meta.url), 'utf8');
    t(`${wd.surface}: scene imports the shared walker adapter`,
      sceneSrc.includes("from '@/lib/gta/walker-embodiment.js'"));
    t(`${wd.surface}: scene creates the walker on its surface key`,
      sceneSrc.includes(`surface: '${wd.surface}'`));
    t(`${wd.surface}: scene measures the real capsule (0.5, 1.0)`,
      sceneSrc.includes('capsuleProcSize(0.5, 1.0)'));
    t(`${wd.surface}: scene drives the walker in its loop`,
      sceneSrc.includes('walker.update(player, dt, now / 1000'));
    t(`${wd.surface}: scene exposes the picker swap API`,
      sceneSrc.includes('setWalkerCharacter(id) { walker.setCharacter(id); }'));
    t(`${wd.surface}: scene disposes the walker`,
      sceneSrc.includes('walker.dispose();'));
    t(`${wd.surface}: page mounts the picker on the same surface key`,
      pageSrc.includes(`surface="${wd.surface}"`)
      && pageSrc.includes("from '@/components/characters/CharacterPicker'"));
    t(`${wd.surface}: page swaps the live walker on pick`,
      pageSrc.includes('sceneRef.current?.setWalkerCharacter(id)'));
    t(`${wd.surface}: the logic body is untouched (radius still 0.6)`,
      fs.readFileSync(new URL('../lib/gta/player.js', import.meta.url), 'utf8')
        .includes('radius: 0.6'));
  }
}

console.log(`\ncharacters-walkers: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
