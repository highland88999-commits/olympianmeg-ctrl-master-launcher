// tests/ares-lock.test.mjs — Headless tests for the ARES owner lock.
// Run: node tests/ares-lock.test.mjs (from the repo root).
// No browser, no network — asserts on lib/ares/server.js pure helpers plus
// source-level checks that the page gate and every dashboard data route
// enforce Merlin's owner check before touching evidence.
import { readFileSync } from 'fs';
import {
  ARES_OWNER_EMAIL,
  isOwnerEmail,
  requireOwner,
} from '../lib/ares/server.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- the owner identity (same email as the Babel Keeper seal) ---
t('owner email is olympiannexus@gmail.com', ARES_OWNER_EMAIL === 'olympiannexus@gmail.com');
t('keeper seal uses the same owner email',
  src('../app/api/babel/vault/gate/route.js').includes("OWNER_EMAIL = 'olympiannexus@gmail.com'"));

// --- isOwnerEmail: pure, case-insensitive, fail-closed ---
t('owner email matches', isOwnerEmail({ email: 'olympiannexus@gmail.com' }) === true);
t('match is case-insensitive', isOwnerEmail({ email: 'OlympianNexus@Gmail.COM' }) === true);
t('trims whitespace', isOwnerEmail({ email: '  olympiannexus@gmail.com ' }) === true);
t('another signed-in user is NOT the owner', isOwnerEmail({ email: 'someone@else.com' }) === false);
t('null user is not the owner', isOwnerEmail(null) === false);
t('undefined user is not the owner', isOwnerEmail(undefined) === false);
t('user without email is not the owner', isOwnerEmail({}) === false);
t('empty email is not the owner', isOwnerEmail({ email: '' }) === false);
t('similar-but-different email is not the owner',
  isOwnerEmail({ email: 'olympiannexus@gmail.com.evil.com' }) === false);
t('requireOwner is exported for routes', typeof requireOwner === 'function');

// --- page gate ---
{
  const page = src('../app/ares/page.jsx');
  t('page calls the owner gate endpoint', page.includes('/api/ares/gate'));
  t('page posts the access token to the gate', page.includes('access_token'));
  t('page has a locked screen component', page.includes('LockedScreen'));
  t('locked screen is on-brand (restricted to the throne)',
    page.toLowerCase().includes('restricted to the throne'));
  t('locked screen prompts signed-out visitors to sign in',
    page.includes('Go sign in'));
  t('no silent auto-redirect for non-owners', !page.includes("router.push('/')"));
  t('gate fails closed (unverified stays locked)',
    page.includes("setGate('locked')") && page.includes('Fail closed'));
  t('dashboard renders only when the gate opens', page.includes("gate !== 'open'"));
  t('no alert() pop-ups', !page.includes('alert('));
}

// --- gate route mirrors the Keeper seal ---
{
  const gate = src('../app/api/ares/gate/route.js');
  t('gate validates the token server-side (auth.getUser)', gate.includes('auth.getUser('));
  t('gate returns 401 when the token is missing/invalid',
    gate.includes('401'));
  t('gate returns 403 for a non-owner session', gate.includes('403'));
  t('gate returns 200 only for the owner',
    gate.includes('isOwnerEmail(data.user)') && gate.includes('ok: true'));
  t('gate never logs credentials', !/console\.log/.test(gate));
}

// --- every dashboard data route enforces the owner check ---
const DATA_ROUTES = [
  ['../app/api/ares/events/route.js', 1],   // GET
  ['../app/api/ares/blocks/route.js', 2],   // GET, DELETE
  ['../app/api/ares/whitelist/route.js', 3], // GET, POST, DELETE
  ['../app/api/ares/settings/route.js', 2],  // GET, POST
  ['../app/api/ares/training/route.js', 1],  // GET
];
for (const [p, handlers] of DATA_ROUTES) {
  const r = src(p);
  const label = p.split('/').slice(-2, -1)[0];
  t(`${label}: imports isOwnerEmail`, r.includes('isOwnerEmail'));
  const checks = (r.match(/if \(!isOwnerEmail\(user\)\)/g) || []).length;
  t(`${label}: owner check on all ${handlers} handler(s)`, checks === handlers);
  t(`${label}: 401 for missing/invalid token`, r.includes("status: 401"));
  t(`${label}: 403 for non-owner sessions`, r.includes("status: 403"));
  // The lock must come before any evidence query — no data leaks into
  // locked responses.
  const lockAt = r.indexOf('if (!isOwnerEmail(user))');
  const queryAt = r.indexOf('.from(');
  t(`${label}: owner check runs before the first DB query`, lockAt !== -1 && lockAt < queryAt);
  t(`${label}: nothing fetched before the lock`, queryAt === -1 || lockAt < queryAt);
}

// --- internal routes are untouched (shared-secret, not dashboard) ---
for (const p of ['../app/api/ares/ingest/route.js', '../app/api/ares/check/route.js']) {
  const r = src(p);
  const label = p.split('/').slice(-2, -1)[0];
  t(`${label}: still uses the internal shared secret`, r.includes('checkInternal'));
  t(`${label}: not switched to the dashboard owner check`, !r.includes('isOwnerEmail'));
}

// --- honesty: the settings POST (module toggles) is privileged too ---
{
  const s = src('../app/api/ares/settings/route.js');
  const postIdx = s.indexOf('export const POST');
  const lockInPost = s.indexOf('if (!isOwnerEmail(user))', postIdx);
  t('settings POST (Sentinel/Phalanx toggles) requires the owner', postIdx !== -1 && lockInPost !== -1);
}

console.log(`\nares-lock: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
