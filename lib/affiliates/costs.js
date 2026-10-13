// lib/affiliates/costs.js — server-only true-COGS resolution for the affiliate program.
//
// The affiliate commission is 10% of the HOUSE's net. Net must subtract real
// costs, not just Stripe fees. The only surface with physical COGS today is
// the store (Printful fulfillment). Every other hooked surface is digital
// (tickets, HERMES listings, luge unlocks, gallery credits, fortress
// storage, world-engine tiers, persephone tickets) and carries zero COGS.
//
// Store cost source: Printful v2 catalog prices API, currency=CAD —
// deterministic per-variant base fulfillment cost, no FX guessing, no
// estimates. NOTE: item base cost only; order-level Printful shipping is NOT
// included (varies per order; flagged as a follow-up).
//
// Pure helpers (storeProductKey, computeVariantItemCost) are exported for
// headless tests. The fetchers are server-only (PRINTFUL_API_KEY).

const PF_BASE = 'https://api.printful.com';
const PF_STORE_ID = '17419146';
const FETCH_TIMEOUT_MS = 8000;

/** 'pf_474601990' + 'l' -> 'pf:474601990:L'. Null when unusable. */
export function storeProductKey({ product_id, size }) {
  const m = String(product_id || '').match(/^pf_(\d+)$/);
  const s = String(size || '').trim().toUpperCase();
  if (!m || !s) return null;
  return `pf:${m[1]}:${s}`;
}

// ---------------------------------------------------------------------------
// Stripe session metadata transport for store order lines.
//
// The checkout session is the only bridge between the store checkout (which
// knows the priced lines) and the store webhook (which accrues affiliate
// commissions and needs true COGS per line). Stripe metadata is flat
// strings (keys <= 40 chars, values <= 500 chars, <= 50 keys), so one JSON
// value cannot hold a max-size cart (25 lines). The line array is packed
// into cogs_lines, cogs_lines_2, ... — each a JSON array of WHOLE entries
// whose encoded length stays <= 480 chars — plus cogs_line_count so the
// reader can prove nothing was truncated in transit.
//
// Encoding is all-or-nothing: an unencodable line, or a cart that somehow
// does not fit, emits NO cogs keys at all, and the webhook parks the
// commission as pending_cost rather than resolving a partial order.
//
// Line entry (short keys keep chunks small):
//   { p: 'pf_<sync product id>', v: '<catalog variant id>' | null,
//     s: '<size>', q: <qty> }
// parseStoreCogsLines returns the canonical shape:
//   { product_id, variant_id, size, qty }
// ---------------------------------------------------------------------------

const COGS_META_KEY = 'cogs_lines';
const COGS_META_COUNT_KEY = 'cogs_line_count';
const COGS_META_MAX_CHUNKS = 8;
const COGS_META_CHUNK_BUDGET = 480; // chars per value, safely under Stripe's 500

function cogsChunkKey(i) {
  return i === 0 ? COGS_META_KEY : `${COGS_META_KEY}_${i + 1}`;
}

/** Validate + normalize one line (accepts entry or canonical shape). */
function normalizeCogsLine(line) {
  if (!line || typeof line !== 'object') return null;
  const p = String(line.product_id || line.p || '');
  if (!/^pf_\d+$/.test(p)) return null;
  const s = String(line.size != null ? line.size : line.s || '').trim();
  if (!s || s.length > 64) return null;
  const q = Number(line.qty != null ? line.qty : line.q);
  if (!Number.isInteger(q) || q < 1 || q > 999) return null;
  const vRaw = line.variant_id != null ? line.variant_id : line.v;
  const v = vRaw == null || vRaw === '' ? null : String(vRaw);
  if (v != null && !/^\d+$/.test(v)) return null;
  return { p, v, s, q };
}

/**
 * Lines -> Stripe metadata entries ({ cogs_lines, cogs_lines_2?, ...,
 * cogs_line_count }). {} when there is nothing encodable — callers spread
 * the result into the session metadata, so {} is a safe no-op.
 */
export function encodeStoreCogsLines(lines) {
  const entries = [];
  for (const line of lines || []) {
    const n = normalizeCogsLine(line);
    if (!n) return {}; // unencodable line: emit nothing, never a partial set
    entries.push(n);
  }
  if (!entries.length) return {};
  const chunks = [];
  let cur = [];
  for (const e of entries) {
    const trial = [...cur, e];
    if (JSON.stringify(trial).length <= COGS_META_CHUNK_BUDGET) {
      cur = trial;
      continue;
    }
    if (!cur.length) return {}; // a single entry exceeds the budget: give up whole
    chunks.push(cur);
    cur = [e];
    if (JSON.stringify(cur).length > COGS_META_CHUNK_BUDGET) return {};
  }
  if (cur.length) chunks.push(cur);
  if (chunks.length > COGS_META_MAX_CHUNKS) return {};
  const meta = { [COGS_META_COUNT_KEY]: String(entries.length) };
  chunks.forEach((c, i) => {
    meta[cogsChunkKey(i)] = JSON.stringify(c);
  });
  return meta;
}

/**
 * Session metadata -> canonical lines, or null when the transport is
 * absent or malformed in ANY way (bad JSON, a chunk gap, a count that
 * disagrees with the entries, an invalid line). Null is the safe answer:
 * the caller parks the commission as pending_cost instead of guessing.
 * Sessions created before cogs_lines existed fall back to the historical
 * single-line read (product_id + size, qty 1).
 */
export function parseStoreCogsLines(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const chunkArrays = [];
  let sawChunk = false;
  let gap = false;
  for (let i = 0; i < COGS_META_MAX_CHUNKS; i++) {
    const raw = m[cogsChunkKey(i)];
    if (raw == null || raw === '') {
      for (let j = i + 1; j < COGS_META_MAX_CHUNKS; j++) {
        if (m[cogsChunkKey(j)] != null && m[cogsChunkKey(j)] !== '') gap = true;
      }
      break;
    }
    sawChunk = true;
    let arr;
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!Array.isArray(arr)) return null;
    chunkArrays.push(arr);
  }
  if (gap) return null;
  if (sawChunk) {
    const lines = [];
    for (const arr of chunkArrays) {
      for (const e of arr) {
        const n = normalizeCogsLine(e);
        if (!n) return null;
        lines.push({ product_id: n.p, variant_id: n.v, size: n.s, qty: n.q });
      }
    }
    const declared = Number(m[COGS_META_COUNT_KEY]);
    if (!Number.isInteger(declared) || declared !== lines.length) return null;
    return lines.length ? lines : null;
  }
  const legacy = normalizeCogsLine({ product_id: m.product_id, size: m.size, qty: 1 });
  return legacy ? [{ product_id: legacy.p, variant_id: null, size: legacy.s, qty: 1 }] : null;
}

/**
 * The commission row's product_key for an order: the single line's key
 * when the order has exactly one line (finalize-costs can then un-park it
 * by key). Multi-line orders return null — their COGS is an order total,
 * not one variant's cost, so no single key honestly represents them.
 */
export function storeOrderProductKey(lines) {
  if (!Array.isArray(lines) || lines.length !== 1) return null;
  const n = normalizeCogsLine(lines[0]);
  return n ? storeProductKey({ product_id: n.p, size: n.s }) : null;
}

/**
 * Printful file type -> v2 placement id. Unknown types fall through to a
 * direct id match; unmatched types are ignored (never guessed).
 */
const FILE_TYPE_TO_PLACEMENT = {
  default: 'front',
  front: 'front',
  back: 'back',
  front_large: 'front_large',
  sleeve_right: 'sleeve_right',
  sleeve_left: 'sleeve_left',
  pocket: 'pocket',
  hood: 'hood',
  label_inside: 'label_inside',
  label_outside: 'label_outside',
};

function toCents(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/**
 * Item base cost from a v2 /prices payload (currency=CAD).
 * cost = technique.price + first USED placement at discounted_price
 *        + each further used placement at price.
 * usedPlacementIds: placement ids with files on the sync variant, in
 * product.placements order. When null/omitted, all priced placements are
 * summed (documented over-estimate; the runtime path always passes the
 * real used list).
 * Returns { cost_cents, currency } or null when unparseable.
 */
export function computeVariantItemCost(pricesData, usedPlacementIds = null) {
  const data = (pricesData && pricesData.data) || pricesData || {};
  const variant = data.variant || {};
  const product = data.product || {};
  const techniques = variant.techniques || [];
  if (!techniques.length) return null;
  if (techniques.length > 1) {
    console.error(`affiliate costs: variant has ${techniques.length} techniques; using first`);
  }
  let cost = toCents(techniques[0].price);
  const placements = product.placements || [];
  const used = new Set((usedPlacementIds || []).map(String));
  const charged = placements.filter((p) =>
    usedPlacementIds === null ? true : used.has(String(p.id))
  );
  charged.forEach((p, i) => {
    cost += toCents(i === 0 ? p.discounted_price : p.price);
  });
  return { cost_cents: cost, currency: data.currency || 'CAD' };
}

/** Sync-variant file types -> ordered placement ids (product.placements order). */
export function usedPlacementsFromFiles(syncVariant, placements) {
  const files = (syncVariant && syncVariant.files) || [];
  const order = new Map((placements || []).map((p, i) => [String(p.id), i]));
  const ids = new Set();
  for (const f of files) {
    const t = String(f && f.type || '').toLowerCase();
    const pid = FILE_TYPE_TO_PLACEMENT[t] || t;
    if (order.has(pid)) ids.add(pid);
  }
  return [...ids].sort((a, b) => order.get(a) - order.get(b));
}

async function pfFetchJson(path) {
  const key = process.env.PRINTFUL_API_KEY || '';
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(PF_BASE + path, {
      headers: { Authorization: 'Bearer ' + key, 'User-Agent': 'olympusverse-affiliates/1.0' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** DB lookup: aff_product_costs. Null on miss (or when the table is absent). */
export async function getStoredCost(admin, { surface, product_key }) {
  try {
    const { data, error } = await admin
      .from('aff_product_costs')
      .select('cost_cents, currency')
      .eq('surface', surface)
      .eq('product_key', product_key)
      .maybeSingle();
    if (error || !data) return null;
    return { cost_cents: data.cost_cents, currency: data.currency || 'CAD' };
  } catch {
    return null; // table not provisioned yet: caller treats as unresolvable
  }
}

export async function storeCost(admin, { surface, product_key, cost_cents, currency = 'CAD', source = '' }) {
  try {
    await admin.from('aff_product_costs').upsert(
      { surface, product_key, cost_cents, currency, source, updated_at: new Date().toISOString() },
      { onConflict: 'surface,product_key' }
    );
  } catch {
    /* best-effort cache write; never fatal */
  }
}

/**
 * Live Printful resolution for one store variant. Best-effort: any failure
 * returns null and the caller marks the commission pending_cost.
 */
export async function fetchStoreVariantCost({ sync_product_id, size }) {
  const detail = await pfFetchJson(`/store/products/${sync_product_id}?store_id=${PF_STORE_ID}`);
  const variants = (detail && detail.result && detail.result.sync_variants) || [];
  const want = String(size || '').trim().toUpperCase();
  const sv = variants.find(
    (v) => String(v.size || '').trim().toUpperCase() === want && v.variant_id
  );
  if (!sv) return null;
  const prices = await pfFetchJson(
    `/v2/catalog-variants/${sv.variant_id}/prices?currency=CAD`
  );
  if (!prices) return null;
  const used = usedPlacementsFromFiles(sv, (prices.data || {}).product?.placements);
  return computeVariantItemCost(prices, used);
}

/**
 * True COGS for a store order line, in CAD cents.
 * DB first (pre-seeded for the whole catalog); live Printful fetch as a
 * best-effort fallback that also backfills the table. Null when the cost
 * is genuinely unknowable right now -> caller uses pending_cost.
 */
export async function resolveStoreCogs(admin, { product_id, size }) {
  const key = storeProductKey({ product_id, size });
  if (!key) return null;
  const stored = await getStoredCost(admin, { surface: 'store', product_key: key });
  if (stored) {
    if (String(stored.currency).toUpperCase() !== 'CAD') return null; // never mix currencies
    return stored.cost_cents;
  }
  const m = String(product_id || '').match(/^pf_(\d+)$/);
  const live = m ? await fetchStoreVariantCost({ sync_product_id: m[1], size }) : null;
  if (!live || String(live.currency).toUpperCase() !== 'CAD') return null;
  await storeCost(admin, {
    surface: 'store', product_key: key,
    cost_cents: live.cost_cents, currency: 'CAD', source: 'printful_catalog_v2',
  });
  return live.cost_cents;
}

/**
 * True COGS for a whole store order: sum of per-variant unit costs x qty
 * across every line. Null when there are no lines, a line is malformed,
 * or ANY line's cost is unresolvable — a partial sum would understate
 * COGS and over-credit the commission, so the order parks as
 * pending_cost instead (see accrueAffiliateCommission).
 */
export async function resolveStoreOrderCogs(admin, lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  let total = 0;
  for (const line of lines) {
    const n = normalizeCogsLine(line);
    if (!n) return null;
    // eslint-disable-next-line no-await-in-loop
    const unit = await resolveStoreCogs(admin, { product_id: n.p, size: n.s });
    if (unit == null) return null;
    total += unit * n.q;
  }
  return total;
}
