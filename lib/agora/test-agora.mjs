// lib/agora/test-agora.mjs
// Headless tests for AGORA pure logic + SQL safety checks.
// Run: node lib/agora/test-agora.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORIES, CATEGORY_IDS, isValidCategory, categoryName } from './categories.js';
import { validatePost, validateComment, validateProfile, sanitizeText, LIMITS } from './validation.js';
import { timeAgo, displayNameOf, pageOffset, PAGE_SIZE } from './format.js';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

// ------------------------------------------------------------ categories
test('six categories, no marketplace', () => {
  assertEq(CATEGORIES.length, 6, 'category count');
  assert(!CATEGORY_IDS.includes('marketplace'), 'marketplace must be gone');
  assert(!CATEGORIES.some((c) => /marketplace/i.test(c.name)), 'no marketplace name');
});

test('category ids are unique', () => {
  assertEq(new Set(CATEGORY_IDS).size, CATEGORY_IDS.length, 'unique ids');
});

test('isValidCategory accepts known, rejects unknown', () => {
  assert(isValidCategory('civic'), 'civic valid');
  assert(!isValidCategory('marketplace'), 'marketplace invalid');
  assert(!isValidCategory(''), 'empty invalid');
  assert(!isValidCategory('CIVIC'), 'case-sensitive');
});

test('categoryName falls back to General', () => {
  assertEq(categoryName('cosmos'), 'The Cosmos', 'known name');
  assertEq(categoryName('bogus'), 'General', 'fallback');
});

test('every category has a plain-English blurb', () => {
  for (const c of CATEGORIES) {
    assert(c.blurb && c.blurb.length > 10, `blurb for ${c.id}`);
    assert(!/matrix|uplink|protocol|designation/i.test(c.blurb), `no jargon in ${c.id}`);
  }
});

// ------------------------------------------------------------ validation
test('validatePost accepts a good post', () => {
  assertEq(validatePost({ title: 'Hello world', body: 'Some thoughts here.', category: 'civic' }), null, 'valid');
});

test('validatePost rejects short title', () => {
  assert(validatePost({ title: 'Hi', body: 'Body is fine.', category: 'civic' }) !== null, 'short title');
});

test('validatePost rejects long title', () => {
  assert(validatePost({ title: 'x'.repeat(LIMITS.titleMax + 1), body: 'ok', category: 'civic' }) !== null, 'long title');
});

test('validatePost rejects empty body', () => {
  assert(validatePost({ title: 'Good title here', body: '   ', category: 'civic' }) !== null, 'empty body');
});

test('validatePost rejects long body', () => {
  assert(validatePost({ title: 'Good title here', body: 'x'.repeat(LIMITS.bodyMax + 1), category: 'civic' }) !== null, 'long body');
});

test('validatePost rejects bad category', () => {
  assert(validatePost({ title: 'Good title here', body: 'Body.', category: 'marketplace' }) !== null, 'bad category');
});

test('validateComment accepts and rejects', () => {
  assertEq(validateComment({ body: 'Nice post!' }), null, 'valid comment');
  assert(validateComment({ body: '' }) !== null, 'empty comment');
  assert(validateComment({ body: 'x'.repeat(LIMITS.commentMax + 1) }) !== null, 'long comment');
});

test('validateProfile accepts good profile', () => {
  assertEq(validateProfile({ displayName: 'Merlin', bio: 'Builder of worlds.' }), null, 'valid profile');
  assertEq(validateProfile({ displayName: 'Merlin', bio: '' }), null, 'empty bio ok');
});

test('validateProfile rejects bad names', () => {
  assert(validateProfile({ displayName: 'x', bio: '' }) !== null, 'too short');
  assert(validateProfile({ displayName: 'x'.repeat(LIMITS.nameMax + 1), bio: '' }) !== null, 'too long');
  assert(validateProfile({ displayName: '<script>alert(1)</script>', bio: '' }) !== null, 'html injection');
  assert(validateProfile({ displayName: 'ok; DROP TABLE', bio: '' }) !== null, 'sql-ish chars');
});

test('validateProfile rejects long bio', () => {
  assert(validateProfile({ displayName: 'Merlin', bio: 'x'.repeat(LIMITS.bioMax + 1) }) !== null, 'long bio');
});

test('sanitizeText trims and caps', () => {
  assertEq(sanitizeText('  hi  ', 10), 'hi', 'trims');
  assertEq(sanitizeText('x'.repeat(50), 10).length, 10, 'caps');
  assertEq(sanitizeText(null, 10), '', 'null-safe');
});

// --------------------------------------------------------------- format
test('timeAgo buckets', () => {
  const now = Date.now();
  assertEq(timeAgo(new Date(now - 10_000).toISOString()), 'just now', 'seconds');
  assertEq(timeAgo(new Date(now - 5 * 60_000).toISOString()), '5m ago', 'minutes');
  assertEq(timeAgo(new Date(now - 3 * 3_600_000).toISOString()), '3h ago', 'hours');
  assertEq(timeAgo(new Date(now - 9 * 86_400_000).toISOString()), '9d ago', 'days');
  assertEq(timeAgo('not-a-date'), '', 'invalid date');
});

test('displayNameOf falls back', () => {
  assertEq(displayNameOf({ display_name: 'Nova' }), 'Nova', 'uses name');
  assertEq(displayNameOf(null), 'Someone', 'null profile');
  assertEq(displayNameOf({ display_name: '   ' }), 'Someone', 'blank name');
  assertEq(displayNameOf(null, 'Traveler'), 'Traveler', 'custom fallback');
});

test('pageOffset math', () => {
  assertEq(pageOffset(1), 0, 'page 1');
  assertEq(pageOffset(2), PAGE_SIZE, 'page 2');
  assertEq(pageOffset(0), 0, 'page 0 clamps');
  assertEq(pageOffset(-5), 0, 'negative clamps');
});

// ------------------------------------------------------------------ SQL
const sql = readFileSync(join(here, '..', '..', 'supabase', 'agora.sql'), 'utf8');

test('SQL creates four scoped tables', () => {
  for (const t of ['agora_profiles', 'agora_posts', 'agora_comments', 'agora_likes']) {
    assert(sql.includes(`create table if not exists public.${t}`), `table ${t}`);
  }
});

test('SQL enables RLS on every table', () => {
  const matches = sql.match(/alter table public\.agora_\w+ enable row level security/g) || [];
  assert(matches.length >= 4, `RLS on all tables (found ${matches.length})`);
});

test('SQL has no open write policy (no using(true) hole on writes)', () => {
  // Public reads (for select using (true)) are intentional. Flag only
  // insert/update/delete/all policies with an open check.
  const writePolicies = [...sql.matchAll(/create policy "([^"]+)"\s+on public\.(\w+) for (insert|update|delete|all)[\s\S]*?;/gi)];
  assert(writePolicies.length > 0, 'write policies exist to check');
  for (const m of writePolicies) {
    assert(!/using\s*\(\s*true\s*\)/i.test(m[0]), `open USING in ${m[1]}`);
    assert(!/with check\s*\(\s*true\s*\)/i.test(m[0]), `open WITH CHECK in ${m[1]}`);
  }
});

test('SQL writes are owner-scoped', () => {
  const ownerChecks = sql.match(/auth\.uid\(\) = user_id/g) || [];
  assert(ownerChecks.length >= 6, `owner checks present (${ownerChecks.length})`);
});

test('SQL counters use triggers, not client writes', () => {
  assert(sql.includes('agora_bump_counters'), 'trigger function');
  assert(sql.includes('after insert or delete on public.agora_likes'), 'likes trigger');
  assert(sql.includes('after insert or delete on public.agora_comments'), 'comments trigger');
});

test('SQL references auth.users for identity', () => {
  assert(sql.includes('references auth.users(id)'), 'auth.users FK');
});

test('SQL drops policies before creating (idempotent)', () => {
  const drops = (sql.match(/drop policy if exists/g) || []).length;
  const creates = (sql.match(/create policy/g) || []).length;
  assert(drops >= creates, `drops (${drops}) cover creates (${creates})`);
  const dropTriggers = (sql.match(/drop trigger if exists/g) || []).length;
  assert(dropTriggers >= 2, 'trigger drops');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
