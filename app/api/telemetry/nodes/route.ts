// FILE: app/api/telemetry/nodes/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // Count distinct active nodes/sessions logged within the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { count, error } = await supabaseAdmin
      .from('central_telemetry')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fiveMinutesAgo);

    if (error) throw error;

    // Ensure a baseline of at least 1 active operator if testing solo
    const activeNodes = Math.max(count || 1, 1);

    return NextResponse.json({
      status: 'ONLINE',
      activeNodes,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'DEGRADED', activeNodes: 1, error: error.message }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { repositoryName, actionType, details } = await req.json();

    await supabaseAdmin.from('central_telemetry').insert([{
      repository_name: repositoryName || 'Olympus-Active-Node',
      action_type: actionType || 'heartbeat',
      details: details || { timestamp: new Date().toISOString() }
    }]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
