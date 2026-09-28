// lib/tickets-server.js
// SERVER ONLY. Reads the Ticketmaster API key from the environment and talks
// to the Ticketmaster Discovery API. Never import this file from client
// components — the key must never reach the browser.
//
// Required Vercel env var: TICKETMASTER_API_KEY
// (free key from https://developer.ticketmaster.com — Discovery API v2,
//  5,000 calls/day, 5 req/sec on the free tier)

import { NextResponse } from 'next/server';
import { TICKETMASTER_ENV_VAR } from './tickets';

export function ticketmasterKey() {
  const key = process.env[TICKETMASTER_ENV_VAR];
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

// Honest offline state: no key configured => 503 with { offline: true }.
// The UI shows "Ticket listings are offline" instead of fake events.
export function offlineResponse() {
  return NextResponse.json(
    { offline: true, error: 'Ticket provider is not configured yet.' },
    { status: 503 }
  );
}

// Successful provider responses are cached at the edge for 5 minutes so we
// stay well inside the free-tier rate limits.
export function providerJson(payload) {
  const res = NextResponse.json(payload);
  res.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  return res;
}

export async function providerFetch(url) {
  return fetch(url, { headers: { Accept: 'application/json' } });
}
