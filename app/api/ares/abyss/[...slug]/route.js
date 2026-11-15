// ARES abyss catch-all: every fake link inside the sandbox points to a
// subpath here, and every subpath serves the same sandbox. There is no
// way out to a real page from inside.
//
// RUSSIAN DOLLS (Merlin, 2026-11-15): once a prisoner is in the dolls,
// every subpath serves their current doll, never the maze again — the
// ratchet only goes deeper. A doll-N URL requested by a prisoner on a
// different layer serves their own layer, not the one in the URL: the
// server's record wins over the address bar.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { abyssResponse, bumpTrapHit } from '@/lib/ares/tarpit';
import { currentDollLayer, dollResponse } from '@/lib/ares/dolls';
import { hashVisitorIp } from '@/lib/ares/server';

function visitorIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function serve(request, ctx) {
  const ip = visitorIp(request);
  try {
    await bumpTrapHit(ip);
  } catch { /* the sandbox serves even if the record fails */ }
  // Pass the requested subpath into the maze page builder so each
  // subpath serves its own deterministic fake page; the hit count
  // still bumps once per visit, as before. The full query string is
  // forwarded (not just ?q=) so the doll layers' forms — shell
  // commands, SQL, login, search — arrive intact; the maze renderer
  // only ever reads ?q= and ignores the rest.
  let subpath = '';
  let query = {};
  try {
    const params = ctx ? await ctx.params : null;
    const parts = params && Array.isArray(params.slug) ? params.slug : [];
    subpath = parts.join('/');
    const url = new URL(request.url);
    query = Object.fromEntries(url.searchParams.entries());
    const qs = url.searchParams.toString();
    if (qs) subpath += `?${qs}`;
  } catch { /* fall back to the index page */ }
  // One-way ratchet: a prisoner in the dolls stays in the dolls.
  try {
    const layer = await currentDollLayer({ ip, referer: request.headers.get('referer') });
    if (layer > 0) {
      let seedKey = 'test';
      try { seedKey = hashVisitorIp(ip); } catch { /* fall back to 'test' */ }
      // The doll's own subpath: strip a leading doll-N/ segment when
      // present (the layer served is the prisoner's own, not the URL's).
      const inner = subpath.replace(/^doll-\d+\/?/, '').split('?')[0];
      return dollResponse(layer, { seedKey, escapedPath: '/', subpath: inner, query });
    }
  } catch { /* fall through to the maze */ }
  return abyssResponse(subpath);
}

export async function GET(request, ctx) {
  return serve(request, ctx);
}

export async function POST(request, ctx) {
  return serve(request, ctx);
}
