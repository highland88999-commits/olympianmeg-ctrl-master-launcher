// tests/waste-extraction.test.js
// Headless tests for the holoframe feed definitions (app/waste-extraction/feeds.js).
// Run: node tests/waste-extraction.test.js  (from the repo root). No browser, no network.
const { FEEDS, getFeed, makeRng, feedParams } = require('../app/waste-extraction/feeds.js');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error('FAIL: ' + name); }
}
const HEX = /^#[0-9a-f]{6}$/i;

// --- catalog ---
t('four feeds defined', FEEDS.length === 4);
t('feed ids unique', new Set(FEEDS.map((f) => f.id)).size === FEEDS.length);
t('every feed has name, desc, renderer', FEEDS.every((f) => f.name && f.desc && f.renderer));
t('getFeed finds drift', getFeed('drift') && getFeed('drift').name === 'DEEP FIELD');
t('getFeed returns null for unknown', getFeed('nope') === null);
t('hues are valid degrees', FEEDS.every((f) => f.hue >= 0 && f.hue <= 360));

// --- rng ---
t('makeRng is deterministic per seed', (() => {
  const a = makeRng(42), b = makeRng(42);
  return a() === b() && a() === b() && a() === b();
})());
t('different seeds diverge', makeRng(1)() !== makeRng(2)());
t('rng output in [0,1)', (() => {
  const r = makeRng(7);
  for (let i = 0; i < 50; i++) { const v = r(); if (v < 0 || v >= 1) return false; }
  return true;
})());

// --- params ---
const drift = feedParams('drift', 123);
t('drift params sane', drift && drift.stars >= 140 && drift.stars <= 260 && drift.driftSpeed > 0 && HEX.test(drift.color));
t('drift is deterministic per seed', JSON.stringify(feedParams('drift', 123)) === JSON.stringify(feedParams('drift', 123)));
t('drift varies with seed', JSON.stringify(feedParams('drift', 123)) !== JSON.stringify(feedParams('drift', 999)));
const plasma = feedParams('plasma', 5);
t('plasma grid params sane', plasma && plasma.cols >= 48 && plasma.cols <= 72 && plasma.rows >= 28 && plasma.hueBase >= 180 && plasma.hueBase <= 320);
const scope = feedParams('scope', 5);
t('scope params sane', scope && scope.waves >= 2 && scope.waves <= 4 && scope.amplitude > 0 && scope.amplitude < 0.5 && HEX.test(scope.traceColor));
const spore = feedParams('spore', 5);
t('spore params sane', spore && spore.count >= 60 && spore.count <= 120 && spore.glow > 0);
t('unknown feed -> null params', feedParams('bogus', 1) === null);

console.log(`\nwaste-extraction: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
