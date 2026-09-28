// ============================================================
// ARES edge middleware — EXAMPLE. The parent installs this at the
// master app root as `middleware.ts` (merge with any existing one).
//
// What it does, per request:
//   1. Whitelist bypass: Miles, home IPs, localhost never touched.
//   2. Ban check: asks /api/ares/check (cached 60s) -> 403 if banned.
//   3. Bot heuristics: suspicious UA / scanner paths / missing headers.
//   4. Rate limiting: sliding window, per instance (see note below).
// Violations are reported fire-and-forget to /api/ares/ingest; the
// response is never delayed by logging.
//
// HONEST LIMITATIONS (documented, not hidden):
// - The rate-limit window lives in instance memory. On serverless/edge
//   each instance has its own counter, so a distributed flood is slowed
//   on every instance rather than stopped globally. A shared store
//   (Supabase/Upstash) is the upgrade path.
// - This file only needs ARES_INTERNAL_TOKEN, MILES_IP, ARES_HOME_IPS,
//   and the ARES_* tuning vars. No secrets are hardcoded.
// ============================================================

import { NextResponse } from 'next/server';
import { scoreRequest } from './lib/ares/heuristics.js';
import { createRateLimiter } from './lib/ares/rate-limit.js';
import { isWhitelisted, whitelistFromEnv } from './lib/ares/ip-edge.js';
import { extractFeatures } from './lib/ares/features.js';

const RATE_MAX = Number(process.env.ARES_RATE_LIMIT_MAX || 120);

const limiter = createRateLimiter({
  windowMs: Number(process.env.ARES_RATE_LIMIT_WINDOW_MS || 60_000),
  maxHits: RATE_MAX,
});

const INTERNAL = process.env.ARES_INTERNAL_TOKEN || '';
const FRIENDLY = whitelistFromEnv(process.env).map((e) => e.value);

function visitorIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

// Fire-and-forget: never block the response on logging.
function report(url, body) {
  if (!INTERNAL) return;
  fetch(new URL('/api/ares/ingest', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ares-internal': INTERNAL },
    body: JSON.stringify(body),
  }).catch(() => {});
}

// ML fingerprint for the learning pipeline: every reported event carries
// the numeric feature vector it was scored on, so the evidence log doubles
// as labeled training data. Pure and edge-safe.
function mlFingerprint({ userAgent, path, headers, windowHits, windowMax }: {
  userAgent?: any; path?: any; headers?: any; windowHits?: any; windowMax?: any;
}) {
  const { vector, version } = extractFeatures({
    userAgent, path, headers, windowHits, windowMax,
  });
  return { features: vector, feature_version: version };
}

// Ban list, cached 60s in instance memory.
let banCache = { at: 0, data: null };
async function isBanned(req, ip) {
  const now = Date.now();
  if (now - banCache.at > 60_000 || !banCache.data) {
    try {
      const res = await fetch(new URL('/api/ares/check', req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ares-internal': INTERNAL },
        body: JSON.stringify({ ip }),
      });
      banCache = { at: now, data: await res.json() };
    } catch {
      return false; // check failed: fail open on reads, never lock everyone out
    }
  }
  return banCache.data?.blocked === true;
}

export async function middleware(req) {
  const ip = visitorIp(req);
  const url = req.nextUrl;

  // 1. Whitelist first: friendly addresses are never inspected.
  if (isWhitelisted(ip, FRIENDLY)) return NextResponse.next();

  const sentinelOn = process.env.ARES_SENTINEL_ENABLED !== '0' && process.env.ARES_SENTINEL_ENABLED !== 'false';
  const phalanxOn = process.env.ARES_PHALANX_ENABLED !== '0' && process.env.ARES_PHALANX_ENABLED !== 'false';

  // 2. Active ban?
  if (phalanxOn && ip !== 'unknown' && (await isBanned(req, ip))) {
    if (sentinelOn) report(req.url, {
      ip, eventType: 'blocked_ip_hit', path: url.pathname,
      userAgent: req.headers.get('user-agent'),
      ml: mlFingerprint({ userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers }),
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 3. Bot heuristics.
  if (sentinelOn) {
    const verdict = scoreRequest({
      userAgent: req.headers.get('user-agent'),
      path: url.pathname,
      headers: req.headers,
    });
    if (verdict.isBot) {
      report(req.url, {
        ip, eventType: 'bot_blocked', path: url.pathname,
        userAgent: req.headers.get('user-agent'),
        details: { score: verdict.score, reasons: verdict.reasons },
        ml: mlFingerprint({ userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers }),
      });
      if (phalanxOn) return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // 4. Rate limiting.
  if (ip !== 'unknown') {
    const check = limiter.check(`rl:${ip}`);
    if (!check.allowed) {
      if (sentinelOn) report(req.url, {
        ip, eventType: 'rate_limited', path: url.pathname,
        userAgent: req.headers.get('user-agent'),
        ml: mlFingerprint({
          userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers,
          windowHits: limiter.count(`rl:${ip}`), windowMax: RATE_MAX,
        }),
      });
      return new NextResponse('Too many requests. Slow down.', {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(check.retryAfterMs / 1000)) },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except static assets, Next internals, the ARES console
    // itself, and the honeypots (they log on their own).
    '/((?!_next/static|_next/image|favicon.ico|ares|api/ares|api/honeypot).*)',
  ],
};
