// tests/hollow-earth-humanoid-operators.test.mjs
// HOLLOW EARTH — HUMANOID OPERATOR AGENTS (Merlin, Nov 14 ~23:25;
// seven-agent life line Nov 16 ~02:31, savagery Nov 16):
// Korus + Ghorrum + the hero-as-player + the upright-figure
// monster families (a BLURB reading — families.js carries no
// humanoid form); garments baked into the rigged GLBs; weapons
// read from the existing combat systems (Korus's casts, the
// HEROES weapons, the archetype attacks, the player's blade /
// bolt); death is combat / predation / territorial-duel / age,
// with a 45 s respawn to the next generation in the same slot
// (Korus permanent; Ghorrum never dies); user death wakes the
// hunter at The Haven whole — no corpse fight; Jedi/Sith
// verified absent; Earth 2 / Earth 3 verified to hold no
// humanoid operator subjects.
//
// Run: node --test tests/hollow-earth-humanoid-operators.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MONSTER_TYPES,
  ARCHETYPES,
  spawnField,
  createMonster,
  damageMonster,
  createKorus,
  damageKorus,
  KORUS_MAX_HP,
  KORUS_GATE_KILLS,
  KORUS_BLAST,
  GIVE_UP_S,
  SAFE_BASE,
  RESPAWN_S,
  WEAPONS,
} from '../app/hollow-earth/spawns.js';
import {
  MONSTER_FAMILIES,
  EXTRA_FAMILIES,
} from '../app/hollow-earth/families.js';
import { PLACED_FIELD_KEYS } from '../app/hollow-earth/models.js';
import { WATCHER } from '../app/hollow-earth/watcher.js';
import { HEROES } from '../app/hollow-earth/characters.js';
import { WEAPON_BY_ARCHETYPE, weaponForArchetype } from '../app/hollow-earth/behavior.js';
import { populationAudit } from '../app/hollow-earth/operators.js';
import {
  MIN_COPIES_PER_HUMANOID_FAMILY,
  HUMANOID_READING,
  HUMANOID_READING_KEYS,
  isHumanoidReading,
  humanoidReadingFor,
  humanoidReadings,
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
  humanoidPopulationAudit,
  lifeFor,
  monsterLifeFor,
  korusLifeFor,
  watcherLifeFor,
  heroLifeFor,
  lifeLine,
  enrichHumanoids,
} from '../app/hollow-earth/humanoid-operators.js';
import { EARTH2_MODELS } from '../lib/earth2/models.js';
import { DINO_SPECIES } from '../lib/earth3/spawner.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

function fieldRecords() {
  // A wedge habitat reader: each of the 8 bands owns a wedge of
  // the disc, so PASS 1 places every placed family in-band and
  // the dragon pass places Stormwing in the mountain wedge.
  const BANDS = ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost', 'mountain'];
  return spawnField(7, {
    count: 150,
    habitatAt: (x, z) => BANDS[Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 8],
  });
}

describe('enumeration — humanoids in code', () => {
  it('families.js carries NO humanoid form — every family is beast or vortex', () => {
    for (const [key, f] of Object.entries({ ...MONSTER_FAMILIES, ...EXTRA_FAMILIES })) {
      assert.ok(f.form === 'beast' || f.form === 'vortex', key);
      assert.notEqual(f.form, 'humanoid', key);
    }
    assert.equal(Object.keys(MONSTER_FAMILIES).length, 37);
    assert.equal(Object.keys(EXTRA_FAMILIES).length, 11);
  });

  it('the upright-figure reading is exactly 10 families, each with a blurb basis', () => {
    assert.equal(HUMANOID_READING_KEYS.length, 10);
    assert.deepEqual(
      [...HUMANOID_READING_KEYS].sort(),
      ['slot-01', 'slot-03', 'slot-07', 'slot-10', 'slot-11', 'slot-21', 'slot-22', 'slot-26', 'slot-38', 'slot-43'],
    );
    for (const key of HUMANOID_READING_KEYS) {
      const r = humanoidReadingFor(key);
      assert.ok(r, key);
      assert.equal(r.reading, 'upright-figure (blurb reading — families.js carries no humanoid form)');
      assert.ok(r.basis.length > 10, key);
      assert.equal(r.model, `/models/hollow-earth/${key}.glb`);
    }
    assert.equal(humanoidReadingFor('slot-02'), null); // hulking demon — no figure language
    assert.equal(humanoidReadingFor('slot-27'), null); // golem — 'armoured rock'
    assert.equal(humanoidReadingFor('oozealot'), null); // 'Sir' name, slug-like model
    assert.equal(isHumanoidReading('slot-38'), true);
    assert.equal(isHumanoidReading('slot-12'), false); // vortex, grinning funnel
    assert.equal(humanoidReadings().length, 10);
  });

  it('placed reading families are 7 of the 10 — the rest are model-gated', () => {
    const placed = HUMANOID_READING_KEYS.filter((k) => PLACED_FIELD_KEYS.includes(k));
    assert.deepEqual(placed.sort(), ['slot-01', 'slot-07', 'slot-10', 'slot-11', 'slot-22', 'slot-26', 'slot-43']);
    assert.ok(!PLACED_FIELD_KEYS.includes('slot-03')); // truncated, awaiting re-send
    assert.ok(!PLACED_FIELD_KEYS.includes('slot-21')); // no placement at all
    assert.ok(!PLACED_FIELD_KEYS.includes('slot-38')); // no placement at all
  });

  it('Jedi Knight and Sith Lord stand nowhere in this realm', () => {
    assert.equal(HEROES['jedi-knight'], undefined);
    assert.equal(HEROES['sith-lord'], undefined);
    assert.ok(!Object.keys(HEROES).some((k) => /jedi|sith/i.test(k)));
    // The knight/warrior mappings are forge archetype labels, not characters:
    assert.equal(WEAPON_BY_ARCHETYPE.knight, 'sword');
    assert.equal(WEAPON_BY_ARCHETYPE.warrior, 'sword');
    assert.equal(WEAPON_BY_ARCHETYPE.wizard, 'staff');
    assert.equal(weaponForArchetype('knight'), 'sword');
    assert.equal(weaponForArchetype('hunter'), 'blaster');
  });

  it('the hero roster is Kael + the five imported Middle-earth heroes', () => {
    assert.deepEqual(
      Object.keys(HEROES).sort(),
      ['dwarf', 'elf-archer', 'halfling', 'monster-hunter', 'ranger', 'wizard'],
    );
    assert.equal(HEROES['monster-hunter'].maxHp, 120);
    assert.equal(HEROES['monster-hunter'].meleeDmg, 38);
    assert.equal(HEROES['monster-hunter'].ranged.dmg, 30);
    assert.equal(HEROES['monster-hunter'].ranged.range, 28);
  });

  it('Korus is 1000 HP at his throne, gate 40 kills; Ghorrum is non-hostile', () => {
    assert.equal(KORUS_MAX_HP, 1000);
    assert.equal(KORUS_GATE_KILLS, 40);
    assert.equal(WATCHER.nonHostile, true);
    assert.equal(WATCHER.excludedFromCombat, true);
    assert.equal(WATCHER.excludedFromHunt, true);
    assert.equal(WATCHER.colliderR, 0);
  });
});

describe('birth + growth — seeded mid-life, growth stages by age fraction', () => {
  it('monster birth is the seeded field, 2 per placed family', () => {
    assert.equal(birthFor('monster').mode, 'seeded-mid-life');
    assert.equal(birthFor('boss').mode, 'singleton');
    assert.equal(birthFor('watcher').mode, 'singleton');
    assert.equal(birthFor('hero').mode, 'player-pick');
  });

  it('growth is adult at the family scaleM / figure height', () => {
    assert.equal(growthFor('monster', { type: 'slot-01' }).sizeM, 2.6);
    assert.equal(growthFor('monster', { type: 'slot-43' }).sizeM, 4.2);
    assert.equal(growthFor('boss').sizeM, 12);
    assert.equal(growthFor('watcher').sizeM, 8);
    assert.equal(growthFor('hero', { heroKey: 'monster-hunter' }).sizeM, 1.9);
    assert.equal(growthFor('hero', { heroKey: 'dwarf' }).sizeM, 1.35);
    for (const g of [growthFor('monster', { type: 'slot-01' }), growthFor('boss'), growthFor('watcher')]) {
      assert.equal(g.stageName, 'Adult');
    }
    // No birth on the record — age unknown, never invented: no fraction.
    assert.equal(growthFor('monster', { type: 'slot-01' }).fraction, null);
    assert.equal(growthFor('boss').fraction, 1);
    assert.equal(growthFor('watcher').fraction, 1);
  });
});

describe('death law — combat/predation/duel/age, 45 s respawn, remains fade', () => {
  it('a dead monster respawns in 45 s as the next generation', () => {
    assert.equal(RESPAWN_S, 45);
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'acid', x: 0, z: 0 });
    damageMonster(m, 1000);
    assert.equal(m.dead, true);
    const d = deathFor('monster', m);
    assert.equal(d.state, 'dead');
    assert.equal(d.cause, 'combat');
    assert.equal(d.respawnAt, m.respawnAtMs);
    assert.equal(m.respawnAtMs - m.diedAtMs, 45000); // the 45 s window
    assert.equal(d.respawnNote, 'Returns in 45 s, same family, near where it fell');
  });

  it('Korus dies once, permanently', () => {
    const k = createKorus(true);
    k.dormant = false;
    k.awake = true;
    damageKorus(k, KORUS_MAX_HP);
    assert.equal(k.dead, true);
    const d = deathFor('boss', k);
    assert.equal(d.state, 'dead');
    assert.equal(d.respawnAt, null);
  });

  it('Ghorrum never dies', () => {
    const d = deathFor('watcher', null);
    assert.equal(d.state, 'alive');
    assert.equal(d.cause, 'none');
  });

  it('remains lie for the 45 s respawn window and fade', () => {
    // A live kind has no remains yet.
    for (const kind of ['monster', 'boss', 'watcher', 'hero']) {
      assert.equal(decompositionFor(kind).remains, 'none');
    }
    assert.match(decompositionFor('monster').note, /Alive — no remains/);
    // A dead monster's remains fade over the 45 s window, then the next generation is born.
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'acid', x: 0, z: 0 });
    damageMonster(m, 1000);
    const dead = decompositionFor('monster', m);
    assert.equal(dead.remains, 'fading disc');
    assert.equal(dead.windowS, 45);
    assert.equal(dead.nextGenerationAt, m.respawnAtMs);
    assert.match(dead.note, /Remains lie for the 45 s respawn window/);
  });
});

describe('diet — read from the family record', () => {
  it('a spotted monster hunts the user; an ambusher waits; the rest roam', () => {
    const hunter = createMonster({ id: 'm-1', type: 'slot-01', element: 'acid', x: 0, z: 0 });
    hunter.spotted = true;
    assert.equal(dietFor('monster', hunter).action, 'hunt-user');
    const ambusher = createMonster({ id: 'm-2', type: 'slot-29', element: 'acid', x: 0, z: 0 });
    assert.equal(dietFor('monster', ambusher).action, 'ambush-wait');
    const roamer = createMonster({ id: 'm-3', type: 'slot-01', element: 'acid', x: 0, z: 0 });
    assert.equal(dietFor('monster', roamer).action, 'roam');
    assert.equal(dietFor('monster', roamer).diet, 'Stalks other monsters and the hunter — a ranged acid predator of the acid band, leaves a corrosive pool under its prey.');
  });

  it('Korus, Ghorrum and the hero have no diet in code', () => {
    assert.equal(dietFor('watcher', null).action, 'none');
    assert.equal(dietFor('hero', { heroKey: 'monster-hunter' }).action, 'none');
  });
});

describe('garment agent — baked into the GLB, never changed', () => {
  it('garment condition is a display read off HP fraction', () => {
    assert.equal(garmentCondition(120, 120), 'pristine');
    assert.equal(garmentCondition(60, 120), 'worn');
    assert.equal(garmentCondition(30, 120), 'battle-torn');
    assert.equal(garmentCondition(0, 120), 'fallen');
  });

  it('an upright family wears its element tint, baked into its GLB', () => {
    const g = garmentFor('monster', { type: 'slot-38', hp: 130 });
    assert.equal(g.model, '/models/hollow-earth/slot-38.glb');
    assert.match(g.pieces[0].piece, /poison-wreathed figure/);
    assert.match(g.pieces[0].note, /violet-robed figures/);
    assert.match(g.changeNote, /Never changes in code/);
    assert.match(g.conditionBasis, /display/);
  });

  it('a non-reading family is never claimed humanoid in its garment', () => {
    const g = garmentFor('monster', { type: 'slot-12', hp: 140 });
    assert.match(g.pieces[0].note, /Not an upright-figure reading/);
  });

  it('Korus wears his demon-boss figure; Ghorrum wears no garment', () => {
    const k = garmentFor('boss', { hp: 1000 });
    assert.equal(k.model, '/models/hollow-earth/korus.glb');
    assert.equal(k.modelHeight, 12);
    const w = garmentFor('watcher', null);
    assert.match(w.pieces[0].note, /No garment/);
    assert.equal(w.condition, 'pristine');
  });

  it('Kael wears dark leathers + trophy pauldron; imported heroes wear their ME garb', () => {
    const kael = garmentFor('hero', { heroKey: 'monster-hunter' });
    assert.match(kael.pieces[0].piece, /Dark leathers \+ trophy pauldron/);
    assert.equal(kael.model, '/models/hollow-earth/monster-hunter.glb');
    const wizard = garmentFor('hero', { heroKey: 'wizard' });
    assert.equal(wizard.model, null);
    assert.match(wizard.pieces[0].mesh, /Middle-earth GLB/);
  });
});

describe('weapons agent — the existing combat systems', () => {
  it('Korus casts shadow 26 @ 4 m + bolt 18 @ 6 m, telegraph 1.2 s, phase casts', () => {
    assert.equal(KORUS_BLAST.shadowDmg, 26);
    assert.equal(KORUS_BLAST.shadowR, 4);
    assert.equal(KORUS_BLAST.boltDmg, 18);
    assert.equal(KORUS_BLAST.boltR, 6);
    assert.equal(KORUS_BLAST.telegraph, 1.2);
    const dormant = weaponFor('boss', { hp: 1000, dormant: true });
    assert.equal(dormant.carried.stance.readiness, 'seated-dormant');
    assert.equal(dormant.carried.castIntervalS, 3.2);
    const p2 = weaponFor('boss', { hp: 500, dormant: false, awake: true });
    assert.equal(p2.carried.castIntervalS, 2.4);
    const p3 = weaponFor('boss', { hp: 200, dormant: false, awake: true });
    assert.equal(p3.carried.castIntervalS, 1.8);
    assert.equal(p3.carried.stance.readiness, 'casting');
  });

  it('an upright family wields its archetype at the ARCHETYPES range', () => {
    const ranged = weaponFor('monster', { type: 'slot-01', hp: 120, state: 'idle', spotted: false });
    assert.equal(ranged.carried.archetype, 'ranged');
    assert.equal(ranged.carried.rangeM, ARCHETYPES.ranged.range);
    assert.equal(ranged.carried.rangeM, 22);
    assert.equal(ranged.carried.dmg, 12);
    assert.match(ranged.carried.mesh, /No native weapon mesh/);
    const hazard = weaponFor('monster', { type: 'slot-29', hp: 180, state: 'ambush', spotted: false });
    assert.equal(hazard.carried.archetype, 'environmental');
    assert.equal(hazard.carried.hazard, true);
    assert.equal(hazard.carried.hazardR, 3.5);
    assert.equal(hazard.carried.telegraphS, 0.9);
    assert.equal(hazard.carried.stance.readiness, 'lying-in-wait');
    const melee = weaponFor('monster', { type: 'slot-27', hp: 190, state: 'idle', spotted: false });
    assert.equal(melee.carried.rangeM, 2.6);
    const short = weaponFor('monster', { type: 'slot-25', hp: 120, state: 'idle', spotted: false });
    assert.equal(short.carried.rangeM, 5);
  });

  it('a charging family bursts at 1.7× speed; a hunting one reads hunting', () => {
    const c = weaponFor('monster', { type: 'slot-02', hp: 180, state: 'charge', spotted: true });
    assert.equal(c.carried.chargeBurst, '1.7× speed while charging (stepMonster)');
    assert.equal(c.carried.stance.readiness, 'charging');
    const h = weaponFor('monster', { type: 'slot-01', hp: 120, state: 'stalk', spotted: true });
    assert.equal(h.carried.stance.readiness, 'hunting');
  });

  it('the weapons that kill a monster are the player blade 36 and bolt 28', () => {
    const w = weaponFor('monster', { type: 'slot-01', hp: 120, state: 'idle', spotted: false });
    assert.deepEqual(w.killsBy.blade, { dmg: 36, rangeM: 2.4, cooldownS: 0.45 });
    assert.deepEqual(w.killsBy.bolt, { dmg: 28, rangeM: 30, cooldownS: 0.8 });
    assert.equal(WEAPONS.blade.dmg, 36);
    assert.equal(WEAPONS.bolt.dmg, 28);
  });

  it('Ghorrum is unarmed; the hero carries the HEROES weapons', () => {
    assert.equal(weaponFor('watcher', null).carried, null);
    const kael = weaponFor('hero', { heroKey: 'monster-hunter' });
    assert.equal(kael.carried.melee.dmg, 38);
    assert.equal(kael.carried.ranged.dmg, 30);
    assert.equal(kael.carried.ranged.range, 28);
    assert.equal(kael.archetypeWeapon, 'blaster');
    const elf = weaponFor('hero', { heroKey: 'elf-archer' });
    assert.equal(elf.carried.ranged.dmg, 34);
    assert.equal(elf.carried.ranged.range, 38);
    assert.equal(elf.archetypeWeapon, 'bow');
  });
});

describe('territory + user hunt + user death', () => {
  it('monsters hold their habitat band and fight within it', () => {
    assert.equal(territoryFor('monster').mode, 'habitat-band');
    assert.match(territoryFor('monster').note, /habitat band/);
  });

  it('the hunt gives up after 20 s unseen and breaks at The Haven', () => {
    assert.equal(GIVE_UP_S, 20);
    const h = userHuntFor({ spotted: true });
    assert.equal(h.spotted, true);
    assert.equal(h.giveUpS, 20);
    assert.equal(h.haven.x, SAFE_BASE.x);
    assert.equal(h.haven.r, 28);
    assert.match(h.haven.note, /untouchable/);
  });

  it('user death wakes the hunter at The Haven whole — no corpse fight', () => {
    const d = userDeathFor();
    assert.equal(d.respawn, 'The Haven');
    assert.deepEqual(d.respawnPos, { x: 0, z: 155 });
    assert.equal(d.hp, 'full');
    assert.equal(d.killsKept, true);
    assert.equal(d.shieldKept, true);
    assert.match(d.corpseFight, /no corpse entity/);
  });
});

describe('population — 2 per placed family, singletons by design', () => {
  it('the field guarantees 2 of every placed reading family', () => {
    const audit = humanoidPopulationAudit(fieldRecords());
    assert.equal(audit.minCopiesPerFamily, MIN_COPIES_PER_HUMANOID_FAMILY);
    for (const key of audit.placedReading) {
      assert.ok(audit.reading[key].count >= 2, `${key} has ${audit.reading[key].count}`);
      assert.equal(audit.reading[key].meetsMin, true, key);
    }
    assert.equal(audit.meetsReadingRule, true);
    assert.equal(audit.meetsRule, true);
  });

  it('unplaced reading families are model-gated, never failures', () => {
    const audit = humanoidPopulationAudit(fieldRecords());
    assert.deepEqual([...audit.modelGatedReading].sort(), ['slot-03', 'slot-21', 'slot-38']);
    for (const key of audit.modelGatedReading) {
      assert.equal(audit.reading[key].count, 0);
      assert.equal(audit.reading[key].meetsMin, true);
      assert.match(audit.reading[key].note, /model-gated/);
    }
  });

  it('Korus, Ghorrum and the hero are singletons by design', () => {
    const audit = humanoidPopulationAudit(fieldRecords());
    assert.equal(audit.korus.count, 1);
    assert.equal(audit.watcher.count, 1);
    assert.equal(audit.hero.count, 1);
    assert.match(audit.hero.note, /player IS the hero/);
  });
});

describe('conductor — lifeFor + lifeLine', () => {
  it('same monster + time = same life, with garment + weapon on the line', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'acid', x: 0, z: 0 });
    const a = lifeFor(m, T0);
    const b = lifeFor(m, T0);
    assert.deepEqual(a, b);
    assert.equal(a.kind, 'monster');
    assert.equal(a.humanoidReading, true);
    assert.equal(a.stageName, 'Young');
    assert.equal(a.garment.summary, 'acid-wreathed figure');
    assert.equal(a.weapon.summary, 'ranged · 12 dmg · 22 m');
    assert.equal(a.line, 'Young · Roaming · Upright figure · acid-wreathed figure · ranged · 12 dmg · 22 m · acid');
  });

  it('a spotted upright family reads hunting you', () => {
    const m = createMonster({ id: 'm-2', type: 'slot-38', element: 'poison', x: 0, z: 0 });
    m.spotted = true;
    m.state = 'stalk';
    const life = lifeFor(m, T0);
    assert.equal(life.activity, 'stalk');
    assert.match(life.line, /Hunting you/);
    assert.match(life.line, /poison-wreathed figure/);
    assert.match(life.line, /ranged · 12 dmg · 22 m/);
  });

  it('an ambusher reads lying in wait', () => {
    const m = createMonster({ id: 'm-3', type: 'slot-29', element: 'acid', x: 0, z: 0 });
    const life = lifeFor(m, T0);
    assert.equal(life.activity, 'ambush-wait');
    assert.match(life.line, /Lying in wait/);
  });

  it('a dead monster reads Remains with a 45 s return', () => {
    const m = createMonster({ id: 'm-4', type: 'slot-01', element: 'acid', x: 0, z: 0 });
    damageMonster(m, 1000);
    const life = lifeFor(m, T0);
    assert.equal(life.state, 'dead');
    assert.match(life.line, /^Remains — Young Ooze Revenant · slain by the hunter · returns in \d+s$/);
  });

  it('a non-reading monster is never dressed as humanoid on its line', () => {
    const m = createMonster({ id: 'm-5', type: 'slot-12', element: 'shadow', x: 0, z: 0 });
    const life = lifeFor(m, T0);
    assert.equal(life.humanoidReading, false);
    assert.equal(life.role, 'Monster');
    assert.match(life.line, /Figure as modelled/);
  });

  it('Korus reads dormant / ready / combat with gate + casts on the line', () => {
    const dormant = lifeFor(createKorus(false), T0, { totalKills: 0 });
    assert.match(dormant.line, /Dormant/);
    assert.match(dormant.line, new RegExp(`gate opens at ${KORUS_GATE_KILLS}`));
    const ready = createKorus(true);
    assert.match(lifeFor(ready, T0, { totalKills: 40 }).line, /Waiting/);
    const combat = createKorus(true);
    combat.dormant = false;
    combat.awake = true;
    combat.hp = 500;
    const cl = lifeFor(combat, T0, { totalKills: 40 });
    assert.equal(cl.phase, 2);
    assert.match(cl.line, /Combat.*500\/1000 HP/);
    const dead = createKorus(true);
    dead.dormant = false;
    dead.awake = true;
    damageKorus(dead, KORUS_MAX_HP);
    assert.equal(lifeFor(dead, T0).line, 'Remains — Korus — the throne stands empty');
  });

  it('Ghorrum reads watching, never hostile; the hero reads as the player', () => {
    assert.equal(lifeFor('ghorrum', T0).line, 'Ghorrum, the Mountain’s Grin · Watching · never hostile');
    const hero = lifeFor({ kind: 'hero', heroKey: 'monster-hunter' }, T0);
    assert.equal(hero.kind, 'hero');
    assert.match(hero.line, /You — the player/);
    assert.match(hero.line, /Dark leathers/);
    assert.match(hero.line, /Hunting spear 38/);
  });

  it('enrichHumanoids adds life without dropping records', () => {
    const list = [
      createMonster({ id: 'm-1', type: 'slot-01', element: 'acid', x: 0, z: 0 }),
      createKorus(false),
      { kind: 'watcher' },
    ];
    const out = enrichHumanoids(list, T0, { totalKills: 0 });
    assert.equal(out.length, 3);
    assert.ok(out.every((h) => typeof h.life === 'object' && typeof h.life.line === 'string'));
    assert.equal(out[2].life.kind, 'watcher');
  });

  it('lifeLine of nothing is empty', () => {
    assert.equal(lifeLine(null), '');
    assert.equal(lifeFor(null), null);
  });
});

describe('earth2 + earth3 — no humanoid operator subjects', () => {
  it('Earth 3 spawns dinosaurs only — every species is kind dinosaur in the registry', () => {
    assert.equal(DINO_SPECIES.length, 17);
    for (const s of DINO_SPECIES) {
      const reg = EARTH2_MODELS.find((m) => m.slug === s.slug);
      assert.ok(reg, s.slug);
      assert.equal(reg.kind, 'dinosaur', s.slug);
    }
  });

  it('Earth 2 has no kind humanoid anywhere in its registry', () => {
    assert.ok(!EARTH2_MODELS.some((m) => m.kind === 'humanoid'));
    assert.ok(EARTH2_MODELS.filter((m) => m.kind === 'dinosaur').length >= 15);
  });

  it('Earth 2’s only humanoid-shaped entries are static scenery, not inhabitants', () => {
    const chars = EARTH2_MODELS.filter((m) => m.kind === 'character');
    assert.deepEqual(chars.map((m) => m.slug).sort(), ['dracula', 'hammond']);
    for (const c of chars) {
      // No diet, no HP, no AI — a placed GLB figure, never an operator subject.
      assert.equal(c.diet, undefined);
      assert.equal(c.hp, undefined);
      assert.ok(c.file && c.file.endsWith('.glb'));
    }
    // Hammond stands at the museum exchange (worldOnly); Dracula stands
    // at his court spot before the castle (draculaCourt) — neither walks,
    // hunts, eats, or dies in code.
    assert.equal(chars.find((c) => c.slug === 'hammond').worldOnly, true);
  });
});
