// app/api/earth2/unlocks/route.js
// GET /api/earth2/unlocks — the account's Earth 2 unlock state.
// POST /api/earth2/unlocks — unlock one feature (body: { id }).
//
// Any signed-in user (Earth 2 is open to all, Merlin 2026-10-31).
// Unlocks persist per account in earth2_unlocks (user_id PK, unlocks JSONB).
// If the table is missing, GET returns a fresh (all-locked) state and
// POST reports setupRequired — the client keeps the unlock in memory.

import { NextResponse } from 'next/server';
import { verifyEarth2AccessSession } from '@/lib/earth2/access';
import { getServiceClient } from '@/lib/economy/supabase';
import { freshUnlocks, sanitizeUnlocks, unlockFeature, UNLOCKABLES } from '@/lib/earth2/unlocks';

export const dynamic = 'force-dynamic';

async function requireUser(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyEarth2AccessSession(token).catch(() => ({ user: null }));
  return user;
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

export async function GET(req) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: true, unlocks: freshUnlocks(), setupRequired: true });
    const { data, error } = await db
      .from('earth2_unlocks')
      .select('unlocks')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: true, unlocks: freshUnlocks(), setupRequired: true });
      return NextResponse.json({ ok: false, error: 'Could not read unlocks.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, unlocks: sanitizeUnlocks(data?.unlocks) });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

export async function POST(req) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  let body = null;
  try { body = await req.json(); } catch { /* bad body */ }
  const id = body && body.id;
  if (!UNLOCKABLES.some((u) => u.id === id)) {
    return NextResponse.json({ ok: false, error: 'Unknown feature.' }, { status: 400 });
  }
  try {
    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: true, unlocks: { [id]: true }, setupRequired: true });
    const { data, error } = await db
      .from('earth2_unlocks')
      .select('unlocks')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error && !isMissingTable(error)) {
      return NextResponse.json({ ok: false, error: 'Could not read unlocks.' }, { status: 502 });
    }
    if (error && isMissingTable(error)) {
      return NextResponse.json({ ok: true, unlocks: { [id]: true }, setupRequired: true });
    }
    const state = sanitizeUnlocks(data?.unlocks);
    unlockFeature(state, id);
    const { error: upErr } = await db
      .from('earth2_unlocks')
      .upsert({ user_id: user.id, unlocks: state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (upErr) {
      if (isMissingTable(upErr)) return NextResponse.json({ ok: true, unlocks: state, setupRequired: true });
      return NextResponse.json({ ok: false, error: 'Could not save unlock.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, unlocks: state });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
