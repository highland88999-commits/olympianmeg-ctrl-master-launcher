// app/rogers-arena/api/venues/route.js
// GET /rogers-arena/api/venues?q=<stadium name>
// Searches real stadiums/venues via the Ticketmaster Discovery API.
// Server-only: the TICKETMASTER_API_KEY env var never leaves the server.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { normalizeVenue, venueSearchUrl } from '@/lib/tickets';
import { ticketmasterKey, offlineResponse, providerJson, providerFetch } from '@/lib/tickets-server';

export async function GET(request) {
  const key = ticketmasterKey();
  if (!key) return offlineResponse();

  const q = new URL(request.url).searchParams.get('q');
  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'q (venue name) is required' }, { status: 400 });
  }

  let res;
  try {
    res = await providerFetch(venueSearchUrl(key, q.trim()));
  } catch {
    return NextResponse.json({ error: 'provider unreachable' }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'provider error' }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  const raw = Array.isArray(data?._embedded?.venues) ? data._embedded.venues : [];
  const venues = raw.map(normalizeVenue).filter(Boolean);
  return providerJson({ venues });
}
