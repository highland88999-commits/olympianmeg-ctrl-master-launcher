// tests/realm-surfaces-sky.test.mjs — SKY ART for the hell realms
// (Merlin, 2026-11-15): one generated sky image per realm at
// public/art/realms/<slug>-sky.jpg, worn by the RealmSkyDome ceiling
// (components/RealmSkyDome.jsx). Run: node tests/realm-surfaces-sky.test.mjs
// (repo root). Art landed Nov 15 ~04:46: all 13 files 1920x1280,
// unique hashes, eyeballed with no text/logos/watermarks/faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  REALM_SURFACE_KEYS,
  REALM_SKY_FILES,
  skyUrlForRealm,
} from '../lib/portal/realm-surfaces.js';

/** Width/height out of a JPEG's SOF0/SOF2 marker (no image library). */
function jpegSize(buf) {
  assert.equal(buf[0], 0xff, 'JPEG SOI byte 0');
  assert.equal(buf[1], 0xd8, 'JPEG SOI byte 1');
  let off = 2;
  while (off + 4 <= buf.length) {
    assert.equal(buf[off], 0xff, `marker prefix at ${off}`);
    let marker = buf[off + 1];
    while (marker === 0xff) { off += 1; marker = buf[off + 1]; }
    if (marker === 0xda) break; // SOS: header is over
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  throw new Error('no SOF0/SOF2 marker found');
}

test('all 13 sky images exist, are JPEGs, 1920x1280, and unique', () => {
  assert.equal(REALM_SKY_FILES.length, 13);
  const hashes = new Set();
  for (const file of REALM_SKY_FILES) {
    assert.ok(existsSync(file), `missing sky image: ${file}`);
    const buf = readFileSync(file);
    assert.ok(buf.length > 100_000, `${file} is a real image (${buf.length} bytes)`);
    const { width, height } = jpegSize(buf);
    assert.equal(width, 1920, `${file} width`);
    assert.equal(height, 1280, `${file} height`);
    const hash = createHash('md5').update(buf).digest('hex');
    assert.ok(!hashes.has(hash), `${file} duplicates another sky image`);
    hashes.add(hash);
  }
  assert.equal(hashes.size, 13, '13 unique sky images');
});

for (const key of REALM_SURFACE_KEYS) {
  test(`${key}: dome mounted and its sky URL resolves to the landed file`, () => {
    const dir = key === 'hades' ? 'nether-realm' : key;
    const src = readFileSync(`app/${dir}/world3d.js`, 'utf8');
    assert.ok(src.includes(`<RealmSkyDome realmKey="${key}" />`), 'dome mounted');
    const url = skyUrlForRealm(key);
    assert.ok(url.startsWith('/art/realms/') && url.endsWith('-sky.jpg'), 'sky URL shape');
    assert.ok(existsSync(`public${url}`), `landed file for ${url}`);
  });
}

test('RealmSkyDome wears the image as an unlit BackSide ceiling', () => {
  const dome = readFileSync('components/RealmSkyDome.jsx', 'utf8');
  assert.ok(dome.includes('TextureLoader'), 'loads the sky with TextureLoader');
  assert.ok(dome.includes('skyUrlForRealm(realmKey)'), 'URL comes from realm-surfaces');
  assert.ok(dome.includes('THREE.BackSide'), 'BackSide sphere (ceiling seen from inside)');
  assert.ok(dome.includes('fog={false}'), 'dome ignores fog or the sky washes out');
  assert.ok(dome.includes('meshBasicMaterial'), 'unlit: the dome is a ceiling, not a lamp');
  assert.ok(dome.includes('if (!map) return null'), 'renders nothing before a sky texture loads');
  assert.ok(dome.includes('videoTex ?? tex'), 'video preferred when live, image is the fallback');
  assert.ok(dome.includes('REALM_SKY_DOME_RADIUS = 520'), 'dome radius encloses the world');
  assert.ok(!dome.includes('pointLight') && !dome.includes('spotLight')
    && !dome.includes('directionalLight'), 'the dome adds zero real lights');
});
