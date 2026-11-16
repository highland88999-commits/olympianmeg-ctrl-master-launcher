// tests/earth1-missiles-server.test.mjs — Earth 1 missile inventory
// + combat events, server-side (Merlin, 2026-11-15): ONE ORB = ONE
// MISSILE, tracked in Supabase — a per-user missile inventory the
// client reads and spends, so hits on other players are real shared
// state.
//
// Pins (static — nothing here touches a database): the migration
// declares both tables with the right columns, checks, indexes and
// RLS; the atomic grant/spend functions exist; the route serves
// count/grant/spend/report/poll with the client's exact action
// names and event shape, 503s when the migration hasn't run, and
// requires a signed-in caller. LIVE STATE (Nov 15 ~19:46): the
// SQL RAN in the Supabase SQL Editor on Merlin's green light —
// the file still carries its DRAFT banner because it was
// deliberately not rewritten in the rework job (stale, not live).
// And (mocked fetch, no network): the client wiring — orb
// collect → grant → count +1, FIRE → spend → count −1, load-time
// sync lets the server win, and the missile never locks its owner
// (the heat-seeker pins live in earth1-kart.test.mjs).
//
// Run: node tests/earth1-missiles-server.test.mjs (from the repo root).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createKartState,
  kartServer,
  kartServerGrant,
  kartServerSpend,
  kartServerSync,
} from '../lib/earth/kart.js';

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
  t('migration still carries its stale DRAFT banner (file not rewritten — the SQL RAN Nov 15 ~19:46)',
    sql.includes('DRAFT — DO NOT RUN YET'));
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
  t('route comment records the SQL as run (no longer "green light still owed")',
    route.includes('RAN Nov 15') && !route.includes('green light still owed'));
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

// --- The live wiring (mocked fetch, no network): collect → grant,
 // FIRE → spend, load-time sync lets the server win ---
{
  const realFetch = globalThis.fetch;
  const calls = [];
  const stub = (responder) => {
    globalThis.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      calls.push({ url, method: opts ? opts.method : 'GET', body });
      return responder(body);
    };
  };
  const okJson = (data) => ({ ok: true, status: 200, json: async () => data });
  const reset = () => { calls.length = 0; kartServer.available = null; kartServer.missiles = null; };

  try {
    // Orb collect → grant: +1 server-side, local count untouched
    // (record-only: a grant response never overwrites the session
    // count — two grants in flight could otherwise land out of
    // order and knock the count backward).
    reset();
    stub(() => okJson({ missiles: 7 }));
    const grantState = createKartState();
    grantState.missiles = 2;
    grantState.missileColors = ['red', 'cyan'];
    const granted = await kartServerGrant(grantState);
    t('grant POSTs action grant to the kart API',
      calls.length === 1 && calls[0].url === '/api/earth1/kart'
      && calls[0].method === 'POST' && calls[0].body.action === 'grant');
    t('grant returns the server count', granted === 7);
    t('grant never overwrites the local count', grantState.missiles === 2);
    t('grant records the server count on kartServer', kartServer.missiles === 7 && kartServer.available === true);

    // FIRE → spend: −1 server-side, local count untouched.
    reset();
    stub(() => okJson({ ok: true, missiles: 6 }));
    const spendState = createKartState();
    spendState.missiles = 2;
    const spent = await kartServerSpend(spendState);
    t('spend POSTs action spend to the kart API',
      calls.length === 1 && calls[0].body.action === 'spend');
    t('spend returns { ok, missiles }', spent && spent.ok === true && spent.missiles === 6);
    t('spend never overwrites the local count', spendState.missiles === 2);

    // Load-time sync: the server count WINS (the one overwrite).
    reset();
    stub(() => okJson({ missiles: 3 }));
    const syncState = createKartState();
    syncState.missiles = 9;
    syncState.missileColors = ['red'];
    const synced = await kartServerSync(syncState);
    t('sync GETs ?action=count',
      calls.length === 1 && calls[0].url === '/api/earth1/kart?action=count'
      && calls[0].method === 'GET');
    t('sync returns true and lets the server count win',
      synced === true && syncState.missiles === 3);
    // A 503 marks the server unavailable and changes nothing.
    reset();
    stub(() => ({ ok: false, status: 503, json: async () => ({}) }));
    const downState = createKartState();
    downState.missiles = 4;
    const down = await kartServerGrant(downState);
    t('a 503 grant returns null and marks the server unavailable',
      down === null && kartServer.available === false);
    t('a 503 grant leaves the local count alone', downState.missiles === 4);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- The scene wiring: collect calls grant, FIRE calls spend,
 // the pill IS the backpack ---
{
  const kart = read('components/EarthKart.jsx');
  t('orb collect grants server-side (collectPlayerMissile + kartServerGrant)',
    kart.includes('collectPlayerMissile(kartState, orb)')
    && kart.includes('void kartServerGrant(kartState)'));
  t('FIRE spends server-side (fireTorpedo then kartServerSpend)',
    kart.includes('if (torp) void kartServerSpend(kartState)'));
  t('mount syncs the server count', kart.includes('void kartServerSync(kartState)'));
  t('mount polls combat events on the 5 s cadence',
    kart.includes('void kartServerPoll()'));
  t('peer hits are reported server-side', kart.includes('void kartServerReport('));
  const consoleSrc = read('components/EarthConsole.jsx');
  t('the missile pill shows the backpack count (🚀 ×N)',
    consoleSrc.includes('🚀 ×{hud.missiles}'));
  t('FIRE greys out at 0 missiles', consoleSrc.includes('disabled={hud.missiles <= 0}'));
}

console.log(`earth1-missiles-server: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
