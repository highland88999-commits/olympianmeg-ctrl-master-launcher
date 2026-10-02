// tests/museum.test.mjs
// Headless tests for the MUSEUM gallery module (post-wipe, 2026-10-02).
// Run: node tests/museum.test.mjs (from the repo root).
// No browser, no network — pure logic in lib/museum.js + page file sanity.
//
// Merlin's directive: the museum shows ONLY Gemini-made pieces — Photos in
// one wing, Videos in another. No screenshots, ever. All old graphics were
// stripped; the wings render honest empty states until he hangs new pieces
// via the Menu Art Transfer app.
import {
  SERIES, ITEMS, VIDEOS, CONCEPTS, STATUSES, STATUS_LABELS,
  seriesById, itemsInSeries, searchItems,
  conceptsByStatus, searchConcepts,
  loadKept, saveKept, toggleKept,
} from '../lib/museum.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The wipe: everything is empty ---
t('SERIES empty', Array.isArray(SERIES) && SERIES.length === 0);
t('ITEMS empty', Array.isArray(ITEMS) && ITEMS.length === 0);
t('VIDEOS empty', Array.isArray(VIDEOS) && VIDEOS.length === 0);
t('CONCEPTS empty', Array.isArray(CONCEPTS) && CONCEPTS.length === 0);

// --- Helpers still behave on empty data ---
t('seriesById unknown -> null', seriesById('nope') === null);
t('itemsInSeries all -> empty', itemsInSeries('all').length === 0);
t('itemsInSeries unknown -> empty', itemsInSeries('nope').length === 0);
t('searchItems empty -> all (none)', searchItems('').length === 0);
t('searchItems gibberish -> none', searchItems('zzzqzxqzx').length === 0);
t('conceptsByStatus all -> empty', conceptsByStatus('all').length === 0);
t('searchConcepts empty -> all (none)', searchConcepts('').length === 0);
t('status labels intact', STATUSES.every((s) => STATUS_LABELS[s]));

// --- Kept storage (pure helpers; localStorage guarded) ---
t('toggleKept adds', toggleKept([], 'g001').join() === 'g001');
t('toggleKept removes', toggleKept(['g001'], 'g001').length === 0);
t('toggleKept keeps others', toggleKept(['g001', 'g002'], 'g001').join() === 'g002');
t('loadKept safe without localStorage', Array.isArray(loadKept()));
t('saveKept safe without localStorage', saveKept(['g001']) === true);

// --- No museum asset files remain on disk ---
const museumDir = join(root, 'public', 'textures', 'museum');
let leftover = [];
if (existsSync(museumDir)) {
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else leftover.push(p);
    }
  };
  walk(museumDir);
}
t('no files left under public/textures/museum/ (' + leftover.length + ' leftover)', leftover.length === 0);
if (leftover.length) console.error('  leftover:', leftover.slice(0, 5).join(', '));

// --- Page file sanity: Photos + Videos only ---
const page = readFileSync(join(root, 'app/museum/page.jsx'), 'utf8');
t('page has Photos tab', /Photos/.test(page));
t('page has Videos tab', /Videos/.test(page));
t('page has no concepts wing', !/concepts/i.test(page));
t('page has empty-wing state', /empty-wing/.test(page));
t('page has lightbox', /lightbox/i.test(page));
t('page has video room', /<video/i.test(page));
t('page has no hardcoded museum asset paths', !/textures\/museum\//.test(page));
t('page clears radio/Safari bar (safe-area)', /safe-area-inset-bottom/.test(page));
t('page uses fx (no custom audio)', /from '@\/lib\/fx'/.test(page));
t('page has no external URLs', !/https?:\/\/(?!www\.w3\.org)[a-z]/i.test(page.replace(/aria-label="Close"/g, '')));
t('page has no telemetry', !/central_telemetry|cerberus_telemetry|analytics\.track|gtag\(/.test(page));
t('page fetch() calls are same-origin app APIs only (gallery commerce)',
  [...page.matchAll(/fetch\(\s*['"`]([^'"`]+)['"`]/g)].every((m) => m[1].startsWith('/api/')));

console.log(`\nmuseum: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
