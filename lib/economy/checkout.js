// lib/economy/checkout.js
// Shared gold-at-checkout flow for every paid surface (World Engine Aether,
// Luge Arsenal, Olympus goods, Hermes listings).
//
// The client sends ONLY { useGold: boolean, idemKey: uuid } — never amounts.
// The server prices the bill, computes the gold discount, and debits gold
// BEFORE touching Stripe, so a crash can never grant a discount without the
// debit. Retries are safe:
//   - the gold debit is keyed `gold:spend:<surface>:<idemKey>` (ledger unique
//     key makes a second debit a no-op),
//   - Stripe session creation carries an idempotency key derived from the
//     same idemKey (a retried request reuses the same Checkout Session),
//   - paid-by-gold fulfillments are written idempotently per surface.
// If Stripe session creation fails AFTER the debit, a compensating credit
// refunds the gold under a derived key. The same refund applies when a
// paid-by-gold fulfillment throws: gold is never taken without the goods.

import { computeGoldDiscount } from './config.js';
import { debitGold, creditGold, getBalance, InsufficientGoldError } from './ledger.js';

export function goldSpendKey(surface, idemKey) {
  return `gold:spend:${surface}:${idemKey}`;
}

/**
 * @param {object} opts
 * @param {string} opts.surface        'world-engine' | 'luge' | 'olympus' | 'hermes'
 * @param {string} opts.userId
 * @param {number} opts.totalCents     server-priced bill in whole cents
 * @param {boolean} opts.useGold
 * @param {string} opts.idemKey        client-generated UUID for this attempt
 * @param {object} opts.stripe         loaded Stripe instance (null when unused)
 * @param {function} opts.buildSessionParams  async ({ amountCents, gold, stripe }) => Stripe session params
 *                                          (may create a one-time coupon for multi-line carts)
 * @param {function} [opts.fulfillPaidByGold]  ({ goldSpentGold, idemKey, wasDuplicate }) => object
+ * @param {number} [opts.maxDiscountCents]     server-derived ceiling on the gold
+ *                                          discount for this order (store: $15
+ *                                          per hoodie line). Unset = uncapped.
 * @param {object} [client]            injected supabase client (tests)
 */
export async function applyGoldCheckout(opts, client) {
  const { surface, userId, totalCents, useGold, idemKey, stripe, buildSessionParams, fulfillPaidByGold, maxDiscountCents } = opts;
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    const e = new Error('Invalid bill total.'); e.status = 400; throw e;
  }
  if (!idemKey || typeof idemKey !== 'string' || idemKey.length > 80) {
    const e = new Error('A checkout idempotency key is required.'); e.status = 400; throw e;
  }
  // Server-side discount ceiling (e.g. the store's $15-per-hoodie-line
  // rule). The ceiling is priced by the ROUTE from server data, never from
  // client input — computeGoldDiscount treats it as just another min().
  const discountOpts = (maxDiscountCents !== undefined && maxDiscountCents !== null)
    ? { maxDiscountCents }
    : {};

  let discount = { discountCents: 0, goldToSpend: 0, chargeCents: totalCents, paidByGold: false };
  if (useGold) {
    const balance = await getBalance(userId, client);
    discount = computeGoldDiscount(balance, totalCents, discountOpts);
  }
  const gold = {
    goldAppliedGold: discount.goldToSpend,
    goldAppliedCents: discount.discountCents,
  };

  // Debit gold first (when any is applied). Idempotent per idemKey.
  let debitResult = null;
  if (discount.goldToSpend > 0) {
    try {
      debitResult = await debitGold({
        userId,
        amountGold: discount.goldToSpend,
        reason: `spend:${surface}`,
        idemKey: goldSpendKey(surface, idemKey),
        meta: { surface, idem_key: idemKey },
      }, client);
    } catch (err) {
      if (err instanceof InsufficientGoldError) {
        const e = new Error('Your gold balance changed before checkout finished. Please try again.');
        e.status = 409; throw e;
      }
      throw err;
    }
  }

  // Gold covers the whole bill: no Stripe call at all.
  if (discount.paidByGold) {
    if (!fulfillPaidByGold) {
      // Should never happen: every surface wires a paid-by-gold fulfiller.
      // Refund rather than take gold for nothing. Skipped on a duplicate
      // debit (a retry moves no gold, so there is nothing to refund).
      if (!debitResult?.wasDuplicate) await creditGold({
        userId, amountGold: discount.goldToSpend,
        reason: `spend_refund:${surface}`,
        idemKey: goldSpendKey(surface, idemKey) + ':refund',
        meta: { surface, idem_key: idemKey, note: 'no fulfiller' },
      }, client);
      const e = new Error('Gold checkout is not available for this item yet.'); e.status = 501; throw e;
    }
    let fulfillment;
    try {
      fulfillment = await fulfillPaidByGold({
        goldSpentGold: discount.goldToSpend,
        idemKey,
        wasDuplicate: !!debitResult?.wasDuplicate,
      });
    } catch (err) {
      // The debit happened but fulfillment did not: put the gold back so a
      // database hiccup can never eat a user's gold. Skipped when the debit
      // itself was a duplicate (a retry moves no gold, so there is nothing
      // to refund — refunding it would mint gold).
      if (discount.goldToSpend > 0 && !debitResult?.wasDuplicate) {
        try {
          await creditGold({
            userId, amountGold: discount.goldToSpend,
            reason: `spend_refund:${surface}`,
            idemKey: goldSpendKey(surface, idemKey) + ':refund-fulfillment',
            meta: { surface, idem_key: idemKey, note: 'fulfillment failed' },
          }, client);
        } catch { /* refund best-effort; the ledger shows the debit for support */ }
      }
      const e = new Error('Something went wrong after your gold was taken. It has been refunded — please try again.');
      e.status = err && err.status ? err.status : 502;
      e.cause = err;
      throw e;
    }
    return { type: 'gold', ...gold, chargeCents: 0, fulfillment };
  }

  // Card path: create the Stripe session for the reduced amount.
  if (!stripe) {
    // Roll the gold back — no charge is possible. Skipped on a duplicate
    // debit (a retry moves no gold).
    if (discount.goldToSpend > 0 && !debitResult?.wasDuplicate) {
      await creditGold({
        userId, amountGold: discount.goldToSpend,
        reason: `spend_refund:${surface}`,
        idemKey: goldSpendKey(surface, idemKey) + ':refund',
        meta: { surface, idem_key: idemKey, note: 'stripe unavailable' },
      }, client);
    }
    const e = new Error('Card payments are not connected yet.'); e.status = 503; throw e;
  }

  let session;
  try {
    const params = await buildSessionParams({ amountCents: discount.chargeCents, gold, stripe });
    session = await stripe.checkout.sessions.create(
      params,
      { idempotencyKey: `goldco_${surface}_${idemKey}` }
    );
  } catch (err) {
    // Compensating credit: the debit happened, the session did not.
    // Skipped on a duplicate debit (a retry moves no gold).
    if (discount.goldToSpend > 0 && !debitResult?.wasDuplicate) {
      try {
        await creditGold({
          userId, amountGold: discount.goldToSpend,
          reason: `spend_refund:${surface}`,
          idemKey: goldSpendKey(surface, idemKey) + ':refund',
          meta: { surface, idem_key: idemKey },
        }, client);
      } catch { /* refund best-effort; the ledger shows the debit for support */ }
    }
    throw err;
  }

  return {
    type: 'stripe',
    url: session.url,
    sessionId: session.id,
    chargeCents: discount.chargeCents,
    ...gold,
  };
}
