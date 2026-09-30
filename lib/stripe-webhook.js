// lib/stripe-webhook.js
// Shared gate for every Stripe checkout webhook in the launcher.
//
// A webhook must act only when the money has actually arrived:
// - `checkout.session.completed` fires when the customer finishes checkout,
//   but for delayed payment methods (bank transfer etc.) the payment may
//   still be pending — those are acknowledged and fulfilled later via
//   `checkout.session.async_payment_succeeded`.
// - Anything else (wrong event type, unpaid session) is acknowledged without
//   fulfilling, so Stripe stops retrying what will never become billable.
//
// Returns { ignore: true, reason } when there is nothing to fulfill, or
// { ignore: false, session } with the paid Checkout Session.
export const BILLABLE_CHECKOUT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

export function billableSessionOrNull(event) {
  if (!event || !BILLABLE_CHECKOUT_EVENTS.has(event.type)) {
    return { ignore: true, reason: 'event-type' };
  }
  const session = event?.data?.object;
  if (!session || session.payment_status !== 'paid') {
    return { ignore: true, reason: 'unpaid' };
  }
  return { ignore: false, session };
}
