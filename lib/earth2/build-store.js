// lib/earth2/build-store.js
// EARTH 2 BUILDING — THE CLIENT-SIDE BUILD LEDGER (Phase 2).
//
// Phase 1 built the pure law (lib/building/*) and the data layer
// (lib/earth2/building.js + /api/earth2/builds), but the routes
// answer `setupRequired` until Merlin runs
// supabase/earth2-buildings.sql in the dashboard. This module is
// the pattern the refinery and the fossil pack already proved:
// keep the FULL state on the device (localStorage), and sync
// opportunistically — every save also tries the API; while the
// API answers setupRequired the local copy is simply the truth,
// and once the tables exist the same calls start landing
// server-side with no client change. The first successful API
// read merges server builds over local ones (they carry the
// newer updatedAt when they win).
//
// What lives here:
//   · local persistence for builds / homestead claims / pack-ups
//     (the blueprints a sold parcel's build returns as);
//   · settleLocalClaims — the pack-up law (lib/building/rights.js
//     onParcelSold) applied locally whenever the chamber's parcel
//     ownership data shows one of MY claimed parcels now has an
//     owner: someone else bought it (evict + pack up) or I did
//     (claim converts to title, build stays);
//   · the build-mode gate the UI shows: the rights engine's
//     verdict with the player-facing sentence for each reason;
//   · the opportunistic API sync calls (fetch injectable for
//     tests).
//
// No rights semantics are re-implemented here — every judgement
// delegates to lib/building/rights.js via lib/earth2/building.js.

import { canBuildOnEarth2Parcel } from './building.js';
import { onParcelSold } from '../building/rights.js';

const BUILDS_KEY = 'earth2:builds:v1';
const CLAIMS_KEY = 'earth2:claims:v1';
const PACKUPS_KEY = 'earth2:packups:v1';

// ── Device persistence ───────────────────────────────────────────

function loadList(key) {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveList(key, list) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    /* storage full / private mode — the in-memory state still
       works for the session; nothing else to do. */
  }
}

export const loadLocalBuilds = () => loadList(BUILDS_KEY);
export const saveLocalBuilds = (builds) => saveList(BUILDS_KEY, builds);
export const loadLocalClaims = () => loadList(CLAIMS_KEY);
export const saveLocalClaims = (claims) => saveList(CLAIMS_KEY, claims);
export const loadLocalPackups = () => loadList(PACKUPS_KEY);
export const saveLocalPackups = (packups) => saveList(PACKUPS_KEY, packups);

// ── Build collection helpers ─────────────────────────────────────

function sameBuilder(build, user) {
  if (!build || !user) return false;
  if (build.ownerId && user.id) return String(build.ownerId) === String(user.id);
  const a = String(build.ownerEmail || '').toLowerCase();
  const b = String(user.email || '').toLowerCase();
  return !!a && a === b;
}

/** The signed-in builder's build on one parcel, or null. */
export function myBuildFor(builds, parcelId, user) {
  const list = Array.isArray(builds) ? builds : [];
  return (
    list.find(
      (b) => b && b.groundType === 'earth2-parcel' && b.groundId === parcelId && sameBuilder(b, user)
    ) || null
  );
}

/** Insert or replace a build (same ground + same builder). */
export function upsertBuild(builds, build) {
  const list = Array.isArray(builds) ? builds.slice() : [];
  if (!build) return list;
  const idx = list.findIndex(
    (b) =>
      b &&
      b.groundType === build.groundType &&
      b.groundId === build.groundId &&
      sameBuilder(b, { id: build.ownerId, email: build.ownerEmail })
  );
  if (idx >= 0) list[idx] = build;
  else list.push(build);
  return list;
}

/** Drop one builder's build on one parcel (an emptied build). */
export function removeBuild(builds, parcelId, user) {
  const list = Array.isArray(builds) ? builds : [];
  return list.filter(
    (b) => !(b && b.groundType === 'earth2-parcel' && b.groundId === parcelId && sameBuilder(b, user))
  );
}

// ── The pack-up law, applied to local state ──────────────────────

/**
 * Settle MY active homestead claims against the chamber's
 * ownership rows. For every claim of mine whose parcel now has an
 * owner row, rights.js onParcelSold decides: buyer is me → the
 * claim converts to title and the build stays; buyer is anyone
 * else → the claim ends evicted, the build leaves the builds
 * collection, and the returned pack-up (the blueprint) is
 * collected for the chamber's blueprint shelf.
 *
 *   claims / builds — the device collections
 *   ownerRows       — array of earth2_parcels rows ({ parcel_id,
 *                     owner_id, owner_email }) or a Map by id
 *   user            — { id, email } of the signed-in builder
 * Returns { claims, builds, packUps, notifications, changed } —
 * packUps are NEW records ({ id, ...onParcelSold packUp }) for
 * the caller to append to the pack-up shelf.
 */
export function settleLocalClaims({ claims, builds, ownerRows, user, atMs }) {
  let nextClaims = Array.isArray(claims) ? claims : [];
  let nextBuilds = Array.isArray(builds) ? builds : [];
  const packUps = [];
  const notifications = [];
  if (!user || (!user.id && !user.email)) {
    return { claims: nextClaims, builds: nextBuilds, packUps, notifications, changed: false };
  }
  const rowsById = new Map();
  if (ownerRows instanceof Map) {
    for (const [k, v] of ownerRows) rowsById.set(k, v);
  } else if (Array.isArray(ownerRows)) {
    for (const row of ownerRows) if (row && row.parcel_id) rowsById.set(row.parcel_id, row);
  }
  const mine = nextClaims.filter(
    (c) =>
      c &&
      c.status === 'active' &&
      ((c.builderId && user.id && String(c.builderId) === String(user.id)) ||
        (c.builderEmail &&
          user.email &&
          String(c.builderEmail).toLowerCase() === String(user.email).toLowerCase()))
  );
  for (const claim of mine) {
    const row = rowsById.get(claim.parcelId);
    if (!row) continue; // still unsold — the claim stands
    const result = onParcelSold(nextClaims, nextBuilds, claim.parcelId, {
      id: row.owner_id,
      email: row.owner_email,
    }, atMs);
    nextClaims = result.claims;
    nextBuilds = result.builds;
    if (result.packUp) {
      packUps.push({
        id: `packup:${claim.parcelId}:${Number.isFinite(atMs) ? atMs : 0}`,
        ...result.packUp,
      });
    }
    if (result.notification) notifications.push(result.notification);
  }
  return {
    claims: nextClaims,
    builds: nextBuilds,
    packUps,
    notifications,
    changed: packUps.length > 0 || nextClaims !== claims || nextBuilds !== builds,
  };
}

// ── The build-mode gate ──────────────────────────────────────────

// The rights engine's reason codes → the sentence the UI shows.
export const BUILD_REFUSAL_TEXT = Object.freeze({
  'signed-out': 'Sign in to build.',
  'unknown-parcel': 'That parcel does not exist.',
  protected: 'Protected ground — a landmark of the planet stands here, for everyone.',
  'commons-never': 'Free Commons — open land for everyone, forever. Never claimable, never buildable.',
  'not-owner': 'This parcel belongs to someone else.',
  'claimed-by-other': 'Another builder holds the homestead claim here.',
  unclaimed: 'Unsold land — claim a homestead on it first (the parcel panel above has the button), then build.',
});

/**
 * The gate for entering build mode on a parcel: the rights
 * engine's verdict plus its player-facing text.
 * Returns { ok, via, reason, text }.
 */
export function buildModeGate(user, parcel, ownerRow, claim) {
  const verdict = canBuildOnEarth2Parcel(user, parcel, ownerRow, claim);
  if (verdict.ok) {
    return {
      ...verdict,
      text:
        verdict.via === 'owner'
          ? 'Your land — build freely.'
          : 'Your homestead claim — build away. If this parcel sells, your build packs itself up and returns to you as a blueprint.',
    };
  }
  return { ...verdict, text: BUILD_REFUSAL_TEXT[verdict.reason] || 'No building rights here.' };
}

// ── Opportunistic API sync ───────────────────────────────────────
// The routes exist since Phase 1; until the buildings SQL runs
// they answer { setupRequired: true }, which callers treat as
// "local state is the truth for now". A 404 (the routes are
// owner-gated) likewise just means the server side has nothing
// for this account yet — the local save already happened.

async function callBuildsApi({ token, fetchImpl }, path, init = {}) {
  try {
    const res = await fetchImpl(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const json = await res.json().catch(() => null);
    return json || { ok: false, status: res.status };
  } catch {
    return { ok: false, network: true };
  }
}

/** PUT one parcel build to the API (best effort). */
export function pushBuildToApi(deps, build) {
  return callBuildsApi(deps, '/api/earth2/builds', {
    method: 'PUT',
    body: JSON.stringify({ parcelId: build.groundId, pieces: build.pieces }),
  });
}

/** GET the caller's build on one parcel from the API. */
export function fetchBuildFromApi(deps, parcelId) {
  return callBuildsApi(
    deps,
    `/api/earth2/builds?parcelId=${encodeURIComponent(parcelId)}`,
    { method: 'GET' }
  );
}

/** POST a homestead claim to the API (best effort). */
export function postClaimToApi(deps, parcelId) {
  return callBuildsApi(deps, '/api/earth2/builds/claims', {
    method: 'POST',
    body: JSON.stringify({ parcelId }),
  });
}

/** DELETE a homestead claim via the API (best effort). */
export function deleteClaimFromApi(deps, parcelId) {
  return callBuildsApi(deps, '/api/earth2/builds/claims', {
    method: 'DELETE',
    body: JSON.stringify({ parcelId }),
  });
}
