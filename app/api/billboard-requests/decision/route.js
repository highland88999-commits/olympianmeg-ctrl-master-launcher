// app/api/billboard-requests/decision/route.js
// Merlin's review decision, called by the billboard-ad-requests
// artifact (same review token as the feed route). POST
// { id, decision: 'approved'|'rejected', billboardNumber? }.
// Approving assigns the billboard number the ad is approved for
// (required, 1–44). Only pending rows can be decided; approved rows
// wait for the user's wallet-credit subscription, rejected rows are
// terminal. Deciding never publishes to a live billboard on its own.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, reviewTokenOk, isMissingTable } from '@/lib/billboards/request-server';
import { isValidBillboardNumber } from '@/lib/billboards/validate';

export async function POST(req) {
  if (!reviewTokenOk(req)) {
    return NextResponse.json({ ok: false, error: 'Review feed not connected yet.' }, { status: 503 });
  }
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const decision = body?.decision;
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ ok: false, error: 'Decision must be approved or rejected.' }, { status: 400 });
  }
  let assigned = null;
  if (decision === 'approved') {
    assigned = Number(body?.billboardNumber);
    if (!isValidBillboardNumber(assigned)) {
      return NextResponse.json({ ok: false, error: 'Approval needs a billboard number from 1 to 44.' }, { status: 400 });
    }
  }
  const { data: row, error: readErr } = await admin.from('billboard_requests')
    .select('*').eq('id', body?.id).maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read that request.' }, { status: 502 });
  }
  if (!row) return NextResponse.json({ ok: false, error: 'Request not found.' }, { status: 404 });
  if (row.status !== 'pending') {
    return NextResponse.json({ ok: false, error: `That request is already ${row.status}.` }, { status: 409 });
  }
  const { error } = await admin.from('billboard_requests').update({
    status: decision,
    assigned_number: assigned,
    decided_at: new Date().toISOString(),
  }).eq('id', row.id);
  if (error) return NextResponse.json({ ok: false, error: 'Could not save that decision.' }, { status: 502 });
  return NextResponse.json({ ok: true, id: row.id, status: decision, assignedNumber: assigned });
}
