// app/api/persymphony/tickets/performer/overview/route.js
// GET -> signed-in performer's dashboard: their shows with per-show ledgers
// plus totals. LEDGER ONLY — no payouts are created or moved anywhere here.
//
// Ledger math (identical for every venue type):
//   gross  = sum(ticket amount_cents)
//   fees   = sum(ticket stripe_fee_cents)
//   net    = gross - fees
//   platform (10% of net) -> the house
//   performer (90% of net) -> ledger balance (paid out in a later phase)
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { ledgerFromTickets } from '@/lib/persymphony/tickets';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to view your dashboard.' }, { status: 401 });
  }

  const { data: performer, error: pErr } = await admin
    .from('ps_performers')
    .select('id, display_name, bio, avatar_url')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (pErr) {
    if (pErr.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw pErr;
  }
  if (!performer) {
    return Response.json({ ok: true, performer: null, shows: [], totals: null });
  }

  const { data: shows, error: sErr } = await admin
    .from('ps_shows')
    .select('id, title, performance_type, starts_at, venue_type, venue_name, status, created_at')
    .eq('performer_id', performer.id)
    .order('starts_at', { ascending: false });
  if (sErr) throw sErr;

  const showIds = (shows || []).map((s) => s.id);
  let ticketsByShow = {};
  if (showIds.length) {
    const { data: tickets, error: tErr } = await admin
      .from('ps_tickets')
      .select('show_id, amount_cents, stripe_fee_cents, status')
      .in('show_id', showIds);
    if (tErr) throw tErr;
    for (const t of tickets || []) {
      (ticketsByShow[t.show_id] = ticketsByShow[t.show_id] || []).push(t);
    }
  }

  const showRows = (shows || []).map((s) => {
    const ledger = ledgerFromTickets(ticketsByShow[s.id] || []);
    const redeemed = (ticketsByShow[s.id] || []).filter((t) => t.status === 'redeemed').length;
    return { ...s, tickets_redeemed: redeemed, ledger };
  });

  const allTickets = Object.values(ticketsByShow).flat();
  const totals = ledgerFromTickets(allTickets);

  return Response.json({ ok: true, performer, shows: showRows, totals });
});
