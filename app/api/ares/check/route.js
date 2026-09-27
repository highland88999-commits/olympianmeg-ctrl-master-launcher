// ARES block check — internal only. The edge middleware asks: is this
// visitor currently banned?
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { checkInternal, isBlocked } from '@/lib/ares/server';

export async function POST(request) {
  if (!checkInternal(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body?.ip) return NextResponse.json({ error: 'ip is required' }, { status: 400 });
  return NextResponse.json(await isBlocked(body.ip));
}
