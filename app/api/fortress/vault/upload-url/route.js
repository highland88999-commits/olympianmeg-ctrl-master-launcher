// Fortress of Solitude — signed upload URL into the caller's own bucket.
// POST /api/fortress/vault/upload-url { name, contentType?, fileSize }
//   -> { uploadUrl, fileStorageKey, path }
// The browser PUTs the file bytes directly to Supabase Storage; the service
// key never leaves the server.
//
// QUOTA GATE (fail-closed, like /api/request-upload-link): no upload URL is
// minted without checking the caller's allowance first. fileSize is required
// — a size-less request cannot be gated, so it is refused rather than let
// through blind. This route had no callers in the app; the gate keeps it
// from becoming an ungated back door.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFortressUser, getFortressAdmin } from '@/lib/fortress/server';
import { signVaultUploadUrl } from '@/lib/fortress/vault-storage';
import { ensureQuotaFromMatrix } from '@/lib/fortress/quota-store';
import { checkQuota, getTier, FREE_TIER_ID } from '@/lib/fortress/tiers';

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
    const incomingBytes = Math.max(0, Number(body?.fileSize) || 0);
    if (!incomingBytes) {
      return NextResponse.json(
        { error: 'File size is required to check your allowance.' },
        { status: 400 }
      );
    }
    try {
      const { row } = await ensureQuotaFromMatrix(admin, auth.user.id);
      const tier = getTier(row.tier) || getTier(FREE_TIER_ID);
      const quotaBytes = Number(row.quota_bytes) || tier.bytes;
      const gate = checkQuota({
        usedBytes: Math.max(0, Number(row.used_bytes) || 0),
        quotaBytes,
        incomingBytes,
      });
      if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 413 });
    } catch {
      return NextResponse.json(
        { error: 'Storage accounting is unavailable — please try again.' },
        { status: 503 }
      );
    }

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
