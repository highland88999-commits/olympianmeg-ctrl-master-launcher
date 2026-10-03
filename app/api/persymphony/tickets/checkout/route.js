// app/api/persymphony/tickets/checkout/route.js
// POST /api/persymphony/tickets/checkout { show_id, tier_id, quantity, buyer_name? }
//   -> { ok, url }  (Stripe Checkout URL)
//
// No login required: shareable ticket links must convert outside the house.
// Every price is re-derived server-side from the tier row — the client never
// dictates an amount. Follows the repo's store checkout pattern.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { MAX_TICKETS_PER_ORDER } from '@/lib/persymphony/tickets';

async function loadStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

export const GET = apiGuard(async function GET() {
  return Response.json({ cardPayments: !!process.env.STRIPE_SECRET_KEY });
});

export const POST = apiGuard(async function POST(req) {
  const stripe = await loadStripe();
  if (!stripe) throw new Error('Card payments are not configured yet.');
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const showId = String(body.show_id || '');
  const tierId = String(body.tier_id || '');
  const quantity = Math.floor(Number(body.quantity) || 0);
  const buyerName = String(body.buyer_name || '').trim().slice(0, 120);
  if (!showId || !tierId) {
    return Response.json({ ok: false, error: 'Pick a show and a ticket tier.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_ORDER) {
    return Response.json(
      { ok: false, error: `Quantity must be between 1 and ${MAX_TICKETS_PER_ORDER}.` },
      { status: 400 }
    );
  }

  // Server-side truth: show must be on sale, tier must belong to it.
  const { data: show, error: sErr } = await admin
    .from('ps_shows')
    .select('id, title, status')
    .eq('id', showId)
    .in('status', ['published', 'live'])
    .maybeSingle();
  if (sErr) {
    if (sErr.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw sErr;
  }
  if (!show) return Response.json({ ok: false, error: 'That show is not on sale.' }, { status: 404 });

  const { data: tier, error: tErr } = await admin
    .from('ps_ticket_tiers')
    .select('id, show_id, name, price_cents, quantity, sold_count')
    .eq('id', tierId)
    .eq('show_id', showId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tier) return Response.json({ ok: false, error: 'That ticket tier is not available.' }, { status: 404 });
  if (tier.quantity - tier.sold_count < quantity) {
    return Response.json({ ok: false, error: 'Not enough tickets left in that tier.' }, { status: 409 });
  }

  const origin = new URL(req.url).origin;
  // Optional buyer identity for the in-house affiliate program: when the
  // buyer is signed in, their user id rides along in metadata so the
  // webhook can attribute the purchase. Logged-out buys still work —
  // attribution falls back to the buyer email.
  let buyerUserId = '';
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const { getUserFromRequest } = await import('@/lib/economy/auth');
      const authRes = await getUserFromRequest(req);
      if (!authRes.error && authRes.user) buyerUserId = authRes.user.id;
    } catch {
      /* logged-out purchase — email fallback applies */
    }
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          // SERVER-PRICED: from the tier row, never from the client.
          unit_amount: tier.price_cents,
          product_data: { name: `${show.title} — ${tier.name} ticket` },
        },
        quantity,
      },
    ],
    metadata: {
      surface: 'persymphony-tickets',
      show_id: showId,
      tier_id: tierId,
      quantity: String(quantity),
      buyer_name: buyerName,
      buyer_user_id: buyerUserId,
    },
    success_url: `${origin}/persymphony/tickets/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/persymphony/tickets/${showId}`,
  });

  return Response.json({ ok: true, url: session.url });
});
