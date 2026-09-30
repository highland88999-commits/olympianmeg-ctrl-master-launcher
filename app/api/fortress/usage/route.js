// app/api/fortress/usage/route.js
// Fortress of Solitude — report stored bytes after a successful store,
// or release them after a delete.
//
// POST /api/fortress/usage { op: 'add' | 'remove', bytes }
//   -> { usedBytes, quotaBytes, tier }
//
// The client calls this AFTER its direct-to-GCS PUT lands (add) or after a
// confirmed delete (remove). used_bytes never goes below zero. Purchases
// never flow through here — only the Stripe webhook changes quota_bytes.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTier, FREE_TIER_ID } from '@/lib/fortress/tiers';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { addUsedBytes, removeUsedBytes, ensureQuotaFromMatrix } from '@/lib/fortress/quota-store';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const op = body?.op;
  const bytes = Math.max(0, Number(body?.bytes) || 0);
  if (op !== 'add' && op !== 'remove') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Storage accounting is unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    await ensureQuotaFromMatrix(admin, auth.user.id);
    const row = op === 'add'
      ? await addUsedBytes(admin, auth.user.id, bytes)
      : await removeUsedBytes(admin, auth.user.id, bytes);
    const tier = getTier(row.tier) || getTier(FREE_TIER_ID);
    return NextResponse.json({
      usedBytes: Math.max(0, Number(row.used_bytes) || 0),
      quotaBytes: Number(row.quota_bytes) || tier.bytes,
      tier: tier.id,
      tierLabel: tier.label,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not update your storage.' },
      { status: 502 }
    );
  }
}
