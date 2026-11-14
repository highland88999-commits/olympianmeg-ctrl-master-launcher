// tests/nether-day-night.test.mjs
// NETHER-REALMS day/night (Merlin, 2026-11-14): every nether-realm
// runs the shared cycle through <DayNightRig> — daylight in its own
// red shade, lightning storms on the six hellscapes, thunder in
// Hades only (the one realm with a sound engine). Pure law + static
// audits of the wiring — no browser, no WebGL.
// Run: node tests/nether-day-night.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NETHER_SHADES,
  NETHER_REALM_SHADE,
  NETHER_REALM_STORM,
} from '../lib/day-night.js';
import { HADES_PROFILES } from '../lib/nether-realm/sounds.js';
import { normalizeProfile, createRegistry } from '../lib/sound/profiles.js';
import { voicePlan } from '../lib/sound/math.js';
import { SEED_PROFILES } from '../lib/sound/seed-profiles.js';

// Realm key → app dir, storm hue (null = no storm), storm seed.
const REALMS = [
  ['hades', 'nether-realm', 'red', 7101],
  ['helheim', 'helheim', null, null],
  ['duat', 'duat', null, null],
  ['hell', 'hell', 'red', 7102],
  ['naraka', 'naraka', 'purple', 7103],
  ['yomi', 'yomi', null, null],
  ['annwn', 'annwn', null, null],
  ['mictlan', 'mictlan', null, null],
  ['xibalba', 'xibalba', 'purple', 7106],
  ['kur', 'kur', 'purple', 7105],
  ['nav', 'nav', null, null],
  ['diyu', 'diyu', 'red', 7104],
  ['orun', 'orun', null, null],
];

const sceneSrc = (dir) => readFileSync(`app/${dir}/world3d.js`, 'utf8');

test('every nether-realm has a shade, and every shade is a real red', () => {
  assert.equal(Object.keys(NETHER_REALM_SHADE).length, 13, '13 nether-realms');
  for (const [key] of REALMS) {
    assert.ok(NETHER_REALM_SHADE[key], `${key} has a shade`);
    assert.ok(NETHER_SHADES[NETHER_REALM_SHADE[key]], `${key} shade is a known red`);
  }
});

test('storms: exactly the six hellscapes, red or purple only', () => {
  assert.deepEqual(
    Object.keys(NETHER_REALM_STORM).sort(),
    ['diyu', 'hades', 'hell', 'kur', 'naraka', 'xibalba'],
  );
  for (const [key, hue] of Object.entries(NETHER_REALM_STORM)) {
    assert.ok(hue === 'red' || hue === 'purple', `${key} storm hue is red|purple`);
  }
  for (const [key, , hue] of REALMS) {
    assert.equal(NETHER_REALM_STORM[key] || null, hue, `${key} storm matches the law`);
  }
});

for (const [key, dir, hue, seed] of REALMS) {
  test(`${key}: scene runs DayNightRig in its own shade, no static sky left`, () => {
    const src = sceneSrc(dir);
    assert.ok(src.includes("import DayNightRig from '@/components/DayNightRig'"), 'imports the rig');
    assert.ok(src.includes("import { NETHER_REALM_SHADE } from '@/lib/day-night'"), 'imports the shade map');
    assert.ok(src.includes(`shade={NETHER_REALM_SHADE.${key}}`), `passes its own shade (${key})`);
    assert.ok(!src.includes('attach="background"'), 'no static background left');
    assert.ok(!src.includes('attach="fog"'), 'no static fog left');
    assert.ok(!src.includes('<ambientLight'), 'no static ambient left');
    assert.ok(!src.includes('<directionalLight'), 'no static directional left');
    // Everything else stays: torches, meshes, labels, camera rig.
    assert.ok(src.includes('CameraRig'), 'camera rig kept');
    assert.ok(src.includes('Torches'), 'torches kept');
    assert.ok(src.includes('PortalArches'), 'portal arches kept');
  });

  if (hue) {
    test(`${key}: storm wired — ${hue}, seeded, open-ground only`, () => {
      const src = sceneSrc(dir);
      assert.ok(src.includes(`hue: '${hue}'`), `storm hue is ${hue}`);
      assert.ok(src.includes(`realm: '${key}'`), 'storm names its realm');
      assert.ok(src.includes(`seed: ${seed}`), `storm seed is ${seed}`);
      assert.ok(src.includes('bounds: { xMin: -300, xMax: 300, zMin: -300, zMax: 300 }'), 'bounds inside the world');
      assert.ok(src.includes('const isOpenGround = (x, z) => {'), 'isOpenGround defined');
      assert.ok(src.includes('isOpenGround,'), 'isOpenGround passed to the rig');
      // The exclusions: walker (5 m), world edge, river band, Gates,
      // landmark plaza, Descent, portal arches, scattered pools.
      assert.ok(src.includes('p.x, z - p.z) < 5'), 'walker excluded within 5 m');
      assert.ok(src.includes('WORLD_RADIUS - 20'), 'fires stay inside the world disc');
      assert.ok(src.includes('RIVER.zMin - 2'), 'river band excluded');
      assert.ok(src.includes('GATES.x, z - GATES.z) < 12'), 'Gates excluded');
      assert.ok(src.includes('DESCENT_PORTAL.x, z - DESCENT_PORTAL.z) < 16'), 'Descent excluded');
      assert.ok(src.includes('PORTALS.some((portal)'), 'portal arches excluded');
      assert.ok(src.includes('pool.r + 3'), 'scattered pools excluded');
    });
  } else {
    test(`${key}: no storm — visual sky only`, () => {
      const src = sceneSrc(dir);
      assert.ok(src.includes('storm={null}'), 'storm is explicitly null');
      assert.ok(!src.includes('isOpenGround'), 'no storm predicate');
    });
  }
}

test('thunder: Hades profile is a low noise rumble on the engine path', () => {
  const thunder = HADES_PROFILES.find((p) => p.id === 'hades-thunder');
  assert.ok(thunder, 'hades-thunder profile exists');
  const { profile, errors } = normalizeProfile(thunder);
  assert.ok(profile, `thunder parses: ${errors.join(', ')}`);
  assert.equal(profile.math.waveform, 'noise', 'noise voice, like the Styx bed');
  assert.ok(profile.math.frequency <= 200, 'low rumble, not a whistle');
  assert.ok(profile.math.frequencyEnd < profile.math.frequency, 'sweeps down');
  assert.equal(profile.pattern.type, 'single', 'one rumble per strike, no loop');
  assert.equal(profile.context, 'thunder', 'context matches the page call');
  const plan = voicePlan(profile);
  assert.equal(plan.kind, 'noise', 'the engine renders it as filtered noise');
  const registry = createRegistry([...SEED_PROFILES, ...HADES_PROFILES]);
  assert.ok(registry.resolve('hades-thunder', 'thunder'), 'thunder resolves in the registry');
});

test('thunder: Hades page listens for the rig event; no other nether-realm does', () => {
  const pageSrc = readFileSync('app/nether-realm/page.jsx', 'utf8');
  assert.ok(pageSrc.includes("window.addEventListener('olympus:thunder'"), 'Hades listens for strikes');
  assert.ok(pageSrc.includes("playSound('hades-thunder', 'thunder'"), 'Hades answers with the rumble');
  assert.ok(pageSrc.includes("event.detail.realm !== 'hades'"), 'ignores strikes from other realms');
  for (const [key, dir] of REALMS) {
    if (key === 'hades') continue;
    const other = readFileSync(`app/${dir}/page.jsx`, 'utf8');
    assert.ok(!other.includes('olympus:thunder'), `${key} has no thunder (no sound engine there)`);
  }
});
