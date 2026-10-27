// app/api/billboard-requests/paused/route.js
// GET (public) — billboard ads the hub panels must skip:
// `stopped` = paused + cancelled subscriptions as
// [{ billboardNumber, company, link }]. The hub reads the repo
// manifest for live ads and drops any entry matching a stopped
// triple, so a paused OR cancelled ad stops showing without a
// manifest rewrite. (The `paused` field is kept for callers that
// only care about paused rows.) A missing table answers empty
// lists (panels render normally) — never an error.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/billboards/request-server';
import { stoppedTriples } from '@/lib/billboards/price-check';

export async function GET() {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: true, paused: [], stopped: [] });
  const { data, error } = await admin.from('billboard_subscriptions')
    .select('billboard_number, company_name, link_url, status').in('status', ['paused', 'cancelled']);
  if (error) return NextResponse.json({ ok: true, paused: [], stopped: [] });
  const stopped = stoppedTriples((data || []).map((s) => ({
    billboard_number: s.billboard_number,
    company_name: s.company_name,
    link_url: s.link_url,
    status: s.status,
  })));
  const pausedOnly = (data || [])
    .filter((s) => s.status === 'paused')
    .map((s) => ({ billboardNumber: s.billboard_number, company: s.company_name, link: s.link_url }));
  return NextResponse.json({ ok: true, paused: pausedOnly, stopped });
}
