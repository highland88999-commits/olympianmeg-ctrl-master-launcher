// tests/store-creator-payouts.test.mjs
// Money tests for creator payouts on Custom Product Designer sales.
// Run: node tests/store-creator-payouts.test.mjs (from the repo root).
// No browser, no network — the wallet ledger runs against an in-memory
// fake of the supabase-js surface, Stripe is a stub that reports a
// fixed REAL fee the way the balance transaction would.
//
// The laws under test (Merlin, 2026-10-13):
//   - A creation sale credits the creator: gross = markup, less the
//     markup's proportional share of the transaction's real Stripe fee,
//     less the $1.00 platform fee. net = max(0, gross - fee - $1).
//   - The creator's own baseline-offer redemption earns nothing.
//   - A zero-markup creation credits nothing and errors nowhere.
//   - Credits never go negative: fees bigger than the markup floor
//     the credit at $0 and report the shortfall — no wallet row.
//   - Webhook replays never double-credit (ledger reference guard).
//   - Refunds/chargebacks claw the credit back exactly (proportional
//     to the money returned; a full refund reverses the full net),
//     replay-safe; a spent wallet is debited only what it holds and
//     the shortfall is reported, never a negative balance.
import {
  CREATOR_PLATFORM_FEE_CENTS,
  creatorSaleReference,
  creatorReversalReference,
  parseCreatorSale,
  stripeFeeShareCents,
  creatorCreditBreakdown,
  creatorClawbackTargetCents,
  creditCreatorSale,
  reverseCreatorSale,
} from '../lib/store/creator-payouts.js';
import { debitWallet, getOrCreateWallet } from '../lib/wallet/ledger.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// ---------------------------------------------------------------------------
// In-memory fake of the supabase-js surface the ledger + payouts use.
// Enforces the UNIQUE constraints the real schema has (wallets.user_id,
// wallet_transactions.reference) and the balance >= 0 rule's effect:
// debitWallet refuses rather than overdrawing.
// ---------------------------------------------------------------------------
let seq = 0;
function likeToRegex(pattern) {
  const esc = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${esc}$`);
}
function makeFakeAdmin() {
  const db = { wallets: [], wallet_transactions: [] };
  const api = {
    db,
    from(table) {
      const rows = db[table];
      if (!rows) throw new Error(`unknown table ${table}`);
      const filters = [];
      const apply = () => rows.filter((r) => filters.every((f) => f(r)));
      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push((r) => r[col] === val); return builder; },
        like(col, pattern) { const re = likeToRegex(pattern); filters.push((r) => re.test(String(r[col] ?? ''))); return builder; },
        order() { return builder; },
        limit() { return builder; },
        then(resolve) { resolve({ data: apply().map((r) => ({ ...r })), error: null }); },
        async maybeSingle() {
          const hit = apply();
          return { data: hit.length ? { ...hit[0] } : null, error: null };
        },
        async single() {
          const hit = apply();
          if (!hit.length) return { data: null, error: { code: 'PGRST116', message: 'none' } };
          return { data: { ...hit[0] }, error: null };
        },
        insert(row) {
          if (table === 'wallets' && rows.some((r) => r.user_id === row.user_id)) {
            return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate user_id' } }) }) };
          }
          if (table === 'wallet_transactions' && row.reference && rows.some((r) => r.reference === row.reference)) {
            return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate reference' } }) }) };
          }
          const inserted = {
            id: `fake-${++seq}`,
            created_at: new Date().toISOString(),
            balance_cents: 0,
            held_cents: 0,
            ...row,
          };
          rows.push(inserted);
          return { select: () => ({ single: async () => ({ data: { ...inserted }, error: null }) }) };
        },
        update(patch) {
          return {
            eq(col, val) {
              const hit = rows.filter((r) => r[col] === val);
              for (const r of hit) Object.assign(r, patch);
              return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null });
            },
          };
        },
      };
      return builder;
    },
  };
  return api;
}

// Stub Stripe: paymentIntents.retrieve reports one charge whose balance
// transaction carries the given REAL fee — the shape stripeFeeCents reads.
function makeStripe(feeCents) {
  return {
    paymentIntents: {
      retrieve: async () => ({
        charges: { data: [{ balance_transaction: { fee: feeCents } }] },
      }),
    },
  };
}

const CREATOR = 'creator-1';
function saleSession(overrides = {}) {
  return {
    id: 'cs_sale_1',
    currency: 'cad',
    amount_total: 11500,
    payment_intent: 'pi_1',
    metadata: {
      surface: 'store',
      custom_creation: 'true',
      product_name: 'Tote Bag - Custom: Wave',
      creator_user_id: CREATOR,
      baseline_cents: '9500',
      markup_cents: '2000',
    },
    ...overrides,
  };
}
const creditsOf = (admin) => admin.db.wallet_transactions.filter((r) => r.kind === 'credit');
const debitsOf = (admin) => admin.db.wallet_transactions.filter((r) => r.kind === 'debit');

// --- pure math -----------------------------------------------------------------
t('platform fee is $1.00', CREATOR_PLATFORM_FEE_CENTS === 100);
t('fee share is proportional', stripeFeeShareCents({ feeCents: 364, markupCents: 2000, totalCents: 11500 }) === 63);
t('fee share zero without markup', stripeFeeShareCents({ feeCents: 364, markupCents: 0, totalCents: 11500 }) === 0);
t('fee share zero without fee', stripeFeeShareCents({ feeCents: 0, markupCents: 2000, totalCents: 11500 }) === 0);
t('fee share caps at the fee', stripeFeeShareCents({ feeCents: 364, markupCents: 11500, totalCents: 11500 }) === 364);
t('breakdown: gross - fee share - $1', (() => {
  const b = creatorCreditBreakdown({ markupCents: 2000, feeShareCents: 63 });
  return b.grossCents === 2000 && b.stripeFeeCents === 63 && b.platformFeeCents === 100
    && b.netCents === 1837 && b.shortfallCents === 0;
})());
t('breakdown floors at 0 with shortfall', (() => {
  const b = creatorCreditBreakdown({ markupCents: 100, feeShareCents: 4 });
  return b.netCents === 0 && b.shortfallCents === 4;
})());
t('clawback target: full refund reverses all', creatorClawbackTargetCents({ netCreditedCents: 1837, clawedBackTotalCents: 11500, transactionTotalCents: 11500 }) === 1837);
t('clawback target: half refund reverses half', creatorClawbackTargetCents({ netCreditedCents: 1837, clawedBackTotalCents: 5750, transactionTotalCents: 11500 }) === 919);
t('clawback target: nothing back, nothing clawed', creatorClawbackTargetCents({ netCreditedCents: 1837, clawedBackTotalCents: 0, transactionTotalCents: 11500 }) === 0);
t('references are stable', creatorSaleReference('cs_1') === 'store-creator:sale:cs_1'
  && creatorReversalReference('cs_1', 'evt_1') === 'store-creator:reversal:cs_1:evt_1');

// --- sale parsing ---------------------------------------------------------------
t('parse: stamped creation sale', (() => {
  const s = parseCreatorSale(saleSession().metadata);
  return s && s.creatorUserId === CREATOR && s.markupCents === 2000 && s.baselineCents === 9500;
})());
t('parse: baseline offer excluded', parseCreatorSale({ ...saleSession().metadata, custom_baseline_offer: 'true' }) === null);
t('parse: no creator, no sale', parseCreatorSale({ surface: 'store', markup_cents: '2000' }) === null);
t('parse: no markup stamp, no sale', parseCreatorSale({ surface: 'store', creator_user_id: CREATOR }) === null);
t('parse: guest creation (empty creator) excluded', parseCreatorSale({ ...saleSession().metadata, creator_user_id: '' }) === null);
t('parse: negative markup rejected', parseCreatorSale({ ...saleSession().metadata, markup_cents: '-100' }) === null);
t('parse: zero markup still a sale record', (() => {
  const s = parseCreatorSale({ ...saleSession().metadata, markup_cents: '0' });
  return s && s.markupCents === 0;
})());
t('parse: junk safe', parseCreatorSale(null) === null && parseCreatorSale(undefined) === null && parseCreatorSale('x') === null);

// --- crediting ------------------------------------------------------------------
{
  const admin = makeFakeAdmin();
  const stripe = makeStripe(364);
  const res = await creditCreatorSale(admin, stripe, saleSession());
  t('sale credits the creator', res.credited === true);
  t('credit math: 2000 - 63 fee share - 100 platform = 1837', res.breakdown.netCents === 1837);
  const row = creditsOf(admin)[0];
  t('credit row carries the full breakdown',
    row && row.gross_cents === 2000 && row.stripe_fee_cents === 63 && row.platform_fee_cents === 100 && row.amount_cents === 1837);
  t('credit row program + reference', row && row.program === 'store-creator' && row.reference === 'store-creator:sale:cs_sale_1');
  t('credit row credits the creator', row && row.user_id === CREATOR);
  const wallet = await getOrCreateWallet(admin, CREATOR);
  t('wallet balance is the net', wallet.balance_cents === 1837);

  const replay = await creditCreatorSale(admin, stripe, saleSession());
  t('webhook replay does not double-credit', replay.credited === false && replay.duplicate === true);
  const wallet2 = await getOrCreateWallet(admin, CREATOR);
  t('balance unchanged after replay', wallet2.balance_cents === 1837 && creditsOf(admin).length === 1);
}

{
  const admin = makeFakeAdmin();
  const res = await creditCreatorSale(admin, makeStripe(364), saleSession({
    metadata: { ...saleSession().metadata, markup_cents: '0' },
  }));
  t('zero-markup creation: no credit, no error', res.credited === false && res.reason === 'zero_markup');
  t('zero-markup writes no rows', admin.db.wallet_transactions.length === 0 && admin.db.wallets.length === 0);
}

{
  const admin = makeFakeAdmin();
  const res = await creditCreatorSale(admin, makeStripe(364), saleSession({
    metadata: { ...saleSession().metadata, custom_baseline_offer: 'true' },
  }));
  t('baseline-offer redemption earns nothing', res.credited === false && res.reason === 'not_creator_sale');
  t('baseline redemption writes no rows', admin.db.wallet_transactions.length === 0);
}

{
  const admin = makeFakeAdmin();
  const generic = saleSession({ metadata: { surface: 'store', product_id: 'pf_123', product_name: 'Mug' } });
  const res = await creditCreatorSale(admin, makeStripe(364), generic);
  t('plain store sale is not a creator sale', res.credited === false && res.reason === 'not_creator_sale');
}

{
  // Markup CA$1.00 on a CA$95.00 base; real fee CA$4.00.
  // Fee share = round(400 * 100 / 9600) = 4. Net = max(0, 100 - 4 - 100) = 0.
  const admin = makeFakeAdmin();
  const res = await creditCreatorSale(admin, makeStripe(400), saleSession({
    amount_total: 9600,
    metadata: { ...saleSession().metadata, markup_cents: '100' },
  }));
  t('fees exceeding markup floor the credit at $0', res.credited === false && res.reason === 'fees_consumed_markup');
  t('shortfall is reported', res.breakdown.shortfallCents === 4 && res.breakdown.netCents === 0);
  t('floored credit writes no row, never negative', admin.db.wallet_transactions.length === 0 && admin.db.wallets.length === 0);
}

// --- clawbacks ------------------------------------------------------------------
{
  const admin = makeFakeAdmin();
  await creditCreatorSale(admin, makeStripe(364), saleSession());
  const rev = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'refund', eventId: 'evt_refund_1',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('full refund claws back the exact net', rev.reversed === true && rev.amountCents === 1837 && rev.shortfallCents === 0);
  const wallet = await getOrCreateWallet(admin, CREATOR);
  t('balance returns to 0 after clawback', wallet.balance_cents === 0);
  t('reversal is a debit row with the reversal reference',
    debitsOf(admin).length === 1 && debitsOf(admin)[0].reference === 'store-creator:reversal:cs_sale_1:evt_refund_1');

  const replay = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'refund', eventId: 'evt_refund_1',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('replayed refund event claws nothing twice', replay.reversed === false && replay.reason === 'already_reversed');
  const wallet2 = await getOrCreateWallet(admin, CREATOR);
  t('balance still 0 after replay', wallet2.balance_cents === 0 && debitsOf(admin).length === 1);
}

{
  const admin = makeFakeAdmin();
  await creditCreatorSale(admin, makeStripe(364), saleSession());
  const half = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'refund', eventId: 'evt_refund_half',
    clawedBackTotalCents: 5750, transactionTotalCents: 11500,
  });
  t('partial refund claws back proportionally', half.reversed === true && half.amountCents === 919);
  const rest = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'refund', eventId: 'evt_refund_rest',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('follow-on refund claws back only the delta', rest.reversed === true && rest.amountCents === 918);
  const wallet = await getOrCreateWallet(admin, CREATOR);
  t('partial + rest reverses exactly the credit', wallet.balance_cents === 0
    && debitsOf(admin).reduce((s, r) => s + r.amount_cents, 0) === 1837);
}

{
  const admin = makeFakeAdmin();
  await creditCreatorSale(admin, makeStripe(364), saleSession());
  const rev = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'chargeback', eventId: 'evt_dispute_1',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('chargeback claws back the exact net', rev.reversed === true && rev.amountCents === 1837);
  t('chargeback reason says chargeback', debitsOf(admin)[0].reason.includes('chargeback'));
}

{
  const admin = makeFakeAdmin();
  const rev = await reverseCreatorSale(admin, {
    sessionId: 'cs_never_credited', kind: 'refund', eventId: 'evt_x',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('reversal of an uncredited sale is a no-op', rev.reversed === false && rev.reason === 'no_credit_found');
  t('no-op reversal writes no rows', admin.db.wallet_transactions.length === 0);
}

{
  // Creator earned 1837, spent 1337 in-ecosystem, then the sale refunds:
  // only the 500 still held can be clawed; 1337 is reported unrecovered.
  const admin = makeFakeAdmin();
  await creditCreatorSale(admin, makeStripe(364), saleSession());
  await debitWallet(admin, CREATOR, {
    program: 'hermes', amountCents: 1337,
    reason: 'Omega Store order (test spend)', reference: 'test:spend:1',
  });
  const rev = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'refund', eventId: 'evt_refund_spent',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('spent wallet: reversal takes what is available', rev.reversed === true && rev.amountCents === 500);
  t('spent wallet: shortfall reported, balance never negative', rev.shortfallCents === 1337);
  const wallet = await getOrCreateWallet(admin, CREATOR);
  t('spent wallet: balance floors at 0', wallet.balance_cents === 0);
  const revRow = debitsOf(admin).find((r) => r.reference.startsWith('store-creator:reversal:'));
  t('shortfall is noted on the ledger row', !!revRow && revRow.reason.includes('unrecovered'));
  const again = await reverseCreatorSale(admin, {
    sessionId: 'cs_sale_1', kind: 'refund', eventId: 'evt_refund_spent',
    clawedBackTotalCents: 11500, transactionTotalCents: 11500,
  });
  t('replay with empty wallet reports the outstanding shortfall, moves nothing',
    again.reversed === false && again.reason === 'insufficient_balance' && again.shortfallCents === 1337);
}

console.log(`store-creator-payouts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
