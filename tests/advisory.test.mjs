// tests/advisory.test.mjs
// Headless tests for the Phone Home advisory dismissal logic (lib/advisory.js):
// keying, per-user scoping, and the Supabase-unreachable fallback.
// Run: node tests/advisory.test.mjs  (from the repo root).
// No browser, no network — Supabase is a hand-rolled mock.
import {
  ADVISORY_KEY,
  ADVISORY_COPY,
  ADVISORY_TABLE,
  localDismissalKey,
  hasLocalDismissal,
  markLocalDismissal,
  isDismissedInCloud,
  loadDismissal,
  recordDismissal,
} from '../lib/advisory.js';

// --- node localStorage shim -------------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => { store.delete(String(k)); },
  clear: () => store.clear(),
};

// --- supabase mock ----------------------------------------------------------
const DB_ERROR = Symbol('db-error');

function makeMock({ cloudRow = null, upsertError = null } = {}) {
  const calls = [];
  const selectChain = {
    eq(col, val) { calls.push(['eq', col, val]); return selectChain; },
    async maybeSingle() {
      calls.push(['maybeSingle']);
      if (cloudRow === DB_ERROR) return { data: null, error: new Error('db down') };
      return { data: cloudRow, error: null };
    },
  };
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(cols) { calls.push(['select', cols]); return selectChain; },
        async upsert(row, opts) {
          calls.push(['upsert', row, opts]);
          return { error: upsertError };
        },
      };
    },
  };
}

function callsOf(mock, name) {
  return mock.calls.filter((c) => c[0] === name);
}

// --- harness ----------------------------------------------------------------
let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function reset() { store.clear(); }

// --- 1. keying --------------------------------------------------------------
reset();
t('advisory key is exact', ADVISORY_KEY === 'phone-home-travel-2026-09');
t('table name is exact', ADVISORY_TABLE === 'advisory_dismissals');
t('copy is exact', ADVISORY_COPY ===
  'Heads up: Phone Home is not a 911 or emergency service. ' +
  'Calls need a data connection, and your carrier may charge roaming fees when you travel.');
t('local keys are namespaced per advisory',
  localDismissalKey('key-a') !== localDismissalKey('key-b') &&
  localDismissalKey('key-a').includes('key-a'));

// --- 2. localStorage fallback ------------------------------------------------
reset();
t('not dismissed locally at first', !hasLocalDismissal(ADVISORY_KEY));
t('mark writes the flag', markLocalDismissal(ADVISORY_KEY) === true);
t('has reads the flag', hasLocalDismissal(ADVISORY_KEY) === true);
t('other advisory untouched', !hasLocalDismissal('some-other-advisory'));

// --- 3. cloud read scoping --------------------------------------------------
{
  reset();
  const mock = makeMock({ cloudRow: { user_id: 'user-1' } });
  const dismissed = await isDismissedInCloud(mock, 'user-1', ADVISORY_KEY);
  t('cloud row -> dismissed', dismissed === true);
  t('reads the advisory_dismissals table', callsOf(mock, 'from').some((c) => c[1] === 'advisory_dismissals'));
  t('filters by user_id', callsOf(mock, 'eq').some((c) => c[1] === 'user_id' && c[2] === 'user-1'));
  t('filters by advisory_key', callsOf(mock, 'eq').some((c) => c[1] === 'advisory_key' && c[2] === ADVISORY_KEY));
}
{
  reset();
  const mock = makeMock({ cloudRow: null });
  t('no cloud row -> not dismissed', (await isDismissedInCloud(mock, 'user-1', ADVISORY_KEY)) === false);
}

// --- 4. per-user scoping: different users are independent --------------------
{
  reset();
  const alice = makeMock({ cloudRow: { user_id: 'alice' } });
  const bob = makeMock({ cloudRow: null });
  const a = await isDismissedInCloud(alice, 'alice', ADVISORY_KEY);
  const b = await isDismissedInCloud(bob, 'bob', ADVISORY_KEY);
  t('alice dismissed, bob not', a === true && b === false);
  t('alice query carried her own user_id', callsOf(alice, 'eq').some((c) => c[1] === 'user_id' && c[2] === 'alice'));
  t('bob query carried his own user_id', callsOf(bob, 'eq').some((c) => c[1] === 'user_id' && c[2] === 'bob'));
}

// --- 5. loadDismissal ---------------------------------------------------------
{
  reset();
  const mock = makeMock({ cloudRow: { user_id: 'u1' } });
  t('cloud dismissal -> "cloud"', (await loadDismissal(mock, 'u1', ADVISORY_KEY)) === 'cloud');
}
{
  reset();
  const mock = makeMock({ cloudRow: null });
  t('no dismissal anywhere -> null', (await loadDismissal(mock, 'u1', ADVISORY_KEY)) === null);
}
{
  reset();
  const mock = makeMock({ cloudRow: DB_ERROR });
  markLocalDismissal(ADVISORY_KEY);
  t('db down + local flag -> "local"', (await loadDismissal(mock, 'u1', ADVISORY_KEY)) === 'local');
}
{
  reset();
  const mock = makeMock({ cloudRow: DB_ERROR });
  t('db down + no local flag -> null (banner shows)', (await loadDismissal(mock, 'u1', ADVISORY_KEY)) === null);
}
{
  reset();
  markLocalDismissal(ADVISORY_KEY);
  t('no userId -> local path only', (await loadDismissal(makeMock(), null, ADVISORY_KEY)) === 'local');
}

// --- 6. recordDismissal -------------------------------------------------------
{
  reset();
  const mock = makeMock();
  const via = await recordDismissal(mock, 'user-9', ADVISORY_KEY);
  t('cloud success -> "cloud"', via === 'cloud');
  const upserts = callsOf(mock, 'upsert');
  t('one upsert', upserts.length === 1);
  t('upsert carries the user_id (per-user)', upserts[0][1].user_id === 'user-9');
  t('upsert carries the advisory_key', upserts[0][1].advisory_key === ADVISORY_KEY);
  t('upsert conflicts on the (user_id, advisory_key) key', upserts[0][2].onConflict === 'user_id,advisory_key');
  t('no local flag needed when cloud works', !hasLocalDismissal(ADVISORY_KEY));
}
{
  reset();
  const mock = makeMock({ upsertError: new Error('network down') });
  const via = await recordDismissal(mock, 'user-9', ADVISORY_KEY);
  t('cloud failure -> "local"', via === 'local');
  t('local flag set on failure', hasLocalDismissal(ADVISORY_KEY) === true);
}
{
  reset();
  let threw = false;
  try {
    await recordDismissal(makeMock({ upsertError: new Error('boom') }), 'u', ADVISORY_KEY);
  } catch { threw = true; }
  t('recordDismissal never throws', !threw);
}
{
  reset();
  const mock = makeMock();
  const via = await recordDismissal(mock, null, ADVISORY_KEY);
  t('no userId -> local, no upsert attempted', via === 'local' && callsOf(mock, 'upsert').length === 0);
}

// --- 7. per-user writes: two users get two distinct rows -----------------------
{
  reset();
  const mock = makeMock();
  await recordDismissal(mock, 'alice', ADVISORY_KEY);
  await recordDismissal(mock, 'bob', ADVISORY_KEY);
  const rows = callsOf(mock, 'upsert').map((c) => c[1]);
  t('two users -> two upserts', rows.length === 2);
  t('rows scoped to each user',
    rows[0].user_id === 'alice' && rows[1].user_id === 'bob' &&
    rows.every((r) => r.advisory_key === ADVISORY_KEY));
}

console.log(`\nadvisory: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
