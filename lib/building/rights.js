// lib/building/rights.js
// THE BUILDING TOOLKIT — RIGHTS ENGINE (shared, pure).
//
// Who may build where, and what happens to a build when the ground
// changes hands. Merlin's approved design (2026-10-22):
//
//   EARTH 2 (lib/earth2/parcels.js + lib/earth2/building.js):
//   · OWNED parcel → the owner builds. Title is a bundle: spawn,
//     rent, and building rights travel together.
//   · OWNABLE-BUT-UNSOLD parcel → building only under an active
//     HOMESTEAD CLAIM held by that same user. A claim is a building
//     permit, nothing more: NO title, NO rent rights, NO spawn
//     rights. If the parcel SELLS — first-round sale or Auction
//     House transfer — the claim ends, the builder is notified, and
//     their build is packed up and returned to them as a blueprint;
//     the buyer takes clean land. (If the buyer IS the claimant,
//     the claim simply converts: the build stays, now on owned
//     ground.)
//   · FREE COMMONS (1,500 parcels) → NEVER buildable, NEVER
//     claimable. The Commons are commons because nobody can fence
//     them — refused here in logic, not just in UI.
//   · PROTECTED ground (Castle Transylvania's parcel, the parcels
//     carrying the planet's landmark structures) → NEVER buildable,
//     whoever holds the title.
//
//   USER WORLDS (Communiverse): the creator is sovereign — the
//   creator builds; nobody else does. Same toolkit, same shapes.
//
// Everything here is pure state transition over plain collections
// (claims and builds are arrays), mirroring the house style of
// lib/earth2/land-sale.js: functions return NEW collections and
// never mutate their inputs, so the chamber's local preview, the
// API routes and the tests all exercise the identical rules.

// ── Identity ─────────────────────────────────────────────────────
// Users are { id, email }; earth2 ownership rows key on owner_id +
// owner_email. Two refs are the same user when their ids match, or
// (ids missing) when their emails match case-insensitively.
function sameUser(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id) return String(a.id) === String(b.id);
  const ea = String(a.email || '').toLowerCase();
  const eb = String(b.email || '').toLowerCase();
  return !!ea && ea === eb;
}

function userOfRow(row) {
  return row ? { id: row.owner_id, email: row.owner_email } : null;
}

function userOfClaim(claim) {
  return claim ? { id: claim.builderId, email: claim.builderEmail } : null;
}

// ── Earth 2 parcel rights ────────────────────────────────────────
/**
 * The Earth 2 building verdict for one user on one parcel.
 *   ctx = { parcel, ownerRow, claim, protectedGround }
 *     parcel          — a lib/earth2/parcels.js parcel (or null)
 *     ownerRow        — the parcel's earth2_parcels row, or null
 *     claim           — the parcel's ACTIVE homestead claim, or null
 *     protectedGround — true for the castle / landmark parcels
 * Returns { ok, via, reason }: via is 'owner' | 'homestead' | null;
 * reason is a stable machine code for routes/tests to pin.
 */
export function canBuildOnParcel(user, ctx) {
  const { parcel, ownerRow, claim, protectedGround } = ctx || {};
  if (!user || (!user.id && !user.email)) return { ok: false, via: null, reason: 'signed-out' };
  if (!parcel) return { ok: false, via: null, reason: 'unknown-parcel' };
  if (protectedGround) return { ok: false, via: null, reason: 'protected' };
  if (!parcel.ownable || parcel.kind === 'commons') {
    return { ok: false, via: null, reason: 'commons-never' };
  }
  if (ownerRow) {
    return sameUser(user, userOfRow(ownerRow))
      ? { ok: true, via: 'owner', reason: 'owned' }
      : { ok: false, via: null, reason: 'not-owner' };
  }
  // Ownable and unsold: a homestead claim is the only way in.
  if (claim && claim.status === 'active') {
    return sameUser(user, userOfClaim(claim))
      ? { ok: true, via: 'homestead', reason: 'homestead-claim' }
      : { ok: false, via: null, reason: 'claimed-by-other' };
  }
  return { ok: false, via: null, reason: 'unclaimed' };
}

// ── Homestead claims ─────────────────────────────────────────────
export const CLAIM_ACTIVE = 'active';
export const CLAIM_RELEASED = 'released';
export const CLAIM_EVICTED = 'evicted';
export const CLAIM_PURCHASED = 'purchased';

/** The active claim on a parcel within a claims collection, or null. */
export function activeClaimFor(claims, parcelId) {
  const list = Array.isArray(claims) ? claims : [];
  return list.find((c) => c && c.parcelId === parcelId && c.status === CLAIM_ACTIVE) || null;
}

function claimIdFor(parcelId, user, atMs) {
  const who = String((user && (user.id || user.email)) || 'anon').replace(/[^a-z0-9]+/gi, '-');
  return `claim:${parcelId}:${who}:${Number.isFinite(atMs) ? atMs : 0}`;
}

/**
 * Claim a homestead on an ownable, unsold, unprotected parcel.
 * Pure transition: returns { ok, claims, claim } with a NEW claims
 * array, or { ok: false, error, claims } with the input untouched.
 *   ctx = { parcel, ownerRow, protectedGround }
 */
export function claimHomestead(claims, user, ctx, atMs) {
  const list = Array.isArray(claims) ? claims : [];
  const fail = (error) => ({ ok: false, error, claims: list });
  const { parcel, ownerRow, protectedGround } = ctx || {};
  if (!user || (!user.id && !user.email)) return fail('Sign in to claim a homestead.');
  if (!parcel) return fail('Unknown parcel.');
  if (protectedGround) return fail('That ground is protected — its landmark stands there for everyone.');
  if (!parcel.ownable || parcel.kind === 'commons') {
    return fail('Free Commons can never be claimed — they are open land for everyone, forever.');
  }
  if (ownerRow) {
    return sameUser(user, userOfRow(ownerRow))
      ? fail('You own this parcel — your title already carries building rights, no claim needed.')
      : fail('That parcel already has an owner.');
  }
  const existing = activeClaimFor(list, parcel.id);
  if (existing) {
    return sameUser(user, userOfClaim(existing))
      ? fail('You already hold the homestead claim on this parcel.')
      : fail('Another builder holds the homestead claim on this parcel.');
  }
  const claim = {
    id: claimIdFor(parcel.id, user, atMs),
    parcelId: parcel.id,
    builderId: user.id || null,
    builderEmail: user.email || null,
    status: CLAIM_ACTIVE,
    claimedAt: Number.isFinite(atMs) ? new Date(atMs).toISOString() : null,
    endedAt: null,
    endReason: null,
  };
  return { ok: true, claims: [...list, claim], claim };
}

/**
 * Release a user's own active claim (they walk away; any build they
 * leave behind stays theirs in data but the ground opens up — the
 * build itself is removed by the caller's save path, not here).
 * Returns { ok, claims } or { ok: false, error, claims }.
 */
export function releaseClaim(claims, user, parcelId, atMs) {
  const list = Array.isArray(claims) ? claims : [];
  const idx = list.findIndex(
    (c) => c && c.parcelId === parcelId && c.status === CLAIM_ACTIVE
  );
  if (idx < 0) return { ok: false, error: 'No active homestead claim on that parcel.', claims: list };
  if (!sameUser(user, userOfClaim(list[idx]))) {
    return { ok: false, error: 'That homestead claim is not yours to release.', claims: list };
  }
  const next = list.slice();
  next[idx] = {
    ...list[idx],
    status: CLAIM_RELEASED,
    endedAt: Number.isFinite(atMs) ? new Date(atMs).toISOString() : null,
    endReason: 'released',
  };
  return { ok: true, claims: next, claim: next[idx] };
}

// ── Sale eviction ────────────────────────────────────────────────
/**
 * A parcel changed hands (first-round sale or Auction House
 * transfer): settle its homestead claim.
 *
 *   claims / builds — the full collections (builds: every build on
 *     every ground; only this parcel's are touched).
 *   buyer           — { id, email } of the new title holder.
 *
 * Returns { claims, builds, endedClaim, packUp, notification } with
 * NEW collections:
 *   · No active claim → everything passes through untouched.
 *   · Buyer IS the claimant → claim ends as 'purchased'; the build
 *     stays exactly where it is (now on owned ground); no pack-up.
 *   · Anyone else → claim ends as 'evicted'; the claimant's build
 *     on this parcel (if any) leaves the builds collection and is
 *     returned as packUp — the full blueprint, pieces intact — and
 *     a notification record for the builder is produced.
 */
export function onParcelSold(claims, builds, parcelId, buyer, atMs) {
  const claimList = Array.isArray(claims) ? claims : [];
  const buildList = Array.isArray(builds) ? builds : [];
  const at = Number.isFinite(atMs) ? new Date(atMs).toISOString() : null;
  const claim = activeClaimFor(claimList, parcelId);
  if (!claim) {
    return { claims: claimList, builds: buildList, endedClaim: null, packUp: null, notification: null };
  }

  const converted = sameUser(buyer, userOfClaim(claim));
  const endStatus = converted ? CLAIM_PURCHASED : CLAIM_EVICTED;
  const nextClaims = claimList.map((c) =>
    c === claim
      ? { ...c, status: endStatus, endedAt: at, endReason: converted ? 'purchased' : 'parcel-sold' }
      : c
  );
  const endedClaim = nextClaims.find((c) => c.id === claim.id) || null;

  if (converted) {
    return { claims: nextClaims, builds: buildList, endedClaim, packUp: null, notification: null };
  }

  // Eviction: pack the claimant's build up, pieces intact.
  const buildIdx = buildList.findIndex(
    (b) => b && b.groundType === 'earth2-parcel' && b.groundId === parcelId && sameUser(userOfClaim(claim), { id: b.ownerId, email: b.ownerEmail })
  );
  let packUp = null;
  let nextBuilds = buildList;
  if (buildIdx >= 0) {
    const build = buildList[buildIdx];
    packUp = {
      builderId: claim.builderId,
      builderEmail: claim.builderEmail,
      parcelId,
      groundType: 'earth2-parcel',
      groundId: parcelId,
      pieces: Array.isArray(build.pieces) ? build.pieces.map((p) => ({ ...p })) : [],
      reason: 'parcel-sold',
      packedAt: at,
    };
    nextBuilds = buildList.filter((_, i) => i !== buildIdx);
  }
  const notification = {
    userId: claim.builderId,
    userEmail: claim.builderEmail,
    kind: 'homestead-evicted',
    parcelId,
    buyerEmail: (buyer && buyer.email) || null,
    packUp,
    at,
  };
  return { claims: nextClaims, builds: nextBuilds, endedClaim, packUp, notification };
}

// ── User worlds (Communiverse) ───────────────────────────────────
/**
 * Normalize a Communiverse world into the toolkit's ground shape.
 * Accepts either the public world shape (lib/communiverse.js
 * publicWorldFields: { id, owner_id }) or a raw asset row
 * ({ id, user_id }).
 */
export function userWorldGround(world) {
  if (!world || world.id == null) return null;
  return {
    type: 'user-world',
    worldId: String(world.id),
    creatorId: world.owner_id || world.user_id || null,
    creatorEmail: world.owner_email || world.user_email || null,
  };
}

/**
 * The user-world verdict: the creator is sovereign — they build,
 * nobody else does. Returns the same { ok, via, reason } shape.
 */
export function canBuildInUserWorld(user, world) {
  const ground = userWorldGround(world);
  if (!user || (!user.id && !user.email)) return { ok: false, via: null, reason: 'signed-out' };
  if (!ground) return { ok: false, via: null, reason: 'unknown-world' };
  const creator = { id: ground.creatorId, email: ground.creatorEmail };
  return sameUser(user, creator)
    ? { ok: true, via: 'creator', reason: 'own-world' }
    : { ok: false, via: null, reason: 'not-creator' };
}
