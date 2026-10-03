// app/api/persymphony/tickets/shows/[id]/route.js
// GET -> public show detail + tiers + performer (never stream_url).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';

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
    .select('id, display_name, bio, avatar_url')
    .eq('id', show.performer_id)
    .maybeSingle();

  return Response.json({
    ok: true,
    show: { ...show, tiers: tiers || [], performer: performer || null },
  });
});
