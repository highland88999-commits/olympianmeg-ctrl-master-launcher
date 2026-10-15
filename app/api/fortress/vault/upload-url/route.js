// Fortress of Solitude — signed upload URL into the caller's own bucket.
// POST /api/fortress/vault/upload-url { name, contentType? }
//   -> { uploadUrl, fileStorageKey, path }
// The browser PUTs the file bytes directly to Supabase Storage; the service
// key never leaves the server. Quota is enforced by the caller (the crystal
// vault gates via /api/request-upload-link).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { signVaultUploadUrl } from '@/lib/fortress/vault-storage';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Storage is unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    const result = await signVaultUploadUrl(
      admin,
      auth.user.id,
      body?.name,
      body?.contentType || 'application/octet-stream'
    );
    return NextResponse.json(result);
  } catch (err) {
    const status = /not in your vault|Invalid file name/.test(err.message) ? 400 : 502;
    return NextResponse.json({ error: err.message }, { status });
  }
}
