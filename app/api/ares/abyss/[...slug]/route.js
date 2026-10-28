// ARES abyss catch-all: every fake link inside the sandbox points to a
// subpath here, and every subpath serves the same sandbox. There is no
// way out to a real page from inside.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { abyssResponse, bumpTrapHit } from '@/lib/ares/tarpit';

function visitorIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function serve(request) {
  try {
    await bumpTrapHit(visitorIp(request));
  } catch { /* the sandbox serves even if the record fails */ }
  return abyssResponse();
}

export async function GET(request) {
  return serve(request);
}

export async function POST(request) {
  return serve(request);
}
