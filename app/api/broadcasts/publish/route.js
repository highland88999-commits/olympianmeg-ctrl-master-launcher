// POST /api/broadcasts/publish { path, preset, durationMs }
//   -> { ok, latest }
//
// Owner-only. Verifies the uploaded clip really exists under the keeper's
// own clips folder, then points latest.json at it — that pointer is what
// every open page polls, on every program, so every logged-in device
// hears it. Only the newest broadcast is live; the broadcasts table
// (supabase/broadcasts.sql) keeps the record and history. The table
// insert is best-effort: publishing still succeeds through latest.json
// before the SQL has run, and the record appears once it has.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { isOwnerEmail } from '@/lib/owner';
import { apiGuard } from '@/lib/api-guard';
import {
  BROADCAST_BUCKET,
  BROADCAST_PRESETS,
  isBroadcastPath,
} from '@/lib/broadcast/voice-changer';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isOwnerEmail(auth.user.email)) {
    return NextResponse.json({ error: 'Only the keeper may broadcast.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const path = body && body.path;
  const preset = body && body.preset;
  if (!isBroadcastPath(path, auth.user.id)) {
    return NextResponse.json({ error: 'That clip path is not yours.' }, { status: 400 });
  }
  if (!Object.prototype.hasOwnProperty.call(BROADCAST_PRESETS, preset)) {
    return NextResponse.json({ error: 'Unknown voice preset.' }, { status: 400 });
  }
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Broadcast storage is not connected yet.' }, { status: 503 });
  const check = await admin.storage.from(BROADCAST_BUCKET).download(path);
  if (check.error || !check.data) {
    return NextResponse.json({ error: 'That clip did not arrive. Try again.' }, { status: 400 });
  }
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const latest = {
    id: path,
    audioUrl: `${base}/storage/v1/object/public/${BROADCAST_BUCKET}/${path}`,
    preset,
    durationMs: Number(body.durationMs) || 0,
    createdAt: Date.now(),
  };
  const blob = new Blob([JSON.stringify(latest)], { type: 'application/json' });
  const put = await admin.storage.from(BROADCAST_BUCKET).upload('latest.json', blob, {
    upsert: true, contentType: 'application/json',
  });
  if (put.error) return NextResponse.json({ error: 'Could not publish the broadcast.' }, { status: 503 });
  // Record the broadcast in the system. Best-effort: if the broadcasts
  // table does not exist yet (supabase/broadcasts.sql not run), the
  // live pointer above already went out, so a missing table must never
  // fail the send.
  try {
    await admin.from('broadcasts').insert({
      audio_path: path,
      audio_url: latest.audioUrl,
      preset,
      duration_ms: latest.durationMs,
      created_by: auth.user.id,
    });
  } catch {}
  return NextResponse.json({ ok: true, latest });
});
