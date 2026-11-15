/**
 * creature-builder.js — procedural Earth 4 creature models, CGI pass.
 *
 * Earth 4's creatures are real species, but their anatomy plans are
 * prose, not GLBs — and real GLBs for all 1,262 species would be
 * ~1.5–2.5 GB, far too much GPU-side for a phone. So every creature
 * is built here, at runtime, from its compiled numeric plan
 * (lib/earth4/creature-plans.json via lib/earth4/build-plan.js):
 * primitive shapes, shared geometries and materials, deterministic
 * placement — no per-creature geometry, no per-creature dispose.
 *
 * CGI pass (Nov 14): the flat single-colour bodies are gone.
 *  - REAL TEXTURES: every surface wears a procedural colour + bump
 *    map from lib/earth4/creature-textures.js, keyed by the surface
 *    family the build map names (fur, feather, overlapping scales,
 *    smooth skin, ...) with the class-seeded colour underneath.
 *    Dark features (eyes, beak, muzzle, claws, horns, tusks) stay
 *    flat dark so a face reads.
 *  - REAL GEOMETRY: heads are an assembly (skull + muzzle/beak +
 *    ears + eyes in one group, so the head can turn); walking legs
 *    are two-segment articulated limbs (upper + lower with a knee);
 *    hindlegged species grow haunch muscle over the hips; whales
 *    wear the cetacean template (flippers, fluke, dorsal fin —
 *    no legs, no fur, no ears).
 *  - ALIVE: animateCreatureMesh (called from the scene's per-frame
 *    loop) breathes the chest on the real clock (Stahl 1967 for
 *    mammals, flagged placeholders elsewhere), walks the legs in
 *    sequence with a body bob, blinks, flicks ears, sways tails,
 *    turns heads, and undulates swimmers.
 *
 * Cost envelope: each part-group is ONE mesh — a regular Mesh for a
 * single part, one InstancedMesh for a repeat part (a two-segment
 * limb part is still ONE InstancedMesh, 2 instances per leg) — and
 * normalizePlan caps the plan at 9 part-groups. The hit sphere is
 * separate. Worst case ~10 meshes per creature.
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
import { planForSpecies, defaultSurfaceFor, MAX_VISIBLE_PARTS } from './build-plan.js';
import { materialForSurface, mulberry32, hashString } from './creature-textures.js';

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
function classHue(cls) {
  let h = 0;
  for (let i = 0; i < cls.length; i++) {
    h = (Math.imul(h, 31) + cls.charCodeAt(i)) >>> 0;
  }
  return (h % 360) / 360;
}

export function classColor(cls) {
  return new THREE.Color().setHSL(classHue(cls || 'Unknown'), 0.55, 0.45);
}

const matCache = new Map();
export function matFor(cls) {
  if (!matCache.has(cls)) {
    const m = new THREE.MeshStandardMaterial({
      color: classColor(cls), roughness: 0.9,
    });
    m.userData.shared = true; // shared per class — never disposed per creature
    matCache.set(cls, m);
  }
  return matCache.get(cls);
}

// Dark variant of the class colour (eyes, beaks, claws, horns,
// tusks): same hue, very dark, so features read against the body.
const darkMatCache = new Map();
export function matForDark(cls) {
  if (!darkMatCache.has(cls)) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(classHue(cls || 'Unknown'), 0.5, 0.14),
      roughness: 0.7,
    });
    m.userData.shared = true;
    darkMatCache.set(cls, m);
  }
  return darkMatCache.get(cls);
}

// Leaves and bark wear their own textured materials (shared).
const trunkMat = materialForSurface('bark', 'bark', 0x6b4a2f);
const leafMat = materialForSurface('leaf', 'leaf', 0x3f8f3f);
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
// class colour. Flowers, petals and fruit read the class colour
// (the colourful bits) so blossoms stand apart from the leaves.
const LEAF_PARTS = new Set([
  'leaves', 'leaf', 'leaflets', 'fronds', 'lobes', 'shoots', 'crown',
]);
const TRUNK_PARTS = new Set(['stem', 'stipe', 'trunk']);
// Eyes, beaks, muzzles, claws, horns and tusks read near-black:
// same class hue, very dark, so a face has visible features
// instead of floating same-colour bumps.
const DARK_PARTS = new Set([
  'eye', 'eyes', 'compound eyes', 'beak', 'muzzle', 'snout',
]);

function isDarkPart(name) {
  const n = String(name).toLowerCase();
  return DARK_PARTS.has(n) || n.includes('claw') || n.includes('horn')
    || n.includes('tusk');
}

// Parts that move with the head (the head assembly): skull, face,
// ears, eyes, horns, tusks. They are built inside the head group
// at positions relative to the head anchor, so a head turn moves
// the whole face together.
const HEAD_PARTS = new Set([
  'head', 'muzzle', 'snout', 'beak', 'ears', 'eyes', 'compound eyes',
  'eye', 'horn', 'tusk', 'antler',
]);

function partSurfaceFamily(part, speciesSurface) {
  if (LEAF_PARTS.has(part.name)) return 'leaf';
  if (TRUNK_PARTS.has(part.name)) return 'bark';
  if (part.name === 'cap' || part.name === 'fruiting bodies') return 'fungal';
  return speciesSurface;
}

function materialFor(part, creature, speciesSurface) {
  if (isDarkPart(part.name)) return matForDark(creature.class || 'Unknown');
  if (LEAF_PARTS.has(part.name)) return leafMat;
  if (TRUNK_PARTS.has(part.name)) return trunkMat;
  const family = partSurfaceFamily(part, speciesSurface);
  return materialForSurface(
    family, creature.class || 'Unknown', classColor(creature.class || 'Unknown'));
}

// ── instance placement (deterministic — no Math.random) ─────────────

/**
 * Where the instances of one repeat part go.
 * Returns [{ pos: [x, y, z], rotY }] in body units.
 * pair: mirrored across z, spread along x for 4/6/8.
 * ring: a circle in the x–z plane around the anchor.
 * canopy: a ring around the stem axis at crown height, in two
 *   shallow tiers — a crown reads as one volume, not a stack.
 * line: spread along the stem (y) for plants/fungi, along the body
 *   (x) for animals; the golden-angle yaw rings plant leaves
 *   around the stem, and is zero for animals so fins stay in the
 *   midline.
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
    // Conifer tiers ring tight (radius 0.06) so the tier is one
    // pine layer; everything else rings at 0.22 around the anchor.
    const r = (part.name === 'branches' || part.name === 'needles') ? 0.06 : 0.22;
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
  if (part.dist === 'canopy') {
    // A crown, not a stack: a ring of copies around the stem axis
    // at crown height — the top of the stem, or 0.28 body units if
    // the anchor is lower — in two shallow tiers. The lateral
    // anchor offset is ignored: the ring is centred on the stem.
    // Radius varies a little so the tiers are not perfectly
    // regular. This is what killed the acacia's blade stack and
    // the conifer/fungus sphere totems. Pine cones nestle tight
    // in the crown (radius 0.08); foliage defines the crown's
    // width (radius 0.24).
    const rBase = part.name === 'cones' ? 0.08 : 0.24;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996; // golden angle
      const r = rBase * (0.75 + 0.25 * ((i % 3) / 2));
      const y = Math.max(py, 0.28) + (i % 2 === 0 ? 0.05 : -0.05);
      out.push({ pos: [Math.cos(a) * r, y, Math.sin(a) * r], rotY: a });
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
      // The golden-angle yaw rings plant leaves around the stem;
      // for animals it is zero — a dorsal fin yawed 137 degrees
      // off the midline reads as a crossed fin, not a fin.
      rotY: alongY ? i * 2.39996 : 0,
    });
  }
  return out;
}

// ── the builder ────────────────────────────────────────────────────

const dummy = new THREE.Object3D();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _ONE = new THREE.Vector3(1, 1, 1);

function buildFlapWings(part, creature, body, speciesSurface) {
  // Two separate meshes, pivoted at the wing root, so the anim loop
  // can flap them. The plan's size is [span, chord, 0.02]: the flat
  // wing geometry spans z 0..1 and x -0.5..0.5, so scale z by the
  // span and x by the chord.
  const mat = materialFor(part, creature, speciesSurface);
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

/**
 * Write one leg's two segment matrices into the limb InstancedMesh.
 * Upper pivots at the hip and hangs upperLen; lower pivots at the
 * knee (the upper's far end) with its own bend. At rest (both angles
 * 0) the leg is one straight column exactly as long as the old
 * single-segment leg — the static silhouette does not change.
 */
function setLimbMatrices(inst, i, leg, hipAngle, kneeAngle) {
  _e.set(0, 0, hipAngle);
  _q.setFromEuler(_e);
  _v.set(leg.hip[0], leg.hip[1], leg.hip[2]);
  _m1.compose(_v, _q, _ONE);
  _m2.makeTranslation(0, -leg.upperLen / 2, 0);
  _m1.multiply(_m2);
  _s.set(leg.upperScale[0], leg.upperScale[1], leg.upperScale[2]);
  _m2.makeScale(_s.x, _s.y, _s.z);
  _m1.multiply(_m2);
  inst.setMatrixAt(i * 2, _m1);
  // lower: hip -> knee -> bend -> hang (with the overlap tucked in)
  _v.set(leg.hip[0], leg.hip[1], leg.hip[2]);
  _m1.compose(_v, _q, _ONE);
  _m2.makeTranslation(0, -leg.upperLen, 0);
  _m1.multiply(_m2);
  _m2.makeRotationZ(kneeAngle);
  _m1.multiply(_m2);
  _m2.makeTranslation(0, -(leg.lowerLen / 2 - leg.overlap), 0);
  _m1.multiply(_m2);
  _s.set(leg.lowerScale[0], leg.lowerScale[1], leg.lowerScale[2]);
  _m2.makeScale(_s.x, _s.y, _s.z);
  _m1.multiply(_m2);
  inst.setMatrixAt(i * 2 + 1, _m1);
}

function buildLimbs(part, spots, mat, parent) {
  // Two segments per leg in ONE InstancedMesh (2 instances per
  // leg): thigh slightly thicker than the old leg, shin slightly
  // thinner, overlapping 10% at the knee so no gap opens when it
  // bends. Total length at rest == the old single leg.
  const sizeY = part.size[1];
  const upperLen = 0.55 * sizeY;
  const lowerLen = 0.55 * sizeY;
  const overlap = 0.1 * sizeY;
  const inst = new THREE.InstancedMesh(cylGeo, mat, spots.length * 2);
  const legs = spots.map((spot, i) => {
    // The hip is the TOP of the old leg column; the old leg was
    // centred on the anchor, so the hip sits sizeY/2 above it.
    const hip = [spot.pos[0], spot.pos[1] + sizeY / 2, spot.pos[2]];
    // Gait phase: lateral-sequence walk LH -> LF -> RH -> RF at
    // quarter intervals. Facing +x, up +y, left is -z (instance 1
    // of a pair sits at -z). A generic 'legs' part (insects)
    // alternates tripods: even instances one tripod, odd the other.
    let phase;
    if (part.name === 'forelegs') phase = spot.pos[2] > 0 ? 0.75 : 0.25;
    else if (part.name === 'hindlegs') phase = spot.pos[2] > 0 ? 0.5 : 0;
    else phase = (i % 2) * 0.5;
    return {
      hip,
      phase,
      upperLen,
      lowerLen,
      overlap,
      upperScale: [part.size[0] * 1.1, upperLen, part.size[2] * 1.1],
      lowerScale: [part.size[0] * 0.85, lowerLen, part.size[2] * 0.85],
    };
  });
  legs.forEach((leg, i) => setLimbMatrices(inst, i, leg, 0, 0));
  inst.instanceMatrix.needsUpdate = true;
  parent.add(inst);
  return { kind: 'limb', mesh: inst, legs };
}

/**
 * Build one part into `parent`, at positions relative to
 * `posOffset` (the head anchor for head-group parts, [0,0,0]
 * otherwise). Returns a descriptor for the animation collector,
 * or null when nothing was built.
 */
function buildPart(part, creature, parent, posOffset, speciesSurface) {
  const mat = materialFor(part, creature, speciesSurface);
  const geo = GEO_FOR_SHAPE[part.shape] || sphereGeo;
  const pos = [
    part.pos[0] - posOffset[0],
    part.pos[1] - posOffset[1],
    part.pos[2] - posOffset[2],
  ];
  if (part.kind === 'single') {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(part.size[0], part.size[1], part.size[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2], 'YXZ');
    parent.add(mesh);
    return {
      kind: 'single', mesh, pos, size: part.size, rot: part.rot,
    };
  }
  const shifted = { ...part, pos };
  const spots = placeInstances(shifted, creature.kingdom);
  if (part.kind === 'limb') {
    return buildLimbs(part, spots, mat, parent);
  }
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  // Rotation order YXZ: yaw first, then pitch. A flat plane
  // (rot.x = -PI/2) yawed under the default XYZ order rolls
  // instead of turning — measured on Acacia prominens, only 1 of
  // 6 leaf planes stayed flat. Under YXZ the plane stays flat
  // at any yaw. The same order is used for single meshes below.
  dummy.rotation.order = 'YXZ';
  spots.forEach((spot, i) => {
    dummy.position.set(spot.pos[0], spot.pos[1], spot.pos[2]);
    dummy.rotation.set(part.rot[0], part.rot[1] + spot.rotY, part.rot[2]);
    dummy.scale.set(part.size[0], part.size[1], part.size[2]);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  inst.instanceMatrix.needsUpdate = true;
  parent.add(inst);
  return {
    kind: 'repeat', mesh: inst, spots, size: part.size, rot: part.rot,
  };
}

// ── breathing + gait rates ─────────────────────────────────────────

/**
 * Breaths per minute. Mammals: Stahl, W.R. (1967), J. Applied
 * Physiology 22:453-460 — f = 53.5 x M^-0.26, M in kg (verified:
 * mouse ~148, human ~18, elephant ~6). Mass is an ANIMATION
 * ESTIMATE (massKg = 20 x sizeM^3), not data — it only sets the
 * breathing tempo. Aquatic mammals use the same formula: their
 * exponent is -0.42 but no coefficient was found, so inventing one
 * would be worse than reusing the verified shape (flagged).
 * Birds: exponent ~M^-1/4, NO coefficient found — the mammal
 * coefficient is reused as a flagged placeholder. Everything else:
 * NO published formula found (reptile breathing is intermittent
 * and temperature-dependent; fish have no opercular-beat formula)
 * — flat 10/min placeholder, flagged.
 */
export function breathingRateBpm(creature) {
  const sizeM = Number(creature.sizeM) || 1;
  const massKg = 20 * Math.pow(sizeM, 3);
  if (creature.class === 'Mammalia') {
    return 53.5 * Math.pow(massKg, -0.26);
  }
  if (creature.class === 'Aves') {
    return 53.5 * Math.pow(massKg, -0.25); // PLACEHOLDER coefficient
  }
  return 10; // PLACEHOLDER: no formula found
}

/**
 * Stride frequency in Hz. ANIMATION ESTIMATE, not data: stride
 * length ~0.9 body lengths, walk speed ~1.5 body lengths/s, smaller
 * animals step faster (~size^-0.15). Clamped to a sane band.
 */
export function strideFrequencyHz(creature) {
  const sizeM = Math.max(0.05, Number(creature.sizeM) || 1);
  return Math.min(3, Math.max(0.8, 1.67 * Math.pow(1 / sizeM, 0.15)));
}

// ── the builder ────────────────────────────────────────────────────

/**
 * Build the THREE.Group for one spawner creature record.
 * creature: { id, name, kingdom, class, sizeM, flying, aquatic }.
 * plansDoc: the compiled creature-plans.json (or null — the kingdom
 * fallback plans are used instead).
 * The returned group carries userData.hit (the tap target, with
 * userData.creatureId) and, for flying winged creatures,
 * userData.wings + userData.phase for the scene's flap loop.
 * userData.anim holds the living bits for animateCreatureMesh:
 * breath (chest mesh + base scale), limbs (two-segment legs +
 * gait phases), eyes (blink state), ears (flick state), tail,
 * head (the head group), body (the inner group + base Y for bob).
 * userData.phase is seeded from the creature id — deterministic,
 * so the same spawn reads the same.
 */
export function buildCreatureMesh(creature, plansDoc) {
  const plan = planForSpecies(plansDoc, creature);
  const surface = plan.surface || defaultSurfaceFor(creature.kingdom);
  const s = plan.sizeM;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // The head assembly: skull + face + ears + eyes in one group at
  // the head anchor, so a head turn moves the whole face together.
  // Positions inside are relative to the anchor.
  const headPart = plan.parts.find((p) => p.name === 'head');
  const headGroup = headPart ? new THREE.Group() : null;
  if (headGroup) {
    headGroup.position.set(headPart.pos[0], headPart.pos[1], headPart.pos[2]);
    body.add(headGroup);
  }

  const anim = {
    limbs: [], eyes: null, ears: null, tail: null, breath: null,
    head: headGroup, body, bodyBaseY: 0, headBaseX: headPart ? headPart.pos[0] : 0,
  };
  let wings = null;
  let meshCount = 0;
  for (const part of plan.parts) {
    if (part.kind === 'flap' && creature.flying) {
      wings = buildFlapWings(part, creature, body, surface);
      meshCount += 2;
      continue;
    }
    const inHead = headGroup && HEAD_PARTS.has(part.name);
    const built = buildPart(
      part, creature, inHead ? headGroup : body,
      inHead ? headPart.pos : [0, 0, 0], surface);
    if (!built) continue;
    meshCount += 1;
    if (part.name === 'body' || part.name === 'thorax' || part.name === 'abdomen') {
      if (built.kind === 'single') {
        anim.breath = { mesh: built.mesh, base: built.mesh.scale.clone() };
      }
    }
    if (built.kind === 'limb') anim.limbs.push(built);
    if (part.name === 'eyes' || part.name === 'compound eyes' || part.name === 'eye') {
      anim.eyes = {
        ...built,
        blink: {
          next: 2 + (hashString(creature.id || creature.name) % 4000) / 1000,
          until: 0, current: 1,
          rand: mulberry32(hashString(`blink:${creature.id || creature.name}`)),
        },
      };
    }
    if (part.name === 'ears') {
      anim.ears = {
        ...built,
        flick: {
          next: 3 + (hashString(creature.id || creature.name) % 5000) / 1000,
          until: 0, ear: 0, current: 0,
          rand: mulberry32(hashString(`flick:${creature.id || creature.name}`)),
        },
      };
    }
    if (part.name === 'tail' && built.kind === 'single') {
      anim.tail = { mesh: built.mesh, baseRotY: built.rot[1] };
    }
  }

  // Haunches: thigh muscle over the hips, for hindlegged species.
  // Two spheres at the rear quarters, sized from the hindleg —
  // the muscle that shapes a quadruped's back end. Added here,
  // not in the plans, so the compiled JSON stays compact (no
  // per-species override for 131 species). Only when the budget
  // has room: a mammal carries 8 part-groups, so 8 + haunches = 9.
  const hind = plan.parts.find((p) => p.name === 'hindlegs');
  if (hind && plan.parts.length < MAX_VISIBLE_PARTS) {
    const hMat = materialFor({ name: 'haunches' }, creature, surface);
    const hInst = new THREE.InstancedMesh(sphereGeo, hMat, 2);
    const hs = [
      Math.max(0.2, hind.size[0] * 1.4),
      Math.max(0.16, hind.size[1] * 0.9),
      Math.max(0.14, hind.size[2] * 1.2),
    ];
    dummy.rotation.order = 'YXZ';
    for (let i = 0; i < 2; i++) {
      dummy.position.set(hind.pos[0], 0.06, i === 0 ? 0.16 : -0.16);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(hs[0], hs[1], hs[2]);
      dummy.updateMatrix();
      hInst.setMatrixAt(i, dummy.matrix);
    }
    hInst.instanceMatrix.needsUpdate = true;
    body.add(hInst);
    meshCount += 1;
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
  anim.bodyBaseY = body.position.y;

  // Deterministic phase from the spawn id (not Math.random — the
  // same spawn must read the same).
  const phase = (hashString(creature.id || creature.name) % 100000) / 100000 * Math.PI * 2;
  if (wings) {
    group.userData.wings = wings;
  }
  group.userData.phase = phase;
  group.userData.sizeM = s;
  group.userData.anim = anim;
  group.userData.meshCount = meshCount;

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

// ── the living step ────────────────────────────────────────────────

function recomposeInstances(built, yScale, rotYExtra, onlyIndex) {
  // Rebuild one repeat part's instance matrices from its stored
  // spots, scaling Y (blink) and adding a yaw offset (ear flick).
  dummy.rotation.order = 'YXZ';
  built.spots.forEach((spot, i) => {
    if (onlyIndex !== undefined && i !== onlyIndex) return;
    dummy.position.set(spot.pos[0], spot.pos[1], spot.pos[2]);
    dummy.rotation.set(
      built.rot[0], built.rot[1] + spot.rotY + (rotYExtra || 0), built.rot[2]);
    dummy.scale.set(built.size[0], built.size[1] * yScale, built.size[2]);
    dummy.updateMatrix();
    built.mesh.setMatrixAt(i, dummy.matrix);
  });
  built.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * One frame of life for a built creature group. Called from the
 * scene's per-frame creature loop with the scene clock (t, seconds)
 * and frame delta. Everything is guarded: a creature without the
 * relevant part simply skips that motion. Plants and fungi do not
 * breathe, blink or walk — they have none of those parts.
 */
export function animateCreatureMesh(group, t, dt, creature) {
  const a = group && group.userData ? group.userData.anim : null;
  if (!a) return;
  const phase = group.userData.phase || 0;
  dummy.rotation.order = 'YXZ';

  // Breathing: the chest (body mesh) rises and falls on the real
  // clock. Ribcage first: Y swells most, Z next, length least.
  if (a.breath && creature.kingdom !== 'Plantae' && creature.kingdom !== 'Fungi') {
    const bpm = breathingRateBpm(creature);
    const s = Math.sin(t * (bpm / 60) * Math.PI * 2 + phase);
    const b = a.breath.base;
    a.breath.mesh.scale.set(
      b.x * (1 + 0.01 * s), b.y * (1 + 0.03 * s), b.z * (1 + 0.02 * s));
  }

  // Walk gait: lateral-sequence 4-beat (LH -> LF -> RH -> RF at
  // quarter intervals, duty ~0.65 approximated by the sine), hips
  // swing, knees bend on the swing-through, body bobs 4x/stride.
  if (a.limbs.length && !creature.flying && !creature.aquatic) {
    const freq = strideFrequencyHz(creature);
    for (const limb of a.limbs) {
      for (let i = 0; i < limb.legs.length; i++) {
        const leg = limb.legs[i];
        const th = ((t * freq + leg.phase) % 1) * Math.PI * 2;
        const hip = 0.42 * Math.sin(th);
        const knee = 0.5 * Math.max(0, Math.sin(th + 1.9));
        setLimbMatrices(limb.mesh, i, leg, hip, knee);
      }
      limb.mesh.instanceMatrix.needsUpdate = true;
    }
    const bob = Math.sin(t * freq * Math.PI * 2 * 4) * 0.012;
    a.body.position.y = a.bodyBaseY + bob * (group.userData.sizeM || 1);
    a.body.rotation.z = 0.015 * Math.sin(t * freq * Math.PI * 2 * 2 + phase);
  }

  // Head turns: a slow look-around; walking birds add the
  // hold-then-thrust head-bob, two thrusts per stride.
  if (a.head) {
    a.head.rotation.y = 0.18 * Math.sin(t * 0.35 + phase * 3.1);
    a.head.rotation.x = 0.06 * Math.sin(t * 0.23 + phase * 1.7);
    if (creature.class === 'Aves' && !creature.flying && !creature.aquatic) {
      const freq = strideFrequencyHz(creature);
      const thrust = Math.max(0, Math.sin(t * freq * Math.PI * 2 * 2));
      a.head.position.x = a.headBaseX + 0.02 * thrust;
    }
  }

  // Blinking: lids shut (eye Y-scale -> 0.12) for ~120 ms on a
  // seeded 2-6 s timer.
  if (a.eyes) {
    const bl = a.eyes.blink;
    if (t >= bl.next) {
      bl.until = t + 0.12;
      bl.next = t + 2 + bl.rand() * 4;
    }
    const f = t < bl.until ? 0.12 : 1;
    if (f !== bl.current) {
      bl.current = f;
      recomposeInstances(a.eyes, f, 0);
    }
  }

  // Ear flicks: one ear at a time, a quick quarter-second twitch
  // on a seeded 3-8 s timer.
  if (a.ears) {
    const fl = a.ears.flick;
    if (t >= fl.next) {
      fl.until = t + 0.25;
      fl.ear = fl.ear === 0 ? 1 : 0;
      fl.next = t + 3 + fl.rand() * 5;
    }
    if (t < fl.until) {
      const p = (t - (fl.until - 0.25)) / 0.25;
      fl.current = 1;
      recomposeInstances(a.ears, 1, 0.5 * Math.sin(p * Math.PI), fl.ear);
    } else if (fl.current !== 0) {
      fl.current = 0;
      recomposeInstances(a.ears, 1, 0);
    }
  }

  // Tail sway: a slow side-to-side sweep, faster for swimmers.
  if (a.tail) {
    const rate = creature.aquatic ? 2.4 : 1.4;
    a.tail.mesh.rotation.y = a.tail.baseRotY
      + 0.22 * Math.sin(t * rate + phase);
  }

  // Swimmers undulate: the inner body group sways so the fluke
  // sweeps, without fighting the scene's heading on the outer group.
  if (creature.aquatic && a.body) {
    a.body.rotation.y = 0.07 * Math.sin(t * 2.1 + phase);
  }
}
