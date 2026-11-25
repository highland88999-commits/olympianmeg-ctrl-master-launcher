// app/api/mars2/outpost/route.js — my Mars 2 outpost.
//   GET /api/mars2/outpost -> { ok, outpost: { x, z } | null, allocated }
// First visit allocates the user's own outpost (random, never
// overlapping another user's area — supabase/mars2-outposts.sql);
// later visits return the same site. Before that SQL runs, the
// route answers 503 with a plain-English message and Mars 2 falls
// back to the one shared seeded outpost, exactly as today.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';

function tableMissingResponse() {
  return NextResponse.json(
    { ok: false, error: 'Personal outposts are not set up yet. The host needs to add the database table first.' },
    { status: 503 },
  );
}

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Outposts are not connected yet.' }, { status: 503 });

  try {
    const { data, error } = await admin
      .from('mars2_outposts')
      .select('x, z')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) return NextResponse.json({ ok: true, outpost: { x: data.x, z: data.z }, allocated: false });

    // First visit: the server allocates the spot (atomic, so no
    // two users can win the same ground).
    const { data: allocated, error: rpcError } = await admin.rpc('allocate_mars2_outpost', {
      p_user_id: auth.user.id,
    });
    if (rpcError) throw rpcError;
    const row = Array.isArray(allocated) ? allocated[0] : allocated;
    if (!row) return NextResponse.json({ error: 'Could not place your outpost.' }, { status: 500 });
    return NextResponse.json({ ok: true, outpost: { x: row.x, z: row.z }, allocated: !!row.created });
  } catch (e) {
    // Table or function missing (SQL not run yet): 503, plain words.
    if (e && (e.code === '42P01' || e.code === '42883')) return tableMissingResponse();
    return NextResponse.json({ error: e.message || 'Could not load your outpost.' }, { status: 500 });
  }
}));
