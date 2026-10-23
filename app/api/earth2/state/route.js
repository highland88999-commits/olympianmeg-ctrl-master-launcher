// app/api/earth2/state/route.js
// GET /api/earth2/state — the Earth 2 test chamber's whole picture:
// parcel ownership rows, the owner's gold balance, the gold forge's
// accrual, and the recent Phase 2 ledger.
//
// ACCESS (Merlin, 2026-10-21; proof of concept 2026-10-23): while
// Earth 2 is a test build this read-only state answers accounts
// with Earth 2 access — the owner, plus the one named POC guest
// (lib/earth2/access.js). The chamber cannot render, and no walker
// can be placed on their own parcel, without this picture, so the
// guest's session is admitted HERE and nowhere else new: the write
// routes (buy / forge / rent / builds) stay owner-only. Anyone else
// — signed out or signed in as anyone else — gets a 404: this
// surface does not admit it exists. Verification is server-side on
// a validated session, never a client-side claim.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { getBalance } from '@/lib/economy/ledger';
import { forgeAccrued } from '@/lib/earth2/forge';

export const dynamic = 'force-dynamic';

async function requireAccess(req) {
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

function setupState(gold) {
  return NextResponse.json({
    ok: true,
    setupRequired: true,
    parcels: [],
    gold,
    forge: { accrued: 0, lastClaim: null },
    ledger: [],
  });
}

export async function GET(req) {
  const user = await requireAccess(req);
  if (!user) return notFound();
  try {
    const db = await getServiceClient();
    if (!db) return setupState(null);

    let gold = null;
    try { gold = await getBalance(user.id, db); } catch { gold = null; }

    const parcelsRes = await db
      .from('earth2_parcels')
      .select('parcel_id, owner_id, owner_email, price_gold, acquired_at')
      .order('acquired_at', { ascending: true });
    if (parcelsRes.error) {
      if (isMissingTable(parcelsRes.error)) return setupState(gold);
      return NextResponse.json({ ok: false, error: 'Could not read Earth 2.' }, { status: 502 });
    }

    const ledgerRes = await db
      .from('earth2_ledger')
      .select('id, user_id, kind, parcel_id, amount_gold, counterparty, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (ledgerRes.error) {
      if (isMissingTable(ledgerRes.error)) return setupState(gold);
      return NextResponse.json({ ok: false, error: 'Could not read Earth 2.' }, { status: 502 });
    }

    const forgeRes = await db
      .from('earth2_ledger')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('kind', 'forge')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastClaim = forgeRes.data ? Date.parse(forgeRes.data.created_at) : null;

    return NextResponse.json({
      ok: true,
      setupRequired: false,
      parcels: parcelsRes.data || [],
      gold,
      forge: { accrued: forgeAccrued(lastClaim, Date.now()), lastClaim },
      ledger: ledgerRes.data || [],
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
