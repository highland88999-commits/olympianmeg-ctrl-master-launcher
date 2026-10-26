// tests/wallet-lock.test.js — Headless tests for the Christmas unlock
// ("doomsday"): accumulative lock, countdown, autonomous FIFO payout queue.
// Run: node tests/wallet-lock.test.js (from the repo root). No browser, no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WITHDRAWALS_LOCKED_UNTIL_ISO,
  isWithdrawalsLocked,
  msUntilUnlock,
  countdownParts,
  countdownString,
  wouldExceedDailyCap,
  orderPayoutQueue,
  DAILY_WITHDRAWAL_CAP_CENTS,
} from '../lib/wallet/lock.js';
import {
  queueCanRun,
  decidePayout,
  summarizeRun,
} from '../lib/wallet/payout.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261004_wallet_ledger.sql'), 'utf8');

// ---------------------------------------------------------------------------
// The lock: Saturday Dec 11, 2027 00:00 America/Edmonton = 07:00 UTC (MST).
// (Moved from Dec 11, 2026 on 2026-10-26, Merlin: regulatory runway.)
// ---------------------------------------------------------------------------
t('lock timestamp is Dec 11 07:00 UTC (00:00 MST)',
  WITHDRAWALS_LOCKED_UNTIL_ISO === '2027-12-11T07:00:00Z');
t('locked well before (Oct 2026)', isWithdrawalsLocked(new Date('2026-10-04T12:00:00Z')));
t('locked one second before unlock', isWithdrawalsLocked(new Date('2027-12-11T06:59:59Z')));
t('unlocked exactly at the boundary', !isWithdrawalsLocked(new Date('2027-12-11T07:00:00Z')));
t('unlocked after (Christmas)', !isWithdrawalsLocked(new Date('2027-12-25T00:00:00Z')));
t('locked at 23:59 Edmonton Dec 10 (06:59 UTC Dec 11)',
  isWithdrawalsLocked(new Date('2027-12-11T06:59:00Z')));
t('msUntilUnlock positive before', msUntilUnlock(new Date('2027-12-10T07:00:00Z')) === 86400000);
t('msUntilUnlock negative after', msUntilUnlock(new Date('2027-12-12T07:00:00Z')) < 0);

// ---------------------------------------------------------------------------
// Countdown math for the banner.
// ---------------------------------------------------------------------------
const parts = countdownParts(90061000); // 1d 1h 1m 1s
t('countdown days', parts.days === 1);
t('countdown hours', parts.hours === 1);
t('countdown mins', parts.mins === 1);
t('countdown secs', parts.secs === 1);
t('countdown clamps negative to zero',
  countdownParts(-5000).days === 0 && countdownParts(-5000).secs === 0);
t('countdown string shape', countdownString(90061000) === '1d 01:01:01');

// ---------------------------------------------------------------------------
// Release gating: the queue runs ONLY when unlocked AND Merlin released.
// ---------------------------------------------------------------------------
t('queue runs when unlocked + released', queueCanRun({ locked: false, released: true }));
t('queue does NOT run while locked (even released)',
  !queueCanRun({ locked: true, released: true }));
t('queue does NOT run without his release (even unlocked)',
  !queueCanRun({ locked: false, released: false }));
t('queue does NOT run when both false', !queueCanRun({ locked: true, released: false }));

// ---------------------------------------------------------------------------
// Liquidity: pay when covered, pause-funds when short. Never fake it.
// ---------------------------------------------------------------------------
t('pays when balance covers', decidePayout({ balanceCents: 10000, amountCents: 5000 }) === 'pay');
t('pays on exact cover', decidePayout({ balanceCents: 5000, amountCents: 5000 }) === 'pay');
t('pauses when short', decidePayout({ balanceCents: 4999, amountCents: 5000 }) === 'pause-funds');
t('pauses on zero balance', decidePayout({ balanceCents: 0, amountCents: 500 }) === 'pause-funds');
t('pauses on zero amount', decidePayout({ balanceCents: 99999, amountCents: 0 }) === 'pause-funds');

// ---------------------------------------------------------------------------
// FIFO: oldest request first; unlock-rush ties break by oldest earning.
// ---------------------------------------------------------------------------
const w1 = { id: 'a', user_id: 'u1', created_at: '2026-12-11T07:00:01Z' };
const w2 = { id: 'b', user_id: 'u2', created_at: '2026-12-11T07:00:00Z' };
const w3 = { id: 'c', user_id: 'u3', created_at: '2026-12-11T07:00:01Z' }; // ties w1
const ordered = orderPayoutQueue([w1, w2, w3], {
  u1: '2026-11-01T00:00:00Z', // u1 earned first
  u3: '2026-11-15T00:00:00Z',
});
t('oldest request first', ordered[0].id === 'b');
t('tie broken by oldest earning', ordered[1].id === 'a' && ordered[2].id === 'c');
t('empty queue sorts to empty', orderPayoutQueue([]).length === 0);

// ---------------------------------------------------------------------------
// Anti-fraud: $500/day velocity cap.
// ---------------------------------------------------------------------------
t('daily cap default is $500', DAILY_WITHDRAWAL_CAP_CENTS === 50000);
t('under cap passes', !wouldExceedDailyCap(40000, 9999));
t('exactly at cap passes', !wouldExceedDailyCap(40000, 10000));
t('over cap blocked', wouldExceedDailyCap(40000, 10001));
t('zero today + big request blocked', wouldExceedDailyCap(0, 50001));

// ---------------------------------------------------------------------------
// Run summaries stay honest.
// ---------------------------------------------------------------------------
const sum = summarizeRun([
  { outcome: 'paid' }, { outcome: 'paid' }, { outcome: 'paused-funds' },
  { outcome: 'awaiting-destination' }, { outcome: 'failed' }, { outcome: 'weird' },
]);
t('summary counts paid', sum.paid === 2);
t('summary counts paused-funds', sum.pausedFunds === 1);
t('summary counts awaiting-destination', sum.awaitingDestination === 1);
t('summary counts failed', sum.failed === 1);
t('summary buckets unknown as skipped', sum.skipped === 1);

// ---------------------------------------------------------------------------
// Migration guarantees for the Christmas unlock.
// ---------------------------------------------------------------------------
t('migration creates wallet_settings', mig.includes('create table if not exists public.wallet_settings'));
t('migration seeds the Dec 11 lock',
  mig.includes(`'withdrawals_locked_until', '2026-12-11T07:00:00Z'`));
const mig2027 = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261026_wallet_lock_2027.sql'), 'utf8');
t('2027 migration moves the live lock row to Dec 11, 2027',
  mig2027.includes(`'withdrawals_locked_until'`) && mig2027.includes(`'2027-12-11T07:00:00Z'`));
t('migration creates payout_releases', mig.includes('create table if not exists public.payout_releases'));
t('migration adds paused-funds status',
  mig.includes("'paused-funds'") && mig.includes('wallet_withdrawals_status_check'));
t('migration adds payout_destination to wallets',
  mig.includes('add column if not exists payout_destination'));
t('settings table has no public policies (service-role only)',
  !/create policy[^;]*wallet_settings/i.test(mig));

console.log(`\nwallet-lock: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
