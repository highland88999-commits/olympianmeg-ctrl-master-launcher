// app/api/trifold/generate/route.js
// POST /api/trifold/generate { edition_id, tone? }
//   -> { ok, tone, chars }  (buddy only)
//
// Drafts the fictional takes with the BUDDY'S OWN AI key (never Merlin's).
// tone: 'negative' | 'positive' | 'both' (default). Saves to the draft;
// the buddy reviews and publishes — never auto-publishes.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy, getBuddyAiCredentials } from '@/lib/trifold/server';
import { generateFiction } from '@/lib/trifold/ai';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);

  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const editionId = String(body.edition_id || '');
  const tone = String(body.tone || 'both');
  if (!editionId) return Response.json({ ok: false, error: 'Pick an issue first.' }, { status: 400 });
  if (!['negative', 'positive', 'both'].includes(tone)) {
    return Response.json({ ok: false, error: 'Bad tone.' }, { status: 400 });
  }

  const { data: edition, error } = await admin
    .from('trifold_editions')
    .select('*')
    .eq('id', editionId)
    .single();
  if (error || !edition) return Response.json({ ok: false, error: 'Issue not found.' }, { status: 404 });
  if (edition.status === 'published') {
    return Response.json({ ok: false, error: 'That issue is already published.' }, { status: 400 });
  }
  const stories = Array.isArray(edition.og_stories) ? edition.og_stories : [];
  if (stories.length === 0) {
    return Response.json({ ok: false, error: 'Add the real stories first — fiction needs something to riff on.' }, { status: 400 });
  }

  let creds;
  try {
    creds = await getBuddyAiCredentials(admin);
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }

  const patch = {};
  const tones = tone === 'both' ? ['negative', 'positive'] : [tone];
  for (const t of tones) {
    const text = await generateFiction({
      provider: creds.provider,
      apiKey: creds.apiKey, // in-memory only; never logged, never stored
      stories,
      newspaperName: edition.newspaper_name,
      tone: t,
    });
    patch[t === 'negative' ? 'negative_fiction' : 'positive_fiction'] = text;
  }
  patch.status = 'review';
  const { error: uErr } = await admin.from('trifold_editions').update(patch).eq('id', editionId);
  if (uErr) throw new Error('Generated, but could not save the draft.');
  return Response.json({ ok: true, tones, chars: tones.map((t) => (patch[t === 'negative' ? 'negative_fiction' : 'positive_fiction'] || '').length) });
});
