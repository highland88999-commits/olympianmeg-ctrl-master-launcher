// tests/earth1-missiles-server.test.mjs — Earth 1 missile inventory
// + combat events, server-side (Merlin, 2026-11-15): ONE ORB = ONE
// MISSILE, tracked in Supabase — a per-user missile inventory the
// client reads and spends, so hits on other players are real shared
// state.
//
// Pins (static — the SQL is DRAFT and NOT run without Merlin's
// green light, so nothing here touches a database): the migration
// declares both tables with the right columns, checks, indexes and
// RLS; the atomic grant/spend functions exist; the route serves
// count/grant/spend/report/poll with the client's exact action
// names and event shape, 503s when the migration hasn't run, and
// requires a signed-in caller.
//
// Run: node tests/earth1-missiles-server.test.mjs (from the repo root).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The migration: tables, columns, checks, indexes, RLS ---
{
  const sql = read('supabase/earth1-kart.sql');
  t('migration is marked DRAFT — do not run', sql.includes('DRAFT — DO NOT RUN YET'));
  t('migration names the green-light gate', sql.includes("green light"));
  t('migration declares earth1_missiles', sql.includes('create table if not exists public.earth1_missiles'));
  t('missiles table keys on user_id', sql.includes('user_id text primary key'));
  t('missiles table carries the count', sql.includes('missiles integer not null default 0'));
  t('missiles count never goes negative', sql.includes('check (missiles >= 0)'));
  t('migration declares earth1_combat_events', sql.includes('create table if not exists public.earth1_combat_events'));
  t('events carry actor + target', sql.includes('actor_id text not null') && sql.includes('target_id text not null'));
  t('events check kind is torpedo or collision', sql.includes("check (kind in ('torpedo', 'collision'))"));
  t('events carry damage + lat/lon + nonce', sql.includes('damage integer') && sql.includes('lat double precision') && sql.includes('nonce text'));
  t('events index target + recency (the poll)', sql.includes('earth1_combat_events_target_created_idx'));
  t('missiles table has RLS', sql.includes('alter table public.earth1_missiles enable row level security'));
  t('events table has RLS', sql.includes('alter table public.earth1_combat_events enable row level security'));
  t('missiles policy: own row only', sql.includes('auth.uid()::text = user_id'));
  t('events policy: insert as yourself', sql.includes('auth.uid()::text = actor_id'));
  t('atomic grant function exists', sql.includes('earth1_grant_missile'));
  t('atomic spend function exists', sql.includes('earth1_spend_missile'));
  t('grant is +1 on conflict (no lost grants)', sql.includes('missiles + 1'));
  t('spend decrements only when > 0', sql.includes('missiles > 0'));
}

// --- The route: actions, shapes, 503 + auth ---
{
  const route = read('app/api/earth1/kart/route.js');
  t('route is nodejs + force-dynamic', route.includes("runtime = 'nodejs'") && route.includes("dynamic = 'force-dynamic'"));
  t('route requires a signed-in caller', route.includes('getUserFromRequest'));
  t('route uses the service client', route.includes('getServiceClient'));
  t('route 503s when the migration has not run', route.includes('setupRequired') && route.includes('503'));
  t('route maps a missing table to 503', route.includes("42P01"));
  t('route serves the count', route.includes("action === 'grant'") && route.includes("GET"));
  t('route serves grant', route.includes("action === 'grant'"));
  t('route serves spend', route.includes("action === 'spend'"));
  t('route serves report', route.includes("action === 'report'"));
  t('route serves poll (fall-through after grant/spend/report)',
    route.includes('POLL_WINDOW_S') && route.includes(".from('earth1_combat_events')") && route.includes('events:'));
  t('route rejects unknown actions', route.includes('Unknown action'));
  t('route grants via the atomic function', route.includes("rpc('earth1_grant_missile'"));
  t('route spends via the atomic function', route.includes("rpc('earth1_spend_missile'"));
  t('route validates the report kind', route.includes("['torpedo', 'collision'].includes(kind)"));
  t('route polls the last 30 s', route.includes('POLL_WINDOW_S = 30'));
  t('route maps poll rows to the client camelCase shape',
    route.includes('targetId: r.target_id') && route.includes('actorId: r.actor_id'));
}

// --- The client contract: kart.js posts the route's action names ---
{
  const kart = read('lib/earth/kart.js');
  t('client grants with action grant', kart.includes("action: 'grant'"));
  t('client spends with action spend', kart.includes("action: 'spend'"));
  t('client reports with action report', kart.includes("action: 'report'"));
  t('client polls with action poll', kart.includes("action: 'poll'"));
  t('client syncs the count from ?action=count', kart.includes('?action=count'));
  t('client never overwrites the local count from a grant response',
    kart.includes('a grant response never overwrites it'));
  t('client polls on a 5 s cadence', kart.includes('KART_SERVER_POLL_MS = 5000'));
}

console.log(`earth1-missiles-server: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
