// lib/wallet/lock.js
// The Christmas unlock ("doomsday") — the day the vaults open.
//
// Merlin's vote (2026-10-04): every wallet sits in an ACCUMULATIVE state
// until Saturday, December 11, 2027, 00:00 America/Edmonton (two weeks before
// Christmas). Earnings accrue; the withdraw buttons stay locked with
// "Unlocks Dec 11" messaging. Then withdrawals unlock for ALL users.
// (2026-10-26, Merlin: moved from Dec 11, 2026 to Dec 11, 2027 —
// regulatory runway, FINTRAC and the rest; the launch target moves with it.)
//
// Pure functions here (testable with plain node). Server-only in practice.

/** America/Edmonton is MST (UTC-7) in December: 00:00 local = 07:00 UTC. */
export const WITHDRAWALS_LOCKED_UNTIL_ISO = '2027-12-11T07:00:00Z';
export const WITHDRAWALS_LOCKED_UNTIL_LABEL = 'Dec 11, 2027';
export const WITHDRAWALS_LOCK_KEY = 'withdrawals_locked_until';

/** Anti-fraud defaults (Merlin's call, 2026-10-04): sane, documented. */
export const DAILY_WITHDRAWAL_CAP_CENTS = 50000; // $500 per user per calendar day
export const MAX_QUEUE_BATCH = 25; // withdrawals processed per cron run

/** True while the accumulative lock is in force. */
export function isWithdrawalsLocked(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return t < Date.parse(WITHDRAWALS_LOCKED_UNTIL_ISO);
}

// ---------------------------------------------------------------------------
// CHECKER TRACKS program hold (Merlin, Nov 25, 2026):
// Checker Tracks earnings accumulate until Dec 31, 2027 — 20 days AFTER
// the house Dec 11 lock above. Do NOT silently use Dec 11 for these
// earnings. America/Edmonton is MST (UTC-7) in December: Dec 31, 2027
// 23:59 local is 2028-01-01T06:59Z; the hold lifts at midnight going
// into Jan 1, 2028 Edmonton time (07:00 UTC).
// ---------------------------------------------------------------------------

/** Checker Tracks payouts stay locked until midnight into Jan 1, 2028 Edmonton time. */
export const CHECKER_PAYOUTS_LOCKED_UNTIL_ISO = '2028-01-01T07:00:00Z';
export const CHECKER_PAYOUTS_LOCKED_UNTIL_LABEL = 'Dec 31, 2027';
export const CHECKER_PAYOUTS_LOCK_KEY = 'checker_payouts_locked_until';

/** True while the Checker Tracks hold is in force. */
export function checkerPayoutsLocked(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return t < Date.parse(CHECKER_PAYOUTS_LOCKED_UNTIL_ISO);
}

/**
 * Read the live Checker Tracks lock timestamp from wallet_settings
 * (service-role). Falls back to the compiled constant when the table/row
 * is missing — the hold is NEVER silently open.
 */
export async function getCheckerLockUntilIso(admin) {
  try {
    const { data, error } = await admin
      .from('wallet_settings')
      .select('value')
      .eq('key', CHECKER_PAYOUTS_LOCK_KEY)
      .maybeSingle();
    if (!error && data?.value) return String(data.value);
  } catch {
    /* fall through to the constant */
  }
  return CHECKER_PAYOUTS_LOCKED_UNTIL_ISO;
}

/** { locked, locked_until_iso, locked_until_label, countdown_ms } — mirrors getLockInfo. */
export async function getCheckerLockInfo(admin, now = new Date()) {
  const iso = await getCheckerLockUntilIso(admin);
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const target = Date.parse(iso);
  const locked = Number.isFinite(target) ? t < target : true; // unparseable = stay locked
  return {
    locked,
    locked_until_iso: iso,
    locked_until_label: CHECKER_PAYOUTS_LOCKED_UNTIL_LABEL,
    countdown_ms: Math.max(0, (Number.isFinite(target) ? target : Infinity) - t),
  };
}

/**
 * Program-scoped payout gate. Returns true when a payout for this
 * program must stay locked. The house lock already blocks ALL
 * withdrawals until Dec 11, 2027; this extends the hold to Dec 31,
 * 2027 for program 'checker-tracks' only. Every other program is
 * governed by the house lock alone.
 *
 *   isProgramPayoutLocked('checker-tracks', now)  -> true until 2028-01-01T07:00:00Z
 *   isProgramPayoutLocked('trifold', now)         -> false (house lock decides)
 */
export function isProgramPayoutLocked(program, now = new Date()) {
  if (String(program || '') === 'checker-tracks') return checkerPayoutsLocked(now);
  return false;
}

/**
 * Throw when a payout for this program is still locked. Call it before
 * money moves for a program-scoped payout.
 *
 * WHERE IT MUST BE CALLED (no clean per-program hook exists today — the
 * withdraw routes and the payout crons check only the house-wide
 * getLockInfo, and wallet_withdrawals rows carry no program):
 *   1. app/api/wallet/withdraw/route.js + app/api/payouts/withdraw-etransfer/route.js
 *      — at request time, once the request names its program (add a
 *      `program` column to wallet_withdrawals and accept it in the body).
 *   2. app/api/wallet/cron/payout-queue/route.js +
 *      app/api/payouts/cron/*-queue/route.js — per row before paying,
 *      reading the row's program; skip (do not pay, do not fail) rows
 *      whose program is still locked.
 * Until those call sites exist, Checker Tracks earnings are still safe:
 * the house lock blocks every withdrawal until Dec 11, 2027, and the
 * wallet credits themselves only accumulate — but the extra 20 days to
 * Dec 31, 2027 are NOT enforced anywhere until the gate is wired in.
 */
export function assertProgramPayoutAllowed(program, now = new Date()) {
  if (isProgramPayoutLocked(program, now)) {
    const e = new Error(
      `Checker Tracks payouts are locked while earnings accumulate — they unlock ${CHECKER_PAYOUTS_LOCKED_UNTIL_LABEL}.`
    );
    e.status = 423;
    e.locked = true;
    e.locked_until = CHECKER_PAYOUTS_LOCKED_UNTIL_ISO;
    throw e;
  }
}

/** Milliseconds until unlock; <= 0 once unlocked. */
export function msUntilUnlock(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Date.parse(WITHDRAWALS_LOCKED_UNTIL_ISO) - t;
}

/** { days, hours, mins, secs } countdown parts for the doomsday banner. */
export function countdownParts(ms) {
  const m = Math.max(0, Math.round(Number(ms) || 0));
  const days = Math.floor(m / 86400000);
  const hours = Math.floor((m % 86400000) / 3600000);
  const mins = Math.floor((m % 3600000) / 60000);
  const secs = Math.floor((m % 60000) / 1000);
  return { days, hours, mins, secs };
}

/** "67d 04:23:11" style for the banner. */
export function countdownString(ms) {
  const { days, hours, mins, secs } = countdownParts(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Read the live lock timestamp from wallet_settings (service-role).
 * Falls back to the compiled constant when the table/row is missing
 * (e.g. migration not yet executed) — the lock is NEVER silently open.
 */
export async function getLockUntilIso(admin) {
  try {
    const { data, error } = await admin
      .from('wallet_settings')
      .select('value')
      .eq('key', WITHDRAWALS_LOCK_KEY)
      .maybeSingle();
    if (!error && data?.value) return String(data.value);
  } catch {
    /* fall through to the constant */
  }
  return WITHDRAWALS_LOCKED_UNTIL_ISO;
}

/** { locked, locked_until_iso, countdown_ms } — the shape the banner reads. */
export async function getLockInfo(admin, now = new Date()) {
  const iso = await getLockUntilIso(admin);
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const target = Date.parse(iso);
  const locked = Number.isFinite(target) ? t < target : true; // unparseable = stay locked
  return {
    locked,
    locked_until_iso: iso,
    locked_until_label: WITHDRAWALS_LOCKED_UNTIL_LABEL,
    countdown_ms: Math.max(0, (Number.isFinite(target) ? target : Infinity) - t),
  };
}

/**
 * Would this withdrawal exceed the daily velocity cap?
 * Pure — todayTotalCents sums this user's requested/processing/completed
 * withdrawals for the current UTC day (the route computes it).
 */
export function wouldExceedDailyCap(todayTotalCents, amountCents, capCents = DAILY_WITHDRAWAL_CAP_CENTS) {
  const total = Math.max(0, Math.round(Number(todayTotalCents) || 0));
  const amount = Math.max(0, Math.round(Number(amountCents) || 0));
  return total + amount > capCents;
}

/**
 * FIFO queue order: oldest withdrawal request first. Requests created in
 * the same unlock rush tie-break by the user's oldest unsettled earning
 * (oldest earnings paid first — Merlin's fairness rule).
 * oldestCreditByUser: { [user_id]: isoTimestamp }
 */
export function orderPayoutQueue(withdrawals, oldestCreditByUser = {}) {
  return [...(withdrawals || [])].sort((a, b) => {
    const ta = Date.parse(a.created_at) || 0;
    const tb = Date.parse(b.created_at) || 0;
    if (ta !== tb) return ta - tb;
    const ea = Date.parse(oldestCreditByUser[a.user_id] || '') || 0;
    const eb = Date.parse(oldestCreditByUser[b.user_id] || '') || 0;
    return ea - eb;
  });
}
