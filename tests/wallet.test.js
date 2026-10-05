// tests/wallet.test.js — Headless tests for the in-house wallet ledger.
// Run: node tests/wallet.test.js (from the repo root). No browser, no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  toCents,
  formatCents,
  availableCents,
  trifoldInvoiceReference,
  MIN_WITHDRAWAL_CENTS,
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  holdForWithdrawal,
  releaseHold,
} from '../lib/wallet/ledger.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// ---------------------------------------------------------------------------
// In-memory fake of the supabase-js surface the ledger uses.
// Enforces the UNIQUE constraints the real DB has (reference, user_id).
// ---------------------------------------------------------------------------
let seq = 0;
function makeFakeAdmin() {
  const db = { wallets: [], wallet_transactions: [], wallet_withdrawals: [] };
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
        lt(col, val) { filters.push((r) => r[col] < val); return builder; },
        in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
        order() { return builder; },
        limit() { return builder; },
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
          // UNIQUE guards like the real schema.
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

// --- pure helpers ---
t('toCents coerces', toCents(499) === 499 && toCents('250') === 250);
t('toCents rejects junk', toCents(-5) === 0 && toCents(NaN) === 0 && toCents(0) === 0 && toCents('abc') === 0);
t('formatCents', formatCents(499) === '$4.99' && formatCents(100000) === '$1000.00' && formatCents(0) === '$0.00');
t('available subtracts holds', availableCents({ balance_cents: 1000, held_cents: 250 }) === 750);
t('available never negative', availableCents({ balance_cents: 100, held_cents: 500 }) === 0);
t('min withdrawal is $5', MIN_WITHDRAWAL_CENTS === 500);
t('trifold reference key', trifoldInvoiceReference('in_123') === 'trifold:invoice:in_123');

// --- ledger flows ---
const admin = makeFakeAdmin();
const U = 'user-devan-1';

const c1 = await creditWallet(admin, U, {
  program: 'trifold', amountCents: 499,
  reason: 'TRIFOLD subscription revenue — invoice in_1',
  reference: trifoldInvoiceReference('in_1'), currency: 'usd',
});
t('first credit lands', !c1.duplicate && c1.wallet.balance_cents === 499);
t('credit txn timestamped', typeof c1.transaction.created_at === 'string' && c1.transaction.created_at.length > 0);
t('credit txn carries running balance', c1.transaction.balance_after_cents === 499);
t('credit kind/program stored', c1.transaction.kind === 'credit' && c1.transaction.program === 'trifold');

const c2 = await creditWallet(admin, U, {
  program: 'trifold', amountCents: 499,
  reason: 'TRIFOLD subscription revenue — invoice in_1 (redelivery)',
  reference: trifoldInvoiceReference('in_1'), currency: 'usd',
});
t('redelivered webhook is a duplicate', c2.duplicate === true);
const wAfterDup = await getOrCreateWallet(admin, U);
t('double-credit impossible: balance unchanged', wAfterDup.balance_cents === 499);
t('double-credit impossible: one txn row',
  admin.db.wallet_transactions.filter((r) => r.reference === 'trifold:invoice:in_1').length === 1);

await creditWallet(admin, U, {
  program: 'trifold', amountCents: 499,
  reason: 'TRIFOLD subscription revenue — invoice in_2',
  reference: trifoldInvoiceReference('in_2'), currency: 'usd',
});
t('second invoice stacks', (await getOrCreateWallet(admin, U)).balance_cents === 998);

const d1 = await debitWallet(admin, U, {
  program: 'withdrawal', amountCents: 400,
  reason: 'Withdrawal released by Merlin', reference: 'wallet:withdrawal:w1',
});
t('debit reduces balance', !d1.duplicate && d1.wallet.balance_cents === 598);
t('debit txn timestamped with running balance',
  d1.transaction.kind === 'debit' && d1.transaction.balance_after_cents === 598 && !!d1.transaction.created_at);

let threw = false;
try {
  await debitWallet(admin, U, { program: 'withdrawal', amountCents: 99999, reason: 'x', reference: 'wallet:withdrawal:w2' });
} catch { threw = true; }
t('debit beyond available throws', threw);
t('failed debit leaves balance alone', (await getOrCreateWallet(admin, U)).balance_cents === 598);

// holds
await holdForWithdrawal(admin, U, 500);
const held = await getOrCreateWallet(admin, U);
t('hold keeps balance, reserves available',
  held.balance_cents === 598 && held.held_cents === 500 && availableCents(held) === 98);

let holdThrew = false;
try { await holdForWithdrawal(admin, U, 99); } catch { holdThrew = true; }
t('cannot hold more than available', holdThrew);

const d2 = await debitWallet(admin, U, {
  program: 'withdrawal', amountCents: 500,
  reason: 'Payout sent', reference: 'wallet:withdrawal:w3', fromHeld: true,
});
t('debit from held clears both', d2.wallet.balance_cents === 98 && d2.wallet.held_cents === 0);

await creditWallet(admin, 'user-2', {
  program: 'valkyrie', amountCents: 1500, reason: 'Valkyrie referral reward',
  reference: 'valkyrie:referral:r1', currency: 'usd',
});
await holdForWithdrawal(admin, 'user-2', 1500);
await releaseHold(admin, 'user-2', 1500);
const u2 = await getOrCreateWallet(admin, 'user-2');
t('released hold restores availability', u2.held_cents === 0 && availableCents(u2) === 1500);

let refThrew = false;
try {
  await creditWallet(admin, U, { program: 'trifold', amountCents: 100, reason: 'x', reference: '' });
} catch { refThrew = true; }
t('credit requires an idempotency reference', refThrew);

let amtThrew = false;
try {
  await creditWallet(admin, U, { program: 'trifold', amountCents: 0, reason: 'x', reference: 'zero' });
} catch { amtThrew = true; }
t('credit requires positive amount', amtThrew);

// every stored transaction row is timestamped — no exceptions
t('every txn row timestamped',
  admin.db.wallet_transactions.every((r) => typeof r.created_at === 'string' && r.created_at.length > 0));

// --- migration file guarantees ---
const __dir = path.dirname(fileURLToPath(import.meta.url));
const mig = fs.readFileSync(
  path.join(__dir, '..', 'supabase', 'migrations', '20261004_wallet_ledger.sql'), 'utf8'
);
t('migration creates wallets', mig.includes('create table if not exists public.wallets'));
t('migration creates wallet_transactions', mig.includes('create table if not exists public.wallet_transactions'));
t('migration creates wallet_withdrawals', mig.includes('create table if not exists public.wallet_withdrawals'));
t('reference is unique (double-credit guard)', /reference text unique/.test(mig));
t('balances can never go negative', (mig.match(/check \(balance_cents >= 0\)/) || []).length === 1
  && (mig.match(/check \(held_cents >= 0\)/) || []).length === 1);
t('RLS enabled on all three tables',
  ['public.wallets', 'public.wallet_transactions', 'public.wallet_withdrawals']
    .every((tbl) => mig.includes(`alter table ${tbl} enable row level security`)));
t('users read only their own rows', (mig.match(/using \(auth\.uid\(\) = user_id\)/g) || []).length === 3);
const createdAts = (mig.match(/created_at timestamptz not null default now\(\)/g) || []).length;
t(`every table timestamps rows (${createdAts} created_at defaults)`, createdAts >= 3);
t('destination stores label only', mig.includes('destination_label'));

console.log(`\nwallet: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
