// tests/sun-base-cgi.test.mjs — SUN BASE CGI MAKEOVER (Merlin, Nov 15, 2026).
//
// The sun-base interior was flat single-colour boxes from the shared
// interior factory (walls #8d8578, floor #5d5348, ceiling #6b6257,
// trim #3a332a), no texture, no beams, no furniture, no dust, nothing
// moving. This suite pins the fix: procedural textured materials in
// the house CGI idiom (seeded DataTextures, cached, deterministic),
// a timber frame + lived-in props per interior, warm emissive
// atmosphere (lanterns, fire, window shafts, dust) — and the hard
// lines: NO new real lights, NO touch to the bright-gold-wrapped
// structural surfaces, and every mechanic that worked (entry, 0.2x
// scale, 3.2 m/s stride, build system, interior change) still wired.
//
// Run: node --test tests/sun-base-cgi.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits
// (same grep style as the portal-system suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SUN_BASE_TEXTURE_SIZE,
  SUN_BASE_KINDS,
  SUN_BASE_CGI_KINDS,
  sunBaseMaps,
  materialForSunBase,
  sunBaseTextureStats,
  sunBaseCgiSpec,
  lanternFlicker,
  fireGlow,
  gearAngle,
  buildSunBaseCgi,
  updateSunBaseCgi,
  disposeSunBaseCgi,
} from '../lib/sun-base/cgi.js';
import { sunBaseSpecFor } from '../lib/sun-base-spec.js';
import { SUN_BASE_OPTIONS } from '../lib/sun-base.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const specs = () => SUN_BASE_OPTIONS.map((o) => ({ assetId: o.assetId, spec: sunBaseSpecFor(o.assetId) }));

function walkLights(group) {
  const lights = [];
  group.traverse((obj) => {
    if (obj.isLight) lights.push(obj);
  });
  return lights;
}

function countTagged(group) {
  let tagged = 0;
  let total = 0;
  group.traverse((obj) => {
    if (obj.isMesh || obj.isPoints || obj.isGroup) {
      total += 1;
      if (obj.userData && obj.userData.sunBaseCgi) tagged += 1;
    }
  });
  return { tagged, total };
}

// --- 1. Textures: the house CGI idiom, deterministic, cached ---

test('five CGI kinds, 256px maps, colour + bump, sane material styles', () => {
  assert.deepEqual(SUN_BASE_CGI_KINDS.slice().sort(), ['hearthStone', 'plankWood', 'sackCloth', 'thatch', 'wovenRug']);
  assert.equal(SUN_BASE_TEXTURE_SIZE, 256);
  for (const kind of SUN_BASE_CGI_KINDS) {
    const style = SUN_BASE_KINDS[kind];
    assert.ok(style.roughness >= 0.3 && style.roughness <= 1, `${kind} roughness in range`);
    assert.ok(style.bumpScale > 0 && style.bumpScale <= 0.1, `${kind} bumpScale in range`);
    assert.ok(style.metalness >= 0 && style.metalness <= 0.1, `${kind} metalness near zero (farm materials, not chrome)`);
    const maps = sunBaseMaps(kind, 'farmhouse');
    assert.equal(maps.map.image.width, 256);
    assert.equal(maps.map.image.height, 256);
    assert.equal(maps.bumpMap.image.width, 256);
    assert.equal(maps.map.image.data.length, 256 * 256 * 4);
    assert.equal(maps.bumpMap.image.data.length, 256 * 256);
    assert.equal(maps.roughness, style.roughness);
  }
});

test('textures are deterministic per seed and differ across seeds and kinds', () => {
  const a = sunBaseMaps('plankWood', 'farmhouse').map.image.data;
  const b = sunBaseMaps('plankWood', 'farmhouse').map.image.data;
  assert.deepEqual(Array.from(a.slice(0, 4000)), Array.from(b.slice(0, 4000)));
  const c = sunBaseMaps('plankWood', 'barn').map.image.data;
  assert.notDeepEqual(Array.from(a.slice(0, 4000)), Array.from(c.slice(0, 4000)));
  const d = sunBaseMaps('thatch', 'farmhouse').map.image.data;
  assert.notDeepEqual(Array.from(a.slice(0, 4000)), Array.from(d.slice(0, 4000)));
});

test('unknown kinds fall back to plankWood; materials are cached per kind+seed+tint', () => {
  const fallback = sunBaseMaps('nope', 'farmhouse');
  const wood = sunBaseMaps('plankWood', 'farmhouse');
  assert.equal(fallback.map, wood.map);
  assert.equal(materialForSunBase('plankWood', 'farmhouse'), materialForSunBase('plankWood', 'farmhouse'));
  assert.notEqual(materialForSunBase('plankWood', 'farmhouse'), materialForSunBase('plankWood', 'barn'));
  assert.notEqual(materialForSunBase('plankWood', 'farmhouse'), materialForSunBase('plankWood', 'farmhouse', '#ff0000'));
  const stats = sunBaseTextureStats();
  assert.ok(stats.textures >= 5, 'one cached texture per kind');
  assert.ok(stats.materials >= 1, 'materials cached');
  assert.ok(stats.bytes > 0, 'texture bytes tracked');
});

// --- 2. Pure spec: one plan per interior, true to the place ---

test('all three interiors get a CGI spec with a timber frame, rug, lanterns and dust', () => {
  for (const { assetId, spec } of specs()) {
    const cgi = sunBaseCgiSpec(spec);
    assert.ok(cgi, `${assetId} needs a CGI spec`);
    assert.equal(cgi.class, spec.class);
    assert.equal(cgi.widthM, spec.widthM);
    assert.ok(cgi.frameY > 1.5 && cgi.frameY <= 2.4, `${assetId} frame hangs at human scale (${cgi.frameY})`);
    assert.ok(cgi.rug.w > 1 && cgi.rug.d > 1, `${assetId} rug is a real rug`);
    assert.equal(cgi.lanterns.length, 2, `${assetId} carries two lanterns`);
    assert.ok(cgi.dust.count >= 140, `${assetId} dust field is populated`);
    assert.ok(cgi.dust.width > 0 && cgi.dust.depth > 0 && cgi.dust.height > 0, `${assetId} dust fills the room`);
  }
});

test('props are true to each place: hearth+table farmhouse, hay barn, gear windmill', () => {
  const byClass = {};
  for (const { spec } of specs()) byClass[spec.class] = sunBaseCgiSpec(spec);
  assert.equal(byClass.house.hearth, true);
  assert.equal(byClass.house.table, true);
  assert.equal(byClass.house.crates, 2);
  assert.equal(byClass.house.hayBales, 0);
  assert.equal(byClass.house.gear, false);
  assert.equal(byClass.barn.hearth, true);
  assert.equal(byClass.barn.hayBales, 3);
  assert.equal(byClass.barn.workbench, true);
  assert.equal(byClass.barn.table, false);
  assert.equal(byClass.windmill.gear, true);
  assert.equal(byClass.windmill.sacks, 3);
  assert.equal(byClass.windmill.hearth, false);
  // Only the farmhouse has windows, so only it gets light shafts.
  assert.equal(byClass.house.windowShafts, true);
  assert.equal(byClass.barn.windowShafts, false);
  assert.equal(byClass.windmill.windowShafts, false);
  // The windmill is an open structure: its frame hangs from the
  // real 2.8 m ceiling, not the 10 m shell.
  assert.equal(byClass.windmill.effHeightM, 2.8);
  assert.equal(byClass.house.effHeightM, 9);
  assert.equal(byClass.barn.effHeightM, 12);
});

test('unknown specs get no CGI spec (never force a room that does not exist)', () => {
  assert.equal(sunBaseCgiSpec(null), null);
  assert.equal(sunBaseCgiSpec({}), null);
  assert.equal(sunBaseCgiSpec({ class: 'landmark', widthM: 9, depthM: 9, heightM: 9 }), null);
  assert.equal(sunBaseCgiSpec({ class: 'house', widthM: 0, depthM: 9, heightM: 9 }), null);
  assert.equal(buildSunBaseCgi(null), null);
  assert.equal(buildSunBaseCgi({ class: 'landmark', widthM: 9, depthM: 9, heightM: 9 }), null);
});

// --- 3. Pure motion: flicker, fire and gear on the device clock ---

test('lantern flicker is deterministic, in range, and varies over time', () => {
  const t0 = Date.UTC(2026, 10, 15, 12, 0, 0);
  const a = lanternFlicker(t0, 'lantern:0');
  const b = lanternFlicker(t0, 'lantern:0');
  assert.equal(a, b, 'same instant + same seed = same flicker');
  assert.ok(a >= 0.62 && a <= 1, `flicker in [0.62, 1] (got ${a})`);
  const later = lanternFlicker(t0 + 1300, 'lantern:0');
  assert.ok(later >= 0.62 && later <= 1);
  assert.notEqual(a, later, 'the lantern breathes — it is not frozen');
  assert.notEqual(
    lanternFlicker(t0, 'lantern:0'),
    lanternFlicker(t0, 'lantern:1'),
    'the two lanterns flicker on their own rhythms',
  );
});

test('fire glow tracks the hearth flicker; the gear turns slowly and steadily', () => {
  const t0 = Date.UTC(2026, 10, 15, 12, 0, 0);
  const g = fireGlow(t0);
  assert.ok(g >= 0.3 && g <= 0.6, `fire glow in [0.3, 0.6] (got ${g})`);
  assert.notEqual(fireGlow(t0), fireGlow(t0 + 1300));
  const a0 = gearAngle(t0);
  const a1 = gearAngle(t0 + 10000);
  const turn = ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  assert.ok(Math.abs(turn - 1.2) < 0.01, `gear turns 0.12 rad/s: 10 s = 1.2 rad (got ${turn})`);
});

// --- 4. The built group: new meshes only, warm, no real lights ---

test('every interior builds a tagged CGI group with frame, rug, lanterns and dust', () => {
  for (const { assetId, spec } of specs()) {
    const group = buildSunBaseCgi(spec);
    assert.ok(group, `${assetId} builds a group`);
    const { tagged, total } = countTagged(group);
    assert.ok(total >= 20, `${assetId} group is populated (${total} objects)`);
    assert.equal(tagged, total, `${assetId} every object in the group is tagged sunBaseCgi`);
    const kinds = new Set();
    group.traverse((obj) => {
      if (obj.userData && obj.userData.cgiKind) kinds.add(obj.userData.cgiKind);
    });
    assert.ok(kinds.has('rug'), `${assetId} has a rug`);
    assert.ok(kinds.has('lantern-cage'), `${assetId} has lanterns`);
    let dust = null;
    group.traverse((obj) => {
      if (obj.userData && obj.userData.isDustField) dust = obj;
    });
    assert.ok(dust, `${assetId} has a dust field`);
    assert.equal(dust.geometry.getAttribute('position').count, sunBaseCgiSpec(spec).dust.count);
    disposeSunBaseCgi(group);
  }
});

test('the CGI group contains NO real lights — warmth is emissive only', () => {
  for (const { assetId, spec } of specs()) {
    const group = buildSunBaseCgi(spec);
    assert.deepEqual(walkLights(group), [], `${assetId} must add no PointLight/DirectionalLight/SpotLight`);
    let emissive = 0;
    group.traverse((obj) => {
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      mats.forEach((m) => {
        if (m.emissive && m.emissiveIntensity > 0) emissive += 1;
      });
    });
    assert.ok(emissive >= 2, `${assetId} carries emissive glow (${emissive} materials)`);
    disposeSunBaseCgi(group);
  }
});

test('per-frame update breathes: lanterns flicker, fire glows, gear turns, dust drifts', () => {
  const { spec } = specs().find((s) => s.assetId === 'e024-farm-windmill');
  const group = buildSunBaseCgi(spec);
  const t0 = Date.UTC(2026, 10, 15, 12, 0, 0);
  updateSunBaseCgi(group, t0);
  let gear = null;
  let lantern = null;
  let dust = null;
  group.traverse((obj) => {
    if (obj.userData && obj.userData.cgiGear) gear = obj;
    if (obj.userData && obj.userData.cgiFlicker === 'lantern' && !lantern) lantern = obj;
    if (obj.userData && obj.userData.isDustField) dust = obj;
  });
  assert.ok(gear, 'windmill has a gear to turn');
  assert.ok(lantern, 'a lantern core to flicker');
  assert.ok(dust, 'a dust field to drift');
  const rot0 = gear.rotation.z;
  const int0 = lantern.material.emissiveIntensity;
  const dust0 = dust.geometry.getAttribute('position').array.slice(0, 3);
  updateSunBaseCgi(group, t0 + 10000);
  assert.notEqual(gear.rotation.z, rot0, 'the gear turns with the clock');
  assert.ok(Math.abs(gear.rotation.z - gearAngle(t0 + 10000)) < 1e-9, 'gear angle is the pure clock value');
  assert.ok(lantern.material.emissiveIntensity >= 0.9 && lantern.material.emissiveIntensity <= 1.5, 'lantern intensity stays in its warm band');
  assert.notEqual(lantern.material.emissiveIntensity, int0, 'the lantern breathes');
  const dust1 = dust.geometry.getAttribute('position').array.slice(0, 3);
  assert.notDeepEqual(Array.from(dust1), Array.from(dust0), 'the dust drifts');
  assert.doesNotThrow(() => updateSunBaseCgi(null, t0), 'update tolerates a null group');
  assert.doesNotThrow(() => disposeSunBaseCgi(null), 'dispose tolerates a null group');
  disposeSunBaseCgi(group);
});

test('the hearth fire sits proud of the stone front (never buried inside it)', () => {
  const { spec } = specs().find((s) => s.assetId === 'e023-prairie-farmhouse');
  const group = buildSunBaseCgi(spec);
  let stone = null;
  let fire = null;
  group.traverse((obj) => {
    if (obj.userData && obj.userData.cgiKind === 'firebox') fire = obj;
    if (obj.geometry && obj.geometry.parameters && obj.geometry.parameters.width === 1.7) stone = obj;
  });
  assert.ok(stone, 'hearth stone breast found');
  assert.ok(fire, 'firebox found');
  const stoneFront = stone.position.z + 0.38 / 2;
  assert.ok(fire.position.z > stoneFront, `firebox (${fire.position.z}) must sit in front of the stone front (${stoneFront})`);
  disposeSunBaseCgi(group);
});

// --- 5. Wiring + hard lines: wrap untouched, mechanics still wired ---

test('the CGI module never touches the gold wrap or any real light', () => {
  const cgi = src('../lib/sun-base/cgi.js');
  assert.ok(!cgi.includes('scratched'), 'the CGI module never imports the scratched/wrap code');
  assert.ok(!cgi.includes('applyScratched'), 'the CGI module never calls the wrap');
  assert.ok(!cgi.includes('PointLight'), 'no PointLight in the CGI module');
  assert.ok(!cgi.includes('DirectionalLight'), 'no DirectionalLight in the CGI module');
  assert.ok(!cgi.includes('SpotLight'), 'no SpotLight in the CGI module');
  assert.ok(!cgi.includes('buildInteriorRoom'), 'the CGI module never rebuilds or re-materials the factory room');
  const comp = src('../components/SunBaseCgi.jsx');
  assert.ok(!comp.includes('PointLight'), 'no PointLight in the CGI component');
  assert.ok(comp.includes('buildSunBaseCgi'), 'component builds the overlay group');
  assert.ok(comp.includes('updateSunBaseCgi'), 'component steps it per frame');
  assert.ok(comp.includes('disposeSunBaseCgi'), 'component disposes it on unmount');
});

test('the scene wires the overlay in with a minimal import and keeps the gold wrap', () => {
  const scene = src('../components/SunBaseScene.jsx');
  assert.ok(scene.includes("import SunBaseCgi from '@/components/SunBaseCgi'"), 'scene imports the CGI component');
  assert.ok(scene.includes('<SunBaseCgi spec={spec} />'), 'scene renders the overlay');
  assert.ok(scene.includes('STRUCTURAL_COLORS'), 'the bright-gold wrap block is still there');
  assert.ok(scene.includes("applyScratchedToMaterial(m, 'bright-gold')"), 'the wrap still applies bright gold');
  assert.ok(scene.includes('buildInteriorRoom'), 'the room is still the reserved interior factory');
  assert.ok(scene.includes('SUN_BASE_WALK_SPEED_MPS'), 'the rig still walks at the normal-size stride (3.2 m/s)');
  assert.ok(scene.includes('SUN_BASE_EYE_HEIGHT_M'), 'eye height is still the shrunken eye (0.34 m)');
});

test('the page mechanics are untouched: gate, picker, build menu, exit', () => {
  const page = src('../app/sun-base/page.jsx');
  assert.ok(page.includes('supabase.auth'), 'the base is still gated to signed-in accounts');
  assert.ok(page.includes('loadSunBasePick'), 'the pick still loads from storage');
  assert.ok(page.includes('saveSunBasePick'), 'the pick still persists');
  assert.ok(page.includes('Change interior'), 'the interior can still be re-picked inside the base');
  assert.ok(page.includes('WalkJoystick'), 'touch walking still uses the shared joystick');
  assert.ok(page.includes("router.push('/')"), 'leaving still returns to the hub');
  assert.ok(page.includes('SunBaseScene'), 'the page still mounts the scene');
  assert.ok(!page.includes('SunBaseCgi'), 'the page itself needs no CGI import — the scene owns it');
});
