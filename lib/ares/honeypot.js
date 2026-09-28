// ARES honeypot trap logic (server only). Each trap route is a thin
// wrapper around handleTrap(). The trap logs the visit as evidence and
// answers with a plain 404. DEFENSIVE ONLY: no payloads, no tarpits,
// no retaliation of any kind.
import { NextResponse } from 'next/server';
import { logEvent, serviceClient, hashVisitorIp } from './server.js';
import { isWhitelisted, whitelistFromEnv } from './ip.js';
import { extractFeatures } from './features.js';

export function visitorIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function isFriendly(ip) {
  if (isWhitelisted(ip, whitelistFromEnv().map((e) => e.value))) return true;
  try {
    const { data } = await serviceClient().from('ares_whitelist').select('ip_hash');
    return (data || []).some((r) => r.ip_hash === hashVisitorIp(ip));
  } catch {
    return false;
  }
}

export async function handleTrap(request, trapPath) {
  const ip = visitorIp(request);
  // Whitelist first: never log friendly addresses (source guardrail rule).
  if (ip !== 'unknown' && !(await isFriendly(ip))) {
    const ua = request.headers.get('user-agent');
    const { vector, version } = extractFeatures({
      userAgent: ua,
      path: trapPath,
      headers: request.headers,
      honeypotHit: true,
    });
    await logEvent({
      ip,
      eventType: 'honeypot_hit',
      path: trapPath,
      userAgent: ua,
      details: { trap: trapPath },
      ml: { features: vector, feature_version: version },
    });
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
