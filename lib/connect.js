// lib/connect.js
// Pure, headless-testable core for Stripe Connect payouts.
// No DOM, no network, no secrets — safe to import from API routes and tests.
//
// Business model (Merlin, 2026-10-03):
//   - One Express connected account per user. Onboarding: none -> pending
//     -> ready (via Stripe-hosted onboarding + account.updated webhook).
//   - Payouts are MANUAL ONLY: Merlin triggers /api/connect/payout-run.
//     No cron, no automatic transfers, ever.
//   - Dry-run by default: lists who would be paid. confirm:true executes
//     one Transfer per payee, idempotent on (run_key, kind, user_id).
//   - Threshold: balance >= $20 (2000c) AND a ready Connect account.
//   - Affiliates: balance = accrued aff_commissions; rows flip to 'paid'.
//   - Performers: unpaid = ledger performer_share total - paid payouts.

/** Merlin-only gate for the payout-run (the no-leak + money-moves rules). */
export const CONNECT_OWNER_EMAIL = 'olympiannexus@gmail.com';
export function isConnectOwner(user) {
  return String(user?.email || '').toLowerCase() === CONNECT_OWNER_EMAIL;
}

/** Minimum payable balance, in cents. Configurable. */
export const CONNECT_MIN_PAYOUT_CENTS = 2000; // $20.00

/** Transfer currency. The platform account is CA; store prices are CAD. */
export const CONNECT_PAYOUT_CURRENCY = 'cad';

/** Onboarding statuses. */
export const CONNECT_STATUSES = ['none', 'pending', 'ready'];

/**
 * Honest message when the platform hasn't finished Connect signup.
 * Merlin completes it at dashboard.stripe.com/connect.
 */
export const CONNECT_NOT_ENABLED_MESSAGE =
  'Stripe Connect is not enabled on the platform account yet. ' +
  'Finish the Connect signup at dashboard.stripe.com/connect, then try again.';

/**
 * True when a Stripe SDK error means "Connect isn't enabled on the
 * platform" (as opposed to a real failure we should surface). Stripe
 * answers account/transfer creation with an invalid_request_error whose
 * message names Connect when the platform hasn't onboarded.
 */
export function isConnectNotEnabledError(err) {
  if (!err || typeof err !== 'object') return false;
  const type = String(err.type || '').toLowerCase();
  const code = String(err.code || '').toLowerCase();
  const msg = String(err.message || '');
  const isInvalidRequest =
    type === 'stripeinvalidrequesterror' ||
    type === 'invalid_request_error' ||
    code === 'invalid_request_error';
  if (!isInvalidRequest) return false;
  return /connect/i.test(msg) && /not enabled|not onboarded|has not|must|platform|signup/i.test(msg);
}

/**
 * Deterministic idempotency key for one payee in one payout run.
 * Same (run_key, kind, user_id) -> same key -> Stripe + the DB unique
 * constraint both refuse a second payment. Retries never double-pay.
 */
export function payoutIdempotencyKey({ run_key, kind, user_id }) {
  const rk = String(run_key || '').trim();
  const k = String(kind || '').trim();
  const u = String(user_id || '').trim();
  if (!rk || !k || !u) throw new Error('payoutIdempotencyKey needs run_key, kind, user_id.');
  return `payout:${rk}:${k}:${u}`;
}

/** Balance gate: only wallets at/above the threshold are payable. */
export function meetsPayoutThreshold(balance_cents) {
  return Math.max(0, Math.round(Number(balance_cents) || 0)) >= CONNECT_MIN_PAYOUT_CENTS;
}

/** Human status for the dashboard. */
export function connectStatusLabel(status) {
  switch (status) {
    case 'ready':
      return 'Payouts ready';
    case 'pending':
      return 'Setup in progress';
    default:
      return 'Not set up';
  }
}

export function formatCents(cents) {
  return `$${(Math.max(0, Math.round(Number(cents) || 0)) / 100).toFixed(2)}`;
}
