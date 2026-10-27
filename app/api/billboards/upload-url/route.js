// app/api/billboards/upload-url/route.js
// Billboard Manager — signed upload URL into the billboard-creatives
// bucket. MERLIN ONLY. POST { billboardNumber, fileName, contentType,
// fileSize } -> { uploadUrl, path, publicUrl }.
// The browser PUTs the file bytes directly to Supabase Storage; the
// service key never leaves the server. Uploading stages nothing live:
// the creative only reaches the hub after its queue entry is sent and
// the builder wires it into the repo manifest.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { isOwnerEmail } from '@/lib/owner';
import {
  isValidBillboardNumber,
  creativeKindForMime,
  maxBytesForKind,
} from '@/lib/billboards/validate';

const BUCKET = 'billboard-creatives';

function cleanName(name) {
  const base = String(name || 'creative').split(/[\\/]/).pop();
  const cleaned = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'creative';
}

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error || !isOwnerEmail(auth.user?.email)) {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }
  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Creative storage is not connected yet.' }, { status: 503 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const number = Number(body?.billboardNumber);
  if (!isValidBillboardNumber(number)) {
    return NextResponse.json({ ok: false, error: 'Pick a billboard number from 1 to 44.' }, { status: 400 });
  }
  const kind = creativeKindForMime(body?.contentType);
  if (!kind) {
    return NextResponse.json({ ok: false, error: 'Images (JPEG, PNG, WebP, GIF) or videos (MP4, WebM) only.' }, { status: 400 });
  }
  const size = Number(body?.fileSize) || 0;
  if (!size || size > maxBytesForKind(kind)) {
    const cap = kind === 'image' ? '8 MB' : '50 MB';
    return NextResponse.json({ ok: false, error: `That file is over the ${cap} limit for ${kind === 'image' ? 'images' : 'videos'}.` }, { status: 413 });
  }
  const path = `ads/b${number}-${crypto.randomUUID()}-${cleanName(body?.fileName)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: 'Could not start the upload. The billboard storage may not be set up yet.' }, { status: 502 });
  }
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return NextResponse.json({
    ok: true,
    uploadUrl: data.signedUrl,
    path,
    publicUrl: base ? `${base}/storage/v1/object/public/${BUCKET}/${path}` : null,
    creativeType: kind,
  });
}
