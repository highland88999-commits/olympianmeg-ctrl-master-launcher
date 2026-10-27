// app/api/billboard-requests/cancel/route.js
// POST { subscriptionId } or { all: true } — the OPT-OUT path.
// Cancelling stops the ad (the hub panels skip cancelled triples via
// the paused endpoint's `stopped` list) and stops all future charges:
// the renewal cron only touches active/paused rows, so a cancelled
// subscription is never renewed — including never at the new million
// tier price. The month already paid for is NOT refunded; the notice
// copy says so plainly. Only the subscription's owner can cancel it.

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
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to cancel.' }, { status: e.status || 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  if (body?.all === true) {
    const { data, error } = await admin.from('billboard_subscriptions')
      .update({ status: 'cancelled', updated_at: now })
      .eq('user_id', user.id).in('status', ['active', 'paused']).select('id');
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
      return NextResponse.json({ ok: false, error: 'Could not cancel.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, cancelled: (data || []).map((d) => d.id) });
  }
  const { data: sub, error: readErr } = await admin.from('billboard_subscriptions')
    .select('*').eq('id', body?.subscriptionId).maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read that subscription.' }, { status: 502 });
  }
  if (!sub || sub.user_id !== user.id) return NextResponse.json({ ok: false, error: 'Subscription not found.' }, { status: 404 });
  if (sub.status === 'cancelled') return NextResponse.json({ ok: true, cancelled: [sub.id], replay: true });
  const { error } = await admin.from('billboard_subscriptions')
    .update({ status: 'cancelled', updated_at: now }).eq('id', sub.id);
  if (error) return NextResponse.json({ ok: false, error: 'Could not cancel.' }, { status: 502 });
  return NextResponse.json({ ok: true, cancelled: [sub.id] });
}
