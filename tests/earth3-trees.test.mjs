// EARTH 3 — REAL TREES (Merlin, 2026-11-14): the tree roster
// comes from Earth 2's registry, species picks are deterministic
// per placement index, normalize fits by height with the base at
// y = 0, and planting seats trees at ground − 0.1 m with a
// procedural fallback when a GLB fails to load.
//
// Run: node --test tests/earth3-trees.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';

import {
  TREE_SPECIES,
  TREE_SLUGS,
  ISLAND_TREE_SLUGS,
  treeSpeciesForIndex,
  islandTreeSpeciesForIndex,
  normalizeTreeModel,
  makePlaceholderTree,
  plantTrees,
} from '../lib/earth3/trees.js';
import { EARTH2_MODEL_BY_SLUG } from '../lib/earth2/models.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicPath = (file) => path.join(repoRoot, 'public', file.replace(/^\//, ''));

// A fake GLB scene: a 2 x 4 x 2 box standing on y = 0.
function fakeModelScene() {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshStandardMaterial());
  mesh.position.y = 2;
  g.add(mesh);
  return g;
}

describe('earth3 trees — the cast', () => {
  it('is exactly Earth 2\'s tall native plants, nothing invented', () => {
    assert.deepEqual([...TREE_SLUGS].sort(), [
      'araucaria',
      'giant-conifer',
      'ginkgo-tree',
      'magnolia',
      'tree-fern',
    ]);
    for (const s of TREE_SPECIES) {
      const reg = EARTH2_MODEL_BY_SLUG.get(s.slug);
      assert.ok(reg, `${s.slug} is in Earth 2's registry`);
      assert.equal(s.file, reg.file);
      assert.equal(s.scaleM, reg.scaleM);
      assert.equal(s.scaleBasis, 'height');
      assert.ok(s.scaleM >= 8, `${s.slug} is tall enough to be a tree`);
    }
  });

  it('every tree GLB exists on disk and is a real glTF file', () => {
    for (const s of TREE_SPECIES) {
      const p = publicPath(s.file);
      assert.ok(existsSync(p), `${s.file} exists`);
      assert.equal(readFileSync(p).subarray(0, 4).toString('ascii'), 'glTF', `${s.file} has a glTF magic`);
    }
  });

  it('island trees are the two smallest real trees', () => {
    assert.deepEqual(ISLAND_TREE_SLUGS, ['tree-fern', 'magnolia']);
    for (const slug of ISLAND_TREE_SLUGS) {
      assert.ok(TREE_SLUGS.includes(slug), `${slug} is a real tree`);
    }
    const heights = ISLAND_TREE_SLUGS.map((slug) => TREE_SPECIES.find((s) => s.slug === slug).scaleM);
    assert.deepEqual(heights, [8, 10]);
    const tallest = Math.max(...heights);
    const shortestOther = Math.min(...TREE_SPECIES.filter((s) => !ISLAND_TREE_SLUGS.includes(s.slug)).map((s) => s.scaleM));
    assert.ok(tallest < shortestOther, 'island trees are smaller than every other tree');
  });
});

describe('earth3 trees — species picks', () => {
  it('is deterministic per index and covers all five species', () => {
    for (let i = 0; i < 200; i++) {
      assert.equal(treeSpeciesForIndex(i).slug, treeSpeciesForIndex(i).slug);
    }
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(treeSpeciesForIndex(i).slug);
    assert.deepEqual([...seen].sort(), [...TREE_SLUGS].sort());
  });

  it('island picks alternate only between the two small trees', () => {
    for (let i = 0; i < 20; i++) {
      assert.ok(ISLAND_TREE_SLUGS.includes(islandTreeSpeciesForIndex(i).slug));
      assert.equal(islandTreeSpeciesForIndex(i).slug, islandTreeSpeciesForIndex(i).slug);
    }
  });
});

describe('earth3 trees — normalize (Earth 2 native-plant law)', () => {
  it('fits by height, centres X/Z, base at y = 0', () => {
    const entry = { slug: 'test-tree', scaleM: 8, scaleBasis: 'height' };
    const spin = normalizeTreeModel(fakeModelScene(), entry);
    const box = new THREE.Box3().setFromObject(spin);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(size.y - 8) < 0.001, `height is 8, got ${size.y}`);
    assert.ok(Math.abs(box.min.y) < 0.001, `base sits at y = 0, got ${box.min.y}`);
    assert.ok(Math.abs(center.x) < 0.001 && Math.abs(center.z) < 0.001, 'centred on X/Z');
  });

  it('a zero-extent model does not divide by zero', () => {
    const empty = new THREE.Group();
    const spin = normalizeTreeModel(empty, { slug: 'empty', scaleM: 8, scaleBasis: 'height' });
    assert.ok(spin instanceof THREE.Group);
  });
});

describe('earth3 trees — planting', () => {
  const placements = [
    { x: 10, z: -5, scale: 1, heading: 0.5 },
    { x: -20, z: 30, scale: 1.5, heading: 2.1 },
    { x: 40, z: 40, scale: 0.8, heading: 4.0 },
  ];

  it('plants one clone per placement, seated at ground − 0.1 m', async () => {
    const scene = new THREE.Scene();
    const handle = plantTrees({
      parent: scene,
      placements,
      loadModel: async () => fakeModelScene(),
    });
    const result = await handle.done;
    assert.deepEqual(result, { placed: 3, fallback: 0, failed: [] });
    assert.equal(handle.group.children.length, 3);
    for (let i = 0; i < 3; i++) {
      const tree = handle.group.children[i];
      assert.equal(tree.position.x, placements[i].x);
      assert.equal(tree.position.z, placements[i].z);
      assert.ok(Math.abs(tree.position.y - (-0.1)) < 1e-9, 'base bury is 0.1 m');
      assert.equal(tree.rotation.y, placements[i].heading);
      assert.equal(tree.scale.x, placements[i].scale);
    }
    // Each clone stands at its own species' real height: whatever
    // species index 1 drew, at scale 1.5.
    const expected = treeSpeciesForIndex(1).scaleM * 1.5;
    const box = new THREE.Box3().setFromObject(handle.group.children[1]);
    assert.ok(Math.abs(box.getSize(new THREE.Vector3()).y - expected) < 0.01);
  });

  it('a failed GLB grows the procedural placeholder instead of a hole', async () => {
    const scene = new THREE.Scene();
    const handle = plantTrees({
      parent: scene,
      placements,
      loadModel: async () => { throw new Error('404'); },
    });
    const result = await handle.done;
    assert.equal(result.placed, 0);
    assert.equal(result.fallback, 3);
    assert.equal(handle.group.children.length, 3);
    assert.ok(result.failed.length > 0, 'failed slugs are reported');
    assert.ok(result.failed.every((slug) => TREE_SLUGS.includes(slug)));
  });

  it('cancel() stops late loads adding trees after destroy', async () => {
    const scene = new THREE.Scene();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const handle = plantTrees({
      parent: scene,
      placements,
      loadModel: async () => { await gate; return fakeModelScene(); },
    });
    handle.cancel();
    release();
    await handle.done;
    assert.equal(handle.group.children.length, 0);
  });

  it('the placeholder stands on its base like the old tree did', () => {
    const tree = makePlaceholderTree();
    const box = new THREE.Box3().setFromObject(tree);
    assert.ok(Math.abs(box.min.y) < 0.001, 'placeholder base at y = 0');
    assert.ok(box.getSize(new THREE.Vector3()).y > 5, 'placeholder is tree-sized');
  });
});
