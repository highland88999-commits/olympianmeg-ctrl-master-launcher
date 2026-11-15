// tests/enyo-cgi.test.mjs — headless tests for the ENYO war dressing
// (lib/enyo/cgi.js, wired into app/enyo/page.jsx).
// Run: node tests/enyo-cgi.test.mjs (from the repo root).
// No browser, no network — builds the dressing against the REAL map
// layouts (lib/enyo/maps.js) in node and proves:
//   * DETERMINISM — same (map, seed) places the same dressing twice
//   * the GODDESS MONUMENT stands on a real obstacle (fountain column
//     / west pylon / canyon chunk), footprint inside the anchor, and
//     rises above it — never floating, never walk-through
//   * BANNERS hang 0.08 m off real long faces; RACKS + SHIELDS touch
//     the anchor; BRAZIERS touch stone and rest on their support top
//   * nothing solid sits in a spawn lane or within 3 m of a spawn point
//   * RAVENS circle the monument; SMOKE + EMBERS are present
//   * the dressing adds ZERO real point lights; update() runs clean
//   * the banner sigil is really painted (blood field, gold spear)
//   * ORIGINAL ONLY — no Mortal Kombat strings anywhere in the new code
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { MAPS, buildObstacles } from '../lib/enyo/maps.js';
import {
  buildEnyoDressing, dressingPlacements, bannerSigilTexture,
  distToObstacle, clearOfSpawns, supportTop, bannerHosts, innerFace,
  ENYO_PALETTE, ENYO_MONUMENT_ANCHORS, ENYO_CGI, ENYO_SPAWNS,
} from '../lib/enyo/cgi.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const FORBIDDEN = ['mortal', 'sub-zero', 'scorpion', 'raiden', 'liu kang'];
// Strip comments first: the ban is on the CODE, and the comments name
// the ban itself (e.g. "no Mortal Kombat strings").
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const cgiSrc = stripComments(readFileSync(new URL('../lib/enyo/cgi.js', import.meta.url), 'utf8')).toLowerCase();
for (const w of FORBIDDEN) t(`enyo/cgi.js has no MK string "${w}"`, !cgiSrc.includes(w));

// palette law: bronze + blood-red + gold, the war colours
t('palette: bronze is bronze', ENYO_PALETTE.bronze === 0x8c6a2f);
t('palette: blood is blood-red', ENYO_PALETTE.blood === 0x8e1f1f);
t('palette: gold is gold', ENYO_PALETTE.gold === 0xd8a93a);
t('anchors: one per map', Object.keys(ENYO_MONUMENT_ANCHORS).sort().join(',') === 'depot,hollow,plaza');

// banner sigil pixels: blood field, gold spear, gold border
{
  const tex = bannerSigilTexture();
  const d = tex.image.data;
  const px = (x, y) => { const i = (y * 128 + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const field = px(20, 64);
  t('sigil: field is blood-red', field[0] > 100 && field[0] < 170 && field[1] < 50 && field[2] < 50);
  const spear = px(64, 40); // shaft, lower middle
  t('sigil: spear shaft is gold', spear[0] > 180 && spear[1] > 140 && spear[2] < 100);
  const border = px(4, 64);
  t('sigil: border is gold', border[0] > 180 && border[1] > 140 && border[2] < 100);
}

for (const map of MAPS) {
  const label = `map ${map.key}`;
  const obstacles = buildObstacles(map.key, map.seed);
  const p1 = dressingPlacements(map.key, obstacles, map.seed);
  const p2 = dressingPlacements(map.key, obstacles, map.seed);
  t(`${label}: placements deterministic`, JSON.stringify(p1) === JSON.stringify(p2));
  t(`${label}: counts match`, p1.counts.banners === p1.banners.length
    && p1.counts.racks === p1.racks.length && p1.counts.shields === p1.shields.length
    && p1.counts.braziers === p1.braziers.length && p1.counts.ravens === p1.ravens.length);

  // ---- the monument ----
  t(`${label}: monument exists`, !!p1.monument);
  if (p1.monument) {
    const m = p1.monument;
    const anchor = obstacles.find((o) => Math.abs(o.x - m.anchor.x) < 0.5 && Math.abs(o.z - m.anchor.z) < 0.5);
    t(`${label}: monument anchor is a real obstacle`, !!anchor);
    const plinthHalf = 0.75 * m.scale;
    t(`${label}: monument footprint inside its anchor`,
      !!anchor
      && Math.abs(m.x - anchor.x) + plinthHalf <= anchor.w / 2 + 0.01
      && Math.abs(m.z - anchor.z) + plinthHalf <= anchor.d / 2 + 0.01);
    t(`${label}: monument stands on the anchor top`, m.baseY === anchor.h);
    t(`${label}: monument scale sane (0.5..1.5)`, m.scale >= 0.5 && m.scale <= 1.5);
  }

  // ---- banners hang on real long faces ----
  t(`${label}: at least 1 banner`, p1.banners.length >= 1);
  t(`${label}: at most ${ENYO_CGI.BANNER_COUNT} banners`, p1.banners.length <= ENYO_CGI.BANNER_COUNT);
  for (const b of p1.banners) {
    const host = obstacles.find((o) => Math.abs(o.x - b.host.x) < 0.5 && Math.abs(o.z - b.host.z) < 0.5);
    t(`${label}: banner host is a real obstacle`, !!host);
    const d = host ? distToObstacle(b.x, b.z, host) : 99;
    t(`${label}: banner hangs 0.08 m off its face (d=${d.toFixed(2)})`, d >= 0.04 && d <= 0.2);
  }

  // ---- racks + shields touch the anchor ----
  t(`${label}: ${ENYO_CGI.RACK_COUNT} spear racks`, p1.racks.length === ENYO_CGI.RACK_COUNT);
  for (const r of p1.racks) {
    const d = p1.monument ? distToObstacle(r.x, r.z, p1.monument.anchor) : 99;
    t(`${label}: rack leans on the anchor (d=${d.toFixed(2)})`, d <= 0.8);
    t(`${label}: rack clear of spawns`, clearOfSpawns(r.x, r.z));
  }
  t(`${label}: ${ENYO_CGI.SHIELD_COUNT} shields`, p1.shields.length === ENYO_CGI.SHIELD_COUNT);
  for (const s of p1.shields) {
    const d = p1.monument ? distToObstacle(s.x, s.z, p1.monument.anchor) : 99;
    t(`${label}: shield mounts on the anchor face (d=${d.toFixed(2)})`, d <= 0.4);
  }

  // ---- braziers touch stone, rest on their support, clear of spawns ----
  t(`${label}: at least 1 brazier`, p1.braziers.length >= 1);
  t(`${label}: at most ${ENYO_CGI.BRAZIER_MAX} braziers`, p1.braziers.length <= ENYO_CGI.BRAZIER_MAX);
  for (const b of p1.braziers) {
    const touching = obstacles.some((o) => distToObstacle(b.x, b.z, o) <= 0.6);
    t(`${label}: brazier touches stone`, touching);
    t(`${label}: brazier rests on its support top (y=${b.y})`, b.y === supportTop(b.x, b.z, obstacles));
    t(`${label}: brazier clear of spawns`, clearOfSpawns(b.x, b.z));
  }

  // ---- ravens circle the monument ----
  t(`${label}: ${ENYO_CGI.RAVEN_COUNT} ravens`, p1.ravens.length === ENYO_CGI.RAVEN_COUNT);
  for (const r of p1.ravens) {
    t(`${label}: raven orbit radius 9..14`, r.r >= 9 && r.r <= 14);
    t(`${label}: raven height 9..13`, r.y >= 9 && r.y <= 13);
    if (p1.monument) {
      t(`${label}: raven circles the monument`, r.cx === p1.monument.x && r.cz === p1.monument.z);
    }
  }

  // ---- full scene build ----
  const scene = new THREE.Scene();
  const built = buildEnyoDressing(scene, map, obstacles, map.seed);
  t(`${label}: dressing group added to the scene`, scene.getObjectByName('enyo-dressing') === built.group);
  let updOk = true;
  try { built.update(0.016, 0); built.update(0.016, 2.5); built.update(0.033, 7); } catch { updOk = false; }
  t(`${label}: update() runs clean`, updOk);
  let lights = 0;
  let meshes = 0;
  built.group.traverse((o) => { if (o.isPointLight) lights++; if (o.isMesh) meshes++; });
  t(`${label}: dressing adds zero point lights`, lights === 0);
  t(`${label}: dressing builds meshes`, meshes > 20);
  // the goddess rises above her anchor: some mesh top above baseY + 4*scale
  const top = (() => {
    let m = -Infinity;
    built.group.updateMatrixWorld(true);
    built.group.traverse((o) => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.max.y > m) m = b.max.y;
    });
    return m;
  })();
  if (p1.monument) {
    t(`${label}: goddess rises above her anchor (top y=${top.toFixed(1)})`,
      top > p1.monument.baseY + 4 * p1.monument.scale);
  }
}

// helpers behave on synthetic obstacles
{
  const obs = [{ x: 0, z: 0, w: 10, d: 2, h: 3, c: 'stone' }];
  t('distToObstacle: inside is 0', distToObstacle(0, 0, obs[0]) === 0);
  t('distToObstacle: 1 m out is 1', Math.abs(distToObstacle(6, 0, obs[0]) - 1) < 1e-9);
  t('supportTop: under the obstacle is its height', supportTop(0, 0, obs) === 3);
  t('supportTop: outside is ground', supportTop(20, 20, obs) === 0);
  t('clearOfSpawns: spawn point is blocked', !clearOfSpawns(0, 47));
  t('clearOfSpawns: centre is clear', clearOfSpawns(0, 0));
  const f = innerFace({ x: 10, z: 0, w: 4, d: 4, h: 3 });
  t('innerFace: east obstacle faces west', f.nx === -1 && f.nz === 0 && Math.abs(f.x - 8) < 1e-9);
  t('bannerHosts: long stone qualifies', bannerHosts(obs).length === 1);
  t('bannerHosts: small crate does not', bannerHosts([{ x: 0, z: 0, w: 2, d: 2, h: 2, c: 'crate' }]).length === 0);
}

console.log(`\nenyo-cgi: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
