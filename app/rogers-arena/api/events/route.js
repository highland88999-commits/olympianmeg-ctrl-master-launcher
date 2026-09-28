// app/rogers-arena/api/events/route.js
// GET /rogers-arena/api/events?venueId=<ticketmaster venue id>
// Lists real upcoming events at a venue (hockey, concerts, etc.), soonest
// first. Server-only: the TICKETMASTER_API_KEY env var never leaves the server.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { normalizeEvent, venueEventsUrl } from '@/lib/tickets';
import { ticketmasterKey, offlineResponse, providerJson, providerFetch } from '@/lib/tickets-server';

export async function GET(request) {
  const key = ticketmasterKey();
  if (!key) return offlineResponse();

  const venueId = new URL(request.url).searchParams.get('venueId');
  if (!venueId || !venueId.trim()) {
    return NextResponse.json({ error: 'venueId is required' }, { status: 400 });
  }

  let res;
  try {
    res = await providerFetch(venueEventsUrl(key, venueId.trim()));
  } catch {
    return NextResponse.json({ error: 'provider unreachable' }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'provider error' }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  const raw = Array.isArray(data?._embedded?.events) ? data._embedded.events : [];
  const events = raw.map(normalizeEvent).filter(Boolean);
  return providerJson({ events });
}
