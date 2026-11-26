// ARES Phase 1 — gold-label review queue API (owner-locked: Merlin only).
//
// Node-importable for plain `node` tests (relative imports, global
// Response instead of a top-level next/server import — next/server does
// not resolve under plain Node; same pattern as the agents route). In
// the Next runtime a returned Response is served as-is.
//
// GET  -> { labels, provisioned }: every human label recorded so far.
// POST -> { ok, provisioned } with { eventId, decision, threatClass }:
//   decision 'confirm' keeps the heuristic threat class (the event was
//   a real threat); 'reject' relabels it 'benign'. Labels are the tier-2/3
//   gold set the future model trains on — heuristic-only labels never
//   enter production training data, so a human decision here is what
//   makes an event trustworthy.
//
// GRACEFUL DEGRADATION (the table ships later): ares_event_labels is a
// schema addition Merlin runs in the SQL editor (supabase-additions.sql,
// unexecuted). Until it exists, GET answers { labels: [], provisioned:
// false } so the dashboard still shows review candidates from the
// evidence log, and POST answers 503 { provisioned: false } instead of
// crashing — the queue shows an honest "labels table not yet
// provisioned" state. Nothing here ever throws: apiGuard + local
// try/catch keep every failure a plain JSON answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireUser, isOwnerEmail, serviceClient } from '../../../../lib/ares/server.js';
import { isThreatClass } from '../../../../lib/ares/labels.js';
import { writeAudit } from '../../../../lib/ares/audit.js';
import { apiGuard } from '../../../../lib/api-guard.js';

const LABELS_TABLE = 'ares_event_labels';

function tableMissing(error) {
  const msg = String((error && error.message) || error || '');
  const code = String((error && error.code) || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(msg);
}

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return Response.json({ error: 'restricted to the throne' }, { status: 403 });
  let db;
  try {
    db = serviceClient();
  } catch {
    return Response.json({ error: 'ARES is not connected' }, { status: 503 });
  }
  const { data, error } = await db
    .from(LABELS_TABLE)
    .select('event_id, decision, threat_class, reviewer, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    if (tableMissing(error)) return Response.json({ labels: [], provisioned: false });
    return Response.json({ error: 'could not load labels' }, { status: 500 });
  }
  return Response.json({ labels: data || [], provisioned: true });
});

export const POST = apiGuard(async function POST(request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return Response.json({ error: 'restricted to the throne' }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const eventId = Number(body?.eventId);
  const decision = body?.decision;
  if (!Number.isInteger(eventId) || eventId <= 0 || (decision !== 'confirm' && decision !== 'reject')) {
    return Response.json({ error: 'a valid eventId and decision (confirm/reject) are required' }, { status: 400 });
  }
  const threatClass = decision === 'reject'
    ? 'benign'
    : (isThreatClass(body?.threatClass) ? body.threatClass : 'bot');
  let db;
  try {
    db = serviceClient();
  } catch {
    return Response.json({ error: 'ARES is not connected' }, { status: 503 });
  }
  const { error } = await db.from(LABELS_TABLE).upsert([{
    event_id: eventId,
    decision,
    threat_class: threatClass,
    reviewer: 'owner',
  }], { onConflict: 'event_id' });
  if (error) {
    if (tableMissing(error)) {
      return Response.json({ error: 'labels table not yet provisioned', provisioned: false }, { status: 503 });
    }
    return Response.json({ error: 'could not save label' }, { status: 500 });
  }
  // Audit trail for the decision (fail-open: a missing audit table
  // never fails the label itself — writeAudit degrades to a warning).
  await writeAudit({
    action: decision === 'confirm' ? 'label_confirm' : 'label_reject',
    details: { event_id: eventId, threat_class: threatClass },
  });
  return Response.json({ ok: true, provisioned: true });
});
