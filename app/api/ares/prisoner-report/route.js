// ARES dashboard API: one prisoner's full report (owner-locked:
// Merlin only). GET ?ip_hash=<64-hex> returns the merged report the
// prison shows when the keeper clicks a prisoner's name: what was
// sandboxed, why (and why other things were not), the date and time
// of the sandboxing, the sender's IP hash (never a raw IP), and every
// report sent home for this source — including legal reports and
// agent self-terminate reports.
//
// The report is built server-side by lib/muse-connector/report.js
// buildPrisonerReport from the three tables that hold the facts:
// ares_trapped, ares_attack_sources, ares_events. Nothing here is
// invented: when a capture predates the why-not record, the report
// says so honestly instead of filling the gap.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient } from '@/lib/ares/server';
import { buildPrisonerReport } from '@/lib/muse-connector/report';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  const ipHash = String(new URL(request.url).searchParams.get('ip_hash') || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(ipHash)) {
    return NextResponse.json({ error: 'a valid prisoner id is required' }, { status: 400 });
  }
  let admin;
  try {
    admin = serviceClient();
  } catch {
    return NextResponse.json({ error: 'ARES is not connected' }, { status: 503 });
  }
  const [trappedRes, sourcesRes, eventsRes] = await Promise.all([
    admin.from('ares_trapped').select('ip_hash, reason, score, hits, first_seen, last_seen').eq('ip_hash', ipHash).maybeSingle(),
    admin.from('ares_attack_sources').select('ip_hash, user_agent, last_path, path_count, max_score, reasons, trap_status, first_seen, last_seen').eq('ip_hash', ipHash).maybeSingle(),
    admin.from('ares_events').select('id, ip_hash, event_type, path, user_agent, details, created_at').eq('ip_hash', ipHash).order('created_at', { ascending: false }).limit(50),
  ]);
  if (trappedRes.error || sourcesRes.error || eventsRes.error) {
    return NextResponse.json({ error: 'could not load the prisoner report' }, { status: 500 });
  }
  if (!trappedRes.data && !sourcesRes.data) {
    return NextResponse.json({ error: 'prisoner not found' }, { status: 404 });
  }
  const report = buildPrisonerReport({
    trapped: trappedRes.data || {},
    source: sourcesRes.data || null,
    events: eventsRes.data || [],
  });
  return NextResponse.json({ ok: true, report, events: eventsRes.data || [] });
});
