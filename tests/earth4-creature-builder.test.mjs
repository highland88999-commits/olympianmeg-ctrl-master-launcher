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
  buildCreatureMesh, CREATURE_SHARED_GEOMETRIES, placeInstances,
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
  it('insect: 6 visible meshes, feet on the ground', () => {
    const c = creatureFor('Acheta domesticus', { sizeM: 0.02 });
    const g = buildCreatureMesh(c, PLANS);
    const vis = visibleMeshes(g);
    assert.equal(vis.length, 6);
    const box = bodyBox(g);
    assert.ok(Math.abs(box.min.y) < 1e-6, `min.y ${box.min.y}`);
    // The whole creature is a visible speck: sizeM 0.02 clamps to
    // the 0.05 m render minimum, so ~1 body unit reads as ~5 cm.
    assert.ok(box.max.x - box.min.x < 0.06);
    assert.ok(box.max.x - box.min.x > 0.04);
    // One InstancedMesh carries the 6 legs; every mesh shares
    // geometry and material with the module, nothing per-creature.
    const legs = vis.find((m) => m.isInstancedMesh && m.count === 6);
    assert.ok(legs, 'legs should be one InstancedMesh of 6');
    assert.ok(CREATURE_SHARED_GEOMETRIES.has(legs.geometry));
  });

  it('flying bird: two flap wing meshes, phase set, 6 meshes total', () => {
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
    assert.equal(visibleMeshes(g).length, 6);
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
    assert.equal(visibleMeshes(g).length, 6);
    const box = bodyBox(g);
    assert.ok(Math.abs((box.min.y + box.max.y) / 2) < 1e-6);
  });

  it('mammal: body, head, four legs, eyes; grounded', () => {
    const c = creatureFor('Aotus zonalis', { sizeM: 0.5 });
    const g = buildCreatureMesh(c, PLANS);
    assert.equal(visibleMeshes(g).length, 6);
    const box = bodyBox(g);
    assert.ok(Math.abs(box.min.y) < 1e-6);
    const legs = visibleMeshes(g).filter((m) => m.isInstancedMesh);
    // Forelegs and hindlegs are separate part-groups (one
    // InstancedMesh each, 2 instances apiece); eyes are a third.
    assert.equal(legs.length, 3);
    assert.deepEqual(legs.map((m) => m.count).sort(), [2, 2, 2]);
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
    // body-coloured. The eyes are the sphere InstancedMesh of 2.
    const eyes = legs.find((m) => m.geometry.type === 'SphereGeometry');
    assert.ok(eyes, 'eyes should be one InstancedMesh of 2');
    const hsl = {};
    eyes.material.color.getHSL(hsl);
    assert.ok(hsl.l < 0.25, `eyes must be dark, lightness ${hsl.l}`);
    assert.notEqual(eyes.material,
      visibleMeshes(g).find((m) => !m.isInstancedMesh).material);
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

describe('buildCreatureMesh — all 99 templates', () => {
  it('builds for every template id without throwing', () => {
    const templateIds = Object.keys(PLANS.templates);
    assert.equal(templateIds.length, 99);
    // One synthetic species per template, plus the real species
    // that use it — the template map must cover all 99 either way.
    const byTemplate = {};
    for (const [name, rec] of Object.entries(PLANS.plans)) {
      (byTemplate[rec.t] ||= []).push(name);
    }
    let built = 0;
    for (const tid of templateIds) {
      const doc = {
        version: 1, count: 1, templates: PLANS.templates,
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
      const expected = plan.parts.length === 0 ? 1 : meshCost(plan, false);
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
    assert.equal(built, 99);
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
