// app/api/persymphony/tickets/shows/route.js
// GET  /api/persymphony/tickets/shows        -> public marketplace listing
// POST /api/persymphony/tickets/shows        -> performer creates a show (auth)
//
// GET is public (we distribute). POST requires a signed-in performer.
// Prices/tiers are validated server-side; stream URLs never leave the server.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { validateShowInput } from '@/lib/persymphony/tickets';
import { ARENAS } from '@/app/persymphony/arenas';

function serviceOrThrow() {
  return getServiceClient().then((admin) => {
    if (!admin) throw new Error('The ticketing service is not connected yet.');
    return admin;
  });
}

function tableMissing(err) {
  return err && (err.code === '42P01' || /does not exist|relation/i.test(err.message || ''));
}

async function authedPerformer(req, admin) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return { authError: 'Sign in as a performer to manage shows.' };
  const user = auth.user;
  let { data: performer, error } = await admin
    .from('ps_performers')
    .select('id, display_name, bio, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    if (tableMissing(error)) throw new Error('The ticketing service is not connected yet.');
    throw error;
  }
  if (!performer) {
    const name =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      (user.email || 'Performer').split('@')[0];
    const ins = await admin
      .from('ps_performers')
      .insert({ user_id: user.id, display_name: String(name).slice(0, 80) })
      .select('id, display_name, bio, avatar_url')
      .single();
    if (ins.error) {
      if (tableMissing(ins.error)) throw new Error('The ticketing service is not connected yet.');
      throw ins.error;
    }
    performer = ins.data;
  }
  return performer;
}

const PUBLIC_SHOW_COLS =
  'id, performer_id, title, description, performance_type, starts_at, venue_type, venue_name, venue_address, venue_capacity, arena_id, status, created_at';

export const GET = apiGuard(async function GET(req) {
  const admin = await serviceOrThrow();
  const { searchParams } = new URL(req.url);
  const performerId = searchParams.get('performer_id');

  let q = admin
    .from('ps_shows')
    .select(PUBLIC_SHOW_COLS)
    .in('status', ['published', 'live'])
    .order('starts_at', { ascending: true })
    .limit(100);
  if (performerId) q = q.eq('performer_id', performerId);
  const { data: shows, error } = await q;
  if (error) {
    if (tableMissing(error)) throw new Error('The ticketing service is not connected yet.');
    throw error;
  }
  const ids = (shows || []).map((s) => s.id);
  let tiersByShow = {};
  if (ids.length) {
    const { data: tiers, error: tErr } = await admin
      .from('ps_ticket_tiers')
      .select('id, show_id, name, price_cents, quantity, sold_count')
      .in('show_id', ids);
    if (tErr) {
      if (tableMissing(tErr)) throw new Error('The ticketing service is not connected yet.');
      throw tErr;
    }
    for (const t of tiers || []) {
      (tiersByShow[t.show_id] = tiersByShow[t.show_id] || []).push(t);
    }
  }
  // Attach performer display names (in-house profiles).
  const perfIds = [...new Set((shows || []).map((s) => s.performer_id))];
  let perfById = {};
  if (perfIds.length) {
    const { data: perfs } = await admin
      .from('ps_performers')
      .select('id, display_name, avatar_url')
      .in('id', perfIds);
    for (const p of perfs || []) perfById[p.id] = p;
  }
  return Response.json({
    ok: true,
    shows: (shows || []).map((s) => ({
      ...s,
      tiers: tiersByShow[s.id] || [],
      performer: perfById[s.performer_id] || null,
      // stream_url is NEVER included here.
    })),
  });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await serviceOrThrow();
  const performer = await authedPerformer(req, admin);
  if (performer.authError) {
    return Response.json({ ok: false, error: performer.authError }, { status: 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const arenaIds = (ARENAS || []).map((a) => a.id);
  const check = validateShowInput(body, arenaIds);
  if (!check.ok) {
    return Response.json({ ok: false, error: check.errors[0], errors: check.errors }, { status: 400 });
  }

  // Optional performer profile touch-up on the same call.
  const profilePatch = {};
  if (typeof body.performer_name === 'string' && body.performer_name.trim()) {
    profilePatch.display_name = body.performer_name.trim().slice(0, 80);
  }
  if (typeof body.performer_bio === 'string') {
    profilePatch.bio = body.performer_bio.slice(0, 2000);
  }
  if (Object.keys(profilePatch).length) {
    await admin.from('ps_performers').update(profilePatch).eq('id', performer.id);
  }

  const showRow = {
    performer_id: performer.id,
    title: String(body.title).trim().slice(0, 160),
    description: String(body.description || '').slice(0, 4000),
    performance_type: String(body.performance_type).trim().slice(0, 60),
    starts_at: new Date(body.starts_at).toISOString(),
    venue_type: body.venue_type,
    venue_name: String(body.venue_name || '').trim().slice(0, 160),
    venue_address: String(body.venue_address || '').trim().slice(0, 300),
    venue_capacity:
      body.venue_capacity === '' || body.venue_capacity == null
        ? null
        : Number(body.venue_capacity),
    arena_id: String(body.arena_id || '').slice(0, 80),
    status: body.status === 'published' ? 'published' : 'draft',
  };
  const { data: show, error: sErr } = await admin
    .from('ps_shows')
    .insert(showRow)
    .select(PUBLIC_SHOW_COLS)
    .single();
  if (sErr) {
    if (tableMissing(sErr)) throw new Error('The ticketing service is not connected yet.');
    throw sErr;
  }

  const tierRows = body.tiers.map((t) => ({
    show_id: show.id,
    name: String(t.name).trim().slice(0, 80),
    price_cents: Number(t.price_cents),
    quantity: Number(t.quantity),
  }));
  const { data: tiers, error: tErr } = await admin
    .from('ps_ticket_tiers')
    .insert(tierRows)
    .select('id, show_id, name, price_cents, quantity, sold_count');
  if (tErr) {
    if (tableMissing(tErr)) throw new Error('The ticketing service is not connected yet.');
    throw tErr;
  }

  const streamUrl = String(body.stream_url || '').trim().slice(0, 500);
  if (streamUrl) {
    const { error: secErr } = await admin
      .from('ps_show_secrets')
      .upsert({ show_id: show.id, stream_url: streamUrl });
    if (secErr && !tableMissing(secErr)) throw secErr;
  }

  return Response.json({ ok: true, show: { ...show, tiers: tiers || [] } }, { status: 201 });
});
