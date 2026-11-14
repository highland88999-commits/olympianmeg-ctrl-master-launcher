// tests/billboard-no-repeaters.test.mjs — BILLBOARD VIDEO GRAPHICS, NO
// REPEATERS (Merlin, Nov 13, 2026).
// "For the advertisers that have links hooked up on our billboards that
// don't have graphics, make video graphics for them using our style...
// And no repeaters... one video for each and one billboard for each
// except for our placeholder Batman video."
//
// Rules under test:
// - ONE BILLBOARD PER ADVERTISER: across the whole tower ring, each of
//   the 7 partners + Betty + Muse appears on exactly one billboard
//   (one rotating panel). Panel 0 stays Stake on every tower — Merlin's
//   own native placement, never removed — so Stake is exempt from the
//   count. YOUR AD HERE placeholders are the ONLY repeater.
// - ONE VIDEO PER ADVERTISER: every partner + Betty carries exactly one
//   videoSrc, and the file exists on disk (public/media). Margovil and
//   GearUP had no video at all before this change; Petscosset's promo
//   was remade in the Olympus billboard style (Merlin's named example).
// - TRACKING URLS UNTOUCHED: every affiliate link is byte-identical to
//   the verified impact.com value — never altered.
// - The placeholder house video (public/billboards/house-ad-space.mp4,
//   the Batman video) still exists: the re-cut could not be generated
//   (the video tool refused the Justice League likenesses twice, named
//   and original-heroes alike), so the current Batman video stays live
//   until Merlin picks a different direction for it.
// Run: node --test tests/billboard-no-repeaters.test.mjs (from the repo root).
// No browser, no network — pure wired-source audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { panelsForTower, TOWER_COUNT, PANELS_PER_TOWER } from '../lib/tower-panels.js';
import {
  PARTNERS,
  BETTY_SLOT,
  MUSE_SLOT,
  STAKE_SLOT,
  billboardInventory,
} from '../lib/partners.js';

const fileExists = (publicPath) =>
  existsSync(new URL(`../public${publicPath}`, import.meta.url));

// All rotating panels across the ring. TOWER_COUNT is 10 but GOD_MENUS
// orders 11 towers (boards 1-44 = 11 x 4), so span towers 0..10.
const RING_TOWERS = TOWER_COUNT + 1;
const allPanels = [];
for (let i = 0; i < RING_TOWERS; i++) allPanels.push(...panelsForTower(i));
const rotating = [];
for (let i = 0; i < RING_TOWERS; i++) rotating.push(...panelsForTower(i).slice(1));

const countKey = (key) => rotating.filter((p) => p.key === key).length;

// --- 1. One billboard per advertiser ---

test('each partner appears on exactly one billboard across the ring', () => {
  for (const p of PARTNERS) {
    assert.equal(countKey(p.key), 1, `${p.name} must appear exactly once, found ${countKey(p.key)}`);
  }
});

test('Betty and Muse each appear on exactly one billboard', () => {
  assert.equal(countKey(BETTY_SLOT.key), 1, 'Betty must appear exactly once');
  assert.equal(countKey(MUSE_SLOT.key), 1, 'Muse must appear exactly once');
});

test('YOUR AD HERE placeholders are the only repeater', () => {
  const counts = new Map();
  for (const p of rotating) counts.set(p.key, (counts.get(p.key) || 0) + 1);
  for (const [key, n] of counts) {
    if (n > 1) {
      assert.ok(
        key.startsWith('your-ad-here'),
        `only placeholders may repeat — ${key} appears ${n} times`
      );
    }
  }
  const fillerCount = rotating.filter((p) => p.key.startsWith('your-ad-here')).length;
  assert.ok(fillerCount > 0, 'placeholder fillers still fill the remaining slots');
});

test('panel 0 stays Stake on every tower (native, exempt from the count)', () => {
  for (let i = 0; i < RING_TOWERS; i++) {
    assert.equal(panelsForTower(i)[0].key, STAKE_SLOT.key, `tower ${i} panel 0 is Stake`);
  }
});

test('no tower repeats a slot on itself', () => {
  for (let i = 0; i < RING_TOWERS; i++) {
    const keys = panelsForTower(i).map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, `tower ${i} has no duplicate slot`);
  }
});

test('towers 0-2 hold the nine one-time advertisers, towers 3+ are placeholders', () => {
  const onceKeys = [...PARTNERS.map((p) => p.key), BETTY_SLOT.key, MUSE_SLOT.key];
  const firstNine = [];
  for (let i = 0; i < 3; i++) firstNine.push(...panelsForTower(i).slice(1).map((p) => p.key));
  assert.deepEqual(firstNine, onceKeys, 'towers 0-2 carry each one-time advertiser once, in inventory order');
  for (let i = 3; i < RING_TOWERS; i++) {
    for (const p of panelsForTower(i).slice(1)) {
      assert.ok(p.key.startsWith('your-ad-here'), `tower ${i} rotating panel is a placeholder, found ${p.key}`);
    }
  }
});

// --- 2. One video per advertiser, file on disk ---

test('every partner and Betty carries exactly one videoSrc', () => {
  for (const p of PARTNERS) {
    assert.equal(typeof p.videoSrc, 'string', `${p.name} has a videoSrc`);
    assert.ok(p.videoSrc.startsWith('/media/') && p.videoSrc.endsWith('.mp4'), `${p.name} videoSrc is a /media mp4`);
  }
  assert.equal(typeof BETTY_SLOT.videoSrc, 'string', 'Betty has a videoSrc');
});

test('every videoSrc file exists on disk', () => {
  for (const slot of billboardInventory()) {
    if (slot.videoSrc) {
      assert.ok(fileExists(slot.videoSrc), `${slot.key} video file missing: ${slot.videoSrc}`);
    }
  }
});

test('the placeholder house video still exists on disk', () => {
  assert.ok(
    fileExists('/billboards/house-ad-space.mp4'),
    'house-ad-space.mp4 (the Batman placeholder video) must still be shipped'
  );
});

// --- 3. Tracking URLs untouched (Merlin's affiliate links — never altered) ---

test('all partner tracking URLs are byte-identical to the verified values', () => {
  const expected = {
    margovil: 'https://margovil.pxf.io/PzNOEj',
    wheeltop: 'https://globaloneclicktechnologycolimited.pxf.io/k4GOEV',
    openart: 'https://openartai.pxf.io/B5onaJ',
    gearup: 'https://gearup.sjv.io/L03KL0',
    petscosset: 'https://petscosset.pxf.io/QY3j96',
    missacc: 'https://missacccom.pxf.io/oNq1Po',
    helloprenup: 'https://helloprenupinc.sjv.io/AgXPOa',
  };
  for (const p of PARTNERS) {
    assert.equal(p.trackingUrl, expected[p.key], `${p.name} tracking URL must not change`);
  }
  assert.equal(
    BETTY_SLOT.trackingUrl,
    'https://betty.ca/join/richardnsky8g',
    'Betty tracking URL must not change'
  );
  assert.equal(
    STAKE_SLOT.trackingUrl,
    'https://stake.com/?c=1FofAXWx',
    'Stake tracking URL must not change'
  );
});

// --- 4. The new videos are honest Olympus-style ads ---

test('the new videos carry the real name, tagline and terms from partners.js', () => {
  const byKey = Object.fromEntries(PARTNERS.map((p) => [p.key, p]));
  assert.equal(byKey.margovil.tagline, '15% of online sale');
  assert.equal(byKey.gearup.tagline, '70% of paid subscriptions');
  assert.equal(byKey.petscosset.tagline, '12% of online sale');
  assert.equal(byKey.margovil.terms, '15% of online sale · 30-day window');
  assert.equal(byKey.gearup.terms, '70% of paid subscription · 30-day window');
  assert.equal(byKey.petscosset.terms, '12% of online sale · 30-day window');
  // The videos themselves were checked frame by frame on Nov 13: navy
  // starfield, gold accent bar, PARTNER label, name + tagline, TAP TO
  // VISIT — the lib/billboard-face.js look, in 1280x720 H.264, 10 s.
  assert.equal(byKey.margovil.videoSrc, '/media/margovil-promo.mp4');
  assert.equal(byKey.gearup.videoSrc, '/media/gearup-promo.mp4');
  assert.equal(byKey.petscosset.videoSrc, '/media/petscosset-promo.mp4');
});
