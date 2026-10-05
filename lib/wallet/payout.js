// lib/wallet/payout.js
// The autonomous Christmas payout queue — pure decision logic.
// Server-only in practice; kept pure for headless tests.
//
// Merlin's rule (2026-10-04): the queue processes ITSELF, but only after
// ONE explicit "release the Christmas queue" from him (the payout_releases
// table). One named confirmation -> autonomous run. No per-payout approvals.
//
// Liquidity: before every payout the platform's Stripe balance must cover
// it. Short -> 'paused-funds' (honest state, queue stops here — strict
// FIFO), and the next cron run resumes automatically once topped up.
// A 'completed' state is NEVER written unless money really moved.

/** The queue may run only when unlocked AND Merlin released it. */
export function queueCanRun({ locked, released }) {
  return locked === false && released === true;
}

/**
 * Liquidity decision for one payout.
 *   balanceCents: platform's available Stripe balance (this currency)
 *   amountCents:  the withdrawal amount
 * Returns 'pay' | 'pause-funds'.
 */
export function decidePayout({ balanceCents, amountCents }) {
  const bal = Math.max(0, Math.round(Number(balanceCents) || 0));
  const amt = Math.max(0, Math.round(Number(amountCents) || 0));
  if (amt <= 0) return 'pause-funds';
  return bal >= amt ? 'pay' : 'pause-funds';
}

/**
 * Summarize one processor run for the JSON response / logs.
 * Kept tiny and honest: counts only, no money invented.
 */
export function summarizeRun(results) {
  const s = { paid: 0, pausedFunds: 0, awaitingDestination: 0, failed: 0, skipped: 0 };
  for (const r of results || []) {
    if (r.outcome === 'paid') s.paid++;
    else if (r.outcome === 'paused-funds') s.pausedFunds++;
    else if (r.outcome === 'awaiting-destination') s.awaitingDestination++;
    else if (r.outcome === 'failed') s.failed++;
    else s.skipped++;
  }
  return s;
}
