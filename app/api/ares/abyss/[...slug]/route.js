// ARES abyss catch-all — LIVE (Merlin opt-in, Nov 27, 2026: "Green
// light means yes. And turn it on."). Same maze as the abyss index
// route, one page per subpath; doll-N slugs serve the Russian-doll
// prisoner sandboxes (lib/ares/dolls.js, layers 1–6) with the same
// slow drip. Every exit stays inside the maze.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { abyssResponse, bumpTrapHit } from '@/lib/ares/tarpit';
import { dollResponse } from '@/lib/ares/dolls';
import { visitorIp } from '@/lib/ares/honeypot';

function mazePath(params) {
  const slug = params?.slug || [];
  return Array.isArray(slug) ? slug.join('/') : String(slug);
}

export async function GET(request, { params }) {
  const path = mazePath(params);
  await bumpTrapHit(visitorIp(request));
  const doll = /^doll-(\d+)$/.exec(path);
  if (doll) return dollResponse(Number(doll[1]), {});
  return abyssResponse(path);
}

export async function POST(request, { params }) {
  const path = mazePath(params);
  await bumpTrapHit(visitorIp(request));
  const doll = /^doll-(\d+)$/.exec(path);
  if (doll) return dollResponse(Number(doll[1]), {});
  return abyssResponse(path);
}
