// lib/earth2/home-base.js
// EARTH 2 — HOME BASE (Merlin's rule, 2026-10-22): a user who owns
// land in Earth 2 spawns at their home base when they enter. The
// home base is the parcel the owner chose with "Set as home base";
// until they choose, it defaults to the FIRST parcel they acquired.
//
// Pure resolution logic + a storage-guarded choice reader/writer.
// The choice itself is a per-user preference: in this local-preview
// build it persists on the owner's device (localStorage) and the
// resolution against live ownership rows happens here, so the day
// the earth2 tables land the same rule resolves server-side.
// Ownership rows are earth2_parcels-shaped and are expected in
// acquisition order (the state route orders by acquired_at asc).

export const HOME_BASE_STORAGE_KEY = 'earth2:home-base:v1';

/**
 * Which parcel is this user's home base?
 *   ownedRows — their ownership rows, oldest acquisition first.
 *   chosenId  — the stored "Set as home base" choice, if any.
 * Returns the parcel id, or null when the user owns no land (they
 * keep the default entry — no home base, no spawn point).
 * A choice that no longer resolves to an owned parcel (sold on)
 * falls back to the first parcel they still own.
 */
export function resolveHomeBase(ownedRows, chosenId) {
  const rows = Array.isArray(ownedRows) ? ownedRows : [];
  if (rows.length === 0) return null;
  const chosen = typeof chosenId === 'string' ? chosenId.trim().toUpperCase() : '';
  if (chosen && rows.some((r) => r && r.parcel_id === chosen)) return chosen;
  const first = rows.find((r) => r && typeof r.parcel_id === 'string');
  return first ? first.parcel_id : null;
}

/** The user's own rows out of a full ownership list, order preserved. */
export function ownedRowsFor(rows, email) {
  const mine = String(email || '').toLowerCase();
  if (!mine) return [];
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => r && String(r.owner_email || '').toLowerCase() === mine
  );
}

export function loadHomeBaseChoice() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(HOME_BASE_STORAGE_KEY);
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    return null;
  }
}

export function saveHomeBaseChoice(parcelId) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (parcelId) localStorage.setItem(HOME_BASE_STORAGE_KEY, String(parcelId));
    else localStorage.removeItem(HOME_BASE_STORAGE_KEY);
  } catch {
    // storage unavailable — the choice just won't persist
  }
}
