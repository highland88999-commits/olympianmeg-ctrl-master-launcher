// app/api/payouts/admin/settings/route.js
// Merlin-only: the e-transfer master kill-switch + compliance checklist.
//   GET  -> current settings, kill-switch state, checklist, queue stats
//   POST { etransfer_enabled?, etransfer_approved?, compliance_*?, wise_env? }
//        -> updates settings. Enabling/approving is Merlin's explicit call.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireOwner } from '@/lib/wallet/server';
import { getPayoutSettings, complianceChecklist, auditPayout } from '@/lib/payouts/settings';

const CHECK_KEYS = [
  'compliance_wise_kyb_complete',
  'compliance_fintrac_reviewed',
  'compliance_rpaa_registered',
  'compliance_counsel_reviewed',
  'compliance_terms_updated',
];

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  await requireOwner(req, admin);

  const settings = await getPayoutSettings(admin);
  const { count: queuedCount } = await admin
    .from('wallet_withdrawals')
    .select('id', { count: 'exact', head: true })
    .eq('payout_method', 'interac')
    .eq('status', 'requested');
  const { data: recent } = await admin
    .from('payout_audit_log')
    .select('action, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return Response.json({
    ok: true,
    kill_switch: {
      etransfer_enabled: !!settings.etransfer_enabled,
      etransfer_approved: !!settings.etransfer_approved,
      etransfer_approved_at: settings.etransfer_approved_at || null,
      wise_env: settings.wise_env || 'sandbox',
      live: !!settings.etransfer_enabled && !!settings.etransfer_approved,
    },
    compliance: complianceChecklist(settings),
    queue: { requested_interac_withdrawals: queuedCount || 0 },
    recent_audit: recent || [],
  });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const owner = await requireOwner(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* validation below */ }
  const patch = {};
  if (typeof body.etransfer_enabled === 'boolean') patch.etransfer_enabled = body.etransfer_enabled;
  if (typeof body.etransfer_approved === 'boolean') {
    patch.etransfer_approved = body.etransfer_approved;
    patch.etransfer_approved_at = body.etransfer_approved ? new Date().toISOString() : null;
    patch.etransfer_approved_by = body.etransfer_approved ? String(owner.email || 'owner') : null;
  }
  if (typeof body.wise_env === 'string' && ['sandbox', 'live'].includes(body.wise_env)) {
    patch.wise_env = body.wise_env;
  }
  for (const k of CHECK_KEYS) {
    if (typeof body[k] === 'boolean') patch[k] = body[k];
  }
  if (!Object.keys(patch).length) {
    return Response.json({ ok: false, error: 'Nothing to update.' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('payout_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Could not save payout settings: ${error.message}`);

  await auditPayout(admin, {
    userId: owner.id,
    action: 'settings_changed',
    detail: { patch: Object.keys(patch) },
  });

  return Response.json({
    ok: true,
    kill_switch: {
      etransfer_enabled: !!data.etransfer_enabled,
      etransfer_approved: !!data.etransfer_approved,
      live: !!data.etransfer_enabled && !!data.etransfer_approved,
    },
    compliance: complianceChecklist(data),
    note: data.etransfer_enabled && data.etransfer_approved
      ? 'E-transfer payouts are LIVE. The queue will process on its next run.'
      : 'E-transfer payouts are OFF. Nothing moves until both switches are on.',
  });
});
