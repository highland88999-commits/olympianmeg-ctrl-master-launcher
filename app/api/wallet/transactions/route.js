// app/api/wallet/transactions/route.js
// GET /api/wallet/transactions — full timestamped history for the user.
// Filters: ?program=trifold&kind=credit&limit=50&before=<iso>
// Every entry carries created_at — no exceptions.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';

const MAX_LIMIT = 200;

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const url = new URL(req.url);
  const program = (url.searchParams.get('program') || '').trim();
  const kind = (url.searchParams.get('kind') || '').trim();
  const before = (url.searchParams.get('before') || '').trim();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  let q = admin
    .from('wallet_transactions')
    .select('id, kind, amount_cents, program, reason, balance_after_cents, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (program) q = q.eq('program', program);
  if (kind === 'credit' || kind === 'debit') q = q.eq('kind', kind);
  if (before) q = q.lt('created_at', before);

  const { data, error } = await q;
  if (error) throw new Error(`Could not load transactions: ${error.message}`);

  // Distinct programs the user has — powers the filter dropdown.
  const { data: programs } = await admin
    .from('wallet_transactions')
    .select('program')
    .eq('user_id', user.id);
  const programList = [...new Set((programs || []).map((r) => r.program).filter(Boolean))].sort();

  return Response.json({ ok: true, transactions: data || [], programs: programList });
});
