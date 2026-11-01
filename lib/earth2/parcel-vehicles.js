// lib/earth2/parcel-vehicles.js
// Server-side helpers for the earth2_parcel_vehicles table (Merlin,
// 2026-11-01). The table is the durable truth for buyer-chosen
// parcel vehicles; the device ledger (earth2:vehicles:v1) stays the
// runtime cache and the fallback until the SQL is pasted.
//
// OWNERSHIP LAW: a parcel vehicle belongs to the land title holder.
// The row's owner_email is DERIVED from earth2_parcels at write
// time — never trusted from the client — and follows the title:
// any parcel-owner write must call syncParcelVehicleOwner so the
// vehicle changes hands exactly when the land does.

/**
 * Carry a parcel's vehicle row to the new title holder. Call this
 * from EVERY path that changes earth2_parcels.owner_email (buy,
 * resale, auction settlement). No-op when the table is missing or
 * the parcel has no vehicle row.
 *
 * @param {object} db - service-role Supabase client
 * @param {string} parcelId
 * @param {string} newOwnerEmail
 * @returns {Promise<{ ok: boolean, missingTable?: boolean }>}
 */
export async function syncParcelVehicleOwner(db, parcelId, newOwnerEmail) {
  if (!db || !parcelId || !newOwnerEmail) return { ok: false };
  try {
    const { error } = await db
      .from('earth2_parcel_vehicles')
      .update({ owner_email: newOwnerEmail, updated_at: new Date().toISOString() })
      .eq('parcel_id', parcelId);
    if (error) {
      const code = String(error.code || '');
      const msg = String(error.message || '');
      if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) {
        return { ok: true, missingTable: true };
      }
      return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Read the live title holder for a parcel. Used by the upsert route
 * to stamp owner_email from the title, never from the request body.
 */
export async function parcelTitleEmail(db, parcelId) {
  if (!db || !parcelId) return null;
  try {
    const { data, error } = await db
      .from('earth2_parcels')
      .select('owner_email')
      .eq('parcel_id', parcelId)
      .maybeSingle();
    if (error || !data) return null;
    return data.owner_email || null;
  } catch {
    return null;
  }
}
