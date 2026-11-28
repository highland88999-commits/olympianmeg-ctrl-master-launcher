// tests/enyo-cgi-round2.test.mjs — headless tests for the ENYO CGI
// round 2 (lib/enyo/cgi.js: bots, weapons, obstacles, ground, sky,
// walk cycle). Run: node tests/enyo-cgi-round2.test.mjs (repo root).
// No browser, no network — DataTexture-based, so node-safe. Proves:
//   * BOTS — same team colours as the flat build, now textured;
//     materials cached per team (no per-bot regen)
//   * WEAPONS — same four materials, now textured; cached singletons
//   * OBSTACLES — same OBSTACLE_STYLE colours/roughness/metalness/
//     emissive as the flat build, now with a map per style; the style
//     table itself is byte-identical (maps.js untouched)
//   * GROUND — one floor per map (flagstones / asphalt + lane paint /
//     dune sand), deterministic, repeat 14
//   * SKY — gradient dome, BackSide, fog off, inside the far plane;
//     stars only on the night map
//   * WALK — limbs swing only while moving, ease in/out, body bob
//     rides the same phase; no-op without limb pivots
//   * NO NEW LIGHTS — nothing here creates a light
import * as THREE from 'three';
import {
  ENYO_CGI_ROUND2, botMaterials, weaponMaterials, obstacleMaterial,
  groundTexture, skyDome, applyBotWalk,
} from '../lib/enyo/cgi.js';
import { MAPS, OBSTACLE_STYLE } from '../lib/enyo/maps.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function px(tex, x, y, size) {
  const i = (y * size + x) * 4;
  const d = tex.image.data;
  return [d[i], d[i + 1], d[i + 2]];
}

// --- bots --------------------------------------------------------------------
{
  const blue = botMaterials('blue');
  const red = botMaterials('red');
  t('bot: blue trim is 0x3b82f6', blue.trimHex === 0x3b82f6);
  t('bot: red trim is 0xef4444', red.trimHex === 0xef4444);
  t('bot: trim material emissive matches team', blue.trim.emissive.getHex() === 0x3b82f6 && red.trim.emissive.getHex() === 0xef4444);
  t('bot: armor/cloth/skin are textured now', !!blue.armor.map && !!blue.cloth.map && !!blue.skin.map);
  t('bot: armor keeps its colour/rough/metal', blue.armor.color.getHex() === 0x2b303c && blue.armor.roughness === 0.55 && blue.armor.metalness === 0.55);
  t('bot: cloth keeps its roughness/metal', blue.cloth.roughness === 0.9 && blue.cloth.metalness === 0.1);
  t('bot: materials cached per team', botMaterials('blue') === blue && botMaterials('red') === red);
  t('bot: teams share the cloth texture', blue.cloth.map === red.cloth.map);
  t('bot: nothing here is a light', !(blue.armor instanceof THREE.Light));
}

// --- weapons -------------------------------------------------------------------
{
  const w1 = weaponMaterials();
  const w2 = weaponMaterials();
  t('weapon: cached singleton', w1 === w2);
  t('weapon: dark/poly/steel are textured now', !!w1.dark.map && !!w1.poly.map && !!w1.steel.map);
  t('weapon: gold stays flat (already right)', !w1.gold.map && w1.gold.metalness === 0.9);
  t('weapon: dark keeps colour/rough/metal', w1.dark.color.getHex() === 0x1c1f26 && w1.dark.roughness === 0.5 && w1.dark.metalness === 0.6);
  t('weapon: steel keeps colour/rough/metal', w1.steel.color.getHex() === 0x3a3f47 && w1.steel.roughness === 0.35 && w1.steel.metalness === 0.8);
}

// --- obstacles -------------------------------------------------------------------
{
  // The style table itself must be untouched by this round.
  const expected = {
    stone: { color: 0xb8ad94, rough: 0.95 },
    stoneDark: { color: 0x8a8069, rough: 0.95 },
    crate: { color: 0x9c7a4d, rough: 0.9 },
    containerA: { color: 0x2e6f8e, rough: 0.7, metal: 0.35 },
    containerB: { color: 0x8e3a2e, rough: 0.7, metal: 0.35 },
    neonPylon: { color: 0x11131f, rough: 0.6, emissive: 0x00e5ff, emissiveI: 1.6 },
    rock: { color: 0x9c5f30, rough: 1 },
    canyon: { color: 0x8a4e26, rough: 1 },
  };
  for (const [k, v] of Object.entries(expected)) {
    const s = OBSTACLE_STYLE[k];
    t(`obstacle table: ${k} unchanged`, s && s.color === v.color && s.rough === v.rough
      && (s.metal || 0) === (v.metal || 0)
      && (s.emissive || 0) === (v.emissive || 0)
      && (s.emissiveI || 0) === (v.emissiveI || 0));
  }
  for (const k of Object.keys(expected)) {
    const m = obstacleMaterial(k);
    const s = OBSTACLE_STYLE[k];
    t(`obstacle mat: ${k} keeps style`, m.color.getHex() === s.color && m.roughness === s.rough
      && m.metalness === (s.metal || 0)
      && m.emissive.getHex() === (s.emissive || 0)
      && m.emissiveIntensity === (s.emissiveI || 0));
    t(`obstacle mat: ${k} is textured now`, !!m.map);
    t(`obstacle mat: ${k} cached`, obstacleMaterial(k) === m);
  }
  t('obstacle mat: unknown style falls back to crate', obstacleMaterial('nope').color.getHex() === OBSTACLE_STYLE.crate.color);
}

// --- ground -------------------------------------------------------------------
{
  const plaza = MAPS.find((m) => m.key === 'plaza');
  const depot = MAPS.find((m) => m.key === 'depot');
  const hollow = MAPS.find((m) => m.key === 'hollow');
  const gp = groundTexture(plaza);
  const gd = groundTexture(depot);
  const gh = groundTexture(hollow);
  t('ground: cached per map', groundTexture(plaza) === gp && groundTexture(depot) === gd);
  t('ground: repeat 14 (matches the old wash)', gp.repeat.x === 14 && gp.repeat.y === 14);
  t('ground: RepeatWrapping', gp.wrapS === THREE.RepeatWrapping && gp.wrapT === THREE.RepeatWrapping);
  t('ground: maps differ from each other', gp.image.data !== gd.image.data && gd.image.data !== gh.image.data);
  const grout = px(gp, 1, 10, 256);
  t('ground: plaza has dark grout lines', grout[0] === 62 && grout[1] === 58 && grout[2] === 50);
  const dash = px(gd, 10, 128, 256);
  t('ground: depot has a painted lane dash', dash[0] === 150 && dash[1] === 128 && dash[2] === 40);
  const sand = px(gh, 30, 30, 256);
  t('ground: hollow is warm sand', sand[0] > 130 && sand[0] > sand[2] + 40);
}

// --- sky dome -------------------------------------------------------------------
{
  const plaza = MAPS.find((m) => m.key === 'plaza');
  const depot = MAPS.find((m) => m.key === 'depot');
  const hollow = MAPS.find((m) => m.key === 'hollow');
  for (const m of [plaza, depot, hollow]) {
    const dome = skyDome(m);
    t(`sky: ${m.key} is a mesh, not a light`, dome instanceof THREE.Mesh && !(dome instanceof THREE.Light));
    t(`sky: ${m.key} BackSide, fog off, depthWrite off`,
      dome.material.side === THREE.BackSide && dome.material.fog === false && dome.material.depthWrite === false);
    t(`sky: ${m.key} radius inside the far plane (400)`,
      dome.geometry.parameters.radius === ENYO_CGI_ROUND2.SKY_RADIUS && ENYO_CGI_ROUND2.SKY_RADIUS < 400);
  }
  const hasWhite = (tex) => {
    const d = tex.image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) return true;
    }
    return false;
  };
  t('sky: depot has stars', hasWhite(skyDome(depot).material.map));
  t('sky: plaza has no stars', !hasWhite(skyDome(plaza).material.map));
  t('sky: hollow has no stars', !hasWhite(skyDome(hollow).material.map));
}

// --- walk cycle -------------------------------------------------------------------
{
  function fakeBotMesh() {
    const mesh = new THREE.Group();
    mesh.userData.limbs = {
      hipL: new THREE.Group(), hipR: new THREE.Group(),
      armL: new THREE.Group(), armR: new THREE.Group(),
    };
    return mesh;
  }
  const mesh = fakeBotMesh();
  for (let i = 0; i < 120; i++) applyBotWalk(mesh, 1 / 60, true); // 2 s moving
  const { hipL, hipR, armL, armR } = mesh.userData.limbs;
  t('walk: legs swing while moving', Math.abs(hipL.rotation.x) > 0.2);
  t('walk: legs oppose', Math.abs(hipR.rotation.x + hipL.rotation.x) < 1e-9);
  t('walk: arms oppose the legs', Math.abs(armL.rotation.x + hipL.rotation.x * 0.7) < 1e-9);
  t('walk: amplitude reaches ~1 while moving', Math.abs(mesh.userData.swingAmp - 1) < 0.05);
  t('walk: body bobs while moving', mesh.position.y >= 0 && mesh.position.y <= 0.05);
  for (let i = 0; i < 240; i++) applyBotWalk(mesh, 1 / 60, false); // 4 s idle
  t('walk: swing eases to zero when idle', Math.abs(hipL.rotation.x) < 0.01 && Math.abs(armL.rotation.x) < 0.01);
  t('walk: bob settles to zero when idle', mesh.position.y < 0.001);
  const bare = new THREE.Group();
  let threw = false;
  try { applyBotWalk(bare, 1 / 60, true); } catch { threw = true; }
  t('walk: no-op without limb pivots', !threw);
}

console.log(`\nenyo-cgi-round2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
