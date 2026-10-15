export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFortressAdmin } from '@/lib/fortress/server';
import { ensureQuotaFromMatrix } from '@/lib/fortress/quota-store';
import { checkQuota, getTier, FREE_TIER_ID } from '@/lib/fortress/tiers';
import { ensureUserBucket } from '@/lib/fortress/vault-storage';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Missing Auth header' }, { status: 401 });

    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { nodeId, encrypted, fileSize } = await req.json();
    if (!nodeId) return NextResponse.json({ error: 'Crystal Node ID required' }, { status: 400 });

    const admin = await getFortressAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Storage accounting is unavailable — please try again.' }, { status: 503 });
    }

    // Hard quota gate: nothing that would exceed the vault allowance gets an
    // upload link. Replacing a file in a node doesn't double-count it — the
    // node's current bytes are subtracted before the check. When accounting
    // can't be verified, the upload is refused rather than let through blind.
    const incomingBytes = Math.max(0, Number(fileSize) || 0);
    if (incomingBytes > 0) {
      try {
        const { row } = await ensureQuotaFromMatrix(admin, user.id);
        const tier = getTier(row.tier) || getTier(FREE_TIER_ID);
        const quotaBytes = Number(row.quota_bytes) || tier.bytes;
        let currentNodeBytes = 0;
        try {
          const { data } = await admin.from('fortresses_').select('crystal_matrix').eq('id', user.id).maybeSingle();
          const node = (data?.crystal_matrix || []).find((n: any) => n?.id === nodeId);
          currentNodeBytes = Math.max(0, Number(node?.rawSize) || 0);
        } catch { /* treat as a fresh store */ }
        const effectiveUsed = Math.max(0, (Number(row.used_bytes) || 0) - currentNodeBytes);
        const gate = checkQuota({ usedBytes: effectiveUsed, quotaBytes, incomingBytes });
        if (!gate.ok) {
          return NextResponse.json({ error: gate.message }, { status: 413 });
        }
      } catch (err: any) {
        if (err?.message) {
          return NextResponse.json({ error: 'Storage accounting is unavailable — please try again.' }, { status: 503 });
        }
        throw err;
      }
    }

    // Per-user Supabase bucket: every user gets their OWN private bucket,
    // created on first use. The object path is derived server-side from the
    // caller's id — the client can never aim an upload at another vault.
    const bucket = await ensureUserBucket(admin, user.id);

    // Encrypted vault blobs are opaque ciphertext; legacy blobs were plain zips.
    const objectName = `vault/${nodeId}_core.${encrypted ? 'enc' : 'zip'}`;
    const fileStorageKey = `${bucket}/${objectName}`;

    const { data, error: signError } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(objectName, { upsert: true });
    if (signError || !data?.signedUrl) {
      return NextResponse.json(
        { error: `Could not start the upload: ${signError?.message || 'unknown error'}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ uploadUrl: data.signedUrl, fileStorageKey });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
