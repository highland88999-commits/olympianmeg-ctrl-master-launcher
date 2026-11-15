// ARES lure integration — robots.txt signpost + release + friendly + sandbox containment.
//
// Proves the Mirror Dimension doctrine end to end at the integration
// level: the signpost points scanners at fake doors, every door scores
// into the sandbox, nothing inside escapes to real data, a released
// source leaves cleanly, and an allowlisted visitor never enters it.
//
// What is NOT directly executed here, and why (stated plainly):
// - handleTrap() itself cannot run under node --test: it imports
//   next/server, which does not resolve outside the Next runtime
//   (verified: ERR_MODULE_NOT_FOUND). The friendly path is proven
//   through the decision helpers it calls (isWhitelisted /
//   whitelistFromEnv) plus source-order assertions on honeypot.js and
//   middleware.ts — whitelist first, logging + fake content + abyss
//   all inside the not-friendly branch.
// - The maze page builder is abyssPageHtml(path) in lib/ares/tarpit.js
//   (worker B): '' is the shard index, any subpath is its own
//   deterministic maze page; mazePages() lists every page it serves.
//   abyssPageHtmlAsync(path) is the live-route render — it loads
//   worker A's fake bait first, so the bot sees the bait file's
//   contents. Both are exercised below, sync and async.
// - Nothing here touches the live database: the release test runs
//   against an in-memory PostgREST stand-in. The Supabase client
//   talks HTTP, so the test answers that HTTP from memory (fake URL +
//   fake service key + a fetch stub installed before the first call).
//   No mock.module flag is needed, so the file runs under plain
//   `node --test` like every other ARES test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { scoreRequest, BOT_THRESHOLD, SCANNER_PATHS } from '../lib/ares/heuristics.js';
import {
  fakeBaitFor, BAIT_IDS, MOBILE_BAIT_IDS, isMobileUserAgent, AWS_EXAMPLE_ACCESS_KEY,
} from '../lib/ares/fake-bait.js';
import { isWhitelisted, whitelistFromEnv } from '../lib/ares/ip.js';
import { hashVisitorIp } from '../lib/ares/server.js';

// ---------------------------------------------------------------------------
// In-memory PostgREST stand-in for the release test (never the live DB).
// The Supabase service client only ever speaks HTTP to /rest/v1/*, so
// answering that HTTP from memory is the whole seam — no flag needed.
// ---------------------------------------------------------------------------
const trapStore = { ares_trapped: [], ares_attack_sources: [] };
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9/ares-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-tests-only';

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = String(
    init.method || (typeof input !== 'string' && input.method) || 'GET',
  ).toUpperCase();
  const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
  const table = decodeURIComponent(url.pathname.replace(/^.*\/rest\/v1\//, '').split('/')[0]);
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  if (!Object.prototype.hasOwnProperty.call(trapStore, table)) {
    return json({ message: 'table not found in test stand-in' }, 404);
  }
  let rows = trapStore[table];
  const filters = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'select' || k === 'on_conflict') continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) filters.push([k, m[1]]);
  }
  const match = (r) => filters.every(([k, v]) => String(r[k]) === v);
  if (method === 'GET') {
    const found = rows.filter(match);
    if (headers.get('accept')?.includes('vnd.pgrst.object+json')) {
      if (found.length === 1) return json(found[0]);
      return json({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      }, 406);
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
      if (idx >= 0) rows[idx] = { ...rows[idx], ...nr }; else rows.push({ ...nr });
    }
    return json(items, 201);
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(String(init.body || '{}'));
    const updated = [];
    for (const r of rows.filter(match)) { Object.assign(r, patch); updated.push(r); }
    return json(updated);
  }
  if (method === 'DELETE') {
    trapStore[table] = rows.filter((r) => !match(r));
    return json([]);
  }
  return json({ message: 'unsupported method in test stand-in' }, 405);
};

const tarpit = await import('../lib/ares/tarpit.js');
const {
  isExtraMalicious, abyssPageHtml, abyssPageHtmlAsync, mazePages, MAZE_DEPTH,
  ABYSS_THRESHOLD, trapAttackSource, isTrapped, releaseTrap, recordAttackSource,
} = tarpit;

// ---------------------------------------------------------------------------
// Shared fixtures.
// ---------------------------------------------------------------------------
const REAL_BROWSER = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  headers: { 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' },
};
const SCANNER_UA = 'curl/8.0.1';

// robots.txt inventory: wave 1 (original lure) + wave 2 (doubled server
// bait) + the mobile third. '/admin' is deliberately absent: it would
// shadow the real /admin/bug-reports route (prefix rule).
const WAVE_1 = [
  '/.env', '/.git/', '/wp-config.php', '/backup.zip', '/dump.sql', '/id_rsa',
  '/.aws/', '/api/keys', '/config.json', '/phpinfo.php', '/.DS_Store', '/.svn/',
  '/wp-login.php', '/xmlrpc.php', '/phpmyadmin',
];
const WAVE_2 = [
  '/phpMyAdmin', '/.env.local', '/.htpasswd', '/private.key', '/db.sqlite',
  '/wp-admin', '/administrator', '/admin.php', '/config.php', '/server-status',
  '/actuator/health',
];
const MOBILE_PATHS = [
  '/api/mobile/v1/auth', '/api/mobile/config', '/mobile/api/login',
  '/download/app.apk', '/download/app.ipa', '/releases/olympus.apk',
  '/api/sms/send', '/api/otp/verify', '/mobile-admin',
];
const EXPECTED_DISALLOW = [...WAVE_1, ...WAVE_2, ...MOBILE_PATHS]; // 35 lines
// Directory Disallow entries point at a canonical file probe for scoring.
const PROBE = { '/.git/': '/.git/config', '/.aws/': '/.aws/credentials', '/.svn/': '/.svn/entries' };

const robotsTxt = readFileSync('public/robots.txt', 'utf8');
const disallow = robotsTxt
  .split('\n').map((l) => l.trim())
  .filter((l) => l.startsWith('Disallow:'))
  .map((l) => l.slice('Disallow:'.length).trim());

function realRoutes() {
  const out = [];
  (function walk(dir, prefix) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${prefix}/${e.name}`;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, p);
      else if (/^(page|route)\.(js|jsx|ts|tsx)$/.test(e.name)) {
        out.push(p.replace(/\/(page|route)\.(js|jsx|ts|tsx)$/, '') || '/');
      }
    }
  })('app', '');
  return out;
}

function publicFiles() {
  const out = [];
  (function walk(dir, prefix) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${prefix}/${e.name}`;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, p);
      else out.push(p);
    }
  })('public', '');
  return out;
}

function linksOut(html) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const actions = [...html.matchAll(/action="([^"]+)"/g)].map((m) => m[1]);
  return [...hrefs, ...actions];
}

// Maze shape (documented in lib/ares/tarpit.js): the 14-level chain,
// index (depth 0) to archive (depth 13); the archive loops back up.
const MAZE_CHAIN = ['', 'vault', 'backup', 'dump', 'keys', 'logs', 'shards',
  'db-console', 'admin', 'credential-store', 'deploy-logs', 'mobile-api',
  'release-builds', 'archive'];

// ---------------------------------------------------------------------------
// (a) Release: a released source stops being trapped, and leaves cleanly.
// ---------------------------------------------------------------------------
test('release: a trapped source stops being trapped and its record reads released', async () => {
  const ip = '203.0.113.9';
  const ipHash = hashVisitorIp(ip); // same hash the trap code stores
  assert.equal(await isTrapped(ipHash), false, 'not trapped before the trap');
  await trapAttackSource({ ip, reason: 'integration test trap', score: 75 });
  assert.equal(await isTrapped(ipHash), true, 'trapped after trapAttackSource');
  await recordAttackSource({
    ip, userAgent: 'curl/8.0.1', path: '/.env', score: 75,
    reasons: ['scanner-path', 'honeypot trip'], trapped: true,
  });
  assert.equal(
    trapStore.ares_attack_sources.find((r) => r.ip_hash === ipHash)?.trap_status,
    'trapped',
  );
  assert.equal(await releaseTrap(ipHash), true, 'keeper release succeeds');
  assert.equal(await isTrapped(ipHash), false, 'no longer trapped after release');
  assert.equal(trapStore.ares_trapped.length, 0, 'trap row is gone');
  assert.equal(
    trapStore.ares_attack_sources.find((r) => r.ip_hash === ipHash)?.trap_status,
    'released',
    'attack-source record shows the release, so the console learns it left',
  );
  // Releasing an unknown hash is a clean no-op, not a crash.
  const strangerHash = hashVisitorIp('198.51.100.99');
  assert.equal(await releaseTrap(strangerHash), true);
  assert.equal(await isTrapped(strangerHash), false);
});

// ---------------------------------------------------------------------------
// (b) Friendly: an allowlisted visitor never sees the fake stuff and is
// never logged. handleTrap itself cannot run under node --test
// (next/server does not resolve), so this is proven at the level it
// can be: the decision helpers, plus source order in honeypot.js and
// middleware.ts (whitelist first, everything else inside the
// not-friendly branch).
// ---------------------------------------------------------------------------
test('friendly: allowlisted visitors are friendly, everyone else is not', () => {
  assert.equal(isWhitelisted('127.0.0.1', []), true, 'localhost is always friendly');
  assert.equal(isWhitelisted('::1', []), true);
  const entries = whitelistFromEnv({ MILES_IP: '203.0.113.7', ARES_HOME_IPS: '198.51.100.2, 198.51.100.3' })
    .map((e) => e.value);
  assert.deepEqual(entries, ['203.0.113.7', '198.51.100.2', '198.51.100.3']);
  assert.equal(isWhitelisted('203.0.113.7', entries), true, 'Miles is friendly');
  assert.equal(isWhitelisted('198.51.100.3', entries), true, 'home IP is friendly');
  assert.equal(isWhitelisted('203.0.113.99', entries), false, 'stranger is not friendly');
  assert.equal(isWhitelisted('', entries), false);
});

test('friendly: whitelist is checked before any logging, fake content, scoring or abyss', () => {
  const hp = readFileSync('lib/ares/honeypot.js', 'utf8');
  const friendlyAt = hp.indexOf('if (!friendly)');
  assert.ok(friendlyAt > -1, 'handleTrap guards on !friendly');
  assert.ok(hp.indexOf('Whitelist first') > -1 && hp.indexOf('Whitelist first') < friendlyAt);
  const logAt = hp.indexOf('await logEvent(');
  const fakeAt = hp.indexOf('if (options.fakeContent)');
  const abyssAt = hp.indexOf('return abyssResponse()');
  const notFoundAt = hp.lastIndexOf("return NextResponse.json({ error: 'Not found' }");
  assert.ok(logAt > friendlyAt, 'logging happens only inside the not-friendly branch');
  assert.ok(fakeAt > friendlyAt, 'fake content is served only inside the not-friendly branch');
  assert.ok(abyssAt > friendlyAt, 'the abyss is entered only inside the not-friendly branch');
  assert.ok(notFoundAt > fakeAt, 'a friendly visitor falls through to the plain 404');
  assert.equal((hp.match(/await logEvent\(/g) || []).length, 1, 'exactly one log call, inside the branch');
  const mw = readFileSync('middleware.ts', 'utf8');
  assert.ok(mw.indexOf('isWhitelisted(ip, FRIENDLY)') > -1, 'middleware whitelists first');
  assert.ok(mw.indexOf('isWhitelisted(ip, FRIENDLY)') < mw.indexOf('scoreRequest('),
    'middleware: whitelist before scoring, so a friendly address is never inspected');
});

// ---------------------------------------------------------------------------
// (c) robots.txt: the doubled signpost, and no real route shadowed.
// ---------------------------------------------------------------------------
test('robots.txt: lists the doubled bait set (wave 1 + wave 2 + mobile third), no lure comment', () => {
  assert.match(robotsTxt, /^User-agent: \*/m);
  assert.equal(disallow.length, 35, `expected 35 Disallow lines, got ${disallow.length}: ${disallow.join(', ')}`);
  assert.deepEqual([...new Set(disallow)], disallow, 'no duplicate Disallow lines');
  for (const p of EXPECTED_DISALLOW) assert.ok(disallow.includes(p), `missing Disallow: ${p}`);
  assert.equal(robotsTxt.split('\n').filter((l) => l.trim().startsWith('#')).length, 0,
    'no comments at all in the file');
  for (const w of ['lure', 'honeypot', 'bait', 'scanner', 'trap', 'abyss']) {
    assert.doesNotMatch(robotsTxt, new RegExp(w, 'i'), `robots.txt must not say "${w}"`);
  }
  assert.ok(!disallow.includes('/admin'), '/admin stays out: it would shadow the real /admin/bug-reports');
  assert.ok(!disallow.includes('/.well-known/security.txt'), 'security.txt stays findable, it is not bait');
});

test('robots.txt: no Disallow entry shadows a real route or a real public file', () => {
  const routes = realRoutes();
  assert.ok(routes.includes('/admin/bug-reports'), 'sanity: /admin/bug-reports is a real route');
  assert.ok(routes.includes('/api/honeypot/env'), 'sanity: trap routes are real routes, not bait paths');
  const files = publicFiles();
  for (const d of disallow) {
    const prefix = d.endsWith('/') ? d : `${d}/`;
    for (const r of routes) {
      assert.ok(!(r === d || r.startsWith(prefix)), `${d} would shadow real route ${r}`);
    }
    for (const f of files) {
      assert.ok(!(f === d || f.startsWith(prefix)), `${d} would shadow public file ${f}`);
    }
  }
});

test('robots.txt: every signposted door scores 30 on path (75 with a scanner UA, the abyss bar)', () => {
  assert.equal(ABYSS_THRESHOLD, 75);
  assert.equal(BOT_THRESHOLD, 40);
  for (const d of disallow) {
    const probe = PROBE[d] || d;
    assert.ok(SCANNER_PATHS.some((p) => p.toLowerCase() === probe.toLowerCase()),
      `${probe} must be a scored scanner path`);
    const plain = scoreRequest({ ...REAL_BROWSER, path: probe });
    assert.equal(plain.score, 30, `${probe} should score 30, got ${plain.score}`);
    assert.equal(plain.isBot, false, `${probe} alone is below the bot bar`);
    const withScanner = scoreRequest({ ...REAL_BROWSER, userAgent: SCANNER_UA, path: probe });
    assert.equal(withScanner.score, 75, `${probe} + scanner UA should score 75, got ${withScanner.score}`);
    assert.equal(withScanner.isBot, true);
    assert.equal(isExtraMalicious({ score: withScanner.score, strikes: 0 }), true,
      `${probe} + scanner UA crosses into the abyss tier`);
  }
});

// ---------------------------------------------------------------------------
// (d) Sandbox: nothing inside escapes to real data.
// ---------------------------------------------------------------------------
test('sandbox: the abyss index page keeps every exit inside /api/ares/abyss', () => {
  const html = abyssPageHtml();
  const exits = linksOut(html);
  assert.ok(exits.length > 0, 'the index page has exits to check');
  for (const e of exits) assert.ok(e.startsWith('/api/ares/abyss'), `exit escapes the sandbox: ${e}`);
  assert.doesNotMatch(html, /https?:\/\//, 'no external URLs in the sandbox');
  assert.doesNotMatch(html, /olympusverse/, 'no real hostnames in the sandbox');
  assert.doesNotMatch(html, /\+\d{1,3}[- ]\d{3}[- ]\d{3}[- ]\d{4}/, 'no real phone numbers in the sandbox');
});

test('sandbox: the abyss routes serve the sandbox, never a redirect out', () => {
  for (const f of ['app/api/ares/abyss/route.js', 'app/api/ares/abyss/[...slug]/route.js']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /abyssResponse\(/, `${f}: serves the sandbox`);
    assert.match(src, /from '@\/lib\/ares\/tarpit'/, `${f}: sandbox comes from tarpit`);
    assert.doesNotMatch(src, /NextResponse\.redirect/, `${f}: no redirect out of the sandbox`);
  }
  const slugRoute = readFileSync('app/api/ares/abyss/[...slug]/route.js', 'utf8');
  assert.match(slugRoute, /abyssResponse\(subpath\)/,
    'the catch-all passes its subpath into the maze builder, so each subpath is its own page');
});

test('sandbox: every maze page keeps every exit inside /api/ares/abyss', () => {
  assert.equal(MAZE_DEPTH, 14, 'the maze chain is 14 levels deep');
  const pages = mazePages();
  assert.equal(pages.length, 26, 'index + shard detail + 24 maze pages');
  for (const page of pages) {
    const slug = page.slug === 'shard-<n>' ? 'shard-1001' : page.slug;
    const html = abyssPageHtml(slug);
    assert.match(html, /Console —/, `${slug || '(index)'}: renders a sandbox page`);
    const exits = linksOut(html);
    assert.ok(exits.length > 0, `${slug || '(index)'}: has exits to check`);
    for (const e of exits) {
      assert.ok(e.startsWith('/api/ares/abyss'), `${slug || '(index)'}: exit escapes the sandbox: ${e}`);
    }
    assert.doesNotMatch(html, /https?:\/\//, `${slug || '(index)'}: no external URLs in the maze`);
    assert.doesNotMatch(html, /olympusverse/, `${slug || '(index)'}: no real hostnames in the maze`);
  }
});

test('sandbox: the maze chain descends level by level and the bottom loops back up', () => {
  for (let i = 0; i < MAZE_CHAIN.length - 1; i += 1) {
    const from = MAZE_CHAIN[i];
    const to = MAZE_CHAIN[i + 1];
    const html = abyssPageHtml(from);
    assert.ok(html.includes(`href="/api/ares/abyss/${to}"`),
      `${from || '(index)'} must link deeper to ${to}`);
  }
  const bottom = abyssPageHtml('archive');
  assert.ok(bottom.includes('href="/api/ares/abyss/vault"'),
    'the archive (depth 13) loops back up to the vault — no dead end, no way out');
});

test('sandbox: maze pages are deterministic per slug, and unknown slugs get a listing, not a real page', () => {
  assert.equal(abyssPageHtml('vault'), abyssPageHtml('vault'), 'same slug, same page');
  assert.equal(abyssPageHtml('shard-1001'), abyssPageHtml('shard-1001'));
  assert.notEqual(abyssPageHtml('vault'), abyssPageHtml('backup'), 'different slugs differ');
  const unknown = abyssPageHtml('totally-unknown-path');
  assert.match(unknown, /Directory listing/);
  for (const e of linksOut(unknown)) {
    assert.ok(e.startsWith('/api/ares/abyss'), `unknown slug exit escapes: ${e}`);
  }
});

test('sandbox: bait-file aliases land on maze pages, not real files', () => {
  for (const alias of ['.env', 'wp-config.php', '.git/config', 'backup.zip', 'dump.sql', 'api-keys', 'config.json', 'phpinfo.php', '.svn/entries']) {
    const html = abyssPageHtml(alias);
    assert.match(html, /FAKE|EXAMPLE/i, `${alias}: the alias page shows fake content`);
    for (const e of linksOut(html)) {
      assert.ok(e.startsWith('/api/ares/abyss'), `${alias}: exit escapes the sandbox: ${e}`);
    }
    assert.doesNotMatch(html, /https?:\/\//, `${alias}: no external URLs`);
  }
});

// ---------------------------------------------------------------------------
// Trap routes: every honeypot route funnels through handleTrap with a
// real bait id (or a plain 404 for wp-login, the one original with no
// matching bait id — env and admin serve fake bait too).
// ---------------------------------------------------------------------------
test('trap routes: every honeypot route funnels through handleTrap with a real bait id', () => {
  const dirs = readdirSync('app/api/honeypot', { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(dirs.length >= 20, `expected the doubled trap-route set, found ${dirs.length}`);
  for (const d of dirs) {
    const src = readFileSync(`app/api/honeypot/${d}/route.js`, 'utf8');
    assert.match(src, /handleTrap\(request,/, `${d}: must call handleTrap`);
    const m = src.match(/fakeBaitFor\('([^']+)'\)/);
    if (m) assert.ok(BAIT_IDS.includes(m[1]), `${d}: unknown bait id ${m[1]}`);
  }
});

test('fake bait (all waves): every secret is provably fake, every URL is example.invalid', () => {
  assert.equal(BAIT_IDS.length, 28, 'bait inventory pin: 14 wave 1 + 5 wave 2 server + 9 mobile');
  for (const id of BAIT_IDS) {
    const { body } = fakeBaitFor(id);
    for (const m of body.match(/AKIA[0-9A-Z]+/g) || []) {
      assert.equal(m, AWS_EXAMPLE_ACCESS_KEY, `${id}: non-example AWS key ${m}`);
    }
    assert.doesNotMatch(body, /sk-live/, `${id}: live Stripe key shape`);
    for (const u of body.match(/https?:\/\/[^\s"'<>]+/g) || []) {
      assert.match(u, /example\.invalid/, `${id}: non-example URL ${u}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Mobile third, covered separately: scoring, flavour, inertness, maze.
// ---------------------------------------------------------------------------
test('mobile third: nine mobile bait ids, about a third of the bait set', () => {
  assert.equal(MOBILE_BAIT_IDS.length, 9);
  for (const id of MOBILE_BAIT_IDS) assert.ok(BAIT_IDS.includes(id), `${id} must be a real bait id`);
  assert.ok(MOBILE_BAIT_IDS.length / BAIT_IDS.length > 0.3, 'mobile is about a third of the bait');
  for (const p of MOBILE_PATHS) assert.ok(disallow.includes(p), `robots.txt must list mobile path ${p}`);
});

test('mobile third: every mobile bait path scores 30, and 75 with a scanner UA (the abyss bar)', () => {
  for (const p of MOBILE_PATHS) {
    const plain = scoreRequest({ ...REAL_BROWSER, path: p });
    assert.equal(plain.score, 30, `${p} should score 30, got ${plain.score}`);
    const withScanner = scoreRequest({ ...REAL_BROWSER, userAgent: SCANNER_UA, path: p });
    assert.equal(withScanner.score, 75, `${p} + scanner UA should score 75, got ${withScanner.score}`);
    assert.equal(withScanner.isBot, true);
    assert.equal(isExtraMalicious({ score: withScanner.score, strikes: 0 }), true,
      `${p} + scanner UA crosses into the abyss tier`);
  }
  // A real phone on a mobile bait path scores the path but stays under
  // the bot bar: humans are observed, not blocked.
  const human = scoreRequest({ ...REAL_BROWSER, path: '/api/mobile/v1/auth' });
  assert.equal(human.score, 30);
  assert.equal(human.isBot, false);
});

test('mobile third: mobile flavours exist where worker A built them', () => {
  const std = fakeBaitFor('config-json');
  const mob = fakeBaitFor('config-json', { mobile: true });
  assert.notEqual(mob.body, std.body, 'mobile config differs from the web-server config');
  assert.match(mob.body, /mobile/i);
  assert.match(fakeBaitFor('api-keys', { mobile: true }).body, /FAKE MOBILE SDK KEYS/);
  assert.match(fakeBaitFor('env', { mobile: true }).body, /mobile backend env/);
  assert.equal(
    isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'),
    true,
  );
  assert.equal(isMobileUserAgent(REAL_BROWSER.userAgent), true, 'iPhone Safari is a mobile UA');
  assert.equal(
    isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'),
    false,
  );
});

test('mobile third: the fake mobile content is inert — fake numbers, fake OTP, fake binaries, no real files', () => {
  // OTP: the only code is 000000, and it says so itself.
  const otp = JSON.parse(fakeBaitFor('otp-verify').body);
  assert.equal(otp.otp, '000000');
  assert.match(otp.warning, /never verifies a real account/);
  // SMS: addressed to an all-zero number, and nothing was sent.
  const sms = JSON.parse(fakeBaitFor('sms-send').body);
  assert.equal(sms.to, '+00-000-000-0000');
  assert.match(sms.body, /NO SMS WAS SENT/);
  // APK/IPA: text stubs that name themselves fake; no binary payload.
  assert.match(fakeBaitFor('apk-download').body, /FAKE APK/);
  assert.match(fakeBaitFor('apk-download').body, /NO BINARY PAYLOAD/);
  assert.match(fakeBaitFor('ipa-download').body, /FAKE IPA PLIST/);
  assert.match(fakeBaitFor('ipa-download').body, /NO BINARY PAYLOAD/);
  assert.match(fakeBaitFor('releases-apk').body, /sha256: 0{64}/);
  // No phone-like string anywhere in the mobile bait is callable: every
  // number is all zeros (or the fictional 555 range).
  for (const id of MOBILE_BAIT_IDS) {
    const body = fakeBaitFor(id).body;
    for (const m of body.match(/\+[\d\s().-]{7,}/g) || []) {
      assert.ok(/^\+0[\d\s().-]*$/.test(m) || m.includes('555'), `${id}: callable-looking number ${m}`);
    }
  }
  // And no real installable file exists on disk for any of it.
  assert.equal(publicFiles().filter((f) => /\.(apk|ipa)$/i.test(f)).length, 0,
    'no real .apk/.ipa under public/');
  // The APK trap route serves the fake stub, not a file.
  const apkRoute = readFileSync('app/api/honeypot/apk/route.js', 'utf8');
  assert.match(apkRoute, /fakeBaitFor\('apk-download'\)/);
  assert.doesNotMatch(apkRoute, /readFile|createReadStream|sendFile/);
  // The mobile admin form posts nowhere.
  assert.match(fakeBaitFor('mobile-admin').body, /<form action="#" method="post">/);
});

test('mobile third: mobile maze pages stay inside the sandbox and carry only fake contact details', () => {
  const mobilePages = mazePages().filter((p) => p.mobile);
  assert.equal(mobilePages.length, 8, 'eight mobile-themed maze pages');
  assert.ok(mobilePages.length / mazePages().length > 0.25
    && mobilePages.length / mazePages().length < 0.4,
  'mobile is about a third of the maze');
  for (const page of mobilePages) {
    const html = abyssPageHtml(page.slug);
    const exits = linksOut(html);
    assert.ok(exits.length > 0, `${page.slug}: has exits to check`);
    for (const e of exits) {
      assert.ok(e.startsWith('/api/ares/abyss'), `${page.slug}: exit escapes the sandbox: ${e}`);
    }
    assert.doesNotMatch(html, /https?:\/\//, `${page.slug}: no external URLs in the mobile maze`);
    // No phone-like string is callable: 555 fictional numbers or all zeros.
    for (const m of html.match(/\+[\d\s().-]{7,}/g) || []) {
      assert.ok(m.includes('555') || /^\+0[\d\s().-]*$/.test(m),
        `${page.slug}: callable-looking number ${m}`);
    }
    // No download link ever leaves the maze for a real file.
    for (const e of exits) {
      assert.ok(!/\.apk$/i.test(e) && !/\.ipa$/i.test(e), `${page.slug}: download link escapes: ${e}`);
    }
  }
  // The OTP gateway page is the one that names numbers and codes: the
  // numbers are 555 fictional, the code is 000000, in either bait body
  // (built-in fallback or worker A's fake-bait.js).
  const otpHtml = abyssPageHtml('otp-gateway');
  assert.match(otpHtml, /000000/, 'otp-gateway: the only code is 000000');
  assert.match(otpHtml, /\+1-555-01\d\d|\+00-000-000-0000/, 'otp-gateway: only fictional numbers');
});

test('mobile third: the live async render serves worker A bait inside the maze', async () => {
  const html = await abyssPageHtmlAsync('otp-gateway');
  assert.match(html, /000000/, 'async otp-gateway: the only code is 000000');
  for (const e of linksOut(html)) {
    assert.ok(e.startsWith('/api/ares/abyss'), `async otp-gateway exit escapes: ${e}`);
  }
  const mobile = await abyssPageHtmlAsync('mobile-api');
  assert.match(mobile, /Mobile API/);
  for (const e of linksOut(mobile)) {
    assert.ok(e.startsWith('/api/ares/abyss'), `async mobile-api exit escapes: ${e}`);
  }
});
