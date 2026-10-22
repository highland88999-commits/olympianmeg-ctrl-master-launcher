// app/api/earth2/buy/route.js
// POST /api/earth2/buy { parcelId } — buy one parcel of the Earth 2
// grid with gold. The price is read from the deterministic grid
// (lib/earth2/parcels.js — PLACEHOLDER tiers until Merlin rules on
// final pricing), charged through the gold ledger, and the title is
// recorded in earth2_parcels.
//
// OWNER-LOCKED like every /api/earth2/* route: non-owners get a 404.

import { NextResponse } from 'next/server';
import { verifyOwnerSession } from '@/lib/owner';
import { getServiceClient } from '@/lib/economy/supabase';
import { debitGold, creditGold, InsufficientGoldError } from '@/lib/economy/ledger';
import { parcelById } from '@/lib/earth2/parcels';

export const dynamic = 'force-dynamic';

async function requireOwner(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyOwnerSession(token).catch(() => ({ user: null }));
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
  const user = await requireOwner(req);
  if (!user) return notFound();
  try {
    let body = null;
    try { body = await req.json(); } catch { body = null; }
    const parcel = parcelById(body && body.parcelId);
    if (!parcel) {
      return NextResponse.json({ ok: false, error: 'Unknown parcel.' }, { status: 400 });
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

    return NextResponse.json({ ok: true, parcel: ins.data, gold: debit.balanceAfter });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
