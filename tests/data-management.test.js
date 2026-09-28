// tests/data-management.test.js
// Headless tests for the Mission Control module. Run: node tests/data-management.test.js
// (from the repo root). No browser, no network — asserts on route source.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const src = readFileSync('app/data-management/page.jsx', 'utf8');
const launcher = readFileSync('app/page.jsx', 'utf8');
const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// --- external requests stripped ---
t('no Google Fonts link', !/fonts\.googleapis/.test(code));
t('no CDN script URLs', !/https:\/\/cdn\./.test(code) && !/unpkg/.test(code) && !/cdnjs/.test(code));
t('no telemetry', !/central_telemetry|track_ping|ipify/.test(code));
t('no fetch() calls', !/fetch\(/.test(code));

// --- content & interactivity present ---
t('title is "PROJECT OLYMPUS // MISSION CONTROL"', /PROJECT OLYMPUS \/\/ MISSION CONTROL/.test(src));
t('all 5 decks defined', /HOME DECK/.test(src) && /SYNAPSE OS/.test(src));
t('deck position persists via localStorage', /mission-control\.deck/.test(src));
t('node matrix renders 60 nodes', /NODE_COUNT = 60/.test(src));
t('fault drill + reset controls present', /Run fault drill/.test(src) && /Reset all nodes/.test(src));
t('nodes are tappable with state cycling', /cycleNode/.test(src) && /aria-label={`Node/.test(src));
t('swipe support for mobile', /onTouchStart/.test(src) && /onTouchEnd/.test(src));
t('wave canvas background is canvas 2D', /getContext\('2d'\)/.test(src));
t('exascale metrics present', /3\.0 EXAFLOPS/.test(src) && /333,334 NODES/.test(src));

t('registry links route /data-management', registry.includes("route: \"/data-management\"") && registry.includes("key: \"data-management\""));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
