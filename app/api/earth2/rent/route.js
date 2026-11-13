// app/api/earth2/rent/route.js
// POST /api/earth2/rent { parcelId, entryId? } — THE RENT ENGINE.
//
// The Earth 2 plan's rule: stepping onto owned land charges the
// visitor 2 gold — the minimum one-minute fee, collected the moment
// a foot touches the parcel — split 1 gold to the land's owner and
// 1 gold to the HOUSE (Olympus, olympiannexus@gmail.com). Your own
// land is always free; unowned land is free. Both legs land in
// earth2_ledger beside the visitor's charge, and every gold movement
// runs through the gold ledger with an idempotency key built from
// the entry id, so a retried entry never double-charges.
//
// In this build any signed-in visitor can be charged rent; the
// engine is written for the real rule, so the gate opening changes
// nothing about the math — only who may walk in.
//
// Open to every signed-in account (Merlin, 2026-10-31: Earth 2
// unlocked for all users). The session is verified through
// lib/earth2/access.js verifyEarth2AccessSession — the one
// definition of Earth 2 access. The visitor pays; the parcel owner
// and the house split it; your own land is always free.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { OWNER_EMAIL } from '@/lib/owner';
import { getServiceClient } from '@/lib/economy/supabase';
import { debitGold, creditGold, InsufficientGoldError } from '@/lib/economy/ledger';
import { parcelById } from '@/lib/earth2/parcels';

export const dynamic = 'force-dynamic';

// The plan's numbers: 2 gold the moment you step in (the minimum
// one-minute fee), split evenly between owner and house.
const RENT_FEE_GOLD = 2;
const RENT_OWNER_SHARE_GOLD = 1;
const RENT_HOUSE_SHARE_GOLD = 1;

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

// Resolve an account's user id from its email (the oracle server's
// pattern — the account list is small). Null when unresolvable.
async function resolveUserIdByEmail(db, email) {
  try {
    const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (error) return null;
    const found = (data?.users || []).find(
      (u) => String(u?.email || '').toLowerCase() === String(email || '').toLowerCase()
    );
    return found ? found.id : null;
  } catch {
    return null;
  }
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
    // Free Commons are open land for everyone — no owner can ever
    // exist for them, so no rent can ever be charged. Answered from
    // the grid itself, before any table is touched.
    if (!parcel.ownable) {
      return NextResponse.json({
        ok: true,
        charged: 0,
        reason: 'free-commons',
        message: 'Free Commons — open land for everyone, no rent ever.',
      });
    }

    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: false, setupRequired: true });

    const rowRes = await db
      .from('earth2_parcels')
      .select('parcel_id, owner_id, owner_email')
      .eq('parcel_id', parcel.id)
      .maybeSingle();
    if (rowRes.error) {
      if (isMissingTable(rowRes.error)) {
        return NextResponse.json({ ok: false, setupRequired: true });
      }
      return NextResponse.json({ ok: false, error: 'Could not check that parcel.' }, { status: 502 });
    }

    const row = rowRes.data;
    if (!row) {
      return NextResponse.json({
        ok: true,
        charged: 0,
        reason: 'unowned',
        message: 'Free land — no owner, no rent.',
      });
    }
    if (row.owner_id === user.id) {
      return NextResponse.json({
        ok: true,
        charged: 0,
        reason: 'own-parcel',
        message: 'Your own land is always free.',
      });
    }

    const entryId =
      body && typeof body.entryId === 'string' && body.entryId
        ? body.entryId.slice(0, 64)
        : `${Date.now()}`;
    const base = `earth2-rent:${user.id}:${parcel.id}:${entryId}`;

    let debit;
    try {
      debit = await debitGold(
        {
          userId: user.id,
          amountGold: RENT_FEE_GOLD,
          reason: 'earth2-rent',
          idemKey: base,
          meta: { parcelId: parcel.id, ownerEmail: row.owner_email },
        },
        db
      );
    } catch (e) {
      if (e instanceof InsufficientGoldError) {
        return NextResponse.json({ ok: false, error: e.message, gold: e.balance }, { status: 409 });
      }
      throw e;
    }

    // The two legs. If either fails after the debit landed, refund
    // the visitor in full — rent is never kept for a failed split.
    const houseId = await resolveUserIdByEmail(db, OWNER_EMAIL);
    try {
      await creditGold(
        {
          userId: row.owner_id,
          amountGold: RENT_OWNER_SHARE_GOLD,
          reason: 'earth2-rent-share',
          idemKey: `${base}:owner`,
          meta: { parcelId: parcel.id, visitorEmail: user.email },
        },
        db
      );
      if (houseId) {
        await creditGold(
          {
            userId: houseId,
            amountGold: RENT_HOUSE_SHARE_GOLD,
            reason: 'earth2-rent-house',
            idemKey: `${base}:house`,
            meta: { parcelId: parcel.id, visitorEmail: user.email },
          },
          db
        );
      }
    } catch (e) {
      await creditGold(
        {
          userId: user.id,
          amountGold: RENT_FEE_GOLD,
          reason: 'earth2-rent-refund',
          idemKey: `${base}:refund`,
          meta: { parcelId: parcel.id },
        },
        db
      ).catch(() => {});
      return NextResponse.json(
        { ok: false, error: 'Rent could not be settled — nothing was charged.' },
        { status: 502 }
      );
    }

    await db.from('earth2_ledger').insert([
      {
        user_id: user.id,
        kind: 'rent',
        parcel_id: parcel.id,
        amount_gold: -RENT_FEE_GOLD,
        counterparty: row.owner_email,
      },
      {
        user_id: row.owner_id,
        kind: 'rent',
        parcel_id: parcel.id,
        amount_gold: RENT_OWNER_SHARE_GOLD,
        counterparty: user.email,
      },
      {
        user_id: houseId,
        kind: 'rent',
        parcel_id: parcel.id,
        amount_gold: RENT_HOUSE_SHARE_GOLD,
        counterparty: 'house',
      },
    ]);

    return NextResponse.json({
      ok: true,
      charged: RENT_FEE_GOLD,
      ownerShare: RENT_OWNER_SHARE_GOLD,
      houseShare: RENT_HOUSE_SHARE_GOLD,
      gold: debit.balanceAfter,
      message: `Rent paid: ${RENT_FEE_GOLD} gold — 1 to the owner, 1 to the house.`,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
