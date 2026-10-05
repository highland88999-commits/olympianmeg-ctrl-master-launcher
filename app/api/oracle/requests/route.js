// app/api/oracle/requests/route.js
// GET  /api/oracle/requests
//        -> public catalog: approved + built requests (no login wall to browse),
//           plus the caller's own requests at any status when signed in.
// GET  /api/oracle/requests?scope=review[&status=]
//        -> Merlin's review queue (Merlin-login-gated, server-enforced).
// POST /api/oracle/requests  { title, description, god_category, bounty_cents }
//        -> submit a request (signed-in users only).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import {
  getServiceClient,
  requireUser,
  requireReviewer,
} from '@/lib/oracle/server';
import { validateOracleRequest, ORACLE_STATUSES } from '@/lib/oracle/constants';

function authFail(err) {
  return Response.json(
    { ok: false, error: err?.message || 'Sign in to continue.' },
    { status: err?.status === 403 ? 403 : 401 }
  );
}

const PUBLIC_FIELDS =
  'id, title, description, god_category, bounty_cents, status, program_slug, origin, created_at, reviewed_at';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The request service is not connected yet.');
  const url = new URL(req.url);

  // ---- Merlin's review queue ----
  if (url.searchParams.get('scope') === 'review') {
    try {
      await requireReviewer(req, admin);
    } catch (err) {
      return authFail(err);
    }
    const statusFilter = String(url.searchParams.get('status') || '').trim();
    let query = admin
      .from('oracle_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (ORACLE_STATUSES.includes(statusFilter)) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) throw new Error('Could not load the review queue.');

    const rows = data || [];
    const totals = {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      declined: rows.filter((r) => r.status === 'declined').length,
      built: rows.filter((r) => r.status === 'built').length,
      bounty_cents: rows
        .filter((r) => r.status === 'pending' || r.status === 'approved')
        .reduce((s, r) => s + (Number(r.bounty_cents) || 0), 0),
    };
    return Response.json({ ok: true, requests: rows, totals });
  }

  // ---- Public catalog (+ own requests when signed in) ----
  let ownUserId = null;
  try {
    const me = await requireUser(req, admin);
    ownUserId = me.id;
  } catch {
    /* browsing stays public */
  }

  let query = admin
    .from('oracle_requests')
    .select(PUBLIC_FIELDS)
    .in('status', ['approved', 'built'])
    .order('created_at', { ascending: false });
  const { data: catalog, error: catErr } = await query;
  if (catErr) throw new Error('Could not load requests.');

  let mine = [];
  if (ownUserId) {
    const { data, error } = await admin
      .from('oracle_requests')
      .select(PUBLIC_FIELDS + ', reviewer_note, updated_at')
      .eq('user_id', ownUserId)
      .order('created_at', { ascending: false });
    if (!error) mine = data || [];
  }
  return Response.json({ ok: true, catalog: catalog || [], mine, signedIn: !!ownUserId });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The request service is not connected yet.');
  let user;
  try {
    user = await requireUser(req, admin);
  } catch (err) {
    return authFail(err);
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Send a title, description, category, and bounty.' }, { status: 400 });
  }
  const v = validateOracleRequest(body);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });

  const { data, error } = await admin
    .from('oracle_requests')
    .insert({
      user_id: user.id,
      ...v.value,
      status: 'pending',
      origin: 'web', // server-set: chat-filed requests come via the review artifact
    })
    .select('id, title, status, created_at')
    .single();
  if (error) throw new Error('Could not save your request.');
  return Response.json({ ok: true, request: data });
});
