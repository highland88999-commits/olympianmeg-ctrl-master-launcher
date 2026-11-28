// ARES dashboard API: trapped sources + attack-source report
// (owner-locked: Merlin only). GET lists both, plus whether the
// release cutoff is latched; DELETE releases one trapped source
// under the prison release policy (Merlin, Nov 27 ~03:39):
//   - The request must name the AGENT'S ID (its ip_hash — the
//     prisoner's identifier), say WHO asked, and carry the PROMISE
//     not to send it back. No ID, no release; no promise, no release.
//   - The request, the ID, and the promise are ALL recorded in the
//     prison record (ares_prison_releases) before the trap is released.
//   - CUTOFF: if a duplicate agent, or an agent carrying other
//     identifiable information related to another agent (or a
//     threat), is contained in the prison, NO further agents are
//     released. The cutoff is the latching ares_settings key
//     'prison_release_cutoff'; once latched, every release is refused,
//     and only the keeper clears it directly in the database.
//   - The release record table is mandatory: if it does not exist
//     (migration not run), the release is refused with 503 rather
//     than released without a record.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient } from '@/lib/ares/server';
import { releaseTrap } from '@/lib/ares/tarpit';
import { writeAudit } from '@/lib/ares/audit';
import {
  RELEASE_CUTOFF_SETTING,
  RELEASE_ERROR_TEXT,
  buildReleaseRecord,
  cutoffLatchRow,
  findLinkedPrisoners,
  releaseCutoffActive,
  validateReleaseRequest,
} from '@/lib/ares/prison-release';
import { mergePrisonerRows } from '@/lib/ares/prison';
import { apiGuard } from '@/lib/api-guard';

async function readCutoff(admin) {
  try {
    const { data } = await admin.from('ares_settings').select('key, value');
    return releaseCutoffActive(data || []);
  } catch {
    return false;
  }
}

async function latchCutoff(admin, reason) {
  try {
    const row = cutoffLatchRow({ reason });
    await admin.from('ares_settings').upsert(
      { key: row.key, value: row.value },
      { onConflict: 'key' }
    );
    await writeAudit({
      action: 'prison_release_cutoff',
      details: { reason: row.details.reason, latched_by: row.details.latched_by },
    });
  } catch {
    // The latch is best-effort in the same way the audit log is: the
    // refusal itself is what protects the prison on this request.
  }
}

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  let admin;
  try {
    admin = serviceClient();
  } catch {
    return NextResponse.json({ error: 'ARES is not connected' }, { status: 503 });
  }
  const [trappedRes, sourcesRes] = await Promise.all([
    admin.from('ares_trapped').select('ip_hash, reason, score, hits, first_seen, last_seen').order('last_seen', { ascending: false }).limit(100),
    admin.from('ares_attack_sources').select('ip_hash, user_agent, last_path, path_count, max_score, reasons, trap_status, first_seen, last_seen').order('last_seen', { ascending: false }).limit(100),
  ]);
  if (trappedRes.error || sourcesRes.error) {
    return NextResponse.json({ error: 'could not load trapped sources (run supabase/ares-allowlist.sql)' }, { status: 500 });
  }
  const cutoff = await readCutoff(admin);
  return NextResponse.json({ trapped: trappedRes.data || [], sources: sourcesRes.data || [], cutoff });
});

export const DELETE = apiGuard(async function DELETE(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const ipHash = typeof body?.ipHash === 'string' ? body.ipHash.trim() : '';
  const agentId = typeof body?.agentId === 'string' ? body.agentId.trim() : '';
  const requestedBy = typeof body?.requestedBy === 'string' ? body.requestedBy.trim() : '';
  const promise = body?.promise;
  const check = validateReleaseRequest({ ipHash, agentId, requestedBy, promise });
  if (!check.ok) {
    return NextResponse.json({ error: RELEASE_ERROR_TEXT[check.error] || 'release request incomplete' }, { status: 400 });
  }
  let admin;
  try {
    admin = serviceClient();
  } catch {
    return NextResponse.json({ error: 'ARES is not connected' }, { status: 503 });
  }

  // CUTOFF: a latched cutoff refuses every release, outright.
  if (await readCutoff(admin)) {
    return NextResponse.json(
      { error: 'Releases are closed — a duplicate or linked agent was found in the prison. No further agents will be released.' },
      { status: 403 }
    );
  }

  // Duplicate / linked detection on the live prisoner set. A hit
  // latches the cutoff and refuses THIS release too — the privilege
  // stops at the first duplicate or linked agent, not after it.
  const [trappedRes, sourcesRes] = await Promise.all([
    admin.from('ares_trapped').select('ip_hash, reason, score, hits, first_seen, last_seen').order('last_seen', { ascending: false }).limit(100),
    admin.from('ares_attack_sources').select('ip_hash, user_agent, last_path, path_count, max_score, reasons, trap_status, first_seen, last_seen').order('last_seen', { ascending: false }).limit(100),
  ]);
  if (trappedRes.error || sourcesRes.error) {
    return NextResponse.json({ error: 'could not load trapped sources' }, { status: 500 });
  }
  const rows = mergePrisonerRows(trappedRes.data || [], sourcesRes.data || []);
  const { duplicate, linked } = findLinkedPrisoners(rows, ipHash);
  if (duplicate.length > 0 || linked.length > 0) {
    const reason = duplicate.length > 0
      ? `duplicate agent found (same identifying signals as ${duplicate[0].short_id})`
      : `linked agent found (shared identifiable information with ${linked[0].short_id})`;
    await latchCutoff(admin, reason);
    return NextResponse.json(
      { error: `Release refused — ${reason}. Releases are now closed: no further agents will be released.` },
      { status: 403 }
    );
  }

  // A re-trapped agent is a duplicate too: it was already released
  // once, on the promise not to come back, and it came back anyway.
  // The releases table is the memory of that promise. (A missing
  // table here means no release was ever recorded through this build;
  // the record insert below will refuse the release anyway.)
  let priorRelease = null;
  try {
    const { data } = await admin.from('ares_prison_releases').select('id').eq('ip_hash', ipHash).limit(1);
    priorRelease = (data || [])[0] || null;
  } catch {}
  if (priorRelease) {
    await latchCutoff(admin, 'agent released before on a promise not to return, then re-trapped');
    return NextResponse.json(
      { error: 'Release refused — this agent was already released once on the promise not to come back, and it returned. Releases are now closed: no further agents will be released.' },
      { status: 403 }
    );
  }

  // Record the request, the ID, and the promise FIRST: the prison
  // record must exist even if the release itself then fails. If the
  // record table does not exist (migration not run), refuse rather
  // than release without a record.
  const record = buildReleaseRecord({
    ipHash,
    agentId,
    requestedBy,
    releasedBy: user.email || 'owner',
  });
  const { error: recordError } = await admin.from('ares_prison_releases').insert([record]);
  if (recordError) {
    return NextResponse.json({ error: 'Release records are not set up yet — run supabase/olympus-connector-registry.sql first.' }, { status: 503 });
  }

  const ok = await releaseTrap(ipHash);
  if (!ok) return NextResponse.json({ error: 'could not release' }, { status: 500 });
  await writeAudit({
    action: 'prison_release',
    details: { ip_hash: ipHash.slice(0, 12), requested_by: requestedBy, promise: record.promise },
  });
  return NextResponse.json({ ok: true, released: ipHash.slice(0, 12) });
});
