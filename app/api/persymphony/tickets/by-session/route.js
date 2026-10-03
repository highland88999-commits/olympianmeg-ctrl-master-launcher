// app/api/persymphony/tickets/by-session/route.js
// GET /api/persymphony/tickets/by-session?session_id=cs_...
// Returns the ticket numbers issued for a Stripe checkout session.
// Public: the session id is unguessable and lives only in the buyer's
// redirect URL. Used by the post-purchase success page.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';

export const GET = apiGuard(async function GET(req) {
  const sessionId = new URL(req.url).searchParams.get('session_id') || '';
  if (!sessionId.startsWith('cs_')) {
    return Response.json({ ok: false, error: 'Missing session id.' }, { status: 400 });
  }
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  const { data: tickets, error } = await admin
    .from('ps_tickets')
    .select('ticket_number, show_id, status, created_at')
    .eq('stripe_session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw error;
  }
  let showTitle = '';
  const showId = tickets?.[0]?.show_id;
  if (showId) {
    const { data: show } = await admin
      .from('ps_shows')
      .select('id, title, starts_at')
      .eq('id', showId)
      .maybeSingle();
    if (show) showTitle = show.title;
  }
  return Response.json({
    ok: true,
    ready: (tickets || []).length > 0,
    show_id: showId || null,
    show_title: showTitle,
    tickets: (tickets || []).map((t) => ({
      ticket_number: t.ticket_number,
      status: t.status,
    })),
  });
});
