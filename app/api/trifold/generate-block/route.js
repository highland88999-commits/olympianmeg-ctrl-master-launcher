// app/api/trifold/generate-block/route.js
// POST /api/trifold/generate-block { edition_id, lens, hint? } -> { ok, text }
//
// Per-block AI generation with the BUDDY'S OWN AI key (never Merlin's):
// one text block at a time, for use inside the page layout editor.
//   lens: 'negative' | 'positive'  -> one fictional block (generateFiction + hint)
//   lens: 'og'                     -> one factual summary block (generateOgSummary)
//
// Does NOT save to the draft — the studio inserts the returned text as a
// block, and the buddy saves. AI is an option here, never a requirement.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy, getBuddyAiCredentials } from '@/lib/trifold/server';
import { generateFiction, generateOgSummary } from '@/lib/trifold/ai';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);

  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const editionId = String(body.edition_id || '');
  const lens = String(body.lens || '');
  const hint = String(body.hint || '').slice(0, 300);
  if (!editionId) return Response.json({ ok: false, error: 'Pick an issue first.' }, { status: 400 });
  if (!['negative', 'positive', 'og'].includes(lens)) {
    return Response.json({ ok: false, error: 'Bad lens.' }, { status: 400 });
  }

  const { data: edition, error } = await admin
    .from('trifold_editions')
    .select('id, newspaper_name, og_stories, status')
    .eq('id', editionId)
    .single();
  if (error || !edition) return Response.json({ ok: false, error: 'Issue not found.' }, { status: 404 });
  if (edition.status === 'published') {
    return Response.json({ ok: false, error: 'That issue is already published.' }, { status: 400 });
  }
  const stories = Array.isArray(edition.og_stories) ? edition.og_stories : [];
  if (stories.length === 0) {
    return Response.json({ ok: false, error: 'Add the real stories first — the AI needs something to work from.' }, { status: 400 });
  }

  let creds;
  try {
    creds = await getBuddyAiCredentials(admin);
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }

  const args = {
    provider: creds.provider,
    apiKey: creds.apiKey, // in-memory only; never logged, never stored
    stories,
    newspaperName: edition.newspaper_name,
    hint,
  };
  const text = lens === 'og'
    ? await generateOgSummary(args)
    : await generateFiction({ ...args, tone: lens });
  if (!text) throw new Error('The AI came back empty-handed.');
  return Response.json({ ok: true, text });
});
