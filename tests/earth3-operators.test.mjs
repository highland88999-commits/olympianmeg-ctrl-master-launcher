// tests/earth3-operators.test.mjs
// EARTH 3 — OPERATOR AGENTS (Merlin, Nov 14 ~22:56 / behaviour
// logic Nov 14 ~22:59): age-only death (the DEFAULT — no death
// law exists in Earth 3 code, flagged as this module's call),
// diet-driven feeding with escape-only hunts (no kill routing),
// territorial dominance displays (loser yields, never dies),
// water-seeking on the real terrain, and the population rule
// (≥ 3 copies per species, spread ≥ 500 m — verified, the
// spawner already meets it).
//
// Run: node --test tests/earth3-operators.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DINO_SLUGS,
  dinosNear,
  showcaseGround,
} from '../lib/earth3/spawner.js';
import {
  growthStage,
  canHatchMore,
  eggIsCold,
  EGG_VIABLE_MS,
} from '../lib/earth2/breeding.js';
import {
  DECOMP_DAYS,
  MIN_COPIES,
  SPREAD_MIN_M,
  growthFor,
  feedingDecision,
  territoryDecision,
  nearestWater,
  waterDecision,
  activityNow,
  lifeFor,
  enrichCreatures,
  populationAudit,
  populationReport,
} from '../lib/earth3/operators.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

function atLocal(y, m, d, h = 12) {
  return new Date(y, m - 1, d, h);
}

describe('deterministic life', () => {
  it('same tile + species + time = same state on two calls', () => {
    const d = { slug: 'triceratops', tileId: 12345, x: 100, z: 200 };
    const a = lifeFor(d, T0);
    const b = lifeFor(d, T0);
    assert.deepEqual(a, b);
    assert.equal(a.realm, 'earth3');
    assert.equal(a.state, 'alive');
  });

  it('same tile a month later may be a different generation', () => {
    const d = { slug: 'compsognathus', tileId: 999, x: 0, z: 0 };
    const a = lifeFor(d, T0);
    // Compsognathus lifespan is 12 y (convention) — a month will not turn it over,
    // but the age must advance exactly with the clock.
    const b = lifeFor(d, T0 + 30 * 86400000);
    assert.equal(Math.round((b.ageDays - a.ageDays) * 10) / 10, 30);
    assert.equal(a.generation, b.generation);
  });

  it('enrichCreatures adds life without dropping dinos', () => {
    const list = dinosNear(0, 0, 150, showcaseGround(), 150);
    assert.ok(list.length > 0);
    const out = enrichCreatures(list, T0);
    assert.equal(out.length, list.length);
    for (const c of out) assert.ok(c.life && typeof c.life.line === 'string');
  });
});

describe('death law — age only (my call, flagged)', () => {
  it('a dino lives its conventional lifespan, then decomposes, then the next generation is born', () => {
    const d = { slug: 'triceratops', tileId: 4242, x: 0, z: 0 };
    const first = lifeFor(d, T0);
    assert.equal(first.state, 'alive');
    assert.equal(first.deathCause, null);
    assert.equal(first.lifespanBasis, 'convention');
    // Death epoch is fixed by the seeded timeline: find it by scanning forward.
    assert.equal(first.lifespanYears, 45); // 8.5 m → 45 y convention
    let seenDecomp = null;
    let seenNext = null;
    for (let i = 0; i < 600; i++) {
      const t = T0 + i * 30 * 86400000;
      const l = lifeFor(d, t);
      if (l.state === 'decomposing' && !seenDecomp) seenDecomp = { t, life: l };
      if (seenDecomp && l.state === 'alive' && l.generation > seenDecomp.life.generation) {
        seenNext = { t, life: l };
        break;
      }
    }
    assert.ok(seenDecomp, 'expected a decomposition window within 50 years');
    assert.equal(seenDecomp.life.deathCause, 'age');
    assert.equal(seenDecomp.life.decompStageName, 'Remains');
    assert.ok(seenNext, 'expected a next generation after decomposition');
    assert.equal(seenNext.life.generation, seenDecomp.life.generation + 1);
    // Decomposition lasts DECOMP_DAYS: the next birth follows within ~a month of the window's end.
    assert.ok(seenNext.t - seenDecomp.t <= (DECOMP_DAYS + 31) * 86400000);
  });

  it('no hunt ever kills: a stalked dino stays alive', () => {
    const d = { slug: 'tyrannosaurus-rex', tileId: 777, x: 0, z: 0 };
    const life = lifeFor(d, T0, { state: { hunger: 0.99, thirst: 0.1 } });
    assert.equal(life.feeding, 'stalk');
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, null);
  });

  it('despawn is not death: the same tile returns the same dino', () => {
    const a = dinosNear(0, 0, 150, showcaseGround(), 150);
    const b = dinosNear(0, 0, 150, showcaseGround(), 150);
    assert.deepEqual(a.map((d) => d.id), b.map((d) => d.id));
  });
});

describe('diet drives feeding (hunts end in escape — no kill routing)', () => {
  it('hungry carnivore stalks; fed carnivore does not', () => {
    const rex = { slug: 'tyrannosaurus-rex', tileId: 1, x: 0, z: 0 };
    const hungry = feedingDecision(rex, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 });
    assert.equal(hungry.action, 'stalk');
    assert.match(hungry.note, /no kill/);
    const fed = feedingDecision(rex, { hunger: 0.1, thirst: 0.1 }, { nowMs: T0 });
    assert.notEqual(fed.action, 'stalk');
  });

  it('herbivore grazes; omnivore hunts or grazes, seeded by the hour', () => {
    const trike = { slug: 'triceratops', tileId: 1, x: 0, z: 0 };
    assert.equal(feedingDecision(trike, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 }).action, 'graze');
    const gal = { slug: 'gallimimus', tileId: 1, x: 0, z: 0 };
    const a = feedingDecision(gal, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 }).action;
    const b = feedingDecision(gal, { hunger: 0.95, thirst: 0.1 }, { nowMs: T0 }).action;
    assert.equal(a, b);
    assert.ok(a === 'stalk' || a === 'graze');
  });

  it('thirst outranks hunger', () => {
    const rex = { slug: 'tyrannosaurus-rex', tileId: 1, x: 0, z: 0 };
    assert.equal(feedingDecision(rex, { hunger: 0.95, thirst: 0.9 }, { nowMs: T0 }).action, 'drink');
  });
});

describe('territory — dominance display, never a death', () => {
  it('two carnivores in range: bigger holds ground, loser yields — nobody dies', () => {
    const rex = { slug: 'tyrannosaurus-rex', id: 'e3-dino:1', x: 0, z: 0, scaleM: 12.3 };
    const allo = { slug: 'allosaurus', id: 'e3-dino:2', x: 10, z: 0, scaleM: 10.5 };
    const d = territoryDecision(rex, [allo], { nowMs: T0 });
    assert.equal(d.mode, 'dominance');
    assert.equal(d.winnerId, 'e3-dino:1');
    assert.equal(d.loserYields, false);
    const d2 = territoryDecision(allo, [rex], { nowMs: T0 });
    assert.equal(d2.mode, 'dominance');
    assert.equal(d2.loserYields, true);
  });

  it('no rival in range = peace; herbivores never display', () => {
    const rex = { slug: 'tyrannosaurus-rex', id: 'e3-dino:1', x: 0, z: 0, scaleM: 12.3 };
    assert.equal(territoryDecision(rex, [], { nowMs: T0 }).mode, 'peace');
    const trike = { slug: 'triceratops', id: 'e3-dino:3', x: 0, z: 0 };
    assert.equal(territoryDecision(trike, [rex], { nowMs: T0 }).mode, 'peace');
  });

  it('a dominance outcome never changes the life state (no death)', () => {
    const d = { slug: 'allosaurus', tileId: 55, x: 0, z: 0, scaleM: 10.5 };
    const rival = { slug: 'tyrannosaurus-rex', id: 'e3-dino:9', x: 5, z: 0, scaleM: 12.3 };
    const life = lifeFor(d, T0, { rivals: [rival] });
    assert.equal(life.territory, 'dominance');
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, null);
  });
});

describe('water', () => {
  it('nearestWater finds the showcase water past z = 200', () => {
    const w = nearestWater(0, 150, showcaseGround());
    assert.ok(w);
    assert.ok(w.z > 200);
    assert.ok(w.distM <= 400);
    assert.equal(nearestWater(0, 0, { biomeAt: () => 'plains' }), null);
  });

  it('a thirsty dino walks to water; a content one does not', () => {
    const d = { slug: 'triceratops', tileId: 1, x: 0, z: 150 };
    const thirsty = waterDecision(d, { thirst: 0.9 }, { nowMs: T0, ground: showcaseGround() });
    assert.equal(thirsty.action, 'drink-go');
    assert.ok(thirsty.shore);
    assert.equal(waterDecision(d, { thirst: 0.1 }, { nowMs: T0, ground: showcaseGround() }).action, 'none');
  });
});

describe('habits + breeding (read, never rewritten)', () => {
  it('night is sleep for most; day follows the feeding action', () => {
    const d = { slug: 'triceratops', tileId: 1 };
    const night = activityNow(d, { action: 'graze' }, atLocal(2026, 11, 14, 2).getTime());
    assert.ok(night.activity === 'sleep' || night.activity === 'alert');
    assert.equal(night.moving, false);
    const day = activityNow(d, { action: 'graze' }, atLocal(2026, 11, 14, 12).getTime());
    assert.equal(day.activity, 'graze');
  });

  it('growth: juveniles grow to adult size on the convention curve', () => {
    const g0 = growthFor('triceratops', 0);
    const gAdult = growthFor('triceratops', 100000);
    assert.equal(g0.stageName, 'Juvenile');
    assert.equal(gAdult.stageName, 'Adult');
    assert.ok(gAdult.sizeM > g0.sizeM);
    assert.equal(gAdult.sizeM, 8.5);
  });

  it('backpack law is untouched: caps 1 / 4, growth 1 d / 7 d, eggs cold at 24 h', () => {
    assert.deepEqual(canHatchMore([], false, []), { ok: true, cap: 1, raised: 0 });
    assert.deepEqual(canHatchMore([], true, []), { ok: true, cap: 4, raised: 0 });
    assert.equal(growthStage(T0, T0 + 25 * 3600000), 'juvenile');
    assert.equal(growthStage(T0, T0 + 8 * 86400000), 'adult');
    assert.equal(eggIsCold({ stolenAt: T0 }, T0 + EGG_VIABLE_MS + 1), true);
  });
});

describe('population rule (Merlin Nov 14 ~22:57)', () => {
  it('the spawner already meets it: all 17 species, ≥ 3 copies, spread ≥ 500 m', () => {
    const audit = populationAudit([{ x: 0, z: 0 }], 2000, showcaseGround(), 150);
    assert.equal(audit.missing.length, 0);
    assert.equal(audit.meetsRule, true);
    for (const slug of DINO_SLUGS) {
      const s = audit.species[slug];
      assert.ok(s.count >= MIN_COPIES, `${slug}: only ${s.count}`);
      assert.ok(s.maxSpreadM >= SPREAD_MIN_M, `${slug}: spread ${s.maxSpreadM} m`);
    }
  });

  it('populationReport agrees on a dinosNear list', () => {
    const list = dinosNear(0, 0, 2000, showcaseGround(), 150);
    const rep = populationReport(list);
    assert.equal(rep.meetsRule, true);
    assert.equal(rep.missing.length, 0);
  });

  it('a second land probe far away also holds all 17 species', () => {
    const audit = populationAudit([{ x: -60000, z: 40000 }], 2000, undefined, 150);
    assert.equal(audit.missing.length, 0);
    assert.equal(audit.meetsRule, true);
  });
});

describe('tap-card life line', () => {
  it('alive: stage · activity · feeding · group', () => {
    const life = lifeFor({ slug: 'triceratops', tileId: 5, x: 0, z: 0 }, atLocal(2026, 11, 14, 12).getTime(), { state: { hunger: 0.1, thirst: 0.1 } });
    assert.match(life.line, /^(Adult|Juvenile) · (graze|wander)/);
    assert.match(life.line, /Grazing/);
  });

  it('decomposing: Remains — stage — died of age', () => {
    // Find a decomposing window for a short-lived species and check its line.
    const d = { slug: 'compsognathus', tileId: 999, x: 0, z: 0 };
    let found = null;
    for (let i = 0; i < 600 && !found; i++) {
      const l = lifeFor(d, T0 + i * 30 * 86400000);
      if (l.state === 'decomposing') found = l;
    }
    assert.ok(found);
    assert.equal(found.line, 'Remains — Adult — died of age');
  });
});
