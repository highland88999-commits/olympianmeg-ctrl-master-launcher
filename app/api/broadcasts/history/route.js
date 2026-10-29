// GET /api/broadcasts/history -> { ok, items: [{ id, audio_url, preset, duration_ms, created_at }] }
//
// The replay shelf for the Concourse notifications menu: past keeper
// announcements, newest first. Any signed-in user may listen;
// publishing stays owner-only (see ./publish/route.js).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';

const LIMIT = 50;

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Broadcast storage is not connected yet.' }, { status: 503 });
  const { data, error } = await admin
    .from('broadcasts')
    .select('id, audio_url, preset, duration_ms, created_at')
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) {
    // The broadcasts table is best-effort (supabase/broadcasts.sql runs
    // only on Merlin's green light): no table yet means no history,
    // not a failure.
    return NextResponse.json({ ok: true, items: [] });
  }
  return NextResponse.json({ ok: true, items: data || [] });
});
