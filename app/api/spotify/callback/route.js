// app/api/spotify/callback/route.js
// OAuth landing pad. Spotify redirects the browser here after the user
// approves (or denies) access:
//
//   /api/spotify/callback?code=…&state=…
//   /api/spotify/callback?error=access_denied&state=…
//
// This route does NOT touch tokens: it bounces straight back to the app with
// the code in the query string, and the client finishes the flow (verifies
// `state` against sessionStorage, then POSTs code+verifier to
// /api/spotify/exchange where the real server-side exchange happens).
// Keeping the exchange out of the navigation request means the PKCE verifier
// never has to live in a cookie.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

function appOrigin(req) {
  // Trust the request's own origin (same host the user is on).
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req) {
  const origin = appOrigin(req);
  const params = new URL(req.url).searchParams;
  const error = params.get('error');
  const code = params.get('code');
  const state = params.get('state');

  if (error) {
    const back = new URL('/', origin);
    back.searchParams.set('spotify_error', error === 'access_denied' ? 'denied' : 'failed');
    return NextResponse.redirect(back);
  }
  if (!code) {
    const back = new URL('/', origin);
    back.searchParams.set('spotify_error', 'failed');
    return NextResponse.redirect(back);
  }

  const back = new URL('/', origin);
  back.searchParams.set('spotify_code', code);
  if (state) back.searchParams.set('spotify_state', state);
  return NextResponse.redirect(back);
}
