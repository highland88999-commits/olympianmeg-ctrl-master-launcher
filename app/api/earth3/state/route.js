// app/api/earth3/state/route.js
// GET /api/earth3/state — Earth 3's land picture: every claimed
// tile, and the caller's own claims. The grid itself is
// deterministic code (lib/earth3/claims.js); only ownership is
// state, so only ownership is read here.
//
// ACCESS: any signed-in account (Earth 3 is open to all signed-in
// users, the same unlock Earth 2 got on 2026-10-31). Anyone else
// — signed out or an unvalidated token — gets a 404: this surface
// does not admit it exists. Verification is server-side on a
// validated session, never a client-side claim. While
// supabase/earth3.sql is unrun (Merlin's green light), the route
// answers setupRequired and the page falls back to its
// device-local claims.

import { NextResponse } from 'next/server';
import { verifyEarth3AccessSession } from '@/lib/earth3/access';
import { getServiceClient } from '@/lib/economy/supabase';

export const dynamic = 'force-dynamic';

async function requireAccess(req) {
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

export async function GET(req) {
  const user = await requireAccess(req);
  if (!user) return notFound();
  try {
    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: true, setupRequired: true, tiles: [], mine: [] });

    const tilesRes = await db
      .from('earth3_tiles')
      .select('tile_id, owner_id, owner_email, price_gold, acquired_at')
      .order('acquired_at', { ascending: true });
    if (tilesRes.error) {
      if (isMissingTable(tilesRes.error)) {
        return NextResponse.json({ ok: true, setupRequired: true, tiles: [], mine: [] });
      }
      return NextResponse.json({ ok: false, error: 'Could not read Earth 3.' }, { status: 502 });
    }

    const tiles = tilesRes.data || [];
    return NextResponse.json({
      ok: true,
      tiles,
      mine: tiles.filter((t) => String(t.owner_id) === String(user.id)),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
