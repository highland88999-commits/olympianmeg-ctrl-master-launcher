// lib/economy/souls.js
// The soul ledger client — the server-side balance for underworld
// souls, mirroring lib/economy/aether.js exactly:
//
// Every mutation goes through a Postgres function (see
// supabase/souls.sql): soul_apply() inserts one ledger row per
// idempotency key, updates the balance transactionally, and refuses
// debits that would take the balance negative; soul_forge() does
// the soul debit + aether credit atomically in one transaction so
// a capped forge never eats a soul and a failed soul debit never
// mints free aether.
//
// The client NEVER sends amounts. Routes compute amounts
// server-side and pass an idempotency key; the key is what makes
// retries safe. Until supabase/souls.sql runs (Merlin's green
// light), every call throws SoulUnavailableError and the routes
// answer setupRequired — nothing is fake-credited.

import { getServiceClient } from './supabase.js';

export class SoulUnavailableError extends Error {
  constructor() { super('The soul ledger is not connected yet.'); this.status = 503; this.setupRequired = true; }
}
export class SoulInsufficientError extends Error {
  constructor(balance) { super(`Not enough souls (balance: ${balance}).`); this.status = 409; this.balance = balance; }
}

function mustClient(client) {
  if (!client) throw new SoulUnavailableError();
  return client;
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42P01' ||
    code === '42883' ||
    /relation .* does not exist/i.test(message) ||
    /function .* does not exist/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

/**
 * Apply one soul ledger mutation. Positive delta = credit.
 * Returns { id, balanceAfter, wasDuplicate }.
 * Throws SoulUnavailableError | SoulInsufficientError.
 */
export async function applySoul({ userId, delta, reason, idemKey, meta = {} }, client) {
  const db = mustClient(client ?? await getServiceClient());
  if (!userId || !Number.isInteger(delta) || delta === 0) {
    const e = new Error('Invalid soul mutation.'); e.status = 400; throw e;
  }
  if (!reason || !idemKey) {
    const e = new Error('Soul mutations require a reason and an idempotency key.'); e.status = 400; throw e;
  }
  const { data, error } = await db.rpc('soul_apply', {
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
    p_idempotency_key: idemKey,
    p_meta: meta,
  });
  if (error) {
    if (isMissingTable(error)) throw new SoulUnavailableError();
    const e = new Error('Could not update your soul balance.'); e.status = 502; e.cause = error; throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    const e = new Error('Could not update your soul balance.'); e.status = 502; throw e;
  }
  if (row.insufficient) throw new SoulInsufficientError(row.balance_after ?? 0);
  return {
    id: row.entry_id,
    balanceAfter: row.balance_after,
    wasDuplicate: !!row.was_duplicate,
  };
}

/** Credit souls (guiding, reconciliation). */
export function creditSoul({ userId, amount, reason, idemKey, meta }, client) {
  return applySoul({ userId, delta: Math.floor(amount), reason, idemKey, meta }, client);
}

/** Debit souls (the forge). Throws SoulInsufficientError when short. */
export function debitSoul({ userId, amount, reason, idemKey, meta }, client) {
  return applySoul({ userId, delta: -Math.floor(amount), reason, idemKey, meta }, client);
}

/** Current soul balance for a user (integer souls). */
export async function getSoulBalance(userId, client) {
  const db = mustClient(client ?? await getServiceClient());
  const { data, error } = await db
    .from('soul_balances')
    .select('balance, respawn_realm, respawn_attuned_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new SoulUnavailableError();
    const e = new Error('Could not read your soul balance.'); e.status = 502; e.cause = error; throw e;
  }
  return {
    balance: data?.balance ?? 0,
    respawnRealm: data?.respawn_realm ?? null,
    respawnAttunedAt: data?.respawn_attuned_at ?? null,
  };
}

/**
 * Cast one soul into the Lake of Fire: soul debit + aether credit
 * in one transaction (supabase/souls.sql: soul_forge()).
 * Returns { soulsAfter, aetherAfter, capped, insufficient }.
 * capped = the shared 40/day aether cap (refinery group) is spent —
 * the soul was NOT consumed. insufficient = no soul to cast.
 * Throws SoulUnavailableError when the souls (or aether) tables
 * are not live yet.
 */
export async function soulForge({ userId, idemKey, meta = {} }, client) {
  const db = mustClient(client ?? await getServiceClient());
  if (!userId || !idemKey) {
    const e = new Error('Soul forging requires a user and an idempotency key.'); e.status = 400; throw e;
  }
  const { data, error } = await db.rpc('soul_forge', {
    p_user_id: userId,
    p_idempotency_key: idemKey,
    p_meta: meta,
  });
  if (error) {
    if (isMissingTable(error)) throw new SoulUnavailableError();
    const e = new Error('Could not forge your soul.'); e.status = 502; e.cause = error; throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    const e = new Error('Could not forge your soul.'); e.status = 502; throw e;
  }
  return {
    soulsAfter: row.soul_balance_after,
    aetherAfter: row.aether_balance_after,
    wasDuplicate: !!row.was_duplicate,
    capped: !!row.capped,
    insufficient: !!row.insufficient,
  };
}

/**
 * Record the player's rebirth point (the Wheel of Rebirth).
 * Best-effort by design: returns { stored: true } when the souls
 * tables are live, { stored: false } when they are not — the
 * device-local copy is the live one either way, so a missing table
 * never blocks the ride.
 */
export async function setRespawnRealm({ userId, realm }, client) {
  const db = mustClient(client ?? await getServiceClient());
  if (!userId || !realm) {
    const e = new Error('Setting a rebirth point requires a user and a realm.'); e.status = 400; throw e;
  }
  const { data, error } = await db.rpc('soul_set_respawn', {
    p_user_id: userId,
    p_realm: realm,
  });
  if (error) {
    if (isMissingTable(error)) return { stored: false };
    const e = new Error('Could not record your rebirth point.'); e.status = 502; e.cause = error; throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { stored: true, realm: row?.respawn_realm ?? realm };
}
