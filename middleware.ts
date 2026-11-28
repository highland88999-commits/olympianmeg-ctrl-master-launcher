// ============================================================
// ARES edge middleware.
//
// What it does, per request:
//   1. Whitelist bypass: Miles, home IPs, localhost never touched.
//   2. Ban check: asks /api/ares/check (cached 60s) -> 403 if banned.
//   3. Bot heuristics: suspicious UA / scanner paths / missing headers.
//      Ordinary bots get a 403. Scores in the WATCH band (suspicious
//      but undecided) get Phase 1 handling: silent log, delayed
//      response, or honeypot redirect, picked per epoch/visitor/path
//      from a seeded PRNG — never a block, never a challenge.
//   4. Rate limiting: sliding window, per instance (see note below).
// Violations are reported fire-and-forget to /api/ares/ingest; the
// response is never delayed by logging.
//
// PHASE 1 — ANTI-MAPPING (ARCHITECTURE.md §1c, §6):
//   * Rotating thresholds + rate-limit windows (lib/ares/phase1.js):
//     the bot threshold, the per-IP cap, and the window rotate every
//     15 minutes, drawn from a seeded PRNG (seed: ARES_ROTATION_SEED).
//     No response ever reveals a limit value, the seed, or the epoch.
//   * Kill switch: /api/ares/phase1 (internal, 15s cache) reports the
//     dashboard toggle. When it is ON — or the seed is missing, or the
//     state cannot be read — everything above falls back to the static
//     v0 heuristics (threshold 40, env rate limits). Fail-open, always.
//   * Response uniformity: every denial answers with the same generic
//     body. No version leaks, no stack traces, no "blocked by ARES"
//     banners anywhere in this file's responses.
//
// TARPIT ON (Merlin opt-in, Nov 27, 2026 — "Green light means yes.
// And turn it on."): the abyss sandbox rewrites are LIVE again. A
// trapped source is rewritten into /api/ares/abyss on every request
// until the keeper releases it, and extra-malicious traffic
// (score >= 75, or 3+ strikes with bot signals) is trapped there
// instead of getting the plain 403. The trap decision and the trap
// write go through the internal /api/ares/trap route — the edge
// runtime never touches the database directly.
//
// HONEST LIMITATIONS (documented, not hidden):
// - The rate-limit window lives in instance memory. On serverless/edge
//   each instance has its own counter, so a distributed flood is slowed
//   on every instance rather than stopped globally. A shared store
//   (Supabase/Upstash) is the upgrade path.
// - This file only needs ARES_INTERNAL_TOKEN, MILES_IP, ARES_HOME_IPS,
//   ARES_ROTATION_SEED, and the ARES_* tuning vars. No secrets are hardcoded.
// ============================================================

import { NextResponse } from 'next/server';
import { scoreRequest } from './lib/ares/heuristics.js';
import { createRateLimiter } from './lib/ares/rate-limit.js';
import { isWhitelisted, whitelistFromEnv } from './lib/ares/ip-edge.js';
import { extractFeatures } from './lib/ares/features.js';
import {
  WATCH_LOW,
  clientFingerprint,
  isPhase1Active,
  jitterMs,
  rotationEpoch,
  rotationParams,
  watchAction,
} from './lib/ares/phase1.js';

const RATE_MAX = Number(process.env.ARES_RATE_LIMIT_MAX || 120);
const RATE_WINDOW_MS = Number(process.env.ARES_RATE_LIMIT_WINDOW_MS || 60_000);
const BOT_THRESHOLD = Number(process.env.ARES_BOT_THRESHOLD || 40);
const ROTATION_SEED = process.env.ARES_ROTATION_SEED || '';

const limiter = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxHits: RATE_MAX,
});

const INTERNAL = process.env.ARES_INTERNAL_TOKEN || '';
const FRIENDLY = whitelistFromEnv(process.env).map((e) => e.value);

function visitorIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

// Small sleep for watch-band jitter. Edge-safe; caps at ~550ms total
// (150ms base + 400ms delay action) — a slowdown, never a hold.
function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// Short client fingerprint for cohort grouping (UA + language +
// encoding, FNV-1a — grouping signal only, never an identity).
function fingerprintOf(req) {
  return clientFingerprint({
    userAgent: req.headers.get('user-agent') || '',
    acceptLanguage: req.headers.get('accept-language') || '',
    acceptEncoding: req.headers.get('accept-encoding') || '',
  });
}

// Ban list, cached 60s per IP in instance memory. The old cache
// held one global result for every IP, so one visitor's verdict could
// leak onto the next visitor within the window; a per-IP map keeps
// each verdict on its own visitor.
const checkCache = new Map();
async function cachedCheck(req, endpoint, ip, pick) {
  const key = `${endpoint}:${ip}`;
  const now = Date.now();
  const hit = checkCache.get(key);
  if (hit && now - hit.at < 60_000) return pick(hit.data);
  try {
    const res = await fetch(new URL(endpoint, req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ares-internal': INTERNAL },
      body: JSON.stringify({ ip }),
    });
    const data = await res.json();
    if (checkCache.size > 1000) checkCache.delete(checkCache.keys().next().value);
    checkCache.set(key, { at: now, data });
    return pick(data);
  } catch {
    return false; // check failed: fail open on reads, never lock everyone out
  }
}

async function isBanned(req, ip) {
  return cachedCheck(req, '/api/ares/check', ip, (d) => d?.blocked === true);
}

// Trapped-source check, cached 60s per IP like the ban check: asks
// /api/ares/trap-check (internal) whether this visitor is already
// trapped in the abyss.
async function isTrappedSource(req, ip) {
  return cachedCheck(req, '/api/ares/trap-check', ip, (d) => d?.trapped === true);
}

// Extra-malicious trap: asks the internal /api/ares/trap route to
// decide (isExtraMalicious, strikes included) and, when the bar is
// crossed, record + trap the source. Returns true only when the
// source is now trapped. Any failure reads as "not trapped": the
// caller falls through to the plain 403, never to a crash.
async function trapExtraMalicious(req, { ip, score, userAgent, path, reasons }) {
  try {
    const res = await fetch(new URL('/api/ares/trap', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ares-internal': INTERNAL },
      body: JSON.stringify({ ip, score, userAgent, path, reasons }),
    });
    const data = await res.json();
    return data?.trapped === true;
  } catch {
    return false;
  }
}

// Kill-switch state, cached 15s (short on purpose: the switch must take
// effect within seconds of the keeper flipping it, not a minute). The
// route answers with ONE boolean and no limit values. Any failure — no
// internal token, unreachable route, bad JSON — reads as kill switch ON
// (static v0): the safe, predictable defense, never a rotation the
// keeper may have just ordered off.
let phase1Cache = null;
let phase1At = 0;
async function killSwitchOn(req) {
  const now = Date.now();
  if (phase1Cache !== null && now - phase1At < 15_000) return phase1Cache;
  let on = true;
  try {
    if (!INTERNAL) throw new Error('no internal token');
    const res = await fetch(new URL('/api/ares/phase1', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ares-internal': INTERNAL },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    on = data?.killSwitch !== false;
  } catch {
    on = true;
  }
  phase1Cache = on;
  phase1At = now;
  return on;
}

export async function middleware(req) {
  const ip = visitorIp(req);
  const url = req.nextUrl;

  // 1. Whitelist first: friendly addresses are never inspected.
  if (isWhitelisted(ip, FRIENDLY)) return NextResponse.next();

  const sentinelOn = process.env.ARES_SENTINEL_ENABLED !== '0' && process.env.ARES_SENTINEL_ENABLED !== 'false';
  const phalanxOn = process.env.ARES_PHALANX_ENABLED !== '0' && process.env.ARES_PHALANX_ENABLED !== 'false';

  // Phase 1 live? Needs a seed AND the kill switch off. Otherwise the
  // static v0 numbers below are what every check enforces.
  const killSwitch = await killSwitchOn(req);
  const phase1 = isPhase1Active({ seed: ROTATION_SEED, killSwitch });
  const now = Date.now();
  const rotation = phase1
    ? rotationParams({ seed: ROTATION_SEED, now, baseBotThreshold: BOT_THRESHOLD, baseRateLimitMax: RATE_MAX, baseRateLimitWindowMs: RATE_WINDOW_MS })
    : { epoch: rotationEpoch(now), botThreshold: BOT_THRESHOLD, rateLimitMax: RATE_MAX, rateLimitWindowMs: RATE_WINDOW_MS, watchLow: WATCH_LOW };
  const clientFp = fingerprintOf(req);

  // 1b. Trapped source? Every later request from a trapped source
  // lands back in the abyss until the keeper releases it.
  if (phalanxOn && ip !== 'unknown' && (await isTrappedSource(req, ip))) {
    return NextResponse.rewrite(new URL('/api/ares/abyss', req.url));
  }

  // 2. Active ban?
  if (phalanxOn && ip !== 'unknown' && (await isBanned(req, ip))) {
    if (sentinelOn) report(req.url, {
      ip, eventType: 'blocked_ip_hit', path: url.pathname,
      userAgent: req.headers.get('user-agent'),
      details: { client_fp: clientFp },
      ml: mlFingerprint({ userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers }),
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 3. Bot heuristics (rotating threshold when Phase 1 is live).
  if (sentinelOn) {
    const verdict = scoreRequest({
      userAgent: req.headers.get('user-agent'),
      path: url.pathname,
      headers: req.headers,
    });
    if (verdict.score >= rotation.botThreshold) {
      report(req.url, {
        ip, eventType: 'bot_blocked', path: url.pathname,
        userAgent: req.headers.get('user-agent'),
        details: { score: verdict.score, reasons: verdict.reasons, client_fp: clientFp },
        ml: mlFingerprint({ userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers }),
      });
      if (phalanxOn) {
        // Extra-malicious tier: trap the source in the abyss instead
        // of the plain 403. The trap route decides the bar
        // (isExtraMalicious: score >= 75, or 3+ strikes at score >= 40)
        // and records the source; anything below the bar falls through
        // to the plain 403 below.
        const trapped = await trapExtraMalicious(req, {
          ip,
          score: verdict.score,
          userAgent: req.headers.get('user-agent'),
          path: url.pathname,
          reasons: verdict.reasons,
        });
        if (trapped) return NextResponse.rewrite(new URL('/api/ares/abyss', req.url));
        return new NextResponse('Forbidden', { status: 403 });
      }
    } else if (phase1 && verdict.score >= rotation.watchLow) {
      // Watch band: suspicious but undecided. The Hub picks one of
      // three treatments per epoch/visitor/path — silent log, delayed
      // response, or honeypot redirect — so differential probing yields
      // noise, not a decision boundary. Nothing here blocks: every
      // action serves the request normally in the end.
      const probeLike = verdict.reasons.some((r) =>
        String(r).startsWith('scanner-path') || String(r).startsWith('suspicious-user-agent'));
      let action = watchAction({
        seed: ROTATION_SEED, epoch: rotation.epoch, ipHash: ip, path: url.pathname,
      });
      // Honeypot redirect is only for probe-like traffic; anything else
      // that drew it falls back to a delayed response.
      if (action === 'honeypot' && !probeLike) action = 'delay';
      const salt = `${rotation.epoch}:${ip}:${url.pathname}:${Math.floor(now / 10_000)}`;
      const delay = jitterMs({ seed: ROTATION_SEED, salt, maxMs: 150 })
        + (action === 'delay' ? jitterMs({ seed: ROTATION_SEED, salt: `${salt}:delay`, maxMs: 400 }) : 0);
      report(req.url, {
        ip, eventType: 'watch_flagged', path: url.pathname,
        userAgent: req.headers.get('user-agent'),
        details: { score: verdict.score, reasons: verdict.reasons, watch_action: action, client_fp: clientFp },
        ml: mlFingerprint({ userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers }),
      });
      if (action === 'honeypot') {
        await sleep(delay);
        return NextResponse.rewrite(new URL('/api/honeypot/env', req.url));
      }
      await sleep(delay);
      // 'log' and 'delay' both serve the request normally afterwards.
    }
  }

  // 4. Rate limiting (rotating window + cap when Phase 1 is live).
  if (ip !== 'unknown') {
    const check = limiter.check(`rl:${ip}`, now, {
      windowMs: rotation.rateLimitWindowMs,
      maxHits: rotation.rateLimitMax,
    });
    if (!check.allowed) {
      if (sentinelOn) report(req.url, {
        ip, eventType: 'rate_limited', path: url.pathname,
        userAgent: req.headers.get('user-agent'),
        details: { client_fp: clientFp },
        ml: mlFingerprint({
          userAgent: req.headers.get('user-agent'), path: url.pathname, headers: req.headers,
          windowHits: limiter.count(`rl:${ip}`, now, {
            windowMs: rotation.rateLimitWindowMs,
            maxHits: rotation.rateLimitMax,
          }),
          windowMax: rotation.rateLimitMax,
        }),
      });
      // Uniform denial: the same generic body as every other denial.
      // Retry-After stays — it names only this request's wait, never
      // the limit value — so legitimate clients can back off.
      return new NextResponse('Forbidden', {
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
