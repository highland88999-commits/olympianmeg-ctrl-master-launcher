// World Engine — credit balance API (server-side only).
//
// GET /api/world-engine/credits  (Bearer token required)
//   -> { tokens, freeUsed, freeRemaining, freeResetMonth }

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { FREE_GENERATIONS_PER_MONTH, monthKey } from '@/lib/world-engine/economy';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data, error } = await admin
    .from('world_engine_credits')
    .select('tokens, free_used, free_reset_month')
    .eq('user_id', auth.user.id)
    .single();
  // A failed read must never masquerade as a zero balance.
  if (error && error.code !== 'PGRST116') {
    console.error('World Engine credits read failed:', error.message);
    return NextResponse.json({ error: 'Could not read your credit balance.' }, { status: 500 });
  }

  const currentMonth = monthKey();
  const freeUsed = data && data.free_reset_month === currentMonth ? data.free_used || 0 : 0;

  return NextResponse.json({
    tokens: data?.tokens || 0,
    freeUsed,
    freeRemaining: Math.max(0, FREE_GENERATIONS_PER_MONTH - freeUsed),
    freePerMonth: FREE_GENERATIONS_PER_MONTH,
  });
});
