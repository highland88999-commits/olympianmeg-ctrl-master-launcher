// app/api/concourse/background-upload-url/route.js
// POST /api/concourse/background-upload-url { contentType, sizeBytes }
//   -> { uploadUrl, token, path, publicUrl, media }
//
// Mints a service-role signed upload URL for a Concourse background
// (own photo / own video) into the EXISTING public `profile-media`
// bucket — the same storage the profile system uses (see
// app/api/profiles/upload-url); no new bucket, no new SQL. The path
// is namespaced to the signed-in user:
//   profiles/<user_id>/concourse-bg/<nonce>.<ext>
// The file goes straight from the phone to storage; the returned
// publicUrl is what the client saves as the concourse_bg preference.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { validateBackgroundUpload } from '@/lib/concourse-bg';
import { apiGuard } from '@/lib/api-guard';

const BUCKET = 'profile-media';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const v = validateBackgroundUpload(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Media uploads are not connected yet.' }, { status: 503 });

  const { contentType, ext, media } = v.value;
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = `profiles/${auth.user.id}/concourse-bg/${nonce}.${ext}`;

  let signed;
  try {
    const res = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (res.error) throw res.error;
    signed = res.data;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/bucket|not found/i.test(msg)) {
      return NextResponse.json(
        { error: 'Background storage is not set up yet (the profile-media bucket is missing).' },
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
    media,
    contentType,
  });
});
