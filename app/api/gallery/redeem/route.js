// app/api/gallery/redeem/route.js
// POST /api/gallery/redeem { itemId, idemKey? }
//   -> { downloadUrl, balanceAfter }
// Redeems 1 download credit for a gallery item and returns a signed,
// expiring download URL. No credit, no download — there is no other way
// to reach the full file. Requires `Authorization: Bearer <supabase
// access_token>`.
//
// The reuse license is granted at redemption time and recorded in
// gallery_downloads. Idempotent via the ledger's idempotency key.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { ITEMS } from '@/lib/museum';
import {
  isValidItemId, CREDITS_PER_DOWNLOAD, DOWNLOAD_TOKEN_TTL_MS,
  signDownloadToken,
} from '@/lib/gallery';

function downloadSecret() {
  return process.env.GALLERY_DOWNLOAD_SECRET || process.env.STRIPE_SECRET_KEY || '';
}

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await req.json(); } catch { body = null; }
  const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
  if (!isValidItemId(itemId)) {
    return NextResponse.json({ error: 'That artwork is not available.' }, { status: 400 });
  }
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: 'That artwork is not available.' }, { status: 404 });
  }

  const secret = downloadSecret();
  if (!secret) {
    return NextResponse.json({ error: 'Downloads are not configured yet.' }, { status: 503 });
  }

  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ error: 'Downloads are not connected yet.' }, { status: 503 });
  }

  // Client-supplied idempotency key (per download attempt) so a retried
  // request — or a double-tap — can never charge two credits.
  const idemKey = typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
    ? `redeem:${body.idemKey}`
    : `redeem:${auth.user.id}:${itemId}:${Date.now()}`;

  try {
    const { data, error } = await admin.rpc('gallery_credit_apply', {
      p_user_id: auth.user.id,
      p_delta: -CREDITS_PER_DOWNLOAD,
      p_reason: `download:${itemId}`,
      p_idempotency_key: idemKey,
      p_meta: { item_id: itemId, item_title: item.title },
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) throw new Error('Ledger returned no row.');
    if (row.insufficient) {
      return NextResponse.json(
        { error: 'Not enough credits. One download costs 1 credit ($0.10).', balance: row.balance_after },
        { status: 402 }
      );
    }
    if (!row.was_duplicate) {
      const { error: dlErr } = await admin.from('gallery_downloads').insert({
        user_id: auth.user.id,
        item_id: itemId,
        item_title: item.title,
        license_version: 'v1',
      });
      if (dlErr) console.error('Gallery redeem: downloads insert failed:', dlErr.message || dlErr);
    }

    const token = await signDownloadToken({
      userId: auth.user.id,
      itemId,
      secret,
      ttlMs: DOWNLOAD_TOKEN_TTL_MS,
    });
    return NextResponse.json({
      downloadUrl: `/api/gallery/download/${encodeURIComponent(token)}`,
      balanceAfter: row.balance_after,
      expiresInSeconds: Math.floor(DOWNLOAD_TOKEN_TTL_MS / 1000),
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === 'PGRST205' || /gallery_(ledger|balances|downloads)/i.test(msg)) {
      return NextResponse.json({ error: 'Downloads are not connected yet (gallery tables pending).' }, { status: 503 });
    }
    console.error('Gallery redeem error:', msg);
    return NextResponse.json({ error: 'Could not redeem your download. Please try again.' }, { status: 500 });
  }
}
