// app/api/payouts/recipients/route.js
// The user's Interac payout destination (their KYC record).
//   GET  /api/payouts/recipients          -> the caller's recipient (if any)
//   POST /api/payouts/recipients { interac_email, legal_name }
//        -> creates/updates the caller's Interac recipient. No money moves.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';
import { auditPayout } from '@/lib/payouts/settings';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const user = await requireUser(req, admin);
  const { data } = await admin
    .from('payout_recipients')
    .select('id, method, interac_email, legal_name, verified_at, created_at')
    .eq('user_id', user.id)
    .eq('method', 'interac')
    .maybeSingle();
  return Response.json({ ok: true, recipient: data || null });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const user = await requireUser(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* validation below */ }
  const email = String(body.interac_email || '').trim().toLowerCase();
  const legalName = String(body.legal_name || '').trim();
  if (!EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: 'Enter the email address registered for Interac e-Transfer.' }, { status: 400 });
  }
  if (legalName.length < 2 || legalName.length > 120) {
    return Response.json({ ok: false, error: 'Enter your full legal name as it appears to your bank.' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('payout_recipients')
    .upsert(
      {
        user_id: user.id,
        method: 'interac',
        interac_email: email,
        legal_name: legalName,
        wise_recipient_id: null, // reset: a changed email needs a fresh Wise recipient
        verified_at: null,
      },
      { onConflict: 'user_id,method' }
    )
    .select('id, method, interac_email, legal_name, created_at')
    .single();
  if (error) throw new Error(`Could not save the payout destination: ${error.message}`);

  await auditPayout(admin, {
    userId: user.id,
    action: 'recipient_saved',
    detail: { method: 'interac', email_domain: email.split('@')[1] || '' },
  });
  return Response.json({
    ok: true,
    recipient: data,
    note: 'Saved. This is where your Interac e-Transfers will be sent once payouts are released.',
  });
});
