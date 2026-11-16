// tests/earth-street-polish.test.mjs — the 2026-10-27 Earth 1
// street polish, as reworked 2026-11-15 (Merlin: mapping goes
// away completely, tiles no longer render — the ground is
// prerendered). The progress sync (ui-state calls, session
// token, dirty flag, local-ahead probe) and the lens queue
// (build guards, setup-fault freeing, video-ready finish,
// watchdog) are GONE with the systems they polished: this file
// pins their absence from NexusEarth, and keeps the pure
// mapping-progress probe semantics for the record (the lib
// stays on disk, unwired).
//   3. The crack glow pins live in tests/earth-cracks.test.mjs.
//
// Run: node tests/earth-street-polish.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createBitset,
  markDisc,
  unionInto,
  parseBitset,
  serializeBitset,
} from '../lib/earth/mapping-progress.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const nexus = read('components/NexusEarth.jsx');

check('no ui-state sync remains in NexusEarth (mapping is gone)', () => {
  assert.ok(!nexus.includes('getEarthUiToken'), 'token helper is gone');
  assert.ok(!nexus.includes("await import('@/lib/supabase')"), 'no session-token fetch');
  assert.ok(!nexus.includes('Authorization: `Bearer'), 'no authenticated ui-state calls');
  assert.ok(!nexus.includes('earth_mapped'), 'no mapped preference sync');
});

check('no mapped dirty flag remains', () => {
  assert.ok(!nexus.includes('mappedDirtyRef'), 'no dirty ref');
  assert.ok(!nexus.includes('mappedSyncRef'), 'no sync ref');
  assert.ok(!nexus.includes('mappedBitsetRef'), 'no bitset ref');
});

check('no local-ahead probe remains in NexusEarth', () => {
  assert.ok(!nexus.includes('server.slice()'), 'no server-bitset probe copy');
  assert.ok(!nexus.includes('unionInto(probe, bitset)'), 'no probe union');
});

check('local-ahead probe semantics (headless, via mapping-progress)', () => {
  const local = createBitset();
  markDisc(local, 53.63, -113.41);
  // No server record at all: local marks are ahead.
  assert.equal(unionInto(createBitset(), local), true, 'marks with no server record are ahead');
  // Server identical to local: nothing ahead.
  const serverSame = parseBitset(serializeBitset(local));
  assert.equal(unionInto(serverSame.slice(), local), false, 'identical server is not ahead');
  // Server behind local (older marks): local is ahead.
  const serverOld = createBitset();
  markDisc(serverOld, 53.63, -113.41);
  const localMore = createBitset();
  unionInto(localMore, serverOld);
  markDisc(localMore, 54.0, -113.0);
  assert.equal(unionInto(serverOld.slice(), localMore), true, 'extra local marks are ahead');
  // Server ahead of local: local adds nothing to the server copy.
  const localLess = createBitset();
  assert.equal(unionInto(localMore.slice(), localLess), false, 'server-ahead local is not ahead');
  const grown = createBitset();
  assert.equal(unionInto(grown, localMore), true, 'union still grows the device record');
});

check('no lens build guards remain (no build to guard)', () => {
  assert.ok(!nexus.includes('if (!hd) {'), 'no missing-height-data build guard');
  assert.ok(!nexus.includes('if (!videoTex) {'), 'no missing-video build guard');
  assert.ok(!nexus.includes('bctx.remove'), 'no partial-sheet drop');
});

check('no finish gate or watchdog remains', () => {
  assert.ok(!nexus.includes('onGroundVideoReady(() => finish())'), 'no video-ready finish gate');
  assert.ok(!nexus.includes('else if (groundVideoHasError())'), 'no failed-video build branch');
  assert.ok(!nexus.includes('LENS_BUILD_WATCHDOG_MS'), 'no build watchdog');
  assert.ok(!nexus.includes('watchTimer'), 'no watchdog timer');
  assert.doesNotMatch(nexus, /ctx\.drawImage/, 'no tile painting remains');
  assert.doesNotMatch(nexus, /okCount/, 'no tile settle counting remains');
});

check('the prerender is the only ground path', () => {
  assert.ok(nexus.includes("<PrerenderedEarthGround />"), 'prerender mounted');
  assert.ok(nexus.includes("phase === 'earth_roam' && <PrerenderedEarthGround />"), 'prerender mounts at street level');
});

console.log(`earth-street-polish: ${passed} checks passed`);
