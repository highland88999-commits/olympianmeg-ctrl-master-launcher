// lib/connect/server.js
// Server-only Stripe Connect helpers. Never import from client components.
//
// Money moves ONLY from POST /api/connect/payout-run (Merlin-only, manual).
// Every Transfer is idempotent on payoutIdempotencyKey(run_key, kind, user);
// the connect_payouts unique constraint is the DB-side twin, so a retried
// run never double-pays even if the first attempt died mid-write.

import {
  CONNECT_MIN_PAYOUT_CENTS,
  CONNECT_PAYOUT_CURRENCY,
  CONNECT_NOT_ENABLED_MESSAGE,
  isConnectNotEnabledError,
  payoutIdempotencyKey,
  meetsPayoutThreshold,
} from '../connect.js';
import { ledgerFromTickets } from '../persymphony/tickets.js';

let _stripe = null;

/** Lazy platform Stripe client. Null when STRIPE_SECRET_KEY is missing. */
export async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) {
    const { default: Stripe } = await import('stripe');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** For tests: inject a fake Stripe client. */
export function __setStripeForTests(client) {
  _stripe = client;
}
export function __resetStripeForTests() {
  _stripe = null;
}

/**
 * Read a user's Connect state. Returns
 * { status: 'none'|'pending'|'ready', stripe_account_id, ready_at, tables: bool }.
 * Missing tables (migration not run yet) -> { status: 'none', tables: false },
 * never throws.
 */
export async function getConnectState(admin, userId) {
  try {
    const { data, error } = await admin
      .from('connect_accounts')
      .select('stripe_account_id, onboarding_status, connect_ready_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { status: 'none', stripe_account_id: null, ready_at: null, tables: true };
    return {
      status: data.onboarding_status || 'none',
      stripe_account_id: data.stripe_account_id || null,
      ready_at: data.connect_ready_at || null,
      tables: true,
    };
  } catch (err) {
    if (err?.code === '42P01') return { status: 'none', stripe_account_id: null, ready_at: null, tables: false };
    throw err;
  }
}

export async function upsertConnectAccount(admin, userId, patch) {
  const { error } = await admin.from('connect_accounts').upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

/** Pure: is this connected account fully onboarded for payouts? */
export function connectAccountReady(account) {
  return !!(account?.charges_enabled && account?.payouts_enabled);
}

/**
 * Create the user's Express connected account. Throws a ConnectNotEnabled
 * error (message = CONNECT_NOT_ENABLED_MESSAGE) when the platform hasn't
 * finished Connect signup — the route turns that into an honest 503.
 */
export async function createExpressAccount(stripe, { email, userId, kind }) {
  try {
    return await stripe.accounts.create({
      type: 'express',
      country: 'CA',
      email: email || undefined,
      capabilities: { transfers: { requested: true } },
      metadata: { user_id: String(userId), kind: String(kind || 'affiliate'), app: 'olympus' },
    });
  } catch (err) {
    if (isConnectNotEnabledError(err)) {
      const e = new Error(CONNECT_NOT_ENABLED_MESSAGE);
      e.code = 'connect_not_enabled';
      throw e;
    }
    throw err;
  }
}

/** Fresh Stripe-hosted onboarding link (also used when a link expires). */
export async function createOnboardingLink(stripe, { stripeAccountId, origin, next }) {
  const safeNext = next === '/persymphony/tickets/dashboard' ? next : '/affiliates';
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${origin}/api/connect/refresh?next=${encodeURIComponent(safeNext)}`,
    return_url: `${origin}${safeNext}?connect=return`,
    type: 'account_onboarding',
  });
  return accountLink.url;
}

export async function markConnectReady(admin, stripeAccountId) {
  const { error } = await admin
    .from('connect_accounts')
    .update({
      onboarding_status: 'ready',
      connect_ready_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', stripeAccountId);
  if (error) throw error;
}

/**
 * Affiliate payable: sum of 'accrued' commission rows + their ids.
 * { balance_cents, commission_ids }.
 */
export async function computeAffiliatePayable(admin, userId) {
  const { data, error } = await admin
    .from('aff_commissions')
    .select('id, commission_cents')
    .eq('affiliate_user_id', userId)
    .eq('status', 'accrued')
    .limit(20000);
  if (error) {
    if (error.code === '42P01') return { balance_cents: 0, commission_ids: [] };
    throw error;
  }
  const rows = data || [];
  return {
    balance_cents: rows.reduce((s, r) => s + Math.max(0, Math.round(Number(r.commission_cents) || 0)), 0),
    commission_ids: rows.map((r) => r.id),
  };
}

/**
 * Performer payable: ledger performer_share total minus already-paid
 * performer payouts. { balance_cents }.
 */
export async function computePerformerPayable(admin, userId) {
  const { data: performer, error: pErr } = await admin
    .from('ps_performers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (pErr) {
    if (pErr.code === '42P01') return { balance_cents: 0 };
    throw pErr;
  }
  if (!performer) return { balance_cents: 0 };

  const { data: shows, error: sErr } = await admin
    .from('ps_shows')
    .select('id')
    .eq('performer_id', performer.id);
  if (sErr) throw sErr;
  const showIds = (shows || []).map((s) => s.id);

  let tickets = [];
  if (showIds.length) {
    const { data: tData, error: tErr } = await admin
      .from('ps_tickets')
      .select('amount_cents, stripe_fee_cents')
      .in('show_id', showIds)
      .limit(50000);
    if (tErr) throw tErr;
    tickets = tData || [];
  }
  const ledger = ledgerFromTickets(tickets);
  const totalShare = ledger.performer_share_cents || 0;

  let paidOut = 0;
  try {
    const { data: payouts, error: poErr } = await admin
      .from('connect_payouts')
      .select('amount_cents')
      .eq('payee_user_id', userId)
      .eq('kind', 'performer')
      .eq('status', 'paid');
    if (poErr) throw poErr;
    paidOut = (payouts || []).reduce((s, p) => s + Math.max(0, Number(p.amount_cents) || 0), 0);
  } catch (err) {
    if (err?.code === '42P01') return { balance_cents: Math.max(0, totalShare) };
    throw err;
  }
  return { balance_cents: Math.max(0, totalShare - paidOut) };
}

/**
 * The payout run. Merlin-only (the route enforces the gate).
 *
 * dry_run (default): computes every payable payee and returns the plan —
 * no money moves. confirm: executes one Transfer per payee, idempotent on
 * payoutIdempotencyKey(run_key, kind, user_id); affiliate commission rows
 * flip to 'paid'; every payout is recorded in connect_payouts.
 *
 * Returns { ok, dry_run, run_key, payees: [...], total_cents, errors }.
 * A payee entry: { kind, user_id, amount_cents, stripe_account_id,
 *   status: 'would_pay'|'paid'|'skipped'|'failed', transfer_id?, note? }.
 */
export async function executePayoutRun({ admin, stripe, run_key, dry_run = true }) {
  if (!run_key) throw new Error('run_key is required.');
  if (!stripe) {
    const e = new Error('Stripe is not connected yet (STRIPE_SECRET_KEY missing).');
    e.code = 'stripe_not_configured';
    throw e;
  }

  const payees = [];

  // ---- affiliates: accrued wallets at/above threshold, Connect ready ----
  let affRows = [];
  try {
    const { data, error } = await admin
      .from('aff_commissions')
      .select('affiliate_user_id, id, commission_cents')
      .eq('status', 'accrued')
      .limit(20000);
    if (error) throw error;
    affRows = data || [];
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }
  const affByUser = new Map();
  for (const r of affRows) {
    const u = r.affiliate_user_id;
    if (!affByUser.has(u)) affByUser.set(u, { balance: 0, ids: [] });
    const e = affByUser.get(u);
    e.balance += Math.max(0, Math.round(Number(r.commission_cents) || 0));
    e.ids.push(r.id);
  }

  // ---- performers: unpaid ledger share at/above threshold, Connect ready ----
  const performerPayables = new Map(); // user_id -> balance_cents
  try {
    const { data: performers, error: pErr } = await admin.from('ps_performers').select('id, user_id');
    if (pErr) throw pErr;
    for (const p of performers || []) {
      const { balance_cents } = await computePerformerPayable(admin, p.user_id);
      if (balance_cents > 0) performerPayables.set(p.user_id, balance_cents);
    }
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  // ---- Connect readiness for every candidate ----
  const candidates = new Map(); // user_id -> { kinds: {affiliate?, performer?} }
  for (const [u, e] of affByUser) {
    if (meetsPayoutThreshold(e.balance)) {
      if (!candidates.has(u)) candidates.set(u, {});
      candidates.get(u).affiliate = e;
    }
  }
  for (const [u, bal] of performerPayables) {
    if (meetsPayoutThreshold(bal)) {
      if (!candidates.has(u)) candidates.set(u, {});
      candidates.get(u).performer = { balance: bal };
    }
  }

  for (const [userId, kinds] of candidates) {
    const state = await getConnectState(admin, userId);
    const ready = state.tables && state.status === 'ready' && state.stripe_account_id;
    for (const kind of ['affiliate', 'performer']) {
      const entry = kinds[kind];
      if (!entry) continue;
      const base = {
        kind,
        user_id: userId,
        amount_cents: entry.balance,
        stripe_account_id: state.stripe_account_id,
      };
      if (!ready) {
        payees.push({ ...base, status: 'skipped', note: 'Connect account not ready' });
        continue;
      }
      const idemKey = payoutIdempotencyKey({ run_key, kind, user_id: userId });
      if (dry_run) {
        payees.push({ ...base, status: 'would_pay', idempotency_key: idemKey });
        continue;
      }
      // Confirm: skip if this exact payout already recorded as paid.
      let existing = null;
      try {
        const { data, error } = await admin
          .from('connect_payouts')
          .select('id, status, stripe_transfer_id')
          .eq('idempotency_key', idemKey)
          .maybeSingle();
        if (error) throw error;
        existing = data || null;
      } catch (err) {
        if (err?.code === '42P01') throw new Error('The Connect tables are not provisioned yet.');
        throw err;
      }
      if (existing?.status === 'paid') {
        payees.push({ ...base, status: 'skipped', note: 'already paid for this run', transfer_id: existing.stripe_transfer_id });
        continue;
      }
      // Record intent first (pending): a crash after the transfer still
      // can't double-pay — the retry reuses the Stripe idempotency key and
      // finds this row.
      await admin.from('connect_payouts').upsert(
        {
          payee_user_id: userId,
          kind,
          amount_cents: entry.balance,
          currency: CONNECT_PAYOUT_CURRENCY,
          idempotency_key: idemKey,
          status: 'pending',
        },
        { onConflict: 'idempotency_key' }
      );
      let transfer;
      try {
        transfer = await stripe.transfers.create(
          {
            amount: entry.balance,
            currency: CONNECT_PAYOUT_CURRENCY,
            destination: state.stripe_account_id,
            description: `Olympus ${kind} payout`,
            metadata: { user_id: String(userId), kind, run_key: String(run_key) },
          },
          { idempotencyKey: idemKey }
        );
      } catch (err) {
        if (isConnectNotEnabledError(err)) {
          const e = new Error(CONNECT_NOT_ENABLED_MESSAGE);
          e.code = 'connect_not_enabled';
          throw e;
        }
        await admin
          .from('connect_payouts')
          .update({ status: 'failed', note: String(err?.message || 'transfer failed').slice(0, 500) })
          .eq('idempotency_key', idemKey);
        payees.push({ ...base, status: 'failed', note: String(err?.message || 'transfer failed').slice(0, 200) });
        continue;
      }
      // Mark the money paid.
      if (kind === 'affiliate' && entry.ids?.length) {
        await admin
          .from('aff_commissions')
          .update({ status: 'paid' })
          .in('id', entry.ids)
          .eq('status', 'accrued');
      }
      await admin
        .from('connect_payouts')
        .update({ status: 'paid', stripe_transfer_id: transfer.id, note: '' })
        .eq('idempotency_key', idemKey);
      payees.push({ ...base, status: 'paid', transfer_id: transfer.id, idempotency_key: idemKey });
    }
  }

  const total_cents = payees
    .filter((p) => p.status === 'paid' || p.status === 'would_pay')
    .reduce((s, p) => s + p.amount_cents, 0);
  return { ok: true, dry_run: !!dry_run, run_key, payees, total_cents };
}
