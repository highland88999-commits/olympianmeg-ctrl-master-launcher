// app/api/earth2/builds/route.js
// GET  /api/earth2/builds?parcelId=E2-0001 — every build standing
//      on a parcel (builds are visible to world visitors).
// PUT  /api/earth2/builds { parcelId, pieces } — save the caller's
//      build on a parcel. The write is RIGHTS-CHECKED server-side
//      (lib/earth2/building.js → lib/building/rights.js): owners
//      write their own parcels, homestead claimants write their
//      claimed parcels, everyone else is refused. Free Commons and
//      protected ground refuse every write.
//
// Open to every signed-in account (Merlin, 2026-10-31: Earth 2
// unlocked for all users). The session is verified through
// lib/earth2/access.js verifyEarth2AccessSession — the one
// definition of Earth 2 access. The rights check below is what
// actually decides who may write; the gate only decides who may ask.
// Until supabase/earth2-buildings.sql runs (Merlin's green light),
// both verbs answer setupRequired and nothing pretends to persist.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { parcelById } from '@/lib/earth2/parcels';
import {
  canBuildOnEarth2Parcel,
  validateEarth2Build,
  claimFromRow,
  buildFromRow,
} from '@/lib/earth2/building';

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

function setupRequired(extra) {
  return NextResponse.json({ ok: false, setupRequired: true, ...(extra || {}) });
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

export const GET = noCache(apiGuard(async function GET(req) {
  const user = await requireEarth2Access(req);
  if (!user) return notFound();

  const parcelId = new URL(req.url).searchParams.get('parcelId');
  const parcel = parcelById(parcelId);
  if (!parcel) {
    return NextResponse.json({ ok: false, error: 'Unknown parcel.' }, { status: 400 });
  }

  const db = await getServiceClient();
  if (!db) return setupRequired({ builds: [] });

  const res = await db
    .from('earth2_builds')
    .select('ground_type, ground_id, owner_id, owner_email, pieces, updated_at')
    .eq('ground_type', 'earth2-parcel')
    .eq('ground_id', parcel.id)
    .order('updated_at', { ascending: true });
  if (res.error) {
    if (isMissingTable(res.error)) return setupRequired({ builds: [] });
    return NextResponse.json({ ok: false, error: 'Could not load builds.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, builds: (res.data || []).map(buildFromRow) });
}));

export const PUT = noCache(apiGuard(async function PUT(req) {
  const user = await requireEarth2Access(req);
  if (!user) return notFound();

  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const parcel = parcelById(body && body.parcelId);
  if (!parcel) {
    return NextResponse.json({ ok: false, error: 'Unknown parcel.' }, { status: 400 });
  }
  if (!body || !Array.isArray(body.pieces)) {
    return NextResponse.json({ ok: false, error: 'Missing build pieces.' }, { status: 400 });
  }

  const db = await getServiceClient();
  if (!db) return setupRequired();

  const owner = await loadOwnerRow(db, parcel.id);
  if (owner.setupRequired) return setupRequired();
  const claim = await loadActiveClaim(db, parcel.id);
  if (claim.setupRequired) return setupRequired();

  const verdict = canBuildOnEarth2Parcel(
    { id: user.id, email: user.email },
    parcel,
    owner.row,
    claim.claim
  );
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, error: 'You have no building rights on this parcel.', reason: verdict.reason },
      { status: 403 }
    );
  }

  const parsed = validateEarth2Build({
    groundType: 'earth2-parcel',
    groundId: parcel.id,
    ownerId: user.id,
    ownerEmail: user.email,
    pieces: body.pieces,
  });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'That build is not valid.', errors: parsed.errors }, { status: 400 });
  }

  const up = await db
    .from('earth2_builds')
    .upsert(
      {
        ground_type: 'earth2-parcel',
        ground_id: parcel.id,
        owner_id: user.id,
        owner_email: user.email,
        pieces: parsed.build.pieces,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ground_type,ground_id,owner_id' }
    )
    .select('ground_type, ground_id, owner_id, owner_email, pieces, updated_at')
    .single();
  if (up.error) {
    if (isMissingTable(up.error)) return setupRequired();
    return NextResponse.json({ ok: false, error: 'Could not save that build.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, build: buildFromRow(up.data), via: verdict.via });
}));
