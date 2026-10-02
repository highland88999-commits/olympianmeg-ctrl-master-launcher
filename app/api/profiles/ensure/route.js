// app/api/profiles/ensure/route.js
// POST /api/profiles/ensure — idempotently create BOTH profiles
// (personal + business) for the signed-in user. Covers accounts created
// before the supabase/profiles.sql signup trigger existed.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { ensureProfiles } from '@/lib/profiles/ensure';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const profiles = await ensureProfiles(auth.user);
    return NextResponse.json({ ok: true, profiles });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/not connected yet/i.test(msg)) {
      return NextResponse.json({ error: 'Profiles are not connected yet. Please check back soon.' }, { status: 503 });
    }
    throw err;
  }
});
