// app/api/wallet/admin/payout-release/route.js
// POST /api/wallet/admin/payout-release { note? }
// Merlin-only. THE one explicit confirmation behind the autonomous
// Christmas payout queue: "release the Christmas queue". After this row
// exists, the cron processor runs itself — no per-payout approvals.
// Idempotent: a second release just reports already:true.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireOwner } from '@/lib/wallet/server';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const owner = await requireOwner(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* optional note */ }
  const note = String(body.note || '').slice(0, 280);

  const { data: existing } = await admin
    .from('payout_releases')
    .select('id, released_at')
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return Response.json({ ok: true, already: true, released_at: existing.released_at });
  }

  const { data, error } = await admin
    .from('payout_releases')
    .insert({ released_by_email: String(owner.email || ''), note })
    .select('id, released_at')
    .single();
  if (error) throw new Error(`Could not record the release: ${error.message}`);

  return Response.json({
    ok: true,
    already: false,
    released_at: data.released_at,
    note: 'The Christmas payout queue is released. It now processes itself — oldest earnings first, pausing honestly if platform funds run short.',
  });
});
