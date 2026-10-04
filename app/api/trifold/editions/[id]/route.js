// app/api/trifold/editions/[id]/route.js
// GET   /api/trifold/editions/:id  -> one issue (published: public; draft: buddy only)
// PATCH /api/trifold/editions/:id  -> edit / approve / publish (buddy only).
//   Publishing assigns the next issue number and stamps published_at.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy, nextIssueNumber } from '@/lib/trifold/server';

async function loadForViewer(req, admin, id) {
  const { data, error } = await admin
    .from('trifold_editions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return { error: 'Issue not found.', status: 404 };
  if (data.status === 'published') return { edition: data };
  // Draft/review: buddy only — no draft traces for the public.
  try {
    await requireBuddy(req, admin);
    return { edition: data };
  } catch (e) {
    return { error: 'Issue not found.', status: 404 };
  }
}

export const GET = apiGuard(async function GET(req, ctx) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  const id = ctx?.params?.id;
  const { edition, error, status } = await loadForViewer(req, admin, id);
  if (error) return Response.json({ ok: false, error }, { status: status || 404 });
  return Response.json({ ok: true, edition });
});

const EDITABLE = ['newspaper_name', 'newspaper_region', 'newspaper_url', 'og_stories', 'negative_fiction', 'positive_fiction', 'status', 'week_number', 'page_count', 'pages', 'og_file_url', 'og_file_type'];

// Full pipeline lifecycle. The buddy may submit his own version
// ('devan_submitted'); the pipeline cron moves it through the rest
// server-side via the service client — the route must not reject those.
const ALLOWED_STATUSES = ['draft', 'review', 'devan_submitted', 'ai_generated', 'ready', 'published'];

export const PATCH = apiGuard(async function PATCH(req, ctx) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);
  const id = ctx?.params?.id;
  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const patch = {};
  for (const k of EDITABLE) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (typeof patch.newspaper_name === 'string') patch.newspaper_name = patch.newspaper_name.slice(0, 200);
  if (typeof patch.newspaper_region === 'string') patch.newspaper_region = patch.newspaper_region.slice(0, 120);
  if (typeof patch.newspaper_url === 'string') patch.newspaper_url = patch.newspaper_url.slice(0, 500);
  if (Array.isArray(patch.og_stories)) patch.og_stories = patch.og_stories.slice(0, 20);
  if (typeof patch.negative_fiction === 'string') patch.negative_fiction = patch.negative_fiction.slice(0, 20000);
  if (typeof patch.positive_fiction === 'string') patch.positive_fiction = patch.positive_fiction.slice(0, 20000);
  if (patch.page_count !== undefined) {
    const n = parseInt(patch.page_count, 10);
    patch.page_count = Number.isNaN(n) ? 3 : Math.min(40, Math.max(1, n));
  }
  if (patch.pages !== undefined && (typeof patch.pages !== 'object' || patch.pages === null)) delete patch.pages;
  if (typeof patch.og_file_url === 'string') patch.og_file_url = patch.og_file_url.slice(0, 500);
  if (typeof patch.og_file_type === 'string') patch.og_file_type = patch.og_file_type.slice(0, 60);
  if (patch.status && !ALLOWED_STATUSES.includes(patch.status)) {
    return Response.json({ ok: false, error: 'Bad status.' }, { status: 400 });
  }
  if (patch.status === 'published') {
    patch.issue_number = await nextIssueNumber(admin);
    patch.published_at = new Date().toISOString();
  }
  const { data, error } = await admin
    .from('trifold_editions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error('Could not save the issue.');
  return Response.json({ ok: true, edition: data });
});
