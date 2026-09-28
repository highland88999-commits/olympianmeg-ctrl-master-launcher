// tests/user-profile.test.js
// Headless tests for the Reader Vault module. Run: node tests/user-profile.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';

const src = readFileSync('app/user-profile/page.jsx', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- content ---
t('renders the Reader Vault header', /Reader Vault/.test(src));
t('has reader alias editing', /Reader alias/.test(src));
t('has reader bio editing', /Reader bio/.test(src));
t('has avatar upload', /Upload profile picture/.test(src));
t('has all three vault tabs', /Permanent Library/.test(src) && /Active Rentals/.test(src) && /Saved Artifacts/.test(src));
t('can add artifacts', /\+ Add/.test(src));
t('rentals track days remaining', /left on rental/.test(src) && /due/.test(src));
t('profile and vault persist locally', /reader-vault/.test(src));
t('hero is a local canvas starfield', /getContext\('2d'\)/.test(src));

// --- audit: telemetry, secrets, and external requests must not ship ---
t('no central_telemetry', !/central_telemetry/.test(src));
t('no ipify', !/ipify/.test(src));
t('no supabase client or auth flow', !/supabase/i.test(src));
t('no hardcoded tracking keys', !/logBrainAction|track_ping|nexus_visitor_id|createClient|eyJhbGciOi/.test(src));
t('no file.garden video', !/file\.garden/.test(src));
t('no external URLs at all', !/https?:\/\//.test(src));
t('no source contact email', !/stakeme10000/.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
