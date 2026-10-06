// lib/auction/helpers.js
// Pure helpers for the Forge -> Profile -> Auction House -> Backpack pipeline.
// No imports, no I/O — safe to unit-test in plain Node.

/** The 8 known World Engine asset categories (mirrors the DB check). */
export const AUCTION_CATEGORIES = [
  'world',
  'weather',
  'character',
  'creature',
  'vehicle',
  'object',
  'weapon',
  'asset_link',
];

/** listing_type values on world_engine_assets (includes 'none' = unlisted). */
export const ASSET_LISTING_TYPES = ['none', 'auction', 'fixed', 'both'];

/** listing_type values on auction_listings (a listing is always for sale). */
export const LISTING_TYPES = ['auction', 'fixed', 'both'];

export function normalizeCategory(c) {
  return String(c || '').trim().toLowerCase();
}

export function isValidCategory(c) {
  return AUCTION_CATEGORIES.includes(normalizeCategory(c));
}

export function isValidAssetListingType(t) {
  return ASSET_LISTING_TYPES.includes(String(t || '').trim().toLowerCase());
}

export function isValidListingType(t) {
  return LISTING_TYPES.includes(String(t || '').trim().toLowerCase());
}

/**
 * Minimum bid increment: $1.00 or 5% of the current bid, whichever is larger.
 * For the opening bid this is not used — the first bid must meet
 * starting_bid_cents instead.
 */
export function minBidIncrementCents(currentBidCents) {
  const current = Math.max(0, Math.round(Number(currentBidCents) || 0));
  return Math.max(100, Math.ceil(current * 0.05));
}

/** Idempotency reference for a bid attempt (one active bid per bidder+amount). */
export function bidIdempotencyRef(listingId, bidderId, amountCents) {
  return `auction:bid:${listingId}:${bidderId}:${amountCents}`;
}

/** Idempotency reference for the buyer's wallet debit on a sale. */
export function saleBuyerRef(listingId) {
  return `auction:sale:${listingId}:buyer`;
}

/** Idempotency reference for the seller's wallet credit on a sale. */
export function saleSellerRef(listingId) {
  return `auction:sale:${listingId}:seller`;
}

/** Clamp a query param to an integer in [min, max]; falls back to dflt. */
export function clampInt(value, min, max, dflt) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

/** Plain-English USD formatting for integer cents. */
export function formatUsdCents(cents) {
  const c = Math.round(Number(cents) || 0);
  return `$${(c / 100).toFixed(2)}`;
}

/**
 * Validate the PATCH /api/world-engine/assets/[id] body.
 * Returns { ok, error?, patch } — patch holds only the fields to update.
 */
export function validateAssetPatch(body = {}) {
  const patch = {};
  if (body.display_name !== undefined) {
    const name = String(body.display_name || '').trim().slice(0, 140);
    if (!name) return { ok: false, error: 'Give the item a display name.' };
    patch.display_name = name;
  }
  if (body.listing_type !== undefined) {
    const t = String(body.listing_type || '').trim().toLowerCase();
    if (!isValidAssetListingType(t)) {
      return { ok: false, error: 'listing_type must be one of: none, auction, fixed, both.' };
    }
    patch.listing_type = t;
  }
  for (const key of ['starting_bid_cents', 'buy_now_price_cents']) {
    if (body[key] !== undefined) {
      const n = Math.round(Number(body[key]));
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: `${key} must be a whole number of cents, 0 or more.` };
      }
      patch[key] = n;
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' };
  return { ok: true, patch };
}

/**
 * Validate the POST /api/auction/list body.
 * Amounts come back as integer cents (or null when not applicable).
 * Returns { ok, error?, asset_id, listing_type, starting_bid_cents,
 *           buy_now_price_cents, ends_at, title, description }.
 */
export function validateListInput(body = {}) {
  const asset_id = String(body.asset_id || '').trim();
  if (!asset_id) return { ok: false, error: 'Choose an item to list (asset_id).' };
  const listing_type = String(body.listing_type || '').trim().toLowerCase();
  if (!isValidListingType(listing_type)) {
    return { ok: false, error: 'listing_type must be one of: auction, fixed, both.' };
  }
  let starting_bid_cents = null;
  if (listing_type === 'auction' || listing_type === 'both') {
    starting_bid_cents = Math.round(Number(body.starting_bid_cents));
    if (!Number.isFinite(starting_bid_cents) || starting_bid_cents < 0) {
      return { ok: false, error: 'Set a starting bid in whole cents (0 or more).' };
    }
  }
  let buy_now_price_cents = null;
  if (listing_type === 'fixed' || listing_type === 'both') {
    buy_now_price_cents = Math.round(Number(body.buy_now_price_cents));
    if (!Number.isFinite(buy_now_price_cents) || buy_now_price_cents <= 0) {
      return { ok: false, error: 'Set a buy-now price in whole cents (more than 0).' };
    }
  }
  let ends_at = null;
  if (body.ends_at !== undefined && body.ends_at !== null && String(body.ends_at).trim() !== '') {
    const d = new Date(body.ends_at);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'ends_at must be a valid date.' };
    if (d.getTime() <= Date.now()) return { ok: false, error: 'ends_at must be in the future.' };
    ends_at = d.toISOString();
  }
  const title = String(body.title || '').trim().slice(0, 140) || null;
  const description = String(body.description || '').trim().slice(0, 2000) || null;
  return {
    ok: true,
    asset_id,
    listing_type,
    starting_bid_cents,
    buy_now_price_cents,
    ends_at,
    title,
    description,
  };
}

/**
 * Validate a bid amount against a live auction_listings row.
 * Returns { ok, error?, status? } — status is the HTTP code for the error.
 * `now` is injectable for tests.
 */
export function validateBidAmount(listing, amountCents, bidderId, now = Date.now()) {
  if (!listing) return { ok: false, error: 'Listing not found.', status: 404 };
  if (listing.status !== 'live') {
    return { ok: false, error: 'This listing is no longer live.', status: 409 };
  }
  const lt = String(listing.listing_type || '').toLowerCase();
  if (lt !== 'auction' && lt !== 'both') {
    return { ok: false, error: 'This listing does not accept bids.', status: 400 };
  }
  if (listing.ends_at && new Date(listing.ends_at).getTime() <= now) {
    return { ok: false, error: 'This auction has ended.', status: 409 };
  }
  if (String(listing.seller_id) === String(bidderId)) {
    return { ok: false, error: 'You cannot bid on your own listing.', status: 400 };
  }
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Bid in whole cents, more than 0.', status: 400 };
  }
  const current = Math.round(Number(listing.current_bid_cents) || 0);
  if (!current || current <= 0) {
    const start = Math.round(Number(listing.starting_bid_cents) || 0);
    if (amount < start) {
      return {
        ok: false,
        error: `The opening bid is ${formatUsdCents(start)}.`,
        status: 400,
      };
    }
  } else {
    const minimum = current + minBidIncrementCents(current);
    if (amount < minimum) {
      return {
        ok: false,
        error: `Bid at least ${formatUsdCents(minimum)} to outbid the current ${formatUsdCents(current)}.`,
        status: 400,
      };
    }
  }
  return { ok: true };
}

/**
 * Public, safe view of a world_engine_assets row for the creations feed.
 * Never includes user_id or anything account-sensitive.
 */
export function publicAssetFields(a = {}) {
  return {
    id: a.id,
    display_name: a.display_name,
    category: a.category,
    asset_url: a.asset_url,
    generation_params: a.generation_params,
    created_at: a.created_at,
    is_listed: !!a.is_listed,
    listing_type: a.listing_type,
    starting_bid_cents: a.starting_bid_cents,
    buy_now_price_cents: a.buy_now_price_cents,
  };
}
