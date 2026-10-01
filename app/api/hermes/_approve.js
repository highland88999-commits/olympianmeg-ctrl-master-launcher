// app/api/hermes/_approve.js
// Shared verify-and-approve for HERMES directory listings.
//
// Verifies a Stripe Checkout session server-side (secret key, never the
// client) and flips the matching pending submission to approved. Idempotent:
// only pending -> approved, so the Stripe webhook and the success-return
// verification can both run without double-approving.
//
// Why this exists: if the HERMES webhook secret is not configured in
// Vercel, /api/hermes/webhook 503s and a paid listing would sit in
// "pending" forever. The checkout success_url carries
// session_id={CHECKOUT_SESSION_ID}, and the /hermes page (plus the
// /api/hermes/verify endpoint) calls approvePaidSession on return, so the
// listing goes live from the return trip alone. The webhook stays the
// primary path when its secret is configured.
//
// Server-only: imports the service-role admin client. Never import into
// client components.
import Stripe from 'stripe';
import { getAdminClient } from './_server.js';
import { listingExpiryIso } from '@/lib/hermes/listings.js';

export async function approvePaidSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id || !/^cs_(test|live)_/.test(id)) {
    return { ok: false, reason: 'bad_session_id' };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return { ok: false, reason: 'not_configured' };

  let session;
  try {
    const stripe = new Stripe(stripeKey);
    session = await stripe.checkout.sessions.retrieve(id);
  } catch {
    return { ok: false, reason: 'not_found' };
  }

  // Only act when the money has actually arrived.
  if (session.payment_status !== 'paid') {
    return { ok: false, reason: 'unpaid' };
  }

  const submissionId = session?.metadata?.submission_id;
  if (!submissionId) {
    // A paid session that isn't a Hermes listing — not ours, not an error.
    return { ok: false, reason: 'not_hermes' };
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return { ok: false, reason: 'db_unavailable' };
  }

  const { data, error } = await supabase
    .from('hermes_links')
    .update({
      payment_status: 'approved',
      approved_at: new Date().toISOString(),
      expires_at: listingExpiryIso(),
      stripe_session_id: session.id,
    })
    .eq('submission_id', submissionId)
    .eq('payment_status', 'pending')
    .select('id');

  if (error) {
    console.error('Hermes approvePaidSession DB error:', error.message);
    return { ok: false, reason: 'db_error' };
  }
  const approved = Array.isArray(data) && data.length > 0;
  return { ok: true, approved, alreadyApproved: !approved };
}
