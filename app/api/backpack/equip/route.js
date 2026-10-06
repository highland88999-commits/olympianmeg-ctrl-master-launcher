// app/api/backpack/equip/route.js
// PATCH /api/backpack/equip
//   Equip or unequip a backpack item, optionally moving its slot.
//   Body: { item_id, equipped, slot? }
//   - Equipping an item into a slot unequips anything else you have
//     equipped in that same slot (one active item per slot).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';

export const PATCH = apiGuard(async function PATCH(req) {
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
  const equipped = body.equipped === true;

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: item, error: loadErr } = await admin
    .from('backpack_items')
    .select('*')
    .eq('id', item_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (loadErr || !item) {
    return NextResponse.json({ error: 'Item not found in your backpack.' }, { status: 404 });
  }

  const patch = { equipped };
  if (body.slot !== undefined) {
    patch.slot = String(body.slot || '').trim().slice(0, 40) || null;
  }

  if (equipped) {
    const targetSlot = patch.slot !== undefined ? patch.slot : item.slot;
    if (targetSlot) {
      // One active item per slot: unequip the others in this slot.
      await admin
        .from('backpack_items')
        .update({ equipped: false })
        .eq('user_id', user.id)
        .eq('slot', targetSlot)
        .neq('id', item.id);
    }
  }

  const { data: updated, error: upErr } = await admin
    .from('backpack_items')
    .update(patch)
    .eq('id', item.id)
    .select('*')
    .single();
  if (upErr) return NextResponse.json({ error: 'Could not update the item.' }, { status: 500 });
  return NextResponse.json({ ok: true, item: updated });
});
