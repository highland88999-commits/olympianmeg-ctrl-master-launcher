export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isOwnerKey, isSupabaseVaultKey, vaultKeyOwner } from '@/lib/fortress/server';
import { getFortressAdmin } from '@/lib/fortress/server';

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

    const { fileStorageKey } = await req.json();
    if (!fileStorageKey) return NextResponse.json({ error: 'fileStorageKey required' }, { status: 400 });

    // Ownership: the key must live in the caller's own vault — either their
    // Supabase per-user bucket or their legacy GCS prefix. Anything else is
    // refused, so no one can ever open another user's file.
    if (!isOwnerKey(user.id, fileStorageKey)) {
      return NextResponse.json({ error: 'Permission denied. Security signature mismatch.' }, { status: 403 });
    }

    // New per-user Supabase buckets.
    if (isSupabaseVaultKey(fileStorageKey)) {
      const admin = await getFortressAdmin();
      if (!admin) {
        return NextResponse.json({ error: 'Storage is unavailable right now. Please try again.' }, { status: 503 });
      }
      const owner = vaultKeyOwner(fileStorageKey);
      const bucket = `fortress-${owner}`;
      const path = fileStorageKey.slice(bucket.length + 1);
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        return NextResponse.json(
          { error: `Could not open the file: ${error?.message || 'unknown error'}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ downloadUrl: data.signedUrl });
    }

    // Legacy GCS fallback for files stored before the per-user migration.
    const { Storage } = await import('@google-cloud/storage');
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!process.env.GCP_PROJECT_ID || !process.env.GCP_SERVICE_ACCOUNT_KEY || !bucketName) {
      return NextResponse.json({ error: 'Cloud storage is not connected yet.' }, { status: 500 });
    }
    let serviceAccount: Record<string, unknown>;
    try {
      serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY as string);
    } catch {
      return NextResponse.json({ error: 'Cloud storage credential is invalid.' }, { status: 500 });
    }

    const storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      credentials: serviceAccount,
    });

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileStorageKey);

    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });

    return NextResponse.json({ downloadUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
