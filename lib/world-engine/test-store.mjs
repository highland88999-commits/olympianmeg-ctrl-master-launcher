// Headless tests: engine store defaults, setters, apply/reset (zustand/vanilla).
//
// zustand/persist needs localStorage; we stub a tiny in-memory version so the
// store logic can run under plain node.
globalThis.localStorage = (() => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
})();

import { register } from 'node:module';
register('./zustand-hooks.mjs', import.meta.url);

import assert from 'node:assert/strict';
const { useEngineStore } = await import('./useEngineStore.js');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
};

test('world defaults match the documented shape', () => {
  const w = useEngineStore.getState().world;
  assert.equal(w.sunColor, '#ffffff');
  assert.equal(w.terrainType, 'plains');
  assert.equal(w.weatherType, 'clear');
  assert.equal(typeof w.objectDensity, 'number');
});

test('setWorldParams merges without wiping other keys', () => {
  useEngineStore.getState().setWorldParams({ weatherType: 'storm' });
  const w = useEngineStore.getState().world;
  assert.equal(w.weatherType, 'storm');
  assert.equal(w.sunColor, '#ffffff');
});

test('setObjectDimensions deep-merges nested scale', () => {
  useEngineStore.getState().setObjectDimensions({ scale: { x: 3 } });
  const o = useEngineStore.getState().object;
  assert.equal(o.scale.x, 3);
  assert.equal(o.scale.y, 1); // untouched nested key survives
});

test('applySynthesizedParams routes by module key', () => {
  useEngineStore.getState().applySynthesizedParams('weapon', { damage: 42 });
  assert.equal(useEngineStore.getState().weapon.damage, 42);
  useEngineStore.getState().applySynthesizedParams('asset_link', { url: 'https://x/a.glb' });
  assert.equal(useEngineStore.getState().assetLink.url, 'https://x/a.glb');
});

test('resetModule restores defaults', () => {
  useEngineStore.getState().resetModule('world');
  assert.equal(useEngineStore.getState().world.weatherType, 'clear');
});

console.log(`\n${passed} store tests passed.`);
