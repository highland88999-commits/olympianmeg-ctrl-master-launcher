// ARES dashboard API: trapped sources + attack-source report
// (owner-locked: Merlin only). GET lists both; DELETE { ipHash }
// releases one trapped source back to normal handling.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient } from '@/lib/ares/server';
import { releaseTrap } from '@/lib/ares/tarpit';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  let admin;
  try {
    admin = serviceClient();
  } catch {
    return NextResponse.json({ error: 'ARES is not connected' }, { status: 503 });
  }
  const [trappedRes, sourcesRes] = await Promise.all([
    admin.from('ares_trapped').select('ip_hash, reason, score, hits, first_seen, last_seen').order('last_seen', { ascending: false }).limit(100),
    admin.from('ares_attack_sources').select('ip_hash, user_agent, last_path, path_count, max_score, reasons, trap_status, first_seen, last_seen').order('last_seen', { ascending: false }).limit(100),
  ]);
  if (trappedRes.error || sourcesRes.error) {
    return NextResponse.json({ error: 'could not load trapped sources (run supabase/ares-allowlist.sql)' }, { status: 500 });
  }
  return NextResponse.json({ trapped: trappedRes.data || [], sources: sourcesRes.data || [] });
});

export const DELETE = apiGuard(async function DELETE(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const ipHash = typeof body?.ipHash === 'string' ? body.ipHash.trim() : '';
  if (!/^[0-9a-f]{64}$/i.test(ipHash)) {
    return NextResponse.json({ error: 'a valid source hash is required' }, { status: 400 });
  }
  const ok = await releaseTrap(ipHash);
  if (!ok) return NextResponse.json({ error: 'could not release' }, { status: 500 });
  return NextResponse.json({ ok: true });
});
