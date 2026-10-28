// ARES trap check — internal only. The edge middleware asks: is this
// visitor currently trapped in the abyss?
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { checkInternal, hashVisitorIp } from '@/lib/ares/server';
import { isTrapped } from '@/lib/ares/tarpit';

export const POST = apiGuard(async function POST(request) {
  if (!checkInternal(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : '';
  if (!ip || ip.length > 64) return NextResponse.json({ error: 'ip is required' }, { status: 400 });
  return NextResponse.json({ trapped: await isTrapped(hashVisitorIp(ip)) });
});
