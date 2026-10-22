// lib/earth2/parcels.js
// EARTH 2 — THE PARCEL GRID (Phase 2 foundation, owner test build).
//
// The whole globe divided into 2,500 parcels: a regular 50 × 50
// lat/lon grid, each with a stable id (E2-0001 … E2-2500), a name,
// and a price tier.
//
// MERLIN'S LAND RULE (2026-10-22): "There should be more free tiles
// than owned tiles." So exactly 1,000 of the 2,500 parcels — his
// original ~1000-owner vision, unchanged in count — are OWNABLE, and
// the other 1,500 are FREE COMMONS: open land for everyone, never
// purchasable, never listed, never rented, no price, ever.
//
// Which parcels are ownable is a deterministic interleave over the
// row-major index: ownable iff (index * 2) % 5 < 2 — exactly 40%,
// spread evenly across the whole globe so no continent is all-owned
// or all-free. The server, the client and the tests all derive the
// identical grid from this arithmetic alone.
//
// PRICING IS A PLACEHOLDER. The tiers below are the numbers from the
// Earth 2 plan discussion (2026-10-21) — standard 10,000 gold, prime
// 50,000, landmark 250,000 — parked here so the test build has prices
// to exercise. Merlin has NOT ruled on final tile pricing; when he
// does, this table is the one place that changes. Prices apply ONLY
// to ownable parcels; commons parcels carry priceGold: null.
//
// Pure and deterministic: no imports, no randomness, no clock.

export const PARCEL_COUNT = 2500;
export const PARCEL_COLS = 50; // longitude divisions (7.2° each)
export const PARCEL_ROWS = 50; // latitude divisions (3.6° each)

// Merlin's split: 1,000 ownable / 1,500 Free Commons (see header).
export const PARCEL_OWNABLE_COUNT = 1000;
export const PARCEL_COMMONS_COUNT = 1500;

// PLACEHOLDER prices (gold) — see the header note. Ownable only.
export const PARCEL_PRICE_STANDARD = 10000;
export const PARCEL_PRICE_PRIME = 50000;
export const PARCEL_PRICE_LANDMARK = 250000;

export const PARCEL_PRICES = {
  standard: PARCEL_PRICE_STANDARD,
  prime: PARCEL_PRICE_PRIME,
  landmark: PARCEL_PRICE_LANDMARK,
};

const LON_STEP = 360 / PARCEL_COLS; // 7.2°
const LAT_STEP = 180 / PARCEL_ROWS; // 3.6°

// World landmarks whose parcel carries the landmark tier and the
// landmark's name: [name, lat, lon]. Athens first — home turf.
const LANDMARKS = [
  ['Athens', 37.9838, 23.7275],
  ['Paris', 48.8566, 2.3522],
  ['London', 51.5074, -0.1278],
  ['Rome', 41.9028, 12.4964],
  ['Cairo', 30.0444, 31.2357],
  ['New York', 40.7128, -74.006],
  ['Los Angeles', 34.0522, -118.2437],
  ['Rio de Janeiro', -22.9068, -43.1729],
  ['Tokyo', 35.6762, 139.6503],
  ['Sydney', -33.8688, 151.2093],
  ['Everest', 27.9881, 86.925],
  ['Honolulu', 21.3099, -157.8581],
];

// Deterministic flavour-name parts for the ordinary parcels.
const NAME_A = [
  'Amber', 'Cinder', 'Verdant', 'Frost', 'Ember',
  'Silent', 'Golden', 'Iron', 'Coral', 'Onyx',
];
const NAME_B = [
  'Vale', 'Reach', 'Fields', 'Shore', 'Highlands',
  'Basin', 'Steppe', 'Grove', 'Cliffs', 'Meadows',
];

function parcelIdFor(index) {
  return `E2-${String(index + 1).padStart(4, '0')}`;
}

/**
 * The ownable interleave (Merlin's land rule): exactly 2 of every 5
 * parcels in row-major order are ownable — (index * 2) % 5 < 2 —
 * which lands ownable parcels at index % 5 ∈ {0, 3}, evenly spread.
 */
export function isOwnableIndex(index) {
  const i = Math.floor(Number(index) || 0);
  return (i * 2) % 5 < 2;
}

function buildParcel(index) {
  const col = index % PARCEL_COLS;
  const row = Math.floor(index / PARCEL_COLS);
  const lonMin = -180 + col * LON_STEP;
  const lonMax = lonMin + LON_STEP;
  const latMax = 90 - row * LAT_STEP;
  const latMin = latMax - LAT_STEP;
  const centerLat = (latMin + latMax) / 2;
  const centerLon = (lonMin + lonMax) / 2;

  const landmark = LANDMARKS.find(
    ([, la, lo]) => la >= latMin && la < latMax && lo >= lonMin && lo < lonMax
  );
  let tier = 'standard';
  if (landmark) tier = 'landmark';
  else if (Math.abs(centerLat) <= 35) tier = 'prime';

  const name = landmark
    ? landmark[0]
    : `${NAME_A[(index * 7 + 3) % NAME_A.length]} ${NAME_B[(index * 13 + 5) % NAME_B.length]}`;

  const ownable = isOwnableIndex(index);

  return {
    id: parcelIdFor(index),
    index,
    col,
    row,
    name,
    tier,
    // Free Commons have no price — price fields are only meaningful
    // for ownable parcels.
    priceGold: ownable ? PARCEL_PRICES[tier] : null,
    ownable,
    kind: ownable ? 'ownable' : 'commons',
    latMin,
    latMax,
    lonMin,
    lonMax,
    centerLat,
    centerLon,
  };
}

// The full grid, in id order (row 0 is the northernmost band).
export const PARCELS = Array.from({ length: PARCEL_COUNT }, (_, i) => buildParcel(i));

const BY_ID = new Map(PARCELS.map((p) => [p.id, p]));

/** One parcel by its stable id ('E2-0001'…'E2-2500'), or null. */
export function parcelById(id) {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id.trim().toUpperCase()) || null;
}

/**
 * The parcel containing a point. Lat clamps to the poles; lon wraps
 * around the antimeridian, so parcelAt(10, 181) === parcelAt(10, -179).
 */
export function parcelAt(lat, lon) {
  const la = Math.max(-90, Math.min(90, Number(lat) || 0));
  const wrapped = (((Number(lon) || 0) + 180) % 360 + 360) % 360 - 180;
  const col = Math.min(PARCEL_COLS - 1, Math.floor((wrapped + 180) / LON_STEP));
  const row = Math.min(PARCEL_ROWS - 1, Math.floor((90 - la) / LAT_STEP));
  return PARCELS[row * PARCEL_COLS + col];
}

/**
 * The buy guard, at the lib level: returns a plain-English refusal
 * for a parcel that can never be bought, or null when the parcel is
 * purchasable. Free Commons are open land for everyone — no sale, no
 * listing, no rent, ever.
 */
export function buyRefusal(parcel) {
  if (!parcel) return 'Unknown parcel.';
  if (!parcel.ownable || parcel.kind === 'commons') {
    return 'Free Commons parcels are open land for everyone — they can never be bought, sold, or rented.';
  }
  return null;
}
