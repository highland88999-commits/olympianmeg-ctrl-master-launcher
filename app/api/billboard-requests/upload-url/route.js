// app/api/billboard-requests/upload-url/route.js
// User-facing billboard request uploads — ANY signed-in user (this is
// the public request side, not the Merlin-only manager). POST
// { fileName, contentType, fileSize } -> { uploadUrl, publicUrl,
// creativeType }. The browser PUTs bytes directly to Supabase Storage;
// the service key never leaves the server. Uploading stages nothing
// live: the creative only reaches a billboard after Merlin approves
// the request, the user subscribes from wallet credit, and the builder
// wires it into the repo manifest.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser } from '@/lib/billboards/request-server';
import { creativeKindForMime, maxBytesForKind } from '@/lib/billboards/validate';

const BUCKET = 'billboard-creatives';

function cleanName(name) {
  const base = String(name || 'creative').split(/[\\/]/).pop();
  const cleaned = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'creative';
}

export async function POST(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to upload.' }, { status: e.status || 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
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
  const path = `requests/${user.id}-${crypto.randomUUID()}-${cleanName(body?.fileName)}`;
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
