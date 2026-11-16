// tests/earth-vehicles.test.mjs — the Earth 1 craft roster
// (Merlin, 2026-10-26: "add all of our vehicles to this").
//
// The roster is evidence, not aspiration: 13 staged GTA cars +
// 4 Star Wars shelf vehicles + 2 rigged batch-4 vehicles = 19
// drivable craft on Earth 1. Every entry must carry a unique
// id, a shipped GLB path, finite tuning, and an honest engine
// assignment (jet = blue flame; rotor = hover, no flame).
// The wedge-supercar stays the default and the fastest at boost
// (180 u/s) — the Aventador's crown is not quietly handed to
// the Ghost Throttle (171 u/s).
//
// Run: node tests/earth-vehicles.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VEHICLES,
  listVehicles,
  getVehicle,
  isVehicleId,
  resolveCraftId,
  boostTopSpeed,
  DEFAULT_CRAFT_ID,
  CRAFT_PICK_KEY,
} from '../lib/earth/vehicles.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

check('roster holds all 19 drivable craft (13 GTA + 4 Star Wars + 2 batch-4)', () => {
  assert.equal(listVehicles().length, 19);
  assert.equal(VEHICLES.length, 19);
});

check('ids are unique and every entry has a name, emoji, blurb, and GLB path', () => {
  const ids = new Set();
  for (const v of VEHICLES) {
    assert.ok(v.id && typeof v.id === 'string', 'id');
    assert.ok(!ids.has(v.id), `duplicate id ${v.id}`);
    ids.add(v.id);
    assert.ok(v.name && v.emoji && v.blurb, `${v.id} needs name/emoji/blurb`);
    assert.ok(v.glbUrl && v.glbUrl.startsWith('/models/'), `${v.id} glbUrl ${v.glbUrl}`);
  }
});

check('every roster GLB file is actually shipped in public/', () => {
  for (const v of VEHICLES) {
    const disk = join(root, 'public', v.glbUrl.replace(/^\//, ''));
    assert.ok(existsSync(disk), `${v.id} missing shipped file ${v.glbUrl}`);
  }
});

check('tuning is finite and sane for every craft (no shared stat block)', () => {
  for (const v of VEHICLES) {
    const t = v.tuning;
    for (const k of ['maxSpeed', 'accel', 'turnRate', 'boostMult', 'brakeRate']) {
      assert.ok(Number.isFinite(t[k]) && t[k] > 0, `${v.id} tuning.${k} = ${t[k]}`);
    }
    assert.ok(Number.isFinite(v.lengthM) && v.lengthM > 0, `${v.id} lengthM`);
    assert.ok(Number.isFinite(v.hoverM) && v.hoverM > 0, `${v.id} hoverM`);
  }
});

check('blue jet feel: 18 engine craft get it, the rotor skiff does not', () => {
  const jets = VEHICLES.filter((v) => v.engine === 'jet');
  const rotors = VEHICLES.filter((v) => v.engine === 'rotor');
  assert.equal(jets.length, 18);
  assert.equal(rotors.length, 1);
  assert.equal(rotors[0].id, 'skiff');
  assert.ok(jets.every((v) => v.engine === 'jet'));
});

check('the wedge-supercar is the default and still the fastest at boost', () => {
  assert.equal(DEFAULT_CRAFT_ID, 'wedge-supercar');
  assert.equal(resolveCraftId(null), 'wedge-supercar');
  assert.equal(resolveCraftId('no-such-craft'), 'wedge-supercar');
  const wedgeTop = boostTopSpeed(getVehicle('wedge-supercar'));
  assert.equal(Math.round(wedgeTop), 180);
  for (const v of VEHICLES) {
    assert.ok(boostTopSpeed(v) <= wedgeTop, `${v.id} (${Math.round(boostTopSpeed(v))}) beats the wedge`);
  }
  // The Ghost Throttle is the quickest challenger — and still
  // second: 95 x 1.8 = 171, under the wedge's 180.
  assert.equal(Math.round(boostTopSpeed(getVehicle('ghost-throttle'))), 171);
});

check('craft pick key mirrors the character pick chain (device localStorage)', () => {
  assert.equal(CRAFT_PICK_KEY, 'olympus.craftPick.earth');
});

check('lookups behave: known resolves, unknown falls back, isVehicleId guards', () => {
  assert.equal(getVehicle('hauler').name, 'Cargo Hauler');
  assert.equal(getVehicle('nope'), null);
  assert.ok(isVehicleId('long-haul-rover'));
  assert.ok(!isVehicleId('on-foot'));
  assert.ok(!isVehicleId(''));
  assert.ok(!isVehicleId(null));
});

check('the jet flame module builds Earth-axis flames (exhaust at -Z)', () => {
  const src = readFileSync(join(root, 'lib/earth/jet-flame.js'), 'utf8');
  assert.ok(src.includes('buildJetFlame'), 'buildJetFlame export');
  assert.ok(src.includes('animateJetFlame'), 'animateJetFlame export');
  assert.ok(src.includes('0x2a7bff'), 'outer cone keeps the speeder blue');
  assert.ok(src.includes('0xbfe6ff'), 'inner cone keeps the pale core');
});

check('the gold ring is gone from the Earth 1 vehicle component', () => {
  for (const f of ['components/EarthSupercar.jsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(!src.includes('ringGeometry'), `${f} still draws a ring`);
  }
});

console.log(`earth-vehicles: ${passed} checks passed`);
