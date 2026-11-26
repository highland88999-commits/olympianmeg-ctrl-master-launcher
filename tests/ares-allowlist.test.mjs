// ARES allowlist: registered users, account bans, attack sources.
//
// PHASE 1 CHANGE (2026-11-25, standing law — tarpit OFF): the abyss
// trap no longer runs live — the middleware never rewrites into it and
// the honeypot never branches into it. The pure tarpit helpers
// (isExtraMalicious, abyssPageHtml) still exist in lib/ares/tarpit.js
// and are still tested below, but nothing live calls them.
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

test('middleware never traps bots in the abyss — and keeps verdicts per IP', () => {
  // TARPIT OFF (Phase 1, standing law): no trap-check call, no abyss
  // rewrite, no score>=75 tier. Extra-malicious bots get the same
  // plain 403 as any other bot.
  const mw = readFileSync('middleware.ts', 'utf8');
  assert.doesNotMatch(mw, /trap-check/);
  assert.doesNotMatch(mw, /api\/ares\/abyss/);
  assert.doesNotMatch(mw, /score >= 75/);
  assert.match(mw, /checkCache/);
  assert.doesNotMatch(mw, /let banCache/);
});

test('honeypot has no extra-malicious tier — every trap visitor gets fake content or a plain 404', () => {
  const hp = readFileSync('lib/ares/honeypot.js', 'utf8');
  assert.doesNotMatch(hp, /isExtraMalicious/);
  assert.doesNotMatch(hp, /abyssResponse/);
  assert.doesNotMatch(hp, /trapAttackSource/);
  assert.doesNotMatch(hp, /recordAttackSource/);
  assert.match(hp, /Not found/);
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
