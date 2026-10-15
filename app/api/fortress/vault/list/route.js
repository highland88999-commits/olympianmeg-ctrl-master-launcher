// Fortress of Solitude — list the caller's vault files.
// GET /api/fortress/vault/list
//   -> { files: [{ name, fileStorageKey, size, updatedAt, mimeType }] }

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { listVaultObjects } from '@/lib/fortress/vault-storage';

export async function GET(req) {
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
    const files = await listVaultObjects(admin, auth.user.id);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
