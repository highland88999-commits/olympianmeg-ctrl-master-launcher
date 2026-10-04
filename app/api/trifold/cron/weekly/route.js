// app/api/trifold/cron/weekly/route.js
// GET /api/trifold/cron/weekly  (CRON_SECRET bearer required; also wired in vercel.json)
//
// The weekly pipeline, step 1 — DRAFT ONLY, never publishes:
//   1. Pick the next newspaper in the rotation (no repeats until full cycle).
//   2. Fetch its top stories via RSS (graceful fallback to empty).
//   3. Create a draft edition with the OG stories.
// The buddy reviews in the studio, optionally generates the fiction takes
// with HIS OWN AI key, edits, and publishes. Human approves — always.
// (The draft factory lives in lib/trifold/pipeline.js so the fallback
// pipeline cron can guarantee a week is NEVER empty with identical logic.)
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/trifold/server';
import { createDraftEdition } from '@/lib/trifold/pipeline';

function checkCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Weekly edition cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    const e = new Error('Not authorized.');
    e.status = 401;
    throw e;
  }
}

export const GET = apiGuard(async function GET(req) {
  checkCron(req);
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');

  const { edition, paper, stories } = await createDraftEdition(admin);

  return Response.json({
    ok: true,
    edition_id: edition.id,
    newspaper: paper.name,
    region: paper.region,
    stories: stories.length,
    note: stories.length === 0
      ? 'RSS came back empty — the buddy can paste stories manually in the studio.'
      : 'Draft ready for buddy review in the studio.',
  });
});
