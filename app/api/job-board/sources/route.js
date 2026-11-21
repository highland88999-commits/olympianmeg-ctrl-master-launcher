// app/api/job-board/sources/route.js
// GET /api/job-board/sources — returns the source registry: every board the
// Job Board knows about, live or staged, with each staged source's exact gap.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { SOURCE_REGISTRY } from '@/lib/job-board/sources.js';

export async function GET() {
  return Response.json(SOURCE_REGISTRY);
}
