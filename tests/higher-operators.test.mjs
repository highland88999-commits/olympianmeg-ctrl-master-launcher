// tests/higher-operators.test.mjs
// HIGHER-REALM OPERATOR AGENTS (Merlin, Nov 14 ~22:56 "Yes — all
// realms", behaviour logic Nov 14 ~22:59): the agents that operate
// the creatures of the 11 higher realms — arrivals, sojourn stages,
// passing on, fading, diet, territory, water, habits — all on the
// real clock, as pure functions of (realm, place, species, device
// clock). No stored state, no server, no Earth 4 code touched.
//
// The higher realms spawn no predators and no prey: every kind here
// has diet 'none', so the carnivore branches (fight to the death,
// hunt the user, fight over a corpse) are implemented and evaluated
// but never fire — there is no carnivore in any higher realm's
// roster, no user-as-prey mechanic and no user-death outcome in
// code. Water: every higher realm has a real bright river band;
// the dead gather at its bank and do not drink.
//
// Run: node --test tests/higher-operators.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { makeWorld as makeElysium } from '../lib/elysium/world.js';
import { makeWorld as makeValhalla } from '../lib/valhalla/world.js';
import { makeWorld as makeAaru } from '../lib/aaru/world.js';
import { makeWorld as makeHeaven } from '../lib/heaven/world.js';
import { makeWorld as makeSvarga } from '../lib/svarga/world.js';
import { makeWorld as makeTakamagahara } from '../lib/takamagahara/world.js';
import { makeWorld as makeTirNaNog } from '../lib/tir-na-nog/world.js';
import { makeWorld as makeTlalocan } from '../lib/tlalocan/world.js';
import { makeWorld as makeMayaSky } from '../lib/maya-sky/world.js';
import { makeWorld as makeVyraj } from '../lib/vyraj/world.js';
import { makeWorld as makeTiangong } from '../lib/tiangong/world.js';
import {
  DAY_MS,
  MIN_LIVE_COPIES,
  REALM_KEYS,
  SPECIES,
  speciesFor,
  guardiansFor,
  dietFor,
  territoryFor,
  waterFor,
  lifeFor,
  enrichCreatures,
  areaAt,
  populationFor,
  lifeLineFor,
  growthScale,
} from '../lib/afterlife/operators.js';
// Realm-scoped entry points the scenes import from.
import {
  REALM_KEY as HEAVEN_KEY,
  lifeFor as heavenLifeFor,
  populationFor as heavenPopulation,
} from '../lib/heaven/operators.js';
import { lifeFor as elysiumLifeFor } from '../lib/elysium/operators.js';
import { lifeFor as valhallaLifeFor } from '../lib/valhalla/operators.js';

const HIGHER = [
  ['elysium', 'shades', makeElysium],
  ['valhalla', 'shades', makeValhalla],
  ['aaru', 'shades', makeAaru],
  ['heaven', 'blessed', makeHeaven],
  ['svarga', 'apsaras', makeSvarga],
  ['takamagahara', 'kami', makeTakamagahara],
  ['tir-na-nog', 'fae', makeTirNaNog],
  ['tlalocan', 'drifters', makeTlalocan],
  ['maya-sky', 'drifters', makeMayaSky],
  ['vyraj', 'drifters', makeVyraj],
  ['tiangong', 'drifters', makeTiangong],
];

const NOW = Date.UTC(2026, 11, 14, 12);
const AT = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h);

describe('higher roster (enumerated from code)', () => {
  it('covers exactly the 11 higher realms', () => {
    assert.deepEqual(HIGHER.map(([k]) => k).sort(), [
      'aaru', 'elysium', 'heaven', 'maya-sky', 'svarga', 'takamagahara',
      'tiangong', 'tir-na-nog', 'tlalocan', 'valhalla', 'vyraj',
    ]);
    for (const [key] of HIGHER) assert.ok(REALM_KEYS.includes(key), key);
  });

  it('every higher realm spawns exactly one drifting kind, diet none', () => {
    for (const [key, varName] of HIGHER) {
      const rec = speciesFor(key);
      assert.equal(rec.varName, varName, key);
      assert.equal(rec.diet, 'none', `${key}: the blessed dead do not eat`);
      assert.ok(rec.river, `${key}: a real river band exists in code`);
    }
  });

  it('no higher realm has a guardian or a carnivore at all', () => {
    for (const [key] of HIGHER) assert.deepEqual(guardiansFor(key), [], key);
  });

  it('the blessed stay longer than the damned (sojourn is my call, flagged)', () => {
    for (const [key] of HIGHER) {
      assert.ok(speciesFor(key).sojournDays >= 180, `${key}: ${speciesFor(key).sojournDays}d`);
    }
  });
});

describe('population rule (Merlin, Nov 14 ~22:57)', () => {
  for (const [key, varName, makeWorld] of HIGHER) {
    it(`${key}: 18 copies, 8 + 6 + 4 across all three discs (cap NOT raised)`, () => {
      const w = makeWorld(1337);
      const arr = w[varName];
      assert.equal(arr.length, 18, `${key}: spawner cap stays 18`);
      const byPrefix = {};
      for (const c of arr) byPrefix[c.id[0]] = (byPrefix[c.id[0]] || 0) + 1;
      assert.deepEqual(Object.values(byPrefix).sort((a, b) => a - b), [4, 6, 8]);
      const areas = new Set(arr.map((c) => areaAt(key, c.x, c.z)));
      assert.equal(areas.size, 3, `${key}: copies in all three discs`);
      assert.ok(!areas.has('wilds'));
    });

    it(`${key}: populationFor meets the rule at the fixed clock`, () => {
      const pop = populationFor(key, makeWorld(1337)[varName], NOW);
      assert.equal(pop.total, 18);
      assert.ok(pop.alive >= MIN_LIVE_COPIES, `${key}: ${pop.alive} live`);
      assert.equal(pop.areas.length, 3);
      assert.equal(pop.meetsRule, true);
    });
  }

  it('the realm-scoped wrappers agree with the shared conductor (Heaven)', () => {
    assert.equal(HEAVEN_KEY, 'heaven');
    const pop = heavenPopulation(makeHeaven(1337).blessed, NOW);
    assert.equal(pop.meetsRule, true);
    assert.equal(pop.alive + pop.fading, 18);
    assert.deepEqual(
      heavenLifeFor(null, 'w0', NOW, { x: -160, z: -70 }),
      lifeFor('heaven', null, 'w0', NOW, { x: -160, z: -70 }),
    );
    assert.deepEqual(
      elysiumLifeFor(null, 'w0', NOW, { x: -160, z: -70 }),
      lifeFor('elysium', null, 'w0', NOW, { x: -160, z: -70 }),
    );
    assert.deepEqual(
      valhallaLifeFor(null, 'w0', NOW, { x: -160, z: -70 }),
      lifeFor('valhalla', null, 'w0', NOW, { x: -160, z: -70 }),
    );
  });
});

describe('lifeFor is a pure function of (realm, place, species, clock)', () => {
  for (const [key] of HIGHER) {
    it(`${key}: same inputs, same life; generations turn over`, () => {
      const a = lifeFor(key, null, 'w0', NOW, { x: -160, z: -70 });
      assert.deepEqual(a, lifeFor(key, null, 'w0', NOW, { x: -160, z: -70 }));
      const later = lifeFor(key, null, 'w0', NOW + 5 * 365.25 * DAY_MS, { x: -160, z: -70 });
      assert.ok(later.generation > a.generation, `${key}: ${a.generation} -> ${later.generation}`);
      assert.equal(a.breeding, false, 'the blessed do not breed — new souls arrive');
      assert.equal(a.offspring, 0);
    });
  }
});

describe('death law', () => {
  it('the only death that fires is the sojourn ending', () => {
    for (const [key] of HIGHER) {
      let fading = null;
      for (let d = 0; d < 400 && !fading; d++) {
        const l = lifeFor(key, null, 'w0', NOW + d * DAY_MS, { x: -160, z: -70 });
        if (l.state === 'fading') fading = l;
      }
      assert.ok(fading, `${key}: a soul fades within one sojourn`);
      assert.equal(fading.deathCause, 'sojourn ended — passed on');
      assert.match(lifeLineFor(fading), /^Remains — (Fading|Wisp|Gone)$/);
    }
  });

  it('over ten years every cell still holds exactly one generation', () => {
    for (const [key, varName, makeWorld] of HIGHER) {
      const w = makeWorld(1337);
      for (const t of [NOW, NOW + 365 * DAY_MS, NOW + 10 * 365 * DAY_MS]) {
        const pop = populationFor(key, w[varName], t);
        assert.equal(pop.alive + pop.fading, 18, `${key} at ${new Date(t).toISOString()}`);
        assert.equal(pop.meetsRule, true);
      }
    }
  });
});

describe('diet + territory: the new logic, evaluated against the real rosters', () => {
  it('no higher creature feeds, hungers, or hunts', () => {
    for (const [key] of HIGHER) {
      const rec = speciesFor(key);
      const d = dietFor(rec, `${key}|w0`, NOW, []);
      assert.equal(d.feedingMode, 'does not feed');
      assert.equal(d.hungry, false);
      const t = territoryFor(key, { id: 'w0', diet: 'none', x: -160, z: -70 }, [], true, true);
      assert.equal(t.territorial, false);
      assert.equal(t.fightToDeath, false);
      assert.equal(t.huntsUser, false);
      assert.equal(t.fightsForMeal, false);
      assert.equal(t.fightsOverCorpse, false);
    }
  });

  it('the user-hunt and corpse-fight branches cannot fire here: no carnivore exists to take them', () => {
    // The gates live in territoryFor; with an empty carnivore roster
    // there is no subject for either branch in any higher realm.
    for (const [key] of HIGHER) {
      assert.deepEqual(guardiansFor(key), []);
      const life = lifeFor(key, null, 'w0', NOW, { x: -160, z: -70, userNear: true, userDead: true });
      assert.equal(life.territory.huntsUser, false, key);
      assert.equal(life.territory.fightsOverCorpse, false, key);
      assert.equal(life.territory.userHuntApplies, false, key);
      assert.equal(life.territory.corpseFightApplies, false, key);
    }
  });
});

describe('water: every higher creature seeks its river; none drinks', () => {
  it('the target is always the bright river bank', () => {
    for (const [key] of HIGHER) {
      const rec = speciesFor(key);
      for (const c of [{ x: -160, z: -70 }, { x: 160, z: -70 }, { x: 0, z: -230 }, { x: 0, z: 100 }]) {
        const wt = waterFor(rec, `${key}|w`, c.x, c.z, NOW);
        assert.equal(wt.applies, true, key);
        assert.equal(wt.drinks, false, `${key}: the blessed gather, they do not drink`);
        assert.ok(wt.target.z >= -18 && wt.target.z <= 18, `${key}: bank target`);
        assert.equal(wt.riverName, rec.river.name);
      }
    }
  });

  it('seeking runs on a seeded cycle: every soul seeks sometimes, never always', () => {
    for (const [key] of HIGHER) {
      const rec = speciesFor(key);
      let seeking = 0;
      for (let h = 0; h < 48; h++) {
        if (waterFor(rec, `${key}|w0`, -160, -70, AT(2026, 12, 14) + h * 3600000).seeking) seeking++;
      }
      assert.ok(seeking > 0 && seeking < 48, `${key}: seeking ${seeking}/48h`);
    }
  });
});

describe('tap-card life line + enrich', () => {
  it('lifeLineFor has the Earth 4 shape in every higher realm', () => {
    for (const [key] of HIGHER) {
      let alive = null;
      for (const id of ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7']) {
        const l = lifeFor(key, null, id, NOW, { x: -160, z: -70 });
        if (l.state === 'alive') { alive = l; break; }
      }
      assert.ok(alive, `${key}: some cell alive at the fixed clock`);
      assert.match(lifeLineFor(alive), /^(Newly arrived|Wandering|Old) · (drifting|resting|seeking water)/);
      assert.match(lifeLineFor(alive), /in a group of [2-5]/);
      assert.equal(growthScale(alive), 1);
      assert.equal(SPECIES[key].kind, alive.name);
    }
  });

  it('enrichCreatures adds life to every spawned creature', () => {
    for (const [key, varName, makeWorld] of HIGHER) {
      const enriched = enrichCreatures(makeWorld(1337)[varName], key, NOW);
      assert.equal(enriched.length, 18);
      for (const c of enriched) {
        assert.ok(c.life, `${key}/${c.id}`);
        assert.ok(['alive', 'fading'].includes(c.life.state));
      }
    }
  });
});
