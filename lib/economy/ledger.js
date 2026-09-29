// lib/economy/ledger.js
// The gold ledger: append-only, server-authoritative, idempotent, rate-limited.
//
// Every mutation goes through the `gold_apply` Postgres function (see
// supabase/gold.sql), which:
//   - inserts one ledger row per idempotency key (double-submits return the
//     existing row instead of double-applying),
//   - updates the current balance transactionally (row-locked, no races),
//   - refuses debits that would take the balance negative,
//   - optionally enforces a per-day cap for a reason group (engagement/mining).
//
// The client NEVER sends amounts. Routes compute amounts server-side and pass
// an idempotency key; the key is what makes retries safe.

import { getServiceClient } from './supabase.js';

export class EconomyUnavailableError extends Error {
  constructor() { super('The gold service is not connected yet.'); this.status = 503; }
}
export class InsufficientGoldError extends Error {
  constructor(balance) { super(`Not enough gold (balance: ${balance}).`); this.status = 409; this.balance = balance; }
}
export class CapReachedError extends Error {
  constructor(group, limit) { super(`Daily ${group} gold limit reached (${limit}).`); this.status = 429; this.group = group; }
}

function mustClient(client) {
  if (!client) throw new EconomyUnavailableError();
  return client;
}

/**
 * Apply one ledger mutation. Positive delta = credit, negative = debit.
 * Returns { id, balanceAfter, wasDuplicate, capped }.
 * Throws EconomyUnavailableError | InsufficientGoldError | CapReachedError.
 *
 * The SQL function never raises for business conditions — it returns
 * `insufficient` / `capped` flags and this layer maps them to typed errors,
 * so the contract survives PostgREST error-shape differences.
 */
export async function applyLedger({ userId, delta, reason, idemKey, meta = {}, capGroup = null, capLimit = null }, client) {
  const db = mustClient(client ?? await getServiceClient());
  if (!userId || !Number.isInteger(delta) || delta === 0) {
    const e = new Error('Invalid ledger mutation.'); e.status = 400; throw e;
  }
  if (!reason || !idemKey) {
    const e = new Error('Ledger mutations require a reason and an idempotency key.'); e.status = 400; throw e;
  }
  const { data, error } = await db.rpc('gold_apply', {
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
    p_idempotency_key: idemKey,
    p_meta: meta,
    p_cap_group: capGroup,
    p_cap_limit: capLimit,
  });
  if (error) {
    const e = new Error('Could not update your gold balance.'); e.status = 502; e.cause = error; throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    const e = new Error('Could not update your gold balance.'); e.status = 502; throw e;
  }
  if (row.insufficient) throw new InsufficientGoldError(row.balance_after ?? 0);
  if (row.capped) throw new CapReachedError(capGroup, capLimit);
  return {
    id: row.entry_id,
    balanceAfter: row.balance_after,
    wasDuplicate: !!row.was_duplicate,
    capped: !!row.capped,
  };
}

/** Credit gold (mining, engagement, adjustments). */
export function creditGold({ userId, amountGold, reason, idemKey, meta, capGroup, capLimit }, client) {
  return applyLedger({ userId, delta: Math.floor(amountGold), reason, idemKey, meta, capGroup, capLimit }, client);
}

/** Debit gold (checkout redemption). Throws InsufficientGoldError when short. */
export function debitGold({ userId, amountGold, reason, idemKey, meta }, client) {
  return applyLedger({ userId, delta: -Math.floor(amountGold), reason, idemKey, meta }, client);
}

/** Current gold balance for a user (integer gold units). */
export async function getBalance(userId, client) {
  const db = mustClient(client ?? await getServiceClient());
  const { data, error } = await db
    .from('gold_balances')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    const e = new Error('Could not read your gold balance.'); e.status = 502; e.cause = error; throw e;
  }
  return data?.balance ?? 0;
}
