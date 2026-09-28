// tests/blueprint-protocol.test.js
// Headless tests for the Blueprint Protocol module. Run: node tests/blueprint-protocol.test.js
// (from the repo root). No browser, no network — asserts on route source.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const src = readFileSync('app/blueprint-protocol/page.jsx', 'utf8');
const launcher = readFileSync('app/page.jsx', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// --- telemetry stripped ---
t('no central_telemetry', !/central_telemetry/.test(code));
t('no ipify', !/ipify/.test(code));
t('no track_ping uplink', !/track_ping/.test(code));
t('no supabase references', !/supabase/i.test(code));
t('no CDN script URLs', !/https:\/\/cdn\./.test(code) && !/cdnjs/.test(code) && !/unpkg/.test(code));
t('no hardcoded anon JWT', !/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(code));
t('no fetch() calls to third parties', !/fetch\(/.test(code));

// --- content & interactivity present ---
t('title is "Olympus | Blueprint Protocol"', /Olympus \| Blueprint Protocol/.test(src));
t('all 6 sections defined', /economics/.test(src) && /midas/.test(src));
t('allocation matrix has 7 pillars', (src.match(/The Genesis Presale|Foundation Treasury|Aetheris R&D Pool|Ecosystem Forge|Philanthropy Pool|Valkyrie Rewards|Governance Buffer/g) || []).length >= 7);
t('epoch stepper present with 3 epochs', /EPOCHS/.test(src) && /Epoch 3: Scaled Infrastructure/.test(src));
t('canvas 2D particle vortex (no three.js)', /getContext\('2d'\)/.test(src) && !/THREE/.test(src));
t('document title set for launcher', /document\.title = TITLE/.test(src));

t('launcher menu links route /blueprint-protocol', launcher.includes("launchPocketUniverse('/blueprint-protocol'"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
