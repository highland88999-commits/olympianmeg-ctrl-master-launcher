// lib/wallet/ledger.js
// Unified in-house wallet ledger — server-only. Never import from client
// components.
//
// Merlin's rule: every user gets a wallet on their account; programs pay
// cuts INTO it (this replaces per-program Stripe Connect for earnings).
// Users view every movement timestamped, spend in-ecosystem, or withdraw
// to their bank (Stripe rail, Merlin releases).
//
// Money rules:
//   * All amounts are whole integer cents. No floats, ever.
//   * balance_cents is the ledger truth; held_cents is reserved for
//     in-flight withdrawals. available = balance - held.
//   * Every credit/debit carries a `reference` (idempotency key). The DB
//     unique constraint on reference is the double-credit guard — a
//     redelivered webhook can never pay twice.
//   * Every transaction row carries created_at. No exceptions.
//   * Debits happen only when value actually leaves (payout sent /
//     in-ecosystem spend captured). Withdrawal REQUESTS only hold.
//
// Concurrency note: credits are read-modify-write per user. Program
// webhooks are naturally serialized per invoice/subscription, which is the
// only credit path today. If a future program credits the same user at
// high concurrency, serialize per-user (queue) or move the balance bump
// into a Postgres function.

export const MIN_WITHDRAWAL_CENTS = 500; // $5.00 floor on cash-outs

/** Coerce to a positive integer number of cents; 0 when invalid. */
export function toCents(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** $1,234.56 style; pass currency for the code suffix when non-USD. */
export function formatCents(cents, currency = 'usd') {
  const c = Math.round(Number(cents) || 0);
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  const cur = String(currency || 'usd').toLowerCase();
  return `$${sign}${body}${cur === 'usd' ? '' : ' ' + cur.toUpperCase()}`;
}

/** Spendable right now: balance minus in-flight withdrawal holds. */
export function availableCents(wallet) {
  const b = Math.round(Number(wallet?.balance_cents) || 0);
  const h = Math.round(Number(wallet?.held_cents) || 0);
  return Math.max(0, b - h);
}

/** Reference key for a TRIFOLD invoice credit (idempotency). */
export function trifoldInvoiceReference(invoiceId) {
  return `trifold:invoice:${String(invoiceId || '').trim()}`;
}

/** Get the wallet, creating a zero-balance one on first use. */
export async function getOrCreateWallet(admin, userId, currency = 'usd') {
  if (!userId) throw new Error('userId is required.');
  const cur = String(currency || 'usd').toLowerCase();
  const { data: existing, error: findErr } = await admin
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (findErr) throw new Error(`Could not load wallet: ${findErr.message}`);
  if (existing) return existing;
  const { data, error } = await admin
    .from('wallets')
    .insert({ user_id: userId, currency: cur })
    .select('*')
    .single();
  if (error) {
    // Lost a create race — read the winner.
    if (String(error.code) === '23505') {
      const { data: raced, error: reErr } = await admin
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (reErr || !raced) throw new Error('Could not load wallet after race.');
      return raced;
    }
    throw new Error(`Could not create wallet: ${error.message}`);
  }
  return data;
}

/**
 * Credit a user's wallet. Idempotent on `reference`:
 * a second call with the same reference returns { duplicate: true } and
 * moves NO money.
 *
 * @returns {Promise<{ wallet, transaction, duplicate }>}
 */
export async function creditWallet(admin, userId, { program, amountCents, reason, reference, currency } = {}) {
  const amount = toCents(amountCents);
  if (!userId) throw new Error('userId is required.');
  if (amount <= 0) throw new Error('amountCents must be positive.');
  if (!reference || !String(reference).trim()) throw new Error('reference (idempotency key) is required.');
  const ref = String(reference).trim();

  // Idempotency first: a redelivered webhook must never pay twice.
  const { data: seen, error: seenErr } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('reference', ref)
    .maybeSingle();
  if (seenErr) throw new Error(`Idempotency check failed: ${seenErr.message}`);
  if (seen) return { wallet: null, transaction: null, duplicate: true };

  const wallet = await getOrCreateWallet(admin, userId, currency);
  const newBalance = Math.round(Number(wallet.balance_cents) || 0) + amount;

  const { error: wErr } = await admin
    .from('wallets')
    .update({ balance_cents: newBalance })
    .eq('id', wallet.id);
  if (wErr) throw new Error(`Wallet update failed: ${wErr.message}`);

  const { data: txn, error: tErr } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: userId,
      kind: 'credit',
      amount_cents: amount,
      program: String(program || ''),
      reason: String(reason || ''),
      reference: ref,
      balance_after_cents: newBalance,
    })
    .select('*')
    .single();
  if (tErr) {
    // Lost an insert race after the balance bump — roll the bump back so
    // the ledger never drifts from its transaction history.
    await admin.from('wallets').update({ balance_cents: wallet.balance_cents }).eq('id', wallet.id);
    if (String(tErr.code) === '23505') return { wallet: null, transaction: null, duplicate: true };
    throw new Error(`Transaction insert failed: ${tErr.message}`);
  }
  return { wallet: { ...wallet, balance_cents: newBalance }, transaction: txn, duplicate: false };
}

/**
 * Debit a user's wallet — value actually leaving (payout sent,
 * in-ecosystem spend captured). Throws when funds are insufficient.
 * Idempotent on `reference` like creditWallet.
 */
export async function debitWallet(admin, userId, { program, amountCents, reason, reference, fromHeld = false } = {}) {
  const amount = toCents(amountCents);
  if (!userId) throw new Error('userId is required.');
  if (amount <= 0) throw new Error('amountCents must be positive.');
  if (!reference || !String(reference).trim()) throw new Error('reference (idempotency key) is required.');
  const ref = String(reference).trim();

  const { data: seen, error: seenErr } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('reference', ref)
    .maybeSingle();
  if (seenErr) throw new Error(`Idempotency check failed: ${seenErr.message}`);
  if (seen) return { wallet: null, transaction: null, duplicate: true };

  const wallet = await getOrCreateWallet(admin, userId);
  const balance = Math.round(Number(wallet.balance_cents) || 0);
  const held = Math.round(Number(wallet.held_cents) || 0);
  const spendable = fromHeld ? held : Math.max(0, balance - held);
  if (spendable < amount) {
    throw new Error(
      fromHeld
        ? 'Held funds do not cover this payout.'
        : 'Insufficient available balance.'
    );
  }
  const patch = fromHeld
    ? { balance_cents: balance - amount, held_cents: held - amount }
    : { balance_cents: balance - amount };
  const newBalance = balance - amount;

  const { error: wErr } = await admin.from('wallets').update(patch).eq('id', wallet.id);
  if (wErr) throw new Error(`Wallet update failed: ${wErr.message}`);

  const { data: txn, error: tErr } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: userId,
      kind: 'debit',
      amount_cents: amount,
      program: String(program || ''),
      reason: String(reason || ''),
      reference: ref,
      balance_after_cents: newBalance,
    })
    .select('*')
    .single();
  if (tErr) {
    await admin.from('wallets').update({ balance_cents: balance, held_cents: held }).eq('id', wallet.id);
    if (String(tErr.code) === '23505') return { wallet: null, transaction: null, duplicate: true };
    throw new Error(`Transaction insert failed: ${tErr.message}`);
  }
  return { wallet: { ...wallet, ...patch }, transaction: txn, duplicate: false };
}

/** Reserve funds for a withdrawal request (no money moves yet). */
export async function holdForWithdrawal(admin, userId, amountCents) {
  const amount = toCents(amountCents);
  if (amount <= 0) throw new Error('amountCents must be positive.');
  const wallet = await getOrCreateWallet(admin, userId);
  if (availableCents(wallet) < amount) throw new Error('Insufficient available balance.');
  const { error } = await admin
    .from('wallets')
    .update({ held_cents: Math.round(Number(wallet.held_cents) || 0) + amount })
    .eq('id', wallet.id);
  if (error) throw new Error(`Hold failed: ${error.message}`);
  return { ...wallet, held_cents: Math.round(Number(wallet.held_cents) || 0) + amount };
}

/** Release a hold (withdrawal failed/canceled) — funds become spendable again. */
export async function releaseHold(admin, userId, amountCents) {
  const amount = toCents(amountCents);
  if (amount <= 0) throw new Error('amountCents must be positive.');
  const wallet = await getOrCreateWallet(admin, userId);
  const held = Math.round(Number(wallet.held_cents) || 0);
  const { error } = await admin
    .from('wallets')
    .update({ held_cents: Math.max(0, held - amount) })
    .eq('id', wallet.id);
  if (error) throw new Error(`Hold release failed: ${error.message}`);
  return { ...wallet, held_cents: Math.max(0, held - amount) };
}

// ---------------------------------------------------------------------------
// Integration points for future programs (plumbing only — not wired yet):
//
//   Valkyrie referrals ($15/referral):
//     creditWallet(admin, affiliateUserId, {
//       program: 'valkyrie', amountCents: 1500,
//       reason: `Valkyrie referral reward — ${referredEmail}`,
//       reference: `valkyrie:referral:${referralId}`,
//     });
//
//   PerSymphony artist payouts:
//     creditWallet(admin, artistUserId, {
//       program: 'persymphony', amountCents: artistPayoutCents,
//       reason: `PerSymphony ticket revenue — ${showTitle}`,
//       reference: `persymphony:show:${showId}:settlement`,
//     });
//
//   Gold economy conversions:
//     creditWallet(admin, userId, {
//       program: 'gold', amountCents: usdCents,
//       reason: `Gold cash-out — ${goldAmount} bars`,
//       reference: `gold:cashout:${conversionId}`,
//     });
//
//   In-ecosystem spend (store checkout with wallet balance):
//     debitWallet(admin, userId, {
//       program: 'hermes', amountCents: orderTotalCents,
//       reason: `Omega Store order ${orderId}`,
//       reference: `hermes:order:${orderId}`,
//     });
