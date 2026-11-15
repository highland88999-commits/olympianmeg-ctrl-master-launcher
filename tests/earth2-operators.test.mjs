// tests/earth2-operators.test.mjs
// EARTH 2 — OPERATOR AGENTS (Merlin, Nov 14 ~22:56 / behaviour
// logic Nov 14 ~22:59): diet-driven feeding, territorial duels,
// user-hunt + corpse contest, water-seeking, the coded death
// law (predation / guardian / hunter / blood-sac / duel — age
// never kills), and the population rule (≥ 2 copies, spread
// over ≥ 2 anchors).
//
// Run: node --test tests/earth2-operators.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { worldCreatures } from '../lib/earth2/world.js';
import {
  EARTH2_MODEL_BY_SLUG,
} from '../lib/earth2/models.js';
import {
  NEST_SPECIES,
  nestEggCount,
  growthStage,
  canHatchMore,
  eggIsCold,
  EGG_VIABLE_MS,
} from '../lib/earth2/breeding.js';
import {
  HUNT,
  pickPreyTarget,
  pickGuardianTarget,
  dinoHitPoints,
} from '../lib/earth2/behaviour.js';
import {
  MIN_COPIES,
  SPREAD_MIN_M,
  TERRITORY_R_M,
  entryFor,
  breedingFor,
  growthForRaised,
  deathFor,
  feedingDecision,
  territoryDecision,
  duelOutcome,
  waterDecision,
  activityNow,
  groupFor,
  lifeFor,
  lifeLine,
  enrichCreatures,
  companionLifeFor,
  populationReport,
  populationExtras,
  bayExtras,
  swarmReport,
} from '../lib/earth2/operators.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
const REX = EARTH2_MODEL_BY_SLUG.get('tyrannosaurus-rex');
const TRIKE = EARTH2_MODEL_BY_SLUG.get('triceratops');
const GAL = EARTH2_MODEL_BY_SLUG.get('gallimimus');

function walker(x, z, immune = false) {
  return { id: 'walker', isWalker: true, x, z, alive: true, walkerImmune: immune };
}

describe('deterministic life', () => {
  it('same place + time = same state on two calls', () => {
    const c = { slug: 'triceratops', copy: 0, x: 10, z: 20, parcelIndex: 5 };
    const a = lifeFor(c, T0);
    const b = lifeFor(c, T0);
    assert.deepEqual(a, b);
    assert.equal(a.realm, 'earth2');
    assert.equal(a.state, 'alive');
    assert.equal(a.stageName, 'Adult');
  });

  it('the same creature at noon and at midnight lives differently (clock moves the life)', () => {
    // Local-time construction: activity reads the device's LOCAL hour.
    const c = { slug: 'triceratops', copy: 0, x: 10, z: 20, parcelIndex: 5 };
    const noon = lifeFor(c, new Date(2026, 10, 14, 12, 0, 0));
    const midnight = lifeFor(c, new Date(2026, 10, 14, 2, 0, 0));
    assert.equal(noon.activity, 'graze');
    assert.ok(midnight.activity === 'sleep' || midnight.activity === 'alert');
    assert.equal(noon.night, false);
    assert.equal(midnight.night, true);
  });

  it('enrichCreatures adds life without dropping creatures', () => {
    const list = worldCreatures().slice(0, 5);
    const out = enrichCreatures(list, T0);
    assert.equal(out.length, 5);
    for (const c of out) assert.ok(c.life && typeof c.life.line === 'string');
  });
});

describe('death law (from code — age never kills)', () => {
  it('a wild dino with no kill stays alive forever on the clock', () => {
    const c = { slug: 'triceratops', copy: 0, x: 0, z: 0 };
    const farFuture = lifeFor(c, T0 + 100 * 365.25 * 86400000);
    assert.equal(farFuture.state, 'alive');
    assert.equal(farFuture.deathCause, null);
  });

  it('a lifecycle kill records the coded cause + carcass + far respawn', () => {
    const d = deathFor(
      { slug: 'triceratops', copy: 0 },
      { status: 'dead', cause: 'predation', killerSlug: 'tyrannosaurus-rex', diedAt: 1000, nowS: 1010 },
    );
    assert.equal(d.state, 'dead');
    assert.equal(d.cause, 'predation');
    assert.equal(d.carcass.lingerS, 55);
    assert.equal(d.carcass.respawnAt, 1040);
    assert.ok(d.carcass.sinkFraction >= 0 && d.carcass.sinkFraction <= 1);
  });

  it('every coded death cause is accepted; an unknown cause falls back to predation', () => {
    for (const cause of ['predation', 'guardian', 'hunter', 'blood-sac', 'territorial-duel']) {
      assert.equal(deathFor({ slug: 'x' }, { status: 'dead', cause }).cause, cause);
    }
    assert.equal(deathFor({ slug: 'x' }, { status: 'dead', cause: 'old-age' }).cause, 'predation');
  });

  it('a raised / allied dino never dies', () => {
    const ally = { slug: 'velociraptor', isAlly: true, bornAt: T0 - 86400000 };
    assert.equal(deathFor(ally, { status: 'dead', cause: 'predation' }).state, 'alive');
    const life = lifeFor(ally, T0);
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, 'none');
  });

  it('gunplay HP law is untouched: 2 shots tiny, up to 8 big', () => {
    assert.equal(dinoHitPoints(EARTH2_MODEL_BY_SLUG.get('compsognathus')), 2);
    assert.equal(dinoHitPoints(REX), 7); // 12.3 m: 3 + floor(10.3 / 2.5)
    assert.equal(dinoHitPoints(EARTH2_MODEL_BY_SLUG.get('spinosaurus-rex')), 8);
  });
});

describe('diet drives feeding', () => {
  it('hungry carnivore hunts — the user first when vulnerable', () => {
    const nearby = [
      walker(5, 0, false),
      { id: 'prey-1', creature: true, prey: true, alive: true, x: 8, z: 0, slug: 'triceratops' },
    ];
    const f = feedingDecision(REX, { hunger: 0.9, thirst: 0.1 }, { nearby, x: 0, z: 0, id: 'rex-1', nowMs: T0 });
    assert.equal(f.action, 'hunt-user');
    assert.equal(f.target, 'walker');
    // The coded target picker agrees (USER FIRST).
    assert.equal(pickPreyTarget({ x: 0, z: 0, id: 'rex-1' }, nearby).isWalker, true);
  });

  it('hungry carnivore with an immune walker hunts dino prey instead', () => {
    const nearby = [
      walker(5, 0, true),
      { id: 'prey-1', creature: true, prey: true, alive: true, x: 8, z: 0, slug: 'triceratops' },
    ];
    const f = feedingDecision(REX, { hunger: 0.9, thirst: 0.1 }, { nearby, x: 0, z: 0, id: 'rex-1', nowMs: T0 });
    assert.equal(f.action, 'hunt-prey');
    assert.equal(f.target, 'triceratops');
  });

  it('a fed carnivore does not hunt', () => {
    const f = feedingDecision(REX, { hunger: 0.1, thirst: 0.1 }, { nearby: [walker(5, 0, false)], x: 0, z: 0, nowMs: T0 });
    assert.notEqual(f.action, 'hunt-user');
    assert.notEqual(f.action, 'hunt-prey');
  });

  it('herbivore grazes at any hunger; omnivore hunts or grazes (seeded)', () => {
    assert.equal(feedingDecision(TRIKE, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 }).action, 'graze');
    const a = feedingDecision(GAL, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 }).action;
    const b = feedingDecision(GAL, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 }).action;
    assert.equal(a, b);
    assert.ok(a === 'hunt-prey' || a === 'graze');
  });

  it('thirst outranks hunger', () => {
    const f = feedingDecision(REX, { hunger: 0.95, thirst: 0.9 }, { nowMs: T0 });
    assert.equal(f.action, 'drink');
  });
});

describe('territory (Merlin Nov 14 ~22:59)', () => {
  const rex1 = { id: 'rex-1', slug: 'tyrannosaurus-rex', x: 0, z: 0, scaleM: 12.3 };
  const rex2 = { id: 'rex-2', slug: 'tyrannosaurus-rex', x: 10, z: 0, scaleM: 12.3 };
  const allo = { id: 'allo-1', slug: 'allosaurus', x: 10, z: 0, scaleM: 10.5 };

  it('two carnivores in range fight to the death — bigger wins', () => {
    const d = territoryDecision(rex1, [allo], null, { nowMs: T0 });
    assert.equal(d.mode, 'duel');
    assert.equal(d.winnerId, 'rex-1');
    assert.equal(d.loserId, 'allo-1');
  });

  it('a same-size duel is seeded, not random', () => {
    const a = duelOutcome(rex1, rex2);
    const b = duelOutcome(rex1, rex2);
    assert.deepEqual(a, b);
    assert.ok([a.winnerId, a.loserId].includes('rex-1') && [a.winnerId, a.loserId].includes('rex-2'));
  });

  it('no rival in range = peace', () => {
    assert.equal(territoryDecision(rex1, [{ ...allo, x: 500, z: 0 }], null, { nowMs: T0 }).mode, 'peace');
    assert.equal(territoryDecision(TRIKE && { id: 't-1', slug: 'triceratops', x: 0, z: 0 }, [allo], null, { nowMs: T0 }).mode, 'peace');
  });

  it('a vulnerable user in range turns the duel into a contest for the meal', () => {
    const d = territoryDecision(rex1, [allo], walker(20, 0, false), { nowMs: T0 });
    assert.equal(d.mode, 'contest-meal');
    assert.ok(d.rival);
  });

  it('a vulnerable user alone is hunted, not duelled', () => {
    assert.equal(territoryDecision(rex1, [], walker(20, 0, false), { nowMs: T0 }).mode, 'hunt-user');
  });

  it('after a catch, rivals fight over the kill site; the catcher feeds', () => {
    const caught = { userCaughtAtMs: T0, catchSite: { x: 0, z: 0 }, catcherId: 'rex-1', nowMs: T0 + 5000 };
    assert.equal(territoryDecision(rex1, [allo], null, caught).mode, 'eat');
    assert.equal(territoryDecision(allo, [rex1], null, { ...caught, catcherId: 'rex-1' }).mode, 'contest-corpse');
    // After the 30 s contest window the site is cold again.
    const cold = territoryDecision(allo, [rex1], null, { ...caught, nowMs: T0 + 60000 });
    assert.equal(cold.mode, 'duel');
  });

  it('the guardian never duels — it hunts predators instead', () => {
    const spino = { id: 'sp-1', slug: 'spinosaurus', x: 0, z: 0 };
    assert.equal(territoryDecision(spino, [allo], null, { nowMs: T0 }).mode, 'guardian-duty');
    const prey = [{ id: 'rex-1', predator: true, alive: true, x: 5, z: 0, huntingWalker: true }];
    assert.equal(pickGuardianTarget({ id: 'sp-1', x: 0, z: 0 }, prey).id, 'rex-1');
  });
});

describe('water', () => {
  const shore = { x: 100, z: 100, dist: 40 };
  const water = { isWaterAt: () => false, nearestShore: () => shore };

  it('a thirsty land dino walks to the shoreline', () => {
    const w = waterDecision(TRIKE, { thirst: 0.9 }, { x: 0, z: 0, water });
    assert.equal(w.action, 'drink-go');
    assert.deepEqual(w.shore, shore);
  });

  it('a marine lives in the water; a flyer carries no drink law', () => {
    assert.equal(waterDecision(EARTH2_MODEL_BY_SLUG.get('mosasaurus'), {}, {}).action, 'lives-in-water');
    assert.equal(waterDecision(EARTH2_MODEL_BY_SLUG.get('pteranodon'), { thirst: 0.9 }, {}).action, 'none');
  });

  it('without a shore reader the operator reports intent, never a position', () => {
    const w = waterDecision(TRIKE, { thirst: 0.9 }, { x: 0, z: 0 });
    assert.equal(w.action, 'drink-go');
    assert.equal(w.shore, null);
  });
});

describe('habits + breeding (read, never rewritten)', () => {
  it('night is sleep for most, day is graze/wander', () => {
    // Local-time construction: activity reads the device's LOCAL hour.
    const night = new Date(2026, 10, 14, 2, 0, 0);
    const a = activityNow(TRIKE, null, night.getTime());
    assert.ok(a.activity === 'sleep' || a.activity === 'alert');
    assert.equal(a.moving, false);
    const day = activityNow(TRIKE, 'graze', new Date(2026, 10, 14, 12, 0, 0).getTime());
    assert.equal(day.activity, 'graze');
  });

  it('nest species nest (1–3 eggs); the rest never nest', () => {
    assert.ok(NEST_SPECIES.includes('triceratops'));
    assert.equal(breedingFor('triceratops').nests, true);
    assert.ok([1, 2, 3].includes(nestEggCount('triceratops-herd')));
    assert.equal(breedingFor('tyrannosaurus-rex').nests, false);
  });

  it('raised growth: baby → juvenile at 1 day, adult at 7 days', () => {
    const born = T0;
    assert.equal(growthStage(born, born + 3600000).valueOf(), 'baby');
    assert.equal(growthStage(born, born + 25 * 3600000), 'juvenile');
    assert.equal(growthStage(born, born + 8 * 86400000), 'adult');
    assert.equal(growthForRaised(born, born + 8 * 86400000).stageName, 'Adult');
  });

  it('raise caps are untouched: 1 free, 4 landowner; eggs go cold at 24 h', () => {
    assert.deepEqual(canHatchMore([], false, []), { ok: true, cap: 1, raised: 0 });
    assert.deepEqual(canHatchMore([], true, []), { ok: true, cap: 4, raised: 0 });
    assert.equal(eggIsCold({ stolenAt: T0 }, T0 + EGG_VIABLE_MS + 1), true);
    assert.equal(eggIsCold({ stolenAt: T0 }, T0 + EGG_VIABLE_MS - 1), false);
  });

  it('group sizes follow the registry social life', () => {
    assert.equal(groupFor('triceratops', 'p1|0').social, 'herd');
    assert.ok(groupFor('triceratops', 'p1|0').groupSize >= 3);
    assert.equal(groupFor('tyrannosaurus-rex', 'p1|0').groupSize, 1);
  });
});

describe('population rule (Merlin Nov 14 ~22:57)', () => {
  it('worldCreatures() as coded FAILS the rule: two singletons, every herd single-anchor', () => {
    const rep = populationReport(worldCreatures());
    assert.equal(rep.meetsRule, false);
    assert.equal(rep.species['spinosaurus'].count, 1);
    assert.equal(rep.species['spinosaurus-rex'].count, 1);
    assert.equal(rep.species['brachiosaurus'].anchors, 1);
    assert.equal(rep.missing.length, 0);
    assert.deepEqual(rep.modelGated, ['pachycephalosaurus']);
  });

  it('populationExtras brings every species to ≥ 2 copies over ≥ 2 anchors, ≥ 300 m apart', () => {
    const creatures = worldCreatures();
    const extras = populationExtras(creatures);
    assert.ok(extras.length > 0);
    for (const e of extras) {
      assert.equal(e.operatorExtra, true);
      assert.equal(e.parcelIndex, -1);
      const same = creatures.filter((c) => c.slug === e.slug);
      const minD = Math.min(...same.map((c) => Math.hypot(c.x - e.x, c.z - e.z)));
      assert.ok(minD >= SPREAD_MIN_M, `${e.slug} extra only ${Math.round(minD)} m away`);
    }
    const rep = populationReport([...creatures, ...extras]);
    assert.equal(rep.meetsRule, true);
    for (const [slug, s] of Object.entries(rep.species)) {
      assert.ok(s.meetsMin && s.spreadOk, slug);
    }
  });

  it('populationExtras is deterministic', () => {
    const creatures = worldCreatures();
    assert.deepEqual(populationExtras(creatures), populationExtras(creatures));
  });

  it('the Bay singletons get second circuits (9 flyers + 8 marines)', () => {
    const extras = bayExtras();
    assert.equal(extras.length, 17);
    assert.equal(extras.filter((e) => e.kind === 'flyer').length, 9);
    assert.equal(extras.filter((e) => e.kind === 'marine').length, 8);
    for (const e of extras) assert.equal(e.copy, 1);
  });

  it('no bayExtras circuit carries NaN (marines have no centre to mirror)', () => {
    for (const e of bayExtras()) {
      for (const v of Object.values(e.circuit)) {
        assert.equal(Number.isNaN(v), false, `${e.slug}: circuit value is NaN`);
      }
    }
    for (const e of bayExtras().filter((x) => x.kind === 'marine')) {
      assert.equal('cx' in e.circuit, false, `${e.slug}: marine circuit must not carry cx`);
      assert.equal('cz' in e.circuit, false, `${e.slug}: marine circuit must not carry cz`);
    }
  });

  it('swarms meet the minimum but stay single-cluster by design', () => {
    const s = swarmReport();
    assert.equal(s.meetsMin, true);
    assert.equal(s.singleClusterByDesign, true);
    assert.equal(s['compsognathus-swarm'].count, 12);
  });
});

describe('tap-card life line', () => {
  it('alive: stage · activity · breeding · group', () => {
    const life = lifeFor({ slug: 'triceratops', copy: 0, x: 0, z: 0, parcelIndex: 1 }, T0, { behaviourMode: 'graze' });
    assert.match(life.line, /^Adult · graze · Nests nearby \(\d eggs\)/);
    assert.match(life.line, /Group of \d/);
  });

  it('dead: Remains — stage — killed by cause', () => {
    const life = lifeFor(
      { slug: 'triceratops', copy: 0, x: 0, z: 0 },
      T0,
      { status: 'dead', cause: 'territorial-duel', diedAt: 1000, nowS: 1010 },
    );
    assert.equal(life.line, 'Remains — Adult — killed by territorial-duel');
  });

  it('companion: ally line, never a death', () => {
    const item = { id: 'dino-companion', kind: 'dino', meta: { species: 'velociraptor', bornAt: T0 - 86400000, state: 'out' } };
    const life = companionLifeFor(item, T0);
    assert.equal(life.isAlly, true);
    assert.match(life.line, /Ally — follows you/);
  });
});
