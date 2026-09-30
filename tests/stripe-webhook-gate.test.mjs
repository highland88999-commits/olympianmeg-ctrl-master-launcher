// tests/stripe-webhook-gate.test.mjs
// Headless tests for lib/stripe-webhook.js — the shared "only act when the
// money arrived" gate used by every Stripe checkout webhook.
// Run: node tests/stripe-webhook-gate.test.mjs (from the repo root).
import { billableSessionOrNull, BILLABLE_CHECKOUT_EVENTS } from '../lib/stripe-webhook.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

const paidSession = { id: 'cs_paid', payment_status: 'paid', metadata: { surface: 'gallery' } };
const unpaidSession = { id: 'cs_unpaid', payment_status: 'unpaid', metadata: { surface: 'gallery' } };
const ev = (type, session) => ({ id: 'evt_1', type, data: { object: session } });

t('listens to completed + async_payment_succeeded',
  BILLABLE_CHECKOUT_EVENTS.has('checkout.session.completed') &&
  BILLABLE_CHECKOUT_EVENTS.has('checkout.session.async_payment_succeeded') &&
  BILLABLE_CHECKOUT_EVENTS.size === 2);

// --- Billable ---
{
  const r = billableSessionOrNull(ev('checkout.session.completed', paidSession));
  t('completed + paid -> fulfill', !r.ignore && r.session === paidSession);
}
{
  const r = billableSessionOrNull(ev('checkout.session.async_payment_succeeded', paidSession));
  t('async_payment_succeeded + paid -> fulfill', !r.ignore && r.session === paidSession);
}

// --- Not billable: acknowledged, never fulfilled ---
{
  const r = billableSessionOrNull(ev('checkout.session.completed', unpaidSession));
  t('completed + unpaid -> ignore (pending)', r.ignore && r.reason === 'unpaid');
}
{
  const r = billableSessionOrNull(ev('payment_intent.succeeded', paidSession));
  t('wrong event type -> ignore', r.ignore && r.reason === 'event-type');
}
{
  const r = billableSessionOrNull(ev('checkout.session.completed', null));
  t('missing session object -> ignore', r.ignore && r.reason === 'unpaid');
}
{
  const r = billableSessionOrNull(null);
  t('null event -> ignore', r.ignore);
}
{
  const r = billableSessionOrNull(ev('checkout.session.completed', { ...paidSession, payment_status: 'no_payment_required' }));
  t('no_payment_required is not paid -> ignore', r.ignore && r.reason === 'unpaid');
}

console.log(`stripe-webhook-gate: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
