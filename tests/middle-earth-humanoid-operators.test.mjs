// tests/middle-earth-humanoid-operators.test.mjs
// MIDDLE-EARTH — HUMANOID OPERATOR AGENTS (Merlin, Nov 14 ~23:25):
// orcs (warrior/captain) + Saruman + placed folk + the hero-as-
// player; garments tied to the procedural/GLB meshes; weapons
// read from the existing combat systems (orc blade stats,
// player BLADE/BOW, Saruman's staff blasts); death is combat
// only (orc refills on the pod clock, Saruman permanent, folk
// never die); user death cuts the heat to 35% with the boss
// resetting — no corpse fight; folk get a second copy per seat
// (skipping the picked hero's seat).
//
// Run: node --test tests/middle-earth-humanoid-operators.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PODS, POD_ORDER, SARUMAN_GATE_KILLS } from '../app/middle-earth/data.js';
import {
  ORC_KINDS,
  BLADE,
  BOW,
  createOrc,
  damageOrc,
  RESPAWN_MIN_DIST,
} from '../app/middle-earth/orcs.js';
import { ORC_WINDUP_S, ORC_ARM_REST } from '../app/middle-earth/figure-motion.js';
import { createSaruman, damageBoss, BOSS_MAX_HP, BLAST } from '../app/middle-earth/boss.js';
import { createCampaign, cutHeatOnDeath, heatOf, setHeat } from '../app/middle-earth/campaign.js';
import { PLAYABLE } from '../app/middle-earth/characters.js';
import { orcPopulationAll } from '../app/middle-earth/operators.js';
import {
  MIN_FOLK_SPREAD_M,
  FOLK_KINDS,
  placedFolk,
  placedFolkAll,
  birthFor,
  growthFor,
  deathFor,
  decompositionFor,
  dietFor,
  garmentFor,
  garmentCondition,
  weaponFor,
  habitsFor,
  territoryFor,
  userHuntFor,
  userDeathFor,
  folkExtras,
  humanoidPopulation,
  lifeFor,
  orcLifeFor,
  bossLifeFor,
  folkLifeFor,
  heroLifeFor,
  lifeLine,
  enrichHumanoids,
} from '../app/middle-earth/humanoid-operators.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
const rng = () => 0.5;

describe('enumeration — humanoids in code', () => {
  it('orcs are warrior 60 HP / captain 150 HP', () => {
    assert.equal(ORC_KINDS.warrior.hp, 60);
    assert.equal(ORC_KINDS.captain.hp, 150);
    assert.equal(ORC_KINDS.warrior.dmg, 8);
    assert.equal(ORC_KINDS.captain.dmg, 14);
  });

  it('placed folk are 7 seats across 6 models, no creatures among them', () => {
    const all = placedFolkAll();
    assert.equal(all.length, 7);
    const models = [...new Set(all.map((f) => f.model))].sort();
    assert.deepEqual(models, [...FOLK_KINDS].sort());
    assert.equal(placedFolk('shire').length, 2);
    assert.equal(placedFolk('rohan').length, 0); // horse + warg are creatures, not folk
    assert.equal(placedFolk('mordor').length, 1); // dark-lord only; fell-beast + dragon are creatures
    assert.ok(all.every((f) => f.playable === !!PLAYABLE[f.model]));
    assert.equal(placedFolk('mordor')[0].model, 'dark-lord');
    assert.equal(placedFolk('mordor')[0].playable, false);
  });

  it('every pod def still carries its orc blanket field', () => {
    for (const podId of POD_ORDER) {
      assert.ok(PODS[podId].orcs, podId);
    }
    assert.equal(PODS.shire.orcs.captainChance, 0); // Shire: no captains by design
  });
});

describe('birth + growth — placed as adults, no growth in code', () => {
  it('orc birth is the respawn clock, 65 m rule', () => {
    const b = birthFor('orc', { respawnS: 45 });
    assert.equal(b.mode, 'respawn-clock');
    assert.equal(b.respawnS, 45);
    assert.equal(b.needsDistanceM, RESPAWN_MIN_DIST);
    assert.equal(b.needsDistanceM, 65);
  });

  it('growth is adult at the placed height for every kind', () => {
    assert.deepEqual(
      [growthFor('orc', { kind: 'warrior' }).sizeM, growthFor('orc', { kind: 'captain' }).sizeM],
      [1.75, 2.05],
    );
    assert.equal(growthFor('boss').sizeM, 1.95);
    assert.equal(growthFor('folk', { height: 1.35 }).sizeM, 1.35);
    assert.equal(growthFor('hero', { heroKey: 'dwarf' }).sizeM, 1.35);
    for (const g of [growthFor('orc', { kind: 'warrior' }), growthFor('boss'), growthFor('folk', {})]) {
      assert.equal(g.stageName, 'Adult');
      assert.equal(g.fraction, 1);
    }
  });
});

describe('death law — combat only', () => {
  it('a dead orc refills on the pod clock once the player is 65 m away', () => {
    const orc = createOrc({ id: 1, x: 10, z: 20, kind: 'warrior', campId: 0, rove: false }, 0);
    damageOrc(orc, 200, rng);
    assert.equal(orc.state, 'dead');
    const d = deathFor('orc', orc, { deadAt: 1000, respawnS: 45 });
    assert.equal(d.state, 'dead');
    assert.equal(d.cause, 'combat');
    assert.equal(d.respawnAt, 1045);
    assert.equal(d.respawnNeedsDistanceM, 65);
  });

  it('Saruman dies once, permanently', () => {
    const boss = createSaruman();
    boss.state = 'combat';
    damageBoss(boss, BOSS_MAX_HP);
    assert.equal(boss.state, 'dead');
    const d = deathFor('boss', boss);
    assert.equal(d.state, 'dead');
    assert.equal(d.respawnAt, null);
    assert.match(d.note, /permanently/);
  });

  it('folk never die — no death path in code', () => {
    const d = deathFor('folk', placedFolk('shire')[0]);
    assert.equal(d.state, 'alive');
    assert.equal(d.cause, 'none');
  });
});

describe('decomposition — the figure fall/fade numbers', () => {
  it('orc falls over 0.7 s, fades after 1.6 s, gone ~2.5 s', () => {
    assert.equal(decompositionFor('orc', 0).fallFraction, 0);
    assert.equal(decompositionFor('orc', 0.7).fallFraction, 1);
    assert.equal(decompositionFor('orc', 1.6).fadeOpacity, 1);
    assert.equal(decompositionFor('orc', 2.5).fadeOpacity, 0);
  });

  it('Saruman falls over 0.9 s, fades after 1.8 s', () => {
    assert.equal(decompositionFor('boss', 0.9).fallFraction, 1);
    assert.equal(decompositionFor('boss', 3.0).fadeOpacity, 0);
  });

  it('folk have no remains', () => {
    assert.equal(decompositionFor('folk', 99).remains, 'none');
  });
});

describe('diet — feeding IS the hunt for orcs, none for the rest', () => {
  it('a chasing orc hunts the user; an idle orc patrols', () => {
    const chase = createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    chase.state = 'chase';
    assert.equal(dietFor('orc', chase).action, 'hunt-user');
    const idle = createOrc({ id: 2, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    assert.equal(dietFor('orc', idle).action, 'patrol');
    assert.equal(dietFor('orc', idle).diet, null);
  });

  it('folk and hero have no diet in code', () => {
    assert.equal(dietFor('folk', placedFolk('shire')[0]).action, 'none');
    assert.equal(dietFor('hero', { heroKey: 'ranger' }).action, 'none');
  });
});

describe('garment agent — tied to the actual mesh', () => {
  it('warrior wears dark rags + green skin; captain adds crest + iron pads', () => {
    const w = garmentFor('orc', { kind: 'warrior', hp: 60 });
    const c = garmentFor('orc', { kind: 'captain', hp: 150 });
    assert.equal(w.pieces.length, 2);
    assert.equal(c.pieces.length, 4);
    assert.ok(c.pieces.some((p) => p.piece === 'Red crest'));
    assert.ok(c.pieces.some((p) => p.piece === 'Iron shoulder pads'));
    assert.match(w.pieces[0].mesh, /0x33302a/);
    assert.equal(w.condition, 'pristine');
    assert.match(w.changeNote, /Never changes in code/);
  });

  it('garment condition is a display read off HP fraction', () => {
    assert.equal(garmentCondition(60, 60), 'pristine');
    assert.equal(garmentCondition(30, 60), 'worn');
    assert.equal(garmentCondition(10, 60), 'battle-torn');
    assert.equal(garmentCondition(0, 60), 'fallen');
    const hurt = garmentFor('orc', { kind: 'warrior', hp: 10 });
    assert.equal(hurt.condition, 'battle-torn');
    assert.match(hurt.conditionBasis, /display/);
  });

  it('Saruman wears the white robe; folk garments are baked into the GLB', () => {
    const s = garmentFor('boss', { hp: 600 });
    assert.ok(s.pieces.some((p) => p.piece === 'White robe'));
    assert.match(s.pieces[0].mesh, /0xe9e6da/);
    assert.equal(s.model, '/models/middle-earth/white-wizard.glb');
    const f = garmentFor('folk', placedFolk('gondor')[0]);
    assert.equal(f.condition, 'pristine');
    assert.match(f.pieces[0].note, /baked into the GLB/);
    assert.equal(f.model, '/models/middle-earth/dwarf.glb');
  });
});

describe('weapons agent — the existing combat systems', () => {
  it('an orc carries its crude blade with the ORC_KINDS numbers', () => {
    const w = weaponFor('orc', { kind: 'warrior', hp: 60, state: 'idle' });
    assert.equal(w.carried.dmg, 8);
    assert.equal(w.carried.swingRangeM, 2.0);
    assert.equal(w.carried.swingCooldownS, 1.1);
    assert.equal(w.carried.windupS, ORC_WINDUP_S);
    assert.equal(w.carried.windupS, 0.35);
    assert.equal(w.carried.stance.armRestRad, ORC_ARM_REST);
    assert.equal(w.carried.stance.readiness, 'lowered-rest');
    assert.equal(w.carriedBow, null);
    const c = weaponFor('orc', { kind: 'captain', hp: 150, state: 'idle' });
    assert.equal(c.carried.dmg, 14);
    assert.equal(c.carried.swingRangeM, 2.2);
    assert.equal(c.carried.swingCooldownS, 1.3);
  });

  it('wind-up raises the blade arm; a sweep drives it forward', () => {
    const windup = weaponFor('orc', { kind: 'warrior', hp: 60, state: 'chase', windupT: 0.1 }, {});
    assert.equal(windup.carried.stance.readiness, 'raised-windup');
    assert.ok(windup.carried.stance.armBladeRad < ORC_ARM_REST);
    const sweep = weaponFor('orc', { kind: 'warrior', hp: 60, state: 'chase' }, { swingP: 1 });
    assert.equal(sweep.carried.stance.readiness, 'sweeping');
    assert.ok(sweep.carried.stance.armBladeRad > ORC_ARM_REST);
  });

  it('the weapons that kill an orc are the player BLADE and BOW, exact', () => {
    const w = weaponFor('orc', { kind: 'warrior', hp: 60, state: 'idle' });
    assert.deepEqual(w.killsBy.blade, { dmg: 34, rangeM: 2.2, arcDeg: 70, cooldownS: 0.45 });
    assert.deepEqual(w.killsBy.bow, { dmg: 26, rangeM: 30, arcDeg: 12, cooldownS: 0.8 });
    assert.equal(BLADE.dmg, 34);
    assert.equal(BOW.dmg, 26);
  });

  it('Saruman wields his staff: blast 22 @ 3.2 m, telegraph 1.1 s, phase casts', () => {
    assert.equal(BLAST.dmg, 22);
    assert.equal(BLAST.radius, 3.2);
    assert.equal(BLAST.telegraph, 1.1);
    const dormant = weaponFor('boss', { hp: 600, state: 'dormant' });
    assert.equal(dormant.carried.stance.readiness, 'dormant');
    assert.equal(dormant.carried.castIntervalS, 3.2);
    assert.equal(dormant.carried.voice.auraM, 0);
    const p2 = weaponFor('boss', { hp: 300, state: 'combat' });
    assert.equal(p2.carried.castIntervalS, 2.4);
    assert.equal(p2.carried.voice.auraM, 14);
    assert.equal(p2.carried.voice.strideFactor, 0.55);
    const p3 = weaponFor('boss', { hp: 100, state: 'combat' });
    assert.equal(p3.carried.castIntervalS, 1.8);
    assert.equal(p3.carried.twinBlast, true);
    assert.equal(p3.carried.voice.auraM, 18);
    assert.equal(p3.reward.id, 'staff-of-the-white-wizard');
  });

  it('folk are unarmed; the hero carries the PLAYABLE weapons', () => {
    const f = weaponFor('folk', placedFolk('shire')[0]);
    assert.equal(f.carried, null);
    const h = weaponFor('hero', { heroKey: 'ranger' });
    assert.equal(h.carried.melee.dmg, 36);
    assert.equal(h.carried.ranged.dmg, 26);
    assert.equal(h.carried.ranged.range, 30);
    const d = weaponFor('hero', { heroKey: 'dwarf' });
    assert.equal(d.carried.melee.dmg, 44);
  });
});

describe('territory + user hunt + user death', () => {
  it('orcs are a war-band — they alert, never fight each other', () => {
    assert.equal(territoryFor('orc').mode, 'war-band');
    assert.match(territoryFor('orc').note, /never to fight them/);
  });

  it('the hunt meter reads Cold/Warm/Hot/Bloodhunt with party tiers', () => {
    assert.equal(userHuntFor(10).level, 'Cold');
    assert.equal(userHuntFor(50).level, 'Hot');
    assert.equal(userHuntFor(95).level, 'Bloodhunt');
    assert.deepEqual(userHuntFor(0).dispatchTiers.map((t) => t.size), [3, 4, 5]);
    assert.equal(userHuntFor(0).trailColdS, 25);
  });

  it('user death cuts the heat to 35%, resets the boss, no corpse fight', () => {
    let c = createCampaign();
    c = setHeat(c, 'rohan', 80);
    const d = userDeathFor(c, 'rohan');
    assert.equal(d.heatBefore, 80);
    assert.equal(d.heatAfter, 28);
    assert.equal(d.bossReset, 'ready');
    assert.equal(d.bossPendingCleared, true);
    assert.match(d.corpseFight, /no corpse entity/);
    // And the campaign function itself agrees:
    assert.equal(heatOf(cutHeatOnDeath(c, 'rohan'), 'rohan'), 28);
  });
});

describe('population — orcs meet it, folk get a second copy', () => {
  it('orc blanket field meets the warrior + captain minimums', () => {
    const pop = orcPopulationAll(() => true);
    assert.equal(pop.meetsWarriors, true);
    assert.equal(pop.meetsCaptains, true);
    assert.ok(pop.captains >= 2);
    assert.ok(pop.captainPods.length >= 2);
  });

  it('folk extras mirror ≥ 100 m away and skip the picked hero seat', () => {
    for (const podId of POD_ORDER) {
      const seats = placedFolk(podId);
      const extras = folkExtras(podId, null);
      assert.equal(extras.length, seats.length);
      for (let i = 0; i < seats.length; i++) {
        const d = Math.hypot(extras[i].x - seats[i].x, extras[i].z - seats[i].z);
        assert.ok(d >= MIN_FOLK_SPREAD_M, `${podId} ${seats[i].id} spread ${d}`);
        assert.equal(extras[i].operatorExtra, true);
      }
    }
    // Picking the wizard empties the Shire wizard seat — and its extra.
    const shireAsWizard = folkExtras('shire', 'wizard');
    assert.equal(shireAsWizard.length, 1);
    assert.equal(shireAsWizard[0].model, 'halfling');
    // The dark lord is never playable — his extra always stands.
    assert.equal(folkExtras('mordor', 'dark-lord').length, 1);
  });

  it('humanoid population report meets the rule', () => {
    const rep = humanoidPopulation(() => true, null);
    assert.equal(rep.meetsRule, true);
    assert.equal(rep.saruman.count, 1);
    assert.equal(rep.folkSeats, 7);
    assert.equal(rep.folkExtras, 7);
  });
});

describe('conductor — lifeFor + lifeLine', () => {
  it('same orc + time = same life, with garment + weapon on the line', () => {
    const orc = createOrc({ id: 1, x: 10, z: 20, kind: 'warrior', campId: 0, rove: false }, 0);
    const a = lifeFor(orc, T0);
    const b = lifeFor(orc, T0);
    assert.deepEqual(a, b);
    assert.equal(a.kind, 'orc');
    assert.equal(a.stageName, 'Adult');
    assert.equal(a.garment.summary, 'Dark rags');
    assert.equal(a.weapon.summary, 'Crude blade · 8 dmg · 2 m');
    assert.equal(a.line, 'Adult · Patrolling · War-band · Dark rags · Crude blade · 8 dmg · 2 m · Band of 3');
  });

  it('a chasing captain reads hunting, with crest + pads', () => {
    const orc = createOrc({ id: 2, x: 0, z: 0, kind: 'captain', campId: 0, rove: false }, 0);
    orc.state = 'chase';
    const life = lifeFor(orc, T0);
    assert.equal(life.activity, 'chase');
    assert.match(life.line, /Hunting you/);
    assert.match(life.line, /red crest/);
    assert.equal(life.weapon.summary, 'Crude blade · 14 dmg · 2.2 m');
  });

  it('a dead orc reads Remains with the respawn clock', () => {
    const orc = createOrc({ id: 3, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    damageOrc(orc, 200, rng);
    const life = lifeFor(orc, T0, { deadAt: 1000, respawnS: 45 });
    assert.equal(life.state, 'dead');
    assert.equal(life.respawnAt, 1045);
    assert.equal(life.line, 'Remains — Adult Orc Warrior — returns on the respawn clock');
  });

  it('Saruman reads dormant / ready / combat with gate + staff on the line', () => {
    const dormant = lifeFor(createSaruman(), T0, { totalKills: 0 });
    assert.match(dormant.line, /Dormant/);
    assert.match(dormant.line, new RegExp(`gate opens at ${SARUMAN_GATE_KILLS}`));
    const ready = createSaruman();
    ready.state = 'ready';
    assert.match(lifeFor(ready, T0, { totalKills: 30 }).line, /Waiting/);
    const combat = createSaruman();
    combat.state = 'combat';
    combat.hp = 300;
    const cl = lifeFor(combat, T0, { totalKills: 30 });
    assert.equal(cl.phase, 2);
    assert.match(cl.line, /Combat.*phase 2/);
    const dead = createSaruman();
    dead.state = 'dead';
    dead.hp = 0;
    assert.equal(lifeFor(dead, T0).line, 'Remains — Saruman — the campaign is complete');
  });

  it('folk read ambient + unarmed; the hero reads as the player', () => {
    const folk = lifeFor(placedFolk('mordor')[0], T0); // dark-lord: not a playable hero seat
    assert.equal(folk.kind, 'folk');
    assert.equal(folk.state, 'alive');
    assert.equal(folk.deathCause, 'none');
    assert.equal(folk.line, 'Adult · Ambient · Folk of the realm · Figure as modelled · Unarmed');
    const seat = lifeFor(placedFolk('gondor')[0], T0); // dwarf: a playable hero's NPC seat
    assert.match(seat.line, /Fellowship hero \(NPC seat\)/);
    const hero = lifeFor({ kind: 'hero', heroKey: 'ranger' }, T0);
    assert.equal(hero.kind, 'hero');
    assert.match(hero.line, /You — the player/);
    assert.match(hero.line, /Blade 36/);
  });

  it('enrichHumanoids adds life without dropping records', () => {
    const list = [
      createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0),
      createSaruman(),
      placedFolk('shire')[0],
    ];
    const out = enrichHumanoids(list, T0, { totalKills: 0 });
    assert.equal(out.length, 3);
    assert.ok(out.every((h) => typeof h.life === 'object' && typeof h.life.line === 'string'));
    assert.equal(out[2].life.kind, 'folk');
  });

  it('lifeLine of nothing is empty', () => {
    assert.equal(lifeLine(null), '');
    assert.equal(lifeFor(null), null);
  });
});
