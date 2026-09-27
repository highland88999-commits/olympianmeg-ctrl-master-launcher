import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET() {
  try {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


