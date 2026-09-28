// app/rogers-arena/api/event/route.js
// GET /rogers-arena/api/event?id=<ticketmaster event id>
// Full detail for one real event: prices, seat map, notes, and the official
// Ticketmaster checkout link. Server-only: the API key never leaves the server.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { normalizeEventDetail, eventDetailUrl } from '@/lib/tickets';
import { ticketmasterKey, offlineResponse, providerJson, providerFetch } from '@/lib/tickets-server';

export async function GET(request) {
  const key = ticketmasterKey();
  if (!key) return offlineResponse();

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !id.trim()) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  let res;
  try {
    res = await providerFetch(eventDetailUrl(key, id.trim()));
  } catch {
    return NextResponse.json({ error: 'provider unreachable' }, { status: 502 });
  }
  if (res.status === 404) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'provider error' }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  const event = normalizeEventDetail(data);
  if (!event) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }
  return providerJson({ event });
}
