// app/api/trifold/cron/weekly/route.js
// GET /api/trifold/cron/weekly  (CRON_SECRET bearer required; also wired in vercel.json)
//
// The weekly pipeline, step 1 — DRAFT ONLY, never publishes:
//   1. Pick the next newspaper in the rotation (no repeats until full cycle).
//   2. Fetch its top stories via RSS (graceful fallback to empty).
//   3. Create a draft edition with the OG stories.
// The buddy reviews in the studio, optionally generates the fiction takes
// with HIS OWN AI key, edits, and publishes. Human approves — always.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/trifold/server';
import { TRIFOLD_NEWSPAPERS, nextNewspaper } from '@/lib/trifold/constants';
import { fetchTopStories } from '@/lib/trifold/fetch-news';

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

function weekNumber(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7);
}

export const GET = apiGuard(async function GET(req) {
  checkCron(req);
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');

  const { data: settings } = await admin.from('trifold_settings').select('*').eq('id', 1).maybeSingle();
  const rotationIndex = settings?.rotation_index || 0;
  const { paper, nextIndex } = nextNewspaper(rotationIndex);

  const stories = await fetchTopStories(paper.rss, 8);

  const { data: edition, error } = await admin
    .from('trifold_editions')
    .insert({
      week_number: weekNumber(),
      newspaper_name: paper.name,
      newspaper_region: paper.region,
      newspaper_url: paper.url,
      og_stories: stories,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw new Error('Could not draft this week\u2019s issue.');

  const log = Array.isArray(settings?.rotation_log) ? settings.rotation_log : [];
  log.push({ at: new Date().toISOString(), newspaper: paper.name, region: paper.region, stories: stories.length });
  await admin.from('trifold_settings').update({
    rotation_index: nextIndex % TRIFOLD_NEWSPAPERS.length,
    rotation_log: log.slice(-52),
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

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
