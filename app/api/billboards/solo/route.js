// app/api/billboards/solo/route.js
// GET (public) — billboard ads holding a whole billboard solo:
// `solo` = active solo subscriptions as
// [{ billboardNumber, company, link, creativeType, creativeUrl }].
// The hub reads the repo manifest for live ads and forces any board
// with an active solo to that entry alone, so a solo ad takes its
// billboard immediately — even before the next manifest wire — and
// the house ad + rotating entries stay off that number for the solo
// term. Only status 'active' counts: the renew cron moves unpaid
// expiry to 'paused' and cancel moves it to 'cancelled', so 'active'
// alone is the live signal. A missing table (or service) answers an
// empty list (panels render normally) — never an error.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/billboards/request-server';
import { soloEntryFromSubscription } from '@/lib/billboards/playlist';

export async function GET() {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: true, solo: [] });
  const { data, error } = await admin.from('billboard_subscriptions')
    .select('billboard_number, company_name, link_url, creative_type, creative_url, plan, status')
    .eq('plan', 'solo')
    .eq('status', 'active');
  if (error) return NextResponse.json({ ok: true, solo: [] });
  const solo = [];
  for (const s of data || []) {
    const entry = soloEntryFromSubscription(s);
    if (!entry) continue;
    solo.push({ billboardNumber: s.billboard_number, ...entry });
  }
  return NextResponse.json({ ok: true, solo });
}
