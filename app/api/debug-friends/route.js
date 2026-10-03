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
  if (!admin) return NextResponse.json({ error: 'no admin client', step: 'client' }, { status: 503 });

  const userId = auth.user.id;
  
  let mine = [], mineError = null;
  try {
    mine = await listMyFriendships(admin, userId);
  } catch (e) { mineError = String(e && e.message || e); }

  return NextResponse.json({
    user_id: userId,
    listMyFriendships_count: mine.length,
    listMyFriendships_error: mineError,
    // Show the ACTUAL deployed function code!
    function_code: listMyFriendships.toString().slice(0, 800),
  });
}
