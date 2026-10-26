// lib/store/creator-payouts.js
// Creator payouts for Custom Product Designer sales — server-only.
// Never import from client components.
//
// Merlin's policy (decided 2026-10-13, green-lit the same day):
//   * A paid custom-creation sale credits the creator's wallet with
//     their markup, NET of the real Stripe fee and the $1.00 platform
//     fee:
//       gross = the creation's markup (session metadata, stamped
//               server-side by POST /api/store/custom/buy)
//       stripe fee share = the transaction's REAL Stripe fee (read
//               from the charge's balance transaction via the
//               affiliates helper — never estimated), attributed
//               proportionally to the markup's share of the sale
//       platform fee = $1.00, to Merlin, whole
//       net = max(0, gross - stripeFeeShare - platformFee)
//     Credits NEVER go negative. When the fees consume the whole
//     markup there is no credit row (the wallet schema forbids $0
//     rows — the TRIFOLD convention); the shortfall rides back in the
//     result so the webhook can log it against the sale.
//   * A creator's own baseline-offer redemption earns NOTHING (they
//     paid the base price; there is no markup in that sale to earn).
//   * Refunds and chargebacks CLAW BACK the credit for the sale,
//     proportionally to how much of the charge came back, as
//     reversing debit entries. Every step is idempotent: credits key
//     on the Stripe session id, reversals on the Stripe event id,
//     both enforced by the wallet ledger's unique `reference`.
//   * Accumulative policy holds: credits land in the wallet ledger
//     and stay locked until Merlin's Dec 11, 2027 release, exactly
//     like every other program's earnings (lib/wallet/lock.js).
//
// All money moves through lib/wallet/ledger.js (creditWallet /
// debitWallet) so the fee breakdown (gross -> stripe fee -> platform
// fee -> net) is persisted on every row for the wallet UI, and the
// ledger's reference guard makes webhook redelivery safe.
import {
  creditWallet,
  debitWallet,
  getOrCreateWallet,
  availableCents,
  netFromBreakdown,
} from '../wallet/ledger.js';
import { stripeFeeCents } from '../affiliates/server.js';

export const CREATOR_PAYOUT_PROGRAM = 'store-creator';
export const CREATOR_PLATFORM_FEE_CENTS = 100; // $1.00, Merlin's, whole.

const cents = (v) => {
  const n = Math.round(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
};

/** Wallet-ledger idempotency reference for a creation sale's credit. */
export function creatorSaleReference(sessionId) {
  return `store-creator:sale:${String(sessionId || '').trim()}`;
}

/** Wallet-ledger idempotency reference for one reversal event. */
export function creatorReversalReference(sessionId, eventId) {
  return `store-creator:reversal:${String(sessionId || '').trim()}:${String(eventId || '').trim()}`;
}

/** Reference prefix covering every reversal row for one sale. */
function reversalPrefix(sessionId) {
  return `store-creator:reversal:${String(sessionId || '').trim()}:`;
}

/**
 * Is this checkout session a custom-creation sale that earns its
 * creator a payout? Reads ONLY the server-stamped session metadata
 * (POST /api/store/custom/buy stamps creator_user_id + markup_cents
 * from the creation record — client input never reaches it).
 * Baseline-offer redemptions are excluded: no payout on the creator's
 * own first copy. Returns { creatorUserId, markupCents,
 * baselineCents } or null.
 */
export function parseCreatorSale(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.custom_baseline_offer === 'true') return null;
  const creatorUserId =
    typeof meta.creator_user_id === 'string' && meta.creator_user_id.trim()
      ? meta.creator_user_id.trim()
      : null;
  if (!creatorUserId) return null;
  if (meta.markup_cents === undefined || meta.markup_cents === null || meta.markup_cents === '') {
    return null;
  }
  const markupCents = cents(meta.markup_cents);
  if (!(markupCents >= 0)) return null;
  return {
    creatorUserId,
    markupCents,
    baselineCents: Math.max(0, cents(meta.baseline_cents)),
  };
}

/**
 * The markup's proportional share of the transaction's real Stripe
 * fee: fee * markup / transactionTotal, rounded, clamped to
 * [0, fee]. Zero when there is no markup to attribute fee to.
 */
export function stripeFeeShareCents({ feeCents, markupCents, totalCents } = {}) {
  const fee = Math.max(0, cents(feeCents));
  const markup = Math.max(0, cents(markupCents));
  const total = cents(totalCents);
  if (fee <= 0 || markup <= 0) return 0;
  if (total <= 0 || markup >= total) return fee;
  return Math.min(fee, Math.round((fee * markup) / total));
}

/**
 * The credit breakdown for one creation sale (pure):
 *   net = max(0, gross - stripeFeeShare - $1 platform fee)
 * `shortfallCents` is how far the fees overshot the markup when the
 * net floors at 0 (0 whenever a positive net lands).
 */
export function creatorCreditBreakdown({ markupCents, feeShareCents } = {}) {
  const grossCents = Math.max(0, cents(markupCents));
  const stripeFee = Math.max(0, cents(feeShareCents));
  const platformFeeCents = CREATOR_PLATFORM_FEE_CENTS;
  const netCents = netFromBreakdown(grossCents, stripeFee, platformFeeCents);
  const shortfallCents = Math.max(0, stripeFee + platformFeeCents - grossCents);
  return { grossCents, stripeFeeCents: stripeFee, platformFeeCents, netCents, shortfallCents };
}

/**
 * How much of a sale's credited net a refund/chargeback should have
 * clawed back IN TOTAL once `clawedBackTotalCents` of the
 * `transactionTotalCents` charge has come back (pure): the same
 * proportion of the net, capped at the net. A full refund or a
 * full-amount dispute therefore reverses exactly the credit.
 */
export function creatorClawbackTargetCents({ netCreditedCents, clawedBackTotalCents, transactionTotalCents } = {}) {
  const net = Math.max(0, cents(netCreditedCents));
  const clawed = Math.max(0, cents(clawedBackTotalCents));
  const total = cents(transactionTotalCents);
  if (net <= 0 || clawed <= 0) return 0;
  if (total <= 0) return net;
  return Math.min(net, Math.round((net * Math.min(clawed, total)) / total));
}

/**
 * Credit the creator for one verified-paid checkout session.
 * Called from the store webhook's paid path; the webhook owns the
 * signature verification and the pending -> paid order flip, this
 * owns the payout decision. Never throws for "no payout" outcomes —
 * those are normal and reported in the result:
 *   { credited: true, breakdown, transaction }
 *   { credited: false, reason: 'not_creator_sale' | 'zero_markup' |
 *     'fees_consumed_markup' | 'duplicate', breakdown? }
 */
export async function creditCreatorSale(admin, stripe, session) {
  const meta = session?.metadata || {};
  const sale = parseCreatorSale(meta);
  if (!sale) return { credited: false, reason: 'not_creator_sale' };
  if (sale.markupCents <= 0) return { credited: false, reason: 'zero_markup' };

  // The REAL fee for the whole transaction, from the charge's balance
  // transaction (the affiliates helper; 0 only when Stripe carries no
  // fee or it cannot be read — never an estimate).
  const feeTotal = await stripeFeeCents(stripe, session);
  const amountTotal = cents(session?.amount_total);
  const totalCents = amountTotal > 0 ? amountTotal : sale.baselineCents + sale.markupCents;
  const feeShare = stripeFeeShareCents({
    feeCents: feeTotal,
    markupCents: sale.markupCents,
    totalCents,
  });
  const breakdown = creatorCreditBreakdown({ markupCents: sale.markupCents, feeShareCents: feeShare });

  if (breakdown.netCents <= 0) {
    // Fees consumed the markup: no $0 row (wallet schema + TRIFOLD
    // convention). The caller logs the shortfall against the sale.
    return { credited: false, reason: 'fees_consumed_markup', breakdown };
  }

  const res = await creditWallet(admin, sale.creatorUserId, {
    program: CREATOR_PAYOUT_PROGRAM,
    grossCents: breakdown.grossCents,
    stripeFeeCents: breakdown.stripeFeeCents,
    platformFeeCents: breakdown.platformFeeCents,
    currency: String(session?.currency || 'cad').toLowerCase(),
    reason:
      `Custom creation sale — ${meta.product_name || 'custom creation'} ` +
      `(markup $${(breakdown.grossCents / 100).toFixed(2)} less $${(breakdown.stripeFeeCents / 100).toFixed(2)} Stripe fee share ` +
      `and $${(breakdown.platformFeeCents / 100).toFixed(2)} platform fee; session ${session.id})`,
    reference: creatorSaleReference(session.id),
  });
  if (res.duplicate) return { credited: false, reason: 'duplicate', duplicate: true, breakdown };
  return { credited: true, breakdown, transaction: res.transaction };
}

/**
 * Claw back a creation sale's credit after a refund or chargeback.
 * Finds the original credit by its session reference, computes the
 * total that should be reversed for the money that came back, and
 * debits only the not-yet-reversed delta — so replayed and
 * follow-on events (partial refund, then the rest) are each safe.
 *
 * The wallet balance can never go negative (schema + ledger rules):
 * if the creator has since spent or withdrawn part of the credit,
 * the reversal debits what is available and reports the unrecovered
 * shortfall in the result AND in the debit row's reason — the ledger
 * note Merlin reads. Nothing is silently forgiven or invented.
 *
 *   { reversed: true, amountCents, targetCents, shortfallCents }
 *   { reversed: false, reason: 'no_credit_found' | 'already_reversed'
 *     | 'insufficient_balance', ... }
 */
export async function reverseCreatorSale(
  admin,
  { sessionId, kind = 'refund', eventId, clawedBackTotalCents, transactionTotalCents } = {}
) {
  if (!sessionId) return { reversed: false, reason: 'missing_session' };

  const { data: creditRow, error: creditErr } = await admin
    .from('wallet_transactions')
    .select('id, user_id, amount_cents')
    .eq('reference', creatorSaleReference(sessionId))
    .maybeSingle();
  if (creditErr) throw new Error(`Creator reversal lookup failed: ${creditErr.message}`);
  if (!creditRow) {
    // Zero-markup, fees-consumed, baseline, or never a creation sale:
    // nothing was credited, so there is nothing to claw back.
    return { reversed: false, reason: 'no_credit_found' };
  }
  const creatorUserId = creditRow.user_id;
  const netCredited = Math.max(0, cents(creditRow.amount_cents));

  const { data: priorRows, error: priorErr } = await admin
    .from('wallet_transactions')
    .select('amount_cents')
    .eq('user_id', creatorUserId)
    .eq('kind', 'debit')
    .like('reference', `${reversalPrefix(sessionId)}%`);
  if (priorErr) throw new Error(`Creator reversal history lookup failed: ${priorErr.message}`);
  const alreadyReversed = (priorRows || []).reduce(
    (sum, r) => sum + Math.max(0, cents(r.amount_cents)),
    0
  );

  const target = creatorClawbackTargetCents({
    netCreditedCents: netCredited,
    clawedBackTotalCents,
    transactionTotalCents,
  });
  const delta = target - alreadyReversed;
  if (delta <= 0) {
    return { reversed: false, reason: 'already_reversed', targetCents: target, alreadyReversedCents: alreadyReversed };
  }

  const wallet = await getOrCreateWallet(admin, creatorUserId);
  const available = availableCents(wallet);
  const debitAmount = Math.min(delta, available);
  const shortfall = delta - debitAmount;
  if (debitAmount <= 0) {
    return {
      reversed: false,
      reason: 'insufficient_balance',
      targetCents: target,
      alreadyReversedCents: alreadyReversed,
      shortfallCents: delta,
    };
  }

  const res = await debitWallet(admin, creatorUserId, {
    program: CREATOR_PAYOUT_PROGRAM,
    amountCents: debitAmount,
    reason:
      `Custom creation sale reversal — ${kind === 'chargeback' ? 'chargeback' : 'refund'} ` +
      `of session ${sessionId} (clawing back $${(debitAmount / 100).toFixed(2)} of the ` +
      `$${(netCredited / 100).toFixed(2)} credited markup)` +
      (shortfall > 0
        ? ` — $${(shortfall / 100).toFixed(2)} unrecovered: the wallet balance was spent or released before this reversal landed`
        : ''),
    reference: creatorReversalReference(sessionId, eventId),
  });
  if (res.duplicate) {
    return { reversed: false, reason: 'duplicate', duplicate: true, targetCents: target, alreadyReversedCents: alreadyReversed };
  }
  return {
    reversed: true,
    amountCents: debitAmount,
    targetCents: target,
    alreadyReversedCents: alreadyReversed,
    shortfallCents: shortfall,
    transaction: res.transaction,
  };
}
