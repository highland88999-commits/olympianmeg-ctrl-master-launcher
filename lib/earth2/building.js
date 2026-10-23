// lib/earth2/building.js
// EARTH 2 — BUILDING: the Earth 2 face of the shared toolkit
// (lib/building/). The catalog and the rights engine are generic;
// everything that knows about parcels, the planet's terrain and
// its landmark structures lives here.
//
// Merlin's approved design (2026-10-22): building is part of the
// land-title bundle — owners build on their parcels; ownable-but-
// unsold parcels can be homestead-claimed for building (permit
// only, evicted with a pack-up when the parcel sells); Free Commons
// and protected ground are NEVER buildable.
//
// PROTECTED GROUND: Castle Transylvania's parcel (E2-2476 — the
// Count's seat, Free Commons forever) plus every parcel carrying
// one of the planet's placed landmark structures (the mountain
// range, both volcanoes, the cliff face, the meteor crater, the tar
// pit, the rocky outcrop, the giant boulder — lib/earth2/world.js
// worldLandforms). Those places belong to the planet, not to a
// builder — refused even for the title holder.
//
// Placement is validated against the REAL terrain: piece positions
// are parcel-local (see lib/building/catalog.js), converted here
// through world.js's parcel rect, with heightAt as ground truth.

import {
  PARCELS,
  parcelById,
  isCastleParcel,
  CASTLE_PARCEL_ID,
} from './parcels.js';
import {
  WORLD_CELL_M,
  parcelWorldRect,
  parcelCenterWorld,
  heightAt,
  worldLandforms,
} from './world.js';
import {
  parseBuild,
} from '../building/catalog.js';
import {
  canBuildOnParcel,
} from '../building/rights.js';

// The buildable frame of one parcel: the parcel's own square,
// pieces rising at most 60 m above their ground point.
export const PARCEL_BUILD_FRAME = Object.freeze({
  width: WORLD_CELL_M,
  depth: WORLD_CELL_M,
  maxY: 60,
});

// The castle's own groundworks: no user piece may stand within
// this radius of the castle's centre, even on a neighbouring
// parcel (the terrace and court spill past the parcel line).
export const CASTLE_EXCLUSION_M = 30;

let _protectedIds = null;

/** Ids of every protected parcel (castle + landmark structures). */
export function protectedParcelIds() {
  if (_protectedIds) return _protectedIds;
  const ids = new Set([CASTLE_PARCEL_ID]);
  for (const lf of worldLandforms()) {
    const p = PARCELS[lf.parcelIndex];
    if (p) ids.add(p.id);
  }
  _protectedIds = ids;
  return ids;
}

/** True when this parcel's ground is protected (never buildable). */
export function isProtectedParcel(parcel) {
  if (!parcel) return false;
  if (isCastleParcel(parcel)) return true;
  return protectedParcelIds().has(parcel.id);
}

/** The rights context for a parcel: parcels.js + rows + claim. */
export function earth2BuildContext(parcel, ownerRow, claim) {
  return {
    parcel: parcel || null,
    ownerRow: ownerRow || null,
    claim: claim || null,
    protectedGround: isProtectedParcel(parcel),
  };
}

/** canBuild for Earth 2: the shared engine with protection filled in. */
export function canBuildOnEarth2Parcel(user, parcel, ownerRow, claim) {
  return canBuildOnParcel(user, earth2BuildContext(parcel, ownerRow, claim));
}

/** A piece's world-space position (x east, z south) on a parcel. */
export function pieceWorldPosition(parcel, piece) {
  const rect = parcelWorldRect(parcel);
  return { x: rect.minX + piece.x, z: rect.minZ + piece.z };
}

/** The terrain height under a piece — Phase 2 seats pieces on it. */
export function terrainHeightForPiece(parcel, piece) {
  const w = pieceWorldPosition(parcel, piece);
  return heightAt(w.x, w.z);
}

/**
 * Validate a build destined for an Earth 2 parcel: the generic
 * catalog rules against the parcel frame, plus the castle
 * exclusion (no piece inside the castle's groundworks, whichever
 * parcel it technically stands on).
 * Returns { ok, build?, errors } like parseBuild.
 */
export function validateEarth2Build(raw) {
  const parcel = raw && typeof raw.groundId === 'string' ? parcelById(raw.groundId) : null;
  if (!parcel) return { ok: false, errors: ['Unknown parcel.'] };
  if (raw.groundType !== 'earth2-parcel') {
    return { ok: false, errors: ['An Earth 2 build must carry groundType earth2-parcel.'] };
  }
  const parsed = parseBuild(raw, PARCEL_BUILD_FRAME);
  if (!parsed.ok) return parsed;
  const errors = [];
  const castle = parcelCenterWorld(parcelById(CASTLE_PARCEL_ID));
  for (let i = 0; i < parsed.build.pieces.length; i++) {
    const w = pieceWorldPosition(parcel, parsed.build.pieces[i]);
    if (Math.hypot(w.x - castle.x, w.z - castle.z) < CASTLE_EXCLUSION_M) {
      errors.push(`Piece ${i + 1} stands inside Castle Transylvania's groundworks.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return parsed;
}

// ── Row mapping (earth2-buildings.sql shapes ↔ toolkit shapes) ──
export function claimFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    parcelId: row.parcel_id,
    builderId: row.builder_id,
    builderEmail: row.builder_email,
    status: row.status,
    claimedAt: row.claimed_at || null,
    endedAt: row.ended_at || null,
    endReason: row.end_reason || null,
  };
}

export function buildFromRow(row) {
  if (!row) return null;
  return {
    groundType: row.ground_type,
    groundId: row.ground_id,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    pieces: Array.isArray(row.pieces) ? row.pieces : [],
    updatedAt: row.updated_at || null,
  };
}

// ── Sale eviction against the database ───────────────────────────
// The buy route calls this after a first-round title lands: settle
// any homestead claim on the parcel, exactly as the pure engine
// (lib/building/rights.js onParcelSold) rules it — pack the build
// into earth2_build_packups, notify the builder, end the claim.
// Auction transfers settle through the same engine at the data
// level (lib/earth2/land-sale.js transferLandTitle).
//
// Honest degradation: until supabase/earth2-buildings.sql runs, the
// tables do not exist and this answers { setupRequired: true } —
// the sale itself is never blocked by the eviction step.
function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

function sameDbUser(aId, aEmail, bId, bEmail) {
  if (aId && bId) return String(aId) === String(bId);
  const ea = String(aEmail || '').toLowerCase();
  const eb = String(bEmail || '').toLowerCase();
  return !!ea && ea === eb;
}

export async function evictHomesteadOnSaleDb(db, parcelId, buyer, atIso) {
  try {
    const claimRes = await db
      .from('earth2_homestead_claims')
      .select('id, parcel_id, builder_id, builder_email, status, claimed_at')
      .eq('parcel_id', parcelId)
      .eq('status', 'active')
      .maybeSingle();
    if (claimRes.error) {
      if (isMissingTable(claimRes.error)) return { setupRequired: true };
      return { evicted: null };
    }
    const claimRow = claimRes.data;
    if (!claimRow) return { evicted: null };

    const converted = sameDbUser(claimRow.builder_id, claimRow.builder_email, buyer && buyer.id, buyer && buyer.email);
    const endedAt = atIso || new Date().toISOString();

    if (converted) {
      await db
        .from('earth2_homestead_claims')
        .update({ status: 'purchased', ended_at: endedAt, end_reason: 'purchased' })
        .eq('id', claimRow.id);
      return { converted: true, evicted: null };
    }

    // Pack the claimant's build up, pieces intact.
    const buildRes = await db
      .from('earth2_builds')
      .select('id, pieces')
      .eq('ground_type', 'earth2-parcel')
      .eq('ground_id', parcelId)
      .eq('owner_id', claimRow.builder_id)
      .maybeSingle();
    let packUpId = null;
    let pieceCount = 0;
    if (!buildRes.error && buildRes.data) {
      const pieces = Array.isArray(buildRes.data.pieces) ? buildRes.data.pieces : [];
      pieceCount = pieces.length;
      const pack = await db
        .from('earth2_build_packups')
        .insert({
          builder_id: claimRow.builder_id,
          builder_email: claimRow.builder_email,
          parcel_id: parcelId,
          pieces,
          piece_count: pieceCount,
          reason: 'parcel-sold',
        })
        .select('id')
        .single();
      if (!pack.error && pack.data) packUpId = pack.data.id;
      await db.from('earth2_builds').delete().eq('id', buildRes.data.id);
    }

    await db.from('earth2_build_notifications').insert({
      user_id: claimRow.builder_id,
      user_email: claimRow.builder_email,
      kind: 'homestead-evicted',
      parcel_id: parcelId,
      packup_id: packUpId,
      payload: { buyerEmail: (buyer && buyer.email) || null, pieceCount },
    });
    await db
      .from('earth2_homestead_claims')
      .update({ status: 'evicted', ended_at: endedAt, end_reason: 'parcel-sold' })
      .eq('id', claimRow.id);

    return {
      evicted: {
        builderEmail: claimRow.builder_email,
        packUpId,
        pieceCount,
      },
    };
  } catch {
    // The eviction step never breaks a completed sale.
    return { evicted: null };
  }
}
