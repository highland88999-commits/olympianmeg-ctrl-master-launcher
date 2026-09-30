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
t('supabase is only the inquiry insert — no tracking reads',
  /supabase\.from\('referral_inquiries'\)\.insert/.test(src) &&
  !/supabase\.from\('(?!referral_inquiries)/.test(src) &&
  !/\.select\(\)/.test(src));
t('no hardcoded keys or tracking scripts', !/logBrainAction|track_ping|nexus_visitor_id|createClient/.test(src));
t('no external http(s) URLs', !/https?:\/\//.test(src));
t('no personal contact details', !/stakeme10000|3688852145/.test(src));
t('no affiliate/demo funnel links', !/valkyries-of-olympus|meet-the-gods/.test(src));

// --- inquiry path (the $3,500 CAD sketch now has a real way to ask) ---
t('inquiry form exists', /Request this build/.test(src) && /Send inquiry/.test(src));
t('inquiry asks for name, email, company, message',
  /Your name/.test(src) && /id="rs-iq-email"/.test(src) && /Company/.test(src) && /What are you building/.test(src));
t('inquiry validates before sending', /validateInquiry/.test(src));
t('offline fallback queues on-device and says so plainly',
  /queueInquiry/.test(src) && /Saved on this device/.test(src) && /hasn&apos;t reached us|hasn't reached us/.test(src));
t('fallback offers an email route', /Open it in your email app/.test(src) && /buildInquiryMailto/.test(src));
const queuedMatch = src.match(/iqState === 'queued' && \(([\s\S]*?)<\/div>\s*\)\}/);
t('queued state never says "sent" — only saved on this device',
  !!queuedMatch && /Saved on this device/.test(queuedMatch[1]) && !/Inquiry received|inquiry sent/i.test(queuedMatch[1]));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
