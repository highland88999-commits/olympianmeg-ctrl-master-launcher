// tests/earth2.test.mjs
// Earth 2 — Phase 2 foundation (owner-locked test build, Merlin
// 2026-10-21; land rules 2026-10-22):
// - the deterministic 2,500-parcel grid (ids, tiers, point lookups)
//   split by Merlin's land rule into exactly 1,000 ownable parcels
//   and 1,500 Free Commons (more free tiles than owned tiles)
// - home-base resolution (first acquired by default, owner's choice
//   when set), the First Round land sale + Land Tiles resale layer
// - the gold forge's accrual math and daily cap
// - the access lock's static wiring: OWNER_PORTALS + withOwnerPortals
//   in the shared roster, a verified session in every Earth 2 API
//   route (owner-only writes; the access law of lib/earth2/access.js
//   for the model door and the read-only state), and NO 'earth-2'
//   entry in the satellite registry (a registry entry would raise a
//   hub tower in front of everyone)
// - the proof of concept (2026-10-23): owner + one named guest, one
//   granted parcel each with one parcel between, spawn follows title
//
// Run: node --test tests/earth2.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PARCEL_COUNT,
  PARCEL_OWNABLE_COUNT,
  PARCEL_COMMONS_COUNT,
  PARCELS,
  parcelAt,
  parcelById,
  isOwnableIndex,
  buyRefusal,
  castleParcel,
  isCastleParcel,
  CASTLE_PARCEL_ID,
  CASTLE_PARCEL_INDEX,
} from '../lib/earth2/parcels.js';
import {
  GIFT_TABLE,
  GIFT_WEIGHT_TOTAL,
  rollGift,
} from '../lib/earth2/gifts.js';
import {
  emptyBloodSacState,
  loadBloodSacState,
  saveBloodSacState,
  collectBloodSac,
  offerBloodSac,
  BLOOD_SAC_STORAGE_KEY,
} from '../lib/earth2/blood-sacs.js';
import {
  COMPY_SWARM,
  MOSQUITO_CONFIG,
  BAT_SWARM,
  DRACULA_TIMINGS,
  mosquitoDropsSac,
  mosquitoFullness,
  createDraculaMachine,
  stepDracula,
  draculaIsCount,
  draculaIsBat,
} from '../lib/earth2/creatures.js';
import {
  resolveHomeBase,
  ownedRowsFor,
} from '../lib/earth2/home-base.js';
import {
  firstRoundListings,
  firstRoundRemaining,
  firstRoundSoldOut,
  createLandListing,
  transferLandTitle,
} from '../lib/earth2/land-sale.js';
import {
  AUCTION_CATEGORIES,
  LAND_TILES_CATEGORY,
  LAND_TILES_LABEL,
  isLandTilesCategory,
} from '../lib/auction/helpers.js';
import {
  FORGE_RATE_GOLD_PER_HOUR,
  FORGE_DAILY_CAP_GOLD,
  forgeAccrued,
} from '../lib/earth2/forge.js';
import {
  OWNER_PORTALS,
  SIGNED_IN_PORTALS,
  buildPortalRoster,
  withOwnerPortals,
  withSignedInPortals,
} from '../lib/portal-roster.js';
import {
  EARTH2_GUEST_EMAIL,
  POC_GAP_PARCEL_ID,
  POC_GUEST_PARCEL_ID,
  POC_OWNER_PARCEL_ID,
  hasEarth2Access,
  isEarth2GuestEmail,
} from '../lib/earth2/access.js';
import {
  climateForParcel,
  familyForParcel,
  heightAt,
  parcelCenterWorld,
  resolveSpawnParcel,
  spawnPointFor,
} from '../lib/earth2/world.js';
import { protectedParcelIds } from '../lib/earth2/building.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('the parcel grid', () => {
  it('holds exactly 2500 parcels with unique, well-formed ids', () => {
    assert.equal(PARCEL_COUNT, 2500);
    assert.equal(PARCELS.length, 2500);
    const ids = new Set(PARCELS.map((p) => p.id));
    assert.equal(ids.size, 2500);
    assert.equal(PARCELS[0].id, 'E2-0001');
    assert.equal(PARCELS[2499].id, 'E2-2500');
    for (const p of PARCELS) assert.match(p.id, /^E2-\d{4}$/);
  });

  it('every parcel carries bounds and a name; prices live on ownable parcels only', () => {
    const prices = { standard: 10000, prime: 50000, landmark: 250000 };
    for (const p of PARCELS) {
      assert.ok(p.latMin < p.latMax && p.lonMin < p.lonMax, p.id);
      assert.ok(p.name.length > 0, p.id);
      assert.ok(Object.hasOwn(prices, p.tier), `${p.id} tier ${p.tier}`);
      if (p.ownable) assert.equal(p.priceGold, prices[p.tier], p.id);
      else assert.equal(p.priceGold, null, `${p.id} — Free Commons carry no price`);
      assert.ok(p.centerLat >= p.latMin && p.centerLat < p.latMax, p.id);
      assert.ok(p.centerLon >= p.lonMin && p.centerLon < p.lonMax, p.id);
    }
  });

  it('parcelById round-trips and rejects strangers', () => {
    assert.equal(parcelById('E2-0001'), PARCELS[0]);
    assert.equal(parcelById('e2-1000'), PARCELS[999]);
    assert.equal(parcelById('E2-2500'), PARCELS[2499]);
    assert.equal(parcelById('E2-2501'), null);
    assert.equal(parcelById('nope'), null);
    assert.equal(parcelById(null), null);
    assert.equal(parcelById(42), null);
  });

  it('parcelAt finds the parcel that contains the point', () => {
    // Round-trip through every parcel's center (sampled + landmarks).
    for (let i = 0; i < PARCELS.length; i += 37) {
      const p = PARCELS[i];
      assert.equal(parcelAt(p.centerLat, p.centerLon).id, p.id);
    }
    assert.equal(parcelAt(37.9838, 23.7275).name, 'Athens');
    assert.equal(parcelAt(37.9838, 23.7275).tier, 'landmark');
    assert.equal(parcelAt(40.7128, -74.006).name, 'New York');
  });

  it('parcelAt clamps the poles and wraps the antimeridian', () => {
    assert.equal(parcelAt(90, 0).row, 0);
    assert.equal(parcelAt(-90, 0).row, 49);
    assert.equal(parcelAt(10, 181).id, parcelAt(10, -179).id);
    assert.equal(parcelAt(10, -540).id, parcelAt(10, -180).id);
    assert.equal(parcelAt(10, 180).id, parcelAt(10, -180).id);
  });
});

describe("Merlin's land rule — more free tiles than owned tiles", () => {
  it('splits the globe into exactly 1,000 ownable and 1,500 Free Commons', () => {
    assert.equal(PARCEL_OWNABLE_COUNT, 1000);
    assert.equal(PARCEL_COMMONS_COUNT, 1500);
    assert.ok(PARCEL_COMMONS_COUNT > PARCEL_OWNABLE_COUNT, 'more free than owned');
    const ownable = PARCELS.filter((p) => p.ownable);
    const commons = PARCELS.filter((p) => !p.ownable);
    assert.equal(ownable.length, 1000);
    assert.equal(commons.length, 1500);
    for (const p of PARCELS) {
      assert.equal(p.kind, p.ownable ? 'ownable' : 'commons', p.id);
    }
  });

  it('the ownable interleave is the decided formula, evenly spread', () => {
    for (let i = 0; i < PARCELS.length; i++) {
      // The formula rules — with exactly two documented exceptions
      // at the South Pole (2026-10-22): the castle parcel (2475) is
      // Free Commons whatever the formula says (Dracula's seat is
      // nobody's property), and its western neighbour (2474) carries
      // the ownable slot it vacated, keeping the split exact.
      if (i === CASTLE_PARCEL_INDEX || i === CASTLE_PARCEL_INDEX - 1) continue;
      assert.equal(PARCELS[i].ownable, (i * 2) % 5 < 2, `index ${i}`);
      assert.equal(isOwnableIndex(i), PARCELS[i].ownable, `index ${i}`);
    }
    assert.equal(PARCELS[CASTLE_PARCEL_INDEX].ownable, false, 'the castle is commons');
    assert.equal(PARCELS[CASTLE_PARCEL_INDEX - 1].ownable, true, 'the compensation parcel is ownable');
    // No row is all-owned or all-free: the interleave spreads both.
    for (let row = 0; row < 50; row++) {
      const cells = PARCELS.slice(row * 50, row * 50 + 50);
      const owned = cells.filter((p) => p.ownable).length;
      assert.equal(owned, 20, `row ${row}`);
    }
  });

  it('the split is deterministic across a fresh module load', async () => {
    const again = await import('../lib/earth2/parcels.js?fresh=land');
    assert.equal(again.PARCELS.length, PARCELS.length);
    for (let i = 0; i < PARCELS.length; i++) {
      assert.equal(again.PARCELS[i].id, PARCELS[i].id);
      assert.equal(again.PARCELS[i].kind, PARCELS[i].kind);
      assert.equal(again.PARCELS[i].ownable, PARCELS[i].ownable);
    }
  });

  it('the lib-level buy guard refuses Free Commons and nothing else', () => {
    const commons = PARCELS.find((p) => !p.ownable);
    const ownable = PARCELS.find((p) => p.ownable);
    assert.match(buyRefusal(commons), /Free Commons/);
    assert.equal(buyRefusal(ownable), null);
    assert.equal(buyRefusal(null), 'Unknown parcel.');
    // And the buy + rent routes enforce the grid's word.
    const buy = read('app/api/earth2/buy/route.js');
    assert.ok(buy.includes('buyRefusal'), 'buy route checks the lib guard');
    const rent = read('app/api/earth2/rent/route.js');
    assert.ok(rent.includes('free-commons'), 'rent route answers Free Commons for free');
  });
});

describe('home base (spawn rule)', () => {
  const rows = [
    { parcel_id: 'E2-0001', owner_id: 'u1', owner_email: 'a@x.io', acquired_at: '2026-10-22T00:00:00Z' },
    { parcel_id: 'E2-0006', owner_id: 'u1', owner_email: 'a@x.io', acquired_at: '2026-10-23T00:00:00Z' },
  ];

  it('defaults to the first parcel acquired', () => {
    assert.equal(resolveHomeBase(rows, null), 'E2-0001');
    assert.equal(resolveHomeBase(rows, ''), 'E2-0001');
  });

  it('honours a stored choice that is still owned', () => {
    assert.equal(resolveHomeBase(rows, 'E2-0006'), 'E2-0006');
    assert.equal(resolveHomeBase(rows, 'e2-0006'), 'E2-0006');
  });

  it('falls back when the choice was sold on, and to null with no land', () => {
    assert.equal(resolveHomeBase(rows, 'E2-0999'), 'E2-0001');
    assert.equal(resolveHomeBase([rows[1]], 'E2-0001'), 'E2-0006');
    assert.equal(resolveHomeBase([], 'E2-0001'), null);
    assert.equal(resolveHomeBase(null, null), null);
  });

  it("ownedRowsFor picks one user's rows out of the full list, in order", () => {
    const mixed = [
      { parcel_id: 'E2-0002', owner_email: 'b@x.io' },
      rows[0],
      { parcel_id: 'E2-0003', owner_email: 'B@x.io' },
      rows[1],
    ];
    assert.deepEqual(ownedRowsFor(mixed, 'A@X.io').map((r) => r.parcel_id), ['E2-0001', 'E2-0006']);
    assert.deepEqual(ownedRowsFor(mixed, ''), []);
    assert.deepEqual(ownedRowsFor(null, 'a@x.io'), []);
  });
});

describe('land sales — first round and Land Tiles resale', () => {
  const seller = 'seller@x.io';
  const ownableParcel = PARCELS.find((p) => p.ownable);
  const commonsParcel = PARCELS.find((p) => !p.ownable);
  const sellerRow = {
    parcel_id: ownableParcel.id,
    owner_id: 'u-seller',
    owner_email: seller,
    price_gold: ownableParcel.priceGold,
    acquired_at: '2026-10-22T00:00:00Z',
  };

  it('the first round lists exactly the ownable, unsold parcels', () => {
    assert.equal(firstRoundListings([]).length, 1000);
    assert.ok(firstRoundListings([]).every((p) => p.ownable));
    const after = firstRoundListings([sellerRow]);
    assert.equal(after.length, 999);
    assert.ok(!after.some((p) => p.id === ownableParcel.id));
    assert.equal(firstRoundRemaining([sellerRow]), 999);
    assert.equal(firstRoundSoldOut([sellerRow]), false);
  });

  it('the sold-out flip happens at exactly all 1,000 ownable owned', () => {
    const allRows = PARCELS.filter((p) => p.ownable).map((p) => ({
      parcel_id: p.id,
      owner_id: 'u-x',
      owner_email: 'x@x.io',
    }));
    assert.equal(allRows.length, 1000);
    assert.equal(firstRoundSoldOut(allRows), true);
    assert.equal(firstRoundRemaining(allRows), 0);
    assert.equal(firstRoundSoldOut(allRows.slice(1)), false);
  });

  it('a resale listing is created for an owned ownable parcel', () => {
    const res = createLandListing(ownableParcel, [sellerRow], 42000, seller, 1700000000000);
    assert.equal(res.ok, true);
    assert.equal(res.listing.category, 'land_tiles');
    assert.equal(res.listing.parcelId, ownableParcel.id);
    assert.equal(res.listing.name, ownableParcel.name);
    assert.equal(res.listing.tier, ownableParcel.tier);
    assert.equal(res.listing.askingGold, 42000);
    assert.equal(res.listing.sellerEmail, seller);
    assert.equal(res.listing.status, 'live');
  });

  it('Free Commons can never be listed — refused at the lib level', () => {
    const res = createLandListing(commonsParcel, [], 1000, seller, 0);
    assert.equal(res.ok, false);
    assert.match(res.error, /Free Commons/);
  });

  it('only the owner can list, and the asking price must be real gold', () => {
    assert.equal(createLandListing(ownableParcel, [], 1000, seller, 0).ok, false);
    assert.match(
      createLandListing(ownableParcel, [sellerRow], 1000, 'other@x.io', 0).error,
      /only list a parcel you own/
    );
    assert.equal(createLandListing(ownableParcel, [sellerRow], 0, seller, 0).ok, false);
    assert.equal(createLandListing(ownableParcel, [sellerRow], -5, seller, 0).ok, false);
  });

  it('buying a listing transfers title (and rent rights) in the state layer', () => {
    const rows = [sellerRow];
    const at = 1700003600000;
    const res = transferLandTitle(rows, ownableParcel.id, { id: 'u-buyer', email: 'buyer@x.io' }, at);
    assert.equal(res.ok, true);
    assert.equal(res.rows[0].owner_id, 'u-buyer');
    assert.equal(res.rows[0].owner_email, 'buyer@x.io');
    assert.equal(res.rows[0].acquired_at, new Date(at).toISOString());
    // The input layer is untouched — the transfer returns a new array.
    assert.equal(rows[0].owner_email, seller);
    // Rent reads the owner row, so the new owner now collects rent:
    // the parcel also leaves the seller's home-base resolution.
    assert.equal(resolveHomeBase(ownedRowsFor(res.rows, seller), null), null);
    assert.equal(resolveHomeBase(ownedRowsFor(res.rows, 'buyer@x.io'), null), ownableParcel.id);
  });

  it('title transfer refuses commons, strangers and self-buys', () => {
    assert.equal(transferLandTitle([], commonsParcel.id, { id: 'u2', email: 'b@x.io' }, 0).ok, false);
    assert.match(
      transferLandTitle([], commonsParcel.id, { id: 'u2', email: 'b@x.io' }, 0).error,
      /Free Commons/
    );
    assert.equal(transferLandTitle([], ownableParcel.id, { id: 'u2', email: 'b@x.io' }, 0).ok, false);
    assert.equal(
      transferLandTitle([sellerRow], ownableParcel.id, { id: 'u-seller', email: seller }, 0).ok,
      false
    );
    assert.equal(transferLandTitle([sellerRow], 'E2-9999', { id: 'u2', email: 'b@x.io' }, 0).ok, false);
  });
});

describe("the Auction House 'Land Tiles' category", () => {
  it("is registered under Merlin's exact naming", () => {
    assert.equal(LAND_TILES_CATEGORY, 'land_tiles');
    assert.equal(LAND_TILES_LABEL, 'Land Tiles');
    assert.equal(isLandTilesCategory('land_tiles'), true);
    assert.equal(isLandTilesCategory(' LAND_TILES '), true);
    assert.equal(isLandTilesCategory('world'), false);
  });

  it('stays OUT of the forge-asset categories (that list mirrors the DB check)', () => {
    assert.equal(AUCTION_CATEGORIES.length, 8);
    assert.ok(!AUCTION_CATEGORIES.includes('land_tiles'));
  });

  it('the house UI carries the Land Tiles tab and its own panel', () => {
    const logic = read('app/auction-house/auction.js');
    assert.ok(logic.includes("{ value: 'land_tiles', label: 'Land Tiles' }"));
    const page = read('app/auction-house/page.jsx');
    assert.ok(page.includes('LandTilesPanel'), 'land tab renders the land panel');
    assert.ok(page.includes("cat === 'land_tiles'"), 'land tab never queries the listings API');
    assert.ok(page.includes('/earth-2'), 'land panel points at the Earth 2 chamber');
  });

  it('the chamber carries the First Round frame, the sold-out flip and home base', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('FIRST ROUND LAND SALE'));
    assert.ok(page.includes('THE FIRST ROUND IS SOLD OUT'));
    assert.ok(page.includes('/auction-house?category=land_tiles'));
    assert.ok(page.includes('Set as home base'));
    assert.ok(page.includes('resolveHomeBase'));
    assert.ok(page.includes('Free Commons'), 'chamber labels the commons plainly');
  });
});

describe('the gold forge', () => {
  const HOUR = 3600000;

  it('accrues at the published rate', () => {
    const t0 = 1700000000000;
    assert.equal(FORGE_RATE_GOLD_PER_HOUR, 25);
    assert.equal(forgeAccrued(t0, t0 + HOUR), 25);
    assert.equal(forgeAccrued(t0, t0 + 2.5 * HOUR), 62); // floor
    assert.equal(forgeAccrued(t0, t0 + 30 * 60000), 12); // half an hour
  });

  it('accrues nothing without a lit forge or without elapsed time', () => {
    const t0 = 1700000000000;
    assert.equal(forgeAccrued(null, t0 + 10 * HOUR), 0);
    assert.equal(forgeAccrued(0, t0 + 10 * HOUR), 0);
    assert.equal(forgeAccrued(undefined, t0 + 10 * HOUR), 0);
    assert.equal(forgeAccrued(t0, t0), 0);
    assert.equal(forgeAccrued(t0 + HOUR, t0), 0); // clock ran backwards
  });

  it('never pours past the daily cap', () => {
    const t0 = 1700000000000;
    assert.equal(FORGE_DAILY_CAP_GOLD, 1000);
    assert.equal(forgeAccrued(t0, t0 + 40 * HOUR), 1000); // exactly at cap
    assert.equal(forgeAccrued(t0, t0 + 24 * 365 * HOUR), 1000);
  });
});

describe('the access lock (static wiring)', () => {
  it('SIGNED_IN_PORTALS holds exactly the Earth 2 entry; OWNER_PORTALS is empty now', () => {
    assert.equal(SIGNED_IN_PORTALS.length, 1);
    assert.deepEqual(SIGNED_IN_PORTALS[0], {
      key: 'earth-2',
      route: '/earth-2',
      section: 'OBSERVATORY',
      title: 'Earth 2',
      subtitle: 'Open to all signed-in users',
    });
    assert.equal(OWNER_PORTALS.length, 0, 'Earth 2 left the owner-only list on 2026-10-31');
  });

  it('withSignedInPortals appends for any signed-in account, never for signed-out', () => {
    const base = buildPortalRoster(
      [{ key: 'mars', route: '/mars', section: 'OBSERVATORY' }],
      () => 'Mars',
      () => ''
    );
    assert.equal(base.length, 1);
    const signedOut = withSignedInPortals(base, null);
    assert.equal(signedOut, base); // untouched — the same array
    assert.ok(!signedOut.some((p) => p.key === 'earth-2'));
    const asStranger = withSignedInPortals(base, 'someone.else@example.com');
    assert.equal(asStranger.length, 2);
    assert.equal(asStranger[1].key, 'earth-2');
    assert.equal(asStranger[1].route, '/earth-2');
    // Never duplicated, even if the roster already carries the route.
    const again = withSignedInPortals(asStranger, 'someone.else@example.com');
    assert.equal(again.filter((p) => p.route === '/earth-2').length, 1);
  });

  it('withOwnerPortals still works for the (currently empty) owner-only list', () => {
    const base = buildPortalRoster(
      [{ key: 'mars', route: '/mars', section: 'OBSERVATORY' }],
      () => 'Mars',
      () => ''
    );
    assert.equal(withOwnerPortals(base, false), base);
    assert.equal(withOwnerPortals(base, true), base); // nothing owner-only right now
  });

  it('every Earth 2 write route verifies Earth 2 access — any signed-in account, rights-checked inside', () => {
    for (const route of ['buy', 'forge', 'rent', 'builds', 'builds/claims']) {
      const src = read(`app/api/earth2/${route}/route.js`);
      assert.ok(src.includes('verifyEarth2AccessSession'), `${route} must call verifyEarth2AccessSession`);
      assert.ok(!src.includes('verifyOwnerSession'), `${route} must NOT gate on the owner session`);
      assert.ok(src.includes("status: 404"), `${route} must 404 for accounts without access`);
    }
  });

  it('the read surfaces (state, model door) verify Earth 2 access — any signed-in account', () => {
    for (const route of ['state', 'model-urls']) {
      const src = read(`app/api/earth2/${route}/route.js`);
      assert.ok(src.includes('verifyEarth2AccessSession'), `${route} must call verifyEarth2AccessSession`);
      assert.ok(src.includes("status: 404"), `${route} must 404 for accounts without access`);
    }
  });

  it('the Earth 2 page gates on Earth 2 access before rendering', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('hasEarth2Access'), 'page checks Earth 2 access');
    assert.ok(page.includes('getSession'), 'page reads the browser session');
    // Signed-out visitors get the sign-in gate (same pattern as /moon
    // and /sun-base) — never a dead 404 (scout flaw 1, Nov 14, 2026).
    assert.ok(page.includes('Sign in to enter Earth 2'), 'locked screen is the sign-in gate');
    assert.ok(!page.includes('This page could not be found.'), 'no dead 404 for signed-out visitors');
  });

  it('the one portal surface feeds its roster through withSignedInPortals', () => {
    assert.ok(read('components/ConcoursePortals.jsx').includes('withSignedInPortals'));
  });

  it("the satellite registry has NO 'earth-2' entry (no hub tower)", () => {
    const satellites = read('lib/i18n/satellites.ts');
    assert.ok(!satellites.includes('earth-2'), 'registry must not name earth-2');
    assert.ok(!satellites.includes('/earth-2'), 'registry must not route /earth-2');
  });
});

// ── The proof of concept (Merlin, 2026-10-23): two accounts hold
// one granted parcel each, with exactly one parcel between them,
// and each spawns on their own land. The titles are written by
// supabase/earth2-poc-grants.sql into earth2_parcels; everything
// below pins the shape those rows must satisfy — access, parcels,
// counting, and spawn — against the same pure layers the app runs.

describe('the proof of concept — two accounts, two parcels (2026-10-23)', () => {
  const OWNER = 'olympiannexus@gmail.com';
  const GUEST = EARTH2_GUEST_EMAIL;

  it('access is any signed-in account — the unlock (Merlin, 2026-10-31)', () => {
    assert.equal(GUEST, 'fishstart@hotmail.com');
    assert.ok(hasEarth2Access(OWNER));
    assert.ok(hasEarth2Access(GUEST));
    assert.ok(isEarth2GuestEmail('  FishStart@Hotmail.com '), 'house email rule (trim + case)');
    assert.ok(hasEarth2Access('olympianmeg@gmail.com'), "Merlin's personal account is a signed-in account");
    assert.ok(hasEarth2Access('someone.else@example.com'), 'any signed-in account gets in');
    assert.ok(hasEarth2Access('fishstart@hotmail.com.evil.com'), 'a different signed-in account is still signed in');
    assert.ok(!hasEarth2Access(null) && !hasEarth2Access('') && !hasEarth2Access(undefined));
    assert.ok(!isEarth2GuestEmail(OWNER), 'the owner is not the guest');
  });

  it('the granted parcels are ownable, dry, unprotected meadow — with exactly one parcel between', () => {
    const owner = parcelById(POC_OWNER_PARCEL_ID);
    const gap = parcelById(POC_GAP_PARCEL_ID);
    const guest = parcelById(POC_GUEST_PARCEL_ID);
    assert.ok(owner && gap && guest, 'all three parcels exist');
    for (const p of [owner, guest]) {
      assert.equal(p.ownable, true, `${p.id} is ownable-class`);
      assert.equal(p.kind, 'ownable', p.id);
      assert.ok(!protectedParcelIds().has(p.id), `${p.id} is not protected ground`);
      assert.equal(familyForParcel(p), 'Meadows', `${p.id} is grassland`);
      assert.equal(climateForParcel(p), 'temperate', `${p.id} is temperate`);
      const c = parcelCenterWorld(p);
      assert.ok(heightAt(c.x, c.z) > 0.45, `${p.id} centre stands dry (${heightAt(c.x, c.z).toFixed(2)} m)`);
    }
    // Exactly one parcel between: a single column run — owner,
    // gap, guest two rows apart, centres 56 m from each other.
    assert.equal(gap.index, owner.index + 50, 'the gap sits directly between');
    assert.equal(guest.index, owner.index + 100, 'the guest parcel is two rows on');
    assert.equal(owner.col, gap.col);
    assert.equal(gap.col, guest.col);
    const co = parcelCenterWorld(owner);
    const cg = parcelCenterWorld(guest);
    assert.equal(Math.hypot(cg.x - co.x, cg.z - co.z), 56, 'the two homes stand 56 m apart');
    // The gap is NOT granted: it stays an ownable, unowned parcel
    // in the first-round sale pool.
    assert.equal(gap.ownable, true, 'the gap parcel remains saleable');
    assert.ok(!protectedParcelIds().has(gap.id), 'the gap parcel is not protected ground');
  });

  it('grant-shaped rows count as 2 of the 1,000 taken — through the normal land-sale source', () => {
    const rows = [
      { parcel_id: POC_OWNER_PARCEL_ID, owner_id: 'owner-uuid', owner_email: OWNER, price_gold: 0, acquired_at: '2026-10-23T00:00:00.000Z' },
      { parcel_id: POC_GUEST_PARCEL_ID, owner_id: 'guest-uuid', owner_email: GUEST, price_gold: 0, acquired_at: '2026-10-23T00:00:01.000Z' },
    ];
    assert.equal(firstRoundRemaining(rows), 998, 'two of the 1,000 ownable are taken');
    assert.equal(firstRoundSoldOut(rows), false);
    const listings = firstRoundListings(rows);
    assert.ok(!listings.some((p) => p.id === POC_OWNER_PARCEL_ID), 'the owner parcel leaves the sale');
    assert.ok(!listings.some((p) => p.id === POC_GUEST_PARCEL_ID), 'the guest parcel leaves the sale');
    assert.ok(listings.some((p) => p.id === POC_GAP_PARCEL_ID), 'the gap parcel stays for sale');
  });

  it('spawn follows the title: each account lands on its own parcel, server rows over any stored choice', () => {
    const rows = [
      { parcel_id: POC_OWNER_PARCEL_ID, owner_id: 'owner-uuid', owner_email: OWNER, price_gold: 0, acquired_at: '2026-10-23T00:00:00.000Z' },
      { parcel_id: POC_GUEST_PARCEL_ID, owner_id: 'guest-uuid', owner_email: GUEST, price_gold: 0, acquired_at: '2026-10-23T00:00:01.000Z' },
    ];
    // The guest's home base is HIS parcel — derived from the server
    // rows alone (no stored choice), and a stored choice naming the
    // OWNER's parcel can never pull him across: titles win.
    const guestRows = ownedRowsFor(rows, GUEST);
    assert.deepEqual(guestRows.map((r) => r.parcel_id), [POC_GUEST_PARCEL_ID]);
    assert.equal(resolveHomeBase(guestRows, null), POC_GUEST_PARCEL_ID);
    assert.equal(resolveHomeBase(guestRows, POC_OWNER_PARCEL_ID), POC_GUEST_PARCEL_ID,
      'a foreign stored choice falls back to the account’s own title');
    assert.equal(resolveHomeBase(guestRows, POC_GAP_PARCEL_ID), POC_GUEST_PARCEL_ID,
      'an unowned stored choice falls back to the account’s own title');
    const guestSpawn = resolveSpawnParcel(resolveHomeBase(guestRows, null));
    assert.equal(guestSpawn.id, POC_GUEST_PARCEL_ID);
    const gp = spawnPointFor(guestSpawn);
    assert.equal(gp.parcel.id, POC_GUEST_PARCEL_ID, 'the guest physically stands on his own parcel');

    const ownerRows = ownedRowsFor(rows, OWNER);
    assert.deepEqual(ownerRows.map((r) => r.parcel_id), [POC_OWNER_PARCEL_ID]);
    assert.equal(resolveHomeBase(ownerRows, POC_GUEST_PARCEL_ID), POC_OWNER_PARCEL_ID,
      'the owner likewise cannot be pulled onto the guest’s land');
    const ownerSpawn = resolveSpawnParcel(resolveHomeBase(ownerRows, null));
    assert.equal(ownerSpawn.id, POC_OWNER_PARCEL_ID);
    assert.equal(spawnPointFor(ownerSpawn).parcel.id, POC_OWNER_PARCEL_ID);

    // Accounts owning nothing keep today's behaviour: no home base,
    // the landing meadow.
    assert.equal(resolveHomeBase(ownedRowsFor(rows, 'nobody@example.com'), null), null);
    assert.equal(resolveSpawnParcel(null).id, 'E2-1225', 'the Cinder Grove landing, unchanged');
  });

  it('the grant SQL is staged, idempotent, loud on a missing account, and shaped like the buy route', () => {
    const sql = read('supabase/earth2-poc-grants.sql');
    assert.ok(sql.includes('NOT RUN'), 'marked not run — SQL needs the green light');
    assert.ok(sql.includes(POC_OWNER_PARCEL_ID), 'names the owner parcel');
    assert.ok(sql.includes(POC_GUEST_PARCEL_ID), 'names the guest parcel');
    assert.ok(sql.includes(POC_GAP_PARCEL_ID), 'the gap parcel is documented');
    assert.ok(!sql.includes(`'${POC_GAP_PARCEL_ID}'`), 'the gap parcel never appears as a granted value');
    assert.ok(sql.includes(GUEST), 'resolves the guest by email');
    assert.ok(sql.includes('olympiannexus@gmail.com'), 'resolves the owner by email');
    assert.ok(sql.includes('auth.users'), 'ids come from auth.users');
    assert.ok(sql.includes('raise exception'), 'fails loudly');
    assert.ok(sql.includes('no auth account'), 'a missing account is obvious, never a silent skip');
    assert.ok(sql.includes('on conflict (parcel_id) do nothing'), 'idempotent titles');
    assert.ok(
      sql.includes('insert into public.earth2_parcels (parcel_id, owner_id, owner_email, price_gold)'),
      'the buy route’s exact title columns'
    );
    assert.ok(sql.includes("'buy'") && sql.includes('poc-grant'), 'ledger rows mark the POC grant');
    assert.ok(sql.includes('amount_gold') || sql.includes('0, \'poc-grant\''), 'zero-gold diary rows');
  });
});

// ── The blood-sac loop (Merlin, 2026-10-22): Castle Transylvania
// at the South Pole, Dracula's gift table, the sac tallies, and the
// creature systems the Bay runs on.

describe('Castle Transylvania — Dracula’s seat at the South Pole', () => {
  it('parcelAt(-88, 0) resolves to the castle, named and Free Commons', () => {
    const c = parcelAt(-88, 0);
    assert.equal(c.name, 'Castle Transylvania');
    assert.equal(c.id, CASTLE_PARCEL_ID);
    assert.equal(c.id, 'E2-2476');
    assert.equal(c.row, 49, 'the southernmost row');
    assert.equal(c.col, 25, 'the center column');
    assert.equal(c.kind, 'commons');
    assert.equal(c.ownable, false);
    assert.equal(c.priceGold, null);
    assert.equal(c.tier, 'landmark');
  });

  it('castleParcel / isCastleParcel agree, and the seat can never be bought or listed', () => {
    const c = castleParcel();
    assert.equal(c.index, CASTLE_PARCEL_INDEX);
    assert.ok(isCastleParcel(c));
    assert.ok(!isCastleParcel(parcelById('E2-0001')));
    assert.ok(!isCastleParcel(null));
    assert.match(buyRefusal(c), /Free Commons/);
    // Not in the first-round sale, and the resale layer refuses it.
    assert.ok(!firstRoundListings([]).some((p) => p.id === c.id));
    const res = createLandListing(c, [], 1000, 'owner@x.io', 0);
    assert.equal(res.ok, false);
  });

  it('the chamber shows the castle on the map and in the inspector', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('isCastleParcel'), 'page knows the castle parcel');
    assert.ok(page.includes('Castle Transylvania'), 'page names the castle');
    assert.ok(page.includes('🏰'), 'the map/inspector carry the castle marker');
  });
});

describe("Dracula's gift table", () => {
  it('weights are sane: positive, summing to 100, rarity in step with weight', () => {
    assert.equal(GIFT_WEIGHT_TOTAL, 100);
    assert.equal(GIFT_TABLE.reduce((s, g) => s + g.weight, 0), 100);
    const ids = new Set(GIFT_TABLE.map((g) => g.id));
    assert.equal(ids.size, GIFT_TABLE.length);
    for (const g of GIFT_TABLE) {
      assert.ok(g.weight > 0, g.id);
      assert.ok(['gold', 'aether', 'weapon', 'jackpot'].includes(g.kind), g.id);
      assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(g.rarity), g.id);
      if (g.kind === 'weapon') assert.ok(g.weapon, g.id);
      if (g.kind === 'jackpot') {
        assert.ok(g.gold >= 1000 && g.aether >= 5, 'the jackpot is a jackpot');
        assert.equal(g.rarity, 'legendary');
      }
    }
    // The named weapons from Merlin's armoury are on the table.
    const weapons = GIFT_TABLE.filter((g) => g.kind === 'weapon').map((g) => g.weapon);
    assert.deepEqual(weapons.sort(), ['Bloodmoon Rifle', 'Nightreaver Bow', 'Silverfang Dagger']);
    // Gold comes in tiers.
    const golds = GIFT_TABLE.filter((g) => g.kind === 'gold').map((g) => g.gold).sort((a, b) => a - b);
    assert.deepEqual(golds, [25, 100, 500, 1000]);
  });

  it('every outcome is reachable over many seeded rolls, the jackpot rarest', () => {
    // A seeded RNG drives the table deterministically.
    let seed = 20261022;
    const rng = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const counts = new Map();
    const kinds = new Set();
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const gift = rollGift(rng);
      counts.set(gift.id, (counts.get(gift.id) || 0) + 1);
      kinds.add(gift.kind);
      if (gift.kind === 'gold') assert.ok(gift.gold > 0, gift.id);
      if (gift.kind === 'weapon') assert.ok(gift.weapon, gift.id);
    }
    for (const g of GIFT_TABLE) {
      assert.ok(counts.get(g.id) > 0, `${g.id} never rolled in ${N}`);
    }
    assert.deepEqual([...kinds].sort(), ['aether', 'gold', 'jackpot', 'weapon']);
    const jackpotRate = counts.get('jackpot-favor') / N;
    assert.ok(jackpotRate > 0.005 && jackpotRate < 0.045, `jackpot rate ${jackpotRate}`);
    assert.ok(counts.get('gold-25') > counts.get('jackpot-favor') * 5, 'commons dominate');
    // The default RNG (real randomness) also produces valid gifts.
    const g = rollGift();
    assert.ok(GIFT_TABLE.some((t) => t.id === g.id));
  });
});

describe('blood-sac state', () => {
  it('collecting and offering move exactly one sac at a time', () => {
    let s = emptyBloodSacState();
    assert.equal(s.sacs, 0);
    s = collectBloodSac(s);
    s = collectBloodSac(s);
    assert.equal(s.sacs, 2);
    const gift = { id: 'gold-100', kind: 'gold', label: '100 gold', rarity: 'common', gold: 100, aether: 0, weapon: null };
    const res = offerBloodSac(s, gift, 1700000000000);
    assert.equal(res.ok, true);
    assert.equal(res.state.sacs, 1, 'exactly one sac consumed');
    assert.equal(res.state.gold, 100);
    assert.equal(res.state.history.length, 1);
    assert.equal(res.state.history[0].label, '100 gold');
    assert.equal(res.state.history[0].at, 1700000000000);
    // The input state is untouched (pure functions).
    assert.equal(s.sacs, 2);
    assert.equal(s.gold, 0);
  });

  it('weapons and aether accumulate; an empty pouch is refused', () => {
    let s = collectBloodSac(emptyBloodSacState());
    const bow = { id: 'weapon-nightreaver', kind: 'weapon', label: 'Nightreaver Bow', rarity: 'rare', gold: 0, aether: 0, weapon: 'Nightreaver Bow' };
    s = offerBloodSac(s, bow, 1).state;
    assert.deepEqual(s.weapons, ['Nightreaver Bow']);
    s = collectBloodSac(s);
    const favor = { id: 'jackpot-favor', kind: 'jackpot', label: "Dracula's Favor", rarity: 'legendary', gold: 2500, aether: 10, weapon: null };
    s = offerBloodSac(s, favor, 2).state;
    assert.equal(s.gold, 2500);
    assert.equal(s.aether, 10);
    assert.equal(s.sacs, 0);
    const refused = offerBloodSac(s, favor, 3);
    assert.equal(refused.ok, false);
    assert.equal(refused.state.sacs, 0);
    assert.equal(refused.state.gold, 2500, 'a refused offer changes nothing');
  });

  it('persists through storage with the declared shape (and survives junk)', () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    try {
      let s = collectBloodSac(collectBloodSac(emptyBloodSacState()));
      s = offerBloodSac(s, { id: 'aether-3', kind: 'aether', label: 'Aether shards ×3', rarity: 'uncommon', gold: 0, aether: 3, weapon: null }, 42).state;
      saveBloodSacState(s);
      assert.ok(store.has(BLOOD_SAC_STORAGE_KEY));
      const back = loadBloodSacState();
      assert.equal(back.sacs, 1);
      assert.equal(back.aether, 3);
      assert.equal(back.history.length, 1);
      assert.equal(back.history[0].giftId, 'aether-3');
      // Junk in storage falls back to a clean state, never a crash.
      store.set(BLOOD_SAC_STORAGE_KEY, '{"sacs":"lots","weapons":[7]}');
      const clean = loadBloodSacState();
      assert.equal(clean.sacs, 0);
      assert.deepEqual(clean.weapons, []);
    } finally {
      delete globalThis.localStorage;
    }
    // No storage at all: loads empty, saves silently.
    assert.deepEqual(loadBloodSacState(), emptyBloodSacState());
  });
});

describe('the creature systems (swarm, mosquitos, Dracula)', () => {
  it('the compy swarm config pins Merlin’s swarm: 12 compies at 0.4 m on the compsognathus', () => {
    assert.equal(COMPY_SWARM.count, 12);
    assert.equal(COMPY_SWARM.bodyLengthM, 0.4);
    assert.equal(COMPY_SWARM.sourceSlug, 'compsognathus');
    assert.ok(COMPY_SWARM.scatterRadius > 0);
    assert.ok(COMPY_SWARM.scatterSpeedMultiplier > 1);
    assert.ok(COMPY_SWARM.tempo > 1, 'the swarm runs at higher tempo');
  });

  it('the mosquito config pins the feeding loop: 6 mosquitos, an 8-second drink', () => {
    assert.equal(MOSQUITO_CONFIG.count, 6);
    assert.equal(MOSQUITO_CONFIG.feedSeconds, 8);
    assert.equal(BAT_SWARM.count, 18);
    assert.equal(BAT_SWARM.sourceSlug, 'vampire-bat');
  });

  it('only a mosquito that has drunk drops a blood sac', () => {
    assert.equal(mosquitoDropsSac('feeding'), true);
    assert.equal(mosquitoDropsSac('full'), true);
    assert.equal(mosquitoDropsSac('cruising'), false);
    assert.equal(mosquitoDropsSac('seeking'), false);
    assert.equal(mosquitoDropsSac('falling'), false);
    assert.equal(mosquitoDropsSac('gone'), false);
    // The swell that betrays it: empty → filling → full.
    assert.equal(mosquitoFullness('cruising', 0), 0);
    assert.equal(mosquitoFullness('feeding', 4), 0.5);
    assert.equal(mosquitoFullness('feeding', 99), 1);
    assert.equal(mosquitoFullness('full', 0), 1);
  });

  it('Dracula’s transformation runs count → smoke → bat → return → smoke → count', () => {
    let m = createDraculaMachine();
    assert.equal(m.phase, 'count');
    assert.ok(draculaIsCount(m.phase) && !draculaIsBat(m.phase));
    m = stepDracula(m, 0.1, 'greet');
    assert.equal(m.phase, 'smoke-out');
    assert.equal(m.scatter, 1, 'the swarm scatters as he transforms');
    m = stepDracula(m, DRACULA_TIMINGS.smokeSeconds + 0.01, null);
    assert.equal(m.phase, 'bat');
    assert.ok(draculaIsBat(m.phase));
    m = stepDracula(m, DRACULA_TIMINGS.batSeconds + 0.01, null);
    assert.equal(m.phase, 'return');
    m = stepDracula(m, DRACULA_TIMINGS.returnSeconds + 0.01, null);
    assert.equal(m.phase, 'smoke-in');
    m = stepDracula(m, DRACULA_TIMINGS.smokeSeconds + 0.01, null);
    assert.equal(m.phase, 'count');
    assert.ok(draculaIsCount(m.phase));
    // No greet, no hurry: he stays the Count until his idle cycle.
    let idle = createDraculaMachine();
    idle = stepDracula(idle, DRACULA_TIMINGS.idleSeconds - 1, null);
    assert.equal(idle.phase, 'count');
    idle = stepDracula(idle, 2, null);
    assert.equal(idle.phase, 'smoke-out', 'the idle cycle takes him to the air');
    // A greet mid-flight never breaks the machine.
    let flying = stepDracula(createDraculaMachine(), 0.1, 'greet');
    flying = stepDracula(flying, DRACULA_TIMINGS.smokeSeconds + 0.01, 'greet');
    assert.equal(flying.phase, 'bat');
    // The machine is pure: stepping never mutates its input.
    const before = createDraculaMachine();
    stepDracula(before, 1, 'greet');
    assert.equal(before.phase, 'count');
  });
});
