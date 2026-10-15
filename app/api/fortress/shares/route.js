// app/api/fortress/shares/route.js
// Fortress of Solitude — real share links.
//
// POST   /api/fortress/shares { fileStorageKey, expiresInHours? }
//        -> { token, url, expiresAt }   (24h default, 30 days max)
// DELETE /api/fortress/shares { token }
//        -> { revoked: true }
//
// A share is a random bearer token verified (with expiry) by
// GET /api/fortress/shared/[token], which mints a fresh signed URL.
// Only the file's owner can create or revoke a share.
// Honest note: encrypted files stay locked — the owner shares the
// passphrase separately.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin, isOwnerKey } from '@/lib/fortress/server';
import { sanitizeExpiryHours, buildShareUrl, SHARE_PASSPHRASE_NOTE } from '@/lib/fortress/shares';

const SHARES = 'fortress_shares';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;

  const fileStorageKey = String(body?.fileStorageKey || '');
  if (!fileStorageKey || !isOwnerKey(user.id, fileStorageKey)) {
    return NextResponse.json({ error: 'That file is not in your vault.' }, { status: 403 });
  }

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Share links are unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    const hours = sanitizeExpiryHours(body?.expiresInHours);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from(SHARES).insert([{
      owner_id: user.id,
      file_path: fileStorageKey,
      token,
      expires_at: expiresAt,
    }]);
    if (error) throw error;
    return NextResponse.json({
      token,
      url: buildShareUrl(req.nextUrl.origin, token),
      expiresAt,
      note: SHARE_PASSPHRASE_NOTE,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not create the share link.' },
      { status: 502 }
    );
  }
}

export async function DELETE(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const token = String(body?.token || '');
  if (!token) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Share links are unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    const { error, count } = await admin
      .from(SHARES)
      .delete({ count: 'exact' })
      .eq('token', token)
      .eq('owner_id', auth.user.id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not revoke the share link.' },
      { status: 502 }
    );
  }
}
