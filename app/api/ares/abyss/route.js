// ARES abyss — LIVE (Merlin opt-in, Nov 27, 2026: "Green light means
// yes. And turn it on."). Serves the sandbox maze (lib/ares/tarpit.js:
// fake pages + a slow drip) to trapped sources: every link and form
// inside points back into the maze, so a bot can crawl forever without
// reaching a real page, real data, or a real session. The trapped flag
// persists per source until the keeper releases it from the console
// (DELETE /api/ares/trapped); each visit here bumps the hit count.
// DEFENSIVE ONLY: fake rows, slowly, on our server — never a payload,
// never retaliation, never a real system.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { abyssResponse, bumpTrapHit } from '@/lib/ares/tarpit';
import { visitorIp } from '@/lib/ares/honeypot';

export async function GET(request) {
  await bumpTrapHit(visitorIp(request));
  return abyssResponse('');
}

export async function POST(request) {
  await bumpTrapHit(visitorIp(request));
  return abyssResponse('');
}
