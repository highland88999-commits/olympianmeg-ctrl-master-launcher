// Fortress of Solitude — ensure the caller's private bucket exists.
// POST /api/fortress/vault/ensure -> { bucket }
// Creates `fortress-<user_id>` on first use (service role). Idempotent.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { ensureUserBucket, vaultBucketName } from '@/lib/fortress/vault-storage';

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
    const bucket = await ensureUserBucket(admin, auth.user.id);
    return NextResponse.json({ bucket });
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
