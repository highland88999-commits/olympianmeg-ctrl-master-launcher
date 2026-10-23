// app/api/economy/refinery/claim/route.js
// POST { log, tickCount, base } — prove refinery play since the last
// checkpoint and convert its aether mints to the server aether balance.
//
// The refinery's molten gold converts to gold BARS (upgrade currency —
// an internal loop, no claim needed) or to AETHER, the true currency.
// Aether mints are replay-proven (lib/economy/refinery.js) and credited
// through the aether ledger under the refinery's own 1000 gold-value
// daily cap. Nothing else in the economy is touched by this route.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  processRefineryClaim, RefinerySetupError, RefineryResyncError,
} from '@/lib/economy/refinery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { log, tickCount, base } = body || {};
  if (!Array.isArray(log) || !Number.isInteger(tickCount) || tickCount < 0) {
    return NextResponse.json({ error: 'Missing game log.' }, { status: 400 });
  }

  const cleanBase = base && typeof base === 'object' && typeof base.prefixHash === 'string'
    && Number.isInteger(base.baseTick) && Number.isInteger(base.coveredI)
    ? { prefixHash: base.prefixHash, baseTick: base.baseTick, coveredI: base.coveredI }
    : null;

  try {
    const client = await getServiceClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Refinery conversion is not connected yet.', setupRequired: true },
        { status: 503 },
      );
    }
    const result = await processRefineryClaim(
      { userId: user.id, log, tickCount, base: cleanBase },
      client,
    );
    const convertedAny = result.creditedAether > 0;
    const notice = result.capped
      ? (convertedAny
        ? 'Converted up to today\u2019s aether limit — the rest stays claimable tomorrow. Batches still refine to bars.'
        : 'Today\u2019s aether conversion limit is reached — batches still refine to bars, and unconverted aether batches stay claimable tomorrow.')
      : null;
    return NextResponse.json({ ...result, notice });
  } catch (err) {
    if (err instanceof RefinerySetupError || err?.setupRequired) {
      return NextResponse.json(
        { error: 'Refinery conversion is not connected yet.', setupRequired: true },
        { status: 503 },
      );
    }
    if (err instanceof RefineryResyncError || err?.resync) {
      return NextResponse.json(
        { error: err.message || 'Refinery state is out of sync.', resync: true },
        { status: 409 },
      );
    }
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Could not process your conversion.' : err.message },
      { status },
    );
  }
}
