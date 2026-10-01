// lib/store-fulfillment.js
// Server-only Printful order submission for paid store orders.
//
// Called from the Stripe store webhook AFTER the order row is marked paid.
// Chain: create the order as a DRAFT (free, reversible), then confirm it
// (this is the step that charges Merlin's Printful account and sends the
// job to print). If the confirm fails, the draft is left in place and the
// error carries draftOnly + printfulOrderId so the webhook can record the
// draft for manual confirmation instead of losing the order.
//
// PRINTFUL_API_KEY is a server env var and must never be logged, printed,
// or exposed. Import this module only from server route handlers.

const PF_BASE = 'https://api.printful.com';
// Merlin's Printful store id (Omega Store).
const STORE_ID = '17419146';
const REQUEST_TIMEOUT_MS = 30000;

function headers() {
  return {
    Authorization: 'Bearer ' + (process.env.PRINTFUL_API_KEY || ''),
    'X-PF-Store-Id': STORE_ID,
    'Content-Type': 'application/json',
    'User-Agent': 'olympusverse-store/1.0',
  };
}

export class FulfillmentError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'FulfillmentError';
    this.printfulOrderId = opts.printfulOrderId || null;
    this.draftOnly = !!opts.draftOnly;
  }
}

async function pfPost(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(PF_BASE + path, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const code =
      data && typeof data.code === 'number' ? data.code : res.status;
    if (!res.ok || code >= 400) {
      const detail =
        (data && (data.result || (data.error && data.error.message))) ||
        `Printful request failed (${code || res.status || 'network'})`;
      throw new FulfillmentError(
        typeof detail === 'string' ? detail : JSON.stringify(detail)
      );
    }
    return data ? data.result : null;
  } catch (err) {
    if (err instanceof FulfillmentError) throw err;
    throw new FulfillmentError(
      `Printful request failed: ${err && err.message ? err.message : err}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit one paid store order to Printful.
 *
 * @param {object} opts
 * @param {string} opts.orderId        store_orders.id (traceability)
 * @param {string|number} opts.variantId  Printful sync variant id
 * @param {object} opts.recipient      { name, address1, address2?, city,
 *                                     state?, country (2-letter), zip,
 *                                     phone?, email? }
 * @param {number} opts.retailCents    what the buyer paid, whole cents
 * @param {string} opts.currency       e.g. 'cad'
 * @returns {{ printfulOrderId: string }}
 * @throws {FulfillmentError} with draftOnly=true when the draft was created
 *         but the confirm failed — the draft id is on .printfulOrderId.
 */
export async function submitPrintfulOrder({
  orderId,
  variantId,
  recipient,
  retailCents,
  currency,
}) {
  const r = recipient || {};
  if (!r.name || !r.address1 || !r.city || !r.country || !r.zip) {
    throw new FulfillmentError(
      'Recipient address is incomplete — cannot submit to Printful.'
    );
  }
  const vid = Number(variantId);
  if (!Number.isFinite(vid) || vid <= 0) {
    throw new FulfillmentError('No valid Printful variant for this order.');
  }

  const draft = await pfPost('/orders', {
    recipient: {
      name: r.name,
      address1: r.address1,
      ...(r.address2 ? { address2: r.address2 } : {}),
      city: r.city,
      state_code: r.state || '',
      country_code: String(r.country).toUpperCase(),
      zip: r.zip,
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.email ? { email: r.email } : {}),
    },
    items: [{ sync_variant_id: vid, quantity: 1 }],
    retail_costs: {
      currency: String(currency || 'cad').toUpperCase(),
      subtotal: ((retailCents || 0) / 100).toFixed(2),
      discount: '0.00',
      shipping: '0.00',
      tax: '0.00',
    },
    shipping: 'STANDARD',
    external_id: String(orderId || '').slice(0, 32) || undefined,
  });

  const orderPk = draft && draft.id;
  if (!orderPk) {
    throw new FulfillmentError('Printful did not return an order id.');
  }

  try {
    await pfPost(`/orders/${orderPk}/confirm`, {});
  } catch (err) {
    throw new FulfillmentError(
      `Printful draft ${orderPk} created but the confirm failed: ${err.message}. ` +
        'The draft is waiting in the Printful dashboard for manual confirmation.',
      { printfulOrderId: String(orderPk), draftOnly: true }
    );
  }

  return { printfulOrderId: String(orderPk) };
}
