// tests/project-khaos.test.js
// Headless tests for the Project Khaos simulation chamber. Run: node tests/project-khaos.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';

const src = readFileSync('app/project-khaos/page.jsx', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- honest auction framing ---
t('banner names the auction as simulated with demo credits', /SIMULATED AUCTION · DEMO CREDITS · NO REAL MONEY/.test(src));
t('rival bidders are labeled simulated, never live', /SIMULATED RIVALS/.test(src) && !/RIVAL BIDDERS LIVE/.test(src));
t('tiers are labeled simulation demos', /SIMULATION DEMO/.test(src));

// --- audit: telemetry and external calls must not ship ---
t('no central_telemetry', !/central_telemetry/.test(src));
t('no ipify', !/ipify/.test(src));
t('no supabase client', !/supabase/i.test(src));
t('no hardcoded tracking keys', !/logBrainAction|track_ping|nexus_visitor_id|createClient|eyJhbGciOi/.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
