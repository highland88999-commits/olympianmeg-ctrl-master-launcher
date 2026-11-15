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

async function serve(request, ctx) {
  try {
    await bumpTrapHit(visitorIp(request));
  } catch { /* the sandbox serves even if the record fails */ }
  // Pass the requested subpath into the maze page builder so each
  // subpath serves its own deterministic fake page; the hit count
  // still bumps once per visit, as before.
  let subpath = '';
  try {
    const params = ctx ? await ctx.params : null;
    const parts = params && Array.isArray(params.slug) ? params.slug : [];
    subpath = parts.join('/');
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    if (q) subpath += `?q=${encodeURIComponent(q)}`;
  } catch { /* fall back to the index page */ }
  return abyssResponse(subpath);
}

export async function GET(request, ctx) {
  return serve(request, ctx);
}

export async function POST(request, ctx) {
  return serve(request, ctx);
}
