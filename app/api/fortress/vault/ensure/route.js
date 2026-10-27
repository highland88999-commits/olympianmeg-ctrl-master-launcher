// Fortress of Solitude — ensure the caller's private bucket exists.
// POST /api/fortress/vault/ensure -> { bucket, fileSizeLimitBytes, capAligned, previousFileSizeLimitBytes }
// Creates `fortress-<user_id>` on first use (service role). Idempotent.
// The live per-file cap is reported (and any upward alignment of an older
// cap is flagged) so the UI always shows the truth — never a silent change.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { ensureUserBucketDetailed, vaultBucketName } from '@/lib/fortress/vault-storage';

export async function POST(req) {
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
    const state = await ensureUserBucketDetailed(admin, auth.user.id);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not prepare your vault.' },
      { status: 502 }
    );
  }
}

// Also allow GET for simple health checks from the client.
export async function GET(req) {
  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ bucket: vaultBucketName(auth.user.id) });
}
