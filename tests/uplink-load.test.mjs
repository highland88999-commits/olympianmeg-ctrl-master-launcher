// tests/uplink-load.test.mjs
// ASSET UPLINK LOADS THE LINKED MODEL (GAP 4, Merlin 2026-11-15):
// pasting a .glb URL in the Uplink previews the linked model itself
// (three's GLTFLoader, in MiniViewport), the plain box stays as the
// loading / failed / no-URL placeholder with a plain-words line, and
// the pasted URL reaches the store so the preview needs no synthesis
// round-trip.
//
// Run: node --test tests/uplink-load.test.mjs (from the repo root)
//
// HONEST BOUNDARY: the live GLB load itself cannot run in Node —
// GLTFLoader fetches over the network and renders in a browser
// canvas — so Node covers the pure parts (URL gating, preview-state
// logic, scale, grounding) plus source-level wiring pins, and the
// real load is proven by Merlin's phone check after push with a real
// GLB URL. Verified live (HEAD, no download) at write time:
//   https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Binary/Box.glb
//   — 200, Access-Control-Allow-Origin: *, 1,664 bytes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  UPLINK_LOAD_TIMEOUT_MS,
  applyUplinkScale,
  groundUplinkModel,
  isLoadableAssetUrl,
  uplinkPreviewState,
} from '../lib/world-engine/uplink-load.js';

const BOX_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Binary/Box.glb';

describe('isLoadableAssetUrl — GLB only, honest scope', () => {
  it('accepts a plain https .glb URL', () => {
    assert.equal(isLoadableAssetUrl(BOX_URL), true);
    assert.equal(isLoadableAssetUrl('http://example.com/model.glb'), true);
  });

  it('accepts uppercase .GLB and a query string / fragment after it', () => {
    assert.equal(isLoadableAssetUrl('https://example.com/MODEL.GLB'), true);
    assert.equal(isLoadableAssetUrl('https://example.com/model.glb?v=2'), true);
    assert.equal(isLoadableAssetUrl('https://example.com/model.glb#part'), true);
  });

  it('refuses anything that is not an http(s) .glb URL', () => {
    assert.equal(isLoadableAssetUrl('https://example.com/model.gltf'), false);
    assert.equal(isLoadableAssetUrl('https://example.com/model.fbx'), false);
    assert.equal(isLoadableAssetUrl('https://example.com/model.obj'), false);
    assert.equal(isLoadableAssetUrl('https://example.com/model.png'), false);
    assert.equal(isLoadableAssetUrl('ftp://example.com/model.glb'), false);
    assert.equal(isLoadableAssetUrl('/models/local.glb'), false);
    assert.equal(isLoadableAssetUrl('procedural_generation'), false);
    assert.equal(isLoadableAssetUrl(''), false);
    assert.equal(isLoadableAssetUrl('   '), false);
    assert.equal(isLoadableAssetUrl(null), false);
    assert.equal(isLoadableAssetUrl(undefined), false);
    assert.equal(isLoadableAssetUrl(42), false);
  });

  it('refuses URLs over the 500-char cap (gemini.js validateSynthesizeInput)', () => {
    assert.equal(isLoadableAssetUrl(`https://example.com/${'a'.repeat(490)}.glb`), false);
    assert.equal(isLoadableAssetUrl(`https://example.com/${'a'.repeat(470)}.glb`), true);
  });

  it('a load that hangs is capped, not endless', () => {
    assert.equal(typeof UPLINK_LOAD_TIMEOUT_MS, 'number');
    assert.ok(UPLINK_LOAD_TIMEOUT_MS > 0);
  });
});

describe('uplinkPreviewState — placeholder vs loaded model, plain words', () => {
  it('other categories are untouched: box, no line, whatever the URL', () => {
    for (const category of ['object', 'weapon', 'character', 'vehicle', 'world', 'weather']) {
      assert.deepEqual(
        uplinkPreviewState({ category, url: BOX_URL, loadStatus: 'loading' }),
        { mode: 'box', statusLine: null },
      );
    }
  });

  it('no URL pasted: box, no line — never a nag', () => {
    assert.deepEqual(
      uplinkPreviewState({ category: 'asset_link', url: '', loadStatus: 'idle' }),
      { mode: 'box', statusLine: null },
    );
    assert.deepEqual(
      uplinkPreviewState({ category: 'asset_link', url: undefined, loadStatus: 'idle' }),
      { mode: 'box', statusLine: null },
    );
  });

  it('a pasted URL that is not a loadable .glb: box + plain-words line', () => {
    const state = uplinkPreviewState({ category: 'asset_link', url: 'https://example.com/model.gltf', loadStatus: 'idle' });
    assert.equal(state.mode, 'box');
    assert.match(state.statusLine, /\.glb/);
  });

  it('loading: box + "Loading linked model…"', () => {
    assert.deepEqual(
      uplinkPreviewState({ category: 'asset_link', url: BOX_URL, loadStatus: 'loading' }),
      { mode: 'box', statusLine: 'Loading linked model…' },
    );
  });

  it('loaded: model, no line', () => {
    assert.deepEqual(
      uplinkPreviewState({ category: 'asset_link', url: BOX_URL, loadStatus: 'loaded' }),
      { mode: 'model', statusLine: null },
    );
  });

  it('failed (404 / CORS block / bad file): box + plain-words line, never a crash', () => {
    const state = uplinkPreviewState({ category: 'asset_link', url: BOX_URL, loadStatus: 'failed' });
    assert.equal(state.mode, 'box');
    assert.match(state.statusLine, /Could not load that link/);
  });
});

describe('applyUplinkScale — the Import scale slider on the loaded model', () => {
  it('applies the {x, y, z} triple', () => {
    const group = new THREE.Group();
    assert.equal(applyUplinkScale(group, { x: 2, y: 0.5, z: 3 }), group);
    assert.deepEqual([group.scale.x, group.scale.y, group.scale.z], [2, 0.5, 3]);
  });

  it('defaults a missing scale (or missing axis) to 1', () => {
    const group = new THREE.Group();
    applyUplinkScale(group, undefined);
    assert.deepEqual([group.scale.x, group.scale.y, group.scale.z], [1, 1, 1]);
    applyUplinkScale(group, { x: 4 });
    assert.deepEqual([group.scale.x, group.scale.y, group.scale.z], [4, 1, 1]);
  });

  it('clamps to the slider range 0.1–10', () => {
    const group = new THREE.Group();
    applyUplinkScale(group, { x: 50, y: 0, z: -3 });
    assert.deepEqual([group.scale.x, group.scale.y, group.scale.z], [10, 0.1, 0.1]);
  });
});

describe('groundUplinkModel — a linked model stands where the box stood', () => {
  it('rests the lowest point on y = 0 and centres X/Z over the origin', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(3, 5, -2); // floating, off-centre, as a linked file may arrive
    groundUplinkModel(THREE, mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    assert.ok(Math.abs(box.min.y) < 1e-6, `min.y should be 0, got ${box.min.y}`);
    const center = box.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(center.x) < 1e-6, `centre.x should be 0, got ${center.x}`);
    assert.ok(Math.abs(center.z) < 1e-6, `centre.z should be 0, got ${center.z}`);
  });

  it('leaves an empty object alone', () => {
    const group = new THREE.Group();
    assert.equal(groundUplinkModel(THREE, group), group);
    assert.deepEqual([group.position.x, group.position.y, group.position.z], [0, 0, 0]);
  });
});

describe('the wiring — source-level pins', () => {
  it('MiniViewport loads the GLB lazily (GLTFLoader, dynamic import) and swaps it in', () => {
    const viewport = readFileSync('components/world-engine/MiniViewport.jsx', 'utf8');
    assert.ok(viewport.includes("await import('three/examples/jsm/loaders/GLTFLoader.js')"), 'lazy GLTFLoader import');
    assert.ok(viewport.includes('loadAsync'), 'async load, never a sync block');
    assert.ok(viewport.includes('isLoadableAssetUrl'), 'load is gated on a loadable URL');
    assert.ok(viewport.includes('uplinkPreviewState'), 'the plain-words state line is rendered');
    assert.ok(viewport.includes('preview.statusLine'), 'the line is rendered from the shared preview state');
    assert.ok(viewport.includes('UPLINK_LOAD_TIMEOUT_MS'), 'hung fetches are capped');
    assert.ok(viewport.includes('applyUplinkScale'), 'the scale slider applies to the loaded model');
    assert.ok(viewport.includes('groundUplinkModel'), 'the loaded model is grounded');
    assert.ok(viewport.includes('buildCreationMesh'), 'the placeholder box still comes from the shared builder');
    const lib = readFileSync('lib/world-engine/uplink-load.js', 'utf8');
    assert.ok(lib.includes('Loading linked model…'), 'loading line lives in the shared state helper');
    assert.ok(lib.includes('Could not load that link'), 'failure line lives in the shared state helper');
  });

  it('ForgeSector wires the pasted Asset URL into the store (no synthesis round-trip)', () => {
    const forge = readFileSync('components/world-engine/ForgeSector.jsx', 'utf8');
    assert.ok(forge.includes("if (category === 'asset_link') setParams({ url: next })"), 'onChange writes the URL to the store slice');
    assert.ok(forge.includes('useEngineStore.getState()[config.storeKey]?.url'), 'the field rehydrates from the persisted store slice');
    assert.ok(forge.includes('<MiniViewport category={category} params={params} />'), 'the preview still receives the store params');
  });

  it('buildCreationMesh keeps its sync contract — the loader lives in the viewport, not the builder', () => {
    const mesh = readFileSync('lib/world-engine/creation-mesh.js', 'utf8');
    assert.equal(mesh.includes('GLTFLoader'), false, 'no loader in the shared builder');
    assert.equal(mesh.includes('loadAsync'), false, 'no async load in the shared builder');
    assert.ok(mesh.includes("case 'asset_link':"), 'the asset_link case still exists');
    assert.ok(mesh.includes('BoxGeometry(p.scale?.x || 1, p.scale?.y || 1, p.scale?.z || 1)'), 'the placeholder box is unchanged');
    assert.ok(mesh.includes("case 'object':"), 'the object builder box is exactly as-is');
  });
});
