// ARES training export — owner-locked dashboard download (Merlin only).
// Returns every labeled feature vector in the evidence log as JSONL:
// one JSON object per line, ready to train a classifier offline.
//
// Honest by design: this exports the labeled evidence the sentinels have
// collected. It does not train anything, and the file contains no model.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient } from '@/lib/ares/server';
import { labeledRows } from '@/lib/ares/training';
import { FEATURE_VERSION } from '@/lib/ares/features';
import { apiGuard } from '@/lib/api-guard';

const EXPORT_LIMIT = 5000;

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(EXPORT_LIMIT, Math.max(1, Number(searchParams.get('limit')) || EXPORT_LIMIT));

  const { data, error } = await serviceClient()
    .from('ares_events')
    .select('event_type, details, created_at')
    .not('details->ares_ml', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: 'could not load training data' }, { status: 500 });

  const rows = labeledRows(data || []);
  const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');

  // ?format=summary returns counts for the dashboard without the download.
  if (searchParams.get('format') === 'summary') {
    return NextResponse.json({
      rows: rows.length,
      feature_version: FEATURE_VERSION,
      oldest: rows.length ? rows[rows.length - 1].created_at : null,
      newest: rows.length ? rows[0].created_at : null,
    });
  }

  return new NextResponse(jsonl, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': `attachment; filename="ares-training-${FEATURE_VERSION}-${rows.length}-rows.jsonl"`,
      'x-ares-training-rows': String(rows.length),
    },
  });
});
