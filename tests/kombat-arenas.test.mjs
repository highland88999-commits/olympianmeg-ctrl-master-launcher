// tests/kombat-arenas.test.mjs — headless tests for the upgraded Kombat
// arenas (app/kombat/arenas.js + arena3d.js) and the shared world
// environment kit (lib/worlds/environment.js).
// Run: node tests/kombat-arenas.test.mjs (from the repo root).
// No browser, no network — builds every scene graph in node and proves:
//   * the buildArena/buildBrawlArena contract + ARENA_META alignment
//   * FLOOR LAW — a ground surface tops out at y=0 over the fight area
//   * SOLID GEOMETRY — no solid set piece intrudes into the duel fight
//     band or the brawl play circle (clearance via world AABBs, plus
//     builder-stamped min-radius for instanced pieces); boundary walls
//     ('bounds') sit at or outside the play circle, never inside it
//   * the duel-only foreground frame exists in duel, never in brawl,
//     and keeps to the frame edges (z toward the camera)
//   * LIGHTING LAW budget — at most 4 real point lights per stage
//   * PHONE BUDGET — drawable counts per stage stay under the cap
//   * update() runs clean (atmosphere/ambient life wired)
import * as THREE from 'three';
import { ARENAS, ARENA_META, buildArena } from '../app/kombat/arenas.js';
import { buildBrawlArena, ARENA_BOUNDS, arenaRadius } from '../app/kombat/arena3d.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const EXPECTED_META = [
  { name: 'Camp Crystal Lake', tag: 'He is still in the water', franchise: 'Horror' },
  { name: 'Mustafar', tag: 'The high ground is lava', franchise: 'Sci-Fi' },
  { name: 'Jurassic Gate', tag: 'Life finds a way', franchise: 'Jurassic' },
  { name: 'Firehouse Roof', tag: 'Who ya gonna call?', franchise: 'Ghostbusters' },
  { name: 'Sunset Canyon', tag: 'Meep meep', franchise: 'Toons' },
  { name: 'Manhattan Rooftop', tag: 'The city that never sleeps', franchise: 'Marvel' },
  { name: 'Midgar', tag: 'Mako flows beneath', franchise: 'Final Fantasy' },
  { name: 'Hangar 51', tag: 'Nothing to see here', franchise: 'Monsters vs Aliens' },
];

t('ARENA_META has 8 entries', ARENA_META.length === 8);
t('ARENAS has 8 builders', ARENAS.length === 8);
t('ARENA_META matches the pinned registry', JSON.stringify(ARENA_META) === JSON.stringify(EXPECTED_META));
t('ARENA_BOUNDS index-aligned with ARENA_META', ARENA_BOUNDS.length === ARENA_META.length);

// The duel combat space: fighters live at z=0, |x| <= ~7, height ~2.6
// with jump margin. No solid may intersect this box.
const BAND = new THREE.Box3(
  new THREE.Vector3(-7, 0.04, -2.1),
  new THREE.Vector3(7, 2.6, 2.1)
);
const OVERHEAD_Y = 4.2; // above any fighter's reach — exempt from radius rules

function collect(root) {
  const meshes = [], instanced = [], points = [];
  let drawables = 0, pointLights = 0, hasForeground = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.name === 'foreground') hasForeground = true;
    if (o.isPointLight) pointLights++;
    if (o.isMesh || o.isPoints || o.isSprite) drawables++;
    if (o.isInstancedMesh) instanced.push(o);
    else if (o.isMesh) meshes.push(o);
  });
  return { meshes, instanced, drawables, pointLights, hasForeground };
}
function worldBox(o) { return new THREE.Box3().setFromObject(o); }
function closestDistToOrigin(box) {
  const qx = Math.max(box.min.x, Math.min(0, box.max.x));
  const qz = Math.max(box.min.z, Math.min(0, box.max.z));
  return Math.hypot(qx, qz);
}
// Second, independent lower bound on a mesh's true clearance from the
// arena center: (distance of the mesh origin) minus (its geometry's
// widest horizontal reach, rotation applied). Valid for any shape; the
// AABB bound above is tighter for axis-aligned pieces, this one is
// tighter for rotated pieces — take the max of the two valid bounds.
const _rotM = new THREE.Matrix4();
const _v = new THREE.Vector3();
function centerMinusExtent(o) {
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  const bb = o.geometry.boundingBox;
  _rotM.extractRotation(o.matrixWorld);
  let ext = 0;
  for (const cx of [bb.min.x, bb.max.x]) for (const cz of [bb.min.z, bb.max.z]) {
    _v.set(cx, 0, cz).applyMatrix4(_rotM);
    ext = Math.max(ext, Math.hypot(_v.x, _v.z));
  }
  const c = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  return Math.hypot(c.x, c.z) - ext;
}
function clearanceOf(o, box) {
  return Math.max(closestDistToOrigin(box), centerMinusExtent(o));
}
function inForeground(o) {
  let p = o;
  while (p) { if (p.name === 'foreground') return true; p = p.parent; }
  return false;
}

for (let i = 0; i < 8; i++) {
  const meta = EXPECTED_META[i];
  const label = `arena ${i} (${meta.name})`;

  // ---------------- duel build ----------------
  const s = buildArena(i);
  t(`${label}: contract shape`, !!s.group && typeof s.update === 'function' && !!s.fog && typeof s.bg === 'number');
  t(`${label}: meta alignment`, s.name === meta.name && s.tag === meta.tag && s.franchise === meta.franchise);
  t(`${label}: fog sane`, s.fog.near > 0 && s.fog.far > s.fog.near);
  let updateOk = true;
  try { s.update(0.016, 0); s.update(0.016, 1.5); s.update(0.033, 4.2); } catch { updateOk = false; }
  t(`${label}: update() runs clean`, updateOk);

  const d = collect(s.group);
  t(`${label}: duel has the foreground frame`, d.hasForeground);
  t(`${label}: point lights <= 4 (lighting law)`, d.pointLights <= 4);
  t(`${label}: drawable budget (<= 170)`, d.drawables <= 170);

  // floor law: a 'ground' surface tops out at y≈0 and spans the band
  let floorOk = false;
  for (const m of d.meshes) {
    if (m.userData.kind !== 'ground') continue;
    const b = worldBox(m);
    if (Math.abs(b.max.y) <= 0.03 && b.min.x <= -6 && b.max.x >= 6 && b.min.z <= -1 && b.max.z >= 1) floorOk = true;
  }
  t(`${label}: floor law — ground tops at y=0 over the fight area`, floorOk);

  // solid geometry: nothing solid inside the duel band; foreground
  // pieces keep to the camera-side frame edge (z >= 2.8 or overhead)
  let bandOk = true, foreOk = true;
  for (const m of d.meshes) {
    if (m.userData.kind !== 'solid') continue;
    const b = worldBox(m);
    if (inForeground(m)) {
      if (!(b.min.z >= 2.8 || b.min.y >= OVERHEAD_Y)) foreOk = false;
    } else if (b.intersectsBox(BAND)) bandOk = false;
  }
  t(`${label}: no solid intrudes into the fight band`, bandOk);
  t(`${label}: foreground frame keeps to the edges`, foreOk);
  for (const im of d.instanced) {
    if (im.userData.kind !== 'solid') continue; // 'flat' instancing = floor litter
    t(`${label}: instanced clearance stamp (${im.userData.minRadius?.toFixed(1)})`, (im.userData.minRadius ?? -1) >= 7.4);
  }

  // ---------------- brawl build ----------------
  const bs = buildBrawlArena(i);
  const radius = arenaRadius(i);
  t(`${label}: brawl contract`, bs.radius === radius && bs.meta.name === meta.name && typeof bs.update === 'function');
  let bUpdateOk = true;
  try { bs.update(0.016, 0.5); } catch { bUpdateOk = false; }
  t(`${label}: brawl update() runs clean`, bUpdateOk);
  const bd = collect(bs.group);
  t(`${label}: brawl has NO duel foreground frame`, !bd.hasForeground);
  t(`${label}: brawl point lights <= 4`, bd.pointLights <= 4);
  t(`${label}: brawl drawable budget (<= 210)`, bd.drawables <= 210);

  let circleOk = true, boundsOk = true;
  for (const m of bd.meshes) {
    const kind = m.userData.kind;
    if (kind !== 'solid' && kind !== 'bounds') continue;
    const b = worldBox(m);
    const dist = clearanceOf(m, b);
    if (kind === 'bounds') {
      if (dist < radius - 0.35) boundsOk = false;
    } else if (b.min.y < OVERHEAD_Y && dist < radius + 0.45) circleOk = false;
  }
  t(`${label}: no solid inside the brawl play circle`, circleOk);
  t(`${label}: boundary walls sit at/outside the circle`, boundsOk);
  for (const im of bd.instanced) {
    if (im.userData.kind !== 'solid') continue;
    t(`${label}: brawl instanced clearance (${im.userData.minRadius?.toFixed(1)} >= ${(radius + 0.4).toFixed(1)})`,
      (im.userData.minRadius ?? -1) >= radius + 0.4);
  }
}

// fallback behavior (pre-existing contract): unknown index -> arena 0
const fb = buildArena(99);
t('buildArena(99) falls back to Camp Crystal Lake', fb.name === 'Camp Crystal Lake');

console.log(`\nkombat-arenas: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
