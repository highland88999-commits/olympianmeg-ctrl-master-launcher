/**
 * creature-builder.js — procedural Earth 4 creature models.
 *
 * Earth 4's creatures are real species, but their anatomy plans are
 * prose, not GLBs — and real GLBs for all 1,262 species would be
 * ~1.5–2.5 GB, far too much GPU-side for a phone. So every creature
 * is built here, at runtime, from its compiled numeric plan
 * (lib/earth4/creature-plans.json via lib/earth4/build-plan.js):
 * primitive shapes, shared geometries and materials, deterministic
 * placement — no per-creature geometry, no per-creature dispose.
 *
 * Cost envelope (the placeholder envelope): each part-group is ONE
 * mesh — a regular Mesh for a single part, one InstancedMesh for a
 * repeat part (6 legs = 1 draw call) — and normalizePlan already
 * caps the plan at 6 part-groups. The hit sphere is separate.
 *
 * Wing flap: for a FLYING creature with a 'flap' part (birds), the
 * wings are two separate meshes in group.userData.wings, pivoted at
 * the wing root, and the scene's anim loop flaps them
 * (rotation.x = ±f, same pattern as before). The wing geometries
 * are pre-flattened at geometry level (rotation.x = 0 means flat),
 * so the anim loop's rotation.x IS the flap angle — the old
 * rotation.z on a flat plane only swept the wings fore-aft, it
 * never lifted the tips. Non-flying winged creatures get one
 * static instanced pair instead.
 *
 * Grounding: parts are built in body units, the bounding box is
 * measured, and grounded creatures are shifted so their feet sit
 * at y = 0; flying and aquatic creatures stay centred on y = 0.
 * The group is then scaled to the render size (clamped 0.05–30 m
 * by build-plan.js, the same law as the old placeholders).
 */

import * as THREE from 'three';
import { planForSpecies } from './build-plan.js';

// ── shared geometry (unit extents; mesh scale carries the size) ────
// Sphere/cylinder/cone are radius 0.5 / height 1, so a mesh scaled
// to [sx, sy, sz] spans exactly sx × sy × sz body units. Planes are
// 1 × 1; the flap-wing planes are pre-flattened (rotation.x = 0 is
// flat) with the wing root at z = 0, so the anim loop's rotation.x
// pivots at the root.
const sphereGeo = new THREE.SphereGeometry(0.5, 12, 10);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 12);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const wingGeoL = new THREE.PlaneGeometry(1, 1);
wingGeoL.rotateX(-Math.PI / 2);
wingGeoL.translate(0, 0, 0.5); // spans z 0..1 (left wing, +z)
const wingGeoR = new THREE.PlaneGeometry(1, 1);
wingGeoR.rotateX(-Math.PI / 2);
wingGeoR.translate(0, 0, -0.5); // spans z -1..0 (right wing, -z)

/**
 * The geometries this module owns. scene.js destroy() must not
 * dispose them — they are shared across every creature.
 */
export const CREATURE_SHARED_GEOMETRIES = new Set([
  sphereGeo, cylGeo, coneGeo, planeGeo, wingGeoL, wingGeoR,
]);

// ── shared materials (same seeding as the old placeholders) ─────────
const matCache = new Map();
export function matFor(cls) {
  if (!matCache.has(cls)) {
    let h = 0;
    for (let i = 0; i < cls.length; i++) {
      h = (Math.imul(h, 31) + cls.charCodeAt(i)) >>> 0;
    }
    const hue = (h % 360) / 360;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.55, 0.45), roughness: 0.9,
    });
    m.userData.shared = true; // shared per class — never disposed per creature
    matCache.set(cls, m);
  }
  return matCache.get(cls);
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f3f, roughness: 1 });
const hitMat = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0, depthWrite: false,
});
trunkMat.userData.shared = true;
leafMat.userData.shared = true;
hitMat.userData.shared = true;

const GEO_FOR_SHAPE = {
  sphere: sphereGeo, cylinder: cylGeo, cone: coneGeo, plane: planeGeo,
};

// Foliage reads green, stems read brown; everything else reads the
// class colour.
const LEAF_PARTS = new Set([
  'leaves', 'leaf', 'flowers', 'flower', 'petals', 'petal', 'crown',
  'fruit',
]);
const TRUNK_PARTS = new Set(['stem', 'stipe', 'trunk']);

function materialFor(part, creature) {
  if (LEAF_PARTS.has(part.name)) return leafMat;
  if (TRUNK_PARTS.has(part.name)) return trunkMat;
  return matFor(creature.class || 'Unknown');
}

// ── instance placement (deterministic — no Math.random) ─────────────

/**
 * Where the instances of one repeat part go.
 * Returns [{ pos: [x, y, z], rotY }] in body units.
 * pair: mirrored across z, spread along x for 4/6/8.
 * ring: a circle in the x–z plane around the anchor.
 * line: spread along the stem (y) for plants/fungi, along the body
 *   (x) for animals; each instance turned by the golden angle so
 *   leaves ring the stem instead of stacking in one plane.
 */
export function placeInstances(part, kingdom) {
  const [px, py, pz] = part.pos;
  const n = part.count;
  if (part.dist === 'single' || n <= 1) {
    return [{ pos: [px, py, pz], rotY: 0 }];
  }
  if (part.dist === 'pair') {
    const zOff = Math.abs(pz) > 0.01 ? Math.abs(pz) : 0.22;
    let xs;
    if (n === 2) xs = [px, px];
    else if (n === 4) xs = [px - 0.18, px + 0.18];
    else if (n === 6) xs = [px - 0.25, px, px + 0.25];
    else xs = [px - 0.3, px - 0.1, px + 0.1, px + 0.3];
    const out = [];
    for (const x of xs) {
      out.push({ pos: [x, py, zOff], rotY: 0 });
      out.push({ pos: [x, py, -zOff], rotY: 0 });
    }
    return out.slice(0, n);
  }
  if (part.dist === 'ring') {
    const r = 0.22;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({
        pos: [px + Math.cos(a) * r, py, pz + Math.sin(a) * r],
        rotY: -a,
      });
    }
    return out;
  }
  // line
  const alongY = kingdom === 'Plantae' || kingdom === 'Fungi';
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const off = t * 0.6;
    out.push({
      pos: alongY ? [px, py + off, pz] : [px + off, py, pz],
      rotY: i * 2.39996, // golden angle — leaves ring the stem
    });
  }
  return out;
}

// ── the builder ────────────────────────────────────────────────────

const dummy = new THREE.Object3D();

function buildFlapWings(part, creature, body) {
  // Two separate meshes, pivoted at the wing root, so the anim loop
  // can flap them. The plan's size is [span, chord, 0.02]: the flat
  // wing geometry spans z 0..1 and x -0.5..0.5, so scale z by the
  // span and x by the chord.
  const mat = materialFor(part, creature);
  const [span, chord] = [part.size[0], part.size[1]];
  const root = 0.12; // wing root sits just inside the body wall
  const wl = new THREE.Mesh(wingGeoL, mat);
  wl.scale.set(chord, 1, span);
  wl.position.set(part.pos[0], part.pos[1], root);
  const wr = new THREE.Mesh(wingGeoR, mat);
  wr.scale.set(chord, 1, span);
  wr.position.set(part.pos[0], part.pos[1], -root);
  body.add(wl);
  body.add(wr);
  return [wl, wr];
}

function buildPart(part, creature, body) {
  const mat = materialFor(part, creature);
  const geo = GEO_FOR_SHAPE[part.shape] || sphereGeo;
  if (part.kind === 'single') {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(part.size[0], part.size[1], part.size[2]);
    mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
    mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
    body.add(mesh);
    return;
  }
  const spots = placeInstances(part, creature.kingdom);
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  spots.forEach((spot, i) => {
    dummy.position.set(spot.pos[0], spot.pos[1], spot.pos[2]);
    dummy.rotation.set(part.rot[0], part.rot[1] + spot.rotY, part.rot[2]);
    dummy.scale.set(part.size[0], part.size[1], part.size[2]);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  inst.instanceMatrix.needsUpdate = true;
  body.add(inst);
}

/**
 * Build the THREE.Group for one spawner creature record.
 * creature: { id, name, kingdom, class, sizeM, flying, aquatic }.
 * plansDoc: the compiled creature-plans.json (or null — the kingdom
 * fallback plans are used instead).
 * The returned group carries userData.hit (the tap target, with
 * userData.creatureId) and, for flying winged creatures,
 * userData.wings + userData.phase for the scene's flap loop.
 */
export function buildCreatureMesh(creature, plansDoc) {
  const plan = planForSpecies(plansDoc, creature);
  const s = plan.sizeM;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  let wings = null;
  for (const part of plan.parts) {
    if (part.kind === 'flap' && creature.flying) {
      wings = buildFlapWings(part, creature, body);
    } else {
      buildPart(part, creature, body);
    }
  }
  if (body.children.length === 0) {
    // A plan with no buildable parts (should not happen — the
    // fallbacks always carry a body). Read as a soft blob rather
    // than an invisible creature.
    const blob = new THREE.Mesh(sphereGeo, matFor(creature.class || 'Unknown'));
    blob.scale.set(0.5, 0.35, 0.35);
    body.add(blob);
  }

  // Grounding, in body units: feet on y = 0 for walkers, centred
  // on y = 0 for flyers and swimmers.
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body);
  const grounded = !creature.flying && !creature.aquatic;
  const shift = grounded
    ? -box.min.y
    : -(box.min.y + box.max.y) / 2;
  body.position.y = shift * s;
  body.scale.setScalar(s);

  if (wings) {
    group.userData.wings = wings;
    group.userData.phase = Math.random() * Math.PI * 2;
  } else if (creature.aquatic) {
    group.userData.phase = Math.random() * Math.PI * 2;
  }

  // The tap target: a generous invisible sphere, world radius
  // max(0.8, s) — the same law as the old placeholders.
  const centreY = ((box.min.y + box.max.y) / 2 + shift) * s;
  const hit = new THREE.Mesh(sphereGeo, hitMat);
  hit.scale.setScalar(2 * Math.max(0.8, s));
  hit.position.y = centreY;
  hit.userData.creatureId = creature.id;
  group.add(hit);
  group.userData.hit = hit;
  return group;
}
