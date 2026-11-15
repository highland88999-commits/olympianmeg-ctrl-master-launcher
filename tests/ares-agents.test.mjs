// tests/ares-agents.test.mjs — the ARES hive console: GET /api/ares/agents
// and the Hive panel + self-terminate visibility in the events feed.
// Run: node --test tests/ares-agents.test.mjs (from the repo root).
// No browser, no live database — the route is node-importable (relative
// imports, global Response), auth is exercised through a stubbed fetch
// against a dummy Supabase URL, and the hive is the real host module
// (lib/ares/hive.js) plus a stubbed snapshot for the shape tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GET } from '../app/api/ares/agents/route.js';
import { buildHiveStatus, loadHiveSnapshot, readAgentsDirect } from '../lib/ares/hive-status.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const OWNER = 'olympiannexus@gmail.com';

// --- stubbed Supabase Auth: getUser answers from the stub, never the network ---
const realFetch = globalThis.fetch;
function stubAuthUser(email) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dummy.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy-anon-key';
  globalThis.fetch = async (url) => {
    assert.ok(String(url).startsWith('https://dummy.supabase.co/auth/v1/user'),
      `auth call went somewhere unexpected: ${url}`);
    return new Response(JSON.stringify({
      id: '00000000-0000-0000-0000-000000000001',
      email,
      aud: 'authenticated',
      role: 'authenticated',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
test.after(() => { globalThis.fetch = realFetch; });

const req = (headers = {}) => new Request('http://localhost/api/ares/agents', { headers });

// --- the route: owner lock, live ---
test('agents route: 401 without a session', async () => {
  const res = await GET(req());
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'sign in required');
});

test('agents route: 403 for a signed-in non-owner', async () => {
  stubAuthUser('someone@else.com');
  const res = await GET(req({ authorization: 'Bearer dummy-token' }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, 'restricted to the throne');
});

test('agents route: 200 shape for the owner on a cold instance', async () => {
  stubAuthUser(OWNER);
  const res = await GET(req({ authorization: 'Bearer dummy-token' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  // Three field agents, in registry order, all alive on a cold instance.
  assert.equal(body.agents.length, 3);
  assert.deepEqual(body.agents.map((a) => a.id), ['sentinel', 'phalanx', 'dreadnought']);
  for (const agent of body.agents) {
    assert.equal(agent.alive, true);
    assert.equal(agent.scorer, 'heuristic-v0');
    assert.equal(agent.scoresProcessed, 0);
    assert.ok(typeof agent.name === 'string' && agent.name.length > 0);
    assert.ok(typeof agent.role === 'string' && agent.role.length > 0);
  }
  // Hub weights are the fusion weights from agents.js — never invented.
  assert.deepEqual(body.hub.weights, { sentinel: 0.4, phalanx: 0.35, dreadnought: 0.25 });
  // Cold instance, honestly: armed but idle, no fused score dressed up.
  assert.equal(body.everScored, false);
  assert.equal(body.status, 'armed-idle');
  assert.equal(body.hub.score, null);
  assert.equal(body.hub.label, 'Idle');
  // No report on record (no DB configured in this test process).
  assert.equal(body.lastSelfTerminate, null);
  // The live host served this — not the fallback.
  assert.equal(body.source, 'hive-host');
});

// --- the shape builder: stubbed hive snapshot, incl. a terminated agent ---
test('buildHiveStatus: stubbed snapshot with a terminated agent and a report', () => {
  const stub = {
    agents: [
      { id: 'sentinel', name: 'Sentinel', alive: true, scorer: 'heuristic-v0', scoresProcessed: 12 },
      { id: 'phalanx', name: 'Phalanx', alive: true, scorer: 'heuristic-v0', scoresProcessed: 12 },
      { id: 'dreadnought', name: 'Dreadnought', terminated: true, scorer: 'heuristic-v0', scoresProcessed: 3 },
    ],
    hub: { score: 82, label: 'Severe', reasons: ['repeat offender'], action: 'block', strongestAgent: 'dreadnought' },
    lastSelfTerminate: {
      agent: 'Dreadnought', reason: 'cage-detected',
      signals: ['unexpected-host', 'scorer-tamper'],
      host: 'evil.example.com', at: '2026-11-15T01:00:00.000Z',
    },
    everScored: true,
    source: 'hive-host',
  };
  const out = buildHiveStatus(stub);
  assert.equal(out.status, 'active');
  assert.equal(out.everScored, true);
  assert.equal(out.source, 'hive-host');
  const dead = out.agents.find((a) => a.id === 'dreadnought');
  assert.equal(dead.alive, false);
  assert.equal(dead.scoresProcessed, 3);
  assert.equal(out.hub.score, 82);
  assert.equal(out.hub.label, 'Severe');
  assert.equal(out.hub.strongestAgent, 'dreadnought');
  assert.deepEqual(out.lastSelfTerminate, {
    agent: 'Dreadnought', reason: 'cage-detected',
    signals: ['unexpected-host', 'scorer-tamper'],
    host: 'evil.example.com', at: '2026-11-15T01:00:00.000Z',
  });
});

test('buildHiveStatus: host snapshot without counts fills role and counts from the live agents', () => {
  // Exactly what lib/ares/hive.js hiveStatus() returns: no role, no
  // scoresProcessed, no hub — the console must still show true state.
  const out = buildHiveStatus({
    agents: [
      { id: 'sentinel', name: 'Sentinel', terminated: false, scorer: 'heuristic-v0' },
      { id: 'phalanx', name: 'Phalanx', terminated: false, scorer: 'heuristic-v0' },
      { id: 'dreadnought', name: 'Dreadnought', terminated: false, scorer: 'heuristic-v0' },
    ],
    source: 'hive-host',
  });
  assert.equal(out.agents.length, 3);
  for (const agent of out.agents) {
    assert.ok(agent.role.length > 0, `${agent.id} has a role`);
    assert.equal(agent.alive, true);
    assert.equal(typeof agent.scoresProcessed, 'number');
  }
  assert.equal(out.everScored, false);
  assert.equal(out.status, 'armed-idle');
  assert.equal(out.hub.label, 'Idle');
  assert.equal(out.hub.score, null);
});

test('buildHiveStatus: scored before but no fused reading in the snapshot is not dressed as Idle', () => {
  const out = buildHiveStatus({
    agents: [{ id: 'sentinel', name: 'Sentinel', alive: true, scorer: 'heuristic-v0', scoresProcessed: 5 }],
    everScored: true,
    source: 'hive-host',
  });
  assert.equal(out.status, 'active');
  assert.equal(out.hub.score, null);
  assert.equal(out.hub.label, 'No live reading');
});

test('loadHiveSnapshot: cold instance reads the live host, honestly idle', async () => {
  const snap = await loadHiveSnapshot();
  assert.equal(snap.source, 'hive-host');
  assert.equal(snap.everScored, false);
  assert.equal(snap.status, 'armed-idle');
  assert.deepEqual(snap.agents.map((a) => a.id), ['sentinel', 'phalanx', 'dreadnought']);
  assert.deepEqual(readAgentsDirect().agents.map((a) => a.id), ['sentinel', 'phalanx', 'dreadnought']);
});

// --- the console wires the panel into the same refresh as the feed ---
test('console page polls /api/ares/agents on the same 15s refresh as the feed', async () => {
  const page = await src('../app/ares/page.jsx');
  assert.ok(page.includes("authedFetch('/api/ares/agents')"), 'page fetches the agents endpoint');
  assert.ok(page.includes('setHive(hv)') || page.includes('setHive('), 'poll writes the hive into state');
  assert.ok(page.includes('<HivePanel hive={hive}'), 'page renders the Hive panel');
  assert.ok(page.includes("import HivePanel from '@/components/ares/HivePanel'"), 'panel is imported');
  assert.ok(page.includes('setInterval(tick, 15000)'), 'same 15s tick as the events feed');
});

test('hive panel shows alive/terminated, scorer, counts, hub weights, and the report in plain words', async () => {
  const panel = await src('../components/ares/HivePanel.jsx');
  assert.ok(panel.includes('Alive') && panel.includes('Terminated'), 'alive/terminated badges');
  assert.ok(panel.includes('Scorer:'), 'scorer shown per agent');
  assert.ok(panel.includes('Scores processed:'), 'scores processed shown per agent');
  assert.ok(panel.includes('Fusion weights:'), 'hub weights shown');
  assert.ok(panel.includes('Armed and idle'), 'cold instance says armed and idle');
  assert.ok(panel.includes('terminated itself'), 'report names the terminated agent in plain words');
  assert.ok(panel.includes('Reason:'), 'report shows the reason');
  assert.ok(panel.includes('Signals:'), 'report shows the signals');
  assert.ok(panel.includes('Host:'), 'report shows the host');
  assert.ok(panel.includes('It sent one report home, then ended'), 'report explains the doctrine');
});

// --- the self-terminate report is visible in the events feed ---
test('events feed includes the agent_self_terminate type', async () => {
  const feed = await src('../components/ares/EventsFeed.jsx');
  // No filter anywhere in the feed: every event passed in renders.
  assert.ok(!feed.includes('.filter('), 'feed does not filter event types');
  assert.ok(feed.includes('events.map('), 'feed renders every event it receives');
  assert.ok(feed.includes("agent_self_terminate: 'Agent self-terminated'"), 'the new type has a plain label');
  assert.ok(feed.includes('agent_self_terminate'), 'the new type has a colour entry');
  // The feed row carries who and why — the raw type string alone would not.
  assert.ok(feed.includes("e.event_type === 'agent_self_terminate'"), 'feed shows the report details for this type');
  assert.ok(feed.includes('e.details.agent_name'), 'feed shows the agent name');
  assert.ok(feed.includes('e.details.reason'), 'feed shows the reason');
  // Existing types display exactly as before.
  for (const [type, label] of [
    ['honeypot_hit', 'Honeypot trip'],
    ['scanner_path', 'Scanner probe'],
    ['bot_blocked', 'Bot blocked'],
    ['rate_limited', 'Rate limited'],
    ['blocked_ip_hit', 'Banned visitor retry'],
  ]) {
    assert.ok(feed.includes(`${type}: '${label}'`), `${type} label unchanged`);
  }
});

test('events route has no filter that hides agent_self_terminate', async () => {
  const route = await src('../app/api/ares/events/route.js');
  // The only type filter is the caller's own ?type= — the console fetches
  // without it, so every stored type, including agent_self_terminate, comes back.
  assert.ok(route.includes("searchParams.get('type')"), 'optional ?type= filter only');
  assert.ok(!route.includes('agent_self_terminate'), 'route does not special-case (or exclude) the type');
  const page = await src('../app/ares/page.jsx');
  assert.ok(page.includes("authedFetch('/api/ares/events?limit=100')"), 'console fetches events with no type filter');
});

// --- regression: the hive-host path is live, not dead code ---
// (Audit Nov 15: loadHiveSnapshot once always fell back to
// 'agents-direct' because the lookup missed hive.js's hiveStatus().
// This test scores a real event through the host, then proves the
// snapshot comes from the host with real counts.)
test('loadHiveSnapshot: after a real scored event the host path reports live counts', async () => {
  const hive = await import('../lib/ares/hive.js');
  const { extractFeatures } = await import('../lib/ares/features.js');
  const fp = extractFeatures({ userAgent: 'Nikto/2.1.6', path: '/.env', headers: {} });
  const reading = hive.scoreEvent({ vector: fp.vector, host: 'olympusverse.com' });
  assert.equal(reading.hub.score, 36);
  assert.equal(reading.hub.label, 'Watchful');
  const snap = await loadHiveSnapshot();
  assert.equal(snap.source, 'hive-host');
  assert.equal(snap.status, 'active');
  assert.equal(snap.everScored, true);
  for (const agent of snap.agents) {
    assert.ok(agent.scoresProcessed >= 1, `${agent.id} scored the event`);
    assert.equal(agent.alive, true);
    assert.equal(agent.scorer, 'heuristic-v0');
  }
  // The host snapshot carries no last fused Hub reading, so the panel
  // says so honestly instead of inventing a label from the counts.
  assert.equal(snap.hub.score, null);
  assert.equal(snap.hub.label, 'No live reading');
});

// --- the route itself follows the dashboard lock ---
test('agents route is owner-locked before any status or DB read', async () => {
  const route = await src('../app/api/ares/agents/route.js');
  assert.ok(route.includes("export const runtime = 'nodejs'"), 'nodejs runtime');
  assert.ok(route.includes("dynamic = 'force-dynamic'"), 'force-dynamic');
  assert.ok(route.includes('requireUser(request)'), 'requires a session');
  assert.ok(route.includes('isOwnerEmail(user)'), 'checks the owner');
  assert.ok(route.includes('status: 401'), '401 without a session');
  assert.ok(route.includes('status: 403'), '403 for a non-owner');
  const lockAt = route.indexOf('if (!isOwnerEmail(user))');
  const statusAt = route.indexOf('loadHiveSnapshot()');
  const queryAt = route.indexOf('.from(');
  assert.ok(lockAt !== -1 && lockAt < statusAt, 'lock runs before the hive status read');
  assert.ok(lockAt !== -1 && lockAt < queryAt, 'lock runs before the first DB query');
});
