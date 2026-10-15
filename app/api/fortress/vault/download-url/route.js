// Fortress of Solitude — signed download URL for one of the caller's files.
// POST /api/fortress/vault/download-url { fileStorageKey }
//   -> { downloadUrl }
// The key must live inside the caller's own bucket or the request is refused.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { signVaultDownloadUrl } from '@/lib/fortress/vault-storage';

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
    const downloadUrl = await signVaultDownloadUrl(admin, auth.user.id, String(body?.fileStorageKey || ''));
    return NextResponse.json({ downloadUrl });
  } catch (err) {
    const status = /not in your vault/.test(err.message) ? 403 : 502;
    return NextResponse.json({ error: err.message }, { status });
  }
}
