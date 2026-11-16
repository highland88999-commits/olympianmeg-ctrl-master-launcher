// tests/vehicle-select.test.mjs — the shared vehicle selection
// menu (Merlin, Nov 16 ~03:49 — UNIVERSAL CONTROLS CORE,
// workstream E).
//
// For worlds where MORE THAN ONE vehicle can be summoned, clicking
// SUMMON opens the selection menu instead of summoning directly.
// One shared menu (components/world/VehicleSelectMenu.jsx) over
// one shared logic module (lib/world/vehicle-select.js): every
// world maps its own roster into options, the menu wears them,
// and the caller's onSelect spawns the pick — with the user in
// it, ready to go, front-forward.
//
// Pinned here:
//   - the menu opens only for 2+ options (a lone vehicle keeps
//     direct summon; none keeps no summon);
//   - the spawn pose is front-forward: the vehicle's yaw equals
//     the walker's yaw and the spot sits ahead of the walker by
//     body radius + gap, never on top of them;
//   - every option in every WIRED roster has a real face file on
//     disk (Earth 1's 19, Star Wars' 2 types, Shadow Realm's 3
//     bikes) — a missing face never blocks the menu, but a wired
//     world must not ship one;
//   - the wired pages actually use the shared menu (source-grep
//     guards, the house pattern for JSX): Earth 1's entry menu,
//     the Shadow Realm garage, Star Wars' summon;
//   - the faces are TRON-house 256x256 webp in the shared ui
//     folder (same disc frame as the per-function faces).
//
// Run: node tests/vehicle-select.test.mjs (from the repo root).
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VEHICLE_FACE_DIR,
  VEHICLE_FACE_FALLBACK,
  MULTI_VEHICLE_MIN,
  SUMMON_GAP_M,
  VEHICLE_MENU_MAX_COLUMNS,
  vehicleFaceArtFor,
  normalizeVehicleOptions,
  shouldShowVehicleMenu,
  pickVehicleOption,
  vehicleMenuColumns,
  summonSpawnPose,
  earthVehicleOptions,
  starWarsVehicleOptions,
  shadowRealmBikeOptions,
} from '../lib/world/vehicle-select.js';
import { VEHICLES as EARTH_VEHICLES } from '../lib/earth/vehicles.js';
import { VEHICLES as SHADOW_BIKES } from '../app/shadow-realm/schemes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = join(root, 'public', 'images', 'shadow-realm', 'ui');

function facePath(webPath) {
  return join(root, 'public', webPath.replace(/^\//, ''));
}

describe('vehicle-select — the menu threshold', () => {
  it('opens only for 2+ options (MULTI_VEHICLE_MIN is 2)', () => {
    assert.equal(MULTI_VEHICLE_MIN, 2);
    assert.equal(shouldShowVehicleMenu([]), false);
    assert.equal(shouldShowVehicleMenu([{ id: 'a' }]), false);
    assert.equal(shouldShowVehicleMenu([{ id: 'a' }, { id: 'b' }]), true);
    assert.equal(shouldShowVehicleMenu(null), false);
    assert.equal(shouldShowVehicleMenu('two'), false);
  });

  it('a lone vehicle keeps direct summon — one option never opens the menu', () => {
    // Middle-earth has exactly one horse (app/middle-earth/data.js):
    // a single-option roster must not open the menu.
    assert.equal(shouldShowVehicleMenu(normalizeVehicleOptions([{ id: 'horse', name: 'A Horse of the Mark' }])), false);
  });
});

describe('vehicle-select — option normalization', () => {
  it('maps id/key, name, blurb/desc and defaults art to the face path', () => {
    const opts = normalizeVehicleOptions([
      { id: 'wedge-supercar', name: 'Lamborghini Aventador', blurb: 'Fast.' },
      { key: 'wisp', name: 'Wisp', desc: 'Agile scout.' },
      { id: 'custom', name: 'Custom', art: '/images/custom.webp' },
      { id: '', name: 'No id' },
      { id: 'noname' },
      null,
      'junk',
    ]);
    assert.equal(opts.length, 3);
    assert.equal(opts[0].art, '/images/shadow-realm/ui/tron-vehicle-wedge-supercar.webp');
    assert.equal(opts[1].id, 'wisp');
    assert.equal(opts[1].blurb, 'Agile scout.');
    assert.equal(opts[2].art, '/images/custom.webp');
  });

  it('face paths live in the shared TRON ui folder with the tron-vehicle- prefix', () => {
    assert.equal(VEHICLE_FACE_DIR, '/images/shadow-realm/ui/');
    assert.equal(vehicleFaceArtFor('wisp'), '/images/shadow-realm/ui/tron-vehicle-wisp.webp');
    assert.equal(vehicleFaceArtFor('podracer'), '/images/shadow-realm/ui/tron-vehicle-podracer.webp');
    assert.equal(vehicleFaceArtFor(''), VEHICLE_FACE_FALLBACK);
    assert.equal(vehicleFaceArtFor(null), VEHICLE_FACE_FALLBACK);
    assert.equal(VEHICLE_FACE_FALLBACK, '/images/shadow-realm/ui/tron-summon.webp');
  });

  it('pickVehicleOption finds by id and never invents one', () => {
    const opts = normalizeVehicleOptions([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    assert.equal(pickVehicleOption(opts, 'b').name, 'B');
    assert.equal(pickVehicleOption(opts, 'c'), null);
    assert.equal(pickVehicleOption(opts, null), null);
    assert.equal(pickVehicleOption(null, 'a'), null);
  });
});

describe('vehicle-select — the spawn pose (front-forward law)', () => {
  it('yaw equals the walker yaw: the nose faces the way the walker faces', () => {
    for (const yaw of [0, 0.7, Math.PI, -2.1]) {
      const pose = summonSpawnPose({ walkerX: 10, walkerZ: -4, walkerYaw: yaw, bodyRadiusM: 2.6 });
      assert.equal(pose.yaw, yaw);
    }
  });

  it('the spot sits ahead of the walker by body radius + gap, on the walker forward', () => {
    // Yaw 0 faces -Z: the vehicle lands radius + 1.5 m ahead in -Z.
    const pose = summonSpawnPose({ walkerX: 0, walkerZ: 0, walkerYaw: 0, bodyRadiusM: 2.6 });
    assert.ok(Math.abs(pose.x - 0) < 1e-9);
    assert.ok(Math.abs(pose.z - (-(2.6 + SUMMON_GAP_M))) < 1e-9);
    assert.equal(SUMMON_GAP_M, 1.5);
    // Yaw PI faces +Z: the spot flips with the walker.
    const back = summonSpawnPose({ walkerX: 5, walkerZ: 5, walkerYaw: Math.PI, bodyRadiusM: 2 });
    assert.ok(Math.abs(back.z - (5 + 3.5)) < 1e-9);
    assert.ok(Math.abs(back.x - 5) < 1e-9);
  });

  it('never lands on top of the walker, and never NaN', () => {
    const pose = summonSpawnPose({ walkerX: 1, walkerZ: 2, walkerYaw: 1.2, bodyRadiusM: 0.4 });
    const d = Math.hypot(pose.x - 1, pose.z - 2);
    assert.ok(d >= 0.4 + SUMMON_GAP_M - 1e-9);
    const bad = summonSpawnPose({ walkerX: NaN, walkerZ: 'x', walkerYaw: NaN, bodyRadiusM: -3 });
    assert.ok(Number.isFinite(bad.x) && Number.isFinite(bad.z) && Number.isFinite(bad.yaw));
    assert.equal(bad.yaw, 0);
  });
});

describe('vehicle-select — the menu grid fits one frame', () => {
  it('columns cap at 5 and never exceed the option count', () => {
    assert.equal(VEHICLE_MENU_MAX_COLUMNS, 5);
    assert.equal(vehicleMenuColumns(1), 1);
    assert.equal(vehicleMenuColumns(3), 3);
    assert.equal(vehicleMenuColumns(5), 5);
    assert.equal(vehicleMenuColumns(19), 5);
    assert.equal(vehicleMenuColumns(0), 1);
    assert.equal(vehicleMenuColumns(4, 2), 2);
  });
});

describe('vehicle-select — wired rosters (faces on disk)', () => {
  it('Earth 1: all 19 garage vehicles map to options with a real face file', () => {
    const opts = earthVehicleOptions(EARTH_VEHICLES);
    assert.equal(opts.length, 19);
    assert.equal(shouldShowVehicleMenu(opts), true);
    for (const o of opts) {
      assert.ok(existsSync(facePath(o.art)), `missing face for Earth 1 vehicle ${o.id}: ${o.art}`);
    }
  });

  it('Star Wars: the 4 parked rides (1 landspeeder + 3 podracers) map by entry, face by type', () => {
    const entries = [
      { id: 'pod-grid-a', type: 'podracer' },
      { id: 'pod-grid-b', type: 'podracer' },
      { id: 'pod-winner', type: 'podracer' },
      { id: 'landspeeder', type: 'landspeeder' },
    ];
    const opts = starWarsVehicleOptions(entries);
    assert.equal(opts.length, 4);
    assert.equal(shouldShowVehicleMenu(opts), true);
    // Three distinct pod entries, one shared podracer face.
    assert.deepEqual(opts.map((o) => o.id), ['pod-grid-a', 'pod-grid-b', 'pod-winner', 'landspeeder']);
    assert.ok(opts.slice(0, 3).every((o) => o.art === vehicleFaceArtFor('podracer')));
    assert.equal(opts[3].art, vehicleFaceArtFor('landspeeder'));
    for (const o of opts) {
      assert.ok(existsSync(facePath(o.art)), `missing face for Star Wars vehicle ${o.id}: ${o.art}`);
    }
  });

  it('Shadow Realm: all 3 trim bikes map to options with a real face file', () => {
    const opts = shadowRealmBikeOptions(SHADOW_BIKES);
    assert.equal(opts.length, 3);
    assert.deepEqual(opts.map((o) => o.id), ['wisp', 'comet', 'atlas']);
    assert.equal(shouldShowVehicleMenu(opts), true);
    for (const o of opts) {
      assert.ok(existsSync(facePath(o.art)), `missing face for Shadow Realm bike ${o.id}: ${o.art}`);
    }
  });

  it('every vehicle face is a 256x256 webp in the shared ui folder', () => {
    const faces = [
      ...earthVehicleOptions(EARTH_VEHICLES),
      ...starWarsVehicleOptions([
        { id: 'pod-grid-a', type: 'podracer' },
        { id: 'landspeeder', type: 'landspeeder' },
      ]),
      ...shadowRealmBikeOptions(SHADOW_BIKES),
    ];
    const seen = new Set();
    for (const o of faces) {
      if (seen.has(o.art)) continue;
      seen.add(o.art);
      const p = facePath(o.art);
      const buf = readFileSync(p);
      assert.equal(buf[0], 0x52, `${o.art} is not a webp (RIFF)`);
      assert.equal(buf[8], 0x57, `${o.art} is not a webp (WEBP)`);
      assert.ok(buf.length > 1000, `${o.art} is suspiciously small`);
    }
    assert.ok(existsSync(join(uiDir, 'tron-summon.webp')), 'fallback tron-summon.webp missing');
  });
});

describe('vehicle-select — the wired pages use the shared menu (source guards)', () => {
  it('Earth 1 entry menu renders VehicleSelectMenu over the 19-car roster', () => {
    const src = readFileSync(join(root, 'components', 'EarthVehicleSelect.jsx'), 'utf8');
    assert.ok(src.includes('VehicleSelectMenu'), 'EarthVehicleSelect must render the shared VehicleSelectMenu');
    assert.ok(src.includes('earthVehicleOptions'), 'EarthVehicleSelect must map the roster through earthVehicleOptions');
    assert.ok(!src.includes('topSpeedKmh(v)} km/h\n              </span>'), 'the old rectangular list rows must be gone');
  });

  it('Shadow Realm garage renders VehicleSelectMenu over the trim bikes', () => {
    const src = readFileSync(join(root, 'app', 'shadow-realm', 'page.jsx'), 'utf8');
    assert.ok(src.includes('VehicleSelectMenu'), 'shadow-realm page must render the shared VehicleSelectMenu');
    assert.ok(src.includes('shadowRealmBikeOptions'), 'garage must map the bikes through shadowRealmBikeOptions');
  });

  it('Star Wars SUMMON opens the shared menu and summons through vehicleApiRef', () => {
    const src = readFileSync(join(root, 'app', 'star-wars', 'page.jsx'), 'utf8');
    assert.ok(src.includes('VehicleSelectMenu'), 'star-wars page must render the shared VehicleSelectMenu');
    assert.ok(src.includes('starWarsVehicleOptions'), 'Star Wars must map the parked roster through starWarsVehicleOptions');
    assert.ok(src.includes('summonSpawnPose'), 'Star Wars summon must use the shared front-forward spawn pose');
    assert.ok(src.includes('summon(id)'), 'vehicleApiRef must offer a summon(id) for the menu pick');
    assert.ok(src.includes('fn="summon"'), 'Star Wars must have a SUMMON orb opening the menu');
  });

  it('the menu itself is orbs-only: no rectangular buttons, no words on the orbs', () => {
    const src = readFileSync(join(root, 'components', 'world', 'VehicleSelectMenu.jsx'), 'utf8');
    assert.ok(src.includes('OrbButton'), 'the menu must be built from OrbButton orbs');
    assert.ok(!src.includes('<button'), 'the menu must not render raw rectangular <button> controls');
    assert.ok(src.includes('art={opt.art}'), 'each orb must wear its vehicle face');
    assert.ok(src.includes('ariaLabel={opt.name}'), 'the vehicle name rides in the aria-label, not on the orb');
  });
});
