// tests/earth4-operators.test.mjs
// EARTH 4 — OPERATOR AGENTS (Merlin, Nov 14 ~17:13): the agents that
// operate the species — births, growth, deaths, decomposition, diets,
// habits — all on the real clock, population controlled by TIME only,
// no hunting, no other cause of death.
//
// Run: node --test tests/earth4-operators.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SPECIES_CATALOGUE } from '../lib/earth4/species-catalogue.js';
import {
  SPECIES_LIFE,
  LIFE_STAGES,
  LIFE_DECOMP_STAGES,
  LIFE_DIETS,
  LIFE_GUTS,
} from '../lib/earth4/species-life.js';
import {
  inSeasonMask,
  nextSeasonStartMs,
  localHour,
  utcMonth,
} from '../lib/earth4/life-clock.js';
import {
  FOUNDING_MS,
  DAY_MS,
  YEAR_MS,
  lifeRecordFor,
  breedingSeasonNow,
  growthFor,
  activityNow,
  socialFor,
  migrationFor,
  lifeFor,
  enrichCreatures,
  growthScale,
} from '../lib/earth4/operators.js';
import { creaturesNear } from '../lib/earth4/spawner.js';

const WHALE = 'Balaenoptera bonaerensis';
const GINKGO = 'Ginkgo biloba';
const REDWATER = { lat: 53.95235, lon: -113.11636 };
const FLAT_GROUND = {
  heightAt: () => 0,
  isWater: () => false,
};

function at(y, m, d, h = 12) {
  return new Date(Date.UTC(y, m - 1, d, h));
}

// Local-time twin of `at`: activity reads the device's LOCAL hour, so
// hour-specific assertions must construct the instant in local time —
// a UTC instant reads 5 hours earlier under America/Resolute (CDT).
function atLocal(y, m, d, h = 12) {
  return new Date(y, m - 1, d, h);
}

describe('life-clock', () => {
  it('inSeasonMask reads the named season in the north', () => {
    const summer = 0b01110000; // Jun, Jul, Aug bits
    assert.equal(inSeasonMask(summer, 53, 7), true);
    assert.equal(inSeasonMask(summer, 53, 1), false);
  });

  it('inSeasonMask rotates six months in the south', () => {
    const summer = 0b01110000; // "summer"
    assert.equal(inSeasonMask(summer, -33, 1), true); // January is summer in Sydney
    assert.equal(inSeasonMask(summer, -33, 7), false);
  });

  it('the whale breeds in austral summer: January south, July north', () => {
    const rec = lifeRecordFor(WHALE);
    assert.equal(breedingSeasonNow(rec, -60, at(2026, 1, 15)), true);
    assert.equal(breedingSeasonNow(rec, -60, at(2026, 7, 15)), false);
    assert.equal(breedingSeasonNow(rec, 53, at(2026, 7, 15)), true);
    assert.equal(breedingSeasonNow(rec, 53, at(2026, 1, 15)), false);
  });

  it('nextSeasonStartMs lands on the next in-season 1st, never before fromMs', () => {
    const summer = 0b01110000;
    assert.equal(
      nextSeasonStartMs(summer, 53, Date.UTC(2026, 5, 15)).toString(),
      Date.UTC(2026, 6, 1).toString(),
    );
    assert.equal(
      nextSeasonStartMs(0xFFF, 53, Date.UTC(2026, 5, 15)).toString(),
      Date.UTC(2026, 6, 1).toString(),
    );
    assert.equal(
      nextSeasonStartMs(summer, 53, Date.UTC(2026, 6, 1)).toString(),
      Date.UTC(2026, 6, 1).toString(),
    );
  });

  it('localHour and utcMonth read the device clock', () => {
    assert.equal(localHour(atLocal(2026, 6, 1, 13)), 13);
    assert.equal(utcMonth(at(2026, 6, 1)), 6);
  });
});

describe('compiled life data', () => {
  it('covers every catalogue species exactly once, by exact name', () => {
    const names = SPECIES_CATALOGUE.map((s) => s.name);
    assert.equal(Object.keys(SPECIES_LIFE).length, 2408);
    for (const n of names) assert.ok(SPECIES_LIFE[n], `missing ${n}`);
    for (const n of Object.keys(SPECIES_LIFE)) assert.ok(names.includes(n), `extra ${n}`);
  });

  it('every record is numerically sane', () => {
    for (const [name, r] of Object.entries(SPECIES_LIFE)) {
      assert.ok(r.lif > 0, `${name} lifespan`);
      assert.ok(r.ttA > 0, `${name} time to adult`);
      assert.ok(r.adS > 0, `${name} adult size`);
      assert.ok(r.bS > 0 && r.bS <= r.adS, `${name} birth size ${r.bS} vs adult ${r.adS}`);
      assert.ok(r.dec > 0, `${name} decomposition days`);
      assert.ok(r.mat > 0, `${name} maturity`);
      assert.equal(r.src.length, 14, `${name} src flags`);
      assert.ok(/^[LETDC-]+$/.test(r.src), `${name} src alphabet`);
      const [slp, fed, mov, rst, oth] = r.hrs;
      assert.ok(Math.abs(fed + mov + rst + oth - 24) < 0.01, `${name} budget sums to 24h`);
      assert.ok(slp <= rst + 0.01, `${name} sleep inside resting`);
      assert.ok(LIFE_STAGES[r.stg] && LIFE_STAGES[r.stg].length >= 2, `${name} growth stages`);
      assert.ok(LIFE_DECOMP_STAGES[r.dstg], `${name} decomp stages`);
      assert.ok(LIFE_DIETS[r.die], `${name} diet`);
      assert.ok(LIFE_GUTS[r.gut] !== undefined, `${name} gut`);
    }
  });

  it('spot-checks: whale and ginkgo carry their listed values', () => {
    const w = SPECIES_LIFE[WHALE];
    assert.equal(w.ges, 304.4);
    assert.equal(w.mat, 2740);
    assert.equal(w.lif, 73);
    assert.equal(w.adS, 8.75);
    assert.equal(w.dec, 455);
    const g = SPECIES_LIFE[GINKGO];
    assert.equal(g.lif, 2250);
    assert.equal(g.adS, 20);
    assert.equal(g.dec, 4560);
  });
});

describe('conductor: deterministic life timelines', () => {
  it('same name, cell and clock -> identical life', () => {
    const a = lifeFor(WHALE, '100,200', at(2026, 11, 14, 12), 53);
    const b = lifeFor(WHALE, '100,200', at(2026, 11, 14, 12), 53);
    assert.deepEqual(a, b);
  });

  it('different cells seed different lives', () => {
    const ages = new Set();
    for (let i = 0; i < 10; i++) {
      ages.add(lifeFor(WHALE, `${100 + i},200`, at(2026, 11, 14, 12), 53).ageDays);
    }
    assert.ok(ages.size > 1, 'cells should seed different ages');
  });

  it('every creature is alive at founding (age < lifespan by construction)', () => {
    for (const s of SPECIES_CATALOGUE.slice(0, 200)) {
      const life = lifeFor(s.name, '100,200', new Date(FOUNDING_MS), 53);
      assert.equal(life.state, 'alive', `${s.name} at founding`);
    }
  });

  it('a short-lived species turns over: death, decomposition, rebirth', () => {
    // The shortest-lived species in the catalogue.
    let short = null;
    for (const [name, r] of Object.entries(SPECIES_LIFE)) {
      if (!short || r.lif < short[1].lif) short = [name, r];
    }
    const [name, rec] = short;
    const cell = '7,7';
    const atFounding = lifeFor(name, cell, new Date(FOUNDING_MS), 53);
    assert.equal(atFounding.state, 'alive');
    // Far past one full cycle: at least generation 1, still alive or decomposing.
    const far = FOUNDING_MS + 3 * (rec.lif * YEAR_MS + rec.dec * DAY_MS) + 400 * DAY_MS;
    const later = lifeFor(name, cell, new Date(far), 53);
    assert.ok(later.generation >= 1, `${name} generation ${later.generation}`);
    assert.ok(['alive', 'decomposing'].includes(later.state));
    // Inside the death window the state is decomposing, never anything else.
    const deathMs = FOUNDING_MS - atFounding.ageDays * DAY_MS + rec.lif * YEAR_MS;
    const mid = lifeFor(name, cell, new Date(deathMs + rec.dec * DAY_MS * 0.5), 53);
    assert.equal(mid.state, 'decomposing');
    assert.ok(mid.decompFraction > 0 && mid.decompFraction <= 1);
    assert.ok(mid.decompStageName);
  });

  it('death has one cause only: the state is alive or decomposing, never hunted', () => {
    for (const s of SPECIES_CATALOGUE) {
      const life = lifeFor(s.name, '3,3', at(2027, 6, 1, 12), 53);
      assert.ok(['alive', 'decomposing'].includes(life.state), s.name);
      assert.equal(life.deathEpochMs === null, life.state === 'alive');
    }
  });

  it('lifeFor never throws for any catalogue species at any sampled date', () => {
    for (const s of SPECIES_CATALOGUE) {
      for (const d of [at(2026, 11, 14), at(2027, 1, 1), at(2030, 6, 1), at(2050, 1, 1)]) {
        const life = lifeFor(s.name, '9,9', d, -33);
        assert.ok(life && life.name === s.name);
      }
    }
  });

  it('an unknown name falls back instead of throwing', () => {
    const life = lifeFor('No such species', '1,1', at(2026, 11, 14, 12), 0);
    assert.equal(life.state, 'alive');
    assert.equal(life.lifespanYears, 1);
  });
});

describe('growth agent', () => {
  it('a newborn is at birth size in the first stage; an adult is full size', () => {
    const rec = lifeRecordFor(WHALE);
    const born = growthFor(rec, 0);
    assert.equal(born.sizeM, rec.bS);
    assert.equal(born.stageIndex, 0);
    const adult = growthFor(rec, rec.ttA);
    assert.equal(adult.sizeM, rec.adS);
    assert.equal(adult.stageIndex, adult.stages.length - 1);
    assert.equal(adult.stageName, 'adult');
  });

  it('growth is monotonic and the ginkgo takes 3,650 days to mature', () => {
    const rec = lifeRecordFor(GINKGO);
    let prev = -1;
    for (const age of [0, 100, 1000, 2000, 3650]) {
      const g = growthFor(rec, age);
      assert.ok(g.sizeM >= prev, `size at ${age}d`);
      prev = g.sizeM;
    }
    assert.equal(growthFor(rec, 3650).stageName, 'mature (flowering/fruiting)');
  });

  it('growthScale floors hatchlings so they still read', () => {
    assert.equal(growthScale({ state: 'alive', sizeM: 0.01, adultSizeM: 8.75 }), 0.15);
    assert.equal(growthScale({ state: 'alive', sizeM: 8.75, adultSizeM: 8.75 }), 1);
    assert.equal(growthScale({ state: 'decomposing', sizeM: 1, adultSizeM: 1 }), 1);
  });
});

describe('habits agent', () => {
  it('a diurnal animal feeds by day and sleeps at night', () => {
    const rec = lifeRecordFor(WHALE); // Diurnal, sleep 6, feeding 10
    assert.equal(activityNow(rec, '1,1|whale', atLocal(2026, 6, 1, 12)), 'feeding');
    assert.equal(activityNow(rec, '1,1|whale', atLocal(2026, 6, 1, 2)), 'sleeping');
  });

  it('a nocturnal animal is the mirror image', () => {
    // Find a listed nocturnal species with sleep > 0.
    const name = Object.keys(SPECIES_LIFE).find(
      (n) => SPECIES_LIFE[n].act === 'Nocturnal' && SPECIES_LIFE[n].hrs[0] > 0,
    );
    const rec = lifeRecordFor(name);
    // Active at night (feeding first, from dusk), asleep by day.
    assert.equal(activityNow(rec, '2,2|n', atLocal(2026, 6, 1, 19)), 'feeding');
    assert.ok(['feeding', 'moving', 'other'].includes(
      activityNow(rec, '2,2|n', atLocal(2026, 6, 1, 2)),
    ));
    assert.equal(activityNow(rec, '2,2|n', atLocal(2026, 6, 1, 12)), 'sleeping');
  });

  it('plants never sleep: continuous activity, feeding by day', () => {
    const rec = lifeRecordFor(GINKGO);
    assert.equal(activityNow(rec, '3,3|g', atLocal(2026, 6, 1, 12)), 'feeding');
    assert.notEqual(activityNow(rec, '3,3|g', atLocal(2026, 6, 1, 2)), 'sleeping');
  });

  it('activity is deterministic for the same cell and hour', () => {
    const rec = lifeRecordFor(WHALE);
    assert.equal(
      activityNow(rec, '5,5|w', atLocal(2026, 6, 1, 9)),
      activityNow(rec, '5,5|w', atLocal(2026, 6, 1, 9)),
    );
  });

  it('social groups: pairs are 2, colonies are many, solitaries are 1', () => {
    assert.equal(socialFor({ soc: 'Pair' }, 'k').groupSize, 2);
    assert.equal(socialFor({ soc: 'Solitary' }, 'k').groupSize, 1);
    const colony = socialFor({ soc: 'Colonial' }, 'k');
    assert.ok(colony.groupSize >= 5 && colony.groupSize <= 29);
  });

  it('migratory species flag migrating in spring/autumn and roam wider', () => {
    const mig = migrationFor({ mig: 'Migratory' }, 53, 4);
    assert.equal(mig.migrating, true);
    assert.equal(mig.roam, 3);
    assert.equal(migrationFor({ mig: 'Migratory' }, 53, 7).migrating, false);
    assert.equal(migrationFor({ mig: 'Non-migratory' }, 53, 4).roam, 1);
  });
});

describe('spawner enrichment', () => {
  it('every creature near Redwater gets a life, and the mix is sane', () => {
    const near = creaturesNear(REDWATER, 0, 0, 250, FLAT_GROUND);
    assert.ok(near.length > 20, `expected dozens near Redwater, got ${near.length}`);
    enrichCreatures(near, at(2026, 11, 14, 12));
    let alive = 0;
    let decomposing = 0;
    for (const c of near) {
      assert.ok(c.life, `${c.name} has a life`);
      assert.ok(['alive', 'decomposing'].includes(c.life.state));
      assert.ok(c.life.sizeM > 0 && c.life.sizeM <= c.life.adultSizeM + 0.001);
      assert.ok(c.life.activity);
      assert.ok(c.life.diet);
      if (c.life.state === 'alive') alive++;
      else decomposing++;
    }
    // Most cells hold a living creature; remains are the minority.
    assert.ok(alive > near.length * 0.8, `alive ${alive}/${near.length}`);
    assert.ok(decomposing < near.length * 0.2, `decomposing ${decomposing}/${near.length}`);
  });

  it('enrichment is idempotent and tolerates bad input', () => {
    assert.deepEqual(enrichCreatures(null), null);
    assert.deepEqual(enrichCreatures([]), []);
    const out = enrichCreatures([{ name: WHALE, cell: '1,1', lat: 53 }], at(2026, 11, 14, 12));
    assert.equal(out[0].life.name, WHALE);
    enrichCreatures(out, at(2026, 11, 14, 12));
    assert.equal(out[0].life.name, WHALE);
  });
});
