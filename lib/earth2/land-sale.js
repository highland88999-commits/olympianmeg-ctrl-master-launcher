// lib/earth2/land-sale.js
// EARTH 2 — LAND SALES: the FIRST ROUND (the chamber's own sale of
// ownable parcels) and RESALE (owners listing parcels in the Auction
// House's 'Land Tiles' category, lib/auction/helpers.js).
//
// Merlin's land rules (2026-10-22):
//   · More free tiles than owned tiles — 1,000 ownable / 1,500 Free
//     Commons (lib/earth2/parcels.js).
//   · While first-round parcels remain, the chamber's "First Round
//     Land Sale" frame sells ownable, unsold parcels at tier price.
//   · When ALL 1,000 ownable parcels are sold, the first round is
//     complete and land changes hands peer-to-peer instead: owners
//     list parcels under the Auction House 'Land Tiles' category,
//     and buying a listing transfers the parcel's title AND rent
//     rights to the buyer.
//   · Free Commons can never be listed, bought, sold, or rented.
//
// Pure and deterministic (a clock value is passed in where a
// timestamp is needed). Ownership rows are earth2_parcels-shaped:
// { parcel_id, owner_id, owner_email, price_gold, acquired_at }.
//
// PERSISTENCE SEAM (honest): titles live in the earth2_parcels table,
// which does not exist until supabase/earth2.sql runs (Merlin's green
// light). Until then this layer is exercised by the chamber's
// local-preview state and the tests; transfers computed here persist
// the moment the same rows flow through the state API.

import { PARCELS, parcelById } from './parcels.js';
import { onParcelSold } from '../building/rights.js';

/** Every ownable parcel id, in grid order. */
export const OWNABLE_PARCELS = PARCELS.filter((p) => p.ownable);

/** Set of parcel ids that currently have an owner. */
export function ownedIdSet(rows) {
  return new Set(
    (Array.isArray(rows) ? rows : [])
      .map((r) => r && r.parcel_id)
      .filter((id) => typeof id === 'string')
  );
}

/** First round: the ownable parcels still for sale (unsold). */
export function firstRoundListings(rows) {
  const owned = ownedIdSet(rows);
  return OWNABLE_PARCELS.filter((p) => !owned.has(p.id));
}

/** How many first-round parcels remain unsold. */
export function firstRoundRemaining(rows) {
  return firstRoundListings(rows).length;
}

/** The first round is complete when every ownable parcel is owned. */
export function firstRoundSoldOut(rows) {
  return firstRoundRemaining(rows) === 0;
}

/**
 * Validate a resale listing for a parcel. The seller must own the
 * parcel; Free Commons are refused outright (Merlin's rule). Asking
 * price is in gold, a whole number above zero.
 */
export function validateLandListing(parcel, rows, askingGold, sellerEmail) {
  if (!parcel) return { ok: false, error: 'Unknown parcel.' };
  if (!parcel.ownable || parcel.kind === 'commons') {
    return { ok: false, error: 'Free Commons parcels can never be listed for sale.' };
  }
  const mine = String(sellerEmail || '').toLowerCase();
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r.parcel_id === parcel.id);
  if (!row || String(row.owner_email || '').toLowerCase() !== mine) {
    return { ok: false, error: 'You can only list a parcel you own.' };
  }
  const price = Math.round(Number(askingGold));
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'Set an asking price in gold (more than 0).' };
  }
  return { ok: true, askingGold: price };
}

/**
 * Build a Land Tiles listing for an owned parcel.
 * Returns { ok, listing } or { ok: false, error }.
 */
export function createLandListing(parcel, rows, askingGold, sellerEmail, atMs) {
  const v = validateLandListing(parcel, rows, askingGold, sellerEmail);
  if (!v.ok) return v;
  return {
    ok: true,
    listing: {
      id: `land:${parcel.id}`,
      category: 'land_tiles',
      parcelId: parcel.id,
      name: parcel.name,
      tier: parcel.tier,
      askingGold: v.askingGold,
      sellerEmail: String(sellerEmail || ''),
      listedAt: Number.isFinite(atMs) ? atMs : null,
      status: 'live',
    },
  };
}

/**
 * Buy a land listing: transfer the parcel's title (and with it the
 * rent rights — rent always reads the current owner row) from the
 * seller to the buyer in the ownership-row state layer.
 * Returns { ok, rows } with a NEW rows array (input untouched), or
 * { ok: false, error, rows } with the original rows.
 *
 * HOMESTEAD EVICTION (building design, 2026-10-22): when the caller
 * passes the building state as the optional `building` argument —
 * { claims, builds } collections from lib/building/rights.js — a
 * successful transfer also settles any homestead claim on the
 * parcel through onParcelSold: the claim ends, the claimant's build
 * is packed up (blueprint returned) and a notification record is
 * produced; the result then carries `eviction` with the settled
 * collections. Callers that pass no building state see the exact
 * historical behaviour. First-round sales settle the same way at
 * the database level (app/api/earth2/buy + evictHomesteadOnSaleDb).
 */
export function transferLandTitle(rows, parcelId, buyer, atMs, building) {
  const list = Array.isArray(rows) ? rows : [];
  const parcel = parcelById(parcelId);
  if (!parcel) return { ok: false, error: 'Unknown parcel.', rows: list };
  if (!parcel.ownable || parcel.kind === 'commons') {
    return { ok: false, error: 'Free Commons parcels can never change hands.', rows: list };
  }
  const idx = list.findIndex((r) => r && r.parcel_id === parcel.id);
  if (idx < 0) return { ok: false, error: 'That parcel has no owner to buy from.', rows: list };
  if (!buyer || !buyer.id || !buyer.email) {
    return { ok: false, error: 'A buyer account is required.', rows: list };
  }
  if (String(list[idx].owner_id) === String(buyer.id)) {
    return { ok: false, error: 'You already own that parcel.', rows: list };
  }
  const next = list.slice();
  next[idx] = {
    ...list[idx],
    owner_id: buyer.id,
    owner_email: buyer.email,
    acquired_at: Number.isFinite(atMs) ? new Date(atMs).toISOString() : list[idx].acquired_at,
  };
  const result = { ok: true, rows: next };
  if (building && Array.isArray(building.claims)) {
    result.eviction = onParcelSold(
      building.claims,
      Array.isArray(building.builds) ? building.builds : [],
      parcel.id,
      buyer,
      atMs
    );
  }
  return result;
}
