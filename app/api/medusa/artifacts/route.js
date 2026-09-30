export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiGuard } from '@/lib/api-guard';

// Created lazily inside the handler: creating it at module level crashes
// `next build` when env vars aren't set (page data collection imports this
// module), and would bake credentials into the build otherwise.
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createClient(url, key);
}

export const GET = apiGuard(async function GET() {
  try {
    const supabase = getClient();
    const { data, error } = await supabase.storage.from('artifacts').list();
    if (error) throw error;

    const files = data.map(file => {
      const { data: publicUrlData } = supabase.storage.from('artifacts').getPublicUrl(file.name);
      return {
        url: publicUrlData.publicUrl,
        date: file.created_at
      };
    });

    return NextResponse.json(files, { status: 200 });
  } catch (error) {
    const notConfigured = /not configured/i.test(error?.message || '');
    return NextResponse.json(
      { error: notConfigured ? 'The artifact gallery is not connected yet.' : 'Could not load the gallery.' },
      { status: notConfigured ? 503 : 500 }
    );
  }
});
