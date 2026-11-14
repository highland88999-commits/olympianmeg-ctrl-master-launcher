// app/api/earth2/parcel-vehicles/route.js
// GET /api/earth2/parcel-vehicles — the caller's parcel vehicles.
// POST /api/earth2/parcel-vehicles — park a vehicle on owned land
//   (body: { parcelId, slug, x, z, heading, slot? }).
//
// One vehicle per SLOT (Merlin, 2026-11-13): the row key is
// (parcel_id, vehicle_slot) — a base can hold a plane AND a
// Lambo. A slot defaults to the slug and must equal it; the
// legacy single-vehicle row is a row whose slot is its slug.
//
// Any signed-in user (Earth 2 is open to all, Merlin 2026-10-31).
// OWNERSHIP LAW (Merlin, 2026-11-01): only the parcel's title holder
// may set its vehicle, and owner_email is stamped from the
// earth2_parcels title — never from the request body. If the table
// is missing, GET returns setupRequired and POST reports
// setupRequired — the client keeps the choice in the device ledger.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { modelSpec } from '@/lib/earth2/vehicles';
import { parcelVehicleSource } from '@/lib/earth2/parcel-vehicle-catalog';
import { parcelTitleEmail } from '@/lib/earth2/parcel-vehicles';

export const dynamic = 'force-dynamic';

async function requireUser(req) {
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

export async function GET(req) {
  const user = await requireUser(req);
  if (!user || !user.email) return notFound();
  try {
    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: true, vehicles: [], setupRequired: true });
    const { data, error } = await db
      .from('earth2_parcel_vehicles')
      .select('parcel_id, vehicle_slot, owner_email, vehicle_slug, vehicle_name, vehicle_source, x, z, heading, updated_at')
      .ilike('owner_email', user.email);
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: true, vehicles: [], setupRequired: true });
      return NextResponse.json({ ok: false, error: 'Could not read parcel vehicles.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, vehicles: data || [] });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

export async function POST(req) {
  const user = await requireUser(req);
  if (!user || !user.email) return notFound();
  try {
    let body = null;
    try { body = await req.json(); } catch { body = null; }
    const parcelId = body && typeof body.parcelId === 'string' ? body.parcelId : null;
    const slug = body && typeof body.slug === 'string' ? body.slug : null;
    const slot = body && typeof body.slot === 'string' ? body.slot : slug;
    const x = body && Number.isFinite(body.x) ? body.x : null;
    const z = body && Number.isFinite(body.z) ? body.z : null;
    const heading = body && Number.isFinite(body.heading) ? body.heading : 0;
    if (!parcelId || !slug || x === null || z === null) {
      return NextResponse.json({ ok: false, error: 'parcelId, slug, x and z are required.' }, { status: 400 });
    }
    // A slotted key names its own machine: the slot must be the slug.
    if (slot !== slug) {
      return NextResponse.json({ ok: false, error: 'slot must match slug.' }, { status: 400 });
    }
    const spec = modelSpec(slug);
    if (!spec) {
      return NextResponse.json({ ok: false, error: 'Unknown vehicle.' }, { status: 400 });
    }
    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: false, setupRequired: true });
    // The title is the gate: only the parcel's owner may park here,
    // and the row carries the title's email, not the request's.
    const titleEmail = await parcelTitleEmail(db, parcelId);
    if (!titleEmail || String(titleEmail).toLowerCase() !== String(user.email).toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'That land is not yours.' }, { status: 403 });
    }
    const row = {
      parcel_id: parcelId,
      vehicle_slot: slot,
      owner_email: titleEmail,
      vehicle_slug: slug,
      vehicle_name: spec.name,
      vehicle_source: parcelVehicleSource(slug),
      x,
      z,
      heading,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db
      .from('earth2_parcel_vehicles')
      .upsert(row, { onConflict: 'parcel_id,vehicle_slot' });
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: false, setupRequired: true });
      return NextResponse.json({ ok: false, error: 'Could not save the vehicle.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, vehicle: row });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
