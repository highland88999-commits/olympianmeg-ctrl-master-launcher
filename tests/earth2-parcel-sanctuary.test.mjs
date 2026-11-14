// tests/earth2-parcel-sanctuary.test.mjs
// EARTH 2 — PARCEL SANCTUARY (Merlin, 2026-11-14): no dinosaur
// crosses a property line INTO an owned parcel. Owned parcels
// are dino-free sanctuary: a hunt ends when the target crosses
// onto one (the predator gives up at the boundary), and
// sheltering on someone else's parcel costs the passing rental
// fee to the owner (the existing 2 gold/min rent, split 1 owner
// + 1 house). Free Commons are NOT sanctuary — dinos roam there
// freely. A user's own parcel is free (you do not pay yourself).
//
// Grid notes (lib/earth2/world.js): parcels are 28 m cells on a
// 50x50 grid. E2-0619 spans x [-196,-168], z [-364,-336], centre
// (-182,-350). E2-0669 sits directly south, centre (-182,-322).
// E2-0569 sits directly north (Commons), centre (-182,-378).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSanctuaryParcel,
  stepBlockedByParcelLine,
  sanctuaryRentOwed,
  sanctuaryEntryId,
} from '../lib/earth2/parcel-sanctuary.js';
import { parcelAtWorld } from '../lib/earth2/world.js';

// Merlin's base + the parcel directly south of it, both titled
// in this fixture. The parcel north of E2-0619 (E2-0569) is
// left untitled: Commons.
const owners = new Map([
  ['E2-0619', { owner_email: 'olympiannexus@gmail.com' }],
  ['E2-0669', { owner_email: 'olympiannexus@gmail.com' }],
]);
const MERLIN = 'olympiannexus@gmail.com';
const DEVAN = 'fishstart@hotmail.com';

test('sanctuary: any owned parcel is sanctuary, Commons is not', () => {
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -350), owners), true);
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -322), owners), true);
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -378), owners), false);
  // Titles still loading: not sanctuary until proven owned.
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -350), null), false);
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -350), new Map()), false);
});

test('no crossing in: a dino step that would carry it onto an owned parcel is refused', () => {
  // A predator chasing south from the Commons into E2-0619:
  // the step across the z = -364 line is blocked.
  assert.equal(stepBlockedByParcelLine({ x: -182, z: -366 }, { x: -182, z: -363 }, owners), true);
  // The same step the other way — leaving the parcel — is free.
  assert.equal(stepBlockedByParcelLine({ x: -182, z: -363 }, { x: -182, z: -366 }, owners), false);
  // A step that stays inside the parcel is free (a dino already
  // inside — the owner's own bred dino — moves within it).
  assert.equal(stepBlockedByParcelLine({ x: -182, z: -350 }, { x: -182, z: -352 }, owners), false);
  // A step that stays in the Commons is free.
  assert.equal(stepBlockedByParcelLine({ x: -182, z: -380 }, { x: -182, z: -378 }, owners), false);
  // Owned -> owned is ALSO blocked: crossing into E2-0669 from
  // E2-0619 is still crossing into an owned parcel — a dino bred
  // on one parcel stays on that parcel (it never roams the
  // neighbour's base either).
  assert.equal(stepBlockedByParcelLine({ x: -182, z: -338 }, { x: -182, z: -334 }, owners), true);
  // A wander step that only touches the line from outside is
  // blocked the moment its destination is inside (east edge:
  // x = -168; -167 is Commons, -169 is E2-0619).
  assert.equal(stepBlockedByParcelLine({ x: -167, z: -350 }, { x: -169, z: -350 }, owners), true);
  // Titles loading: nothing is blocked (no parcel is owned yet).
  assert.equal(stepBlockedByParcelLine({ x: -182, z: -366 }, { x: -182, z: -363 }, null), false);
});

test('sanctuary kills the hunt: the predator gives up at the line and does not re-acquire', () => {
  // The hunt rule lives in the scene (isWalkerImmune + the
  // break-offs set a post-chase cooldown), but the boundary law
  // it rests on is pinned here: a step INTO the parcel is
  // refused, so the predator can never follow its prey in —
  // the hunt has nowhere to go but over. The cooldown (scene)
  // means running back out does not restart the same hunt.
  const from = { x: -182, z: -366 }; // Commons, predator outside
  const to = { x: -182, z: -363 }; // prey inside E2-0619
  assert.equal(stepBlockedByParcelLine(from, to, owners), true);
  // And the prey standing on ANY owned parcel — not only their
  // own — is sanctuary: the predator's target is unreachable.
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -350), owners), true);
  assert.equal(isSanctuaryParcel(parcelAtWorld(-182, -322), owners), true);
});

test('rent: sheltering on someone else\'s parcel costs the passing rent; your own is free', () => {
  // Devan ducks onto Merlin's base: rent is owed (the existing
  // 2 gold/min, split 1 owner + 1 house — the scene charges it
  // on entry through /api/earth2/rent).
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -350), owners, DEVAN), true);
  // Merlin on his own base: no rent, you do not pay yourself.
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -350), owners, MERLIN), false);
  // Merlin on his for-sale parcel: still his, still free.
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -322), owners, MERLIN), false);
  // Anyone on the Commons: no rent, no owner.
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -378), owners, DEVAN), false);
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -378), owners, MERLIN), false);
  // No email yet (signed out / loading): no rent charged.
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -350), owners, null), false);
  assert.equal(sanctuaryRentOwed(parcelAtWorld(-182, -350), owners, ''), false);
});

test('rent entry id: one sanctuary entry, one idempotency key', () => {
  const id = sanctuaryEntryId('E2-0619', 1700000000000);
  assert.equal(id, 'E2-0619-1700000000000');
  // Two entries at different times are different keys (the meter
  // can charge again on a genuinely new entry).
  assert.notEqual(sanctuaryEntryId('E2-0619', 1700000000000), sanctuaryEntryId('E2-0619', 1700000060000));
});
