// GET /api/economy/balance -> { gold }
// The caller's own gold balance. Authenticated users only.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getBalance, EconomyUnavailableError } from '@/lib/economy/ledger';

export async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const gold = await getBalance(auth.user.id);
    return NextResponse.json({ gold });
  } catch (err) {
    if (err instanceof EconomyUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not read your gold balance.' }, { status: err.status || 502 });
  }
}
