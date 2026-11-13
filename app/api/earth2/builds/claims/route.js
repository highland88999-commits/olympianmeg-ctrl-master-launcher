// app/api/earth2/builds/claims/route.js
// POST   /api/earth2/builds/claims { parcelId } — claim a homestead
//        on an ownable, unsold parcel (building permit only: no
//        title, no rent, no spawn — lib/building/rights.js).
// DELETE /api/earth2/builds/claims?parcelId=E2-0001 — release the
//        caller's own active claim.
//
// The decisions themselves are the pure engine's (claimHomestead /
// releaseClaim run over the live rows), so the route and the
// chamber's local preview can never disagree about the rules.
// Open to every signed-in account (Merlin, 2026-10-31: Earth 2
// unlocked for all users). The session is verified through
// lib/earth2/access.js verifyEarth2AccessSession — the one
// definition of Earth 2 access. Until supabase/earth2-buildings.sql runs,
// both verbs answer setupRequired.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { parcelById } from '@/lib/earth2/parcels';
import {
  earth2BuildContext,
  claimFromRow,
} from '@/lib/earth2/building';
import {
  claimHomestead,
  releaseClaim,
} from '@/lib/building/rights';

export const dynamic = 'force-dynamic';

function notFound() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

function setupRequired() {
  return NextResponse.json({ ok: false, setupRequired: true });
}

async function requireEarth2Access(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyEarth2AccessSession(token).catch(() => ({ user: null }));
  return user;
}

async function loadOwnerRow(db, parcelId) {
  const res = await db
    .from('earth2_parcels')
    .select('parcel_id, owner_id, owner_email, price_gold, acquired_at')
    .eq('parcel_id', parcelId)
    .maybeSingle();
  if (res.error) {
    if (isMissingTable(res.error)) return { setupRequired: true };
    return { row: null };
  }
  return { row: res.data || null };
}

async function loadActiveClaim(db, parcelId) {
  const res = await db
    .from('earth2_homestead_claims')
    .select('id, parcel_id, builder_id, builder_email, status, claimed_at, ended_at, end_reason')
    .eq('parcel_id', parcelId)
    .eq('status', 'active')
    .maybeSingle();
  if (res.error) {
    if (isMissingTable(res.error)) return { setupRequired: true };
    return { claim: null };
  }
  return { claim: claimFromRow(res.data) };
}

export const POST = noCache(apiGuard(async function POST(req) {
  const user = await requireEarth2Access(req);
  if (!user) return notFound();

  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const parcel = parcelById(body && body.parcelId);
  if (!parcel) {
    return NextResponse.json({ ok: false, error: 'Unknown parcel.' }, { status: 400 });
  }

  const db = await getServiceClient();
  if (!db) return setupRequired();

  const owner = await loadOwnerRow(db, parcel.id);
  if (owner.setupRequired) return setupRequired();
  const active = await loadActiveClaim(db, parcel.id);
  if (active.setupRequired) return setupRequired();

  const existing = active.claim ? [active.claim] : [];
  const result = claimHomestead(
    existing,
    { id: user.id, email: user.email },
    earth2BuildContext(parcel, owner.row, active.claim),
    Date.now()
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  const ins = await db
    .from('earth2_homestead_claims')
    .insert({
      parcel_id: parcel.id,
      builder_id: user.id,
      builder_email: user.email,
    })
    .select('id, parcel_id, builder_id, builder_email, status, claimed_at, ended_at, end_reason')
    .single();
  if (ins.error) {
    if (isMissingTable(ins.error)) return setupRequired();
    // The one-active-claim index is the race-proof backstop.
    if (String(ins.error.code || '') === '23505') {
      return NextResponse.json(
        { ok: false, error: 'Another builder holds the homestead claim on this parcel.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: 'Could not claim that homestead.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, claim: claimFromRow(ins.data) });
}));

export const DELETE = noCache(apiGuard(async function DELETE(req) {
  const user = await requireEarth2Access(req);
  if (!user) return notFound();

  const parcel = parcelById(new URL(req.url).searchParams.get('parcelId'));
  if (!parcel) {
    return NextResponse.json({ ok: false, error: 'Unknown parcel.' }, { status: 400 });
  }

  const db = await getServiceClient();
  if (!db) return setupRequired();

  const active = await loadActiveClaim(db, parcel.id);
  if (active.setupRequired) return setupRequired();
  if (!active.claim) {
    return NextResponse.json(
      { ok: false, error: 'No active homestead claim on that parcel.' },
      { status: 404 }
    );
  }

  const result = releaseClaim([active.claim], { id: user.id, email: user.email }, parcel.id, Date.now());
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  }

  const upd = await db
    .from('earth2_homestead_claims')
    .update({ status: 'released', ended_at: new Date().toISOString(), end_reason: 'released' })
    .eq('id', active.claim.id)
    .eq('status', 'active');
  if (upd.error) {
    if (isMissingTable(upd.error)) return setupRequired();
    return NextResponse.json({ ok: false, error: 'Could not release that claim.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, claim: result.claim });
}));
