// tests/store-fulfillment.test.mjs
// Headless tests for lib/store-fulfillment.js — the Printful wiring.
// Run: node tests/store-fulfillment.test.mjs (from the repo root).
// No browser, no real network — stubbed fetch + injected variant lookups.
//
// What must never happen (the tests guard it):
//   - a catalog variant id sent to Printful as sync_variant_id;
//   - an order submitted without a complete shipping address;
//   - an invented variant id, address, or price.
import {
  submitPrintfulOrder,
  resolveFulfillmentItems,
  parseFulfillmentLines,
  recipientFromSession,
  recipientFromStoredShipping,
  mergeRecipients,
  missingRecipientFields,
  FulfillmentError,
} from '../lib/store-fulfillment.js';
import { encodeStoreCogsLines } from '../lib/affiliates/costs.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
async function tThrows(name, fn, check) {
  try {
    await fn();
    failed++; console.error(`FAIL: ${name} (did not throw)`);
  } catch (err) {
    if (!check || check(err)) passed++;
    else { failed++; console.error(`FAIL: ${name} (wrong error: ${err && err.message})`); }
  }
}

const realFetch = globalThis.fetch;

// --- recipients -----------------------------------------------------------

const shipSession = {
  shipping_details: {
    name: 'Merlin High',
    address: { line1: '1 Main St', line2: 'Apt 2', city: 'Edmonton', state: 'AB', postal_code: 'T5J 0K1', country: 'CA' },
  },
  customer_details: {
    name: 'Billing Name',
    email: 'buyer@example.com',
    phone: '555-1',
    address: { line1: '9 Other Rd', city: 'Calgary', state: 'AB', postal_code: 'T2P 0A0', country: 'CA' },
  },
};
{
  const r = recipientFromSession(shipSession);
  t('recipient: shipping_details wins over billing address', r.address1 === '1 Main St' && r.city === 'Edmonton');
  t('recipient: name comes from shipping_details', r.name === 'Merlin High');
  t('recipient: email/phone come from customer_details', r.email === 'buyer@example.com' && r.phone === '555-1');
  t('recipient: complete address has no missing fields', missingRecipientFields(r).length === 0);
}
{
  const r = recipientFromSession({ customer_details: shipSession.customer_details });
  t('recipient: falls back to billing address when no shipping_details', r.address1 === '9 Other Rd' && r.name === 'Billing Name');
}
{
  const r = recipientFromSession({ customer_details: { email: 'x@y.z' } });
  const missing = missingRecipientFields(r);
  t('recipient: missing fields listed, never invented', missing.includes('name') && missing.includes('address1') && missing.includes('city') && missing.includes('country') && missing.includes('zip'));
  t('recipientFromSession: garbage session -> nulls, no crash', r.name === null && r.address1 === null);
}
{
  const bare = { line1: '5 Elm St', city: 'Redwater', state: 'AB', postal_code: 'T0A 2W0', country: 'CA' };
  const r = recipientFromStoredShipping(bare, { name: 'Stored Buyer', email: 's@example.com' });
  t('stored shipping: bare address shape reads', r && r.address1 === '5 Elm St' && r.name === 'Stored Buyer');
  const wrapped = { name: 'Wrap Name', address: bare };
  const r2 = recipientFromStoredShipping(wrapped, {});
  t('stored shipping: {name, address} shape reads', r2 && r2.address1 === '5 Elm St' && r2.name === 'Wrap Name');
  t('stored shipping: garbage -> null', recipientFromStoredShipping('nope') === null && recipientFromStoredShipping(null) === null);
}
{
  const merged = mergeRecipients(
    { name: 'A', address1: null, city: 'Edmonton', country: null, zip: 'T5J 0K1' },
    { name: 'B', address1: '1 Main St', city: 'Calgary', country: 'CA', zip: 'T2P 0A0' },
  );
  t('merge: fills gaps, never overwrites', merged.name === 'A' && merged.address1 === '1 Main St' && merged.city === 'Edmonton' && merged.country === 'CA');
}

// --- line parsing ---------------------------------------------------------

{
  const meta = {
    surface: 'store',
    ...encodeStoreCogsLines([
      { product_id: 'pf_482081339', variant_id: '18730', size: '2XS', qty: 2 },
      { product_id: 'pf_482037605', variant_id: '18733', size: 'M', qty: 1 },
    ]),
  };
  const lines = parseFulfillmentLines(meta);
  t('lines: cogs transport -> sync id + catalog variant id + qty',
    Array.isArray(lines) && lines.length === 2 &&
    lines[0].syncProductId === '482081339' && lines[0].catalogVariantId === '18730' && lines[0].quantity === 2 &&
    lines[1].syncProductId === '482037605' && lines[1].catalogVariantId === '18733' && lines[1].quantity === 1);
}
{
  const lines = parseFulfillmentLines({
    printful_product_id: '482081339,482037605',
    printful_variant_id: '18730,18733',
    size: '',
  });
  t('lines: comma fallback works', Array.isArray(lines) && lines.length === 2 && lines[1].catalogVariantId === '18733');
  t('lines: garbage meta -> null, never guessed', parseFulfillmentLines({}) === null && parseFulfillmentLines(null) === null);
  t('lines: mismatched id lists -> null', parseFulfillmentLines({ printful_product_id: '1,2', printful_variant_id: '3' }) === null);
}

// --- variant resolution (injected lookup, no network) ---------------------

const stubVariants = async (syncId) => {
  if (syncId === '482081339') return [
    { variantId: 18730, syncVariantId: 9001, size: '2XS', available: true },
    { variantId: 18732, syncVariantId: 9002, size: 'S', available: true },
    { variantId: 18733, syncVariantId: 9003, size: 'M', available: false },
  ];
  if (syncId === '111') return [
    { variantId: 555, syncVariantId: 7001, size: '', available: true },
  ];
  return [];
};
{
  const items = await resolveFulfillmentItems(
    [{ syncProductId: '482081339', catalogVariantId: '18730', size: '2XS', quantity: 2 }],
    stubVariants,
  );
  t('resolve: catalog id maps to SYNC id (never the catalog id itself)',
    items.length === 1 && items[0].syncVariantId === 9001 && items[0].quantity === 2);
}
{
  const items = await resolveFulfillmentItems(
    [{ syncProductId: '482081339', catalogVariantId: null, size: 'S', quantity: 1 }],
    stubVariants,
  );
  t('resolve: size fallback when catalog id absent', items[0].syncVariantId === 9002);
}
{
  const items = await resolveFulfillmentItems(
    [{ syncProductId: '111', catalogVariantId: null, size: '', quantity: 1 }],
    stubVariants,
  );
  t('resolve: single-variant product resolves without id or size', items[0].syncVariantId === 7001);
}
await tThrows('resolve: unknown catalog id throws, never guesses',
  () => resolveFulfillmentItems(
    [{ syncProductId: '482081339', catalogVariantId: '99999', size: '', quantity: 1 }],
    stubVariants,
  ),
  (e) => e instanceof FulfillmentError && /no available Printful variant/.test(e.message));
await tThrows('resolve: unavailable variant throws (M is out of stock)',
  () => resolveFulfillmentItems(
    [{ syncProductId: '482081339', catalogVariantId: '18733', size: 'M', quantity: 1 }],
    stubVariants,
  ),
  (e) => e instanceof FulfillmentError);
await tThrows('resolve: lookup failure throws FulfillmentError',
  () => resolveFulfillmentItems(
    [{ syncProductId: '482081339', catalogVariantId: '18730', size: '', quantity: 1 }],
    async () => { throw new Error('network down'); },
  ),
  (e) => e instanceof FulfillmentError && /lookup failed/.test(e.message));

// --- submission (stubbed fetch) -------------------------------------------

const goodRecipient = {
  name: 'Merlin High', address1: '1 Main St', city: 'Edmonton',
  state: 'AB', country: 'CA', zip: 'T5J 0K1', email: 'buyer@example.com',
};
{
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('must not fetch'); };
  await tThrows('submit: incomplete recipient throws BEFORE any network call',
    () => submitPrintfulOrder({ orderId: 'ord-1', items: [{ syncVariantId: 9001, quantity: 1 }], recipient: { name: 'X' }, retailCents: 9500 }),
    (e) => e instanceof FulfillmentError && !fetchCalled);
  await tThrows('submit: invalid variant throws before network',
    () => submitPrintfulOrder({ orderId: 'ord-1', items: [{ syncVariantId: 0, quantity: 1 }], recipient: goodRecipient, retailCents: 9500 }),
    (e) => e instanceof FulfillmentError && !fetchCalled);
  globalThis.fetch = realFetch;
}
{
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: opts ? JSON.parse(opts.body) : null });
    if (String(url).endsWith('/confirm')) {
      return { ok: true, status: 200, json: async () => ({ code: 200, result: {} }) };
    }
    return { ok: true, status: 200, json: async () => ({ code: 200, result: { id: 424242 } }) };
  };
  const out = await submitPrintfulOrder({
    orderId: 'ord-abc',
    items: [
      { syncVariantId: 9001, quantity: 2 },
      { syncVariantId: 9002, quantity: 1 },
    ],
    recipient: goodRecipient,
    retailCents: 19000,
    currency: 'cad',
  });
  t('submit: returns the Printful order id', out.printfulOrderId === '424242');
  const draftCall = calls.find((c) => !c.url.endsWith('/confirm'));
  t('submit: items sent as sync_variant_id with quantities',
    draftCall && draftCall.body.items.length === 2 &&
    draftCall.body.items[0].sync_variant_id === 9001 && draftCall.body.items[0].quantity === 2 &&
    draftCall.body.items[1].sync_variant_id === 9002 && draftCall.body.items[1].quantity === 1);
  t('submit: external_id is the store order id (retry check)',
    draftCall && draftCall.body.external_id === 'ord-abc');
  t('submit: retail subtotal is what the buyer paid',
    draftCall && draftCall.body.retail_costs.subtotal === '190.00' && draftCall.body.retail_costs.currency === 'CAD');
  t('submit: confirm called for the draft', calls.some((c) => c.url.endsWith('/orders/424242/confirm')));
  globalThis.fetch = realFetch;
}
{
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/confirm')) {
      return { ok: false, status: 500, json: async () => ({ code: 500, error: { message: 'confirm boom' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ code: 200, result: { id: 777 } }) };
  };
  await tThrows('submit: confirm failure throws draftOnly with the draft id',
    () => submitPrintfulOrder({ orderId: 'ord-2', items: [{ syncVariantId: 9001, quantity: 1 }], recipient: goodRecipient, retailCents: 9500 }),
    (e) => e instanceof FulfillmentError && e.draftOnly === true && e.printfulOrderId === '777');
  globalThis.fetch = realFetch;
}
{
  // Legacy single-variantId contract (a sync id) still works.
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/confirm')) {
      return { ok: true, status: 200, json: async () => ({ code: 200, result: {} }) };
    }
    return { ok: true, status: 200, json: async () => ({ code: 200, result: { id: 888 } }) };
  };
  const out = await submitPrintfulOrder({ orderId: 'ord-3', variantId: 9001, recipient: goodRecipient, retailCents: 9500 });
  t('submit: legacy variantId still submits one item', out.printfulOrderId === '888');
  globalThis.fetch = realFetch;
}

globalThis.fetch = realFetch;
console.log(`\nstore-fulfillment: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
