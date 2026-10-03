// tests/connect.test.mjs
// Headless tests for Stripe Connect payouts:
// - connect-not-enabled error detection (graceful 503 path)
// - idempotency keys: deterministic, unique per (run_key, kind, user_id)
// - threshold filtering ($20), exact-cent math
// - dry-run lists payees without moving money
// - confirm pays once; a repeated run with the same run_key pays nothing
// - performer unpaid = ledger share - already-paid payouts
// - Merlin gate (only olympiannexus@gmail.com runs payouts)
// Run: node --test tests/connect.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isConnectOwner,
  CONNECT_OWNER_EMAIL,
  CONNECT_MIN_PAYOUT_CENTS,
  payoutIdempotencyKey,
  meetsPayoutThreshold,
  isConnectNotEnabledError,
  CONNECT_NOT_ENABLED_MESSAGE,
  connectStatusLabel,
} from '../lib/connect.js';
import {
  connectAccountReady,
  createExpressAccount,
  executePayoutRun,
} from '../lib/connect/server.js';
import { ledgerFromTickets } from '../lib/persymphony/tickets.js';

// ---------------------------------------------------------------------------
// In-memory fake Supabase admin client (chainable, like supabase-js).
// ---------------------------------------------------------------------------
function makeFakeAdmin(seed = {}) {
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  return {
    _tables: tables,
    from(name) {
      if (!tables[name]) tables[name] = [];
      const rows = tables[name];
      return {
        select() {
          const filters = [];
          let limitN = null;
          const builder = {
            eq(col, val) { filters.push((r) => r[col] === val); return builder; },
            in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
            limit(n) { limitN = n; return builder; },
            order() { return builder; },
            maybeSingle() {
              const m = filtered();
              return Promise.resolve({ data: m[0] ?? null, error: null });
            },
            then(res, rej) {
              return Promise.resolve({ data: filtered(), error: null }).then(res, rej);
            },
          };
          function filtered() {
            const out = rows.filter((r) => filters.every((f) => f(r)));
            return limitN == null ? out : out.slice(0, limitN);
          }
          return builder;
        },
        upsert(obj, { onConflict } = {}) {
          const matchCol = onConflict === 'user_id' ? 'user_id'
            : onConflict === 'idempotency_key' ? 'idempotency_key' : null;
          if (matchCol) {
            const ex = rows.find((r) => r[matchCol] === obj[matchCol]);
            if (ex) {
              Object.assign(ex, obj);
              return Promise.resolve({ data: [ex], error: null });
            }
          }
          const row = { id: `row-${rows.length + 1}`, ...obj };
          rows.push(row);
          return Promise.resolve({ data: [row], error: null });
        },
        update(patch) {
          const filters = [];
          const builder = {
            eq(col, val) { filters.push((r) => r[col] === val); return builder; },
            in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
            then(res, rej) {
              for (const r of rows) if (filters.every((f) => f(r))) Object.assign(r, patch);
              return Promise.resolve({ data: null, error: null }).then(res, rej);
            },
          };
          return builder;
        },
      };
    },
  };
}

function makeFakeStripe({ failTransfersWith = null } = {}) {
  const created = [];
  return {
    transfers: {
      created,
      async create(params, opts) {
        if (failTransfersWith) throw failTransfersWith;
        created.push({ params, opts });
        return { id: `tr_test_${created.length}` };
      },
    },
    accounts: {
      async create() { return { id: 'acct_test_123' }; },
    },
  };
}

// A performer whose tickets net a known performer share.
function performerSeed() {
  return {
    ps_performers: [{ id: 'perf-1', user_id: 'userD' }],
    ps_shows: [{ id: 'show-1', performer_id: 'perf-1' }],
    // gross 12000c, fees 889c -> net 11111c -> performer 90% = 10000c (rounded)
    ps_tickets: [{ show_id: 'show-1', amount_cents: 12000, stripe_fee_cents: 889 }],
    connect_accounts: [
      { user_id: 'userD', stripe_account_id: 'acct_D', onboarding_status: 'ready' },
    ],
    connect_payouts: [],
  };
}

describe('Merlin gate', () => {
  it('only olympiannexus@gmail.com is the owner', () => {
    assert.ok(isConnectOwner({ email: 'olympiannexus@gmail.com' }));
    assert.ok(isConnectOwner({ email: 'OlympianNexus@Gmail.com' }));
    assert.ok(!isConnectOwner({ email: 'someone@else.com' }));
    assert.ok(!isConnectOwner({}));
    assert.ok(!isConnectOwner(null));
  });
  it('owner email constant', () => {
    assert.equal(CONNECT_OWNER_EMAIL, 'olympiannexus@gmail.com');
  });
});

describe('connect-not-enabled detection', () => {
  const notEnabled = {
    type: 'StripeInvalidRequestError',
    code: 'invalid_request_error',
    message: 'The platform account is not enabled for Connect. Complete onboarding at dashboard.stripe.com/connect.',
  };
  it('matches the platform-not-enabled shape', () => {
    assert.ok(isConnectNotEnabledError(notEnabled));
  });
  it('matches code-only shape', () => {
    assert.ok(isConnectNotEnabledError({
      code: 'invalid_request_error',
      message: 'You cannot create transfers: Connect has not been set up for this platform.',
    }));
  });
  it('rejects unrelated errors', () => {
    assert.ok(!isConnectNotEnabledError({ type: 'StripeCardError', message: 'card declined' }));
    assert.ok(!isConnectNotEnabledError({ type: 'StripeInvalidRequestError', message: 'No such customer' }));
    assert.ok(!isConnectNotEnabledError(null));
    assert.ok(!isConnectNotEnabledError('connect not enabled'));
  });
  it('honest message names the dashboard step', () => {
    assert.match(CONNECT_NOT_ENABLED_MESSAGE, /dashboard\.stripe\.com\/connect/);
  });
  it('createExpressAccount maps it to the honest error', async () => {
    const badStripe = {
      accounts: { async create() { throw notEnabled; } },
    };
    await assert.rejects(
      () => createExpressAccount(badStripe, { email: 'a@b.c', userId: 'u1', kind: 'affiliate' }),
      (e) => e.code === 'connect_not_enabled' && e.message === CONNECT_NOT_ENABLED_MESSAGE
    );
  });
});

describe('idempotency keys', () => {
  it('deterministic for the same inputs', () => {
    const a = payoutIdempotencyKey({ run_key: 'r1', kind: 'affiliate', user_id: 'u1' });
    const b = payoutIdempotencyKey({ run_key: 'r1', kind: 'affiliate', user_id: 'u1' });
    assert.equal(a, b);
  });
  it('unique per run, kind, and user', () => {
    const base = { run_key: 'r1', kind: 'affiliate', user_id: 'u1' };
    const keys = new Set([
      payoutIdempotencyKey(base),
      payoutIdempotencyKey({ ...base, run_key: 'r2' }),
      payoutIdempotencyKey({ ...base, kind: 'performer' }),
      payoutIdempotencyKey({ ...base, user_id: 'u2' }),
    ]);
    assert.equal(keys.size, 4);
  });
  it('throws on missing parts', () => {
    assert.throws(() => payoutIdempotencyKey({ run_key: '', kind: 'affiliate', user_id: 'u1' }));
  });
});

describe('threshold + labels', () => {
  it('$20 boundary', () => {
    assert.equal(CONNECT_MIN_PAYOUT_CENTS, 2000);
    assert.ok(!meetsPayoutThreshold(1999));
    assert.ok(meetsPayoutThreshold(2000));
    assert.ok(meetsPayoutThreshold(100000));
  });
  it('status labels', () => {
    assert.equal(connectStatusLabel('ready'), 'Payouts ready');
    assert.equal(connectStatusLabel('pending'), 'Setup in progress');
    assert.equal(connectStatusLabel('none'), 'Not set up');
    assert.equal(connectStatusLabel('bogus'), 'Not set up');
  });
  it('connectAccountReady needs charges AND payouts', () => {
    assert.ok(connectAccountReady({ charges_enabled: true, payouts_enabled: true }));
    assert.ok(!connectAccountReady({ charges_enabled: true, payouts_enabled: false }));
    assert.ok(!connectAccountReady({ charges_enabled: false, payouts_enabled: true }));
    assert.ok(!connectAccountReady(null));
  });
});

describe('executePayoutRun (mocked)', () => {
  function affiliateSeed() {
    return {
      aff_commissions: [
        { id: 'c1', affiliate_user_id: 'userA', source: 'store', source_id: 'o1', commission_cents: 3000, status: 'accrued' },
        { id: 'c2', affiliate_user_id: 'userA', source: 'tickets', source_id: 't1', commission_cents: 2000, status: 'accrued' },
        { id: 'c3', affiliate_user_id: 'userB', source: 'store', source_id: 'o2', commission_cents: 1500, status: 'accrued' },
        { id: 'c4', affiliate_user_id: 'userC', source: 'store', source_id: 'o3', commission_cents: 5000, status: 'accrued' },
        { id: 'c5', affiliate_user_id: 'userA', source: 'store', source_id: 'o9', commission_cents: 999, status: 'paid' },
      ],
      connect_accounts: [
        { user_id: 'userA', stripe_account_id: 'acct_A', onboarding_status: 'ready' },
        { user_id: 'userB', stripe_account_id: 'acct_B', onboarding_status: 'ready' },
        { user_id: 'userC', stripe_account_id: 'acct_C', onboarding_status: 'pending' },
      ],
      connect_payouts: [],
    };
  }

  it('dry-run lists payees, moves no money', async () => {
    const admin = makeFakeAdmin(affiliateSeed());
    const stripe = makeFakeStripe();
    const res = await executePayoutRun({ admin, stripe, run_key: 'dry1', dry_run: true });
    assert.ok(res.ok && res.dry_run);
    assert.equal(stripe.transfers.created.length, 0);
    const kinds = res.payees.map((p) => `${p.kind}:${p.user_id}:${p.status}`);
    // userA: 5000c accrued, ready -> would_pay (exact cents, paid c5 excluded)
    assert.ok(kinds.includes('affiliate:userA:would_pay'), kinds.join(','));
    const a = res.payees.find((p) => p.user_id === 'userA');
    assert.equal(a.amount_cents, 5000);
    // userB: 1500c < $20 -> not a candidate at all
    assert.ok(!kinds.some((k) => k.includes('userB')), kinds.join(','));
    // userC: 5000c but Connect pending -> skipped
    assert.ok(kinds.includes('affiliate:userC:skipped'), kinds.join(','));
    assert.equal(res.total_cents, 5000);
  });

  it('confirm pays once; same run_key retried pays nothing more', async () => {
    const admin = makeFakeAdmin(affiliateSeed());
    const stripe = makeFakeStripe();
    const first = await executePayoutRun({ admin, stripe, run_key: 'run1', dry_run: false });
    assert.ok(!first.dry_run);
    assert.equal(stripe.transfers.created.length, 1);
    const t = stripe.transfers.created[0];
    assert.equal(t.params.amount, 5000);
    assert.equal(t.params.destination, 'acct_A');
    assert.equal(t.params.currency, 'cad');
    assert.equal(t.opts.idempotencyKey, payoutIdempotencyKey({ run_key: 'run1', kind: 'affiliate', user_id: 'userA' }));
    // commission rows flipped to paid
    const rows = admin._tables.aff_commissions;
    assert.ok(rows.find((r) => r.id === 'c1').status === 'paid');
    assert.ok(rows.find((r) => r.id === 'c2').status === 'paid');
    assert.ok(rows.find((r) => r.id === 'c3').status === 'accrued'); // userB untouched
    // payout recorded
    const payouts = admin._tables.connect_payouts;
    assert.equal(payouts.length, 1);
    assert.equal(payouts[0].status, 'paid');
    assert.equal(payouts[0].stripe_transfer_id, 'tr_test_1');

    // Retry with the same run_key: nothing left to pay.
    const second = await executePayoutRun({ admin, stripe, run_key: 'run1', dry_run: false });
    assert.equal(stripe.transfers.created.length, 1);
    assert.ok(!second.payees.some((p) => p.status === 'paid'), JSON.stringify(second.payees));
  });

  it('performer unpaid = ledger share minus already-paid payouts', async () => {
    const seed = performerSeed();
    // ledger: gross 12000 - fees 889 = net 11111 -> performer 90% = 10000c
    const ledger = ledgerFromTickets(seed.ps_tickets);
    assert.equal(ledger.performer_share_cents, 10000);
    seed.connect_payouts = [
      { id: 'p1', payee_user_id: 'userD', kind: 'performer', amount_cents: 4000, status: 'paid', idempotency_key: 'old' },
    ];
    const admin = makeFakeAdmin(seed);
    const stripe = makeFakeStripe();
    const res = await executePayoutRun({ admin, stripe, run_key: 'dryP', dry_run: true });
    const d = res.payees.find((p) => p.user_id === 'userD');
    assert.ok(d, JSON.stringify(res.payees));
    assert.equal(d.kind, 'performer');
    assert.equal(d.amount_cents, 6000); // 10000 - 4000
    assert.equal(d.status, 'would_pay');
  });

  it('performer below threshold after payouts is excluded', async () => {
    const seed = performerSeed();
    seed.connect_payouts = [
      { id: 'p1', payee_user_id: 'userD', kind: 'performer', amount_cents: 9000, status: 'paid', idempotency_key: 'old' },
    ];
    const admin = makeFakeAdmin(seed);
    const res = await executePayoutRun({ admin, stripe: makeFakeStripe(), run_key: 'dryP2', dry_run: true });
    assert.ok(!res.payees.some((p) => p.user_id === 'userD'), JSON.stringify(res.payees));
  });

  it('transfer failure marks the payee failed and continues', async () => {
    const admin = makeFakeAdmin(affiliateSeed());
    const stripe = makeFakeStripe({
      failTransfersWith: { type: 'StripeInvalidRequestError', message: 'insufficient funds' },
    });
    const res = await executePayoutRun({ admin, stripe, run_key: 'runF', dry_run: false });
    const a = res.payees.find((p) => p.user_id === 'userA');
    assert.equal(a.status, 'failed');
    const rows = admin._tables.connect_payouts;
    assert.equal(rows[0].status, 'failed');
    // commissions stay accrued (not marked paid on failure)
    assert.ok(admin._tables.aff_commissions.find((r) => r.id === 'c1').status === 'accrued');
  });

  it('connect-not-enabled aborts the run honestly', async () => {
    const admin = makeFakeAdmin(affiliateSeed());
    const stripe = makeFakeStripe({
      failTransfersWith: {
        type: 'StripeInvalidRequestError',
        code: 'invalid_request_error',
        message: 'Platform account is not enabled for Connect.',
      },
    });
    await assert.rejects(
      () => executePayoutRun({ admin, stripe, run_key: 'runC', dry_run: false }),
      (e) => e.code === 'connect_not_enabled' && e.message === CONNECT_NOT_ENABLED_MESSAGE
    );
  });

  it('requires a run_key and a stripe client', async () => {
    const admin = makeFakeAdmin(affiliateSeed());
    await assert.rejects(() => executePayoutRun({ admin, stripe: makeFakeStripe(), dry_run: true }));
    await assert.rejects(
      () => executePayoutRun({ admin, stripe: null, run_key: 'r', dry_run: true }),
      (e) => e.code === 'stripe_not_configured'
    );
  });
});
