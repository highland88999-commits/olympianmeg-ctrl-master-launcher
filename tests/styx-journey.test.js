// tests/styx-journey.test.js
// Headless tests for the Styx passage. Run: node tests/styx-journey.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';
import { LEGS, STORAGE_KEY, sanitizeLeg, advanceLeg, isComplete, stationUrl } from '../lib/styx/journey.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- state machine ---
t('four stations in the intended order',
  JSON.stringify(LEGS.map((l) => l.route)) === JSON.stringify(['/anti-life', '/life', '/meaning-of-life', '/the-afterlife']));
t('every leg has numeral, title, text',
  LEGS.every((l) => typeof l.numeral === 'string' && typeof l.title === 'string' && typeof l.text === 'string' && l.text.length > 0));
t('sanitizeLeg clamps garbage',
  sanitizeLeg(0) === 0 && sanitizeLeg(2) === 2 && sanitizeLeg(99) === LEGS.length &&
  sanitizeLeg(-5) === 0 && sanitizeLeg('3') === 3 && sanitizeLeg('nope') === 0 &&
  sanitizeLeg(null) === 0 && sanitizeLeg(undefined) === 0 && sanitizeLeg(1.9) === 1);
t('advanceLeg walks forward and stops at completion',
  advanceLeg(0) === 1 && advanceLeg(3) === 4 && advanceLeg(4) === 4 && advanceLeg(999) === 4);
t('isComplete only at the far shore',
  !isComplete(0) && !isComplete(3) && isComplete(4));
t('stationUrl carries the passage flag',
  stationUrl(0) === '/anti-life?passage=1' && stationUrl(3) === '/the-afterlife?passage=1' && stationUrl(4) === null);
t('storage key is stable', STORAGE_KEY === 'styx-leg');

// --- route + wiring ---
const page = readFileSync('app/styx/page.jsx', 'utf8');
const link = readFileSync('components/styx/PassageLink.jsx', 'utf8');
const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
t('styx page is a client component', page.includes("'use client'"));
t('styx page reads the advanced param', page.includes("advanced"));
t('styx page links back to hub', page.includes('href="/"'));
t('PassageLink only shows on ?passage=1', link.includes("passage") && link.includes("'1'"));
t('PassageLink points at /styx?advanced=1', link.includes('/styx?advanced=1'));
t('PassageLink clears the Safari bar', link.includes('safe-area-inset-bottom'));
t('registry links route /styx', registry.includes('key: "styx"') && registry.includes('route: "/styx"'));

for (const route of ['anti-life', 'life', 'meaning-of-life', 'the-afterlife']) {
  const src = readFileSync(`app/${route}/page.jsx`, 'utf8');
  t(`${route} renders PassageLink`, src.includes('PassageLink'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
