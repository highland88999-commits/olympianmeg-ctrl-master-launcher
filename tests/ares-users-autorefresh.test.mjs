// tests/ares-users-autorefresh.test.mjs — the registered-users list in the
// threat monitor updates itself when a new user registers, with no
// intervention (no Refresh tap, no reload).
// Run: node tests/ares-users-autorefresh.test.mjs (from the repo root).
// No browser, no network — source-level checks on the console page and
// the users route.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const page = src('../app/ares/page.jsx');
const route = src('../app/api/ares/users/route.js');
const manager = src('../components/ares/UsersManager.jsx');

// The data basis: the users route reads Supabase Auth directly, so a new
// registration is visible to the endpoint at once — no separate table
// that could fall behind and need a manual sync.
t('users route lists Supabase Auth accounts directly',
  route.includes('admin.auth.admin.listUsers'));
t('users route carries the ban flag with each account',
  route.includes("ares_user_bans") && route.includes('banned:'));

// The console polls that endpoint on its own.
t('console page polls on an interval', page.includes('setInterval'));
t('poll interval is 15 seconds', page.includes('setInterval(tick, 15000)'));
t('poll fetches the users endpoint', page.includes("authedFetch('/api/ares/users')"));
t('poll writes the fresh list into state', page.includes('setRegUsers(us.users)'));
t('poll only updates when the payload is a user array',
  page.includes('Array.isArray(us.users)'));
t('poll starts only once authenticated', page.includes('if (!token) return undefined;'));
t('poll is cleared on cleanup', page.includes('clearInterval(id)'));

// The list itself is untouched: same rows, same Ban/Lift actions.
t('users manager still renders the allowlist',
  manager.includes('Registered users · Allowlist'));
t('users manager still offers Ban and Lift',
  manager.includes('Ban') && manager.includes('Lift'));

console.log(`ares-users-autorefresh: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
