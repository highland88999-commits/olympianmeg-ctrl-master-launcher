// lib/payouts/settings.js
// Payout system settings + audit trail. Server-only.
//
// The master kill-switch: etransfer_enabled AND etransfer_approved must BOTH
// be true before a single cent moves via Wise. Both default to false.
// Merlin flips them only after his explicit approval.

export async function getPayoutSettings(admin) {
  const { data, error } = await admin
    .from('payout_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`Could not load payout settings: ${error.message}`);
  return data || {
    etransfer_enabled: false,
    etransfer_approved: false,
    wise_env: 'sandbox',
    wise_profile_id: null,
    compliance_wise_kyb_complete: false,
    compliance_fintrac_reviewed: false,
    compliance_rpaa_registered: false,
    compliance_counsel_reviewed: false,
    compliance_terms_updated: false,
  };
}

/** True only when Merlin has both enabled AND approved e-transfer payouts. */
export function etransferCanRun(settings) {
  return settings?.etransfer_enabled === true && settings?.etransfer_approved === true;
}

export function complianceChecklist(settings) {
  const s = settings || {};
  return [
    { key: 'compliance_wise_kyb_complete', label: 'Wise Business KYB complete', done: !!s.compliance_wise_kyb_complete, owner: 'Merlin' },
    { key: 'compliance_fintrac_reviewed', label: 'FINTRAC MSB analysis reviewed', done: !!s.compliance_fintrac_reviewed, owner: 'counsel', needsCounsel: true },
    { key: 'compliance_rpaa_registered', label: 'Bank of Canada RPAA registration', done: !!s.compliance_rpaa_registered, owner: 'counsel', needsCounsel: true },
    { key: 'compliance_counsel_reviewed', label: 'Payments counsel reviewed the payout flow', done: !!s.compliance_counsel_reviewed, owner: 'counsel', needsCounsel: true },
    { key: 'compliance_terms_updated', label: 'Payout terms published in Terms of Service', done: !!s.compliance_terms_updated, owner: 'Merlin' },
  ];
}

export async function auditPayout(admin, { withdrawalId, userId, action, detail }) {
  try {
    await admin.from('payout_audit_log').insert({
      withdrawal_id: withdrawalId || null,
      user_id: userId || null,
      action: String(action || 'event').slice(0, 80),
      detail: detail && typeof detail === 'object' ? detail : { info: String(detail || '') },
    });
  } catch {
    /* audit is best-effort — never break the payout flow on a log failure */
  }
}
