// ARES abyss — the sandbox itself. Any request rewritten here (or any
// fake link inside the sandbox, which all point back here) gets the fake
// environment, never a real page. First entry (?from=) traps the source
// and records its attack source; later visits just bump the hit count.
// This route is excluded from the edge middleware matcher, so serving
// the abyss never re-triggers the middleware.
//
// RUSSIAN DOLLS (Merlin, 2026-11-15): a trapped source that asks for
// a path OUTSIDE the abyss is trying to break out. The middleware
// passes that attempt as ?escape=<path>. Each escape drops the
// prisoner one doll deeper (maze -> 1 -> ... -> 6; layer 6 stays
// layer 6), and the doll's fiction makes them think they are free.
// Once a prisoner is in the dolls, every visit here serves their
// current doll, never the maze again — the ratchet only goes deeper.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { abyssResponse, trapAttackSource, recordAttackSource, bumpTrapHit } from '@/lib/ares/tarpit';
import { advanceDollLayer, currentDollLayer, dollResponse, sanitizeEscapedPath } from '@/lib/ares/dolls';
import { hashVisitorIp } from '@/lib/ares/server';

function visitorIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function serve(request) {
  const ip = visitorIp(request);
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const score = Number(url.searchParams.get('score')) || 0;
  try {
    if (from) {
      await trapAttackSource({ ip, reason: 'Extra-malicious attack', score });
      await recordAttackSource({
        ip,
        userAgent: request.headers.get('user-agent'),
        path: from,
        score,
        reasons: ['extra-malicious: trapped in the abyss'],
        trapped: true,
      });
    } else {
      await bumpTrapHit(ip);
    }
  } catch { /* the sandbox serves even if the record fails */ }
  // A breakout attempt (?escape=): one doll deeper, and the new layer's
  // fiction is what the prisoner sees — never the real path they asked
  // for, never the maze again.
  const escape = url.searchParams.get('escape');
  if (escape) {
    try {
      const { toLayer } = await advanceDollLayer({
        ip,
        escapedPath: escape,
        referer: request.headers.get('referer'),
      });
      let seedKey = 'test';
      try { seedKey = hashVisitorIp(ip); } catch { /* fall back to 'test' */ }
      return dollResponse(toLayer, { seedKey, escapedPath: sanitizeEscapedPath(escape) });
    } catch { /* fall through to the maze on any doll failure */ }
  }
  // One-way ratchet: a prisoner already in the dolls never sees the
  // maze again — every visit serves their current doll.
  try {
    const layer = await currentDollLayer({ ip, referer: request.headers.get('referer') });
    if (layer > 0) {
      let seedKey = 'test';
      try { seedKey = hashVisitorIp(ip); } catch { /* fall back to 'test' */ }
      return dollResponse(layer, { seedKey, escapedPath: '/' });
    }
  } catch { /* fall through to the maze */ }
  return abyssResponse('');
}

export async function GET(request) {
  return serve(request);
}

export async function POST(request) {
  return serve(request);
}
