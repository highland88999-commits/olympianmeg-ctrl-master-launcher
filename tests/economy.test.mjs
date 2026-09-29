// tests/economy.test.mjs
// Headless tests for the gold in-house credit economy.
// Run: node tests/economy.test.mjs (from the repo root). No browser, no network.
import {
  ECONOMY, computeGoldDiscount, centsForGold, goldForCents, formatGold,
} from '../lib/economy/config.js';
import {
  applyLedger, creditGold, debitGold, getBalance,
  EconomyUnavailableError, InsufficientGoldError, CapReachedError,
} from '../lib/economy/ledger.js';
import { applyGoldCheckout } from '../lib/economy/checkout.js';
import { validateMineClaim, mineSellKey } from '../lib/economy/mining.js';
import { heartbeatIdemKey } from '../lib/economy/heartbeat.js';
import { newState, pourTick, refineTick, sellBars, TICK } from '../app/liquid-gold/engine.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Fake Supabase: mirrors supabase/gold.sql's gold_apply() semantics ----
class FakeSupabase {
  constructor() {
    this.ledger = [];
    this.balances = new Map();
    this.keys = new Map();
    this.onBeforeDebit = null;
  }
  async rpc(name, p) {
    if (name !== 'gold_apply') return { data: null, error: { message: 'unknown function' } };
    if (this.keys.has(p.p_idempotency_key)) {
      const e = this.keys.get(p.p_idempotency_key);
      return { data: [{ entry_id: e.id, balance_after: e.balance_after, was_duplicate: true, capped: false, insufficient: false }], error: null };
    }
    const uid = p.p_user_id;
    const bal = this.balances.get(uid) ?? 0;
    if (p.p_cap_group && p.p_cap_limit && p.p_delta > 0) {
      const day = new Date().toISOString().slice(0, 10);
      const sum = this.ledger
        .filter((r) => r.user_id === uid && r.reason.startsWith(p.p_cap_group + ':') && r.created_at.slice(0, 10) === day && r.delta > 0)
        .reduce((s, r) => s + r.delta, 0);
      if (sum + p.p_delta > p.p_cap_limit) {
        return { data: [{ entry_id: null, balance_after: bal, was_duplicate: false, capped: true, insufficient: false }], error: null };
      }
    }
    if (p.p_delta < 0 && this.onBeforeDebit) this.onBeforeDebit(uid);
    const balNow = this.balances.get(uid) ?? 0;
    if (balNow + p.p_delta < 0) {
      return { data: [{ entry_id: null, balance_after: balNow, was_duplicate: false, capped: false, insufficient: true }], error: null };
    }
    const entry = {
      id: `e${this.ledger.length}`, user_id: uid, delta: p.p_delta,
      balance_after: balNow + p.p_delta, reason: p.p_reason,
      idempotency_key: p.p_idempotency_key, meta: p.p_meta,
      created_at: new Date().toISOString(),
    };
    this.ledger.push(entry);
    this.keys.set(p.p_idempotency_key, entry);
    this.balances.set(uid, entry.balance_after);
    return { data: [{ entry_id: entry.id, balance_after: entry.balance_after, was_duplicate: false, capped: false, insufficient: false }], error: null };
  }
  from(table) {
    const self = this;
    return {
      select() { return this; },
      eq(col, val) { this._val = val; return this; },
      async maybeSingle() {
        if (table !== 'gold_balances') return { data: null, error: { message: 'nope' } };
        const b = self.balances.get(this._val);
        return { data: b === undefined ? null : { balance: b }, error: null };
      },
    };
  }
}

// --- config: discount math -------------------------------------------------
{
  // Partial cover: 499¢ bill, 200 gold -> 200¢ off, 200 gold spent, 299¢ card.
  let d = computeGoldDiscount(200, 499);
  t('partial cover math', d.discountCents === 200 && d.goldToSpend === 200 && d.chargeCents === 299 && d.paidByGold === false);

  // Full cover: balance exceeds bill -> paid by gold, no card charge.
  d = computeGoldDiscount(1000, 499);
  t('full cover', d.discountCents === 499 && d.goldToSpend === 499 && d.chargeCents === 0 && d.paidByGold === true);

  // Exact cover.
  d = computeGoldDiscount(499, 499);
  t('exact cover is paid-by-gold', d.paidByGold === true && d.chargeCents === 0);

  // Zero balance -> no discount, full card charge.
  d = computeGoldDiscount(0, 499);
  t('zero balance', d.discountCents === 0 && d.goldToSpend === 0 && d.chargeCents === 499 && !d.paidByGold);

  // Remainder below Stripe's $0.50 minimum -> apply less gold, charge exactly 50¢.
  d = computeGoldDiscount(190, 200);
  t('sub-minimum remainder lands on 50c', d.chargeCents === 50 && d.discountCents === 150 && d.goldToSpend === 150 && !d.paidByGold);

  // Remainder of exactly 50¢ is fine as-is.
  d = computeGoldDiscount(150, 200);
  t('50c remainder untouched', d.chargeCents === 50 && d.discountCents === 150);

  // Gold can never exceed the bill (no negative charge, no change).
  d = computeGoldDiscount(999999, 200);
  t('discount never exceeds bill', d.discountCents === 200 && d.chargeCents === 0 && d.paidByGold);

  // Whole cents only: fractional gold value stays as gold.
  t('centsForGold floors', centsForGold(199) === 199);
  t('goldForCents: 1 cent needs 1 gold', goldForCents(1) === 1);
  t('goldForCents: $1 needs 100 gold', goldForCents(100) === 100);
  t('rate default 100 gold = $1', ECONOMY.GOLD_PER_DOLLAR === 100);
  t('formatGold', formatGold(1500) === '1,500 gold (≈ $15.00)');
}

// --- ledger: append-only, idempotent, no-negative, caps --------------------
{
  const db = new FakeSupabase();
  const u = 'user-1';

  const c1 = await creditGold({ userId: u, amountGold: 100, reason: 'mining:liquid-gold', idemKey: 'k1' }, db);
  t('credit returns new balance', c1.balanceAfter === 100 && !c1.wasDuplicate);

  // Double-submit: same key -> duplicate, balance unchanged (append-only).
  const c2 = await creditGold({ userId: u, amountGold: 100, reason: 'mining:liquid-gold', idemKey: 'k1' }, db);
  t('double credit is a no-op', c2.wasDuplicate && c2.balanceAfter === 100 && db.ledger.length === 1);

  const d1 = await debitGold({ userId: u, amountGold: 40, reason: 'spend:test', idemKey: 'k2' }, db);
  t('debit reduces balance', d1.balanceAfter === 60);

  const d2 = await debitGold({ userId: u, amountGold: 40, reason: 'spend:test', idemKey: 'k2' }, db);
  t('double debit is a no-op', d2.wasDuplicate && d2.balanceAfter === 60 && db.ledger.length === 2);

  let insufficient = false;
  try {
    await debitGold({ userId: u, amountGold: 61, reason: 'spend:test', idemKey: 'k3' }, db);
  } catch (e) { insufficient = e instanceof InsufficientGoldError && e.status === 409; }
  t('overdraft refused with 409', insufficient);
  t('failed debit leaves no row', db.ledger.length === 2);

  const bal = await getBalance(u, db);
  t('balance reads current truth', bal === 60);

  // Daily cap: engagement group capped at ECONOMY.ENGAGEMENT_DAILY_CAP.
  const db2 = new FakeSupabase();
  const u2 = 'user-2';
  for (let i = 0; i < ECONOMY.ENGAGEMENT_DAILY_CAP; i++) {
    await creditGold({ userId: u2, amountGold: 1, reason: 'engagement:heartbeat', idemKey: `e${i}`, capGroup: 'engagement', capLimit: ECONOMY.ENGAGEMENT_DAILY_CAP }, db2);
  }
  let capped = false;
  try {
    await creditGold({ userId: u2, amountGold: 1, reason: 'engagement:heartbeat', idemKey: 'e-cap', capGroup: 'engagement', capLimit: ECONOMY.ENGAGEMENT_DAILY_CAP }, db2);
  } catch (e) { capped = e instanceof CapReachedError && e.status === 429; }
  t('engagement daily cap enforced', capped);
  t('capped credit leaves no row', db2.ledger.length === ECONOMY.ENGAGEMENT_DAILY_CAP);

  // Mining cap is independent of engagement cap.
  await creditGold({ userId: u2, amountGold: 25, reason: 'mining:liquid-gold', idemKey: 'm1', capGroup: 'mining', capLimit: ECONOMY.MINING_DAILY_CAP }, db2);
  t('mining cap group is separate', db2.ledger.length === ECONOMY.ENGAGEMENT_DAILY_CAP + 1);

  // Unconfigured service -> honest 503-style error, never a fake balance.
  let unavailable = false;
  try { await getBalance(u, null); } catch (e) { unavailable = e instanceof EconomyUnavailableError && e.status === 503; }
  t('missing supabase -> EconomyUnavailableError', unavailable);

  // Invalid mutations rejected.
  let bad = false;
  try { await applyLedger({ userId: u, delta: 0, reason: 'x', idemKey: 'z' }, db); } catch (e) { bad = e.status === 400; }
  t('zero delta rejected', bad);
}

// --- heartbeat idempotency keys --------------------------------------------
{
  const minuteAligned = 1_700_000_000_000 - (1_700_000_000_000 % 60000);
  const k1 = heartbeatIdemKey('u', minuteAligned);
  const k2 = heartbeatIdemKey('u', minuteAligned + 59_999);
  const k3 = heartbeatIdemKey('u', minuteAligned + 60_000);
  t('same minute -> same key', k1 === k2);
  t('next minute -> different key', k1 !== k3);
  t('key embeds user', k1.includes('u'));
}

// --- mining replay ----------------------------------------------------------
function playSession() {
  // Play exactly like app/liquid-gold/page.jsx: actions stamped with
  // completed ticks; tick loop advances now first, then pour/refine.
  const log = [];
  const st = newState();
  const tickIndex = () => Math.round(st.now / TICK);
  log.push({ t: tickIndex(), a: 'pour', on: true });
  st.pouring = true;
  let k = 0;
  while (st.bars < 1 && k < 5000) {
    st.now += TICK; pourTick(st, TICK); refineTick(st, TICK); k++;
  }
  if (st.bars < 1) throw new Error('test session never minted');
  log.push({ t: tickIndex(), a: 'sell' });
  return { log, tickCount: tickIndex() };
}
{
  const { log, tickCount } = playSession();
  const res = validateMineClaim({ log, tickCount });
  t('honest session validates', res.ok === true);
  t('replay proves exactly one bar', res.ok && res.sells.length === 1 && res.sells[0].bars === 1);
  t('replay value matches engine', res.ok && res.sells[0].gameValue === 72);

  // Fabricated riches: a sell with no play behind it proves zero bars.
  const fake = validateMineClaim({ log: [{ t: 0, a: 'sell' }], tickCount: 1 });
  t('sell with no play proves 0 bars', fake.ok && fake.sells[0].bars === 0);

  // Malformed claims rejected.
  t('empty log rejected', !validateMineClaim({ log: [], tickCount: 10 }).ok);
  t('oversized tick count rejected', !validateMineClaim({ log, tickCount: 999999 }).ok);
  t('action past end rejected', !validateMineClaim({ log: [...log, { t: tickCount + 5, a: 'pour', on: true }], tickCount }).ok);
  t('unknown action rejected', !validateMineClaim({ log: [{ t: 0, a: 'fly' }], tickCount: 1 }).ok);

  // Prefix hashes are stable and distinct per sell.
  const { log: log2, tickCount: tc2 } = playSession();
  const r2 = validateMineClaim({ log: log2, tickCount: tc2 });
  t('prefix hash deterministic', r2.ok && mineSellKey('u', r2.sells[0].prefixHash) === mineSellKey('u', r2.sells[0].prefixHash));

  // Multi-sell log: continued play credits each new sell exactly once.
  const st = newState();
  const log3 = [];
  const ti = () => Math.round(st.now / TICK);
  const run = (n) => { for (let i = 0; i < n; i++) { st.now += TICK; pourTick(st, TICK); refineTick(st, TICK); } };
  log3.push({ t: ti(), a: 'pour', on: true }); st.pouring = true;
  while (st.bars < 1) run(10);
  const bars1 = st.bars;
  log3.push({ t: ti(), a: 'sell' }); sellBars(st);
  while (st.bars < 1) run(10);
  log3.push({ t: ti(), a: 'sell' });
  const r3 = validateMineClaim({ log: log3, tickCount: ti() });
  t('two sells both proven', r3.ok && r3.sells.length === 2 && r3.sells[0].bars === bars1 && r3.sells[1].bars >= 1);
  t('sell prefixes differ', r3.ok && r3.sells[0].prefixHash !== r3.sells[1].prefixHash);
}

// --- checkout: gold debit-before-stripe, idempotent retries ------------------
function fakeStripe({ failCreate = false } = {}) {
  const calls = [];
  const sessions = new Map();
  return {
    calls,
    checkout: {
      sessions: {
        create: async (params, opts) => {
          calls.push({ params, idemKey: opts?.idempotencyKey });
          if (failCreate) throw new Error('stripe down');
          const key = opts?.idempotencyKey || `k${calls.length}`;
          if (!sessions.has(key)) sessions.set(key, { url: `https://stripe.test/s/${sessions.size}`, id: `cs_${sessions.size}` });
          return sessions.get(key);
        },
      },
    },
  };
}
{
  // Partial gold: balance 200, bill 499 -> debit 200 gold, charge 299¢.
  const db = new FakeSupabase();
  await creditGold({ userId: 'u', amountGold: 200, reason: 'mining:liquid-gold', idemKey: 'fund' }, db);
  const stripe = fakeStripe();
  const r = await applyGoldCheckout({
    surface: 'test', userId: 'u', totalCents: 499, useGold: true, idemKey: 'a1',
    stripe,
    buildSessionParams: async ({ amountCents, gold }) => ({ amount: amountCents, gold }),
    fulfillPaidByGold: async () => ({ done: true }),
  }, db);
  t('partial: stripe path', r.type === 'stripe' && r.chargeCents === 299);
  t('partial: session charged discounted amount', stripe.calls[0].params.amount === 299);
  t('partial: gold debited', db.ledger.filter((e) => e.delta < 0).length === 1 && db.balances.get('u') === 0);
  t('partial: stripe idempotency key set', stripe.calls[0].idemKey === 'goldco_test_a1');

  // Double-submit same idemKey: no second debit, same session.
  const r2 = await applyGoldCheckout({
    surface: 'test', userId: 'u', totalCents: 499, useGold: true, idemKey: 'a1',
    stripe,
    buildSessionParams: async ({ amountCents, gold }) => ({ amount: amountCents, gold }),
    fulfillPaidByGold: async () => ({ done: true }),
  }, db);
  t('retry: same session reused', r2.url === r.url);
  t('retry: no second debit', db.ledger.filter((e) => e.delta < 0).length === 1);

  // Full cover: no Stripe call at all, fulfillment runs.
  const db2 = new FakeSupabase();
  await creditGold({ userId: 'u', amountGold: 1000, reason: 'mining:liquid-gold', idemKey: 'fund' }, db2);
  const stripe2 = fakeStripe();
  let fulfilled = 0;
  const r3 = await applyGoldCheckout({
    surface: 'test', userId: 'u', totalCents: 499, useGold: true, idemKey: 'b1',
    stripe: stripe2,
    buildSessionParams: async () => ({}),
    fulfillPaidByGold: async () => { fulfilled++; return { ok: true }; },
  }, db2);
  t('full cover skips stripe', r3.type === 'gold' && stripe2.calls.length === 0 && fulfilled === 1);
  t('full cover debits exact bill', db2.balances.get('u') === 1000 - 499);

  // Race: balance vanishes between quote and debit -> 409, NO stripe call.
  const db3 = new FakeSupabase();
  await creditGold({ userId: 'u', amountGold: 500, reason: 'mining:liquid-gold', idemKey: 'fund' }, db3);
  db3.onBeforeDebit = (uid) => db3.balances.set(uid, 0); // someone else spends first
  const stripe3 = fakeStripe();
  let race409 = false;
  try {
    await applyGoldCheckout({
      surface: 'test', userId: 'u', totalCents: 499, useGold: true, idemKey: 'c1',
      stripe: stripe3,
      buildSessionParams: async () => ({}),
      fulfillPaidByGold: async () => ({}),
    }, db3);
  } catch (e) { race409 = e.status === 409; }
  t('race: 409 not 500', race409);
  t('race: stripe never touched', stripe3.calls.length === 0);

  // Stripe fails after debit -> compensating credit refunds the gold.
  // (Balance 200 < bill 499, so this takes the card path, not paid-by-gold.)
  const db4 = new FakeSupabase();
  await creditGold({ userId: 'u', amountGold: 200, reason: 'mining:liquid-gold', idemKey: 'fund' }, db4);
  const stripe4 = fakeStripe({ failCreate: true });
  let threw = false;
  try {
    await applyGoldCheckout({
      surface: 'test', userId: 'u', totalCents: 499, useGold: true, idemKey: 'd1',
      stripe: stripe4,
      buildSessionParams: async () => ({}),
      fulfillPaidByGold: async () => ({}),
    }, db4);
  } catch (e) { threw = true; }
  t('stripe failure surfaces', threw);
  t('stripe failure refunds gold', db4.balances.get('u') === 200);
  t('refund is a separate ledger row', db4.ledger.length === 3); // fund + debit + refund

  // Plain checkout (no gold): full amount, no ledger writes.
  const db5 = new FakeSupabase();
  const stripe5 = fakeStripe();
  const r5 = await applyGoldCheckout({
    surface: 'test', userId: 'u', totalCents: 499, useGold: false, idemKey: 'e1',
    stripe: stripe5,
    buildSessionParams: async ({ amountCents }) => ({ amount: amountCents }),
    fulfillPaidByGold: async () => ({}),
  }, db5);
  t('no-gold path charges full bill', r5.type === 'stripe' && stripe5.calls[0].params.amount === 499);
  t('no-gold path writes no ledger rows', db5.ledger.length === 0);

  // useGold with no idemKey -> 400.
  let badKey = false;
  try {
    await applyGoldCheckout({
      surface: 'test', userId: 'u', totalCents: 499, useGold: true, idemKey: '',
      stripe: stripe5, buildSessionParams: async () => ({}),
    }, db5);
  } catch (e) { badKey = e.status === 400; }
  t('gold without idemKey rejected', badKey);
}

console.log(`\neconomy: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
