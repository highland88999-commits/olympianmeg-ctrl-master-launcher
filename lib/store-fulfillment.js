// lib/store-fulfillment.js
// Server-only Printful order submission for paid store orders.
//
// Chain: the Stripe store webhook flips an order paid, then calls
// fulfillPaidOrder (in the webhook route), which calls submitPrintfulOrder
// here. The order is created as a DRAFT (free, reversible), then confirmed
// (this is the step that charges Merlin's Printful account and sends the
// job to print). If the confirm fails, the draft is left in place and the
// error carries draftOnly + printfulOrderId so the webhook can record the
// draft for manual confirmation instead of losing the order.
//
// VARIANT IDS — the mismatch that used to block this chain: checkout
// records the CATALOG variant id (Printful's product catalog id, e.g.
// hoodie 2XS = 18730). Printful order submission needs the SYNC variant
// id (the per-store sync row id). They are NOT interchangeable. The sync
// id is resolved at fulfillment time from Printful itself via
// getProductVariants (lib/store-printful.js), which returns both ids per
// variant — no invented mapping, no stored table. resolveFulfillmentItems
// does that lookup; submitPrintfulOrder only ever receives sync ids.
//
// IDEMPOTENCY: the webhook's pending->paid flip is the claim — only the
// delivery that flips the row reaches fulfillment, so a Stripe redelivery
// can never resubmit. As defense in depth, fulfillPaidOrder re-reads the
// order row and skips when printful_order_id is already set. Printful
// external_id is the store order id, so a manual retry can be checked
// against the Printful dashboard before resubmitting.
//
// PRINTFUL_API_KEY is a server env var and must never be logged, printed,
// or exposed. Import this module only from server route handlers.

import { getProductVariants } from './store-printful.js';
import { parseStoreCogsLines } from './affiliates/costs.js';

const PF_BASE = 'https://api.printful.com';
// Merlin's Printful store id (Omega Store).
const STORE_ID = '17419146';
const REQUEST_TIMEOUT_MS = 30000;

// Required Printful recipient fields. state may be '' (module sends it
// as state_code); phone/email are optional.
const REQUIRED_RECIPIENT_FIELDS = ['name', 'address1', 'city', 'country', 'zip'];

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

// ---------------------------------------------------------------------------
// RECIPIENTS — Stripe address shapes -> Printful recipient.
//
// Stripe gives the shipping address in TWO shapes and the webhook stores
// either one in store_orders.shipping, so every reader must handle both:
//   - session.shipping_details: { name, address: { line1, line2, city,
//     state, postal_code, country } }  (collected by
//     shipping_address_collection — the address Printful must ship to)
//   - session.customer_details.address: a bare Stripe address object
//     (the billing address — only a fallback, never preferred over the
//     shipping address when both exist).
// Names/emails/phones come from customer_details (shipping_details has
// no email/phone).
// ---------------------------------------------------------------------------

function extractStripeAddress(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.address && typeof obj.address === 'object') return obj.address;
  if (typeof obj.line1 === 'string') return obj;
  return null;
}

/**
 * Pure: a Stripe checkout session -> Printful recipient shape.
 * Prefers shipping_details (the address the buyer gave for shipping);
 * falls back to the customer_details billing address. Missing fields
 * come back null — use missingRecipientFields to check before submit.
 */
export function recipientFromSession(session) {
  const s = session && typeof session === 'object' ? session : {};
  const ship = s.shipping_details || null;
  const cust = s.customer_details || null;
  const addr = extractStripeAddress(ship) || extractStripeAddress(cust) || null;
  return {
    name: (ship && ship.name) || (cust && cust.name) || null,
    address1: (addr && addr.line1) || null,
    address2: (addr && addr.line2) || null,
    city: (addr && addr.city) || null,
    state: (addr && addr.state) || null,
    country: (addr && addr.country) || null,
    zip: (addr && addr.postal_code) || null,
    phone: (cust && cust.phone) || null,
    email: (cust && cust.email) || null,
  };
}

/**
 * Pure: a stored store_orders.shipping jsonb value -> Printful recipient
 * shape. Handles both stored shapes (bare address, or { name, address }).
 * `fallback` supplies name/email/phone when the stored value has none.
 * Returns null when the stored value holds no usable address at all.
 */
export function recipientFromStoredShipping(shipping, fallback = {}) {
  const addr = extractStripeAddress(shipping);
  if (!addr) return null;
  const f = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    name:
      (shipping && typeof shipping === 'object' && shipping.name) ||
      f.name ||
      null,
    address1: addr.line1 || null,
    address2: addr.line2 || null,
    city: addr.city || null,
    state: addr.state || null,
    country: addr.country || null,
    zip: addr.postal_code || null,
    phone: f.phone || null,
    email: f.email || null,
  };
}

/** Pure: fill null fields of `primary` from `fallback`. Never overwrites. */
export function mergeRecipients(primary, fallback) {
  const p = primary && typeof primary === 'object' ? primary : {};
  const f = fallback && typeof fallback === 'object' ? fallback : {};
  const out = {};
  for (const key of [
    'name', 'address1', 'address2', 'city', 'state', 'country', 'zip', 'phone', 'email',
  ]) {
    out[key] = p[key] != null && p[key] !== '' ? p[key] : f[key] != null ? f[key] : null;
  }
  return out;
}

/** Pure: which required recipient fields are missing (empty = shippable). */
export function missingRecipientFields(recipient) {
  const r = recipient && typeof recipient === 'object' ? recipient : {};
  return REQUIRED_RECIPIENT_FIELDS.filter(
    (key) => r[key] == null || String(r[key]).trim() === ''
  );
}

// ---------------------------------------------------------------------------
// ORDER LINES — session metadata -> fulfillment lines.
//
// Primary source is the cogs_lines transport (lib/affiliates/costs.js):
// every priced line carries { product_id: 'pf_<sync>', variant_id:
// <catalog variant id> | null, size, qty }. Fallback is the historical
// printful_product_id / printful_variant_id metadata (comma-joined,
// qty 1). Returns null when nothing usable can be read — the caller
// parks the order as failed rather than guessing a variant.
// ---------------------------------------------------------------------------

/**
 * Pure: Stripe session metadata -> [{ syncProductId, catalogVariantId,
 * size, quantity }] or null.
 */
export function parseFulfillmentLines(meta) {
  const cogs = parseStoreCogsLines(meta);
  if (cogs) {
    return cogs.map((l) => ({
      syncProductId: String(l.product_id).replace(/^pf_/, ''),
      catalogVariantId: l.variant_id ? String(l.variant_id) : null,
      size: l.size || '',
      quantity: l.qty,
    }));
  }
  const m = meta && typeof meta === 'object' ? meta : {};
  const products = String(m.printful_product_id || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const variants = String(m.printful_variant_id || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!products.length) return null;
  if (variants.length && variants.length !== products.length) return null;
  return products.map((syncProductId, i) => ({
    syncProductId,
    catalogVariantId: variants[i] || null,
    size: i === 0 ? String(m.size || '') : '',
    quantity: 1,
  }));
}

// ---------------------------------------------------------------------------
// VARIANT RESOLUTION — catalog variant id -> Printful sync variant id.
// ---------------------------------------------------------------------------

/**
 * Resolve fulfillment lines to Printful sync variant ids, using the live
 * variant list (lib/store-printful.js) — the same source checkout priced
 * against, so the id can never drift from what the buyer chose.
 * Match order per line: catalog variant id, then size, then the sole
 * variant of a single-variant product. Throws FulfillmentError when a
 * line cannot be resolved or is unavailable — never a guessed variant.
 * `fetchVariants` is injectable for tests.
 */
export async function resolveFulfillmentItems(lines, fetchVariants = getProductVariants) {
  const items = [];
  for (const line of lines || []) {
    const syncId = String(line && line.syncProductId != null ? line.syncProductId : '').trim();
    if (!/^\d+$/.test(syncId)) {
      throw new FulfillmentError(
        `Cannot fulfill: bad Printful product id ${JSON.stringify(line && line.syncProductId)}.`
      );
    }
    let variants;
    try {
      variants = await fetchVariants(syncId);
    } catch (err) {
      throw new FulfillmentError(
        `Cannot fulfill: Printful variant lookup failed for product ${syncId} (${err && err.message ? err.message : err}).`
      );
    }
    const live = (variants || []).filter((v) => v && v.available !== false);
    let match = null;
    if (line.catalogVariantId) {
      match =
        live.find((v) => String(v.variantId) === String(line.catalogVariantId)) || null;
    }
    if (!match && line.size) {
      const want = String(line.size).trim().toLowerCase();
      match =
        live.find((v) => String(v.size || '').trim().toLowerCase() === want) || null;
    }
    if (!match && live.length === 1) match = live[0];
    if (!match) {
      throw new FulfillmentError(
        `Cannot fulfill: no available Printful variant for product ${syncId}` +
          (line.catalogVariantId ? ` (catalog variant ${line.catalogVariantId})` : '') +
          (line.size ? ` (size ${line.size})` : '') +
          '.'
      );
    }
    const syncVariantId = Number(match.syncVariantId);
    if (!Number.isFinite(syncVariantId) || syncVariantId <= 0) {
      throw new FulfillmentError(
        `Cannot fulfill: Printful variant for product ${syncId} has no sync variant id.`
      );
    }
    const qty = Number(line.quantity);
    items.push({
      syncVariantId,
      quantity: Number.isInteger(qty) && qty >= 1 ? qty : 1,
    });
  }
  if (!items.length) {
    throw new FulfillmentError('Cannot fulfill: no order lines to submit.');
  }
  return items;
}

// ---------------------------------------------------------------------------
// SUBMISSION — draft, then confirm. Confirm is the step that charges
// Merlin's Printful account; draft creation alone costs nothing.
// ---------------------------------------------------------------------------

function normalizeItems(items, variantId) {
  const list =
    Array.isArray(items) && items.length
      ? items
      : variantId != null
        ? [{ syncVariantId: variantId, quantity: 1 }]
        : [];
  if (!list.length) {
    throw new FulfillmentError('No valid Printful variant for this order.');
  }
  const out = [];
  for (const it of list) {
    const vid = Number(
      it && it.syncVariantId != null ? it.syncVariantId : it && it.variantId
    );
    if (!Number.isFinite(vid) || vid <= 0) {
      throw new FulfillmentError('No valid Printful variant for this order.');
    }
    const q = Number(it && it.quantity);
    out.push({
      sync_variant_id: vid,
      quantity: Number.isInteger(q) && q >= 1 ? q : 1,
    });
  }
  return out;
}

/**
 * Submit one paid store order to Printful.
 *
 * @param {object} opts
 * @param {string} opts.orderId        store_orders.id (traceability; also
 *                                     the Printful external_id)
 * @param {Array}  opts.items          [{ syncVariantId, quantity }] —
 *                                     SYNC variant ids (see header). Legacy
 *                                     single `variantId` (a sync id) still
 *                                     works and means one item, qty 1.
 * @param {string|number} [opts.variantId]  legacy single sync variant id
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
  items,
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
  const pfItems = normalizeItems(items, variantId);

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
    items: pfItems,
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
