// lib/billboards/credit.js — CAD wallet credit for services (billboard
// ads and anything else priced in CAD stored value). SERVER-ONLY: never
// import from client components.
//
// SEPARATION RULE: this is a SEPARATE balance from the earnings wallet
// (lib/wallet/ledger.js `wallets` table) and from gold/aether. It lives
// in its own tables (wallet_credit_balances, wallet_credit_transactions)
// and is never converted to, mixed with, or netted against gold or
// aether. Credit is stored CAD value for services: it pays for things
// inside Olympus; it is never described as money-out and never cashed
// out.
//
// LOAD RULE (unlike earnings credits, which net Stripe fees): a load
// credits the FULL gross amount — load $20, see $20 credit. The Stripe
// fee is recorded on the row for transparency but never subtracted:
// the user paid to load their own wallet, and the loaded amount is
// what they get to spend. Every movement is idempotent on `reference`
// (the DB unique constraint is the double-credit guard, same pattern
// as lib/wallet/ledger.js).

/** Get the user's CAD credit balance row, creating a zero one on first use. */
export async function getOrCreateCreditBalance(admin, userId) {
  if (!userId) throw new Error('userId is required.');
  const { data: existing, error: findErr } = await admin
    .from('wallet_credit_balances')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (findErr) throw new Error(`Could not load wallet credit: ${findErr.message}`);
  if (existing) return existing;
  const { data, error } = await admin
    .from('wallet_credit_balances')
    .insert({ user_id: userId, currency: 'cad' })
    .select('*')
    .single();
  if (error) {
    if (String(error.code) === '23505') {
      const { data: raced, error: reErr } = await admin
        .from('wallet_credit_balances')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (reErr || !raced) throw new Error('Could not load wallet credit after race.');
      return raced;
    }
    throw new Error(`Could not create wallet credit: ${error.message}`);
  }
  return data;
}

/**
 * Credit CAD value (a wallet load). Idempotent on `reference`.
 * Credits the full gross; stripeFeeCents is recorded, never subtracted.
 */
export async function creditCadBalance(admin, userId, { amountCents, grossCents, stripeFeeCents = 0, reference, reason } = {}) {
  const amount = Math.round(Number(amountCents) || 0);
  if (!userId) throw new Error('userId is required.');
  if (amount <= 0) throw new Error('amountCents must be positive.');
  if (!reference || !String(reference).trim()) throw new Error('reference (idempotency key) is required.');
  const ref = String(reference).trim();
  const { data: seen, error: seenErr } = await admin
    .from('wallet_credit_transactions')
    .select('id')
    .eq('reference', ref)
    .maybeSingle();
  if (seenErr) throw new Error(`Idempotency check failed: ${seenErr.message}`);
  if (seen) return { balance: null, transaction: null, duplicate: true };
  const row = await getOrCreateCreditBalance(admin, userId);
  const newBalance = Math.round(Number(row.balance_cents) || 0) + amount;
  const { error: wErr } = await admin
    .from('wallet_credit_balances')
    .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (wErr) throw new Error(`Wallet credit update failed: ${wErr.message}`);
  const { data: txn, error: tErr } = await admin
    .from('wallet_credit_transactions')
    .insert({
      user_id: userId,
      kind: 'load',
      amount_cents: amount,
      gross_cents: grossCents !== undefined && grossCents !== null ? Math.round(Number(grossCents) || 0) : amount,
      stripe_fee_cents: Math.max(0, Math.round(Number(stripeFeeCents) || 0)),
      reference: ref,
      reason: String(reason || ''),
      balance_after_cents: newBalance,
    })
    .select('*')
    .single();
  if (tErr) {
    await admin.from('wallet_credit_balances').update({ balance_cents: row.balance_cents }).eq('user_id', userId);
    if (String(tErr.code) === '23505') return { balance: null, transaction: null, duplicate: true };
    throw new Error(`Transaction insert failed: ${tErr.message}`);
  }
  return { balance: { ...row, balance_cents: newBalance }, transaction: txn, duplicate: false };
}

/**
 * Spend CAD credit (a subscription payment). Throws when the balance
 * is short. Idempotent on `reference`.
 */
export async function debitCadBalance(admin, userId, { amountCents, reference, reason } = {}) {
  const amount = Math.round(Number(amountCents) || 0);
  if (!userId) throw new Error('userId is required.');
  if (amount <= 0) throw new Error('amountCents must be positive.');
  if (!reference || !String(reference).trim()) throw new Error('reference (idempotency key) is required.');
  const ref = String(reference).trim();
  const { data: seen, error: seenErr } = await admin
    .from('wallet_credit_transactions')
    .select('id')
    .eq('reference', ref)
    .maybeSingle();
  if (seenErr) throw new Error(`Idempotency check failed: ${seenErr.message}`);
  if (seen) return { balance: null, transaction: null, duplicate: true };
  const row = await getOrCreateCreditBalance(admin, userId);
  const balance = Math.round(Number(row.balance_cents) || 0);
  if (balance < amount) throw new Error('Insufficient wallet credit.');
  const newBalance = balance - amount;
  const { error: wErr } = await admin
    .from('wallet_credit_balances')
    .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (wErr) throw new Error(`Wallet credit update failed: ${wErr.message}`);
  const { data: txn, error: tErr } = await admin
    .from('wallet_credit_transactions')
    .insert({
      user_id: userId,
      kind: 'spend',
      amount_cents: amount,
      gross_cents: amount,
      stripe_fee_cents: 0,
      reference: ref,
      reason: String(reason || ''),
      balance_after_cents: newBalance,
    })
    .select('*')
    .single();
  if (tErr) {
    await admin.from('wallet_credit_balances').update({ balance_cents: balance }).eq('user_id', userId);
    if (String(tErr.code) === '23505') return { balance: null, transaction: null, duplicate: true };
    throw new Error(`Transaction insert failed: ${tErr.message}`);
  }
  return { balance: { ...row, balance_cents: newBalance }, transaction: txn, duplicate: false };
}
