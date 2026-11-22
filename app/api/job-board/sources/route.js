// app/api/job-board/sources/route.js
// GET /api/job-board/sources — returns the LIVE sources only: every board
// the Job Board actually searches, each returning real openings.
//
// The full registry in lib/job-board/sources.js stays the working record —
// dead ends, pending partnerships and unverified feeds are still listed
// there with their exact gaps — but the page lists live data points only,
// so staged sources never appear here.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSourceRegistry } from '@/lib/job-board/sources.js';

export async function GET() {
  // Effective status, not the static list: Adzuna / USAJobs / JSearch read
  // live only when their server keys are set, staged with the keys gap
  // otherwise — and staged entries are never listed on the page.
  return Response.json(getSourceRegistry().filter((s) => s.status === 'live'));
}
