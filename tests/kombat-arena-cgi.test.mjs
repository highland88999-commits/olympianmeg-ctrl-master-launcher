// tests/kombat-arena-cgi.test.mjs — headless tests for the KOMBAT arena
// CGI upgrade (lib/kombat/arena-cgi.js, wired into app/kombat/arena3d.js).
// Run: node tests/kombat-arena-cgi.test.mjs (from the repo root).
// No browser, no network — builds every brawl scene graph in node and
// proves:
//   * the dressing exists in all 8 brawl arenas (pit, braziers, embers,
//     haze, rim glow, crowd towers + bodies)
//   * DETERMINISM — same (index, radius) builds the same dressing twice
//   * CLEARANCE — every dressing 'solid' sits outside the play circle
//     (the kombat-arenas test's own rule: >= radius + 0.45) and never
//     intersects any other solid/bounds piece of the arena
//   * LIGHTING LAW — the dressing adds ZERO real point lights
//   * PHONE BUDGET — brawl drawables stay <= 210 with the dressing in
//   * the pit emblem texture is really painted (gold ring, dark field)
//   * ORIGINAL ONLY — no Mortal Kombat strings anywhere in the new code
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { buildBrawlArena, ARENA_BOUNDS, arenaRadius } from '../app/kombat/arena3d.js';
import {
  buildArenaDressing, brazierSpotsFor, crowdTowerSpotsFor,
  crowdBodySpotsFor, pitEmblemTexture, KOMBAT_CGI, KOMBAT_PALETTE,
} from '../lib/kombat/arena-cgi.js';

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
const cgiSrc = stripComments(readFileSync(new URL('../lib/kombat/arena-cgi.js', import.meta.url), 'utf8')).toLowerCase();
for (const w of FORBIDDEN) t(`arena-cgi.js has no MK string "${w}"`, !cgiSrc.includes(w));

// ---- pure placement law (no scene needed) ----
for (let i = 0; i < 8; i++) {
  const r = arenaRadius(i);
  const b1 = brazierSpotsFor(i, r);
  const b2 = brazierSpotsFor(i, r);
  t(`arena ${i}: brazier spots deterministic`, JSON.stringify(b1) === JSON.stringify(b2));
  t(`arena ${i}: ${KOMBAT_CGI.BRAZIER_COUNT} braziers at radius+1.2`,
    b1.length === KOMBAT_CGI.BRAZIER_COUNT
    && b1.every((s) => Math.abs(Math.hypot(s.x, s.z) - (r + KOMBAT_CGI.BRAZIER_R_OFFSET)) < 1e-9));
  const tw1 = crowdTowerSpotsFor(i, r);
  const tw2 = crowdTowerSpotsFor(i, r);
  t(`arena ${i}: crowd tower spots deterministic`, JSON.stringify(tw1) === JSON.stringify(tw2));
  t(`arena ${i}: ${KOMBAT_CGI.CROWD_TOWERS} crowd towers at radius+2.2`,
    tw1.length === KOMBAT_CGI.CROWD_TOWERS
    && tw1.every((s) => Math.abs(Math.hypot(s.x, s.z) - (r + KOMBAT_CGI.CROWD_R_OFFSET)) < 1e-9));
  const bodies = crowdBodySpotsFor(i, r);
  t(`arena ${i}: ${KOMBAT_CGI.CROWD_TOWERS * KOMBAT_CGI.CROWD_PER_TOWER} crowd bodies`,
    bodies.length === KOMBAT_CGI.CROWD_TOWERS * KOMBAT_CGI.CROWD_PER_TOWER);
  t(`arena ${i}: crowd bodies sit on their towers`,
    bodies.every((s) => {
      const d = Math.min(...tw1.map((w) => Math.hypot(s.x - w.x, s.z - w.z)));
      return d < 1.2;
    }));
}

// ---- pit emblem texture pixels ----
{
  const tex = pitEmblemTexture();
  const d = tex.image.data;
  const px = (x, y) => { const i = (y * 128 + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const centre = px(50, 50); // off the spear shaft, inside the inner ring
  t('emblem: field is dark pit', centre[0] < 80 && centre[1] < 60);
  const ring = px(64 + 55, 64); // r 0.86 of the texture -> gold ring
  t('emblem: outer ring is gold', ring[0] > 180 && ring[1] > 140 && ring[2] < 100);
  const field = px(10, 10);
  t('emblem: field is dark, not bright', field[0] < 90);
}

// ---- full brawl builds ----
function collect(root) {
  const meshes = [], instanced = [];
  let drawables = 0, pointLights = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isPointLight) pointLights++;
    if (o.isMesh || o.isPoints || o.isSprite) drawables++;
    if (o.isInstancedMesh) instanced.push(o);
    else if (o.isMesh) meshes.push(o);
  });
  return { meshes, instanced, drawables, pointLights };
}
function worldBox(o) { return new THREE.Box3().setFromObject(o); }

for (let i = 0; i < 8; i++) {
  const r = arenaRadius(i);
  const label = `arena ${i}`;
  const bs = buildBrawlArena(i);
  const dressing = bs.group.getObjectByName('arena-dressing');
  t(`${label}: dressing group exists`, !!dressing);
  t(`${label}: dressing counts`, !!bs.dressing
    && bs.dressing.braziers === 4 && bs.dressing.crowdTowers === 4
    && bs.dressing.crowdBodies === 32 && bs.dressing.embers === KOMBAT_CGI.EMBER_COUNT
    && bs.dressing.rimGlow === 2);
  let updOk = true;
  try { bs.update(0.016, 0); bs.update(0.016, 2.5); bs.update(0.033, 7); } catch { updOk = false; }
  t(`${label}: update() runs clean with dressing`, updOk);

  const dd = collect(dressing);
  t(`${label}: dressing adds zero point lights`, dd.pointLights === 0);
  const bd = collect(bs.group);
  t(`${label}: brawl drawables <= 210 with dressing`, bd.drawables <= 210);
  t(`${label}: brawl point lights <= 4 with dressing`, bd.pointLights <= 4);

  // pit ring: flat meshes hugging the floor inside the play circle
  const flats = dd.meshes.filter((m) => m.userData.kind === 'flat');
  t(`${label}: pit ring is 4 flat meshes`, flats.length === 4);
  t(`${label}: pit ring sits on the floor (y 0.01..0.05)`,
    flats.every((m) => { const b = worldBox(m); return b.min.y >= 0.01 && b.max.y <= 0.05; }));
  t(`${label}: pit ring inside the play circle`,
    flats.every((m) => {
      const b = worldBox(m);
      // AABB corner hypot overstates a disc — the farthest real point
      // is the largest |coordinate|.
      return Math.max(Math.abs(b.max.x), Math.abs(b.min.x), Math.abs(b.max.z), Math.abs(b.min.z)) <= KOMBAT_CGI.PIT_BAND_OUTER + 0.2;
    }));

  // dressing solids clear the play circle (same rule as kombat-arenas)
  const solids = dd.meshes.filter((m) => m.userData.kind === 'solid' || m.userData.kind === 'bounds');
  let clearOk = true;
  for (const m of solids) {
    const b = worldBox(m);
    const qx = Math.max(b.min.x, Math.min(0, b.max.x));
    const qz = Math.max(b.min.z, Math.min(0, b.max.z));
    const dist = Math.hypot(qx, qz);
    if (b.min.y < 4.2 && dist < r + 0.45) clearOk = false;
  }
  t(`${label}: dressing solids clear the play circle`, clearOk);
  for (const im of dd.instanced) {
    if (im.userData.kind !== 'solid') continue;
    t(`${label}: dressing instanced minRadius >= radius+0.4`, (im.userData.minRadius ?? -1) >= r + 0.4);
  }

  // dressing never intersects the rest of the arena's solid geometry
  const rest = [];
  bs.group.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && (o.userData.kind === 'solid' || o.userData.kind === 'bounds')) {
      let p = o; let inDressing = false;
      while (p) { if (p === dressing) { inDressing = true; break; } p = p.parent; }
      if (!inDressing) rest.push(o);
    }
  });
  const restBoxes = rest.map((o) => worldBox(o));
  let collideOk = true;
  let collideDetail = '';
  for (const m of solids) {
    const b = worldBox(m);
    for (let k = 0; k < restBoxes.length; k++) {
      if (b.intersectsBox(restBoxes[k])) {
        collideOk = false;
        collideDetail = `dressing ${m.geometry?.type} at (${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}) hits rest #${k}`;
        break;
      }
    }
    if (!collideOk) break;
  }
  t(`${label}: dressing solids never intersect arena solids${collideOk ? '' : ` — ${collideDetail}`}`, collideOk);
}

console.log(`\nkombat-arena-cgi: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
