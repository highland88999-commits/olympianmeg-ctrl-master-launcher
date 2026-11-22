// app/api/education/sources/route.js
// GET /api/education/sources -> the source registry (array). The
// registry flips College Scorecard to live when its server key is set;
// until then it is staged with the exact gap. Node runtime only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSourceRegistry } from '@/lib/education/sources.js';

export async function GET() {
  return Response.json(getSourceRegistry());
}
