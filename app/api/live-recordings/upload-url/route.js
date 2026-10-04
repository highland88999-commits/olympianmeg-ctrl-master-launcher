// app/api/live-recordings/upload-url/route.js
// POST /api/live-recordings/upload-url { contentType, sizeBytes, kind? }
//   -> { ok, uploadUrl, token, path, publicUrl, contentType }
//
// Mints a service-role signed upload URL so the file goes straight from the
// phone to Supabase Storage (never through Vercel's small request body).
// Path is namespaced to the signed-in user: recordings/<user_id>/<nonce>.<ext>
// Accepts mp4/mov/webm up to 100 MB (matches the live-recordings bucket).
// The sibling TikTok post-queue worker reads these uploads to build posts.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';

const BUCKET = 'live-recordings';
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

const EXT_BY_MIME = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function validateUploadBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid upload request.' };
  }
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const ext = EXT_BY_MIME[contentType];
  if (!ext) {
    return { ok: false, error: 'Unsupported file type. Use MP4, MOV, or WebM.' };
  }
  const sizeBytes = Number(body.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: 'Missing file size.' };
  }
  if (sizeBytes > MAX_BYTES) {
    return { ok: false, error: 'Video is too large. Maximum is 100 MB.' };
  }
  return { ok: true, value: { contentType, ext, sizeBytes } };
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const v = validateUploadBody(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Recording uploads are not connected yet.' }, { status: 503 });

  const { contentType, ext } = v.value;
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = `recordings/${auth.user.id}/${nonce}.${ext}`;

  let signed;
  try {
    const res = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (res.error) throw res.error;
    signed = res.data;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/bucket|not found/i.test(msg)) {
      return NextResponse.json(
        { error: 'Recording storage is not set up yet (run supabase/migrations/20261004_live_recordings.sql).' },
        { status: 503 }
      );
    }
    throw err;
  }

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return NextResponse.json({
    ok: true,
    uploadUrl: signed.signedUrl,
    token: signed.token,
    path,
    publicUrl: `${base}/storage/v1/object/public/${BUCKET}/${path}`,
    contentType,
  });
});
