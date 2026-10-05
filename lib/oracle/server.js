// lib/oracle/server.js
// Server-only helpers for ORACLE routes. Never import from client components.
//
// Joins up with the in-house wallet ledger (lib/wallet/ledger.js):
// every transaction on a requested program carries a flat $1.00 platform
// fee to Merlin, credited to HIS wallet via creditWallet — idempotent on
// the transaction reference, so a redelivered webhook can never double-fee.
//
// How programs use it (server-side, right after the sale settles):
//   const { chargeOracleFee } = await import('@/lib/oracle/server.js');
//   const stripeFeeCents = <real fee from the charge's balance_transaction>;
//   const earnerGrossCents = <the earner's contractual share of the sale>;
//   // The earner is credited NET of the real Stripe fee AND the $1 fee —
//   // Merlin's fee rule. The breakdown is persisted for the wallet UI.
//   await creditWallet(admin, earnerUserId, {
//     program: 'my-requested-program',
//     grossCents: earnerGrossCents,
//     stripeFeeCents,            // real Stripe fee — deducted from THEIR cut
//     platformFeeCents: 100,     // the ORACLE $1 fee, carved from their share
//     reason: `Program sale — order ${orderId} (net of Stripe + $1 ORACLE fee)`,
//     reference: `my-requested-program:sale:${orderId}`,
//   });
//   await chargeOracleFee(admin, {
//     program: 'my-requested-program',   // the built program's slug
//     transactionRef: invoiceOrOrderId,  // unique per transaction
//     transactionCents: 599,             // the sale amount (for the sub-$1 cap)
//   });
// Merlin's $1.00 fee itself is NEVER reduced by Stripe — his wallet row
// carries stripe_fee_cents: 0 with the breakdown showing it whole.

import { creditWallet, toCents, netFromBreakdown } from '@/lib/wallet/ledger.js';
import { requireUser, requireOwner } from '@/lib/wallet/server.js';
import { getServiceClient } from '@/lib/economy/supabase';
import { ORACLE_FEE_CENTS, oracleFeeCents, oracleFeeReference } from './constants.js';

export { getServiceClient, requireUser, requireOwner };
// The review queue is Merlin's private surface: reviewer == owner.
export const requireReviewer = requireOwner;

const MERLIN_EMAIL = 'olympiannexus@gmail.com';

/** Resolve Merlin's user id: env override wins, else look up by email. */
export async function getMerlinUserId(admin) {
  const envId = String(process.env.ORACLE_FEE_RECIPIENT_USER_ID || '').trim();
  if (envId) return envId;
  // listUsers pages at 50 by default; one page is plenty for this account.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not resolve the fee recipient: ${error.message}`);
  const found = (data?.users || []).find(
    (u) => String(u?.email || '').toLowerCase() === MERLIN_EMAIL
  );
  if (!found) throw new Error('Fee recipient account not found.');
  return found.id;
}

/**
 * Charge the flat $1.00 ORACLE platform fee for one transaction.
 * Credits Merlin's in-house wallet; idempotent on (program, transactionRef).
 * Merlin's fee stays WHOLE — no Stripe fee is ever deducted from it; the
 * persisted breakdown (stripe_fee_cents: 0) shows that transparently.
 *
 * @param {object} admin  service-role Supabase client
 * @param {object} opts
 * @param {string} opts.program          the requested program's slug
 * @param {string} opts.transactionRef   unique id of the sale (invoice/order id)
 * @param {number} [opts.transactionCents] the sale amount; fee is capped at it
 * @returns {Promise<{ feeCents, duplicate }>}
 */
export async function chargeOracleFee(admin, { program, transactionRef, transactionCents } = {}) {
  const slug = String(program || '').trim();
  const ref = String(transactionRef || '').trim();
  if (!slug) throw new Error('program is required.');
  if (!ref) throw new Error('transactionRef (idempotency key) is required.');

  const amount = transactionCents === undefined ? ORACLE_FEE_CENTS : toCents(transactionCents);
  if (amount <= 0) throw new Error('transactionCents must be positive.');
  const fee = oracleFeeCents(amount); // capped at the transaction amount
  if (fee <= 0) throw new Error('Could not compute a fee for this transaction.');

  const merlinId = await getMerlinUserId(admin);
  const reference = oracleFeeReference(slug, ref);
  const { duplicate } = await creditWallet(admin, merlinId, {
    program: 'oracle',
    amountCents: fee,
    grossCents: fee,
    stripeFeeCents: 0, // Merlin's platform fee is never reduced by Stripe
    platformFeeCents: 0,
    reason: `ORACLE platform fee — ${slug} · ${ref}`,
    reference,
  });
  return { feeCents: fee, duplicate: !!duplicate };
}
