// tests/omega-postal.test.js
// Headless tests for the Nexus Postal Hub module.
// Run: node tests/omega-postal.test.js (from the repo root).
// No browser, no network — asserts on route source.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const src = readFileSync('app/omega-postal/page.jsx', 'utf8');
const launcher = readFileSync('app/page.jsx', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// --- telemetry & externals stripped ---
t('no central_telemetry', !/central_telemetry/.test(code));
t('no ipify', !/ipify/.test(code));
t('no supabase', !/supabase/i.test(code));
t('no track_ping uplink', !/track_ping/.test(code));
t('no catbox/file.garden videos', !/catbox/.test(code) && !/file\.garden/.test(code));
t('no jsdelivr three.js importmap', !/jsdelivr/.test(code) && !/importmap/.test(code));
t('no fetch() calls', !/fetch\(/.test(code));

// --- content & interactivity present ---
t('title is "Nexus Vortex – The Postal Hub"', /Nexus Vortex – The Postal Hub/.test(src));
t('landing -> orbiting -> zooming -> inside state machine', /LANDING/.test(src) && /ORBITING/.test(src) && /ZOOMING/.test(src) && /INSIDE/.test(src));
t('4 sorting rings defined', /createRing|Sorting rings/.test(src) || (src.match(/rings = \[/) !== null));
t('mail swarm with SORTING/DISPATCHED states', /SORTING/.test(src) && /DISPATCHED/.test(src));
t('procedural sky replaces video textures', /createLinearGradient/.test(src));
t('live feed HUD with package counter', /Packages sorted/.test(src));
t('volume slider + dispatch burst controls', /DISPATCH BURST/.test(src) && /Mail volume/.test(src));

t('launcher menu links route /omega-postal', launcher.includes("launchPocketUniverse('/omega-postal'"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
