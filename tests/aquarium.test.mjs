// tests/aquarium.test.mjs
//
// Aquarium feed cleanup (Merlin, 2026-11-15): the feeds that do not
// load are deleted, the remaining feeds are fullscreen and centered,
// user-added feeds are permanent, and deleting a feed needs his PIN —
// the same PIN as the ARES login.
//
// Live-check evidence (YouTube oEmbed, curl, 2026-11-16): a feed
// counts as dead only if YouTube itself refuses it — 401/403 (the
// owner disabled embedding) or 404 (video gone). Ten feeds failed.
// ROUND 2 (Nov 15 ~23:55): six more feeds were black on his phone even
// though they pass oEmbed — "there are still feeds that show a black
// screen, not a scene" — so they are DELETED too, pinned below in
// DELETED_BLACK_NODES. A black screen is not a scene.
//
// The PIN is never in this file: verifyAresPin is tested with a mocked
// fetch and a dummy value, never the real one.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN_NODES,
  DELETED_DEAD_NODES,
  DELETED_BLACK_NODES,
  extractYouTubeID,
  isUserFeed,
  mergeNodes,
  loadUserFeedsBackup,
  saveUserFeedsBackup,
} from '../lib/aquarium/nodes.js';
import { verifyAresPin, ARES_PIN_GATE_URL } from '../lib/aquarium/pin-gate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const DEAD_IDS = DELETED_DEAD_NODES.map((d) => d.id);
const BLACK_IDS = DELETED_BLACK_NODES.map((d) => d.id);
const BUILTIN_IDS = BUILTIN_NODES.map((n) => n.id);

// The original 50-node rotation, as it stood before the cleanup.
const ORIGINAL_50 = [
  'DHUnz4dyb54', 'XsOU8JnEpNM', '5e4lsEe4Vew', '3n-5EA9augs', 'dIChLG4_WNs',
  'ItdXaWUVF48', 'ydYDqZQpim8', 'S46DdA8Mc4I', 'qHXFLsnKDq0', 'F0GOOP82094',
  '4BrvMGznLTo', 'ayMw6zvsUpQ', 'iws3rh5vLAQ', 'jzx_n25g3kA', 'ouWBQoVFegI',
  '3szkFHfr6sA', 'FqQJmDiW0xs', 'aXAsMcmtJTc', 'qJ8lYplu1y0', 'yfSyjwY6zSQ',
  'azNqXbUW-K4', 'yuIm1V7Ne7I', 'QOzC_AbsPlw', 'XyPU5-pNg5E', 'Io1Kle7QR-E',
  'RZFMYVNhd4k', 'JMMoRwYo5kE', 'HlJ4aRtYhoo', 'iWCeBAxRCBo', 'g6wxYiESkE4',
  '-qvYCbvbeN8', 'SUXPnIEpbn4', 'tEtg5Kg3voQ', 'abbR-Ttd-cA', 'dN1uDn-Luno',
  '-479TZi-EAs', 'qi0mY6zVQnY', 'MwcqP3ta6RI', 'fIMbMz2P7Bs', 'h8O0UXsL7uk',
  '0FBiyFpV__g', 'UDAZWxehMAI', 'w3LjpFhySTg', '3e_uPkJCTNo', 'ZrePsYz4c6g',
  'gJVnp5fF0vM', '-Vck0hn-zqk', 'typxqJU-pFQ', 'UpwNqncnqTE', 'E0TZTmTK-Ws',
];

test('the dead feeds are gone: exactly the 10 live-verified dead ids', () => {
  assert.equal(DELETED_DEAD_NODES.length, 10);
  assert.deepEqual(DEAD_IDS, [
    'iws3rh5vLAQ', 'FqQJmDiW0xs', 'qJ8lYplu1y0', 'HlJ4aRtYhoo', 'iWCeBAxRCBo',
    'dN1uDn-Luno', '-479TZi-EAs', 'h8O0UXsL7uk', '0FBiyFpV__g', 'UpwNqncnqTE',
  ]);
  for (const d of DELETED_DEAD_NODES) {
    assert.match(d.check, /oEmbed (401|403|404)/, `${d.id} carries its live-check evidence`);
  }
});

test('the built-in rotation is the 34 live feeds, in the original order', () => {
  assert.equal(BUILTIN_NODES.length, 34);
  assert.equal(new Set(BUILTIN_IDS).size, 34, 'no duplicate built-in ids');
  for (const id of [...DEAD_IDS, ...BLACK_IDS]) {
    assert.ok(!BUILTIN_IDS.includes(id), `${id} must not be in the rotation`);
  }
  // Deleted (10 dead + 6 black) + built-in is exactly the original 50, nothing else.
  assert.deepEqual(
    [...DEAD_IDS, ...BLACK_IDS, ...BUILTIN_IDS].sort(),
    [...ORIGINAL_50].sort(),
  );
});

test('the black-screen feeds are gone too: exactly the 6 round-2 ids', () => {
  assert.equal(DELETED_BLACK_NODES.length, 6);
  assert.deepEqual(BLACK_IDS, [
    '3n-5EA9augs', 'qHXFLsnKDq0', '3szkFHfr6sA', 'g6wxYiESkE4', 'ZrePsYz4c6g',
    '-Vck0hn-zqk',
  ]);
  for (const d of DELETED_BLACK_NODES) {
    assert.ok(!BUILTIN_IDS.includes(d.id), `${d.id} (${d.name}) must not be in the rotation`);
    assert.ok(!DEAD_IDS.includes(d.id), `${d.id} is a black-screen deletion, not a dead one`);
  }
});

test('extractYouTubeID handles every URL shape the add-feed prompt accepts', () => {
  assert.equal(extractYouTubeID('https://www.youtube.com/watch?v=DHUnz4dyb54'), 'DHUnz4dyb54');
  assert.equal(extractYouTubeID('https://youtu.be/DHUnz4dyb54'), 'DHUnz4dyb54');
  assert.equal(extractYouTubeID('https://www.youtube.com/shorts/DHUnz4dyb54'), 'DHUnz4dyb54');
  assert.equal(extractYouTubeID('https://www.youtube.com/live/DHUnz4dyb54'), 'DHUnz4dyb54');
  assert.equal(extractYouTubeID('https://www.youtube.com/embed/DHUnz4dyb54'), 'DHUnz4dyb54');
  assert.equal(extractYouTubeID('https://www.youtube.com/watch?v=DHUnz4dyb54&t=10s'), 'DHUnz4dyb54');
  assert.equal(extractYouTubeID('https://example.com/watch?v=DHUnz4dyb54'), null);
  assert.equal(extractYouTubeID('not a url'), null);
  assert.equal(extractYouTubeID(null), null);
});

test('isUserFeed marks only origin=user rows as user feeds', () => {
  assert.equal(isUserFeed({ id: 'x', origin: 'user' }), true);
  assert.equal(isUserFeed({ id: 'x', origin: 'builtin' }), false);
  assert.equal(isUserFeed({ id: 'x' }), false);
  assert.equal(isUserFeed(null), false);
});

test('mergeNodes: the database is the source of truth when it answers', () => {
  const dbRows = [
    { id: 'DHUnz4dyb54', name: 'AQUARIUM', origin: 'builtin' },
    { id: 'USERFEED123', name: 'MY CAM', origin: 'user' },
  ];
  const merged = mergeNodes({ builtin: BUILTIN_NODES, dbRows, localUserFeeds: [] });
  assert.deepEqual(merged, dbRows, 'db rows are the rotation, built-ins do not leak back in');
});

test('mergeNodes: a database outage falls back to built-ins PLUS local user feeds', () => {
  const local = [{ id: 'USERFEED123', name: 'MY CAM', origin: 'user' }];
  const merged = mergeNodes({ builtin: BUILTIN_NODES, dbRows: null, localUserFeeds: local });
  assert.equal(merged.length, 35);
  assert.ok(merged.some((n) => n.id === 'USERFEED123'), 'the user feed survives the outage');
  const empty = mergeNodes({ builtin: BUILTIN_NODES, dbRows: [], localUserFeeds: local });
  assert.equal(empty.length, 35, 'an empty table falls back the same way');
});

test('mergeNodes: a local user feed missing from the database is appended, never dropped', () => {
  const dbRows = [{ id: 'DHUnz4dyb54', name: 'AQUARIUM', origin: 'builtin' }];
  const local = [
    { id: 'USERFEED123', name: 'MY CAM', origin: 'user' },
    { id: 'DHUnz4dyb54', name: 'AQUARIUM', origin: 'builtin' }, // duplicate: db row wins
  ];
  const merged = mergeNodes({ builtin: BUILTIN_NODES, dbRows, localUserFeeds: local });
  assert.deepEqual(merged.map((n) => n.id), ['DHUnz4dyb54', 'USERFEED123']);
});

test('the deleted dead ids are named nowhere as live', () => {
  // The code list never contains a dead id (pinned above), and the
  // staged SQL's "mark as builtin" list must not either. A stale
  // database row is the database's truth and only the SQL removes it —
  // the merge law does not invent or resurrect ids.
  const sql = read('supabase/aquarium-feed-cleanup.sql');
  const updateBlock = sql.split("set origin = 'builtin'")[1].split(';')[0];
  for (const id of [...DEAD_IDS, ...BLACK_IDS]) {
    assert.ok(!updateBlock.includes(`'${id}'`), `${id} must not be marked builtin in the SQL`);
    assert.ok(!BUILTIN_IDS.includes(id), `${id} must not be in the built-in list`);
  }
});

test('localStorage backup helpers no-op outside a browser', () => {
  assert.deepEqual(loadUserFeedsBackup(), []);
  saveUserFeedsBackup([{ id: 'USERFEED123', name: 'MY CAM', origin: 'user' }]);
});

test('verifyAresPin posts to the SAME gate the ARES login uses', async () => {
  assert.equal(ARES_PIN_GATE_URL, '/api/molly/gate');
  let seen = null;
  const okFetch = async (url, opts) => {
    seen = { url, opts };
    return { ok: true };
  };
  // Dummy value only — the mock never hashes or checks anything real.
  assert.equal(await verifyAresPin('test-pin', okFetch), true);
  assert.equal(seen.url, '/api/molly/gate');
  assert.equal(seen.opts.method, 'POST');
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.passcode, 'test-pin', 'the typed PIN travels in the JSON body, never in a URL');
  assert.ok(!seen.url.includes('test-pin'), 'the PIN is never in the URL');
});

test('verifyAresPin: a wrong PIN answers false and nothing is deleted', async () => {
  const noFetch = async () => ({ ok: false });
  assert.equal(await verifyAresPin('test-pin', noFetch), false);
  const throwingFetch = async () => { throw new Error('door did not answer'); };
  assert.equal(await verifyAresPin('test-pin', throwingFetch), false);
});

test('verifyAresPin: an empty PIN never even calls the gate', async () => {
  let called = false;
  const spy = async () => { called = true; return { ok: true }; };
  assert.equal(await verifyAresPin('', spy), false);
  assert.equal(called, false);
});

test('the page opens on the fullscreen feed, not on the menu card', () => {
  const page = read('app/aquarium/page.tsx');
  assert.match(page, /const \[uiOpen, setUiOpen\] = useState\(false\)/);
  assert.ok(!page.includes('useState(true)'), 'no state still defaults the menu open');
  assert.match(page, /className=\{`video-engine/);
  assert.match(page, /position: fixed; inset: 0; width: 100vw; height: 100dvh/);
  // Cover-centered iframe: fills the viewport, centered, no bars.
  assert.match(page, /min-height: 100dvh; min-width: 177\.77vh/);
  assert.match(page, /top: 50%; left: 50%; transform: translate\(-50%, -50%\)/);
});

test('the HUD is one stacked bar — counter and swipe hint on separate rows', () => {
  const page = read('app/aquarium/page.tsx');
  assert.match(page, /\.hud-bar \{/);
  assert.match(page, /flex-direction: column; align-items: center/);
  assert.ok(!page.includes('className={`hud '), 'the old single-row HUD is gone');
  assert.ok(!page.includes('swipe-indicator'), 'the old overlapping swipe element is gone');
  assert.ok(!page.includes("style={{left: '30px'}}"), 'the old left-offset counter is gone');
  assert.match(page, /className="hud-swipe"/);
});

test('the mirror button no longer sits on the Concourse orb', () => {
  const page = read('app/aquarium/page.tsx');
  assert.ok(!page.includes('top: 20px; right: 20px'), 'the old top-right mirror position is gone');
  assert.match(page, /position: fixed; top: 76px; left: 20px/);
});

test('the page wires the aquarium lib: prune, merge, permanence, PIN gate', () => {
  const page = read('app/aquarium/page.tsx');
  assert.match(page, /from '@\/lib\/aquarium\/nodes'/);
  assert.match(page, /BUILTIN_NODES/);
  assert.match(page, /mergeNodes\(\{ builtin: defaultNodes, dbRows/);
  assert.match(page, /saveUserFeedsBackup\(/);
  assert.match(page, /from '@\/lib\/aquarium\/pin-gate'/);
  assert.match(page, /verifyAresPin\(pinValue\)/);
  // The PIN check gates the delete: no supabase delete runs before it.
  const removeIdx = page.indexOf('confirmRemoveWithPin');
  const deleteIdx = page.indexOf(".from('nexus_nodes')\n              .delete()");
  assert.ok(removeIdx !== -1 && deleteIdx !== -1 && removeIdx < deleteIdx);
  assert.match(page, /const ok = await verifyAresPin\(pinValue\);/);
});

test('the staged SQL deletes exactly the 16 dead + black ids and never touches user feeds', () => {
  const sql = read('supabase/aquarium-feed-cleanup.sql');
  assert.match(sql, /DRAFT — DO NOT RUN YET/);
  const deleteBlock = sql.split('delete from public.nexus_nodes')[1].split(';')[0];
  for (const id of [...DEAD_IDS, ...BLACK_IDS]) {
    assert.ok(deleteBlock.includes(`'${id}'`), `${id} is in the staged delete`);
  }
  for (const id of BUILTIN_IDS) {
    assert.ok(!sql.split('delete from public.nexus_nodes')[1].split(';')[0].includes(`'${id}'`),
      `${id} must not be in the staged delete`);
  }
  assert.match(sql, /origin <> 'user'/, 'the delete is guarded to built-in rows');
  assert.match(sql, /add column if not exists origin text not null default 'user'/);
  assert.match(sql, /set origin = 'builtin'/);
  assert.match(sql, /USER FEEDS ARE NEVER TOUCHED BY THIS FILE/);
});

test('the page still keeps ADD FEED, REMOVE FEED, REQUEST CONSOLE, swipe, counter', () => {
  const page = read('app/aquarium/page.tsx');
  assert.match(page, /promptAddNode/);
  assert.match(page, /removeCurrentNode/);
  assert.match(page, /Request Console/);
  assert.match(page, /handleSwipe/);
  assert.match(page, /NODE: \$\{String\(currentIndex \+ 1\)/);
});
