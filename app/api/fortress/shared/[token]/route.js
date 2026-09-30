// app/api/fortress/shared/[token]/route.js
// Public endpoint behind a Fortress share link.
//
// GET /api/fortress/shared/<token>
//   -> { downloadUrl, fileName, expiresAt }
//   -> 404 when the token is unknown, 410 when it has expired.
//
// The token is verified server-side (service role, no RLS involved), then a
// fresh short-lived signed URL is minted for the owner's file. No account
// needed to receive — but the token itself is unguessable and time-limited.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressAdmin, signedReadUrl } from '@/lib/fortress/server';
import { isShareExpired } from '@/lib/fortress/shares';

export async function GET(_req, { params }) {
  const token = String(params?.token || '');
  if (!token) return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Share links are unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    const { data: share, error } = await admin
      .from('fortress_shares')
      .select('file_path, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (error) throw error;
    if (!share) return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    if (isShareExpired(share.expires_at)) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }

    const downloadUrl = await signedReadUrl(share.file_path, 60);
    const fileName = String(share.file_path).split('/').pop() || 'vault-file';
    return NextResponse.json({ downloadUrl, fileName, expiresAt: share.expires_at });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not open the shared file.' },
      { status: 502 }
    );
  }
}
