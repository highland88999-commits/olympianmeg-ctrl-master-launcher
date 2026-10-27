// app/api/billboard-requests/mine/route.js
// GET the signed-in user's own billboard requests (all statuses,
// newest first). Users see ONLY their own rows.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser, isMissingTable, publicRequest } from '@/lib/billboards/request-server';

export async function GET(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to see your requests.' }, { status: e.status || 401 });
  }
  const { data, error } = await admin.from('billboard_requests')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read your requests.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, requests: (data || []).map(publicRequest) });
}
