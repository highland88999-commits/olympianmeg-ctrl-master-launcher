// tests/phone-home-steps.test.mjs — Headless tests for the /phone-home step counter.
// Run (from the repo root): node tests/phone-home-steps.test.mjs
// No browser, no network. The TS sources are imported directly — Node 24
// strips types natively, so no pre-compile step is needed.
// Covers: totals math, upsert semantics, offline queue behavior, the health-sync
// stub contract, SQL sanity (string checks), and page source checks. No
// browser, no network, no fake data.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function eq(name, actual, expected) {
  t(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    JSON.stringify(actual) === JSON.stringify(expected));
}

const {
  todayKey, clampSteps, totalSteps, findTodayEntry, upsertLocal,
  mergeQueueEntry, readQueue, writeQueue, STEPS_QUEUE_KEY, STEPS_QUEUE_MAX,
} = await import('../lib/phone-home/steps.ts');
const { mobilePhaseHealthSync } = await import('../lib/health/sync.ts');

// --- todayKey ---------------------------------------------------------------
t('todayKey matches YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(todayKey()));
eq('todayKey formats a known local date', todayKey(new Date(2026, 8, 29)), '2026-09-29');

// --- clampSteps -------------------------------------------------------------
eq('clampSteps accepts numeric string', clampSteps('12345'), 12345);
eq('clampSteps accepts number', clampSteps(5000), 5000);
eq('clampSteps accepts zero', clampSteps(0), 0);
eq('clampSteps floors floats (no phantom precision)', clampSteps('12.9'), 12);
t('clampSteps rejects negatives', clampSteps('-3') === null);
t('clampSteps rejects NaN text', clampSteps('abc') === null);
t('clampSteps rejects empty string', clampSteps('   ') === null);
t('clampSteps rejects Infinity', clampSteps(Infinity) === null);

// --- totalSteps -------------------------------------------------------------
eq('totalSteps sums rows', totalSteps([{ steps: 100 }, { steps: 250 }]), 350);
eq('totalSteps empty → 0', totalSteps([]), 0);
eq('totalSteps ignores non-finite values', totalSteps([{ steps: NaN }, { steps: 40 }]), 40);

// --- findTodayEntry / upsertLocal (PK semantics) ----------------------------
const u = 'user-1';
const rows = [
  { user_id: u, step_date: '2026-09-28', steps: 3000 },
  { user_id: u, step_date: '2026-09-29', steps: 8000 },
];
t('findTodayEntry finds today', findTodayEntry(rows, '2026-09-29')?.steps === 8000);
t('findTodayEntry returns null when unlogged', findTodayEntry(rows, '2026-09-30') === null);

const replaced = upsertLocal(rows, { user_id: u, step_date: '2026-09-29', steps: 9500 });
eq('upsertLocal replaces same (user, date)', replaced.length, 2);
eq('upsertLocal new value wins', findTodayEntry(replaced, '2026-09-29').steps, 9500);
const appended = upsertLocal(rows, { user_id: u, step_date: '2026-09-30', steps: 100 });
eq('upsertLocal appends new date', appended.length, 3);
t('upsertLocal does not mutate input', rows[1].steps === 8000);

// --- offline queue ----------------------------------------------------------
function memStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
  };
}
eq('queue key is namespaced', STEPS_QUEUE_KEY, 'phone_home_steps_queue');

let q = [];
q = mergeQueueEntry(q, { user_id: u, step_date: '2026-09-29', steps: 100, queuedAt: '2026-09-29T10:00:00Z' });
q = mergeQueueEntry(q, { user_id: u, step_date: '2026-09-29', steps: 400, queuedAt: '2026-09-29T11:00:00Z' });
eq('queue dedupes same (user, date)', q.length, 1);
eq('queue latest write wins', q[0].steps, 400);
q = mergeQueueEntry(q, { user_id: 'user-2', step_date: '2026-09-29', steps: 5, queuedAt: '2026-09-29T12:00:00Z' });
eq('queue keeps other users', q.length, 2);

let big = [];
for (let i = 0; i < STEPS_QUEUE_MAX + 10; i++) {
  big = mergeQueueEntry(big, {
    user_id: u,
    step_date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    steps: i,
    queuedAt: `2026-09-29T00:${String(i).padStart(2, '0')}:00Z`.slice(0, 20) + ':00Z',
  });
}
t('queue is capped', big.length <= STEPS_QUEUE_MAX);

const store = memStore();
eq('readQueue empty store → []', readQueue(store), []);
writeQueue(store, q);
const reread = readQueue(store);
eq('queue round-trips through storage', reread.length, 2);
t('queued entry survives with steps', reread.some((e) => e.steps === 400));
store.setItem(STEPS_QUEUE_KEY, 'not json{{{');
eq('readQueue corrupt JSON → []', readQueue(store), []);
store.setItem(STEPS_QUEUE_KEY, JSON.stringify([{ user_id: u, step_date: 'x', steps: -5, queuedAt: 't' }, null, 'junk']));
eq('readQueue filters invalid entries', readQueue(store), []);

// --- health sync stub -------------------------------------------------------
const stub = await mobilePhaseHealthSync.getSteps('2026-09-29');
eq('stub resolves unsupported', stub, { supported: false, reason: 'mobile-phase' });
t('stub carries no steps field', !('steps' in stub));

// --- SQL sanity (supabase/steps.sql) ----------------------------------------
const sql = readFileSync(path.join(repoRoot, 'supabase/steps.sql'), 'utf8');
const low = sql.toLowerCase();
t('sql creates user_steps', low.includes('create table if not exists public.user_steps'));
t('sql PK is (user_id, step_date)', low.includes('primary key (user_id, step_date)'));
t('sql enforces steps >= 0', /check\s*\(\s*steps\s*>=\s*0\s*\)/.test(low));
t('sql enables RLS', low.includes('enable row level security'));
t('sql has owner-only select policy', low.includes('for select') && low.includes('auth.uid() = user_id'));
t('sql has owner-only insert policy', low.includes('for insert') && low.includes('auth.uid() = user_id'));
t('sql has owner-only update policy', low.includes('for update') && low.includes('auth.uid() = user_id'));
t('sql creates global_step_totals view', low.includes('create or replace view public.global_step_totals'));
t('view sums steps', low.includes('sum(steps)'));
t('view counts distinct walkers', low.includes('count(distinct user_id)'));
t('view granted to authenticated only', low.includes('grant select on public.global_step_totals to authenticated'));
t('view revoked from anon/public', low.includes('revoke all on public.global_step_totals'));
t('sql documents privacy property', low.includes('aggregate only'));

// --- page source checks -----------------------------------------------------
const page = readFileSync(path.join(repoRoot, 'app/phone-home/page.tsx'), 'utf8');
t('page has Steps card heading', page.includes('>Steps</h2>'));
t('page has Log steps button', page.includes('Log steps'));
t('page shows Your total', page.includes('Your total'));
t('page labels global as universal', page.includes('total — universal'));
t('page has honest offline state', page.includes('Saved on this device'));
t('page notes manual-entry for now', page.includes('Manual entry for now'));
t('page reads the global view', page.includes("from('global_step_totals')"));
t('page upserts on (user_id, step_date)', page.includes("onConflict: 'user_id,step_date'"));
t('page drains queue on load', page.includes('readQueue(localStorage)'));
t('page has a Steps footer tab', page.includes('>Steps</span>'));
t('page keeps safe-area clearance', page.includes('env(safe-area-inset-bottom)'));
t('page has no currency anywhere', !/(\$|token|coin|credit)/i.test(page.match(/PAGE 4: Steps[\s\S]*?section>/)?.[0] ?? ''));

// --- stub source checks -----------------------------------------------------
const stubSrc = readFileSync(path.join(repoRoot, 'lib/health/sync.ts'), 'utf8');
t('stub file documents mobile-phase wiring', stubSrc.includes('mobile-phase'));
t('stub forbids fake data', stubSrc.includes('NO fake'));
const stepsLib = readFileSync(path.join(repoRoot, 'lib/phone-home/steps.ts'), 'utf8');
t('steps lib has no fake data generation', !/Math\.random|Math\.floor\(Math/.test(stepsLib));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
