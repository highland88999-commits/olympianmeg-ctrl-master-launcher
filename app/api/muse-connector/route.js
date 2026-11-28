// app/api/muse-connector/route.js — the Olympus side of the Muse
// connector (Merlin, Nov 27, 2026).
//
// THE BRAIN'S ENFORCEMENT POINT for the connector. The brain
// (Supabase Brain — the Olympus backend) is the single place that
// knows the full rule set and executes it, server-side, never by
// client code and never trusted from the client. Every call here
// reads the registry (supabase/olympus-connector-registry.sql) and
// the live owner row server-side, on every attempt, before anything
// is read or changed.
//
// AUTH — the Supabase session is the credential (Merlin, Nov 27
// ~04:15: "Supabase is the gatekeeper"). There is NO key to place
// anywhere: no copy step, no paste step, no blind clipboard carry.
//   CONNECT (once, in the browser): the user signs in with their
//     Olympus account (Supabase Auth — the existing login flow,
//     components/Auth.jsx) and POSTs { action: 'connect' } with that
//     session as `Authorization: Bearer <supabase access_token>`
//     (the house pattern, lib/world-engine/server.js
//     getUserFromRequest). The server writes the registry row. The
//     key is still derived server-side at this moment and only its
//     SHA-256 fingerprint is written into the row, as the server-side
//     record of the connection — the key itself is NEVER returned.
//   EVERY LATER CALL (from the user's Muse): `Authorization: Bearer
//     <supabase access_token>`. The server verifies the session
//     (getUserFromRequest) and reads the registry row for that
//     account on every attempt: registered and not revoked, or the
//     call is refused. The account id comes from the verified
//     session, never from a client header — there is no
//     X-Olympus-User-Id on the request path anymore. A bearer key
//     with no session authenticates nothing.
//
// THE ESCORT (ARES watches every request on this route):
//   - The edge middleware (middleware.ts) already covers this route:
//     whitelist bypass for friendly addresses, ban check, bot
//     scoring, watch-band handling, rate limits — the first layers.
//   - The session check is the door. A missing or expired session is
//     a generic 401, never a hint about what was wrong. An expired
//     session is ordinary (sessions expire) — it flags nothing.
//   - The watchdog (lib/muse-connector/watchdog.js) re-verifies the
//     arriving agent and scope. A mismatch flags watch_flagged —
//     never an auto-block, never a strike on its own.
//   - Honeypots en route are the middleware's: probe-like watch-band
//     traffic is rewritten to /api/honeypot/env (handleTrap), which
//     logs honeypot_hit and strikes toward a temp ban at 5. Live
//     trapping/sandboxing (tarpit/abyss) stays OFF by standing law —
//     re-enabling needs Merlin's explicit opt-in; this route does not
//     re-enable it.
//   - OUTGOING, collected: every successful response is recorded via
//     logEvent as 'connector_egress' (what left, the action, the
//     account, the time, the sender IP hash — summary facts, never
//     a credential, never the full payload).
//   - INCOMING, scanned: every incoming directions prompt is scanned
//     for legal threats (lib/muse-connector/legal-scan.js). On a hit
//     the finding agent writes a LEGAL REPORT and sends it home to
//     the ARES console (logEvent 'connector_legal_threat', facts
//     only, IP hash only).
//   - SAFE TRAFFIC passes clean: a valid session, a registered
//     account, and an in-scope request get no flag, no delay, no
//     friction.
//
// GRACEFUL DEGRADATION: until supabase/olympus-connector-registry.sql
// runs, every action answers 503 with a plain-English message. The
// route never fails open, never falls back to a client-side check,
// and never grants access because a table is missing. The evidence
// rows ('connector_egress', 'connector_legal_threat') likewise need
// the widened ares_events CHECK from that migration; until it runs,
// logEvent returns { logged: false } and the route warns server-side
// only — the user's request still goes through, only the evidence
// row is missed.
//
// ACTIONS:
//   GET  ?action=registry  -> the account's own registry row.
//   GET  ?action=assets    -> the account's own world_engine_assets.
//   POST { action: 'connect' }                    -> register the account.
//   POST { action: 'direct', asset_id, prompt }   -> re-forge an own world.
//   POST { action: 'revoke' }                     -> revoke the account's connection.
//
// The 'direct' action mirrors POST /api/communiverse/direct steps
// 1–4 (billing, generation, ledger, write-back) with the identical
// owner check — the connector adds the session, registry, and
// watchdog gates in front, and changes nothing behind them.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { isUserBanned } from '@/lib/ares/user-bans';
import { logEvent, hashVisitorIp } from '@/lib/ares/server';
import { canChange, defaultScope, scopeReasonText } from '@/lib/muse-connector/scope';
import { resolveSessionAuth } from '@/lib/muse-connector/session-auth';
import {
  deriveConnectorKey,
  connectorKeyFingerprint,
} from '@/lib/muse-connector/keys';
import { expectedArrival, verifyArrival, watchdogMismatchText } from '@/lib/muse-connector/watchdog';
import { scanIncomingLegalThreat } from '@/lib/muse-connector/legal-scan';
import { buildEgressRecord, buildLegalReport } from '@/lib/muse-connector/report';
import { validateSynthesizeInput, synthesizeWithGemini } from '@/lib/world-engine/gemini';
import { costFor, computeBilling, FREE_GENERATIONS_PER_MONTH } from '@/lib/world-engine/economy';
import { applyAestheticEngine } from '@/lib/world-engine/aesthetic';
import { withCommuniverse, communiverseMarker } from '@/lib/communiverse';

const REGISTRY_NOT_READY = 'The connector registry is not set up yet. The keeper is still wiring it — try again once the brain upgrade has run.';

// The visitor IP, first hop only. It is NEVER stored raw — logEvent
// hashes it (SHA-256 + salt) before it touches the database.
function visitorIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// The registry row for an account, or null when unregistered.
// Throws RegistryUnavailable when the table itself is missing (or
// unreadable) — the route answers 503 and never fails open.
class RegistryUnavailable extends Error {}
async function getRegistry(admin, userId) {
  const { data, error } = await admin
    .from('olympus_connector_registry')
    .select('user_id, key_fingerprint, scope, things, connected_at, updated_at, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new RegistryUnavailable(error.message || 'registry unreadable');
  return data || null;
}

function registryScope(row) {
  const scope = (row && row.scope) || {};
  return {
    kinds: Array.isArray(scope.kinds) ? scope.kinds : [],
    functions: Array.isArray(scope.functions) ? scope.functions : [],
  };
}

// Fire the evidence log, never letting it break the user's request.
// A missed evidence row is a server-side warning, not a user error.
async function collectEgress(req, record) {
  try {
    const details = { ...record };
    // The sender hash for the record itself: logEvent stores the same
    // hash in the row's ip_hash column, so the record and the row agree.
    if (!details.sender_ip_hash) details.sender_ip_hash = hashVisitorIp(visitorIp(req));
    if (!details.sender_ip_fingerprint) details.sender_ip_fingerprint = String(details.sender_ip_hash).slice(0, 12);
    const res = await logEvent({
      ip: visitorIp(req),
      eventType: 'connector_egress',
      path: '/api/muse-connector',
      userAgent: req.headers.get('user-agent'),
      details,
    });
    if (res && res.logged === false) {
      console.warn('Muse connector egress not recorded:', res.reason || 'unknown');
    }
  } catch (e) {
    console.warn('Muse connector egress not recorded:', (e && e.message) || e);
  }
}

async function flagWatch(req, details) {
  try {
    await logEvent({
      ip: visitorIp(req),
      eventType: 'watch_flagged',
      path: '/api/muse-connector',
      userAgent: req.headers.get('user-agent'),
      details: { connector: 'muse-connector', ...(details || {}) },
    });
  } catch {
    // Flagging must never break the response.
  }
}

// Verify the Supabase session and load the registry row. The account
// id comes from the verified session, never from a client header.
// Returns { userId, registry } or a NextResponse error. A missing or
// expired session is a plain 401 — sessions expire, so it flags
// nothing. A bearer key with no session authenticates nothing.
async function requireSession(req, admin) {
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  let registry;
  try {
    registry = await getRegistry(admin, auth.user.id);
  } catch {
    return { error: NextResponse.json({ error: REGISTRY_NOT_READY }, { status: 503 }) };
  }
  const decision = resolveSessionAuth({ sessionUserId: auth.user.id, registry });
  if (!decision.ok) {
    const status = decision.reason === 'signed-out' ? 401 : 403;
    return { error: NextResponse.json({ error: scopeReasonText(decision.reason) }, { status }) };
  }
  return { userId: decision.userId, registry };
}

// The watchdog runs on every gated call: expected agent + scope come
// from the verified session and the registry (the brain), never from the
// request's own claims. A mismatch flags watch_flagged for the Review
// Queue; it never blocks by itself — the scope/owner checks decide.
async function runWatchdog(req, { userId, registry, thing, fn }) {
  const arrival = {
    agentId: req.headers.get('x-olympus-agent') || '',
    userId,
    thing: thing || null,
    fn: fn || null,
  };
  const verdict = verifyArrival({
    expected: expectedArrival({ userId, scope: registryScope(registry) }),
    arrival,
  });
  if (!verdict.ok) {
    await flagWatch(req, {
      watchdog: 'connector',
      mismatches: verdict.mismatches,
      mismatch_text: verdict.mismatches.map((m) => watchdogMismatchText(m)),
      fn: fn || null,
      thing_kind: thing ? thing.kind : null,
    });
  }
  return verdict;
}

// The incoming legal-threat scan. On a hit the finding agent writes
// the LEGAL REPORT and sends it home (the ARES console only) — facts
// only, IP hash only, no legal conclusions. The report is sent
// whether or not the request itself goes on to succeed.
async function scanAndReportLegal(req, { prompt, agent }) {
  const found = scanIncomingLegalThreat(prompt);
  if (!found.found) return found;
  const report = buildLegalReport({
    signals: found.signals,
    foundAt: new Date().toISOString(),
    threat: 'Incoming directions text matched legal-threat signals.',
    traffic: `POST /api/muse-connector direct prompt (${String(prompt || '').length} chars)`,
    sourceIpHash: hashVisitorIp(visitorIp(req)),
    agent: agent || 'sentinel',
    action: 'flagged',
  });
  try {
    const res = await logEvent({
      ip: visitorIp(req),
      eventType: 'connector_legal_threat',
      path: '/api/muse-connector',
      userAgent: req.headers.get('user-agent'),
      details: report,
    });
    if (res && res.logged === false) {
      console.warn('Muse connector legal report not recorded:', res.reason || 'unknown');
    }
  } catch (e) {
    console.warn('Muse connector legal report not recorded:', (e && e.message) || e);
  }
  return found;
}

async function getLedger(admin, userId) {
  const { data, error } = await admin
    .from('world_engine_credits')
    .select('tokens, free_used, free_reset_month')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export const GET = apiGuard(async function GET(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const gated = await requireSession(req, admin);
  if (gated.error) return gated.error;
  const { userId, registry } = gated;
  const scope = registryScope(registry);

  if (action === 'registry') {
    const check = canChange({ registry: { ...registry, ...scope }, userId, thing: null, fn: 'registry.read' });
    if (!check.ok) return NextResponse.json({ error: scopeReasonText(check.reason) }, { status: 403 });
    const record = buildEgressRecord({
      userId, action: 'registry', result: 'registry row read',
      ipHash: '', at: new Date().toISOString(),
    });
    await collectEgress(req, record);
    return NextResponse.json({
      ok: true,
      registered: true,
      user_id: userId,
      scope,
      connected_at: registry.connected_at,
      revoked_at: registry.revoked_at,
    });
  }

  if (action === 'assets') {
    const check = canChange({ registry: { ...registry, ...scope }, userId, thing: null, fn: 'asset.read' });
    if (!check.ok) return NextResponse.json({ error: scopeReasonText(check.reason) }, { status: 403 });
    const { data, error } = await admin
      .from('world_engine_assets')
      .select('id, user_id, name, category, asset_url, generation_params, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: 'Could not load your creations.' }, { status: 500 });
    const record = buildEgressRecord({
      userId, action: 'assets', result: `${(data || []).length} own creations listed`,
      ipHash: '', at: new Date().toISOString(), chars: JSON.stringify(data || []).length,
    });
    await collectEgress(req, record);
    return NextResponse.json({ ok: true, count: (data || []).length, assets: data || [] });
  }

  return NextResponse.json({ error: "action must be 'registry' or 'assets'." }, { status: 400 });
});

export const POST = apiGuard(async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const action = body.action;
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  // CONNECT — the one moment the Supabase session is used to
  // register. The human proves the account in the browser; the server
  // writes the registry row. The key is still derived server-side and
  // only its fingerprint is written into the row, as the server-side
  // record of the connection — the key itself is NEVER returned.
  if (action === 'connect') {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { user } = auth;
    try {
      if (await isUserBanned(user.id)) {
        return NextResponse.json({ error: 'This account is banned.' }, { status: 403 });
      }
    } catch {}
    const secret = process.env.OLYMPUS_MUSE_CONNECTOR_SECRET || '';
    if (!secret) return NextResponse.json({ error: 'The connector is not configured yet.' }, { status: 503 });
    const key = deriveConnectorKey(secret, user.id);
    const fingerprint = connectorKeyFingerprint(key);
    const scope = defaultScope();
    let ownAssets = [];
    try {
      const { data } = await admin
        .from('world_engine_assets')
        .select('id, category')
        .eq('user_id', user.id)
        .limit(500);
      ownAssets = (data || []).map((a) => ({ kind: a.category, id: a.id }));
    } catch {}
    let registry;
    try {
      const { data, error } = await admin
        .from('olympus_connector_registry')
        .upsert(
          {
            user_id: user.id,
            key_fingerprint: fingerprint,
            scope,
            things: ownAssets,
            updated_at: new Date().toISOString(),
            revoked_at: null,
          },
          { onConflict: 'user_id' }
        )
        .select('user_id, key_fingerprint, scope, connected_at, updated_at, revoked_at')
        .single();
      if (error) throw error;
      registry = data;
    } catch {
      return NextResponse.json({ error: REGISTRY_NOT_READY }, { status: 503 });
    }
    const record = buildEgressRecord({
      userId: user.id, action: 'connect', result: 'connector registered',
      ipHash: '', at: new Date().toISOString(),
    });
    await collectEgress(req, record);
    return NextResponse.json({
      ok: true,
      user_id: user.id,
      scope: registryScope(registry),
      connected_at: registry.connected_at,
    });
  }

  // REVOKE — session-only, by design: the human proves the account in
  // the browser, via the Profile button, and the connection stops at
  // once. An already-revoked connection revokes again as a no-op success.
  if (action === 'revoke') {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const userId = auth.user.id;
    try {
      const { error } = await admin
        .from('olympus_connector_registry')
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
    } catch {
      return NextResponse.json({ error: REGISTRY_NOT_READY }, { status: 503 });
    }
    const record = buildEgressRecord({
      userId, action: 'revoke', result: 'connector revoked',
      ipHash: '', at: new Date().toISOString(),
    });
    await collectEgress(req, record);
    return NextResponse.json({ ok: true, revoked: true });
  }

  // Every other action is session-authenticated.
  const gated = await requireSession(req, admin);
  if (gated.error) return gated.error;
  const { userId, registry } = gated;
  const scope = registryScope(registry);

  if (action === 'direct') {
    const assetId = String(body.asset_id || '').trim();
    if (!assetId) return NextResponse.json({ error: 'Choose a world (asset_id).' }, { status: 400 });
    const input = validateSynthesizeInput(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    // Incoming scan first: a legal threat in the directions is
    // reported home before anything else happens with the prompt.
    await scanAndReportLegal(req, { prompt: input.prompt, agent: 'sentinel' });

    const { data: asset, error: loadErr } = await admin
      .from('world_engine_assets')
      .select('id, user_id, category, generation_params')
      .eq('id', assetId)
      .maybeSingle();
    if (loadErr || !asset) return NextResponse.json({ error: 'World not found.' }, { status: 404 });

    // The watchdog re-verifies the arrival against the brain's
    // expectation (agent identity + ownership scope). A mismatch
    // flags for the Review Queue; it never blocks by itself.
    const thing = { kind: asset.category, id: asset.id, ownerId: asset.user_id };
    await runWatchdog(req, { userId, registry, thing, fn: 'world.direct' });

    // The brain's own-account decision: the thing AND the function
    // must both be the account's own. A foreign thing or a foreign
    // function is refused here, server-side, with the reason.
    const check = canChange({ registry: { ...registry, ...scope }, userId, thing, fn: 'world.direct' });
    if (!check.ok) {
      await flagWatch(req, {
        decision: 'refused',
        reason: check.reason,
        reason_text: scopeReasonText(check.reason),
        fn: 'world.direct',
        thing_kind: asset.category,
        asset_id: assetId,
      });
      return NextResponse.json({ error: scopeReasonText(check.reason) }, { status: 403 });
    }
    if (asset.category !== 'world') {
      return NextResponse.json({ error: 'Only worlds can be directed.' }, { status: 400 });
    }

    // Mirror of POST /api/communiverse/direct, steps 1–4: the same
    // billing, the same generation, the same write-back onto the
    // same asset row. The connector changes nothing behind the gate.
    const cost = costFor('world');
    let ledger;
    try {
      ledger = await getLedger(admin, userId);
    } catch {
      return NextResponse.json({ error: 'Could not read your credit balance.' }, { status: 500 });
    }
    const billing = computeBilling(ledger, cost);
    if (!billing.ok) {
      return NextResponse.json(
        {
          error: `Not enough Aether. Directing a world costs ${billing.required} Aether and you have ${billing.available}. Your free monthly generations are used up — buy credits to keep directing.`,
          requiredAether: billing.required,
          currentAether: billing.available,
        },
        { status: 402 }
      );
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'The synthesis service is not connected yet.' }, { status: 503 });
    }
    let rawParams;
    try {
      rawParams = await synthesizeWithGemini({
        apiKey: process.env.GEMINI_API_KEY,
        prompt: input.prompt,
        targetUrl: input.targetUrl,
        category: 'world',
      });
    } catch (e) {
      return NextResponse.json({ error: e.message || 'World generation failed.' }, { status: 502 });
    }
    const { error: ledgerError } = await admin
      .from('world_engine_credits')
      .upsert({ user_id: userId, ...billing.updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (ledgerError) console.error('Muse connector direct: ledger write failed:', ledgerError.message);
    const safeParams = applyAestheticEngine(rawParams, 'world');
    const wasPublished = communiverseMarker(asset.generation_params).published;
    const nextParams = withCommuniverse(safeParams, wasPublished, new Date().toISOString());
    const { error: upErr } = await admin
      .from('world_engine_assets')
      .update({ generation_params: nextParams, prompt: input.prompt })
      .eq('id', assetId);
    if (upErr) return NextResponse.json({ error: 'Could not save the directed world.' }, { status: 500 });

    const record = buildEgressRecord({
      userId, action: 'direct', assetId, result: 'world re-forged',
      ipHash: '', at: new Date().toISOString(), chars: JSON.stringify(nextParams).length,
    });
    await collectEgress(req, record);
    return NextResponse.json({
      ok: true,
      asset_id: assetId,
      parameters: nextParams,
      in_communiverse: wasPublished,
      billing: {
        paymentType: billing.isFree ? 'free_tier' : 'aether_deducted',
        cost: billing.cost,
        freeGenerationsRemaining: billing.freeRemaining,
        tokensRemaining: billing.tokensRemaining,
        freeGenerationsPerMonth: FREE_GENERATIONS_PER_MONTH,
      },
    });
  }

  return NextResponse.json({ error: "action must be 'connect', 'direct', or 'revoke'." }, { status: 400 });
});
