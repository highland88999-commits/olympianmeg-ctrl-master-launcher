// ARES ingest — internal only. Middleware and honeypots report here.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { checkInternal, logEvent } from '@/lib/ares/server';
import { EVENT_TYPES } from '@/lib/ares/config';
import { validateVector, FEATURE_VERSION } from '@/lib/ares/features';
import { scoreEvent, drainReports } from '@/lib/ares/hive';
import { apiGuard } from '@/lib/api-guard';

// The host this request arrived on (bare hostname, no port). Behind
// Vercel the public host comes via x-forwarded-host; fall back to the
// Host header. Null when neither is present — the hive then skips the
// host signal rather than firing on a missing header.
function requestHost(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  const raw = String(forwarded || request.headers.get('host') || '').split(',')[0].trim();
  if (!raw) return null;
  return raw.split(':')[0].toLowerCase() || null;
}

export const POST = apiGuard(async function POST(request) {
  if (!checkInternal(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const { ip, eventType, path, userAgent, details, ml } = body || {};
  if (typeof ip !== 'string' || !ip.trim() || ip.length > 64 || !EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: 'ip and a valid eventType are required' }, { status: 400 });
  }
  if ((path !== undefined && (typeof path !== 'string' || path.length > 2048)) ||
      (userAgent !== undefined && (typeof userAgent !== 'string' || userAgent.length > 1024)) ||
      (details !== undefined && (typeof details !== 'object' || details === null || Array.isArray(details)))) {
    return NextResponse.json({ error: 'malformed event fields' }, { status: 400 });
  }
  // Learning pipeline: accept the feature vector the edge computed, but
  // only if it is well-formed and matches the current feature version.
  // Anything else is dropped rather than stored — bad training data is
  // worse than none.
  const cleanMl =
    ml && Array.isArray(ml.features) && validateVector(ml.features) && ml.feature_version === FEATURE_VERSION
      ? { features: ml.features, feature_version: ml.feature_version }
      : null;
  // Hive mind: score every event that carries a clean vector, and attach
  // the readings to the event details BEFORE logEvent, so the console
  // shows what the agents thought of each event. The hive must never
  // block logging: if scoring throws, the event logs exactly as before.
  let agentReadings = null;
  if (cleanMl) {
    try {
      const reading = scoreEvent({ vector: cleanMl.features, host: requestHost(request) });
      agentReadings = { agents: reading.agents, hub: reading.hub };
      if (reading.terminated.length > 0) agentReadings.terminated = reading.terminated;
    } catch {
      agentReadings = null;
    }
  }
  const detailsToLog = agentReadings
    ? { ...(details || {}), ares_agents: agentReadings }
    : (details || {});
  let result;
  try {
    result = await logEvent({ ip, eventType, path, userAgent, details: detailsToLog, ml: cleanMl });
  } finally {
    // Delivery confirmation: if scoring fired a self-terminate report,
    // await it before responding so the report is confirmed landed.
    // drainReports settles even on delivery failure and is a no-op
    // when nothing was fired.
    await drainReports();
  }
  return NextResponse.json(result);
});
