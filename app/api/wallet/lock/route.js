// app/api/wallet/lock/route.js
// GET /api/wallet/lock — public. The doomsday countdown feed for the
// banner: is the accumulative lock on, when does it lift, how long left.
// No auth needed — the banner shows for everyone until Dec 11.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getLockInfo } from '@/lib/wallet/lock';

export const GET = apiGuard(async function GET() {
  const admin = await getServiceClient();
  if (!admin) {
    // Service not connected: report locked (never silently open).
    const { isWithdrawalsLocked, msUntilUnlock, WITHDRAWALS_LOCKED_UNTIL_ISO, WITHDRAWALS_LOCKED_UNTIL_LABEL } =
      await import('@/lib/wallet/lock');
    return Response.json({
      ok: true,
      locked: isWithdrawalsLocked(new Date()),
      locked_until_iso: WITHDRAWALS_LOCKED_UNTIL_ISO,
      locked_until_label: WITHDRAWALS_LOCKED_UNTIL_LABEL,
      countdown_ms: Math.max(0, msUntilUnlock(new Date())),
      connected: false,
    });
  }
  const info = await getLockInfo(admin, new Date());
  return Response.json({ ok: true, ...info, connected: true });
});
