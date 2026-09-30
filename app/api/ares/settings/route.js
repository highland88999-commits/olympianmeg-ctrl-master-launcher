// ARES dashboard API: module toggles (authenticated).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, serviceClient, getSettings, invalidateSettingsCache } from '@/lib/ares/server';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const s = await getSettings();
  return NextResponse.json({
    settings: { sentinelEnabled: s.sentinelEnabled, phalanxEnabled: s.phalanxEnabled },
  });
});

export const POST = apiGuard(async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
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
  return NextResponse.json({ ok: true });
});
