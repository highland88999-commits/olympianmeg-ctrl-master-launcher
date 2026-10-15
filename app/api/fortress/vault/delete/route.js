// Fortress of Solitude — delete one of the caller's vault files, for good.
// POST /api/fortress/vault/delete { fileStorageKey }
//   -> { deleted: true }

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { deleteVaultObject } from '@/lib/fortress/vault-storage';

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
    await deleteVaultObject(admin, auth.user.id, String(body?.fileStorageKey || ''));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const status = /not in your vault/.test(err.message) ? 403 : 502;
    return NextResponse.json({ error: err.message }, { status });
  }
}
