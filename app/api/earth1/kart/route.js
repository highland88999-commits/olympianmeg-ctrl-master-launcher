// app/api/earth1/kart/route.js
// Earth 1 Mario Kart server home (Merlin, 2026-11-15): ONE ORB = ONE
// MISSILE, tracked in Supabase — a per-user missile inventory the
// client reads and spends, plus the combat events that make hits on
// other players real shared state.
//
// GET?action=count — the caller's missile count ({ missiles }).
// POST { action }:
//   'grant'  — +1 missile (one orb collected), returns { missiles }.
//   'spend'  — -1 missile if > 0, returns { ok, missiles }.
//   'report' — insert a combat event { target_id, kind, damage,
//               lat, lon, nonce }, returns { ok }.
//   'poll'   — events created in the last 30 s with target_id =
//               the caller, returns { events }.
//
// Signed-in only (guests 401 -> the client count carries the
// session). supabase/earth1-kart.sql RAN Nov 15 ~19:46 (Merlin's
// green light, ~19:38), so grant/spend hit the real RPCs; if the
// tables/functions are ever missing, both verbs answer 503
// setupRequired — nothing is fake-credited, and the scene falls
// back to the local session count.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_WINDOW_S = 30;

function setupRequired() {
  return NextResponse.json(
    { error: 'Earth 1 kart is not connected yet.', setupRequired: true },
    { status: 503 },
  );
}

function isMissingTable(err) {
  // Postgres "undefined_table" (42P01) / "undefined_function"
  // (42883) — the migration hasn't run yet.
  return err && (err.code === '42P01' || err.code === '42883'
    || /does not exist/i.test(String(err.message || '')));
}

async function getMissiles(client, userId) {
  const { data, error } = await client
    .from('earth1_missiles')
    .select('missiles')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.missiles : 0;
}

export async function GET(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const client = await getServiceClient();
    if (!client) return setupRequired();
    const missiles = await getMissiles(client, auth.user.id);
    return NextResponse.json({ missiles });
  } catch (err) {
    if (isMissingTable(err)) return setupRequired();
    return NextResponse.json({ error: 'Could not load missile count.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const action = String(body?.action || '').trim();
  if (!['grant', 'spend', 'report', 'poll'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  try {
    const client = await getServiceClient();
    if (!client) return setupRequired();
    const userId = auth.user.id;

    if (action === 'grant') {
      // Atomic +1 (supabase/earth1-kart.sql): concurrent grants
      // never lose each other.
      const { data, error } = await client.rpc('earth1_grant_missile', { p_user_id: userId });
      if (error) throw error;
      return NextResponse.json({ missiles: typeof data === 'number' ? data : await getMissiles(client, userId) });
    }

    if (action === 'spend') {
      // Atomic -1 only when > 0 (same migration): the row tells
      // us whether a missile was actually spent.
      const { data, error } = await client.rpc('earth1_spend_missile', { p_user_id: userId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        const missiles = await getMissiles(client, userId);
        return NextResponse.json({ ok: false, missiles });
      }
      return NextResponse.json({ ok: !!row.ok, missiles: row.missiles });
    }

    if (action === 'report') {
      // The client sends the event nested ({ action, event }) —
      // accept that shape (and top-level fields, for robustness).
      const ev = (body && typeof body.event === 'object' && body.event) || body;
      const kind = String(ev?.kind || '').trim();
      const targetId = String(ev?.targetId || ev?.target_id || '').trim();
      if (!['torpedo', 'collision'].includes(kind) || !targetId) {
        return NextResponse.json({ error: 'Bad combat event.' }, { status: 400 });
      }
      const { error } = await client.from('earth1_combat_events').insert({
        actor_id: userId,
        target_id: targetId,
        kind,
        damage: Number.isFinite(Number(ev?.damage)) ? Math.max(0, Math.round(Number(ev.damage))) : 0,
        lat: Number.isFinite(Number(ev?.lat)) ? Number(ev.lat) : null,
        lon: Number.isFinite(Number(ev?.lon)) ? Number(ev.lon) : null,
        nonce: typeof ev?.nonce === 'string' ? ev.nonce.slice(0, 128) : null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // poll — events addressed to the caller in the last 30 s.
    // Mapped to the client's camelCase event shape.
    const since = new Date(Date.now() - POLL_WINDOW_S * 1000).toISOString();
    const { data, error } = await client
      .from('earth1_combat_events')
      .select('id, actor_id, target_id, kind, damage, lat, lon, nonce, created_at')
      .eq('target_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({
      events: (data || []).map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        targetId: r.target_id,
        kind: r.kind,
        damage: r.damage,
        lat: r.lat,
        lon: r.lon,
        nonce: r.nonce,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    if (isMissingTable(err)) return setupRequired();
    return NextResponse.json({ error: 'Could not run the kart action.' }, { status: 500 });
  }
}
