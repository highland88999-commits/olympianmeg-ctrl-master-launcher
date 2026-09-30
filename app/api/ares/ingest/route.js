// ARES ingest — internal only. Middleware and honeypots report here.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { checkInternal, logEvent } from '@/lib/ares/server';
import { EVENT_TYPES } from '@/lib/ares/config';
import { validateVector, FEATURE_VERSION } from '@/lib/ares/features';
import { apiGuard } from '@/lib/api-guard';

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
  const result = await logEvent({ ip, eventType, path, userAgent, details: details || {}, ml: cleanMl });
  return NextResponse.json(result);
});
