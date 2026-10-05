// lib/wallet/lock.js
// The Christmas unlock ("doomsday") — the day the vaults open.
//
// Merlin's vote (2026-10-04): every wallet sits in an ACCUMULATIVE state
// until Friday, December 11, 2026, 00:00 America/Edmonton (two weeks before
// Christmas). Earnings accrue; the withdraw buttons stay locked with
// "Unlocks Dec 11" messaging. Then withdrawals unlock for ALL users.
//
// Pure functions here (testable with plain node). Server-only in practice.

/** America/Edmonton is MST (UTC-7) in December: 00:00 local = 07:00 UTC. */
export const WITHDRAWALS_LOCKED_UNTIL_ISO = '2026-12-11T07:00:00Z';
export const WITHDRAWALS_LOCKED_UNTIL_LABEL = 'Dec 11, 2026';
export const WITHDRAWALS_LOCK_KEY = 'withdrawals_locked_until';

/** Anti-fraud defaults (Merlin's call, 2026-10-04): sane, documented. */
export const DAILY_WITHDRAWAL_CAP_CENTS = 50000; // $500 per user per calendar day
export const MAX_QUEUE_BATCH = 25; // withdrawals processed per cron run

/** True while the accumulative lock is in force. */
export function isWithdrawalsLocked(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return t < Date.parse(WITHDRAWALS_LOCKED_UNTIL_ISO);
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
