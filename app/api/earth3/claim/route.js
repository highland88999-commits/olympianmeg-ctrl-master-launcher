// app/api/earth3/claim/route.js
// POST /api/earth3/claim { tileId } — claim one tile of Earth 3's
// ten-billion-tile grid. Claims are FREE while the world is under
// construction (lib/earth3/claims.js CLAIM_PRICE_GOLD = 0 — the
// one place that changes when Merlin rules on pricing), so no
// gold moves here; the title is recorded in earth3_tiles and the
// claim is written to earth3_ledger.
//
// Open to every signed-in account (Earth 3 is open to all
// signed-in users, the same unlock Earth 2 got on 2026-10-31).
// The session is verified through lib/earth3/access.js
// verifyEarth3AccessSession — the one definition of Earth 3
// access — and the claim guard itself (Free Commons, already
// claimed, one claim per user) is the lib-level law in
// lib/earth3/claims.js, checked before any table is touched.
// The tile_id primary key is the race protection: two claims
// landing together, one wins, the other gets a 409.

import { NextResponse } from 'next/server';
import { verifyEarth3AccessSession } from '@/lib/earth3/access';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  tileInfo,
  claimRefusal,
  claimTile,
  CLAIM_PRICE_GOLD,
} from '@/lib/earth3/claims';

export const dynamic = 'force-dynamic';

async function requireEarth3Access(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyEarth3AccessSession(token).catch(() => ({ user: null }));
  return user;
}

function notFound() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

export async function POST(req) {
  const user = await requireEarth3Access(req);
  if (!user) return notFound();
  try {
    let body = null;
    try { body = await req.json(); } catch { body = null; }
    const info = tileInfo(body && body.tileId);
    if (!info) {
      return NextResponse.json({ ok: false, error: 'Unknown tile.' }, { status: 400 });
    }
    // Merlin's land law: Free Commons can never be claimed. The
    // refusal is a lib-level property of the tile itself, checked
    // before any table is touched.
    if (!info.ownable || info.kind === 'commons') {
      return NextResponse.json(
        { ok: false, error: 'Free Commons tiles are open land for everyone — they can never be claimed, bought, sold, or rented.' },
        { status: 400 }
      );
    }

    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: false, setupRequired: true });

    const rowsRes = await db
      .from('earth3_tiles')
      .select('tile_id, owner_id, owner_email, price_gold, acquired_at');
    if (rowsRes.error) {
      if (isMissingTable(rowsRes.error)) {
        return NextResponse.json({ ok: false, setupRequired: true });
      }
      return NextResponse.json({ ok: false, error: 'Could not check that tile.' }, { status: 502 });
    }
    const rows = rowsRes.data || [];

    // The full guard, against the live rows: already claimed,
    // and the one-claim-per-user cap.
    const liveRefusal = claimRefusal(info.id, rows, user);
    if (liveRefusal) {
      const status = liveRefusal === 'That tile already has an owner.' ? 409 : 400;
      return NextResponse.json({ ok: false, error: liveRefusal }, { status });
    }

    const computed = claimTile(rows, info.id, user, Date.now());
    if (!computed.ok) {
      return NextResponse.json({ ok: false, error: computed.error }, { status: 400 });
    }

    const ins = await db
      .from('earth3_tiles')
      .insert({
        tile_id: computed.row.tile_id,
        owner_id: computed.row.owner_id,
        owner_email: computed.row.owner_email,
        price_gold: CLAIM_PRICE_GOLD,
      })
      .select('tile_id, owner_id, owner_email, price_gold, acquired_at')
      .single();
    if (ins.error) {
      if (String(ins.error.code || '') === '23505') {
        return NextResponse.json(
          { ok: false, error: 'That tile was just claimed by someone else.' },
          { status: 409 }
        );
      }
      if (isMissingTable(ins.error)) {
        return NextResponse.json({ ok: false, setupRequired: true });
      }
      return NextResponse.json({ ok: false, error: 'Could not record that claim.' }, { status: 502 });
    }

    await db.from('earth3_ledger').insert({
      user_id: user.id,
      kind: 'claim',
      tile_id: ins.data.tile_id,
      amount_gold: 0,
      counterparty: 'house',
    }).catch(() => {});

    return NextResponse.json({ ok: true, tile: ins.data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
