// app/api/keepsake/upload-url/route.js
// POST /api/keepsake/upload-url { contentType, sizeBytes }
//   -> { uploadUrl, token, path, publicUrl }
//
// Mints a service-role signed upload URL so the photo goes straight from
// the phone to Supabase Storage (never through Vercel's small request
// body). The path is namespaced to the signed-in user:
// keepsake-globes/<user_id>/… — owner-verified server-side; the client
// can never write into another user's folder. Follows the profiles
// upload-url pattern exactly.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';

const BUCKET = 'keepsake-globes';
// Photos stay at 12 MB. Videos up to 2 minutes go to 500 MB — a
// 2-minute phone clip at 1080p (and most 4K HEVC clips) fits; the PUT
// goes straight to Supabase, never through Vercel.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const contentType = body && body.contentType;
  const sizeBytes = body && body.sizeBytes;
  const isImage = IMAGE_TYPES.has(contentType);
  const isVideo = VIDEO_TYPES.has(contentType);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: 'Only JPEG, PNG or WebP photos, or MP4, WebM or MOV videos, can be kept.' }, { status: 400 });
  }
  const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    return NextResponse.json(
      { error: isVideo ? 'That video is too large (500 MB limit).' : 'That photo is too large (12 MB limit).' },
      { status: 400 },
    );
  }

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Keepsake storage is not connected yet.' }, { status: 503 });

  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `keepsake-globes/${auth.user.id}/${nonce}.${EXT_BY_TYPE[contentType]}`;

  let signed;
  try {
    const res = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (res.error) throw res.error;
    signed = res.data;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/bucket|not found/i.test(msg)) {
      return NextResponse.json(
        { error: 'Keepsake storage is not set up yet (run supabase/keepsake.sql).' },
        { status: 503 },
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
