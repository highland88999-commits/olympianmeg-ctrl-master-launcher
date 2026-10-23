// lib/economy/aether.js
// The aether ledger client — the platform's true currency as a real
// server-side balance, mirroring lib/economy/ledger.js (gold) exactly:
//
// Every mutation goes through the `aether_apply` Postgres function (see
// supabase/aether.sql), which inserts one ledger row per idempotency
// key, updates the balance transactionally, refuses negative balances,
// and optionally enforces a per-day cap for a reason group.
//
// The client NEVER sends amounts. Routes compute amounts server-side
// and pass an idempotency key; the key is what makes retries safe.

import { getServiceClient } from './supabase.js';

export class AetherUnavailableError extends Error {
  constructor() { super('The aether service is not connected yet.'); this.status = 503; this.setupRequired = true; }
}
export class AetherInsufficientError extends Error {
  constructor(balance) { super(`Not enough aether (balance: ${balance}).`); this.status = 409; this.balance = balance; }
}
export class AetherCapReachedError extends Error {
  constructor(group, limit) { super(`Daily ${group} aether limit reached (${limit}).`); this.status = 429; this.group = group; }
}

function mustClient(client) {
  if (!client) throw new AetherUnavailableError();
  return client;
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42P01' ||
    /relation .* does not exist/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

/**
 * Apply one aether ledger mutation. Positive delta = credit.
 * Returns { id, balanceAfter, wasDuplicate, capped }.
 * Throws AetherUnavailableError | AetherInsufficientError | AetherCapReachedError.
 */
export async function applyAether({ userId, delta, reason, idemKey, meta = {}, capGroup = null, capLimit = null }, client) {
  const db = mustClient(client ?? await getServiceClient());
  if (!userId || !Number.isInteger(delta) || delta === 0) {
    const e = new Error('Invalid aether mutation.'); e.status = 400; throw e;
  }
  if (!reason || !idemKey) {
    const e = new Error('Aether mutations require a reason and an idempotency key.'); e.status = 400; throw e;
  }
  const { data, error } = await db.rpc('aether_apply', {
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
    p_idempotency_key: idemKey,
    p_meta: meta,
    p_cap_group: capGroup,
    p_cap_limit: capLimit,
  });
  if (error) {
    if (isMissingTable(error)) throw new AetherUnavailableError();
    const e = new Error('Could not update your aether balance.'); e.status = 502; e.cause = error; throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    const e = new Error('Could not update your aether balance.'); e.status = 502; throw e;
  }
  if (row.insufficient) throw new AetherInsufficientError(row.balance_after ?? 0);
  if (row.capped) throw new AetherCapReachedError(capGroup, capLimit);
  return {
    id: row.entry_id,
    balanceAfter: row.balance_after,
    wasDuplicate: !!row.was_duplicate,
    capped: !!row.capped,
  };
}

/** Credit aether (refinery conversions, gifts, pickups — as they unify). */
export function creditAether({ userId, amount, reason, idemKey, meta, capGroup, capLimit }, client) {
  return applyAether({ userId, delta: Math.floor(amount), reason, idemKey, meta, capGroup, capLimit }, client);
}

/** Debit aether (spending). Throws AetherInsufficientError when short. */
export function debitAether({ userId, amount, reason, idemKey, meta }, client) {
  return applyAether({ userId, delta: -Math.floor(amount), reason, idemKey, meta }, client);
}

/** Current aether balance for a user (integer aether units). */
export async function getAetherBalance(userId, client) {
  const db = mustClient(client ?? await getServiceClient());
  const { data, error } = await db
    .from('aether_balances')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new AetherUnavailableError();
    const e = new Error('Could not read your aether balance.'); e.status = 502; e.cause = error; throw e;
  }
  return data?.balance ?? 0;
}
