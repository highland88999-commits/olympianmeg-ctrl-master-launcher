// app/api/persymphony/tickets/shows/[id]/route.js
// GET   -> public show detail + tiers + performer (never stream_url).
// PATCH -> performer-only status transitions:
//          draft -> published | cancelled
//          published -> live | cancelled
//          live -> ended | cancelled
//          (ended/cancelled are terminal)
//        Cancelling never auto-refunds in v1 (Merlin's call) — tickets stay
//        valid in the ledger and the performer handles buyers directly.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { canTransitionShowStatus } from '@/lib/persymphony/tickets';

const PUBLIC_SHOW_COLS =
  'id, performer_id, title, description, performance_type, starts_at, venue_type, venue_name, venue_address, venue_capacity, arena_id, status, created_at';

export const GET = apiGuard(async function GET(_req, ctx) {
  const id = ctx?.params?.id;
  if (!id) return Response.json({ ok: false, error: 'Missing show id.' }, { status: 400 });
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  const { data: show, error } = await admin
    .from('ps_shows')
    .select(PUBLIC_SHOW_COLS)
    .eq('id', id)
    .in('status', ['published', 'live', 'ended'])
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw error;
  }
  if (!show) return Response.json({ ok: false, error: 'Show not found.' }, { status: 404 });

  const { data: tiers, error: tErr } = await admin
    .from('ps_ticket_tiers')
    .select('id, show_id, name, price_cents, quantity, sold_count')
    .eq('show_id', id)
    .order('price_cents', { ascending: true });
  if (tErr) throw tErr;

  const { data: performer } = await admin
    .from('ps_performers')
    .select('id, user_id, display_name, bio, avatar_url')
    .eq('id', show.performer_id)
    .maybeSingle();

  // Promoter attribution: the performer's TikTok handle travels with shared
  // show links (same pattern as Live Recordings). Best-effort — the column
  // may not exist in every environment yet.
  let performerTikTok = '';
  if (performer?.user_id) {
    try {
      const { data: prof } = await admin
        .from('user_profiles')
        .select('tiktok_handle')
        .eq('user_id', performer.user_id)
        .eq('type', 'personal')
        .maybeSingle();
      performerTikTok = String(prof?.tiktok_handle || '');
    } catch {
      /* handle stays empty */
    }
  }

  return Response.json({
    ok: true,
    show: {
      ...show,
      tiers: tiers || [],
      performer: performer
        ? {
            id: performer.id,
            display_name: performer.display_name,
            bio: performer.bio,
            avatar_url: performer.avatar_url,
            tiktok_handle: performerTikTok || null,
          }
        : null,
    },
  });
});

export const PATCH = apiGuard(async function PATCH(req, ctx) {
  const id = ctx?.params?.id;
  if (!id) return Response.json({ ok: false, error: 'Missing show id.' }, { status: 400 });
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to manage your shows.' }, { status: 401 });
  }
  const { data: performer } = await admin
    .from('ps_performers')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!performer) {
    return Response.json({ ok: false, error: 'No performer profile found.' }, { status: 403 });
  }

  const { data: show, error: sErr } = await admin
    .from('ps_shows')
    .select('id, performer_id, status, starts_at')
    .eq('id', id)
    .maybeSingle();
  if (sErr) {
    if (sErr.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw sErr;
  }
  if (!show || show.performer_id !== performer.id) {
    return Response.json({ ok: false, error: 'Show not found.' }, { status: 404 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const next = String(body.status || '');
  const check = canTransitionShowStatus(show.status, next);
  if (!check.ok) {
    return Response.json({ ok: false, error: check.error }, { status: 400 });
  }
  // Publishing a show that's already in the past makes no sense.
  if (next === 'published' && new Date(show.starts_at).getTime() < Date.now() - 60_000) {
    return Response.json(
      { ok: false, error: 'That show already started — create a new one instead.' },
      { status: 400 }
    );
  }

  const { data: updated, error: uErr } = await admin
    .from('ps_shows')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status')
    .single();
  if (uErr) throw uErr;
  return Response.json({ ok: true, show: updated });
});
