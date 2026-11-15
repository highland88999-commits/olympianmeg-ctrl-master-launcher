/**
 * earth4-creature-builder.test.mjs — the procedural creature builder.
 *
 * Builds a THREE.Group for every one of the 99 anatomy templates
 * (the 75 the catalogue uses, plus the 24 it does not — the builder
 * must not throw on any of them) and for representative real species,
 * and checks the cost envelope, the tap target, the flap contract
 * and the grounding law.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  buildCreatureMesh, animateCreatureMesh, breathingRateBpm,
  strideFrequencyHz, CREATURE_SHARED_GEOMETRIES, placeInstances,
} from '../lib/earth4/creature-builder.js';
import {
  planForSpecies, MAX_VISIBLE_PARTS,
} from '../lib/earth4/build-plan.js';
import { SPECIES_CATALOGUE } from '../lib/earth4/species-catalogue.js';

const PLANS = JSON.parse(readFileSync(
  new URL('../lib/earth4/creature-plans.json', import.meta.url), 'utf8'));

const byName = Object.fromEntries(SPECIES_CATALOGUE.map((s) => [s.name, s]));

function creatureFor(name, extra = {}) {
  const s = byName[name];
  return {
    id: `test-${name.replace(/[^A-Za-z]/g, '-')}`,
    name: s.name, kingdom: s.kingdom, class: s.class,
    sizeM: s.sizeM, flying: false, aquatic: false, ...extra,
  };
}

/** Visible meshes: every Mesh/InstancedMesh except the hit sphere. */
function visibleMeshes(group) {
  const out = [];
  group.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && !o.userData.creatureId) {
      out.push(o);
    }
  });
  return out;
}

/** Bounding box of the creature's body only (the hit sphere is a
 *  generous invisible target and must not count toward grounding). */
function bodyBox(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of visibleMeshes(group)) box.expandByObject(m);
  return box;
}

function meshCost(plan, flying) {
  return plan.parts.reduce(
    (n, p) => n + (p.kind === 'flap' && flying ? 2 : 1), 0);
}

/** World positions of an InstancedMesh's instances. */
function instanceWorldPositions(mesh) {
  // Update from the root: buildCreatureMesh leaves body.matrixWorld
  // stale (the scale is set after the grounding pass), so updating
  // from the mesh alone would return body units, not world metres.
  let root = mesh;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(new THREE.Vector3().setFromMatrixPosition(m)
      .applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

describe('placeInstances', () => {
  it('pair mirrors across z and spreads along x', () => {
    const spots = placeInstances(
      { pos: [0, -0.22, 0], count: 6, dist: 'pair' }, 'Animalia');
    assert.equal(spots.length, 6);
    const xs = [...new Set(spots.map((s) => s.pos[0]))];
    assert.equal(xs.length, 3); // three pairs along the body
    const zs = [...new Set(spots.map((s) => s.pos[2]))];
    assert.equal(zs.length, 2); // one per side
    assert.ok(zs.includes(0.22) && zs.includes(-0.22));
  });

  it('ring circles the anchor', () => {
    const spots = placeInstances(
      { pos: [0, 0, 0], count: 8, dist: 'ring' }, 'Animalia');
    assert.equal(spots.length, 8);
    for (const s of spots) {
      const r = Math.hypot(s.pos[0], s.pos[2]);
      assert.ok(Math.abs(r - 0.22) < 1e-9, `ring radius ${r}`);
    }
  });

  it('line spreads along the stem for plants, along the body for animals', () => {
    const leaves = placeInstances(
      { pos: [0, 0.22, 0], count: 6, dist: 'line' }, 'Plantae');
    assert.equal(leaves.length, 6);
    assert.ok(new Set(leaves.map((s) => s.pos[1])).size > 1);
    assert.ok(leaves.every((s) => s.pos[0] === 0));
    const spines = placeInstances(
      { pos: [0, 0.22, 0], count: 6, dist: 'line' }, 'Animalia');
    assert.ok(new Set(spines.map((s) => s.pos[0])).size > 1);
    assert.ok(spines.every((s) => s.pos[1] === 0.22));
  });

  it('canopy rings the crown in two tiers, centred on the stem', () => {
    const spots = placeInstances(
      { name: 'leaves', pos: [0, 0, 0.22], count: 6, dist: 'canopy' },
      'Plantae');
    assert.equal(spots.length, 6);
    // All six sit in a crown band, not stacked up the stem.
    const ys = spots.map((s) => s.pos[1]);
    assert.ok(Math.min(...ys) >= 0.23, `lowest leaf ${Math.min(...ys)}`);
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 0.11);
    // Centred on the stem axis (the lateral anchor offset ignored).
    for (const s of spots) {
      const r = Math.hypot(s.pos[0], s.pos[2]);
      assert.ok(r >= 0.17 && r <= 0.25, `canopy radius ${r}`);
    }
    // Pine cones nestle tight, foliage defines the crown width.
    const cones = placeInstances(
      { name: 'cones', pos: [0, 0.4, 0], count: 6, dist: 'canopy' },
      'Plantae');
    assert.ok(cones.every((s) => Math.hypot(s.pos[0], s.pos[2]) <= 0.09));
  });

  it('line yaw is golden for plants, zero for animals', () => {
    const leaves = placeInstances(
      { pos: [0, 0.22, 0], count: 6, dist: 'line' }, 'Plantae');
    assert.ok(leaves.some((s) => s.rotY !== 0));
    const fins = placeInstances(
      { pos: [0, 0.22, 0], count: 2, dist: 'line' }, 'Animalia');
    assert.ok(fins.every((s) => s.rotY === 0),
      'a dorsal fin yawed off the midline reads as a crossed fin');
  });

  it('conifer tiers ring tight, not at the 0.22 colony radius', () => {
    const branches = placeInstances(
      { name: 'branches', pos: [0, 0.05, 0], count: 8, dist: 'ring' },
      'Plantae');
    assert.ok(branches.every((s) =>
      Math.abs(Math.hypot(s.pos[0], s.pos[2]) - 0.06) < 1e-9));
    const fruiting = placeInstances(
      { name: 'fruiting bodies', pos: [0, 0.4, 0], count: 8, dist: 'ring' },
      'Fungi');
    assert.ok(fruiting.every((s) =>
      Math.abs(Math.hypot(s.pos[0], s.pos[2]) - 0.22) < 1e-9));
  });

  it('placement is deterministic', () => {
    const a = placeInstances(
      { pos: [0, 0, 0], count: 8, dist: 'ring' }, 'Animalia');
    const b = placeInstances(
      { pos: [0, 0, 0], count: 8, dist: 'ring' }, 'Animalia');
    assert.deepEqual(a, b);
  });
});

describe('buildCreatureMesh — representative species', () => {
  it('insect: 7 visible meshes, feet on the ground', () => {
    const c = creatureFor('Acheta domesticus', { sizeM: 0.02 });
    const g = buildCreatureMesh(c, PLANS);
    const vis = visibleMeshes(g);
    assert.equal(vis.length, 7);
    const box = bodyBox(g);
    assert.ok(Math.abs(box.min.y) < 1e-6, `min.y ${box.min.y}`);
    // The whole creature is a visible speck: sizeM 0.02 clamps to
    // the 0.05 m render minimum, so ~1 body unit reads as ~5 cm.
    assert.ok(box.max.x - box.min.x < 0.06);
    assert.ok(box.max.x - box.min.x > 0.04);
    // One InstancedMesh carries the 6 legs, two segments apiece
    // (upper + lower with a knee); every mesh shares geometry and
    // material with the module, nothing per-creature.
    const legs = vis.find((m) => m.isInstancedMesh && m.count === 12);
    assert.ok(legs, 'legs should be one InstancedMesh of 12 (6 x 2 segments)');
    assert.ok(CREATURE_SHARED_GEOMETRIES.has(legs.geometry));
  });

  it('flying bird: two flap wing meshes, phase set, 9 meshes total', () => {
    const c = creatureFor('Cyanocorax cyanopogon',
      { sizeM: 0.25, flying: true });
    const g = buildCreatureMesh(c, PLANS);
    assert.ok(Array.isArray(g.userData.wings), 'wings must be set');
    assert.equal(g.userData.wings.length, 2);
    assert.ok(Number.isFinite(g.userData.phase));
    // The two wings are separate meshes, mirrored across the body.
    const [wl, wr] = g.userData.wings;
    assert.ok(wl.position.z > 0 && wr.position.z < 0);
    assert.ok(Math.abs(wl.position.z + wr.position.z) < 1e-9);
    assert.equal(visibleMeshes(g).length, 9);
    // The bird flies: centred on y = 0, not grounded.
    const box = bodyBox(g);
    assert.ok(Math.abs((box.min.y + box.max.y) / 2) < 1e-6);
  });

  it('fish: aquatic, centred, phase set for the sway loop', () => {
    const c = creatureFor('Aioliops brachypterus',
      { sizeM: 0.1, aquatic: true });
    const g = buildCreatureMesh(c, PLANS);
    assert.equal(g.userData.wings, undefined);
    assert.ok(Number.isFinite(g.userData.phase));
    assert.equal(visibleMeshes(g).length, 8);
    const box = bodyBox(g);
    assert.ok(Math.abs((box.min.y + box.max.y) / 2) < 1e-6);
  });

  it('mammal: body, head, four legs, haunches, eyes; grounded', () => {
    const c = creatureFor('Aotus zonalis', { sizeM: 0.5 });
    const g = buildCreatureMesh(c, PLANS);
    assert.equal(visibleMeshes(g).length, 9);
    const box = bodyBox(g);
    assert.ok(Math.abs(box.min.y) < 1e-6);
    const legs = visibleMeshes(g).filter((m) => m.isInstancedMesh);
    // Forelegs and hindlegs are separate limb part-groups (one
    // InstancedMesh each, 2 legs x 2 segments apiece); eyes, ears
    // and haunches are the other three.
    assert.equal(legs.length, 5);
    assert.deepEqual(legs.map((m) => m.count).sort(), [2, 2, 2, 4, 4]);
    // The head reads as a head: proud of the body front, with the
    // forelegs under the front quarter and the hindlegs under the
    // rear — not one ball on four sticks bunched at the middle.
    const plan = planForSpecies(PLANS, c);
    const byName = Object.fromEntries(plan.parts.map((p) => [p.name, p]));
    const bodyFront = byName.body.pos[0] + byName.body.size[0] / 2;
    const headFront = byName.head.pos[0] + byName.head.size[0] / 2;
    assert.ok(headFront - bodyFront > 0.1, 'head must clear the body front');
    assert.equal(byName.forelegs.pos[0], 0.2);
    assert.equal(byName.hindlegs.pos[0], -0.2);
    assert.ok(byName.forelegs.size[0] > 0.1, 'legs must be stocky, not sticks');
    // Eyes sit on the head and read dark, not floating and
    // body-coloured. The eyes are the dark sphere InstancedMesh
    // of 2 (ears are the other sphere pair, class-coloured).
    const spheres = legs.filter((m) => m.geometry.type === 'SphereGeometry');
    assert.equal(spheres.length, 3, 'eyes + ears + haunches');
    const dark = (m) => {
      const hsl = {};
      m.material.color.getHSL(hsl);
      return hsl.l;
    };
    const eyes = spheres.find((m) => dark(m) < 0.25);
    assert.ok(eyes, 'eyes should be one dark InstancedMesh of 2');
    assert.equal(eyes.count, 2);
    assert.notEqual(eyes.material,
      visibleMeshes(g).find((m) => !m.isInstancedMesh).material);
    // Haunches: the fur-textured sphere pair at the rear quarters
    // (ears are the other textured pair, up on the head).
    const haunches = spheres.find((m) => m !== eyes
      && instanceWorldPositions(m).every((p) => p.x < 0));
    assert.ok(haunches, 'haunches should be one textured InstancedMesh of 2');
    assert.equal(haunches.count, 2);
    assert.ok(haunches.material.map, 'haunches wear the fur map');
  });

  it('plant: stem and foliage, grounded, green leaves', () => {
    const c = creatureFor('Acacia aneura', { sizeM: 5 });
    const g = buildCreatureMesh(c, PLANS);
    const vis = visibleMeshes(g);
    assert.ok(vis.length <= MAX_VISIBLE_PARTS);
    const box = bodyBox(g);
    assert.ok(Math.abs(box.min.y) < 1e-6);
    // At least one mesh wears the shared leaf material (green).
    const leaf = vis.find((m) => m.material.color.getHex() === 0x3f8f3f);
    assert.ok(leaf, 'foliage should be leaf green');
    // No flat blades anywhere: the foliage is volumetric puffs,
    // and every leaf sits in the crown band — nothing at ground
    // level, nothing stabbing into the ground.
    assert.ok(!vis.some((m) => m.geometry.type === 'PlaneGeometry'),
      'a tree must not be built from flat planes');
    const leaves = vis.find((m) => m.isInstancedMesh && m.count === 6
      && m.geometry.type === 'SphereGeometry');
    assert.ok(leaves, 'leaves should be one InstancedMesh of 6 puffs');
    const height = box.max.y - box.min.y;
    for (const p of instanceWorldPositions(leaves)) {
      assert.ok(p.y > 0.5 * height, `leaf at ${p.y} of ${height} — too low`);
    }
  });

  it('conifer: two tiered cones, no sphere stack, pine silhouette', () => {
    const c = creatureFor('Abies alba', { sizeM: 42 }); // clamps to 30 m
    const g = buildCreatureMesh(c, PLANS);
    const vis = visibleMeshes(g);
    assert.equal(vis.length, 4);
    const box = bodyBox(g);
    const height = box.max.y - box.min.y;
    const width = box.max.x - box.min.x;
    // A pine is tall and narrow: the old sphere stack was 18 m
    // wide and 37 m tall; the tiers step inward with height.
    assert.ok(width / height < 0.55, `width/height ${width / height}`);
    assert.ok(height > 25 && height < 30, `height ${height}`);
    const tiers = vis.filter((m) => m.isInstancedMesh
      && m.geometry.type === 'ConeGeometry');
    assert.equal(tiers.length, 2, 'branches + needles, both cones');
    assert.ok(tiers.every((m) => m.count === 8));
    // The lower tier (branches, y ~14.7 m) is wider than the upper
    // (needles, y ~22.8 m): the tiers step inward with height.
    // Both rings share the same centre radius (0.06), so the
    // comparison is on the outer extent — centre radius plus the
    // cone's half-width, from the plan.
    const plan = planForSpecies(PLANS, c);
    const byName = Object.fromEntries(plan.parts.map((p) => [p.name, p]));
    const s = plan.sizeM;
    const tierStats = tiers.map((m) => {
      const ps = instanceWorldPositions(m);
      return {
        y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
        r: Math.max(...ps.map((p) => Math.hypot(p.x, p.z))),
      };
    }).sort((a, b) => a.y - b.y);
    const lowerOuter = tierStats[0].r + (byName.branches.size[0] / 2) * s;
    const upperOuter = tierStats[1].r + (byName.needles.size[0] / 2) * s;
    assert.ok(lowerOuter > upperOuter,
      `tiers must step inward: ${lowerOuter} vs ${upperOuter}`);
    assert.ok(Math.abs(tierStats[0].y - 14.7) < 0.5,
      `lower tier y ${tierStats[0].y}`);
    assert.ok(Math.abs(tierStats[1].y - 22.8) < 0.5,
      `upper tier y ${tierStats[1].y}`);
  });

  it('fungus colony: fruiting bodies ring flat at ground level', () => {
    const c = creatureFor('Archaeorhizomyces borealis', { sizeM: 0.31 });
    const g = buildCreatureMesh(c, PLANS);
    const vis = visibleMeshes(g);
    assert.equal(vis.length, 1);
    const inst = vis[0];
    assert.ok(inst.isInstancedMesh && inst.count === 8);
    const ps = instanceWorldPositions(inst);
    const ys = ps.map((p) => p.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-6,
      'a colony is flat, not a vertical totem');
    assert.ok(ps.every((p) => Math.abs(Math.hypot(p.x, p.z) - 0.068) < 0.01));
    const box = bodyBox(g);
    assert.ok((box.max.y - box.min.y) < 0.3 * (box.max.x - box.min.x),
      'low and wide, not tall and stacked');
  });

  it('a flat plane yawed under YXZ stays flat (the acacia tilt bug)', () => {
    // The acacia's leaf planes were rot.x = -PI/2 with a golden
    // angle yaw; under the default XYZ order the yaw rolled the
    // plane 40-90 degrees. buildPart composes rotations as YXZ:
    // yaw first, then pitch, so the plane stays flat at any yaw.
    for (const yaw of [0, 2.39996, 2 * 2.39996, 4.5]) {
      const e = new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ');
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(
        new THREE.Quaternion().setFromEuler(e));
      assert.ok(Math.abs(n.x) < 1e-9 && Math.abs(n.y - 1) < 1e-9,
        `yaw ${yaw}: normal ${n.toArray()}`);
    }
    // And the old order really does tilt — this pins the regression.
    const bad = new THREE.Euler(-Math.PI / 2, 2.39996, 0, 'XYZ');
    const nb = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion().setFromEuler(bad));
    assert.ok(Math.abs(nb.y - 1) > 0.3, `XYZ normal ${nb.toArray()}`);
  });

  it('shark dorsal fins stay in the midline, vertical', () => {
    const c = creatureFor('Centrophorus isodon', { sizeM: 1, aquatic: true });
    const g = buildCreatureMesh(c, PLANS);
    const vis = visibleMeshes(g);
    // The dorsal fins are the plane InstancedMesh whose instances
    // sit on the midline (pectoral fins are paired across z).
    const dorsal = vis.find((m) => m.isInstancedMesh
      && m.geometry.type === 'PlaneGeometry' && m.count === 2
      && instanceWorldPositions(m).every((p) => Math.abs(p.z) < 1e-9));
    assert.ok(dorsal, 'two dorsal fins, one InstancedMesh');
    const ps = instanceWorldPositions(dorsal);
    assert.ok(new Set(ps.map((p) => p.x.toFixed(3))).size === 2,
      'the two fins spread along the back');
  });

  it('fungus: cap and stipe, grounded', () => {
    const c = creatureFor('Cortinarius carneoroseus', { sizeM: 0.1 });
    const g = buildCreatureMesh(c, PLANS);
    assert.equal(visibleMeshes(g).length, 2);
    const box = bodyBox(g);
    assert.ok(Math.abs(box.min.y) < 1e-6);
  });

  it('coral: polyp, tentacle ring and skeleton', () => {
    const c = creatureFor('Favites abdita', { sizeM: 0.3, aquatic: true });
    const g = buildCreatureMesh(c, PLANS);
    assert.ok(visibleMeshes(g).length <= MAX_VISIBLE_PARTS);
    const ring = visibleMeshes(g).find((m) => m.isInstancedMesh);
    assert.ok(ring && ring.count === 8, '8 tentacles, one InstancedMesh');
  });

  it('hit sphere: present, tagged, world radius max(0.8, size)', () => {
    const small = buildCreatureMesh(
      creatureFor('Acheta domesticus', { sizeM: 0.02 }), PLANS);
    const hit = small.userData.hit;
    assert.ok(hit);
    assert.equal(hit.userData.creatureId, 'test-Acheta-domesticus');
    assert.equal(hit.scale.x, 2 * 0.8); // radius-0.5 sphere -> 0.8 m world
    const big = buildCreatureMesh(
      creatureFor('Aotus zonalis', { sizeM: 5 }), PLANS);
    assert.equal(big.userData.hit.scale.x, 2 * 5);
  });

  it('group scale equals the clamped render size', () => {
    // sizeM 0.005 clamps to 0.05; sizeM 100 clamps to 30.
    const tiny = buildCreatureMesh(
      creatureFor('Acheta domesticus', { sizeM: 0.005 }), PLANS);
    const box = bodyBox(tiny);
    assert.ok(box.max.x - box.min.x > 0.04, 'a 2 cm insect stays visible');
    const huge = buildCreatureMesh(
      creatureFor('Aotus zonalis', { sizeM: 100 }), PLANS);
    const box2 = bodyBox(huge);
    assert.ok(box2.max.x - box2.min.x <= 30 * 1.5 + 1e-6,
      'a 100 m claim clamps to 30 m');
  });

  it('unknown species falls back to a generic, still builds', () => {
    const g = buildCreatureMesh({
      id: 'test-unknown', name: 'No Such Species', kingdom: 'Animalia',
      class: 'Unknown', sizeM: 0.4, flying: false, aquatic: false,
    }, PLANS);
    assert.equal(visibleMeshes(g).length, 2);
    assert.ok(g.userData.hit);
  });

  it('null plans doc falls back to the hand-written plans', () => {
    const g = buildCreatureMesh({
      id: 'test-nodoc', name: 'No Such Species', kingdom: 'Fungi',
      class: 'Unknown', sizeM: 0.2, flying: false, aquatic: false,
    }, null);
    assert.equal(visibleMeshes(g).length, 2);
  });
});

describe('buildCreatureMesh — all 100 templates', () => {
  it('builds for every template id without throwing', () => {
    const templateIds = Object.keys(PLANS.templates);
    assert.equal(templateIds.length, 100);
    // One synthetic species per template, plus the real species
    // that use it — the template map must cover all 100 either way.
    const byTemplate = {};
    for (const [name, rec] of Object.entries(PLANS.plans)) {
      (byTemplate[rec.t] ||= []).push(name);
    }
    let built = 0;
    for (const tid of templateIds) {
      const doc = {
        version: 2, count: 1, templates: PLANS.templates,
        plans: { [`Synthetic ${tid}`]: { t: tid, l: 'template' } },
      };
      const parts = PLANS.templates[tid].parts;
      const kingdom = parts.some((p) => p[0] === 'stem' || p[0] === 'leaves')
        ? 'Plantae'
        : parts.some((p) => p[0] === 'cap' || p[0] === 'stipe')
          ? 'Fungi' : 'Animalia';
      const c = {
        id: `test-template-${tid}`, name: `Synthetic ${tid}`,
        kingdom, class: tid, sizeM: 0.5, flying: false, aquatic: false,
      };
      const g = buildCreatureMesh(c, doc);
      const plan = planForSpecies(doc, c);
      const vis = visibleMeshes(g);
      // A template with no buildable parts (smut_fungus: a parasite
      // with no standalone fruiting body) falls back to one blob.
      // Hindlegged templates grow one extra haunch mesh.
      const expected = plan.parts.length === 0
        ? 1
        : meshCost(plan, false)
          + (plan.parts.some((p) => p.name === 'hindlegs') ? 1 : 0);
      assert.equal(vis.length, expected,
        `${tid}: visible meshes should match the plan's mesh cost`);
      assert.ok(vis.length <= MAX_VISIBLE_PARTS, `${tid}: over budget`);
      assert.ok(g.userData.hit, `${tid}: no hit sphere`);
      const box = bodyBox(g);
      assert.ok(Math.abs(box.min.y) < 1e-6, `${tid}: not grounded`);
      built++;
      // A real species on the same template builds identically.
      for (const name of (byTemplate[tid] || []).slice(0, 1)) {
        const real = creatureFor(name, { sizeM: byName[name].sizeM });
        const rg = buildCreatureMesh(real, PLANS);
        assert.ok(visibleMeshes(rg).length <= MAX_VISIBLE_PARTS, name);
      }
    }
    assert.equal(built, 100);
  });

  it('every catalogue species builds within the envelope', () => {
    let worst = 0;
    let worstName = '';
    for (const s of SPECIES_CATALOGUE) {
      const c = {
        id: `test-${s.name}`, name: s.name, kingdom: s.kingdom,
        class: s.class, sizeM: s.sizeM,
        flying: s.class === 'Aves',
        aquatic: s.env === 'marine' || s.env === 'freshwater',
      };
      const g = buildCreatureMesh(c, PLANS);
      const n = visibleMeshes(g).length;
      if (n > worst) { worst = n; worstName = s.name; }
      assert.ok(n <= MAX_VISIBLE_PARTS, `${s.name}: ${n} meshes`);
      assert.ok(g.userData.hit, `${s.name}: no hit sphere`);
    }
    assert.ok(worst <= MAX_VISIBLE_PARTS, `worst was ${worst} (${worstName})`);
  });
});

describe('CGI pass — the video animal, textures, limbs, alive', () => {
  it('the f_80 animal is a whale, not a green quadruped', () => {
    // Balaenoptera bonaerensis, 8.75 m, at Redwater in the video:
    // the old builder gave it the generic mammal plan (fur, four
    // legs, ears). The cetacean template gives it flippers, a
    // fluke, a dorsal fin and smooth skin — and no legs at all.
    const c = creatureFor('Balaenoptera bonaerensis',
      { sizeM: 8.75, aquatic: true });
    const plan = planForSpecies(PLANS, c);
    assert.equal(plan.template, 'cetacean');
    assert.equal(plan.surface, 'skin');
    const names = plan.parts.map((p) => p.name);
    assert.ok(names.includes('flippers') && names.includes('fluke'));
    assert.ok(names.includes('dorsal fin'));
    assert.ok(!names.includes('forelegs') && !names.includes('hindlegs'));
    assert.ok(!names.includes('ears'));
    const g = buildCreatureMesh(c, PLANS);
    assert.equal(visibleMeshes(g).length, 6);
    // Centred (aquatic), not grounded on the seabed.
    const box = bodyBox(g);
    assert.ok(Math.abs((box.min.y + box.max.y) / 2) < 1e-6);
    // The body wears the skin map, not flat green.
    const bodyMesh = visibleMeshes(g).find((m) => !m.isInstancedMesh);
    assert.ok(bodyMesh.material.map, 'whale body wears a texture map');
    assert.ok(bodyMesh.material.bumpMap, 'whale body wears a bump map');
  });

  it('every visible non-dark mesh wears colour + bump maps', () => {
    for (const name of ['Propithecus deckenii', 'Pterodroma deserta',
      'Anabarilius brevianalis', 'Acheta domesticus']) {
      const g = buildCreatureMesh(creatureFor(name), PLANS);
      const bare = visibleMeshes(g).filter((m) => {
        const hsl = {};
        m.material.color.getHSL(hsl);
        const dark = hsl.l < 0.25;
        return !dark && (!m.material.map || !m.material.bumpMap);
      });
      assert.equal(bare.length, 0, `${name}: ${bare.length} bare meshes`);
    }
  });

  it('the head is an assembly: face parts move with the head group', () => {
    const g = buildCreatureMesh(creatureFor('Propithecus deckenii'), PLANS);
    const head = g.userData.anim.head;
    assert.ok(head, 'head group exists');
    // Eyes, ears and muzzle live inside the head group, not the body.
    const inHead = [];
    head.traverse((o) => { if (o.isMesh || o.isInstancedMesh) inHead.push(o); });
    assert.ok(inHead.length >= 4, `head group holds ${inHead.length} meshes`);
    // A head turn moves the face: yaw the group, the eye instances follow.
    const eyes = g.userData.anim.eyes.mesh;
    const before = instanceWorldPositions(eyes)[0];
    head.rotation.y = 0.5;
    g.updateMatrixWorld(true);
    const after = instanceWorldPositions(eyes)[0];
    assert.ok(before.distanceTo(after) > 0.01,
      'eye instances move when the head turns');
  });

  it('breathing: the chest rises and falls on the real clock', () => {
    const c = creatureFor('Propithecus deckenii');
    const g = buildCreatureMesh(c, PLANS);
    const breath = g.userData.anim.breath;
    assert.ok(breath, 'mammal has a breath mesh');
    const base = breath.base.y;
    const seen = new Set();
    for (let t = 0; t <= 4; t += 0.25) {
      animateCreatureMesh(g, t, 1 / 60, c);
      seen.add(breath.mesh.scale.y.toFixed(4));
    }
    assert.ok(seen.size > 3, 'chest scale varies through breaths');
    assert.ok(Math.abs(breath.mesh.scale.y - base) < base * 0.05,
      'breath is a swell, not a deformation');
  });

  it('breathing rates match Stahl 1967 where it applies', () => {
    // Human scale (70 kg -> ~1.52 m at the animation estimate):
    // Stahl says ~18 breaths/min.
    const human = breathingRateBpm({ class: 'Mammalia', sizeM: 1.52 });
    assert.ok(human > 15 && human < 21, `human ${human}`);
    // A 0.98 m lemur (~19 kg) breathes ~25/min; an 8.75 m whale
    // (~13,400 kg) breathes ~4.5/min.
    const lemur = breathingRateBpm({ class: 'Mammalia', sizeM: 0.98 });
    assert.ok(lemur > 22 && lemur < 28, `lemur ${lemur}`);
    const whale = breathingRateBpm({ class: 'Mammalia', sizeM: 8.75 });
    assert.ok(whale > 3.5 && whale < 5.5, `whale ${whale}`);
    assert.ok(strideFrequencyHz({ sizeM: 0.98 }) > 1
      && strideFrequencyHz({ sizeM: 0.98 }) < 2.5, 'lemur stride Hz sane');
  });

  it('gait: leg matrices swing in sequence, body bobs', () => {
    const c = creatureFor('Propithecus deckenii');
    const g = buildCreatureMesh(c, PLANS);
    const limb = g.userData.anim.limbs[0];
    assert.ok(limb, 'mammal has a limb part');
    const m = new THREE.Matrix4();
    const read = (i) => {
      limb.mesh.getMatrixAt(i * 2, m);
      return [m.elements[12], m.elements[13]];
    };
    animateCreatureMesh(g, 0, 1 / 60, c);
    const p0 = read(0);
    animateCreatureMesh(g, 0.4, 1 / 60, c);
    const p1 = read(0);
    assert.ok(Math.abs(p0[0] - p1[0]) > 1e-4 || Math.abs(p0[1] - p1[1]) > 1e-4,
      'the foreleg swings between frames');
    // The two forelegs are out of phase (lateral sequence).
    animateCreatureMesh(g, 0.2, 1 / 60, c);
    const a = read(0);
    const b = read(1);
    assert.ok(Math.abs(a[0] - b[0]) > 1e-4, 'left and right forelegs differ');
    // Body bob: the inner group's Y moves with the stride (a
    // quarter bob-period later the bob has swung the other way).
    const y0 = g.userData.anim.body.position.y;
    animateCreatureMesh(g, 0.275, 1 / 60, c);
    const y1 = g.userData.anim.body.position.y;
    assert.ok(Math.abs(y0 - y1) > 0.001, 'body bobs');
  });

  it('blinking: eyes narrow for ~120 ms, then restore', () => {
    const c = creatureFor('Propithecus deckenii');
    const g = buildCreatureMesh(c, PLANS);
    const eyes = g.userData.anim.eyes;
    assert.ok(eyes, 'mammal has blinkable eyes');
    eyes.blink.next = 0.05;
    animateCreatureMesh(g, 0.06, 1 / 60, c);
    const m = new THREE.Matrix4();
    eyes.mesh.getMatrixAt(0, m);
    const shut = new THREE.Vector3().setFromMatrixScale(m).y;
    assert.ok(shut < eyes.size[1] * 0.5, `eyes shut to ${shut}`);
    animateCreatureMesh(g, 0.5, 1 / 60, c);
    eyes.mesh.getMatrixAt(0, m);
    const open = new THREE.Vector3().setFromMatrixScale(m).y;
    assert.ok(Math.abs(open - eyes.size[1]) < 1e-6, 'eyes restore');
  });

  it('phase is deterministic: same spawn, same look', () => {
    const a = buildCreatureMesh(creatureFor('Aotus zonalis'), PLANS);
    const b = buildCreatureMesh(creatureFor('Aotus zonalis'), PLANS);
    assert.equal(a.userData.phase, b.userData.phase);
    assert.equal(a.userData.meshCount, b.userData.meshCount);
    assert.deepEqual(bodyBox(a), bodyBox(b));
  });
});
