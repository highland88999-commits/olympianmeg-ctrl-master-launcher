// tests/billboard-requests.test.mjs — User-facing billboard requests +
// wallet credit + subscriptions (Merlin, 2026-10-27).
// Run: node tests/billboard-requests.test.mjs (from the repo root).
//
// Rules under test:
// - Settled price rule: base $10 rotating / $25 solo CAD; EXACTLY ONE
//   override — at 1,000,000 registered users prices become $50/$200.
//   The notice fires at 990,000 users. No other triggers.
// - Ownership cap: one billboard per satellite per advertiser; solo
//   and rotating both count; paused counts; cancelled does not.
// - Renewal math: calendar month with day clamp; active + past end
//   is due; paused is never "due" (it resumes, not renews).
// - Pause is real: paused + cancelled triples drop manifest entries;
//   a board emptied by the drop falls back to base inventory.
// - Notice exactly-once: a user with a notice row is never swept again.
// - Credit separation: the CAD credit ledger uses its own tables,
//   never the earnings wallet, never gold/aether.
// - Load limits: $5 minimum, $1,000 maximum per load (route source pin).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BILLBOARD_BASE_PRICES,
  BILLBOARD_MILLION_PRICES,
  PRICE_RISE_USER_THRESHOLD,
  PRICE_NOTICE_USER_THRESHOLD,
  priceTierForUserCount,
  noticeThresholdReached,
  priceForPlan,
  isValidPlan,
  formatCad,
} from '../lib/billboards/pricing.js';
import {
  SATELLITE_ORDER,
  satelliteIndexForBillboard,
  satelliteNameForBillboard,
  capCheck,
  capMessage,
  addOneMonth,
  renewalDue,
  dropPausedEntries,
  dropPausedOverrides,
} from '../lib/billboards/subscriptions.js';
import {
  usersNeedingNotice,
  stoppedTriples,
} from '../lib/billboards/price-check.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// --- settled price rule ---
check('base prices are $10 rotating / $25 solo CAD', () => {
  assert.equal(BILLBOARD_BASE_PRICES.rotating.cents, 1000);
  assert.equal(BILLBOARD_BASE_PRICES.solo.cents, 2500);
});

check('million prices are $50 rotating / $200 solo CAD', () => {
  assert.equal(BILLBOARD_MILLION_PRICES.rotating.cents, 5000);
  assert.equal(BILLBOARD_MILLION_PRICES.solo.cents, 20000);
});

check('thresholds are exactly 990,000 (notice) and 1,000,000 (rise)', () => {
  assert.equal(PRICE_NOTICE_USER_THRESHOLD, 990000);
  assert.equal(PRICE_RISE_USER_THRESHOLD, 1000000);
});

check('tier stays base below 1,000,000 and flips exactly at 1,000,000', () => {
  assert.equal(priceTierForUserCount(13), 'base');
  assert.equal(priceTierForUserCount(989999), 'base');
  assert.equal(priceTierForUserCount(999999), 'base');
  assert.equal(priceTierForUserCount(1000000), 'million');
  assert.equal(priceTierForUserCount(1500000), 'million');
});

check('notice threshold reached exactly at 990,000', () => {
  assert.equal(noticeThresholdReached(989999), false);
  assert.equal(noticeThresholdReached(990000), true);
  assert.equal(noticeThresholdReached(1000000), true);
});

check('priceForPlan follows the tier, never a scattered literal', () => {
  assert.equal(priceForPlan('rotating', 'base'), 1000);
  assert.equal(priceForPlan('solo', 'base'), 2500);
  assert.equal(priceForPlan('rotating', 'million'), 5000);
  assert.equal(priceForPlan('solo', 'million'), 20000);
  assert.equal(priceForPlan('rotating'), 1000); // default is the base tier
  assert.equal(priceForPlan('bogus', 'base'), null);
  assert.equal(isValidPlan('rotating'), true);
  assert.equal(isValidPlan('solo'), true);
  assert.equal(isValidPlan('gold'), false);
  assert.equal(formatCad(1000), '$10.00 CAD');
  assert.equal(formatCad(20000), '$200.00 CAD');
});

// --- satellite mapping ---
check('satellite order matches the 11 god towers', () => {
  assert.deepEqual(SATELLITE_ORDER, [
    'ARES', 'APOLLO', 'HERMES', 'HEPHAESTUS', 'ATHENA', 'ARTEMIS',
    'HESTIA', 'DIONYSUS', 'PLUTUS', 'APHRODITE', 'UTILITIES',
  ]);
});

check('all 44 billboard numbers map to the right satellite', () => {
  for (let n = 1; n <= 44; n++) {
    const expected = SATELLITE_ORDER[Math.floor((n - 1) / 4)];
    assert.equal(satelliteNameForBillboard(n), expected, `billboard ${n}`);
  }
  assert.equal(satelliteIndexForBillboard(1), 0);
  assert.equal(satelliteIndexForBillboard(4), 0);
  assert.equal(satelliteIndexForBillboard(5), 1);
  assert.equal(satelliteIndexForBillboard(44), 10);
  assert.equal(satelliteIndexForBillboard(0), null);
  assert.equal(satelliteIndexForBillboard(45), null);
  assert.equal(satelliteIndexForBillboard(1.5), null);
});

// --- ownership cap ---
check('cap blocks a second billboard on the same satellite', () => {
  const held = [{ billboardNumber: 5, status: 'active' }]; // APOLLO tower (5–8)
  const v = capCheck(held, 8);
  assert.ok(v);
  assert.equal(v.satelliteName, 'APOLLO');
  assert.equal(v.existingBillboard, 5);
  assert.match(capMessage(v), /already hold a billboard on the APOLLO satellite/);
  assert.match(capMessage(v), /One billboard per satellite per advertiser/);
});

check('cap counts rotating face-slots and paused subscriptions too', () => {
  const rotatingHeld = [{ billboardNumber: 33, status: 'active' }]; // PLUTUS
  assert.ok(capCheck(rotatingHeld, 36)); // solo on the same tower still blocked
  const pausedHeld = [{ billboardNumber: 2, status: 'paused' }]; // ARES
  assert.ok(capCheck(pausedHeld, 3));
});

check('cap allows different satellites and frees cancelled ones', () => {
  const held = [{ billboardNumber: 5, status: 'active' }];
  assert.equal(capCheck(held, 9), null); // HERMES tower, not APOLLO
  assert.equal(capCheck(held, 44), null);
  const cancelled = [{ billboardNumber: 5, status: 'cancelled' }];
  assert.equal(capCheck(cancelled, 8), null);
  assert.equal(capCheck([], 1), null);
  assert.deepEqual(capCheck(held, 0), { invalid: true });
});

// --- renewal math ---
check('addOneMonth is a calendar month with day clamp', () => {
  assert.equal(addOneMonth(new Date('2026-01-15T00:00:00Z')).toISOString(), '2026-02-15T00:00:00.000Z');
  assert.equal(addOneMonth(new Date('2026-01-31T00:00:00Z')).toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(addOneMonth(new Date('2026-12-15T00:00:00Z')).toISOString(), '2027-01-15T00:00:00.000Z');
});

check('renewalDue only for active subscriptions past period end', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  assert.equal(renewalDue({ status: 'active', period_end: '2026-10-31T00:00:00Z' }, now), true);
  assert.equal(renewalDue({ status: 'active', period_end: '2026-11-02T00:00:00Z' }, now), false);
  assert.equal(renewalDue({ status: 'paused', period_end: '2026-10-31T00:00:00Z' }, now), false);
  assert.equal(renewalDue({ status: 'cancelled', period_end: '2026-10-31T00:00:00Z' }, now), false);
});

// --- pause is real ---
check('dropPausedEntries removes exactly the paused triple', () => {
  const entries = [
    { company: 'Acme', link: 'https://acme.example' },
    { company: 'Beta', link: 'https://beta.example' },
  ];
  const paused = new Set(['5|Acme|https://acme.example']);
  assert.deepEqual(dropPausedEntries(entries, 5, paused), [{ company: 'Beta', link: 'https://beta.example' }]);
  assert.deepEqual(dropPausedEntries(entries, 6, paused), entries); // other billboard untouched
  assert.deepEqual(dropPausedEntries(entries, 5, new Set()), entries);
});

check('dropPausedOverrides drops boards emptied by the pause', () => {
  const map = new Map([
    [5, { intervalSeconds: 15, entries: [{ company: 'Acme', link: 'https://acme.example' }] }],
    [6, { intervalSeconds: 15, entries: [{ company: 'Beta', link: 'https://beta.example' }] }],
  ]);
  const out = dropPausedOverrides(map, [{ billboardNumber: 5, company: 'Acme', link: 'https://acme.example' }]);
  assert.equal(out.has(5), false); // falls back to base inventory
  assert.equal(out.has(6), true);
  assert.deepEqual(dropPausedOverrides(map, []), map);
});

// --- notice exactly-once + opt-out shape ---
check('usersNeedingNotice fires exactly once per advertiser', () => {
  assert.deepEqual(usersNeedingNotice(['u1', 'u2', 'u2'], ['u1']), ['u2']);
  assert.deepEqual(usersNeedingNotice(['u1'], ['u1']), []);
  assert.deepEqual(usersNeedingNotice([], []), []);
});

check('stoppedTriples covers paused and cancelled, never active', () => {
  const subs = [
    { billboard_number: 5, company_name: 'A', link_url: 'https://a.example', status: 'paused' },
    { billboard_number: 6, company_name: 'B', link_url: 'https://b.example', status: 'cancelled' },
    { billboard_number: 7, company_name: 'C', link_url: 'https://c.example', status: 'active' },
  ];
  assert.deepEqual(stoppedTriples(subs), [
    { billboardNumber: 5, company: 'A', link: 'https://a.example' },
    { billboardNumber: 6, company: 'B', link: 'https://b.example' },
  ]);
});

// --- credit separation + load limits (source pins) ---
check('CAD credit ledger uses its own tables, never the earnings wallet', () => {
  const src = read('lib/billboards/credit.js');
  assert.ok(src.includes('wallet_credit_balances'), 'credit balances table');
  assert.ok(src.includes('wallet_credit_transactions'), 'credit transactions table');
  assert.ok(!src.includes("from('wallets')"), 'never touches the earnings wallet');
  const imports = src.split('\n').filter((l) => l.trim().startsWith('import'));
  assert.ok(!imports.some((l) => l.includes('wallet/ledger')), 'never imports the earnings ledger');
  assert.ok(!imports.some((l) => l.includes('economy/ledger') || l.includes('economy/aether')), 'never imports gold/aether ledgers');
});

check('load limits are $5 minimum and $1,000 maximum per load', () => {
  const src = read('app/api/wallet/load/route.js');
  assert.ok(src.includes('LOAD_MIN_CENTS = 500'), 'min $5');
  assert.ok(src.includes('LOAD_MAX_CENTS = 100000'), 'max $1,000');
  assert.ok(src.includes("mode: 'payment'"), 'one-time payment, not a subscription');
  assert.ok(src.includes("surface: 'wallet-load'"), 'wallet-load metadata');
});

check('load route exports no extra consts (Next route type rule)', () => {
  const src = read('app/api/wallet/load/route.js');
  assert.ok(!src.includes('export const LOAD_MIN_CENTS'), 'no exported min const');
  assert.ok(!src.includes('export const LOAD_MAX_CENTS'), 'no exported max const');
});

check('webhook credits the full gross and is idempotent on session id', () => {
  const src = read('app/api/wallet/webhook/route.js');
  assert.ok(src.includes("reference: `wallet-load:${session.id}`"), 'session idempotency key');
  assert.ok(src.includes('amountCents: gross'), 'full gross credited');
  assert.ok(src.includes("meta.surface !== 'wallet-load'"), 'ignores other surfaces');
});

check('price-check cron is the only tier switch (no client tier claim)', () => {
  const subscribe = read('app/api/billboard-requests/subscribe/route.js');
  assert.ok(subscribe.includes('getPriceState(admin)'), 'subscribe reads cached price state');
  assert.ok(!subscribe.includes('body?.tier') && !subscribe.includes('body.tier'), 'no client tier claim');
  const cron = read('app/api/billboard-requests/price-check-cron/route.js');
  assert.ok(cron.includes('countRegisteredUsers(admin)'), 'cron counts users');
  assert.ok(cron.includes('updatePriceState(admin, registeredUsers)'), 'cron writes price state');
  assert.ok(cron.includes('PRICE_NOTICE_USER_THRESHOLD'), 'notice threshold gated');
});

console.log(`\nbillboard-requests: ${passed} passed`);
