// tests/creation-download.test.mjs
// CREATION DOWNLOADS (Merlin, 2026-11-15): one Download button
// per asset card in My Creations, same button and same behaviour
// in every category. A stored file/GLB URL saves as-is; a
// params-only asset downloads as a .zip (data file + rebuilt GLB).
//
// Run: node --test tests/creation-download.test.mjs (from the repo root)
//
// HONEST BOUNDARY: the GLB export for world / character / weapon /
// vehicle / object needs a browser canvas (document) — the Omega
// badge and the world textures are canvas textures — so those
// five categories export on the phone, not in Node. The weather
// export below is the end-to-end proof the pipeline produces a
// real GLB + a real zip; the other five are covered by the shared
// mesh builder (the preview and the download build from the same
// buildCreationMesh — pinned by the wiring test) and by the phone
// check once pushed.
//
// FileReader shim (test-only): this Node has Blob but no
// FileReader, and three's GLTFExporter reads its binary GLB back
// through FileReader (onloadend). The shim reads Blobs with
// arrayBuffer(), which Node does have.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onload = null;
      this.onerror = null;
    }
    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        if (typeof this.onloadend === 'function') this.onloadend({ target: this });
        if (typeof this.onload === 'function') this.onload({ target: this });
      } catch (err) {
        if (typeof this.onerror === 'function') this.onerror(err);
      }
    }
    async readAsDataURL(blob) {
      try {
        const buf = Buffer.from(await blob.arrayBuffer());
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${buf.toString('base64')}`;
        if (typeof this.onloadend === 'function') this.onloadend({ target: this });
        if (typeof this.onload === 'function') this.onload({ target: this });
      } catch (err) {
        if (typeof this.onerror === 'function') this.onerror(err);
      }
    }
  };
}

import {
  CREATION_BUNDLE_FORMAT,
  creationBundle,
  creationSlug,
  exportCreationGlb,
  exportCreationZip,
  isExternalFileUrl,
} from '../lib/world-engine/creation-download.js';
import { buildCreationMesh } from '../lib/world-engine/creation-mesh.js';

describe('isExternalFileUrl', () => {
  it('a real file URL is a file; the procedural marker is not', () => {
    assert.equal(isExternalFileUrl('https://example.com/model.glb'), true);
    assert.equal(isExternalFileUrl('http://example.com/sky.png'), true);
    assert.equal(isExternalFileUrl('procedural_generation'), false);
    assert.equal(isExternalFileUrl('/models/weapons/revolver.glb'), false);
    assert.equal(isExternalFileUrl(null), false);
    assert.equal(isExternalFileUrl(undefined), false);
  });
});

describe('creationSlug', () => {
  it('slugs the display name, and falls back to the id', () => {
    assert.equal(creationSlug({ display_name: 'My Cool World!' }), 'my-cool-world');
    assert.equal(creationSlug({ display_name: '  ' , id: 'abc12345' }), 'creation-abc12345');
    assert.equal(creationSlug({}), 'creation');
    assert.equal(creationSlug({ display_name: 'A'.repeat(100) }).length <= 60, true);
  });
});

describe('creationBundle', () => {
  it('carries everything needed to re-forge the asset, per category', () => {
    for (const category of ['world', 'character', 'weapon', 'vehicle', 'weather', 'object']) {
      const bundle = creationBundle({
        id: 'a1',
        display_name: 'Test ' + category,
        category,
        prompt: 'make a ' + category,
        asset_url: 'procedural_generation',
        seed: category === 'world' ? 'seed-7' : null,
        generation_params: { theme: 'gold' },
        created_at: '2026-11-15T00:00:00.000Z',
      });
      assert.equal(bundle.format, CREATION_BUNDLE_FORMAT);
      assert.equal(bundle.category, category);
      assert.equal(bundle.prompt, 'make a ' + category);
      assert.deepEqual(bundle.generation_params, { theme: 'gold' });
      assert.equal(bundle.asset_url, 'procedural_generation');
      assert.equal(bundle.seed, category === 'world' ? 'seed-7' : null);
    }
  });

  it('keeps an external asset_url so the file downloads as-is', () => {
    const bundle = creationBundle({ display_name: 'Uplink', category: 'object', asset_url: 'https://example.com/thing.glb' });
    assert.equal(bundle.asset_url, 'https://example.com/thing.glb');
  });
});

describe('the GLB export (weather — the one category that builds in Node)', () => {
  it('exports a real binary GLB with the glTF magic', async () => {
    const glb = await exportCreationGlb('weather', { type: 'rain' });
    assert.ok(glb instanceof ArrayBuffer);
    assert.ok(glb.byteLength > 100);
    const magic = String.fromCharCode(...new Uint8Array(glb.slice(0, 4)));
    assert.equal(magic, 'glTF');
  });

  it('the zip holds the data file and the GLB, both named after the asset', async () => {
    const asset = {
      id: 'w1',
      display_name: 'Test Rain',
      category: 'weather',
      prompt: 'gentle rain',
      asset_url: 'procedural_generation',
      generation_params: { type: 'rain' },
      created_at: '2026-11-15T00:00:00.000Z',
    };
    const zipBlob = await exportCreationZip(asset);
    assert.equal(zipBlob.type, 'application/zip');
    const zip = await JSZip.loadAsync(zipBlob);
    const names = Object.keys(zip.files).sort();
    assert.deepEqual(names, ['test-rain.glb', 'test-rain.json']);
    const data = JSON.parse(await zip.file('test-rain.json').async('string'));
    assert.equal(data.format, CREATION_BUNDLE_FORMAT);
    assert.equal(data.name, 'Test Rain');
    assert.equal(data.prompt, 'gentle rain');
    assert.deepEqual(data.generation_params, { type: 'rain' });
    const glb = await zip.file('test-rain.glb').async('arraybuffer');
    assert.ok(glb.byteLength > 100);
    assert.equal(String.fromCharCode(...new Uint8Array(glb.slice(0, 4))), 'glTF');
  });
});

describe('the wiring — the preview and the download share one builder', () => {
  it('MiniViewport builds from the same buildCreationMesh as the download', () => {
    const viewport = readFileSync('components/world-engine/MiniViewport.jsx', 'utf8');
    assert.ok(viewport.includes('buildCreationMesh'), 'the live preview uses the shared builder');
    const download = readFileSync('lib/world-engine/creation-download.js', 'utf8');
    assert.ok(download.includes('buildCreationMesh'), 'the download uses the same builder');
  });

  it('every creation card carries a Download button (one shared card, all six categories)', () => {
    const cards = readFileSync('components/profile/MyCreations.jsx', 'utf8');
    assert.ok(cards.includes('⬇ Download'), 'the card has a Download button');
    assert.ok(cards.includes("await import('@/lib/world-engine/creation-download')"), 'the download module loads on tap');
    assert.ok(cards.includes('handleDownload'), 'the card wires the tap to the download');
    for (const category of ['world', 'character', 'weapon', 'vehicle', 'weather', 'object']) {
      assert.ok(cards.includes(`category: '${category}'`), `the ${category} section exists`);
    }
    // One shared CreationCard renders every section — so one
    // button site covers all six categories, and asset_link has
    // no section (and no card) today: Uplink assets are not
    // surfaced in My Creations. That is a product gap, stated
    // in the report — not a missing button.
    assert.equal(cards.includes("category: 'asset_link'"), false);
  });
});
