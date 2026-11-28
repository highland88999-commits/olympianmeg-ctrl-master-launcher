// ARES trap — internal only. The edge middleware asks: trap this
// extra-malicious visitor in the abyss? The middleware is edge code
// and never touches the database directly, so the decision
// (isExtraMalicious, strikes included) and the trap write live here,
// on the Node runtime, next to the trap-check read route.
// POST { ip, score, userAgent, path, reasons } ->
//   { trapped: true } when the bar is crossed and the source is now
//   trapped, { trapped: false } otherwise. Never throws: any failure
//   reads as "not trapped" and the caller falls through to the plain
//   403.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { checkInternal, hashVisitorIp, serviceClient } from '@/lib/ares/server';
import { isExtraMalicious, recordAttackSource, trapAttackSource } from '@/lib/ares/tarpit';

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
  const score = Number(body?.score) || 0;
  const reasons = Array.isArray(body?.reasons) ? body.reasons.map(String).slice(0, 10) : [];
  // Repeat-offender strikes live in ares_blocks (logEvent counts
  // them per strike-worthy event). Best-effort: unknown means 0.
  let strikes = 0;
  try {
    const { data } = await serviceClient()
      .from('ares_blocks')
      .select('strikes')
      .eq('ip_hash', hashVisitorIp(ip))
      .single();
    strikes = Number(data?.strikes) || 0;
  } catch {
    strikes = 0;
  }
  if (!isExtraMalicious({ score, strikes })) return NextResponse.json({ trapped: false });
  const userAgent = typeof body?.userAgent === 'string' ? body.userAgent : null;
  const path = typeof body?.path === 'string' ? body.path : null;
  await recordAttackSource({ ip, userAgent, path, score, reasons, trapped: true });
  const ipHash = await trapAttackSource({ ip, reason: 'Extra-malicious attack', score });
  return NextResponse.json({ trapped: ipHash !== null });
});
