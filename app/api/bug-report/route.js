// app/api/bug-report/route.js
// User-submitted bug reports — these go straight to the database so Muse
// can see and act on them. Companion to the automatic client_errors logger:
// bug_reports are for "something's wrong" that the auto-logger didn't catch.
//
//   POST { description, steps?, page_url?, user_agent?, viewport? }
//        -> files a report. Open to everyone (signed in or not); the report
//           carries the caller's user_id when a session token is supplied.
//   GET  -> Merlin-only: lists reports, newest first.
//   PATCH { id, status } -> Merlin-only: open | in-progress | fixed | wont-fix.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser, requireOwner } from '@/lib/wallet/server';

const STATUSES = new Set(['open', 'in-progress', 'fixed', 'wont-fix']);

function clean(v, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The bug report service is not connected yet.');

  let body = {};
  try { body = await req.json(); } catch { /* validated below */ }

  const description = clean(body.description, 4000);
  if (!description) {
    const e = new Error('Please describe what went wrong.');
    e.status = 400;
    throw e;
  }

  // Best effort: attach the reporter's account when they're signed in.
  let userId = null;
  try {
    const user = await requireUser(req, admin);
    userId = user.id || null;
  } catch {
    // Anonymous reports are fine — the bug still counts.
  }

  const { data, error } = await admin.from('bug_reports').insert({
    user_id: userId,
    page_url: clean(body.page_url, 2000),
    description,
    steps: clean(body.steps, 4000),
    user_agent: clean(body.user_agent, 1000),
    viewport: clean(body.viewport, 50),
    status: 'open',
  }).select('id, created_at').single();

  if (error) throw new Error('Could not save the bug report.');

  return Response.json({ ok: true, id: data.id, created_at: data.created_at });
});

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The bug report service is not connected yet.');
  await requireOwner(req, admin);

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));

  let q = admin
    .from('bug_reports')
    .select('id, user_id, page_url, description, steps, user_agent, viewport, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status && STATUSES.has(status)) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw new Error('Could not load bug reports.');

  // Attach reporter emails for Merlin's review (best effort).
  const rows = [];
  for (const r of data || []) {
    let email = '';
    if (r.user_id) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(r.user_id);
        email = u?.user?.email || '';
      } catch { /* leave blank */ }
    }
    rows.push({ ...r, reporter_email: email });
  }

  const { count: openCount } = await admin
    .from('bug_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  return Response.json({ ok: true, reports: rows, open_count: openCount || 0 });
});

export const PATCH = apiGuard(async function PATCH(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The bug report service is not connected yet.');
  await requireOwner(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* validated below */ }

  const id = clean(body.id, 100);
  const status = clean(body.status, 20);
  if (!id || !STATUSES.has(status)) {
    const e = new Error('A valid report id and status are required.');
    e.status = 400;
    throw e;
  }

  const { error } = await admin
    .from('bug_reports')
    .update({ status })
    .eq('id', id);
  if (error) throw new Error('Could not update the bug report.');

  return Response.json({ ok: true, id, status });
});
