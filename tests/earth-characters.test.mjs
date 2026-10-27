// tests/earth-characters.test.mjs — the Earth 1 FULL character
// roster (Merlin, 2026-10-26: "add ALL characters to Earth 1
// as well").
//
// Platform visible (43) + extension (29) = 72 selectable on
// Earth 1. The extension roster is the evidence-checked set:
// 5 Middle-earth heroes + 8 Hawkins + 16 intact batch-4
// characters. The deliberately-excluded names (missing model,
// truncated file, realm-locked, creature) are listed in
// lib/earth/earth-characters.js and in the build receipt —
// never silently dropped, never wired broken.
//
// Run: node tests/earth-characters.test.mjs (from the repo root).
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EARTH_CHARACTER_EXTENSIONS,
  listExtensionCharacters,
  getExtensionCharacter,
  isExtensionCharacterId,
  EARTH_SELECTABLE_CHARACTER_COUNT,
} from '../lib/earth/earth-characters.js';
import { EARTH_EXTENSION_CHARACTER_KEY } from '../lib/earth/earth-extension-character.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

check('extension roster holds 29: 5 Middle-earth + 8 Hawkins + 16 batch-4', () => {
  assert.equal(listExtensionCharacters().length, 29);
  assert.equal(EARTH_CHARACTER_EXTENSIONS.length, 29);
  const bySource = {};
  for (const c of EARTH_CHARACTER_EXTENSIONS) bySource[c.source] = (bySource[c.source] || 0) + 1;
  assert.equal(bySource['Middle-earth'], 5);
  assert.equal(bySource['Hawkins'], 8);
  assert.equal(bySource['Batch 4'], 16);
});

check('ids are unique, x-prefixed (never colliding with platform q-ids), and named', () => {
  const ids = new Set();
  for (const c of EARTH_CHARACTER_EXTENSIONS) {
    assert.ok(c.id.startsWith('x-'), `${c.id} must carry the x- prefix`);
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.name && c.emoji && c.blurb, `${c.id} needs name/emoji/blurb`);
    assert.ok(Number.isFinite(c.heightM) && c.heightM > 0, `${c.id} heightM`);
  }
});

check('every extension GLB file is actually shipped in public/', () => {
  for (const c of EARTH_CHARACTER_EXTENSIONS) {
    const disk = join(root, 'public', c.glbUrl.replace(/^\//, ''));
    assert.ok(existsSync(disk), `${c.id} missing shipped file ${c.glbUrl}`);
  }
});

check('Middle-earth heroes keep their Hollow Earth heights', () => {
  assert.equal(getExtensionCharacter('x-me-wizard').heightM, 1.9);
  assert.equal(getExtensionCharacter('x-me-ranger').heightM, 1.85);
  assert.equal(getExtensionCharacter('x-me-elf-archer').heightM, 1.9);
  assert.equal(getExtensionCharacter('x-me-dwarf').heightM, 1.35);
  assert.equal(getExtensionCharacter('x-me-halfling').heightM, 1.15);
});

check('lookups behave: known resolves, unknown is null, guard works', () => {
  assert.equal(getExtensionCharacter('x-b4-68').name, 'Burruk');
  assert.equal(getExtensionCharacter('q020-neo'), null);
  assert.equal(getExtensionCharacter('nope'), null);
  assert.ok(isExtensionCharacterId('x-hawkins-eleven'));
  assert.ok(!isExtensionCharacterId('q020-neo'));
});

check('full Earth 1 selectable count is 43 platform + 29 extension = 72', () => {
  assert.equal(EARTH_SELECTABLE_CHARACTER_COUNT, 72);
});

check('extension pick key is its own device key (platform chain untouched)', () => {
  assert.equal(EARTH_EXTENSION_CHARACTER_KEY, 'olympus.earthCharacterExt');
});

check('the platform roster still marks q044–q057 preview-less (untouched by this build)', () => {
  // The extension exists precisely so roster.js never changes:
  // q044–q057 stay invisible in the platform picker (no preview,
  // no loadout) rather than misleadingly un-hidden.
  const src = readFileSync(join(root, 'lib/characters/roster.js'), 'utf8');
  assert.ok(src.includes('Preview PNGs are not published yet'), 'roster still documents the preview gap');
});

console.log(`earth-characters: ${passed} checks passed`);
