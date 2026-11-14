// tests/earth3-dino-models.test.mjs
// EARTH 3 — REAL DINOS (Merlin, 2026-11-14): the showcase's
// dinosaurs are Earth 2's real dino GLBs, not the procedural
// shapes. For every one of the 17 species the spawner casts:
//   - the registry file exists under public/models/earth2,
//     parses as a GLB v2, stayed game-weight (<= 5 MB), and
//     kept its rig (skins >= 1 — the loader clones with
//     SkeletonUtils, which needs a skinned source)
//   - the delivery law the scene uses hands the model over:
//     signed out, the public file alone; signed in, the signed
//     URL first and the public file as fallback
//   - Pachycephalosaurus is still honestly excluded — no file,
//     no stand-in
//
// Run: node --test tests/earth3-dino-models.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DINO_SPECIES } from '../lib/earth3/spawner.js';
import { EARTH2_MODELS, modelDeliveryUrls } from '../lib/earth2/models.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

function parseGlb(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii', 16, 20), 'JSON', 'first chunk is JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

describe('Earth 3 casts Earth 2\u2019s real dinosaurs', () => {
  it('casts exactly the 17 placed species — no Pachycephalosaurus', () => {
    assert.equal(DINO_SPECIES.length, 17);
    assert.ok(!DINO_SPECIES.some((s) => s.slug === 'pachycephalosaurus'));
    const pachy = EARTH2_MODELS.find((m) => m.slug === 'pachycephalosaurus');
    assert.equal(pachy.file, null);
  });

  it('every cast species has a real, rigged, game-weight GLB on disk', () => {
    for (const s of DINO_SPECIES) {
      const p = join(repo, 'public', s.file.replace(/^\//, ''));
      assert.ok(existsSync(p), `${s.slug}: missing ${s.file}`);
      const size = statSync(p).size;
      assert.ok(size > 0 && size <= 5 * 1024 * 1024, `${s.slug}: ${size} bytes`);
      const json = parseGlb(readFileSync(p));
      assert.ok(Array.isArray(json.meshes) && json.meshes.length >= 1, `${s.slug}: no meshes`);
      assert.ok(Array.isArray(json.skins) && json.skins.length >= 1, `${s.slug}: rig lost (no skins)`);
      assert.ok(Array.isArray(json.nodes) && json.nodes.length > 0, `${s.slug}: no nodes`);
    }
  });

  it('the delivery law hands each model over, signed or not', () => {
    for (const s of DINO_SPECIES) {
      const entry = { slug: s.slug, file: s.file };
      // Signed out: the public site file alone carries the load.
      assert.deepEqual(modelDeliveryUrls(entry, null), [s.file]);
      // Signed in: the signed URL first, public file as fallback.
      const signed = `https://store.example/${s.slug}.glb?sig=x`;
      assert.deepEqual(
        modelDeliveryUrls(entry, { [`${s.slug}.glb`]: signed }),
        [signed, s.file]
      );
    }
  });
});
