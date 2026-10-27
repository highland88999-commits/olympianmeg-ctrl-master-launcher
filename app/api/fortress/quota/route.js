// app/api/fortress/quota/route.js
// Fortress of Solitude — the signed-in user's storage position.
//
// GET /api/fortress/quota -> { tier, tierLabel, quotaBytes, usedBytes }
// A missing quota row is created on first read with Merlin's free allowance
// (1 GB), seeding used_bytes from the crystal matrix so legacy stored files
// count honestly.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTier, FREE_TIER_ID, stackedBytesForRow } from '@/lib/fortress/tiers';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { ensureQuotaFromMatrix } from '@/lib/fortress/quota-store';

export async function GET(req) {
  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Storage accounting is unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    const { row } = await ensureQuotaFromMatrix(admin, auth.user.id);
    const tier = getTier(row.tier) || getTier(FREE_TIER_ID);
    return NextResponse.json({
      tier: tier.id,
      tierLabel: tier.label,
      quotaBytes: Number(row.quota_bytes) || tier.bytes,
      usedBytes: Math.max(0, Number(row.used_bytes) || 0),
      // Room stacked on top of the base tier via custom purchases (0 when none).
      stackedBytes: stackedBytesForRow(row, tier),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not read your storage.' },
      { status: 502 }
    );
  }
}
