// tests/rainbow-wok.test.js
// Headless tests for the Rainbow Wok lounge terminal.
// Run: node tests/rainbow-wok.test.js (from the repo root).
// No browser, no network — asserts on route source.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const src = readFileSync('app/rainbow-wok/page.jsx', 'utf8');
const launcher = readFileSync('app/page.jsx', 'utf8');
const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// --- externals stripped ---
t('no CDN script URLs', !/https:\/\/unpkg\.com/.test(code) && !/es-module-shims/.test(code));
t('no three.js', !/import \* as THREE/.test(code));
t('no telemetry', !/central_telemetry|track_ping|ipify/.test(code));
t('no fetch() calls', !/fetch\(/.test(code));

// --- content & interactivity present ---
t('title is "Rainbow Wok & Grill - Interactive Lounge Terminal"', /Rainbow Wok & Grill - Interactive Lounge Terminal/.test(src));
t('menu has 8 apps', (src.match(/apps: \[/) ? (src.split('grill: [')[0].match(/price: \d/g) || []).length : 0) === 8);
t('menu has 7 grill items', (src.match(/grill: \[/) ? (src.split('grill: [')[1].split('wok: [')[0].match(/price: \d/g) || []).length : 0) === 7);
t('menu has 8 wok items', (src.match(/wok: \[/) ? (src.split('wok: [')[1].split('lounge: [')[0].match(/price: \d/g) || []).length : 0) === 8);
t('menu has 6 lounge drinks', (src.match(/lounge: \[/) ? (src.split('lounge: [')[1].split('];')[0].match(/price: \d/g) || []).length : 0) === 6);
t('all 6 tabs present', /Apps & Shares/.test(src) && /Bow Blends/.test(src) && /Hours & Location/.test(src));
t('order tray persisted to localStorage', /rainbow-wok\.tray/.test(src));
t('quick-add ribbon chips exist', /rw-chip/.test(src) && /Quick-add menu items/.test(src));
t('send-to-kitchen dispatch is local-only', /Send to Kitchen/.test(src) && /staged/.test(src));
t('hours & location panel with phone and maps link', /780-942-2388/.test(src) && /google\.com\/maps/.test(src));

t('registry links route /rainbow-wok', registry.includes("route: \"/rainbow-wok\"") && registry.includes("key: \"rainbow-wok\""));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
