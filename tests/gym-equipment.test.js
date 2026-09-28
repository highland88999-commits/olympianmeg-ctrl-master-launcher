// tests/gym-equipment.test.js
// Headless tests for the INNODIGYM Quantum Arcade module.
// Run: node tests/gym-equipment.test.js (from the repo root).
// No browser, no network — asserts on route source.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const src = readFileSync('app/gym-equipment/page.jsx', 'utf8');
const launcher = readFileSync('app/page.jsx', 'utf8');
const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// --- telemetry & externals stripped ---
t('no central_telemetry', !/central_telemetry/.test(code));
t('no ipify', !/ipify/.test(code));
t('no supabase', !/supabase/i.test(code));
t('no catbox video', !/catbox/.test(code));
t('no unpkg/jsdelivr importmap', !/unpkg/.test(code) && !/jsdelivr/.test(code) && !/importmap/.test(code));
t('no Google Fonts', !/fonts\.googleapis/.test(code));
t('no redirect to innodigym.com', !/innodigym\.com\/products/.test(code));
t('no fetch() calls', !/fetch\(/.test(code));

// --- content & interactivity present ---
t('title is "INNODIGYM | QUANTUM ARCADE"', /INNODIGYM \| QUANTUM ARCADE/.test(src));
t('tiered particle field rendered in canvas 2D', /getContext\('2d'\)/.test(src) && /quantum platform/.test(src));
t('impact text sequence present', /SYNC NOW!/.test(src) && /KAPOW!/.test(src));
t('tap triggers sync burst', /burstRef\.current =/.test(src));
t('spec sheet panel present', /SPEC SHEET/.test(src) && /Digital Strength/.test(src));
t('motion preference persisted', /quantum-arcade\.prefs/.test(src));

t('registry links route /gym-equipment', registry.includes("route: \"/gym-equipment\"") && registry.includes("key: \"gym-equipment\""));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
