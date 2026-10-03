// app/api/persymphony/tickets/validate/route.js
// POST /api/persymphony/tickets/validate { ticket_number, show_id }
// The entry gate. Validates a ticket and redeems it atomically:
//   - not found            -> invalid
//   - ticket for another show -> wrong_event
//   - already redeemed     -> already_redeemed (duplicate scan blocked)
//   - valid                -> admitted; redeemed_at stamped in the same
//     conditional UPDATE, so two simultaneous scans can't both pass.
//
// On admission, returns the entry payload adapted to the venue type:
//   physical  -> door info (venue name + address) for the door check
//   virtual   -> the in-house arena link
//   livestream-> the stream URL (revealed ONLY here, never publicly)
//   hybrid    -> door info + stream URL
// Works for door staff (they type the number the viewer shows) and for
// viewers on their own devices.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { normalizeTicketNumber, decideEntry, entryPayload } from '@/lib/persymphony/tickets';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const ticketNumber = normalizeTicketNumber(body.ticket_number);
  const showId = String(body.show_id || '');
  if (!ticketNumber || !showId) {
    return Response.json({ ok: false, error: 'A ticket number is required.' }, { status: 400 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  const { data: ticket, error } = await admin
    .from('ps_tickets')
    .select('id, show_id, ticket_number, status, buyer_name')
    .eq('ticket_number', ticketNumber)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw error;
  }

  const decision = decideEntry({ ticket, showId });
  if (!decision.ok) {
    return Response.json({ ok: false, code: decision.code, error: decision.message }, { status: 200 });
  }

  // Atomic redeem: only flips valid -> redeemed. A concurrent scan loses.
  const { data: redeemed, error: rErr } = await admin
    .from('ps_tickets')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', ticket.id)
    .eq('status', 'valid')
    .select('id');
  if (rErr) throw rErr;
  if (!redeemed || redeemed.length === 0) {
    return Response.json(
      { ok: false, code: 'already_redeemed', error: 'That ticket has already been used for entry.' },
      { status: 200 }
    );
  }

  const { data: show, error: sErr } = await admin
    .from('ps_shows')
    .select('id, title, venue_type, venue_name, venue_address, arena_id, status')
    .eq('id', showId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!show || show.status === 'cancelled') {
    return Response.json({ ok: false, code: 'invalid', error: 'That show is not admitting entry.' }, { status: 200 });
  }

  let secrets = null;
  if (show.venue_type === 'livestream' || show.venue_type === 'hybrid') {
    const { data: sec } = await admin
      .from('ps_show_secrets')
      .select('stream_url')
      .eq('show_id', showId)
      .maybeSingle();
    secrets = sec;
  }

  return Response.json({
    ok: true,
    code: 'admitted',
    ticket_number: ticket.ticket_number,
    buyer_name: ticket.buyer_name || '',
    entry: entryPayload(show, secrets),
  });
});
