// ARES dashboard API: module toggles (owner-locked: Merlin only).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient, getSettings, invalidateSettingsCache } from '@/lib/ares/server';
import { writeAudit } from '@/lib/ares/audit';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  const s = await getSettings();
  return NextResponse.json({
    settings: { sentinelEnabled: s.sentinelEnabled, phalanxEnabled: s.phalanxEnabled, killSwitch: s.killSwitch === true },
  });
});

export const POST = apiGuard(async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const rows = [];
  if (typeof body?.sentinelEnabled === 'boolean')
    rows.push({ key: 'sentinel_enabled', value: String(body.sentinelEnabled) });
  if (typeof body?.phalanxEnabled === 'boolean')
    rows.push({ key: 'phalanx_enabled', value: String(body.phalanxEnabled) });
  // Phase 1 kill switch (ARCHITECTURE.md §4): dashboard-toggleable.
  // ON = rotation/watch/jitter OFF, static v0 heuristics. Takes effect
  // within seconds (middleware re-reads it every 15s).
  if (typeof body?.killSwitch === 'boolean')
    rows.push({ key: 'phase1_kill_switch', value: String(body.killSwitch) });
  if (rows.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  const db = serviceClient();
  for (const row of rows) {
    const { error } = await db.from('ares_settings').upsert(
      [{ ...row, updated_at: new Date().toISOString() }],
      { onConflict: 'key' }
    );
    if (error) return NextResponse.json({ error: 'could not save settings' }, { status: 500 });
  }
  invalidateSettingsCache();
  // Audit trail (fail-open: a missing audit table never fails the save).
  const killRow = rows.find((r) => r.key === 'phase1_kill_switch');
  if (killRow) {
    await writeAudit({
      action: killRow.value === 'true' ? 'kill_switch_on' : 'kill_switch_off',
      details: { key: 'phase1_kill_switch' },
    });
  } else {
    await writeAudit({ action: 'settings_change', details: { keys: rows.map((r) => r.key) } });
  }
  return NextResponse.json({ ok: true });
});
