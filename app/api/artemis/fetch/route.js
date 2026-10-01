// app/api/artemis/fetch/route.js
//
// GET /api/artemis/fetch?url=<encoded>  (Bearer token required)
//   -> the remote response body (text, capped at 1 MB)
//
// Replaces BOTH of Merlin's old fetch paths with one server-side route:
//   1. artemis-proxy (a cors-anywhere instance that needed its own Render
//      deployment) — its *function* is ported here, not the proxy server.
//   2. artemis-hub's PROXY_URL ('https://artemis-proxy-rcfq.onrender.com/')
//      — removed entirely; the new build has zero Render reliance.
//
// Unlike cors-anywhere this is allowlisted: only Merlin's ecosystem hosts
// and a small set of public reference hosts are reachable.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getUserFromRequest } from '@/lib/artemis/server';

const FETCH_ALLOWLIST = [
  'vercel.app',
  'wikipedia.org',
  'catbox.moe',
  'file.garden',
  'nexusvortex.ca',
  'image.pollinations.ai',
];

function allowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return FETCH_ALLOWLIST.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

const MAX_BYTES = 1024 * 1024;

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url).searchParams.get('url') || '';
  if (!url || !allowed(url)) {
    return NextResponse.json({ ok: false, error: 'That address is not reachable from here.' }, { status: 400 });
  }

  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'olympus-artemis' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'The address did not answer.' }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `The address answered ${res.status}.` }, { status: 502 });
  }
  const buf = Buffer.from(await res.arrayBuffer()).slice(0, MAX_BYTES);
  const contentType = res.headers.get('content-type') || 'text/plain';
  return new NextResponse(buf, { headers: { 'Content-Type': contentType } });
});
