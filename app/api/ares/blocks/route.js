// ARES dashboard API: blocklist manager (authenticated).
// GET lists active bans. DELETE with { ipHash } lifts one early.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, serviceClient, getSettings } from '@/lib/ares/server';

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const settings = await getSettings();
  const { data, error } = await serviceClient()
    .from('ares_blocks')
    .select('ip_hash, reason, strikes, expires_at, created_at')
    .gt('expires_at', new Date().toISOString())
    .gte('strikes', settings.strikesBeforeBan)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'could not load blocks' }, { status: 500 });
  return NextResponse.json({ blocks: data });
}

export async function DELETE(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body?.ipHash) return NextResponse.json({ error: 'ipHash is required' }, { status: 400 });
  const { error } = await serviceClient().from('ares_blocks').delete().eq('ip_hash', body.ipHash);
  if (error) return NextResponse.json({ error: 'could not lift the ban' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
