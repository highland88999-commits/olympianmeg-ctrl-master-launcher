// TEMPORARY DIAGNOSTIC ROUTE - will be removed after debugging.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { listMyFriendships } from '@/lib/friends';

export async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error, step: 'auth' }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'no admin client' }, { status: 503 });

  const userId = auth.user.id;
  const hardcoded = '16bf804e-b718-4a78-b8a0-875d8ea68996';
  
  const viaVariable = await listMyFriendships(admin, userId);
  const viaHardcoded = await listMyFriendships(admin, hardcoded);
  
  // Also test with explicit string construction
  const manual = await admin.from('friendships').select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  return NextResponse.json({
    user_id: userId,
    userId_type: typeof userId,
    userId_length: userId.length,
    hardcoded_matches: userId === hardcoded,
    via_variable_count: viaVariable.length,
    via_hardcoded_count: viaHardcoded.length,
    manual_count: (manual.data || []).length,
  });
}
