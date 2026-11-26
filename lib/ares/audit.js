// ARES Phase 1 — audit log writer (Node runtime only).
//
// Every consequential console action writes an immutable record to
// ares_audit_log: kill-switch activations, policy/settings changes, and
// gold-label review decisions (ARCHITECTURE.md §4). The dashboard reads
// the history back; if the swarm ever acts in a way Merlin didn't
// expect, the log says exactly why.
//
// Fail-open by design: the table ships as a schema addition Merlin runs
// later (supabase-additions.sql, unexecuted), so until it exists every
// write degrades to a server-side console warning and a
// { written: false } result. writeAudit NEVER throws and NEVER fails
// the caller's request — an audit miss must not break a settings save
// or a label decision.
//
// Actor is the literal 'owner': the console is owner-locked, and no
// personal identifier needs to live in the audit trail.

import { serviceClient } from './server.js';

export const AUDIT_ACTIONS = Object.freeze([
  'kill_switch_on',
  'kill_switch_off',
  'settings_change',
  'label_confirm',
  'label_reject',
]);

export async function writeAudit({ action, actor = 'owner', details = {} } = {}) {
  try {
    const db = serviceClient();
    const { error } = await db.from('ares_audit_log').insert([{
      action: String(action || 'unknown'),
      actor: String(actor || 'owner'),
      details: details && typeof details === 'object' ? details : {},
    }]);
    if (error) {
      console.warn('ARES audit log unavailable:', error.message || error);
      return { written: false, reason: 'db-error' };
    }
    return { written: true };
  } catch (err) {
    console.warn('ARES audit log unavailable:', err && err.message ? err.message : err);
    return { written: false, reason: 'unavailable' };
  }
}
