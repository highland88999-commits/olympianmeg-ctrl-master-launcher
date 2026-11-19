// tests/earth4-species-regions.test.mjs
// EARTH 4 — WHERE SPECIES LIVE (Merlin, 2026-11-14): the region
// dataset in lib/earth4/species-regions.js — crude lat/lon boxes
// per biogeographic realm, and the per-species map that says which
// realms each of the 2,408 catalogue species may spawn in, honestly
// sourced ('listed' / 'inferred-from-distribution' / 'unrestricted').
//
// Run: node --test tests/earth4-species-regions.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REGION_BOXES,
  REGIONS_FOR_SPECIES,
  regionsFor,
  speciesRegionsAllow,
} from '../lib/earth4/species-regions.js';
import { SPECIES_CATALOGUE } from '../lib/earth4/species-catalogue.js';

const REALMS = ['Nearctic', 'Neotropical', 'Palearctic', 'Afrotropic',
  'Indomalaya', 'Australasian', 'Oceanic', 'Antarctic'];

function inBoxes(realm, lat, lon) {
  for (const b of REGION_BOXES[realm]) {
    if (lat >= b.latMin && lat <= b.latMax
      && lon >= b.lonMin && lon <= b.lonMax) return true;
  }
  return false;
}

describe('the realm boxes', () => {
  it('every realm has at least one box, and the boxes are sane', () => {
    for (const realm of REALMS) {
      assert.ok(Array.isArray(REGION_BOXES[realm]), `no boxes for ${realm}`);
      assert.ok(REGION_BOXES[realm].length >= 1, `empty boxes for ${realm}`);
      for (const b of REGION_BOXES[realm]) {
        assert.ok(b.latMin < b.latMax, `${realm} box has no latitude span`);
        assert.ok(b.lonMin <= b.lonMax, `${realm} box has no longitude span`);
        assert.ok(b.latMin >= -90 && b.latMax <= 90, `${realm} box leaves the planet`);
        assert.ok(b.lonMin >= -180 && b.lonMax <= 180, `${realm} box leaves the planet`);
      }
    }
  });

  it('one known point inside each realm, and Redwater in Nearctic only', () => {
    const points = {
      Nearctic: [53.95235, -113.11636], // Redwater, Alberta
      Neotropical: [-3.4653, -62.2159], // Amazon
      Palearctic: [51.5, -0.12], // London
      Afrotropic: [-33.92, 18.42], // Cape Town
      Indomalaya: [0.5, 113.5], // Borneo
      Australasian: [-33.86, 151.2], // Sydney
      Oceanic: [19.59, -155.43], // Hawaii
      Antarctic: [-77.85, 166.66], // McMurdo
    };
    for (const [realm, [lat, lon]] of Object.entries(points)) {
      assert.equal(inBoxes(realm, lat, lon), true, `${realm} misses its own point`);
    }
    // Redwater sits in exactly one realm's boxes.
    const holding = REALMS.filter((r) => inBoxes(r, 53.95235, -113.11636));
    assert.deepEqual(holding, ['Nearctic']);
    // The far boxes: Greenland is Nearctic, Chukotka is Palearctic.
    assert.equal(inBoxes('Nearctic', 64.18, -51.69), true); // Nuuk
    assert.equal(inBoxes('Palearctic', 66, -172), true); // Chukotka
    assert.equal(inBoxes('Nearctic', 66, -172), false);
  });
});

describe('the per-species map', () => {
  it('covers all 2,408 catalogue species, and nothing else', () => {
    const names = Object.keys(REGIONS_FOR_SPECIES);
    assert.equal(names.length, 2408);
    for (const s of SPECIES_CATALOGUE) {
      assert.ok(REGIONS_FOR_SPECIES[s.name], `no region entry for ${s.name}`);
    }
  });

  it('every entry is honestly sourced, and no region is invented', () => {
    const counts = { listed: 0, 'inferred-from-distribution': 0, unrestricted: 0 };
    for (const [name, v] of Object.entries(REGIONS_FOR_SPECIES)) {
      assert.ok(v.source in counts, `${name} has unknown source ${v.source}`);
      counts[v.source] += 1;
      for (const r of v.regions) {
        assert.ok(REALMS.includes(r), `${name} claims unknown realm ${r}`);
      }
      if (v.source === 'unrestricted') {
        assert.deepEqual(v.regions, [], `${name} is unrestricted but holds regions`);
      } else {
        assert.ok(v.regions.length >= 1, `${name} is ${v.source} with no regions`);
      }
    }
    // Measured from the dataset (Nov 14 batch 1, Nov 19 batch 2):
    // the realms column holds 33 species, distribution text
    // another 349, the rest — 2,026 — have nothing usable anywhere
    // and stay unrestricted.
    assert.deepEqual(counts, {
      listed: 33,
      'inferred-from-distribution': 349,
      unrestricted: 2026,
    });
  });

  it('regionsFor returns the entry, or null when unknown', () => {
    const e = regionsFor('Ambystoma macrodactylum');
    assert.deepEqual(e.regions, ['Nearctic']);
    assert.equal(e.source, 'inferred-from-distribution');
    assert.equal(regionsFor('No Such Species'), null);
  });
});

describe('speciesRegionsAllow', () => {
  it('a Nearctic-only species lives in Redwater, not in the Amazon', () => {
    assert.equal(speciesRegionsAllow('Ambystoma macrodactylum', 53.95235, -113.11636), true);
    assert.equal(speciesRegionsAllow('Ambystoma macrodactylum', -3.4653, -62.2159), false);
  });

  it('an Indomalaya-only species lives in Borneo, not in Redwater', () => {
    assert.equal(speciesRegionsAllow('Pallisentis (Pallisentis) nagpurensis', 0.5, 113.5), true);
    assert.equal(speciesRegionsAllow('Pallisentis (Pallisentis) nagpurensis', 53.95235, -113.11636), false);
  });

  it('a listed four-realm species is allowed in its realms, refused outside them', () => {
    // Acheta domesticus (house cricket): Afrotropic, Indomalaya,
    // Nearctic, Palearctic — listed in the dataset.
    assert.equal(speciesRegionsAllow('Acheta domesticus', 53.95235, -113.11636), true);
    assert.equal(speciesRegionsAllow('Acheta domesticus', 0.5, 113.5), true);
    assert.equal(speciesRegionsAllow('Acheta domesticus', -3.4653, -62.2159), false);
    assert.equal(speciesRegionsAllow('Acheta domesticus', -33.86, 151.2), false);
  });

  it('unrestricted species — and unknown names — are allowed anywhere', () => {
    for (const [lat, lon] of [[53.95, -113.11], [-3.46, -62.21], [-77.85, 166.66], [0, -150]]) {
      assert.equal(speciesRegionsAllow('Dracoderes gallaicus', lat, lon), true);
      assert.equal(speciesRegionsAllow('No Such Species', lat, lon), true);
    }
  });
});
