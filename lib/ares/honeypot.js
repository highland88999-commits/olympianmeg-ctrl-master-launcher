// ARES honeypot trap logic (server only). Each trap route is a thin
// wrapper around handleTrap(). The trap logs the visit as evidence and
// answers with a plain 404 — except for the extra-malicious tier, which
// the keeper ordered into the abyss sandbox instead (see lib/ares/
// tarpit.js). DEFENSIVE ONLY: no payloads, no retaliation of any kind;
// the abyss serves fake rows, slowly, on our server.
import { NextResponse } from 'next/server';
import { logEvent, serviceClient, hashVisitorIp } from './server.js';
import { isWhitelisted, whitelistFromEnv } from './ip.js';
import { extractFeatures } from './features.js';
import { scoreRequest } from './heuristics.js';
import { isExtraMalicious, abyssResponse, trapAttackSource, recordAttackSource } from './tarpit.js';

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

// options.fakeContent: { contentType, body } from lib/ares/fake-bait.js.
// A non-extra-malicious, non-whitelisted visitor gets the fake content
// (200, right content-type) instead of the 404 JSON — juicier bait keeps
// a scanner wandering on fake data. Extra-malicious visitors still get
// the abyss exactly as before; whitelisted visitors still get the 404
// and are never logged. Logging and scoring are unchanged either way
// (trap trip +50, same reasons).
export async function handleTrap(request, trapPath, options = {}) {
  const ip = visitorIp(request);
  // Whitelist first: never log friendly addresses (source guardrail rule).
  const friendly = ip !== 'unknown' && (await isFriendly(ip));
  if (!friendly) {
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
    // Extra-malicious tier: a trap trip plus a scanner signature (or
    // 3+ strikes behind it) does not get a plain 404 — it gets the
    // abyss, and its source is reported.
    let strikes = 0;
    try {
      const { data } = await serviceClient()
        .from('ares_blocks')
        .select('strikes')
        .eq('ip_hash', hashVisitorIp(ip))
        .single();
      strikes = data?.strikes || 0;
    } catch {}
    const verdict = scoreRequest({ userAgent: ua, path: trapPath, headers: request.headers });
    const score = verdict.score + 50; // the trap trip itself
    if (isExtraMalicious({ score, strikes })) {
      await trapAttackSource({ ip, reason: 'Extra-malicious: honeypot trip plus scanner signature', score });
      await recordAttackSource({
        ip, userAgent: ua, path: trapPath, score,
        reasons: [...verdict.reasons, 'honeypot trip'],
        trapped: true,
      });
      return abyssResponse();
    }
    // Ordinary trap visitor: serve the fake content when the route
    // passed some, so the scanner chews on inert bait instead of a 404.
    if (options.fakeContent) {
      return new NextResponse(options.fakeContent.body, {
        status: 200,
        headers: { 'content-type': options.fakeContent.contentType },
      });
    }
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
