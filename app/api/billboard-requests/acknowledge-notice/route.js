// app/api/billboard-requests/acknowledge-notice/route.js
// POST {} — the advertiser tapped "Keep my ads" on the price-change
// pop-up. Records acknowledged_at on their notice row, which stops
// the pop-up (the banner about the upcoming change still shows on
// the request page while the threshold is reached). Acknowledging
// does not change the subscription: the next renewal after the
// 1,000,000-user flip is at the new price, exactly as the notice said.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser, isMissingTable } from '@/lib/billboards/request-server';

export async function POST(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in.' }, { status: e.status || 401 });
  }
  const { error } = await admin.from('billboard_price_notices').update({
    acknowledged_at: new Date().toISOString(),
  }).eq('user_id', user.id);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not save that.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
