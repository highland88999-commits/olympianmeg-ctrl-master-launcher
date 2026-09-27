export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';

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

    const { nodeId } = await req.json();
    if (!nodeId) return NextResponse.json({ error: 'Crystal Node ID required' }, { status: 400 });

    const fileStorageKey = `vaults/${user.id}/${nodeId}_core.zip`;

    const storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY || '{}'),
    });

    const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET!);
    const file = bucket.file(fileStorageKey);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: 'application/zip'
    });

    return NextResponse.json({ uploadUrl, fileStorageKey });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


