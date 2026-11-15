// tests/nether-operators.test.mjs
// NETHER-REALM OPERATOR AGENTS (Merlin, Nov 14 ~22:56 "Yes — all
// realms", behaviour logic Nov 14 ~22:59): the agents that operate
// the creatures of the 13 nether-realms — births (arrivals), growth,
// death, decomposition (fading), diet, territory, water, habits —
// all on the real clock, as pure functions of (realm, place,
// species, device clock). No stored state, no server, no Earth 4
// code touched (Earth 4 keeps its own laws).
//
// Run: node --test tests/nether-operators.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeWorld as makeHades } from '../lib/nether-realm/world.js';
import { makeWorld as makeHelheim } from '../lib/helheim/world.js';
import { makeWorld as makeYomi } from '../lib/yomi/world.js';
import { makeWorld as makeAnnwn } from '../lib/annwn/world.js';
import { makeWorld as makeDuat } from '../lib/duat/world.js';
import { makeWorld as makeMictlan } from '../lib/mictlan/world.js';
import { makeWorld as makeXibalba } from '../lib/xibalba/world.js';
import { makeWorld as makeHell } from '../lib/hell/world.js';
import { makeWorld as makeNaraka } from '../lib/naraka/world.js';
import { makeWorld as makeDiyu } from '../lib/diyu/world.js';
import { makeWorld as makeKur } from '../lib/kur/world.js';
import { makeWorld as makeNav } from '../lib/nav/world.js';
import { makeWorld as makeOrun } from '../lib/orun/world.js';
import {
  FOUNDING_MS,
  DAY_MS,
  MIN_LIVE_COPIES,
  REALM_KEYS,
  SPECIES,
  GUARDIANS,
  speciesFor,
  guardiansFor,
  arrivalsFor,
  growthFor,
  dietFor,
  territoryFor,
  waterFor,
  activityNow,
  socialFor,
  deathFor,
  lifeFor,
  enrichCreatures,
  areaAt,
  populationFor,
  lifeLineFor,
  growthScale,
} from '../lib/afterlife/operators.js';
// The realm-scoped entry point the scene imports from.
import {
  REALM_KEY as HADES_KEY,
  lifeFor as hadesLifeFor,
  enrichCreatures as hadesEnrich,
  populationFor as hadesPopulation,
} from '../lib/nether-realm/operators.js';

const NETHER = [
  ['nether-realm', 'shades', makeHades],
  ['helheim', 'shades', makeHelheim],
  ['yomi', 'shades', makeYomi],
  ['annwn', 'shades', makeAnnwn],
  ['duat', 'shades', makeDuat],
  ['mictlan', 'shades', makeMictlan],
  ['xibalba', 'shades', makeXibalba],
  ['hell', 'shades', makeHell],
  ['naraka', 'shades', makeNaraka],
  ['diyu', 'shades', makeDiyu],
  ['kur', 'shades', makeKur],
  ['nav', 'wisps', makeNav],
  ['orun', 'spirits', makeOrun],
];

const NOW = Date.UTC(2026, 11, 14, 12); // fixed clock for determinism
const AT = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h);

// --- the roster ------------------------------------------------------------

describe('nether roster (enumerated from code)', () => {
  it('covers exactly the 13 nether-realms', () => {
    assert.deepEqual(NETHER.map(([k]) => k).sort(), [
      'annwn', 'diyu', 'duat', 'helheim', 'hell', 'kur', 'mictlan',
      'naraka', 'nav', 'nether-realm', 'orun', 'xibalba', 'yomi',
    ]);
    for (const [key] of NETHER) assert.ok(REALM_KEYS.includes(key), key);
  });

  it('every nether realm spawns exactly one drifting kind', () => {
    for (const [key, varName] of NETHER) {
      const rec = speciesFor(key);
      assert.equal(rec.varName, varName, key);
      assert.equal(rec.diet, 'none', `${key}: the dead do not eat`);
    }
  });

  it('the operators never import Earth 4 (carve-out: Earth 4 keeps its own laws)', () => {
    const src = readFileSync('lib/afterlife/operators.js', 'utf8');
    assert.ok(!/import[^;]*earth4/.test(src), 'no earth4 import');
    assert.ok(!/require\([^)]*earth4/.test(src), 'no earth4 require');
    assert.ok(!src.includes("from '../earth4"), 'no relative earth4 import');
  });

  it('guardians are the only carnivores, and there is at most one per realm', () => {
    assert.deepEqual(Object.keys(GUARDIANS).sort(), ['duat', 'mictlan', 'nether-realm']);
    assert.equal(GUARDIANS['nether-realm'][0].name, 'Cerberus');
    assert.equal(GUARDIANS['nether-realm'][0].diet, 'carnivore');
    assert.equal(GUARDIANS.duat[0].name, 'Apep');
    assert.equal(GUARDIANS.duat[0].diet, 'carnivore');
    assert.equal(GUARDIANS.mictlan[0].name, 'The Faithful Dog');
    assert.equal(GUARDIANS.mictlan[0].diet, 'none');
  });
});

// --- distribution: the population rule -------------------------------------

describe('population rule (Merlin, Nov 14 ~22:57)', () => {
  for (const [key, varName, makeWorld] of NETHER) {
    it(`${key}: 18 copies, 8 + 6 + 4 across all three discs (cap NOT raised)`, () => {
      const w = makeWorld(1337);
      const arr = w[varName];
      assert.equal(arr.length, 18, `${key}: spawner cap stays 18`);
      const byPrefix = {};
      for (const c of arr) byPrefix[c.id[0]] = (byPrefix[c.id[0]] || 0) + 1;
      assert.deepEqual(Object.values(byPrefix).sort((a, b) => a - b), [4, 6, 8], `${key}: 8 + 6 + 4`);
      const areas = new Set(arr.map((c) => areaAt(key, c.x, c.z)));
      assert.equal(areas.size, 3, `${key}: copies in all three discs, got ${[...areas]}`);
      assert.ok(!areas.has('wilds'), `${key}: no copy outside the discs`);
    });

    it(`${key}: populationFor meets the rule at the fixed clock`, () => {
      const w = makeWorld(1337);
      const pop = populationFor(key, w[varName], NOW);
      assert.equal(pop.total, 18);
      assert.ok(pop.alive >= MIN_LIVE_COPIES, `${key}: ${pop.alive} live < ${MIN_LIVE_COPIES}`);
      assert.equal(pop.areas.length, 3, `${key}: live copies in ${pop.areas.length} areas`);
      assert.equal(pop.meetsRule, true, `${key}: ${JSON.stringify(pop)}`);
    });
  }

  it('the realm-scoped wrapper reports the same population (Hades)', () => {
    assert.equal(HADES_KEY, 'nether-realm');
    const pop = hadesPopulation(makeHades(1337).shades, NOW);
    assert.equal(pop.meetsRule, true);
    assert.equal(pop.alive + pop.fading, 18, 'every cell holds exactly one generation');
  });
});

// --- the conductor: deterministic life -------------------------------------

describe('lifeFor is a pure function of (realm, place, species, clock)', () => {
  for (const [key] of NETHER) {
    it(`${key}: same inputs, same life; the clock moves it on`, () => {
      const a = lifeFor(key, null, 'a0', NOW, { x: -160, z: -70 });
      const b = lifeFor(key, null, 'a0', NOW, { x: -160, z: -70 });
      assert.deepEqual(a, b);
      const later = lifeFor(key, null, 'a0', NOW + 5 * 365.25 * DAY_MS, { x: -160, z: -70 });
      assert.ok(later.generation > a.generation, `${key}: generations turn over, ${a.generation} -> ${later.generation}`);
      assert.ok(['alive', 'fading'].includes(later.state));
    });
  }

  it('the dead do not breed: new souls arrive, nothing is born', () => {
    for (const [key] of NETHER) {
      const rec = speciesFor(key);
      assert.deepEqual(arrivalsFor(rec), {
        breeding: false, offspring: 0, arrivalsPerCycle: 1,
        season: 'year-round — the dead arrive daily',
      });
      const life = lifeFor(key, null, 'a0', NOW, { x: -160, z: -70 });
      assert.equal(life.breeding, false);
      assert.equal(life.offspring, 0);
    }
  });

  it('souls arrive full-formed: growth is the sojourn itself', () => {
    const rec = speciesFor('nether-realm');
    assert.equal(growthFor(rec, 0).stageName, 'Newly arrived');
    assert.equal(growthFor(rec, 45).stageName, 'Wandering');
    assert.equal(growthFor(rec, 89).stageName, 'Old');
    assert.equal(growthFor(rec, 45).sizeM, 2.4);
  });

  it('the realm-scoped wrapper matches the shared conductor', () => {
    const a = hadesLifeFor(null, 'a0', NOW, { x: -160, z: -70 });
    const b = lifeFor('nether-realm', null, 'a0', NOW, { x: -160, z: -70 });
    assert.deepEqual(a, b);
  });
});

// --- death law ---------------------------------------------------------------

describe('death law', () => {
  it('the only death that fires is the sojourn ending — never a fight', () => {
    for (const [key] of NETHER) {
      const rec = speciesFor(key);
      // No rival in range: the fight branch is real logic that never fires.
      const d = deathFor(rec, 'a0', FOUNDING_MS, false);
      assert.equal(d.cause, 'sojourn ended — passed on');
      assert.equal(d.deathMs, FOUNDING_MS + rec.sojournDays * DAY_MS);
    }
  });

  it('over ten years every cell still holds exactly one generation', () => {
    for (const [key, varName, makeWorld] of NETHER) {
      const w = makeWorld(1337);
      for (const t of [NOW, NOW + 365 * DAY_MS, NOW + 10 * 365 * DAY_MS]) {
        const pop = populationFor(key, w[varName], t);
        assert.equal(pop.alive + pop.fading, 18, `${key} at ${new Date(t).toISOString()}`);
        assert.equal(pop.meetsRule, true);
      }
    }
  });

  it('guardians are eternal: no death, no generation turnover', () => {
    const cerb = lifeFor('nether-realm', 'Cerberus', 'cerberus', NOW);
    assert.equal(cerb.state, 'eternal');
    assert.equal(cerb.deathEpochMs, null);
    assert.equal(cerb.deathCause, null);
    const far = lifeFor('nether-realm', 'Cerberus', 'cerberus', NOW + 50 * 365 * DAY_MS);
    assert.equal(far.state, 'eternal');
    assert.equal(far.generation, 0);
    const apep = lifeFor('duat', 'Apep', 'apep', NOW);
    assert.equal(apep.state, 'eternal');
    const dog = lifeFor('mictlan', 'The Faithful Dog', 'faithful-dog', NOW);
    assert.equal(dog.state, 'eternal');
  });
});

// --- diet drives feeding -----------------------------------------------------

describe('diet agent (Merlin, Nov 14 ~22:59)', () => {
  it('the drifting dead do not feed and never hunger', () => {
    for (const [key] of NETHER) {
      const rec = speciesFor(key);
      const d = dietFor(rec, `${key}|a0`, NOW, []);
      assert.equal(d.diet, 'none');
      assert.equal(d.feedingMode, 'does not feed');
      assert.equal(d.hungry, false);
    }
  });

  it('Cerberus is a carnivore — but with no prey in the realm the hunt never fires', () => {
    const cerb = GUARDIANS['nether-realm'][0];
    const d = dietFor(cerb, 'nether-realm|cerberus', NOW, []);
    assert.equal(d.diet, 'carnivore');
    assert.equal(d.preyCount, 0);
    assert.match(d.feedingMode, /no prey in this realm/);
    const apep = dietFor(GUARDIANS.duat[0], 'duat|apep', NOW, []);
    assert.equal(apep.diet, 'carnivore');
    assert.equal(apep.preyCount, 0);
  });

  it('the Faithful Dog does not hunt (code role: helps the dead cross)', () => {
    const d = dietFor(GUARDIANS.mictlan[0], 'mictlan|faithful-dog', NOW, []);
    assert.equal(d.feedingMode, 'does not feed');
  });
});

// --- territory: fight to the death, user hunt, corpse fight -------------------

describe('territory agent (Merlin, Nov 14 ~22:59)', () => {
  it('drift kinds are not territorial', () => {
    for (const [key] of NETHER) {
      const t = territoryFor(key, { id: 'a0', diet: 'none', x: -160, z: -70 }, [], true, true);
      assert.equal(t.territorial, false);
      assert.equal(t.fightToDeath, false);
      assert.equal(t.huntsUser, false);
    }
  });

  it('Cerberus has no rival in range, so no fight to the death ever fires', () => {
    const cerb = GUARDIANS['nether-realm'][0];
    const t = territoryFor('nether-realm', cerb, guardiansFor('nether-realm'), false, false);
    assert.equal(t.territorial, true);
    assert.deepEqual(t.rivals, []);
    assert.equal(t.fightToDeath, false);
    assert.equal(t.territory.name, 'The Gates');
  });

  it('user-hunt branch: OFF in every nether realm — no user-as-prey mechanic in code', () => {
    for (const [key] of NETHER) {
      const guards = guardiansFor(key);
      for (const g of guards) {
        const t = territoryFor(key, g, guards, true, true);
        assert.equal(t.userHuntApplies, false, `${key}/${g.id}`);
        assert.equal(t.huntsUser, false, `${key}/${g.id}: never hunts the user even when near`);
        assert.equal(t.fightsForMeal, false);
        if (g.diet === 'carnivore') assert.match(t.userHuntReason, /no user-as-prey mechanic/);
      }
    }
  });

  it('corpse-fight branch: OFF in every nether realm — no user-death outcome in code', () => {
    for (const [key] of NETHER) {
      for (const g of guardiansFor(key)) {
        const t = territoryFor(key, g, guardiansFor(key), false, true);
        assert.equal(t.corpseFightApplies, false, `${key}/${g.id}`);
        assert.equal(t.fightsOverCorpse, false);
        if (g.diet === 'carnivore') assert.match(t.corpseFightReason, /no user-death outcome/);
      }
    }
  });
});

// --- water: every creature seeks it; lava is NOT water ------------------------

describe('water agent (Merlin, Nov 14 ~22:59)', () => {
  it('the target is always the real river bank — never a lava pool', () => {
    for (const [key, , makeWorld] of NETHER) {
      if (key === 'annwn') continue; // no water: see below
      const rec = speciesFor(key);
      const w = makeWorld(1337);
      // Lava pools keep |z| > 30 (farFrom in world.js); the bank is |z| = 18.
      const lava = w.lavaPools || [];
      for (const c of [{ x: -160, z: -70 }, { x: 160, z: -70 }, { x: 0, z: -230 }, { x: 0, z: 100 }]) {
        const wt = waterFor(rec, `${key}|t`, c.x, c.z, NOW);
        assert.equal(wt.applies, true, key);
        assert.equal(wt.drinks, false, `${key}: the dead gather, they do not drink`);
        assert.ok(wt.target.z >= -18 && wt.target.z <= 18, `${key}: target on the bank, got z=${wt.target.z}`);
        for (const p of lava) {
          assert.ok(Math.hypot(wt.target.x - p.x, wt.target.z - p.z) > p.r,
            `${key}: water target inside a lava pool`);
        }
      }
    }
  });

  it('blood rivers are still the bank — but nothing drinks blood', () => {
    for (const key of ['xibalba', 'hell', 'naraka']) {
      const rec = speciesFor(key);
      assert.equal(rec.river.blood, true, key);
      const wt = waterFor(rec, `${key}|t`, -160, -70, NOW);
      assert.equal(wt.drinks, false);
      assert.match(wt.drinkReason, /blood/);
    }
  });

  it('Annwn has no water at all — the branch does not apply', () => {
    const rec = speciesFor('annwn');
    assert.equal(rec.river, null);
    const wt = waterFor(rec, 'annwn|t', -160, -70, NOW);
    assert.equal(wt.applies, false);
    assert.equal(wt.target, null);
    assert.match(wt.reason, /mist, not a river/);
  });

  it('seeking runs on a seeded cycle: every soul seeks sometimes, never always', () => {
    for (const [key] of NETHER) {
      if (key === 'annwn') continue;
      const rec = speciesFor(key);
      let seeking = 0;
      for (let h = 0; h < 48; h++) {
        if (waterFor(rec, `${key}|a0`, -160, -70, AT(2026, 12, 14) + h * 3600000).seeking) seeking++;
      }
      assert.ok(seeking > 0 && seeking < 48, `${key}: seeking ${seeking}/48h`);
    }
  });

  it('Apep already lives in the water; Cerberus never travels to it', () => {
    const apep = lifeFor('duat', 'Apep', 'apep', NOW);
    assert.equal(apep.water.drinkReason, 'lives in the water');
    assert.equal(apep.water.seeking, false);
    const cerb = lifeFor('nether-realm', 'Cerberus', 'cerberus', NOW);
    assert.equal(cerb.water.seeking, false, 'a guardian stands its post');
  });
});

// --- habits, tap-card line, enrich -------------------------------------------

describe('habits, tap-card life line, enrich', () => {
  it('activity is drifting by day, resting by night, seeking water on the cycle', () => {
    const rec = speciesFor('nether-realm');
    const seen = new Set();
    for (let h = 0; h < 48; h++) {
      const now = new Date(AT(2026, 12, 14) + h * 3600000);
      const wt = waterFor(rec, 'nether-realm|a0', -160, -70, now.getTime());
      seen.add(activityNow(rec, 'nether-realm|a0', -160, -70, now, wt));
    }
    assert.ok(seen.has('drifting'));
    assert.ok(seen.has('resting'));
    assert.ok(seen.has('seeking water'));
    assert.ok(!seen.has('feeding'), 'nothing here feeds');
  });

  it('social group size is display-only, 2–5', () => {
    for (const [key] of NETHER) {
      const s = socialFor(speciesFor(key), `${key}|a0`);
      assert.ok(s.groupSize >= 2 && s.groupSize <= 5);
      assert.equal(s.behaviour, 'Drifts in loose groups');
    }
  });

  it('lifeLineFor has the Earth 4 shape', () => {
    // Cell a0 happens to be fading at the fixed clock — find a live one.
    let alive = null;
    for (const id of ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) {
      const l = lifeFor('nether-realm', null, id, NOW, { x: -160, z: -70 });
      if (l.state === 'alive') { alive = l; break; }
    }
    assert.ok(alive, 'some cell is alive at the fixed clock');
    assert.match(lifeLineFor(alive), /^(Newly arrived|Wandering|Old) · (drifting|resting|seeking water)/);
    assert.match(lifeLineFor(alive), /in a group of [2-5]/);
    assert.equal(growthScale(alive), 1);
    // Find a fading soul by scanning forward: every cell fades once a sojourn.
    let fading = null;
    for (let d = 0; d < 400 && !fading; d++) {
      const l = lifeFor('nether-realm', null, 'a0', NOW + d * DAY_MS, { x: -160, z: -70 });
      if (l.state === 'fading') fading = l;
    }
    assert.ok(fading, 'a fading soul shows up within one sojourn');
    assert.match(lifeLineFor(fading), /^Remains — (Fading|Wisp|Gone)$/);
    assert.ok(growthScale(fading) >= 0.3 && growthScale(fading) <= 1);
    assert.equal(lifeLineFor(lifeFor('nether-realm', 'Cerberus', 'cerberus', NOW)), 'Cerberus · guarding — The Gates');
    assert.equal(lifeLineFor(lifeFor('duat', 'Apep', 'apep', NOW)), 'Apep · lurking — The Dark Waters');
    assert.equal(lifeLineFor(null), '');
  });

  it('enrichCreatures adds life to every spawned creature and never throws', () => {
    for (const [key, varName, makeWorld] of NETHER) {
      const enriched = enrichCreatures(makeWorld(1337)[varName], key, NOW);
      assert.equal(enriched.length, 18);
      for (const c of enriched) {
        assert.ok(c.life, `${key}/${c.id}`);
        assert.ok(['alive', 'fading'].includes(c.life.state));
        assert.equal(c.life.realm, key);
      }
    }
    assert.deepEqual(enrichCreatures([], 'nether-realm', NOW), []);
    assert.equal(enrichCreatures(null, 'nether-realm', NOW), null);
    assert.deepEqual(enrichCreatures([{ id: 'a0', x: 0, z: 0 }], 'no-such-realm', NOW), [{ id: 'a0', x: 0, z: 0 }]);
    // The Hades wrapper enriches the same way.
    assert.equal(hadesEnrich(makeHades(1337).shades, NOW).length, 18);
  });

  it('what was deliberately NOT built stays unbuilt', () => {
    const src = readFileSync('lib/afterlife/operators.js', 'utf8');
    for (const word of ['hydra', 'ferry', 'fare', 'gold', 'ruin']) {
      assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(src), `no ${word} system in the operators`);
    }
  });
});
