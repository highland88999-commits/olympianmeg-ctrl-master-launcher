// app/api/billboard-requests/feed/route.js
// Review feed for the billboard-ad-requests artifact (Merlin's review
// queue). Token-gated: the artifact server presents
// Authorization: Bearer <BILLBOARD_REVIEW_TOKEN> (Vercel env; Merlin
// pastes the same value once into the artifact's settings).
// Returns every request (pending, approved, rejected, subscribed),
// newest first. No token, or no token configured, answers 503 — the
// artifact then honestly shows its connect instructions, never data.
// This endpoint never publishes anything to a live billboard.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, reviewTokenOk, isMissingTable, publicRequest } from '@/lib/billboards/request-server';

export async function GET(req) {
  if (!reviewTokenOk(req)) {
    return NextResponse.json({ ok: false, error: 'Review feed not connected yet.' }, { status: 503 });
  }
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  const { data, error } = await admin.from('billboard_requests')
    .select('*').order('created_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read requests.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, requests: (data || []).map(publicRequest) });
}
