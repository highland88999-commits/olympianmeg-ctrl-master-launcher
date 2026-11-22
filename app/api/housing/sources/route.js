// app/api/housing/sources/route.js
// GET /api/housing/sources — returns the source registry: every housing
// source the board knows about, live or staged, with each staged source's
// exact gap.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSourceRegistry } from '@/lib/housing/sources.js';

export async function GET() {
  // Effective status, not the static list: Redfin reads live only when its
  // server key is set, staged with the keys gap otherwise.
  return Response.json(getSourceRegistry());
}
