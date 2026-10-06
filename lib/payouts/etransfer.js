// lib/payouts/etransfer.js
// Shared e-transfer payout helpers: re-crediting a withdrawal when Wise
// bounces or refunds a transfer. Server-only.
import { creditWallet, releaseHold } from '@/lib/wallet/ledger';
import { auditPayout } from '@/lib/payouts/settings';

async function setWithdrawal(admin, id, patch) {
  const { error } = await admin.from('wallet_withdrawals').update(patch).eq('id', id);
  if (error) throw new Error(`Status update failed: ${error.message}`);
}

/**
 * Re-credit a withdrawal when Wise bounces or refunds the transfer.
 * Funds were debited only if the transfer was actually funded (audit has
 * 'wise_funded'); otherwise the hold is simply released. Never touches a
 * withdrawal already marked 'completed'. Returns true when it acted.
 */
export async function recreditWithdrawal(admin, withdrawalId, reason) {
  const { data: w } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status')
    .eq('id', withdrawalId)
    .maybeSingle();
  if (!w || w.status === 'completed') return false;
  const { data: funded } = await admin
    .from('payout_audit_log')
    .select('id')
    .eq('withdrawal_id', withdrawalId)
    .eq('action', 'wise_funded')
    .limit(1)
    .maybeSingle();
  if (funded) {
    await creditWallet(admin, w.user_id, {
      program: 'payout_refund',
      amountCents: w.amount_cents,
      reason: `E-Transfer refunded: ${reason}`,
      reference: `wallet:withdrawal:${w.id}:refund`,
      currency: 'cad',
    });
  } else {
    await releaseHold(admin, w.user_id, w.amount_cents);
  }
  await setWithdrawal(admin, w.id, { status: 'failed', note: `E-Transfer refunded: ${reason}`.slice(0, 500) });
  await auditPayout(admin, {
    withdrawalId: w.id,
    userId: w.user_id,
    action: 'refunded',
    detail: { reason: String(reason).slice(0, 300), was_debited: !!funded },
  });
  return true;
}
