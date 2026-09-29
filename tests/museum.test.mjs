// tests/museum.test.mjs
// Headless tests for the MUSEUM gallery module. Run: node tests/museum.test.mjs
// (from the repo root). No browser, no network — pure logic in lib/museum.js.
import {
  SERIES, ITEMS, VIDEOS, CONCEPTS, STATUSES, STATUS_LABELS,
  seriesById, itemsInSeries, searchItems,
  conceptsByStatus, searchConcepts,
  loadKept, saveKept, toggleKept,
} from '../lib/museum.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Series ---
t('11 series', SERIES.length === 11);
const seriesIds = SERIES.map((s) => s.id);
t('series ids unique', new Set(seriesIds).size === seriesIds.length);
t('expected series present', ['valkyrie', 'gold-robot', 'neon', 'posters', 'branding',
  'fortress', 'gems', 'starblood', 'innodigym', 'key-art', 'textures'].every((id) => seriesIds.includes(id)));
t('every series has title + blurb', SERIES.every((s) => s.title && s.blurb));
t('seriesById(valkyrie)', seriesById('valkyrie') && seriesById('valkyrie').title === 'Valkyrie');
t('seriesById unknown -> null', seriesById('nope') === null);

// --- Items ---
t('107 gallery items', ITEMS.length === 107);
const itemIds = ITEMS.map((i) => i.id);
t('item ids unique', new Set(itemIds).size === itemIds.length);
t('every item has title + src', ITEMS.every((i) => i.title && i.src && i.src.startsWith('/textures/museum/')));
t('every item series resolves', ITEMS.every((i) => seriesById(i.series) !== null));
t('series counts add up', SERIES.every((s) => itemsInSeries(s.id).length === s.count));
t('itemsInSeries all', itemsInSeries('all').length === ITEMS.length);
t('itemsInSeries neon > 0', itemsInSeries('neon').length > 0);
t('itemsInSeries unknown -> empty', itemsInSeries('nope').length === 0);

// Every item src must exist on disk (no broken gallery tiles).
let missing = [];
for (const i of ITEMS) {
  if (!existsSync(join(root, 'public', i.src.slice(1)))) missing.push(i.src);
}
t('all item assets exist on disk (' + missing.length + ' missing)', missing.length === 0);
if (missing.length) console.error('  missing:', missing.slice(0, 5).join(', '));

// Search
t('search "valkyrie" finds the neon sigil', searchItems('valkyrie').some((i) => /neon sigil/i.test(i.title)));
t('search "neon" finds neon series', searchItems('neon').length >= itemsInSeries('neon').length);
t('search empty -> all', searchItems('').length === ITEMS.length);
t('search gibberish -> none', searchItems('zzzqzxqzx').length === 0);
t('search case-insensitive', searchItems('VALKYRIE').length === searchItems('valkyrie').length);

// --- Videos ---
t('4 concept films', VIDEOS.length === 4);
t('video slugs', VIDEOS.map((v) => v.slug).join(',') === 'air-car,logo,medusa,olympus');
t('every video has title + src', VIDEOS.every((v) => v.title && v.src));
let missingV = [];
for (const v of VIDEOS) {
  if (!existsSync(join(root, 'public', v.src.slice(1)))) missingV.push(v.src);
}
t('all video assets exist on disk', missingV.length === 0);
if (missingV.length) console.error('  missing:', missingV.join(', '));

// --- Concepts wing ---
t('25 curated concepts', CONCEPTS.length === 25);
const conceptIds = CONCEPTS.map((c) => c.id);
t('concept ids unique', new Set(conceptIds).size === conceptIds.length);
t('every concept has a valid status', CONCEPTS.every((c) => STATUSES.includes(c.status)));
t('status labels cover all statuses', STATUSES.every((s) => STATUS_LABELS[s]));
t('plain English labels', Object.values(STATUS_LABELS).every((l) => /^[A-Za-z][a-z]+( [a-z]+)?$/.test(l)));
t('conceptsByStatus all', conceptsByStatus('all').length === CONCEPTS.length);
t('shipped concepts > 0', conceptsByStatus('shipped').length > 0);
t('not-approved labeled, historical only', (() => {
  const na = conceptsByStatus('not-approved');
  return na.length === 1 && /historical/i.test(na[0].blurb) && /never/i.test(na[0].blurb);
})());
t('routed concepts point at real pages', CONCEPTS.filter((c) => c.route).every((c) => /^\/[a-z-]+$/.test(c.route)));
t('search "air-car" finds AURA-GENESIS', searchConcepts('air-car').some((c) => /AURA/i.test(c.name)));
t('search concepts empty -> all', searchConcepts('').length === CONCEPTS.length);

// --- Kept storage (pure helpers; localStorage guarded) ---
t('toggleKept adds', toggleKept([], 'g001').join() === 'g001');
t('toggleKept removes', toggleKept(['g001'], 'g001').length === 0);
t('toggleKept keeps others', toggleKept(['g001', 'g002'], 'g001').join() === 'g002');
t('loadKept safe without localStorage', Array.isArray(loadKept()));
t('saveKept safe without localStorage', saveKept(['g001']) === true);

// --- Page file sanity ---
const page = readFileSync(join(root, 'app/museum/page.jsx'), 'utf8');
t('page has lightbox', /lightbox/i.test(page));
t('page has video room', /<video/i.test(page));
t('page has concepts wing', /concepts/i.test(page));
t('page clears radio/Safari bar (safe-area)', /safe-area-inset-bottom/.test(page));
t('page uses fx (no custom audio)', /from '@\/lib\/fx'/.test(page));
t('page has no external URLs', !/https?:\/\/(?!www\.w3\.org)[a-z]/i.test(page.replace(/aria-label="Close"/g, '')));
t('page has no telemetry', !/central_telemetry|cerberus_telemetry|analytics\.track|gtag\(|fetch\(/.test(page));

console.log(`\nmuseum: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
