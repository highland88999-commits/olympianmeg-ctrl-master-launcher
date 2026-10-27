// tests/billboard-ads.test.mjs — Billboard Manager (Merlin, 2026-10-27).
// Run: node tests/billboard-ads.test.mjs (from the repo root).
//
// Rules under test:
// - Numbers are the preset 1–44 run; company 1–80 chars; links https
//   only (http, javascript:, data:, credentials all rejected).
// - Creatives: image ≤ 8 MB, video ≤ 50 MB, storage URLs only.
// - Rotation interval defaults to 15 s, allowed 5–60 s.
// - The live manifest maps onto tower panels by billboard number;
//   an override replaces its number's slot (including stake numbers
//   Merlin explicitly sets) and leaves every other panel on the base
//   assignment. The base assignment itself is untouched (stake still
//   panel 0 in panelsForTower).
// - Rotation: single entry static; multi-entry cycles and clamps
//   when an entry is removed; state is per panel instance.
// - The manager never writes live: no live-write route exists, the
//   queue only stages/sends, and the hub reads the repo manifest.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  isValidBillboardNumber,
  validateCompanyName,
  validateLinkUrl,
  normalizeRotationSeconds,
  creativeKindForMime,
  maxBytesForKind,
  validateAdEntry,
  validateRemovalRow,
  ROTATION_DEFAULT_SECONDS,
} from '../lib/billboards/validate.js';
import {
  manifestToOverrides,
  overrideSlotFor,
  applyOverridesToTowerPanels,
  nextRotationIndex,
  clampRotationIndex,
  billboardRotates,
} from '../lib/billboards/overrides.js';
import { panelsForTower, billboardNumberFor } from '../lib/tower-panels.js';
import { STAKE_SLOT } from '../lib/partners.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const PREFIX = 'https://example.supabase.co/storage/v1/object/public/billboard-creatives/';

// --- validation ---
check('billboard numbers: 1 and 44 valid, 0/45/fractions invalid', () => {
  assert.equal(isValidBillboardNumber(1), true);
  assert.equal(isValidBillboardNumber(44), true);
  assert.equal(isValidBillboardNumber(0), false);
  assert.equal(isValidBillboardNumber(45), false);
  assert.equal(isValidBillboardNumber(1.5), false);
});

check('company names: empty rejected, 80 ok, 81 rejected', () => {
  assert.ok(validateCompanyName('') !== null);
  assert.ok(validateCompanyName('   ') !== null);
  assert.equal(validateCompanyName('Acme'), null);
  assert.equal(validateCompanyName('x'.repeat(80)), null);
  assert.ok(validateCompanyName('x'.repeat(81)) !== null);
});

check('links: https ok; http, javascript:, data:, credentials, bare host rejected', () => {
  assert.equal(validateLinkUrl('https://example.com/page'), null);
  assert.ok(validateLinkUrl('http://example.com') !== null);
  assert.ok(validateLinkUrl('javascript:alert(1)') !== null);
  assert.ok(validateLinkUrl('data:text/html,hi') !== null);
  assert.ok(validateLinkUrl('https://user:pass@example.com') !== null);
  assert.ok(validateLinkUrl('https://') !== null);
  assert.ok(validateLinkUrl('') !== null);
  assert.ok(validateLinkUrl('example.com') !== null);
});

check('rotation interval: default 15, 5–60 allowed, outside rejected', () => {
  assert.equal(ROTATION_DEFAULT_SECONDS, 15);
  assert.equal(normalizeRotationSeconds(undefined), 15);
  assert.equal(normalizeRotationSeconds(5), 15 - 10);
  assert.equal(normalizeRotationSeconds(60), 60);
  assert.equal(normalizeRotationSeconds(4), null);
  assert.equal(normalizeRotationSeconds(61), null);
  assert.equal(normalizeRotationSeconds('abc'), null);
});

check('creative kinds and caps: image 8 MB, video 50 MB', () => {
  assert.equal(creativeKindForMime('image/png'), 'image');
  assert.equal(creativeKindForMime('video/mp4'), 'video');
  assert.equal(creativeKindForMime('application/pdf'), null);
  assert.equal(maxBytesForKind('image'), 8 * 1024 * 1024);
  assert.equal(maxBytesForKind('video'), 50 * 1024 * 1024);
});

check('ad entry validation: valid passes; hotlink and missing creative rejected', () => {
  const good = {
    companyName: 'Acme',
    linkUrl: 'https://acme.example/',
    creativeType: 'image',
    creativeUrl: `${PREFIX}ads/b1-x.png`,
  };
  assert.deepEqual(validateAdEntry(good, PREFIX), []);
  assert.ok(validateAdEntry({ ...good, creativeUrl: 'https://evil.example/x.png' }, PREFIX).length > 0);
  assert.ok(validateAdEntry({ ...good, creativeUrl: '' }, PREFIX).length > 0);
  assert.ok(validateAdEntry({ ...good, creativeType: 'pdf' }, PREFIX).length > 0);
});

check('removal rows validate by number + company + link', () => {
  assert.deepEqual(validateRemovalRow({ billboardNumber: 7, companyName: 'Acme', linkUrl: 'https://acme.example/' }), []);
  assert.ok(validateRemovalRow({ billboardNumber: 45, companyName: 'Acme', linkUrl: 'https://acme.example/' }).length > 0);
});

// --- manifest mapping ---
const manifest = {
  version: 1,
  billboards: {
    2: {
      intervalSeconds: 20,
      entries: [
        { company: 'Acme', link: 'https://acme.example/', creativeType: 'image', creativeUrl: '/billboards/b2-acme.png' },
        { company: 'Beta', link: 'https://beta.example/', creativeType: 'video', creativeUrl: '/billboards/b2-beta.mp4' },
      ],
    },
    1: {
      intervalSeconds: 15,
      entries: [{ company: 'Solo', link: 'https://solo.example/', creativeType: 'image', creativeUrl: '/billboards/b1-solo.png' }],
    },
    99: { entries: [{ company: 'Ghost', link: 'https://ghost.example/', creativeType: 'image', creativeUrl: '/x.png' }] },
    3: { entries: [{ company: '', link: 'https://bad.example/', creativeType: 'image', creativeUrl: '/x.png' }] },
  },
};

check('manifest mapping: valid billboards kept, bad numbers and empty entries dropped', () => {
  const map = manifestToOverrides(manifest);
  assert.equal(map.size, 2);
  assert.equal(map.get(2).entries.length, 2);
  assert.equal(map.get(2).intervalSeconds, 20);
  assert.equal(map.get(1).entries.length, 1);
  assert.equal(map.has(99), false);
  assert.equal(map.has(3), false);
});

check('base assignment untouched: stake still panel 0 in panelsForTower', () => {
  assert.equal(panelsForTower(0)[0].key, STAKE_SLOT.key);
  assert.equal(billboardNumberFor(0, 0), 1);
  assert.equal(billboardNumberFor(10, 3), 44);
});

check('override application: only the numbered panel changes, base array unmutated', () => {
  const map = manifestToOverrides(manifest);
  const base = panelsForTower(0); // numbers 1–4
  const snapshot = JSON.stringify(base);
  const next = applyOverridesToTowerPanels(base, 0, map);
  assert.equal(JSON.stringify(base), snapshot, 'base array must not mutate');
  assert.equal(next[0].key, 'ad-1', 'billboard 1 (stake number) replaced by explicit override');
  assert.equal(next[0].name, 'Solo');
  assert.equal(next[1].key, 'ad-2', 'billboard 2 replaced');
  assert.equal(next[1].entries.length, 2);
  assert.equal(next[2].key, base[2].key, 'billboard 3 keeps base (its manifest entry was invalid)');
  assert.equal(next[3].key, base[3].key, 'billboard 4 keeps base');
});

check('no overrides returns the same array identity', () => {
  const base = panelsForTower(1);
  assert.equal(applyOverridesToTowerPanels(base, 1, new Map()), base);
  assert.equal(applyOverridesToTowerPanels(base, 1, null), base);
});

check('override slot carries rotation data and the first face', () => {
  const slot = overrideSlotFor(2, manifestToOverrides(manifest).get(2));
  assert.equal(slot.trackingUrl, 'https://acme.example/');
  assert.equal(slot.intervalSeconds, 20);
  assert.equal(slot.entries.length, 2);
  assert.equal(slot.creatives[0].imageUrl, '/billboards/b2-acme.png');
});

// --- rotation ---
check('rotation: single entry static, multi-entry cycles, removal clamps', () => {
  assert.equal(nextRotationIndex(0, 1), 0, 'single entry never advances');
  assert.equal(nextRotationIndex(0, 3), 1);
  assert.equal(nextRotationIndex(2, 3), 0, 'loops back to first');
  assert.equal(clampRotationIndex(2, 2), 0, 'stale index clamps when an entry is removed');
  assert.equal(clampRotationIndex(1, 3), 1);
  assert.equal(billboardRotates({ entries: [{}, {}] }), true);
  assert.equal(billboardRotates({ entries: [{}] }), false);
});

// --- file pins: manager never writes live, hub reads the manifest ---
check('queue route writes no live table (staging only)', () => {
  const src = read('app/api/billboards/queue/route.js');
  assert.ok(!src.includes('billboard_ads'), 'no live billboard table in the queue route');
  assert.ok(src.includes("status', 'staged'") || src.includes('staged'), 'staging exists');
  assert.ok(src.includes("status', 'sent'") || src.includes('sent'), 'send exists');
});

check('manager page: fortune strip 1–44, Add to Queue, Send, Add Ad, not-live copy', () => {
  const src = read('app/ad-spaces/page.jsx');
  assert.ok(src.includes('length: 44') || src.includes('Array.from({ length: 44'), '44 number chips');
  assert.ok(src.includes('ADD TO QUEUE'), 'per-entry Add to Queue button');
  assert.ok(src.includes('SEND TO MUSE'), 'Send button');
  assert.ok(src.includes('ADD AD'), 'Add Ad button under entries');
  assert.ok(src.includes('NOT live yet'), 'plain not-live copy');
  assert.ok(src.includes('Sent to builder — awaiting application'), 'sent status copy');
});

check('hub: HomeScene reads the repo manifest and GodTower rotates + posters video', () => {
  const home = read('components/HomeScene.jsx');
  assert.ok(home.includes('/billboards/manifest.json'), 'manifest fetch');
  assert.ok(home.includes('applyOverridesToTowerPanels'), 'override merge');
  const tower = read('components/GodTower.jsx');
  assert.ok(tower.includes('useRotatingEntry'), 'rotation hook');
  assert.ok(tower.includes('setInterval'), 'per-panel timer');
  assert.ok(tower.includes("creativeType === 'video'"), 'video poster branch');
  assert.ok(tower.includes('videoWidth'), 'poster drawn from video frame');
});

check('console links to the manager; manager is not in the portal registry', () => {
  assert.ok(read('app/console/page.jsx').includes('/ad-spaces'), 'console links to /ad-spaces');
  assert.ok(!read('lib/i18n/satellites.ts').includes('ad-spaces'), 'manager stays unseated');
});

check('migration file exists: queue table + public bucket, no live table', () => {
  const sql = read('supabase/migrations/20261027_billboard_ads.sql');
  assert.ok(sql.includes('billboard_queue'), 'queue table');
  assert.ok(sql.includes('billboard-creatives'), 'creative bucket');
  assert.ok(!sql.includes('CREATE TABLE public.billboard_ads'), 'no live billboard table');
});

console.log(`billboard-ads: ${passed} checks passed`);
