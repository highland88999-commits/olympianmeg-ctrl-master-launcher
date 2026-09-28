// ARES ingest — internal only. Middleware and honeypots report here.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { checkInternal, logEvent } from '@/lib/ares/server';
import { EVENT_TYPES } from '@/lib/ares/config';

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
  const { ip, eventType, path, userAgent, details } = body || {};
  if (!ip || !EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: 'ip and a valid eventType are required' }, { status: 400 });
  }
  const result = await logEvent({ ip, eventType, path, userAgent, details: details || {} });
  return NextResponse.json(result);
}
