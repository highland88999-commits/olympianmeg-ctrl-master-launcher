// ARES honeypot trap logic (server only). Each trap route is a thin
// wrapper around handleTrap(). The trap logs the visit as evidence and
// answers with a plain 404 — or with inert fake content when the route
// passed some, so a scanner chews on fake data instead of a 404.
//
// TARPIT ON (Merlin opt-in, Nov 27, 2026 — "Green light means yes.
// And turn it on."): the extra-malicious tier that routes trap
// visitors into the abyss sandbox (lib/ares/tarpit.js: slow-drip
// responses + persistent trapping) is LIVE again. Re-enabled on
// Merlin's explicit word (ARCHITECTURE.md §1c.7: tarpit is Phase 3,
// explicit opt-in only).
// DEFENSIVE ONLY: no payloads, no retaliation of any kind.
import { NextResponse } from 'next/server';
import { logEvent, serviceClient, hashVisitorIp } from './server.js';
import { isWhitelisted, whitelistFromEnv } from './ip.js';
import { extractFeatures } from './features.js';
import { scoreRequest } from './heuristics.js';
import { abyssResponse, isExtraMalicious, recordAttackSource, trapAttackSource } from './tarpit.js';

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
// A non-whitelisted visitor gets the fake content (200, right
// content-type) instead of the 404 JSON — juicier bait keeps a scanner
// wandering on fake data. Whitelisted visitors still get the 404 and
// are never logged. Logging is unchanged either way.
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
    // Extra-malicious tier: a trap visitor whose score crosses the
    // abyss bar (score >= 75 — the flagged-scanner-UA-on-scanner-path
    // signature) is trapped persistently and served the sandbox maze
    // instead of fake content or a plain 404. The repeat-offender arm
    // (3+ strikes at score >= 40) is decided in the middleware's
    // internal trap route, which reads the strike count; this branch
    // scores the trap visit itself.
    const verdict = scoreRequest({ userAgent: ua, path: trapPath, headers: request.headers });
    if (isExtraMalicious({ score: verdict.score })) {
      await recordAttackSource({
        ip,
        userAgent: ua,
        path: trapPath,
        score: verdict.score,
        reasons: verdict.reasons,
        trapped: true,
      });
      await trapAttackSource({ ip, reason: 'Extra-malicious attack', score: verdict.score });
      return abyssResponse(trapPath);
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
