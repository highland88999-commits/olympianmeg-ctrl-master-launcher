// app/api/backpack/remove/route.js
// DELETE /api/backpack/remove
//   Remove an item from your backpack. Body: { item_id }.
//   The forged item itself is untouched — only the backpack link is removed.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';

export const DELETE = apiGuard(async function DELETE(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const item_id = String(body.item_id || '').trim();
  if (!item_id) return NextResponse.json({ error: 'Choose a backpack item.' }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: item } = await admin
    .from('backpack_items')
    .select('id')
    .eq('id', item_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: 'Item not found in your backpack.' }, { status: 404 });

  const { error: delErr } = await admin.from('backpack_items').delete().eq('id', item.id);
  if (delErr) return NextResponse.json({ error: 'Could not remove the item.' }, { status: 500 });
  return NextResponse.json({ ok: true });
});
