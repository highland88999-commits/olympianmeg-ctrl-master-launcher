// TEMPORARY DIAGNOSTIC ROUTE - will be removed after debugging.
// Tests the friendships query path with detailed output.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { listMyFriendships } from '@/lib/friends';

export async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error, step: 'auth' }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'no admin client', step: 'client' }, { status: 503 });

  const userId = auth.user.id;
  
  // Test 1: raw count of friendships table
  let rawCount = -1, rawError = null;
  try {
    const { count, error } = await admin.from('friendships').select('*', { count: 'exact', head: true });
    rawCount = count;
    rawError = error ? error.message : null;
  } catch (e) { rawError = String(e && e.message || e); }

  // Test 2: listMyFriendships
  let mine = [], mineError = null;
  try {
    mine = await listMyFriendships(admin, userId);
  } catch (e) { mineError = String(e && e.message || e); }

  // Test 3: direct or-filter query (same as listMyFriendships)
  let direct = [], directError = null;
  try {
    const { data, error } = await admin.from('friendships').select('*')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    direct = data || [];
    directError = error ? error.message : null;
  } catch (e) { directError = String(e && e.message || e); }

  return NextResponse.json({
    user_id: userId,
    raw_table_count: rawCount,
    raw_error: rawError,
    listMyFriendships_count: mine.length,
    listMyFriendships_error: mineError,
    direct_or_query_count: direct.length,
    direct_error: directError,
    sample: mine.slice(0, 2).map(r => ({ id: r.id.slice(0,8), status: r.status })),
  });
}
