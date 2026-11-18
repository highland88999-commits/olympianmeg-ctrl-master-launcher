// Flying Dutchman world3d smoke tests (Merlin, Nov 18, 2026 — Wave 5).
// createIslands/createChests build real THREE objects, so the only
// headless guard is to CALL them in node with a minimal document stub
// for the canvas textures. This file exists because the wave-5 sync()
// refactor dropped the per-island `ig` declaration and NOTHING caught
// it — not tsc (no .jsx/.js coverage of that kind), not esbuild, not
// the source-pin tests. The probe caught it instead (ReferenceError:
// ig is not defined on SOLO VOYAGE). Never again: every world3d
// builder gets a call test.
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal document stub: canvas textures only need a 2d context whose
// methods no-op. Installed BEFORE importing world3d.js.
if (typeof globalThis.document === 'undefined') {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set() { return true; },
  });
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`stub: unexpected element ${tag}`);
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
}

const { createIslands, createChests } = await import('../app/flying-dutchman/world3d.js');
const engine = await import('../app/flying-dutchman/engine.js');

function fakeScene() {
  return { children: [], add(g) { this.children.push(g); } };
}

test('createIslands builds the home 8 without throwing', () => {
  const world = engine.makeWorld(4242);
  assert.equal(world.islands.length, 8);
  const scene = fakeScene();
  const api = createIslands(scene, world.islands);
  assert.ok(api.group, 'api exposes the island group');
  assert.equal(scene.children.length, 1, 'the group is added to the scene');
  assert.ok(api.group.children.length >= 8, `home isles built (children: ${api.group.children.length})`);
  assert.doesNotThrow(() => api.update(1, 0.5), 'update(t, nightF) runs');
});

test('islands.sync streams far islands in and back out', () => {
  const world = engine.makeWorld(4242);
  const scene = fakeScene();
  const api = createIslands(scene, world.islands);
  const homeCount = api.group.children.length;
  engine.ensureFarIslands(world, 3000, 0);
  assert.ok(world.farIslands.length > 0, 'far isles generated');
  const all = engine.allIslands(world);
  api.sync(all);
  assert.ok(api.group.children.length > homeCount, `far isles added (${homeCount} -> ${api.group.children.length})`);
  const grown = api.group.children.length;
  api.sync(all);
  assert.equal(api.group.children.length, grown, 'sync is idempotent — no duplicate meshes');
  api.sync(world.islands);
  assert.equal(api.group.children.length, homeCount, 'sync drops far isles when the list shrinks to home');
  assert.doesNotThrow(() => api.update(2, 0.5), 'update still runs after streaming');
});

test('createChests builds home chests and streams far chests', () => {
  const world = engine.makeWorld(4242);
  engine.ensureFarIslands(world, 3000, 0);
  const scene = fakeScene();
  const api = createChests(scene, world.chests);
  assert.ok(api, 'chest api returned');
  const farChest = world.farIslands.length
    ? engine.farChestsForIsland(world.farIslands[0])[0]
    : null;
  if (farChest) {
    assert.doesNotThrow(() => api.sync([...world.chests, farChest], 0), 'far chest sync builds its mesh');
  }
});
