export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';

// nexus carries NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET; accept either name.
function bucketName(): string | undefined {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
}

function storageConfigError(): string | null {
  if (!process.env.GCP_PROJECT_ID || !process.env.GCP_SERVICE_ACCOUNT_KEY) {
    return 'Cloud storage is not connected yet (missing GCP_PROJECT_ID / GCP_SERVICE_ACCOUNT_KEY).';
  }
  if (!bucketName()) {
    return 'Cloud storage bucket is not configured.';
  }
  return null;
}

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

    if (!fileStorageKey.startsWith(`vaults/${user.id}/`)) {
      return NextResponse.json({ error: 'Permission denied. Security signature mismatch.' }, { status: 403 });
    }

    const configError = storageConfigError();
    if (configError) return NextResponse.json({ error: configError }, { status: 500 });

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

    const bucket = storage.bucket(bucketName()!);
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
