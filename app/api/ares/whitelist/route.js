// ARES dashboard API: allowlist manager (authenticated).
// Only hashes are stored. POST takes { ip, label }; the raw IP is hashed
// server-side and never persisted.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, serviceClient, hashVisitorIp } from '@/lib/ares/server';
import { whitelistFromEnv } from '@/lib/ares/ip';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const { data, error } = await serviceClient()
    .from('ares_whitelist')
    .select('ip_hash, label, created_at')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'could not load allowlist' }, { status: 500 });
  // Entries from env (Miles, home IPs) are shown as static rows so the
  // dashboard reflects the full effective allowlist.
  const envEntries = whitelistFromEnv().map((e) => ({
    ip_hash: hashVisitorIp(e.value).slice(0, 12) + '…',
    label: `${e.label} (from server settings)`,
    created_at: null,
    static: true,
  }));
  return NextResponse.json({ whitelist: [...envEntries, ...(data || [])] });
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
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : '';
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : '';
  if (!ip || ip.length > 64 || !label) {
    return NextResponse.json({ error: 'ip and label are required' }, { status: 400 });
  }
  const { error } = await serviceClient()
    .from('ares_whitelist')
    .upsert([{ ip_hash: hashVisitorIp(ip), label }], { onConflict: 'ip_hash' });
  if (error) return NextResponse.json({ error: 'could not save' }, { status: 500 });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiGuard(async function DELETE(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const ipHash = typeof body?.ipHash === 'string' ? body.ipHash.trim() : '';
  if (!/^[0-9a-f]{64}$/i.test(ipHash)) {
    return NextResponse.json({ error: 'a valid allowlist hash is required' }, { status: 400 });
  }
  const { error } = await serviceClient().from('ares_whitelist').delete().eq('ip_hash', ipHash);
  if (error) return NextResponse.json({ error: 'could not remove' }, { status: 500 });
  return NextResponse.json({ ok: true });
});
