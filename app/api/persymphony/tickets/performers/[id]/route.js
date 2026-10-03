// app/api/persymphony/tickets/performers/[id]/route.js
// GET -> public performer profile (in-house) + their public shows.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';

export const GET = apiGuard(async function GET(_req, ctx) {
  const id = ctx?.params?.id;
  if (!id) return Response.json({ ok: false, error: 'Missing performer id.' }, { status: 400 });
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  const { data: performer, error } = await admin
    .from('ps_performers')
    .select('id, display_name, bio, avatar_url, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw error;
  }
  if (!performer) return Response.json({ ok: false, error: 'Performer not found.' }, { status: 404 });

  const { data: shows, error: sErr } = await admin
    .from('ps_shows')
    .select(
      'id, title, description, performance_type, starts_at, venue_type, venue_name, venue_address, venue_capacity, arena_id, status'
    )
    .eq('performer_id', id)
    .in('status', ['published', 'live'])
    .order('starts_at', { ascending: true });
  if (sErr) throw sErr;

  const ids = (shows || []).map((s) => s.id);
  let tiersByShow = {};
  if (ids.length) {
    const { data: tiers } = await admin
      .from('ps_ticket_tiers')
      .select('id, show_id, name, price_cents, quantity, sold_count')
      .in('show_id', ids);
    for (const t of tiers || []) {
      (tiersByShow[t.show_id] = tiersByShow[t.show_id] || []).push(t);
    }
  }

  return Response.json({
    ok: true,
    performer,
    shows: (shows || []).map((s) => ({ ...s, tiers: tiersByShow[s.id] || [] })),
  });
});
