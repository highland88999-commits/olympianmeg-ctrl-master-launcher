// POST /api/broadcasts/upload-url { contentType, sizeBytes }
//   -> { ok, token, path, publicUrl, contentType }
//
// Owner-only (the keeper's email, checked server-side). Mints a signed
// upload URL so the clip goes straight from the phone to Supabase Storage.
// Storage is set up by supabase/broadcasts.sql (public 'broadcasts'
// bucket); creating the bucket on first use below is only a fallback,
// because that fallback failed in production and every send died with
// "Broadcast storage is not set up yet." The failure message now names
// the SQL file so the keeper sees the fix, not just the failure.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { isOwnerEmail } from '@/lib/owner';
import { apiGuard } from '@/lib/api-guard';
import {
  BROADCAST_AUDIO_TYPES,
  BROADCAST_BUCKET,
  BROADCAST_MAX_BYTES,
  normalizeAudioType,
} from '@/lib/broadcast/voice-changer';

const EXT_BY_MIME = { 'audio/webm': 'webm', 'audio/mp4': 'mp4' };

async function signedUpload(admin, path) {
  const res = await admin.storage.from(BROADCAST_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (!res.error) return res.data;
  if (/bucket|not found/i.test(String(res.error.message || ''))) {
    await admin.storage.createBucket(BROADCAST_BUCKET, { public: true });
    const retry = await admin.storage.from(BROADCAST_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (!retry.error) return retry.data;
    throw retry.error;
  }
  throw res.error;
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isOwnerEmail(auth.user.email)) {
    return NextResponse.json({ error: 'Only the keeper may broadcast.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const contentType = normalizeAudioType(body && body.contentType);
  const ext = EXT_BY_MIME[contentType];
  if (!ext || !BROADCAST_AUDIO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Unsupported audio type. Use WebM or MP4.' }, { status: 400 });
  }
  const sizeBytes = Number(body && body.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > BROADCAST_MAX_BYTES) {
    return NextResponse.json({ error: 'Clip is too large. Maximum is 10 MB.' }, { status: 400 });
  }
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Broadcast storage is not connected yet.' }, { status: 503 });
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = `clips/${auth.user.id}/${nonce}.${ext}`;
  let signed;
  try {
    signed = await signedUpload(admin, path);
  } catch (err) {
    const detail = String((err && err.message) || '').trim();
    return NextResponse.json({
      error: `Broadcast storage is not set up yet (run supabase/broadcasts.sql).${detail ? ` Storage said: ${detail}` : ''}`,
    }, { status: 503 });
  }
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return NextResponse.json({
    ok: true,
    token: signed.token,
    path,
    publicUrl: `${base}/storage/v1/object/public/${BROADCAST_BUCKET}/${path}`,
    contentType,
  });
});
