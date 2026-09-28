// tests/referral-system.test.js
// Headless tests for the Referral System module. Run: node tests/referral-system.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';

const src = readFileSync('app/referral-system/page.jsx', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- content ---
t('renders the hook headline', /Command Your Legion/.test(src));
t('has the architecture slide', /The Architecture/.test(src));
t('has all three pillars', /Frictionless Payouts/.test(src) && /Immersive Brand Elevation/.test(src) && /True Viral Distribution/.test(src));
t('has the $3,500 CAD setup price', /\$3,500/.test(src) && /CAD/.test(src));
t('has the referral calculator inputs', /Avg\. order value/.test(src) && /Referrer reward/.test(src) && /Active referrers/.test(src) && /Conversion rate/.test(src));
t('calculator projects payouts, revenue, margin', /Referrer payouts/.test(src) && /Referred revenue/.test(src) && /Margin after payouts/.test(src));
t('persists calculator inputs to localStorage', /localStorage.*referral-calc|referral-calc.*localStorage/.test(src));
t('copy brief button exists', /Copy program brief/.test(src));

// --- audit: telemetry, secrets, and external requests must not ship ---
t('no central_telemetry', !/central_telemetry/.test(src));
t('no ipify', !/ipify/.test(src));
t('no supabase', !/supabase/i.test(src));
t('no hardcoded keys or tracking scripts', !/logBrainAction|track_ping|nexus_visitor_id|createClient/.test(src));
t('no external URLs at all', !/https?:\/\//.test(src));
t('no personal contact details', !/stakeme10000|3688852145/.test(src));
t('no affiliate/demo funnel links', !/valkyries-of-olympus|meet-the-gods/.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
