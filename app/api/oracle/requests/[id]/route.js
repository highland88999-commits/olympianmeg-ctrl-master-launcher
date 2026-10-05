// app/api/oracle/requests/[id]/route.js
// PATCH /api/oracle/requests/:id
//   Merlin-only review actions (server-enforced account check):
//   { action: 'approve', note? }  -> pending -> approved
//   { action: 'decline', note? }  -> pending -> declined
//   { action: 'build', program_slug, note? } -> approved -> built
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireReviewer } from '@/lib/oracle/server';

const TRANSITIONS = {
  approve: { from: ['pending'], to: 'approved' },
  decline: { from: ['pending'], to: 'declined' },
  build: { from: ['approved'], to: 'built' },
};

export const PATCH = apiGuard(async function PATCH(req, ctx) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The request service is not connected yet.');
  try {
    await requireReviewer(req, admin);
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || 'Not allowed.' },
      { status: err?.status === 401 ? 401 : 403 }
    );
  }

  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) return Response.json({ ok: false, error: 'Missing request id.' }, { status: 400 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Send an action.' }, { status: 400 });
  }
  const action = String(body.action || '').trim();
  const t = TRANSITIONS[action];
  if (!t) {
    return Response.json({ ok: false, error: 'Unknown action. Use approve, decline, or build.' }, { status: 400 });
  }
  const note = String(body.note || '').slice(0, 2000);
  const programSlug = String(body.program_slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80);
  if (action === 'build' && !programSlug) {
    return Response.json({ ok: false, error: 'Link the live program: send its program_slug.' }, { status: 400 });
  }

  const { data: current, error: loadErr } = await admin
    .from('oracle_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !current) {
    return Response.json({ ok: false, error: 'Request not found.' }, { status: 404 });
  }
  if (!t.from.includes(current.status)) {
    return Response.json(
      { ok: false, error: `Can't ${action} a request that is ${current.status}.` },
      { status: 409 }
    );
  }

  const patch = {
    status: t.to,
    reviewer_note: note,
    reviewed_at: new Date().toISOString(),
  };
  if (action === 'build') patch.program_slug = programSlug;

  const { data, error } = await admin
    .from('oracle_requests')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error('Could not update the request.');
  return Response.json({ ok: true, request: data });
});
