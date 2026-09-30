// app/api/fortress/delete-file/route.js
// Fortress of Solitude — remove a stored file for good.
//
// POST /api/fortress/delete-file { fileStorageKey, bytes }
//   -> { deleted: true, usedBytes, quotaBytes }
//
// Deletes the object from cloud storage and releases its bytes from the
// owner's used_bytes (never below zero). Only files under the caller's own
// vault prefix can be touched.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTier, FREE_TIER_ID } from '@/lib/fortress/tiers';
import { getFortressUser, getFortressAdmin, deleteVaultObject, ownerPrefix } from '@/lib/fortress/server';
import { removeUsedBytes, ensureQuotaFromMatrix, getQuotaRow } from '@/lib/fortress/quota-store';

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
  if (!fileStorageKey || !fileStorageKey.startsWith(ownerPrefix(user.id))) {
    return NextResponse.json({ error: 'That file is not in your vault.' }, { status: 403 });
  }

  const admin = await getFortressAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Storage is unavailable right now. Please try again.' },
      { status: 503 }
    );
  }

  try {
    // Authoritative size: the crystal matrix knows what this node holds.
    let bytes = Math.max(0, Number(body?.bytes) || 0);
    try {
      const { data } = await admin.from('fortresses_').select('crystal_matrix').eq('id', user.id).maybeSingle();
      const node = (data?.crystal_matrix || []).find((n) => n?.fileStorageKey === fileStorageKey);
      if (node && Number(node.rawSize) > 0) bytes = Number(node.rawSize);
    } catch {
      // Fall back to the client-reported size; the clamp keeps it honest.
    }

    await deleteVaultObject(fileStorageKey);
    await ensureQuotaFromMatrix(admin, user.id);
    const row = await removeUsedBytes(admin, user.id, bytes);
    const tier = getTier(row.tier) || getTier(FREE_TIER_ID);
    return NextResponse.json({
      deleted: true,
      usedBytes: Math.max(0, Number(row.used_bytes) || 0),
      quotaBytes: Number(row.quota_bytes) || tier.bytes,
      tier: tier.id,
      tierLabel: tier.label,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not delete the file.' },
      { status: 502 }
    );
  }
}
