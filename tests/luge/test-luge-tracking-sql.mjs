// tests/luge/test-luge-tracking-sql.mjs
// Static audit for supabase/luge-tracking-consolidation.sql — the staged
// (NOT RUN) migration that guarantees the schema the luge API routes expect.
// Run: node tests/luge/test-luge-tracking-sql.mjs (from the repo root).
// No browser, no network, no database.
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const sql = readFileSync(new URL('../../supabase/luge-tracking-consolidation.sql', import.meta.url), 'utf8');
const lower = sql.toLowerCase();

// --- every table the routes touch is created, idempotently ---
for (const table of [
  'luge_inventory',
  'luge_stripe_events',
  'luge_redemptions',
  'luge_course_completions',
  'luge_race_beacons',
  'luge_leaderboard',
]) {
  t(`creates ${table} if not exists`, lower.includes(`create table if not exists public.${table}`));
}

// --- the completions primary key the /complete upsert depends on ---
t('guards the (user_id, course_id) primary key add', lower.includes('add constraint luge_course_completions_pkey primary key (user_id, course_id)'));
t('the key add only runs when the table has no primary key', lower.includes("contype = 'p'"));
t('warns instead of dropping a different live key', lower.includes('still needs a manual look'));

// --- columns the routes write ---
t('completions carries run_seconds', lower.includes('run_seconds numeric'));
t('redemptions carry the reward columns', lower.includes("add column if not exists reward"));

// --- RLS: no client writes, owners read their own rows, board is public ---
for (const table of [
  'luge_inventory',
  'luge_stripe_events',
  'luge_redemptions',
  'luge_course_completions',
  'luge_race_beacons',
  'luge_leaderboard',
]) {
  t(`RLS enabled on ${table}`, lower.includes(`alter table public.${table} enable row level security`));
}
t('completions owner-read policy', lower.includes('luge_course_completions_owner_read'));
t('leaderboard public-read policy', lower.includes('luge_leaderboard_public_read'));

// --- safety: idempotent, non-destructive, gated ---
const creates = lower.match(/create table\s+(if not exists\s+)?public\./g) || [];
t('every CREATE TABLE is IF NOT EXISTS', creates.every((c) => c.includes('if not exists')));
t('no DROP TABLE', !lower.includes('drop table'));
t('no TRUNCATE', !lower.includes('truncate'));
t('no DELETE FROM (no rows are ever removed)', !lower.includes('delete from'));
t('no backfill inserts (only runs from deployment forward count)', !lower.includes('insert into public.luge_course_completions'));
t('says plainly it needs the green light before running', lower.includes("do not run without merlin's green light"));

console.log(`luge-tracking-sql: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
