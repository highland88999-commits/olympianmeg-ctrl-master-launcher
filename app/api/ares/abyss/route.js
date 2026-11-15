// ARES abyss — the sandbox itself. Any request rewritten here (or any
// fake link inside the sandbox, which all point back here) gets the fake
// environment, never a real page. First entry (?from=) traps the source
// and records its attack source; later visits just bump the hit count.
// This route is excluded from the edge middleware matcher, so serving
// the abyss never re-triggers the middleware.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { abyssResponse, trapAttackSource, recordAttackSource, bumpTrapHit } from '@/lib/ares/tarpit';

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
  return abyssResponse('');
}

export async function GET(request) {
  return serve(request);
}

export async function POST(request) {
  return serve(request);
}
