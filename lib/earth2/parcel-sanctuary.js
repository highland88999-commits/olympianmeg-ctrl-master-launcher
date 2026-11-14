// lib/earth2/parcel-sanctuary.js
// EARTH 2 — PARCEL SANCTUARY (Merlin, 2026-11-14):
//
// "Dinos can't cross into owned parcels... going to an owned
// parcel for sanctuary kills a hunt, but costs the user the
// passing rental fee to the owner."
//
// An owned parcel is dino-free sanctuary: no dinosaur — wild,
// predator, or otherwise — may cross a property line INTO one.
// Free Commons are NOT sanctuary; dinos roam there freely.
//
//   - A hunt ends the moment its target crosses into ANY owned
//     parcel (their own or someone else's): the predator stops at
//     the boundary and gives up, the hunt state clears, and it
//     resumes normal roaming outside. Once a hunt is killed by
//     sanctuary it is OVER for that hunt — the predator does not
//     re-acquire the same user just because they step back out;
//     the post-chase cooldown still applies.
//   - A dino whose wander path would carry it across a parcel
//     line is stopped at the line (its step is refused); it does
//     not drift in, and it never teleports through.
//   - Dinos bred or placed by the parcel OWNER inside their own
//     parcel are already inside — they stay inside and move
//     freely within it; they do not count as crossing in. (They
//     may leave; only crossing IN is blocked.)
//   - Sanctuary costs rent: sheltering on someone else's owned
//     parcel costs the existing rental fee — 2 gold/min, minimum
//     a 1-minute fee, split 1 gold to the owner + 1 gold to the
//     house (olympiannexus@gmail.com) — the same rent that already
//     applies to being on an owned parcel. On the user's OWN
//     parcel there is no rent (you do not pay yourself).
//
// Pure and deterministic: no imports from the scene, no THREE,
// no DOM. The scene owns the live hunt state and the rent call.

import { parcelAtWorld } from './world.js';
import { isOwnedParcel, ownerRowForParcel } from './parcel-shrink.js';

/** True when the parcel is dino-free sanctuary (any titled parcel). */
export function isSanctuaryParcel(parcel, owners) {
  return isOwnedParcel(parcel, owners);
}

/**
 * Whether a step from `from` to `to` would cross INTO an owned
 * parcel: the destination parcel is owned and the step starts
 * outside it. A step that starts inside the same owned parcel
 * (an owner's own dino moving within its home) is allowed, and a
 * step out of an owned parcel is allowed — only crossing IN is
 * blocked. `from` / `to` are { x, z } world positions.
 */
export function stepBlockedByParcelLine(from, to, owners) {
  if (!from || !to) return false;
  const toParcel = parcelAtWorld(to.x, to.z);
  if (!isOwnedParcel(toParcel, owners)) return false;
  const fromParcel = parcelAtWorld(from.x, from.z);
  return fromParcel.id !== toParcel.id;
}

/**
 * Whether sheltering on this parcel costs the user rent: the
 * parcel is owned and the title holder is someone else. The
 * user's own parcel is free; Free Commons are free.
 */
export function sanctuaryRentOwed(parcel, owners, userEmail) {
  if (!isOwnedParcel(parcel, owners)) return false;
  const row = ownerRowForParcel(owners, parcel.id);
  const ownerEmail = row && typeof row.owner_email === 'string' ? row.owner_email : null;
  if (!ownerEmail || !userEmail) return false;
  return ownerEmail.toLowerCase() !== String(userEmail).toLowerCase();
}

/**
 * The sanctuary entry id for one parcel visit: unique per entry,
 * so the rent route's idempotency key never double-charges a
 * re-entry after an exit (the scene stamps one per crossing).
 */
export function sanctuaryEntryId(parcelId, nowMs) {
  return `${parcelId}-${Number(nowMs) || Date.now()}`;
}
