// ARES allowlist: registered users, account bans, attack sources.
//
// TARPIT ON (Merlin opt-in, Nov 27, 2026 — "Green light means yes.
// And turn it on."): the abyss trap runs live again — the middleware
// rewrites trapped sources into it and traps extra-malicious bots,
// and the honeypot branches extra-malicious trap visitors into it.
// The pure tarpit helpers (isExtraMalicious, abyssPageHtml) still
// exist in lib/ares/tarpit.js and are still tested below, and now
// live code calls them too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isExtraMalicious, abyssPageHtml, ABYSS_THRESHOLD } from '../lib/ares/tarpit.js';

test('abyss bar: scanner-UA-on-scanner-path qualifies; ordinary bots do not', () => {
  assert.equal(ABYSS_THRESHOLD, 75);
  assert.equal(isExtraMalicious({ score: 75, strikes: 0 }), true);
  assert.equal(isExtraMalicious({ score: 74, strikes: 0 }), false);
  assert.equal(isExtraMalicious({ score: 45, strikes: 3 }), true);
  assert.equal(isExtraMalicious({ score: 39, strikes: 5 }), false);
  assert.equal(isExtraMalicious({ score: 0, strikes: 0 }), false);
});

test('abyss page is a closed sandbox: every exit stays inside it, no real data', () => {
  const html = abyssPageHtml();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) assert.ok(href.startsWith('/api/ares/abyss'), href);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /olympusverse/);
});

test('allowlist SQL: user bans, trapped, attack sources, RLS, green-light header', () => {
  const sql = readFileSync('supabase/ares-allowlist.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.ares_user_bans/);
  assert.match(sql, /create table if not exists public\.ares_trapped/);
  assert.match(sql, /create table if not exists public\.ares_attack_sources/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /AWAITS MERLIN'S EXPLICIT GREEN LIGHT/);
});

test('users route lists registered accounts; user-bans route refuses the keeper', () => {
  const users = readFileSync('app/api/ares/users/route.js', 'utf8');
  assert.match(users, /listUsers/);
  assert.match(users, /isOwnerEmail/);
  assert.match(users, /ares_user_bans/);
  const bans = readFileSync('app/api/ares/user-bans/route.js', 'utf8');
  assert.match(bans, /the keeper cannot be banned/);
  assert.match(bans, /upsert/);
  assert.match(bans, /isOwnerEmail/);
});

test('middleware traps extra-malicious bots in the abyss — and keeps verdicts per IP', () => {
  // TARPIT ON (Merlin opt-in, Nov 27, 2026): a trapped source is
  // rewritten into the abyss, and an extra-malicious score traps the
  // source (via the internal trap route) instead of the plain 403.
  const mw = readFileSync('middleware.ts', 'utf8');
  assert.match(mw, /trap-check/);
  assert.match(mw, /api\/ares\/abyss/);
  assert.match(mw, /api\/ares\/trap/);
  assert.match(mw, /isTrappedSource/);
  assert.match(mw, /trapExtraMalicious/);
  assert.match(mw, /NextResponse\.rewrite/);
  assert.match(mw, /checkCache/);
  assert.doesNotMatch(mw, /let banCache/);
  // The trapped check runs before scoring, so a trapped source never
  // gets a 403 for a score it already earned the sandbox with.
  assert.ok(mw.indexOf('isTrappedSource(req, ip)') > -1, 'middleware checks the trap list');
  assert.ok(mw.indexOf('isTrappedSource(req, ip)') < mw.indexOf('scoreRequest('),
    'trapped check before scoring');
});

test('honeypot has an extra-malicious tier — a trap visitor crossing the abyss bar is trapped and served the maze', () => {
  const hp = readFileSync('lib/ares/honeypot.js', 'utf8');
  assert.match(hp, /isExtraMalicious/);
  assert.match(hp, /abyssResponse/);
  assert.match(hp, /trapAttackSource/);
  assert.match(hp, /recordAttackSource/);
  assert.match(hp, /Not found/);
  // The tier lives inside the not-friendly branch, after logging and
  // before the fake content — an extra-malicious visitor never gets
  // bait or a plain 404, it gets the maze.
  const friendlyAt = hp.indexOf('if (!friendly)');
  assert.ok(friendlyAt > -1, 'handleTrap guards on !friendly');
  assert.ok(hp.indexOf('isExtraMalicious({') > friendlyAt, 'tier inside the not-friendly branch');
  assert.ok(hp.indexOf('abyssResponse(') > hp.indexOf('await logEvent('), 'logged before trapping');
  assert.ok(hp.indexOf('abyssResponse(') < hp.indexOf('if (options.fakeContent)'),
    'maze before fake content');
});

test('banned accounts are refused by every API route; console shows users + sources', () => {
  const auth = readFileSync('lib/economy/auth.js', 'utf8');
  assert.match(auth, /isUserBanned/);
  assert.match(auth, /This account is banned/);
  const page = readFileSync('app/ares/page.jsx', 'utf8');
  assert.match(page, /UsersManager/);
  assert.match(page, /AttackSources/);
  assert.match(page, /\/api\/ares\/users/);
  assert.match(page, /\/api\/ares\/trapped/);
  const users = readFileSync('components/ares/UsersManager.jsx', 'utf8');
  assert.match(users, /Ban/);
  assert.match(users, /automatically/);
  const sources = readFileSync('components/ares/AttackSources.jsx', 'utf8');
  assert.match(sources, /Release/);
  assert.match(sources, /abyss/);
});
