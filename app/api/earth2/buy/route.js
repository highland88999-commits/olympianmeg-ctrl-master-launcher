// app/api/earth2/buy/route.js
// POST /api/earth2/buy { parcelId } — buy one parcel of the Earth 2
// grid with gold. The price is read from the deterministic grid
// (lib/earth2/parcels.js — PLACEHOLDER tiers until Merlin rules on
// final pricing), charged through the gold ledger, and the title is
// recorded in earth2_parcels.
//
// Open to every signed-in account (Merlin, 2026-10-31: Earth 2
// unlocked for all users). The session is verified through
// lib/earth2/access.js verifyEarth2AccessSession — the one
// definition of Earth 2 access — and the purchase itself is still
// fully charged in gold (debitGold, idempotent); there is no free
// path here.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { debitGold, creditGold, InsufficientGoldError } from '@/lib/economy/ledger';
import { parcelById, buyRefusal } from '@/lib/earth2/parcels';
import { evictHomesteadOnSaleDb } from '@/lib/earth2/building';
import { syncParcelVehicleOwner } from '@/lib/earth2/parcel-vehicles';

export const dynamic = 'force-dynamic';

async function requireEarth2Access(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyEarth2AccessSession(token).catch(() => ({ user: null }));
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
  const user = await requireEarth2Access(req);
  if (!user) return notFound();
  try {
    let body = null;
    try { body = await req.json(); } catch { body = null; }
    const parcel = parcelById(body && body.parcelId);
    if (!parcel) {
      return NextResponse.json({ ok: false, error: 'Unknown parcel.' }, { status: 400 });
    }
    // Merlin's land rule: Free Commons can never be bought. The
    // refusal is a lib-level property of the parcel itself, checked
    // before any gold moves or any table is touched.
    const refusal = buyRefusal(parcel);
    if (refusal) {
      return NextResponse.json({ ok: false, error: refusal }, { status: 400 });
    }

    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: false, setupRequired: true });

    const existing = await db
      .from('earth2_parcels')
      .select('parcel_id, owner_email')
      .eq('parcel_id', parcel.id)
      .maybeSingle();
    if (existing.error) {
      if (isMissingTable(existing.error)) {
        return NextResponse.json({ ok: false, setupRequired: true });
      }
      return NextResponse.json({ ok: false, error: 'Could not check that parcel.' }, { status: 502 });
    }
    if (existing.data) {
      return NextResponse.json(
        { ok: false, error: 'That parcel already has an owner.', ownerEmail: existing.data.owner_email },
        { status: 409 }
      );
    }

    let debit;
    try {
      debit = await debitGold(
        {
          userId: user.id,
          amountGold: parcel.priceGold,
          reason: 'earth2-buy',
          idemKey: `earth2-buy:${user.id}:${parcel.id}`,
          meta: { parcelId: parcel.id, tier: parcel.tier },
        },
        db
      );
    } catch (e) {
      if (e instanceof InsufficientGoldError) {
        return NextResponse.json({ ok: false, error: e.message, gold: e.balance }, { status: 409 });
      }
      throw e;
    }

    const ins = await db
      .from('earth2_parcels')
      .insert({
        parcel_id: parcel.id,
        owner_id: user.id,
        owner_email: user.email,
        price_gold: parcel.priceGold,
      })
      .select('parcel_id, owner_id, owner_email, price_gold, acquired_at')
      .single();
    if (ins.error) {
      // Lost a claim race after the debit landed — refund in full so
      // gold is never taken for a parcel the buyer did not get.
      await creditGold(
        {
          userId: user.id,
          amountGold: parcel.priceGold,
          reason: 'earth2-buy-refund',
          idemKey: `earth2-buy-refund:${user.id}:${parcel.id}`,
          meta: { parcelId: parcel.id },
        },
        db
      ).catch(() => {});
      return NextResponse.json(
        { ok: false, error: 'That parcel was just claimed by someone else.' },
        { status: 409 }
      );
    }

    await db.from('earth2_ledger').insert({
      user_id: user.id,
      kind: 'buy',
      parcel_id: parcel.id,
      amount_gold: -parcel.priceGold,
      counterparty: 'house',
    });

    // HOMESTEAD EVICTION (building design, 2026-10-22): this sale
    // ends any homestead claim standing on the parcel — the
    // claimant's build is packed up for them and they are notified
    // (lib/building/rights.js onParcelSold, at the DB level).
    // Best-effort: until supabase/earth2-buildings.sql runs it
    // answers setupRequired, and the sale stands regardless.
    const eviction = await evictHomesteadOnSaleDb(
      db,
      parcel.id,
      { id: user.id, email: user.email },
      ins.data && ins.data.acquired_at
    ).catch(() => null);

    // PARCEL-VEHICLE TITLE SYNC (Merlin, 2026-11-01): the vehicle
    // follows the land — if a vehicle row somehow stands on this
    // parcel (re-sale after a title wipe, auction settlement), it
    // changes hands with the title. Best-effort; the sale stands
    // regardless.
    await syncParcelVehicleOwner(db, parcel.id, user.email).catch(() => null);

    return NextResponse.json({
      ok: true,
      parcel: ins.data,
      gold: debit.balanceAfter,
      ...(eviction && eviction.evicted ? { eviction: eviction.evicted } : {}),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
