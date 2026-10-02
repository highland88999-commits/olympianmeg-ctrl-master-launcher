// app/api/profiles/upload-url/route.js
// POST /api/profiles/upload-url { kind, contentType, sizeBytes }
//   -> { uploadUrl, path, publicUrl, media_kind }
//
// Mints a service-role signed upload URL so the file goes straight from the
// phone to Supabase Storage (never through Vercel's small request body).
// The path is namespaced to the signed-in user: profiles/<user_id>/<kind>/…
// Owner-verified server-side; the client can never write into another
// user's folder.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { validateUploadRequest } from '@/lib/profiles/validation';
import { apiGuard } from '@/lib/api-guard';

const BUCKET = 'profile-media';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const v = validateUploadRequest(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Media uploads are not connected yet.' }, { status: 503 });

  const { kind, contentType, ext, media_kind } = v.value;
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = `profiles/${auth.user.id}/${kind}/${nonce}.${ext}`;

  let signed;
  try {
    const res = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (res.error) throw res.error;
    signed = res.data;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/bucket|not found/i.test(msg)) {
      return NextResponse.json(
        { error: 'Profile media storage is not set up yet (run supabase/profiles.sql).' },
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
    media_kind,
    contentType,
  });
});
