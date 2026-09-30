// ARES dashboard API: recent evidence events (authenticated).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, serviceClient } from '@/lib/ares/server';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));
  const type = searchParams.get('type');

  let query = serviceClient()
    .from('ares_events')
    .select('id, ip_hash, event_type, path, user_agent, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (type) query = query.eq('event_type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'could not load events' }, { status: 500 });
  return NextResponse.json({ events: data });
});
