// lib/store/custom-creations.js
// Creator attribution for Custom Product Designer creations.
//
// Every designer creation records who created it and its full pricing
// breakdown (template, baseline, creator markup, final price, Printful
// sync product id, Stripe product id) so the creator pages and the
// wallet-crediting step can build on it. This module records gross
// figures only and credits nobody itself. Creator earnings were
// DECIDED 2026-10-13: the $1.00 platform fee applies to custom sales,
// the creator is credited their markup net of the real Stripe fee
// share and that $1 fee, and refunds/chargebacks claw the credit back
// — implemented in lib/store/creator-payouts.js, driven by the store
// webhook.
//
// Store of record, in order:
//   1. public.store_custom_creations (Supabase) — the queryable system
//      of record. Its migration is prepared at
//      supabase/migrations/20261013_store_custom_creations.sql and is
//      PENDING Merlin's SQL green-light sequence, so every DB access in
//      this module is best-effort: while the table is missing, helpers
//      degrade quietly and never fail a creation or a purchase.
//   2. Stripe product metadata — the create route writes the same
//      record onto the Stripe product it creates (works today, no SQL
//      needed) and reads fall back to it.
//
// The creator's one-time baseline offer ("your first copy at the base
// price, no markup") is tracked on the record: baseline_offer_session_id
// + baseline_offer_claimed_at while a baseline checkout is open, and
// baseline_offer_redeemed_at once it has actually been paid (set from
// the store webhook). Claims are verified against Stripe before a new
// baseline checkout is issued — an expired claim is released, an open
// one is resumed, a paid one is redeemed. Never trust the client.
//
// Server-only. Relative imports so the pure helpers load in plain Node
// for headless tests.
import { getServiceClient } from '../economy/supabase.js';

const TABLE = 'store_custom_creations';

// ---------------------------------------------------------------------------
// Optional auth: the designer allows guest creation, so identity is
// best-effort — a verified Supabase user when a Bearer token is sent
// (same verification as lib/economy/auth.js), otherwise null.
// ---------------------------------------------------------------------------
export async function optionalUserFromRequest(req) {
  try {
    const authHeader = (req && req.headers && req.headers.get('authorization')) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return null;
    const admin = await getServiceClient();
    if (!admin) return null;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Record normalization (pure). Canonical shape:
//   { creatorUserId, creatorEmail, templateKey, designName, productName,
//     printfulProductId, stripeProductId, baselineCents, markupCents,
//     finalCents, currency, baselineOfferSessionId,
//     baselineOfferClaimedAt, baselineOfferRedeemedAt, createdAt, image }
// `image` is the product mockup when a store of record carries one
// (Stripe product images today; the DB has no image column, so rows
// normalize to null and callers fall back to the live catalog image).
// ---------------------------------------------------------------------------
function intOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function strOr(value, fallback) {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

export function recordFromRow(row) {
  if (!row) return null;
  return {
    creatorUserId: strOr(row.creator_user_id, null),
    creatorEmail: strOr(row.creator_email, null),
    templateKey: strOr(row.template_key, null),
    designName: strOr(row.design_name, null),
    productName: strOr(row.product_name, null),
    printfulProductId: row.printful_product_id != null ? String(row.printful_product_id) : null,
    stripeProductId: strOr(row.stripe_product_id, null),
    baselineCents: intOr(row.baseline_cents, 0),
    markupCents: intOr(row.markup_cents, 0),
    finalCents: intOr(row.final_cents, 0),
    currency: strOr(row.currency, 'cad'),
    baselineOfferSessionId: strOr(row.baseline_offer_session_id, null),
    baselineOfferClaimedAt: strOr(row.baseline_offer_claimed_at, null),
    baselineOfferRedeemedAt: strOr(row.baseline_offer_redeemed_at, null),
    createdAt: strOr(row.created_at, null),
    image: null,
  };
}

// A Stripe product object (or anything with { id, metadata }) -> record.
export function recordFromStripeProduct(product) {
  if (!product || !product.metadata) return null;
  const m = product.metadata;
  if (m.custom !== 'true' || !m.printful_id) return null;
  return {
    creatorUserId: strOr(m.creator_user_id, null),
    creatorEmail: null,
    templateKey: strOr(m.template_key || m.product_key, null),
    designName: strOr(m.design_name, null),
    productName: strOr(m.product_name, null),
    printfulProductId: String(m.printful_id),
    stripeProductId: strOr(product.id, null),
    baselineCents: intOr(m.baseline_cents, 0),
    markupCents: intOr(m.markup_cents, 0),
    finalCents: intOr(m.final_cents, 0),
    currency: strOr(m.currency, 'cad'),
    baselineOfferSessionId: strOr(m.baseline_offer_session_id, null),
    baselineOfferClaimedAt: strOr(m.baseline_offer_claimed_at, null),
    baselineOfferRedeemedAt: strOr(m.baseline_offer_redeemed_at, null),
    // Stripe products carry a unix-seconds `created`; the DB copy of the
    // record has the real timestamp, this is the fallback ordering key.
    createdAt:
      typeof product.created === 'number' && product.created > 0
        ? new Date(product.created * 1000).toISOString()
        : null,
    image:
      Array.isArray(product.images) && typeof product.images[0] === 'string'
        ? product.images[0]
        : null,
  };
}

// The metadata the create route stamps on the Stripe product — the same
// record as the DB row, in Stripe's flat string map.
export function stripeMetadataForRecord(record) {
  return {
    creator_user_id: record.creatorUserId || '',
    template_key: record.templateKey || '',
    design_name: record.designName || '',
    product_name: record.productName || '',
    baseline_cents: String(record.baselineCents || 0),
    markup_cents: String(record.markupCents || 0),
    final_cents: String(record.finalCents || 0),
    currency: record.currency || 'cad',
  };
}

// ---------------------------------------------------------------------------
// Baseline offer decision (pure). Given the record and the Stripe
// session its claim points at (null when there is no claim, or when the
// session could not be fetched), decide what the buy route may do.
// Fails closed: an unverifiable claim stays 'claimed-open'.
// ---------------------------------------------------------------------------
export function baselineOfferState(record, session) {
  if (!record) return 'unavailable';
  if (record.baselineOfferRedeemedAt) return 'redeemed';
  if (!record.baselineOfferSessionId) return 'available';
  if (!session) return 'claimed-open';
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    return 'claimed-paid';
  }
  if (session.status === 'expired') return 'claimed-expired';
  return 'claimed-open';
}

// ---------------------------------------------------------------------------
// DB access — all best-effort (the table may not exist yet).
// ---------------------------------------------------------------------------
function isMissingTable(err) {
  const msg = String((err && err.message) || '');
  const code = (err && err.code) || '';
  return code === 'PGRST205' || code === '42P01' || /store_custom_creations/i.test(msg);
}

async function dbGetByPrintfulId(admin, printfulId) {
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('printful_product_id', String(printfulId))
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error('custom-creations: lookup failed:', error.message || error);
    return null;
  }
  return recordFromRow(data);
}

async function dbUpdateByPrintfulId(admin, printfulId, patch) {
  const { error } = await admin
    .from(TABLE)
    .update(patch)
    .eq('printful_product_id', String(printfulId));
  if (error) {
    if (!isMissingTable(error)) console.error('custom-creations: update failed:', error.message || error);
    return false;
  }
  return true;
}

// Insert a creation row. Returns true when the row landed; false when
// the table isn't provisioned yet (or any other quiet failure) — the
// Stripe metadata copy still carries the record.
export async function insertCreationRecord(record) {
  try {
    const admin = await getServiceClient();
    if (!admin || !record || !record.printfulProductId) return false;
    const { error } = await admin.from(TABLE).insert([
      {
        creator_user_id: record.creatorUserId || null,
        creator_email: record.creatorEmail || null,
        template_key: record.templateKey || null,
        design_name: record.designName || null,
        product_name: record.productName || null,
        printful_product_id: String(record.printfulProductId),
        stripe_product_id: record.stripeProductId || null,
        baseline_cents: record.baselineCents || 0,
        markup_cents: record.markupCents || 0,
        final_cents: record.finalCents || 0,
        currency: record.currency || 'cad',
      },
    ]);
    if (error) {
      if (!isMissingTable(error)) console.error('custom-creations: insert failed:', error.message || error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stripe access — lazy SDK load, same pattern as the store routes.
// ---------------------------------------------------------------------------
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

async function stripeGetByPrintfulId(stripe, printfulId) {
  try {
    const found = await stripe.products.search({
      query: `metadata['printful_id']:'${String(printfulId).replace(/[^0-9]/g, '')}'`,
    });
    const product = found && found.data && found.data[0];
    return recordFromStripeProduct(product) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read one creation record: DB first (the system of record once the
// migration lands), Stripe product metadata as the standing fallback.
// Returns the canonical record or null.
// ---------------------------------------------------------------------------
export async function getCreationRecord({ printfulId, stripeProductId } = {}) {
  try {
    const admin = await getServiceClient();
    if (admin && printfulId) {
      const fromDb = await dbGetByPrintfulId(admin, printfulId);
      if (fromDb) {
        // Enrich with the Stripe product id when the row predates it.
        if (!fromDb.stripeProductId && stripeProductId) fromDb.stripeProductId = stripeProductId;
        return fromDb;
      }
    }
  } catch { /* fall through to Stripe */ }

  const stripe = await loadStripe();
  if (!stripe) return null;
  if (stripeProductId) {
    try {
      const product = await stripe.products.retrieve(stripeProductId);
      const rec = recordFromStripeProduct(product);
      if (rec && (!printfulId || rec.printfulProductId === String(printfulId))) return rec;
    } catch { /* fall through to search */ }
  }
  if (printfulId) return stripeGetByPrintfulId(stripe, printfulId);
  return null;
}

// ---------------------------------------------------------------------------
// Baseline offer claim / release / redeem — written to BOTH stores of
// record, each best-effort, so whichever one a later step reads agrees.
// ---------------------------------------------------------------------------
async function writeBaselineFields(record, fields) {
  const printfulId = record && record.printfulProductId;
  if (!printfulId) return;
  try {
    const admin = await getServiceClient();
    if (admin) {
      const patch = {};
      if ('sessionId' in fields) patch.baseline_offer_session_id = fields.sessionId;
      if ('claimedAt' in fields) patch.baseline_offer_claimed_at = fields.claimedAt;
      if ('redeemedAt' in fields) patch.baseline_offer_redeemed_at = fields.redeemedAt;
      await dbUpdateByPrintfulId(admin, printfulId, patch);
    }
  } catch { /* best-effort */ }
  if (record.stripeProductId) {
    try {
      const stripe = await loadStripe();
      if (stripe) {
        const metadata = {};
        if ('sessionId' in fields) metadata.baseline_offer_session_id = fields.sessionId || '';
        if ('claimedAt' in fields) metadata.baseline_offer_claimed_at = fields.claimedAt || '';
        if ('redeemedAt' in fields) metadata.baseline_offer_redeemed_at = fields.redeemedAt || '';
        await stripe.products.update(record.stripeProductId, { metadata });
      }
    } catch { /* best-effort */ }
  }
}

export async function claimBaselineOffer(record, sessionId) {
  await writeBaselineFields(record, {
    sessionId,
    claimedAt: new Date().toISOString(),
  });
}

export async function releaseBaselineClaim(record) {
  await writeBaselineFields(record, { sessionId: null, claimedAt: null });
}

// Called from the store webhook when a baseline-offer session is paid,
// and from the buy route when it finds the claimed session already
// paid. Idempotent: re-marking an already-redeemed record is a no-op
// write of the same fields.
export async function markBaselineOfferRedeemed(printfulId, sessionId) {
  const record = await getCreationRecord({ printfulId });
  const target = record || { printfulProductId: String(printfulId), stripeProductId: null };
  await writeBaselineFields(target, {
    sessionId: sessionId || target.baselineOfferSessionId || null,
    redeemedAt: new Date().toISOString(),
  });
}

// Fetch the Stripe session a record's claim points at (null when there
// is no claim or Stripe is unreachable — callers fail closed).
export async function getBaselineClaimSession(record) {
  if (!record || !record.baselineOfferSessionId) return null;
  const stripe = await loadStripe();
  if (!stripe) return null;
  try {
    return await stripe.checkout.sessions.retrieve(record.baselineOfferSessionId);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Listing — the creator pages + marketplace read path.
//
// Same store-of-record order as single reads: the DB is the system of
// record once the migration lands, Stripe product metadata is the
// standing fallback. The two are MERGED (dedupe by Printful product
// id, DB wins) rather than either/or, because creations made before
// the migration exists only in Stripe — a creator page that hid them
// would be lying by omission. While the table is missing, the DB leg
// quietly contributes nothing and Stripe carries the list, exactly
// like the single-record reads above.
// ---------------------------------------------------------------------------

// Pure: merge two record lists into one, newest first. Dedupe key is
// the Printful product id; on a clash the FIRST list's record wins
// (callers pass DB first). Records without a Printful id are dropped —
// a creation that cannot be keyed cannot be linked or bought.
export function mergeCreationRecords(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const rec of list || []) {
      if (!rec || !rec.printfulProductId) continue;
      if (!byId.has(rec.printfulProductId)) byId.set(rec.printfulProductId, rec);
    }
  }
  const merged = [...byId.values()];
  merged.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    if (Number.isFinite(ta)) return -1;
    if (Number.isFinite(tb)) return 1;
    return 0;
  });
  return merged;
}

async function dbListCreations(admin, { creatorUserId, limit }) {
  let q = admin
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (creatorUserId) q = q.eq('creator_user_id', creatorUserId);
  const { data, error } = await q;
  if (error) {
    if (!isMissingTable(error)) console.error('custom-creations: list failed:', error.message || error);
    return null; // table not provisioned (or unreadable) — Stripe carries it
  }
  return (data || []).map(recordFromRow).filter(Boolean);
}

// Stripe Search over product metadata. The creator filter is applied
// in the query itself when the id is search-safe (Supabase user ids
// are UUIDs); anything else can never match a stamped creator id, so
// it short-circuits to an empty list instead of a malformed query.
async function stripeListCreations(stripe, { creatorUserId, limit }) {
  let query = `metadata['custom']:'true'`;
  if (creatorUserId) {
    if (!/^[A-Za-z0-9_-]+$/.test(creatorUserId)) return [];
    query += ` AND metadata['creator_user_id']:'${creatorUserId}'`;
  }
  const out = [];
  let page = undefined;
  for (let i = 0; i < 5 && out.length < limit; i++) {
    let found;
    try {
      found = await stripe.products.search({ query, limit: 100, page });
    } catch {
      break;
    }
    for (const product of (found && found.data) || []) {
      const rec = recordFromStripeProduct(product);
      if (rec) out.push(rec);
      if (out.length >= limit) break;
    }
    if (!found || !found.has_more || !found.next_page) break;
    page = found.next_page;
  }
  return out;
}

// List creation records, newest first. `limit` is clamped to [1, 500].
// Returns { records, fromDb, fromStripe } — the flags say which stores
// of record actually answered, so callers can be honest about coverage
// (e.g. fromDb false today simply means the migration hasn't run).
export async function listCreationRecords({ creatorUserId = null, limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, Math.round(Number(limit) || 100)));
  let dbRecords = null;
  try {
    const admin = await getServiceClient();
    if (admin) dbRecords = await dbListCreations(admin, { creatorUserId, limit: lim });
  } catch { /* DB leg is best-effort */ }

  let stripeRecords = null;
  const stripe = await loadStripe();
  if (stripe) {
    stripeRecords = await stripeListCreations(stripe, { creatorUserId, limit: lim });
  }

  return {
    records: mergeCreationRecords(dbRecords || [], stripeRecords || []).slice(0, lim),
    fromDb: dbRecords !== null,
    fromStripe: stripeRecords !== null,
  };
}
