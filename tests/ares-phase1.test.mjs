// tests/ares-phase1.test.mjs — ARES Phase 1 (anti-mapping hardening).
// Run: node --test tests/ares-phase1.test.mjs (from the repo root).
// No browser, no live database. Pure modules are tested directly; the
// two new routes (phase1, labels) run against an in-memory PostgREST
// stand-in + stubbed Supabase Auth, the same seam the lure test uses:
// the Supabase client only ever speaks HTTP, so answering that HTTP
// from memory never touches a live database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ROTATION_EPOCH_MS,
  ROTATION_WINDOWS_MS,
  STATIC_FALLBACK,
  WATCH_LOW,
  clientFingerprint,
  createSeededRng,
  hashSeedString,
  isPhase1Active,
  jitterMs,
  rotationEpoch,
  rotationParams,
  watchAction,
} from '../lib/ares/phase1.js';
import { findCohorts } from '../lib/ares/cohorts.js';
import { createRateLimiter } from '../lib/ares/rate-limit.js';
import { ARES_DEFAULTS, configFromEnv, EVENT_TYPES } from '../lib/ares/config.js';
import { labelEvent } from '../lib/ares/labels.js';
import scalingPolicy from '../lib/ares/scaling-policy.json' with { type: 'json' };

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Seeded PRNG: deterministic, and the seed never leaks into outputs.
// ---------------------------------------------------------------------------
test('phase1 rng: same seed, same stream; different seeds diverge', () => {
  const a = createSeededRng('hub-seed-1');
  const b = createSeededRng('hub-seed-1');
  const c = createSeededRng('hub-seed-2');
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of [...seqA, ...seqC]) assert.ok(v >= 0 && v < 1, 'rng output in [0,1)');
  assert.equal(hashSeedString('x'), hashSeedString('x'));
  assert.notEqual(hashSeedString('x'), hashSeedString('y'));
});

// ---------------------------------------------------------------------------
// Rotating thresholds + rate-limit windows.
// ---------------------------------------------------------------------------
test('phase1 rotation: deterministic per epoch, in range, and varies across epochs', () => {
  const seed = 'test-rotation-seed';
  const now = Date.now();
  const p1 = rotationParams({ seed, now });
  const p2 = rotationParams({ seed, now });
  assert.deepEqual(p1, p2, 'same seed + same time = same rotation');
  assert.equal(p1.epoch, rotationEpoch(now));
  assert.ok(p1.botThreshold >= 35 && p1.botThreshold <= 50, `threshold ${p1.botThreshold} in 35..50`);
  assert.ok(p1.rateLimitMax >= 90 && p1.rateLimitMax <= 150, `cap ${p1.rateLimitMax} in 90..150 for base 120`);
  assert.ok(ROTATION_WINDOWS_MS.includes(p1.rateLimitWindowMs), `window ${p1.rateLimitWindowMs} is a listed window`);
  assert.equal(p1.watchLow, WATCH_LOW);

  // Across ten epochs, at least one parameter must move — otherwise the
  // rotation is a fixed schedule wearing a costume.
  const seen = new Set();
  for (let e = 0; e < 10; e += 1) {
    const p = rotationParams({ seed, now: e * ROTATION_EPOCH_MS });
    seen.add(`${p.botThreshold}/${p.rateLimitMax}/${p.rateLimitWindowMs}`);
  }
  assert.ok(seen.size > 1, `rotation must vary across epochs, saw ${seen.size} distinct param sets`);

  // No limit value, seed, or epoch may ever be serialized to a client —
  // the params object itself must not carry the seed.
  assert.equal(JSON.stringify(p1).includes(seed), false, 'rotation output must not contain the seed');
  assert.equal('seed' in p1, false);
});

test('phase1 rotation: static fallback matches the v0 defaults', () => {
  assert.equal(STATIC_FALLBACK.botThreshold, 40);
  assert.equal(STATIC_FALLBACK.rateLimitMax, 120);
  assert.equal(STATIC_FALLBACK.rateLimitWindowMs, 60_000);
  assert.equal(STATIC_FALLBACK.watchLow, WATCH_LOW);
  assert.equal(ARES_DEFAULTS.botThreshold, 40);
  assert.equal(ARES_DEFAULTS.killSwitch, false);
});

test('phase1 activation: needs a seed, and the kill switch turns it off', () => {
  assert.equal(isPhase1Active({ seed: 's', killSwitch: false }), true);
  assert.equal(isPhase1Active({ seed: '', killSwitch: false }), false, 'no seed, no rotation');
  assert.equal(isPhase1Active({ killSwitch: false }), false, 'missing seed, no rotation');
  assert.equal(isPhase1Active({ seed: 's', killSwitch: true }), false, 'kill switch off means static v0');
  assert.equal(isPhase1Active({ seed: '   ', killSwitch: false }), false, 'blank seed is no seed');
});

test('phase1 config: kill switch defaults off, env forces it on', () => {
  assert.equal(configFromEnv({}).killSwitch, false);
  assert.equal(configFromEnv({ ARES_PHASE1_KILL_SWITCH: '1' }).killSwitch, true);
  assert.equal(configFromEnv({ ARES_PHASE1_KILL_SWITCH: 'true' }).killSwitch, true);
  assert.equal(configFromEnv({ ARES_PHASE1_KILL_SWITCH: '0' }).killSwitch, false);
});

// ---------------------------------------------------------------------------
// Watch-band handling + jitter.
// ---------------------------------------------------------------------------
test('phase1 watch: one of log/delay/honeypot, stable per epoch+visitor+path', () => {
  const seed = 'watch-seed';
  const first = watchAction({ seed, epoch: 7, ipHash: '203.0.113.9', path: '/.env' });
  assert.ok(['log', 'delay', 'honeypot'].includes(first));
  assert.equal(watchAction({ seed, epoch: 7, ipHash: '203.0.113.9', path: '/.env' }), first,
    'same epoch/visitor/path draws the same action');
  assert.notEqual(
    watchAction({ seed, epoch: 8, ipHash: '203.0.113.9', path: '/.env' }),
    undefined,
  );
  // Across many visitors the draw covers all three actions — differential
  // probing gets noise, not a boundary.
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    seen.add(watchAction({ seed, epoch: 7, ipHash: `203.0.113.${i}`, path: '/.env' }));
  }
  assert.deepEqual([...seen].sort(), ['delay', 'honeypot', 'log']);
});

test('phase1 jitter: bounded, deterministic per salt, varies with salt', () => {
  const a = jitterMs({ seed: 'j', salt: 's1', maxMs: 150 });
  assert.equal(a, jitterMs({ seed: 'j', salt: 's1', maxMs: 150 }));
  assert.ok(a >= 0 && a <= 150, `jitter ${a} within 0..150`);
  const varied = new Set();
  for (let i = 0; i < 50; i += 1) varied.add(jitterMs({ seed: 'j', salt: `s${i}`, maxMs: 150 }));
  assert.ok(varied.size > 10, 'jitter varies across salts');
  assert.equal(jitterMs({ seed: 'j', salt: 's1', maxMs: 0 }), 0);
});

test('phase1 fingerprint: stable per client, differs across clients, carries no raw header', () => {
  const fp = clientFingerprint({ userAgent: 'curl/8.0.1', acceptLanguage: 'en-US', acceptEncoding: 'gzip' });
  assert.equal(fp, clientFingerprint({ userAgent: 'curl/8.0.1', acceptLanguage: 'en-US', acceptEncoding: 'gzip' }));
  assert.notEqual(fp, clientFingerprint({ userAgent: 'Mozilla/5.0', acceptLanguage: 'en-US', acceptEncoding: 'gzip' }));
  assert.equal(fp.includes('curl'), false, 'fingerprint must not embed the raw UA');
  assert.match(fp, /^[0-9a-f]{8}$/);
});

// ---------------------------------------------------------------------------
// Watch-band event type + label (tier-1 only, never a strike).
// ---------------------------------------------------------------------------
test('phase1 watch event: type registered, labeled weak, never a strike type', () => {
  assert.ok(EVENT_TYPES.includes('watch_flagged'));
  const label = labelEvent({ eventType: 'watch_flagged' });
  assert.equal(label.threat_class, 'bot');
  assert.ok(label.confidence <= 0.5, `watch labels stay weak (got ${label.confidence})`);
});

// ---------------------------------------------------------------------------
// Rate limiter: per-call overrides (the rotation seam).
// ---------------------------------------------------------------------------
test('phase1 rate limit: window/cap overrides apply per call, defaults unchanged', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxHits: 3 });
  const t0 = 1_000_000;
  assert.equal(limiter.check('k', t0).allowed, true);
  assert.equal(limiter.check('k', t0 + 1).allowed, true);
  assert.equal(limiter.check('k', t0 + 2).allowed, true);
  assert.equal(limiter.check('k', t0 + 3).allowed, false, 'default cap of 3 enforced');
  // A 1-second override window forgets the old hits immediately.
  assert.equal(limiter.check('k', t0 + 4000, { windowMs: 1000, maxHits: 3 }).allowed, true);
  // And the default contract still works with no overrides.
  const plain = createRateLimiter({ windowMs: 60_000, maxHits: 1 });
  assert.equal(plain.check('x', t0).allowed, true);
  assert.equal(plain.check('x', t0 + 1).allowed, false);
  assert.equal(plain.count('x', t0 + 1), 1);
});

// ---------------------------------------------------------------------------
// Cohort correlation v1.
// ---------------------------------------------------------------------------
function cohortEvents() {
  const base = Date.parse('2026-11-25T12:00:00.000Z');
  const rows = [];
  // Two visitors, same fingerprint, same path-walk, same 10s buckets.
  for (const [ip, fp] of [['hash-aaa-1', 'fp-1'], ['hash-bbb-2', 'fp-1']]) {
    for (let i = 0; i < 4; i += 1) {
      rows.push({
        ip_hash: ip,
        event_type: i % 2 ? 'scanner_path' : 'bot_blocked',
        path: ['/.env', '/wp-login.php', '/.git/config', '/admin.php'][i],
        user_agent: 'curl/8.0.1',
        details: { client_fp: fp },
        created_at: new Date(base + i * 1000).toISOString(),
      });
    }
  }
  // One loner with a different fingerprint and different paths.
  for (let i = 0; i < 3; i += 1) {
    rows.push({
      ip_hash: 'hash-ccc-3',
      event_type: 'bot_blocked',
      path: ['/about', '/pricing', '/contact'][i],
      user_agent: 'Mozilla/5.0',
      details: { client_fp: 'fp-9' },
      created_at: new Date(base + i * 1000).toISOString(),
    });
  }
  return rows;
}

test('phase1 cohorts: lockstep visitors cluster, loners do not', () => {
  const cohorts = findCohorts(cohortEvents());
  assert.equal(cohorts.length, 1, 'exactly one cohort');
  const [c] = cohorts;
  assert.equal(c.memberCount, 2);
  assert.equal(c.eventCount, 8);
  assert.deepEqual([...c.members].sort(), ['hash-aaa-1'.slice(0, 12), 'hash-bbb-2'.slice(0, 12)]);
  assert.ok(c.walkSimilarity >= 0.9, `walk similarity ${c.walkSimilarity}`);
  assert.ok(c.synchrony >= 0.9, `synchrony ${c.synchrony}`);
  assert.ok(c.score >= 0.5, `score ${c.score}`);
  assert.ok(c.sharedPaths.includes('/.env'));
  assert.equal(c.fingerprint, 'fp:fp-1');
});

test('phase1 cohorts: empty input, single visitor, and lone fingerprints find nothing', () => {
  assert.deepEqual(findCohorts([]), []);
  assert.deepEqual(findCohorts(cohortEvents().filter((e) => e.ip_hash === 'hash-aaa-1')), [],
    'one visitor is not a cohort');
  // Same fingerprint but disjoint paths and disjoint times: no cluster.
  const rows = [
    { ip_hash: 'h1', path: '/a', user_agent: 'u', details: { client_fp: 'f' }, created_at: '2026-11-25T12:00:00.000Z' },
    { ip_hash: 'h1', path: '/b', user_agent: 'u', details: { client_fp: 'f' }, created_at: '2026-11-25T12:00:01.000Z' },
    { ip_hash: 'h1', path: '/c', user_agent: 'u', details: { client_fp: 'f' }, created_at: '2026-11-25T12:00:02.000Z' },
    { ip_hash: 'h2', path: '/x', user_agent: 'u', details: { client_fp: 'f' }, created_at: '2026-11-25T13:00:00.000Z' },
    { ip_hash: 'h2', path: '/y', user_agent: 'u', details: { client_fp: 'f' }, created_at: '2026-11-25T13:00:01.000Z' },
    { ip_hash: 'h2', path: '/z', user_agent: 'u', details: { client_fp: 'f' }, created_at: '2026-11-25T13:00:02.000Z' },
  ];
  assert.deepEqual(findCohorts(rows), [], 'disjoint walks at disjoint times are not a cohort');
});

// ---------------------------------------------------------------------------
// Scaling policy file: versioned, auto-scaling OFF, caps present.
// ---------------------------------------------------------------------------
test('phase1 scaling policy: versioned, auto-scaling OFF, caps and triggers stated', () => {
  assert.equal(scalingPolicy.policyVersion, '1.0.0');
  assert.equal(scalingPolicy.autoScalingEnabled, false);
  assert.equal(scalingPolicy.caps.maxInstances, 8);
  assert.ok(typeof scalingPolicy.caps.maxSpendPerDayUsd === 'number');
  assert.ok(typeof scalingPolicy.caps.cooldownMinutes === 'number');
  for (const key of ['load', 'surface', 'incident', 'scheduled']) {
    assert.ok(scalingPolicy.triggers[key], `trigger ${key} stated`);
    assert.equal(scalingPolicy.triggers[key].enabled, false, `trigger ${key} is off`);
  }
});

// ---------------------------------------------------------------------------
// Tarpit wired (Merlin opt-in, Nov 27, 2026 — "Green light means yes.
// And turn it on."): live callers, live serving surface.
// ---------------------------------------------------------------------------
test('phase1 tarpit: middleware rewrites trapped sources into the abyss', () => {
  const mw = src('../middleware.ts');
  assert.equal(mw.includes('/api/ares/abyss'), true, 'middleware rewrites into the abyss route');
  assert.equal(mw.includes('isTrappedSource'), true, 'middleware checks the trap list');
  assert.equal(mw.includes('trap-check'), true);
  assert.equal(mw.includes('trapExtraMalicious'), true, 'middleware traps extra-malicious sources');
  assert.ok(mw.includes('watch_flagged'), 'watch-band events are logged instead');
  assert.ok(mw.includes('killSwitchOn'), 'middleware reads the kill switch');
  assert.equal(mw.includes('Too many requests'), false, 'deny body is the uniform generic one');
});

test('phase1 tarpit: honeypot branches extra-malicious visitors into the abyss', () => {
  const hp = src('../lib/ares/honeypot.js');
  assert.equal(hp.includes("from './tarpit.js'"), true, 'honeypot imports the tarpit');
  assert.equal(hp.includes('abyssResponse'), true);
  assert.equal(hp.includes('isExtraMalicious'), true);
  assert.equal(hp.includes('trapAttackSource'), true);
  assert.ok(hp.includes("return NextResponse.json({ error: 'Not found' }"), 'plain 404 remains for ordinary trap visitors');
});

test('phase1 tarpit: abyss routes serve the maze, with the doll layers on doll-N slugs', () => {
  for (const f of ['../app/api/ares/abyss/route.js', '../app/api/ares/abyss/[...slug]/route.js']) {
    const route = src(f);
    assert.equal(route.includes('abyssResponse'), true, `${f}: maze served`);
    // (The header comment names the tarpit module in prose; the check
    // is for an actual import, not the word.)
    assert.equal(/\bimport\b[^;]*tarpit/.test(route), true, `${f}: tarpit import`);
    assert.equal(route.includes('status: 404'), false, `${f}: no plain 404`);
  }
  const slugRoute = src('../app/api/ares/abyss/[...slug]/route.js');
  assert.equal(slugRoute.includes('dollResponse'), true, 'doll-N slugs serve the doll layers');
  // The tarpit module itself still exists (untouched) — now its live
  // wiring is back too. Its pure helpers keep working under test.
  const tp = src('../lib/ares/tarpit.js');
  assert.ok(tp.includes('export function isExtraMalicious'), 'tarpit.js file kept, helpers intact');
});

// ---------------------------------------------------------------------------
// Response uniformity audit: gate answers 401 for every failure alike.
// ---------------------------------------------------------------------------
test('phase1 uniformity: gate keeps its pinned 401/403 split, loses the 503 leak', () => {
  const gate = src('../app/api/ares/gate/route.js');
  assert.ok(gate.includes('status: 401'), 'gate answers 401 for missing/invalid tokens');
  assert.ok(gate.includes('status: 403'), 'gate answers 403 for a valid non-owner token (pinned by ares-lock)');
  assert.equal(gate.includes('status: 503'), false, 'gate must not leak unconfigured state with 503');
  const cfg = src('../next.config.js');
  assert.ok(cfg.includes('poweredByHeader: false'), 'framework header stripped');
});

// ---------------------------------------------------------------------------
// Portal menu: /ares is NOT a portal-menu seat — Concourse-tile-only
// access (Merlin, Nov 16, 2026 order; the Phase 1 portal-menu re-add
// was reverted Nov 26, 2026). The /ares route and all ARES function
// stay intact; the Concourse tile is the only menu entry.
// ---------------------------------------------------------------------------
test('phase1 menu: ares stays out of the ATHENA god menu and the satellite registry (Concourse tile only)', () => {
  const menus = src('../lib/god-menus.js');
  assert.ok(!menus.includes("'ares',"), 'god-menus ATHENA list does not carry ares');
  const sats = src('../lib/i18n/satellites.ts');
  assert.ok(!sats.includes('{ key: "ares", route: "/ares", pos: "ATHENA", section: "TOOLS", constellation: "ARES" }'),
    'satellites.ts does not carry the ares entry');
  const en = JSON.parse(src('../lib/i18n/locales/en.json'));
  assert.equal(en['sat.ares.title'], undefined);
  assert.equal(en['sat.ares.subtitle'], undefined);
});

// ---------------------------------------------------------------------------
// Routes (live, stubbed): phase1 returns ONLY the kill-switch boolean;
// labels degrades gracefully without its table, round-trips with it.
// ---------------------------------------------------------------------------
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9/ares-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-tests-only';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy-anon-key';
delete process.env.ARES_PHASE1_KILL_SWITCH;

const OWNER = 'olympiannexus@gmail.com';
const store = { ares_settings: [], ares_event_labels: [], ares_audit_log: [] };
let labelsTableExists = false;

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = String(
    init.method || (typeof input !== 'string' && input.method) || 'GET',
  ).toUpperCase();
  const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  if (url.pathname.includes('/auth/v1/user')) {
    const token = headers.get('authorization') || '';
    const email = token.includes('owner-token') ? OWNER : 'someone@else.com';
    return json({ id: '00000000-0000-0000-0000-000000000001', email, aud: 'authenticated', role: 'authenticated' });
  }
  const table = decodeURIComponent(url.pathname.replace(/^.*\/rest\/v1\//, '').split('/')[0]);
  if (table === 'ares_event_labels' && !labelsTableExists) {
    return json({ message: 'Could not find the table \'public.ares_event_labels\' in the schema cache', code: 'PGRST205' }, 404);
  }
  if (!Object.prototype.hasOwnProperty.call(store, table)) {
    return json({ message: 'table not found in test stand-in' }, 404);
  }
  const rows = store[table];
  const filters = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'select' || k === 'on_conflict' || k === 'order' || k === 'limit') continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) filters.push([k, m[1]]);
  }
  const match = (r) => filters.every(([k, v]) => String(r[k]) === v);
  if (method === 'GET') {
    const found = rows.filter(match);
    if (headers.get('accept')?.includes('vnd.pgrst.object+json')) {
      if (found.length === 1) return json(found[0]);
      return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    }
    return json(found);
  }
  if (method === 'POST') {
    const list = JSON.parse(String(init.body || '[]'));
    const items = Array.isArray(list) ? list : [list];
    const onConflict = url.searchParams.get('on_conflict');
    for (const nr of items) {
      const idx = onConflict
        ? rows.findIndex((r) => String(r[onConflict]) === String(nr[onConflict])) : -1;
      if (idx >= 0) rows[idx] = { ...rows[idx], ...nr }; else rows.push({ ...nr, id: rows.length + 1 });
    }
    return json(items, 201);
  }
  return json({ message: 'unsupported method in test stand-in' }, 405);
};
test.after(() => { globalThis.fetch = realFetch; });

const phase1Route = await import('../app/api/ares/phase1/route.js');
const labelsRoute = await import('../app/api/ares/labels/route.js');
const { invalidateSettingsCache } = await import('../lib/ares/server.js');

const internalReq = (body = {}) => new Request('http://localhost/api/ares/phase1', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ares-internal': 'test-internal-token' },
  body: JSON.stringify(body),
});
const ownerReq = (url, opts = {}) => new Request(url, {
  ...opts,
  headers: { ...(opts.headers || {}), authorization: 'Bearer owner-token' },
});

test('phase1 route: internal call returns ONLY the kill-switch boolean', async () => {
  process.env.ARES_INTERNAL_TOKEN = 'test-internal-token';
  invalidateSettingsCache();
  const res = await phase1Route.POST(internalReq());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['killSwitch'], 'no thresholds, no seed, no limits in the response');
  assert.equal(body.killSwitch, false, 'no setting stored yet: switch off');
  assert.equal(JSON.stringify(body).includes('test-internal-token'), false);

  // Dashboard flips the switch: the route reports it.
  store.ares_settings.push({ key: 'phase1_kill_switch', value: 'true' });
  invalidateSettingsCache();
  const res2 = await phase1Route.POST(internalReq());
  assert.equal((await res2.json()).killSwitch, true);
  store.ares_settings.length = 0;
  invalidateSettingsCache();
});

test('phase1 route: no internal token, no answer', async () => {
  process.env.ARES_INTERNAL_TOKEN = 'test-internal-token';
  const bad = new Request('http://localhost/api/ares/phase1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const res = await phase1Route.POST(bad);
  assert.equal(res.status, 403);
});

test('labels route: table missing -> honest unprovisioned state, nothing crashes', async () => {
  labelsTableExists = false;
  const get = await labelsRoute.GET(ownerReq('http://localhost/api/ares/labels'));
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { labels: [], provisioned: false });
  const post = await labelsRoute.POST(ownerReq('http://localhost/api/ares/labels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 42, decision: 'confirm', threatClass: 'scanner' }),
  }));
  assert.equal(post.status, 503);
  const body = await post.json();
  assert.equal(body.provisioned, false);
});

test('labels route: table present -> list, confirm, reject, and audit degrades', async () => {
  labelsTableExists = true;
  store.ares_event_labels.length = 0;
  store.ares_audit_log.length = 0;
  const post = await labelsRoute.POST(ownerReq('http://localhost/api/ares/labels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 7, decision: 'confirm', threatClass: 'scanner' }),
  }));
  assert.equal(post.status, 200);
  assert.deepEqual(await post.json(), { ok: true, provisioned: true });
  const get = await labelsRoute.GET(ownerReq('http://localhost/api/ares/labels'));
  const data = await get.json();
  assert.equal(data.provisioned, true);
  assert.equal(data.labels.length, 1);
  assert.equal(data.labels[0].event_id, 7);
  assert.equal(data.labels[0].decision, 'confirm');
  assert.equal(data.labels[0].threat_class, 'scanner');
  // Reject relabels benign and upserts on the same event.
  const reject = await labelsRoute.POST(ownerReq('http://localhost/api/ares/labels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 7, decision: 'reject' }),
  }));
  assert.equal(reject.status, 200);
  assert.equal(store.ares_event_labels.length, 1, 'one label per event (upsert)');
  assert.equal(store.ares_event_labels[0].threat_class, 'benign');
  // Bad input is a plain 400, never a crash.
  const bad = await labelsRoute.POST(ownerReq('http://localhost/api/ares/labels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'x', decision: 'maybe' }),
  }));
  assert.equal(bad.status, 400);
  // Non-owner is locked out.
  const stranger = new Request('http://localhost/api/ares/labels', {
    headers: { authorization: 'Bearer stranger-token' },
  });
  assert.equal((await labelsRoute.GET(stranger)).status, 403);
  const anon = new Request('http://localhost/api/ares/labels');
  assert.equal((await labelsRoute.GET(anon)).status, 401);
});
