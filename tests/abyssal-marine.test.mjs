// Marine life (Merlin, 2026-10-29): rigged sea creatures swim with
// natural motion — tail undulation for fish, bell pulse for jellyfish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATURES, classifyBones, Swimmer } from '../app/abyssal-voyage/marine.js';

test('registry covers every creature Merlin named', () => {
  const ids = CREATURES.map((c) => c.id);
  for (const want of ['jellyfish', 'shark', 'blue-tang', 'tuna', 'anglerfish', 'clownfish', 'reef-fish', 'blue-whale']) {
    assert.ok(ids.includes(want), `missing ${want}`);
  }
});

test('every creature has a swim style, depth band, and file', () => {
  for (const c of CREATURES) {
    assert.ok(c.file.endsWith('-rigged.glb'), `${c.id} file`);
    assert.ok(c.style, `${c.id} style`);
    assert.ok(c.depth[0] < c.depth[1], `${c.id} depth band`);
    assert.ok(c.count > 0, `${c.id} count`);
  }
});

test('deep creatures live deep, shallow creatures live shallow', () => {
  const byId = Object.fromEntries(CREATURES.map((c) => [c.id, c]));
  assert.ok(byId['anglerfish'].depth[0] >= 4000, 'anglerfish is deep');
  assert.ok(byId['clownfish'].depth[0] >= 7000, 'clownfish at the reef');
  assert.ok(byId['tuna'].depth[1] <= 3000, 'tuna stays upper');
});

test('classifyBones sorts tail chains root-to-tip', () => {
  // fake bone hierarchy: root -> tail1 -> tail2
  const mk = (name) => ({ name, isBone: true, parent: null, children: [], traverse(f) { f(this); this.children.forEach((c) => c.traverse(f)); } });
  const root = mk('root'); const t1 = mk('tail_01'); const t2 = mk('tail_02');
  t1.parent = root; t2.parent = t1; root.children.push(t1); t1.children.push(t2);
  const c = classifyBones(root);
  assert.deepEqual(c.tail.map((b) => b.name), ['tail_01', 'tail_02']);
});

test('swimmer tail undulation grows toward the tip', () => {
  const mk = (name) => ({
    name, isBone: true, parent: null, children: [], rotation: { x: 0, y: 0, z: 0 },
    traverse(f) { f(this); this.children.forEach((c) => c.traverse(f)); },
  });
  const root = mk('hips'); const t1 = mk('tail1'); const t2 = mk('tail2'); const t3 = mk('tail3');
  t1.parent = root; t2.parent = t1; t3.parent = t2;
  root.children.push(t1); t1.children.push(t2); t2.children.push(t3);
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fakeObj = { visible: true, position: { set() {} }, rotation: { y: 0 }, scale: { set() {}, setScalar() {} }, traverse: root.traverse.bind(root) };
  const sw = new Swimmer(fakeObj, { id: 't', style: 'fish', depth: [0, 99999], scale: 1 }, rng);
  sw.update(1.0, 0.016, 500);
  const amps = [t1, t2, t3].map((b) => Math.abs(b.rotation.y));
  assert.ok(amps[0] < amps[1] && amps[1] < amps[2], `undulation grows to tip: ${amps}`);
});
