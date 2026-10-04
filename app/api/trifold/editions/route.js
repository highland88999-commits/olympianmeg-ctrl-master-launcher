// app/api/trifold/editions/route.js
// GET  /api/trifold/editions         -> published issues, newest first (PUBLIC, no login)
// GET  /api/trifold/editions?all=1   -> includes drafts (buddy only)
// POST /api/trifold/editions         -> create a draft issue (buddy only)
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy } from '@/lib/trifold/server';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  const url = new URL(req.url);
  let query = admin
    .from('trifold_editions')
    .select('id, issue_number, week_number, newspaper_name, newspaper_region, newspaper_url, og_stories, published_at')
    .order('issue_number', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false });

  if (url.searchParams.get('all') === '1') {
    await requireBuddy(req, admin); // server-side account-ID check
    query = admin
      .from('trifold_editions')
      .select('*')
      .order('created_at', { ascending: false });
  } else {
    query = query.eq('status', 'published');
  }
  const { data, error } = await query;
  if (error) throw new Error('Could not load issues.');
  return Response.json({ ok: true, editions: data || [] });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);
  let body = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const { data, error } = await admin
    .from('trifold_editions')
    .insert({
      week_number: Number(body.week_number) || 1,
      newspaper_name: String(body.newspaper_name || 'Untitled paper').slice(0, 200),
      newspaper_region: String(body.newspaper_region || '').slice(0, 120),
      newspaper_url: String(body.newspaper_url || '').slice(0, 500),
      og_stories: Array.isArray(body.og_stories) ? body.og_stories.slice(0, 20) : [],
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw new Error('Could not create the draft issue.');
  return Response.json({ ok: true, edition: data });
});
