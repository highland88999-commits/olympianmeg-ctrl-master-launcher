// tests/earth2.test.mjs
// Earth 2 — Phase 2 foundation (owner-locked test build, Merlin
// 2026-10-21):
// - the deterministic 1000-parcel grid (ids, tiers, point lookups)
// - the gold forge's accrual math and daily cap
// - the owner lock's static wiring: OWNER_PORTALS + withOwnerPortals
//   in the shared roster, verifyOwnerSession in every Earth 2 API
//   route, and NO 'earth-2' entry in the satellite registry (a
//   registry entry would raise a hub tower in front of everyone)
//
// Run: node --test tests/earth2.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PARCEL_COUNT,
  PARCELS,
  parcelAt,
  parcelById,
} from '../lib/earth2/parcels.js';
import {
  FORGE_RATE_GOLD_PER_HOUR,
  FORGE_DAILY_CAP_GOLD,
  forgeAccrued,
} from '../lib/earth2/forge.js';
import {
  OWNER_PORTALS,
  buildPortalRoster,
  withOwnerPortals,
} from '../lib/portal-roster.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('the parcel grid', () => {
  it('holds exactly 1000 parcels with unique, well-formed ids', () => {
    assert.equal(PARCEL_COUNT, 1000);
    assert.equal(PARCELS.length, 1000);
    const ids = new Set(PARCELS.map((p) => p.id));
    assert.equal(ids.size, 1000);
    assert.equal(PARCELS[0].id, 'E2-0001');
    assert.equal(PARCELS[999].id, 'E2-1000');
    for (const p of PARCELS) assert.match(p.id, /^E2-\d{4}$/);
  });

  it('every parcel carries bounds, a name, a tier and its tier price', () => {
    const prices = { standard: 10000, prime: 50000, landmark: 250000 };
    for (const p of PARCELS) {
      assert.ok(p.latMin < p.latMax && p.lonMin < p.lonMax, p.id);
      assert.ok(p.name.length > 0, p.id);
      assert.ok(Object.hasOwn(prices, p.tier), `${p.id} tier ${p.tier}`);
      assert.equal(p.priceGold, prices[p.tier], p.id);
      assert.ok(p.centerLat >= p.latMin && p.centerLat < p.latMax, p.id);
      assert.ok(p.centerLon >= p.lonMin && p.centerLon < p.lonMax, p.id);
    }
  });

  it('parcelById round-trips and rejects strangers', () => {
    assert.equal(parcelById('E2-0001'), PARCELS[0]);
    assert.equal(parcelById('e2-1000'), PARCELS[999]);
    assert.equal(parcelById('E2-1001'), null);
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
    assert.equal(parcelAt(-90, 0).row, 24);
    assert.equal(parcelAt(10, 181).id, parcelAt(10, -179).id);
    assert.equal(parcelAt(10, -540).id, parcelAt(10, -180).id);
    assert.equal(parcelAt(10, 180).id, parcelAt(10, -180).id);
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

describe('the owner lock (static wiring)', () => {
  it('OWNER_PORTALS holds exactly the Earth 2 entry', () => {
    assert.equal(OWNER_PORTALS.length, 1);
    assert.deepEqual(OWNER_PORTALS[0], {
      key: 'earth-2',
      route: '/earth-2',
      section: 'OBSERVATORY',
      title: 'Earth 2',
      subtitle: 'Phase 2 — owner test build',
    });
  });

  it('withOwnerPortals appends only for the owner', () => {
    const base = buildPortalRoster(
      [{ key: 'mars', route: '/mars', section: 'OBSERVATORY' }],
      () => 'Mars',
      () => ''
    );
    assert.equal(base.length, 1);
    const asGuest = withOwnerPortals(base, false);
    assert.equal(asGuest, base); // untouched — the same array
    assert.ok(!asGuest.some((p) => p.key === 'earth-2'));
    const asOwner = withOwnerPortals(base, true);
    assert.equal(asOwner.length, 2);
    assert.equal(asOwner[1].key, 'earth-2');
    assert.equal(asOwner[1].route, '/earth-2');
    // Never duplicated, even if the roster already carries the route.
    const again = withOwnerPortals(asOwner, true);
    assert.equal(again.filter((p) => p.route === '/earth-2').length, 1);
  });

  it('every Earth 2 API route verifies the owner session', () => {
    for (const route of ['state', 'buy', 'forge', 'rent']) {
      const src = read(`app/api/earth2/${route}/route.js`);
      assert.ok(src.includes('verifyOwnerSession'), `${route} must call verifyOwnerSession`);
      assert.ok(src.includes("status: 404"), `${route} must 404 for non-owners`);
    }
  });

  it('the Earth 2 page gates on the session before rendering', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('isOwnerEmail'), 'page checks the owner email');
    assert.ok(page.includes('getSession'), 'page reads the browser session');
    assert.ok(page.includes('This page could not be found.'), 'locked screen is a plain 404');
  });

  it('both portal surfaces feed their roster through withOwnerPortals', () => {
    assert.ok(read('components/ConcoursePortals.jsx').includes('withOwnerPortals'));
    assert.ok(read('components/portal-room/PortalRoomGate.jsx').includes('withOwnerPortals'));
    assert.ok(read('app/portal-room/page.jsx').includes('PortalRoomGate'));
  });

  it("the satellite registry has NO 'earth-2' entry (no hub tower)", () => {
    const satellites = read('lib/i18n/satellites.ts');
    assert.ok(!satellites.includes('earth-2'), 'registry must not name earth-2');
    assert.ok(!satellites.includes('/earth-2'), 'registry must not route /earth-2');
  });
});
