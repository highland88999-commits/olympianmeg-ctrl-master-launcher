// tests/communiverse.test.mjs
// The Communiverse (Merlin's bug-report-turned-feature, 2026-10-22):
// - publish state is a generation_params marker (lib/communiverse.js):
//   set/read/remove round-trips, and every other param survives untouched
//   (publishing must never reshape the planet)
// - Earth is the built-in first planet, entering it dives via the hub
//   deep link (/?enter=earth -> beginEarthDive in app/page.jsx)
// - the API routes are owner-checked: publish + Muse-direct reject
//   non-owners; the world route serves published worlds to anyone and
//   unpublished ones only to their owner
// - Muse-direct re-forges the SAME asset row through the World Engine
//   synthesis + billing helpers, and preserves the publish marker
// - Profile wiring: world cards link into the world, carry the publish
//   button and the Muse button with the Concourse Muse icon
// - Auction transfer: settleSale moves the asset row (user_id) with its
//   generation_params untouched, so the Communiverse place + owner rights
//   follow the world to the buyer and it leaves the seller's profile
//
// Run: node --test tests/communiverse.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  COMMUNIVERSE_KEY,
  EARTH_ENTRY,
  EARTH_ENTER_HREF,
  communiverseMarker,
  isInCommuniverse,
  withCommuniverse,
  worldHref,
  publicWorldFields,
} from '../lib/communiverse.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('publish marker', () => {
  it('defaults to unpublished for missing or malformed params', () => {
    assert.equal(isInCommuniverse(null), false);
    assert.equal(isInCommuniverse(undefined), false);
    assert.equal(isInCommuniverse({}), false);
    assert.equal(isInCommuniverse({ [COMMUNIVERSE_KEY]: 'yes' }), false);
    assert.deepEqual(communiverseMarker({}), { published: false, at: null });
  });

  it('round-trips publish and unpublish without touching other params', () => {
    const params = { terrainType: 'desert', terrainRoughness: 0.7, sunColor: '#ffd166' };
    const published = withCommuniverse(params, true, '2026-10-22T00:00:00.000Z');
    assert.equal(isInCommuniverse(published), true);
    assert.equal(communiverseMarker(published).at, '2026-10-22T00:00:00.000Z');
    assert.equal(published.terrainType, 'desert');
    assert.equal(published.terrainRoughness, 0.7);
    // the original object is not mutated
    assert.equal(params[COMMUNIVERSE_KEY], undefined);
    const removed = withCommuniverse(published, false);
    assert.equal(isInCommuniverse(removed), false);
    assert.equal(removed.terrainType, 'desert');
  });

  it('publicWorldFields exposes the marker state and the enter href', () => {
    const asset = {
      id: 'w1', user_id: 'owner-1', display_name: 'Kepler', category: 'world',
      generation_params: withCommuniverse({ terrainType: 'ocean' }, true, '2026-10-22T00:00:00.000Z'),
      prompt: 'blue world', created_at: '2026-10-22T00:00:00.000Z',
    };
    const w = publicWorldFields(asset);
    assert.equal(w.in_communiverse, true);
    assert.equal(w.communiverse_at, '2026-10-22T00:00:00.000Z');
    assert.equal(w.owner_id, 'owner-1');
    assert.equal(w.is_earth, false);
    assert.equal(w.enter_href, '/communiverse/world/w1');
    assert.equal(worldHref('w1'), '/communiverse/world/w1');
    assert.equal(worldHref({ id: 'w2' }), '/communiverse/world/w2');
  });
});

describe('Earth, the first planet', () => {
  it('is a built-in entry that enters through the hub dive', () => {
    assert.equal(EARTH_ENTRY.id, 'earth');
    assert.equal(EARTH_ENTRY.is_earth, true);
    assert.equal(EARTH_ENTRY.in_communiverse, true);
    assert.equal(EARTH_ENTRY.enter_href, EARTH_ENTER_HREF);
    assert.equal(EARTH_ENTER_HREF, '/?enter=earth');
  });

  it('the hub honors ?enter=earth by running the real Earth dive', () => {
    const hub = read('app/page.jsx');
    assert.match(hub, /URLSearchParams\(window\.location\.search\)\.get\('enter'\) === 'earth'/);
    assert.match(hub, /earthDeepLinkRef\.current = true;\s*\n\s*beginEarthDive\(\)/);
  });
});

describe('API routes', () => {
  it('the feed returns Earth first, then published worlds only', () => {
    const route = read('app/api/communiverse/route.js');
    assert.match(route, /earth: EARTH_ENTRY/);
    assert.match(route, /isInCommuniverse\(a\.generation_params\)/);
    assert.match(route, /publicWorldFields/);
  });

  it('publish is owner-only and worlds-only, and writes the marker', () => {
    const route = read('app/api/communiverse/publish/route.js');
    assert.match(route, /Only the owner of a world can publish it/);
    assert.match(route, /Only worlds can join the Communiverse/);
    assert.match(route, /withCommuniverse\(asset\.generation_params, publish/);
  });

  it('the world route serves published worlds publicly, unpublished only to the owner', () => {
    const route = read('app/api/communiverse/world/[id]/route.js');
    assert.match(route, /!isInCommuniverse\(asset\.generation_params\) && !isOwner/);
    assert.match(route, /is_owner: isOwner/);
  });

  it('Muse-direct is owner-only, bills like synthesize, and preserves the marker', () => {
    const route = read('app/api/communiverse/direct/route.js');
    assert.match(route, /Only the owner of a world can direct it/);
    assert.match(route, /synthesizeWithGemini/);
    assert.match(route, /computeBilling\(ledger, cost\)/);
    assert.match(route, /applyAestheticEngine\(rawParams, 'world'\)/);
    assert.match(route, /withCommuniverse\(safeParams, wasPublished/);
    // the directed params land on the same asset row
    assert.match(route, /\.update\(\{ generation_params: nextParams, prompt: input\.prompt \}\)/);
  });
});

describe('pages + profile wiring', () => {
  it('the Communiverse page leads with Earth and links every planet in', () => {
    const page = read('app/communiverse/page.jsx');
    assert.match(page, /First planet/);
    assert.match(page, /earth\.enter_href/);
    assert.match(page, /fetch\('\/api\/communiverse'\)/);
  });

  it('the world page has orbit + street level, and owner-only Muse controls', () => {
    const page = read('app/communiverse/world/[id]/page.jsx');
    assert.match(page, /StreetLevel/);
    assert.match(page, /Street level/);
    assert.match(page, /isOwner \? \(/);
    assert.match(page, /\/api\/communiverse\/direct/);
    assert.match(page, /\/concourse-icons\/muse\.webp/);
  });

  it('street level is built from the same generation_params', () => {
    const street = read('components/communiverse/StreetLevel.jsx');
    assert.match(street, /PALETTES\[p\.terrainType\]/);
    assert.match(street, /groundH\(state\.x, state\.z\)/);
  });

  it('profile world cards enter, publish and direct — with the Concourse Muse icon', () => {
    const mine = read('components/profile/MyCreations.jsx');
    assert.match(mine, /\/communiverse\/world\/' \+ asset\.id/);
    assert.match(mine, /Publish to Communiverse/);
    assert.match(mine, /Direct with Muse/);
    assert.match(mine, /\/concourse-icons\/muse\.webp/);
    assert.match(mine, /\/api\/communiverse\/publish/);
    assert.match(mine, /\/api\/communiverse\/direct/);
    // the Concourse Muse tile uses that same icon file
    const concourse = read('components/Concourse.jsx');
    assert.match(concourse, /id: 'muse'[^}]*art: '\/concourse-icons\/muse\.webp'/);
  });

  it('the creations feed resolves the publish marker server-side', () => {
    const route = read('app/api/profiles/[id]/creations/route.js');
    assert.match(route, /in_communiverse: isInCommuniverse\(a\.generation_params\)/);
  });
});

describe('auction transfer carries the Communiverse rights', () => {
  it('settleSale transfers the row and never rewrites generation_params', () => {
    const settle = read('lib/auction/settle.js');
    assert.match(settle, /\.update\(\{ user_id: winnerId, is_listed: false, listing_type: 'none' \}\)/);
    const transferLine = settle.split('\n').find((l) => l.includes('user_id: winnerId'));
    assert.ok(transferLine && !transferLine.includes('generation_params'),
      'the transfer must leave generation_params (and its Communiverse marker) intact');
  });
});
