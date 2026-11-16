// tests/hollow-earth-operators.test.mjs
// HOLLOW EARTH (OLYMPIAN MONSTERVERSE) — OPERATOR AGENTS
// (Merlin, Nov 14 ~22:56 / behaviour logic Nov 14 ~22:59;
// seven-agent life line Nov 16 ~02:31, savagery Nov 16):
// monsters die by combat / predation / territorial-duel / age
// and respawn after 45 s as the next generation in the same
// slot; Korus dies once, by combat; Ghorrum never dies;
// monsters hunt the user AND each other (prey hunts, duels);
// the population rule holds for placed families (spawnField
// PASS 1 guarantees 2 each) and 3 Stormwings.
//
// Run: node --test tests/hollow-earth-operators.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MONSTER_TYPES,
  spawnField,
  createMonster,
  damageMonster,
  createKorus,
  damageKorus,
  KORUS_GATE_KILLS,
  KORUS_MAX_HP,
  RESPAWN_S,
} from '../app/hollow-earth/spawns.js';
import {
  MONSTER_FAMILIES,
  EXTRA_FAMILIES,
  FAMILIES_BY_HABITAT,
} from '../app/hollow-earth/families.js';
import { PLACED_FIELD_KEYS } from '../app/hollow-earth/models.js';
import { WATCHER } from '../app/hollow-earth/watcher.js';
import {
  growthStage,
  canHatchMore,
} from '../lib/earth2/breeding.js';
import {
  MIN_COPIES_PER_FAMILY,
  MIN_COPIES_PER_DRAGON,
  isPlacedFamily,
  monsterLifeFor,
  korusLifeFor,
  watcherLifeFor,
  lifeFor,
  enrichCreatures,
  populationAudit,
  fieldPopulation,
} from '../app/hollow-earth/operators.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

// Deterministic habitat reader: every band is reachable, so
// PASS 1 can place its guaranteed pair in-band for each family.
const HABITATS = Object.keys(FAMILIES_BY_HABITAT);
function habitatAt(x, z) {
  const h = Math.abs(Math.floor(x * 0.7 + z * 1.3)) % HABITATS.length;
  return HABITATS[h];
}

describe('deterministic life', () => {
  it('same monster + time = same state on two calls', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'fire', x: 10, z: 20 }, () => 0.5);
    const a = lifeFor(m, T0);
    const b = lifeFor(m, T0);
    assert.deepEqual(a, b);
    assert.equal(a.realm, 'hollow-earth');
    assert.equal(a.state, 'alive');
  });

  it('enrichCreatures adds life without dropping records', () => {
    const list = [
      { kind: 'monster', type: 'slot-01', element: 'fire', x: 0, z: 0, hp: 150, state: 'idle', spotted: false, dead: false, active: true },
      { kind: 'boss', hp: 1000, dormant: true, awake: false, dead: false },
      { kind: 'watcher' },
    ];
    const out = enrichCreatures(list, T0, { totalKills: 0 });
    assert.equal(out.length, 3);
    for (const c of out) assert.ok(c.life && typeof c.life.line === 'string');
  });
});

describe('death law — combat kills, 45 s respawn to the next generation', () => {
  it('monsters do not age: an idle monster far in the future is still alive', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'fire', x: 0, z: 0 }, () => 0.5);
    const life = lifeFor(m, T0 + 100 * 365.25 * 86400000);
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, null);
  });

  it('a killed monster records combat death and a 45 s respawn', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'fire', x: 0, z: 0 }, () => 0.5);
    const hp = m.hp;
    assert.ok(hp >= 100 && hp <= 200); // the HP band rule
    const killed = damageMonster(m, 1000);
    assert.equal(killed, true);
    assert.equal(m.dead, true);
    const life = monsterLifeFor(m, T0);
    assert.equal(life.state, 'dead');
    assert.equal(life.deathCause, 'combat');
    assert.equal(life.respawnAt, m.respawnAtMs);
    assert.equal(m.respawnAtMs - m.diedAtMs, 45000); // the 45 s window
    assert.equal(life.respawnNote, 'Returns in 45 s, same family, near where it fell');
    assert.match(life.line, new RegExp(`^Remains — ${MONSTER_TYPES['slot-01'].name} · slain by the hunter · returns in \\d+s$`));
  });

  it('RESPAWN_S is the 45 s respawn window', () => {
    assert.equal(RESPAWN_S, 45);
  });

  it('Korus dies once, by combat — death is permanent', () => {
    const k = createKorus(true);
    assert.equal(k.dormant, false);
    const killed = damageKorus(k, KORUS_MAX_HP);
    assert.equal(killed, true);
    assert.equal(k.dead, true);
    const life = korusLifeFor(k, T0, { totalKills: 40 });
    assert.equal(life.state, 'dead');
    assert.equal(life.deathCause, 'combat');
    assert.equal(life.line, 'Remains — Korus — the throne stands empty');
    // A second blow changes nothing (already dead).
    assert.equal(damageKorus(k, 100), false);
  });

  it('the Korus gate is 40 kills; dormant Korus cannot be fought', () => {
    const locked = korusLifeFor(createKorus(false), T0, { totalKills: 0 });
    assert.equal(locked.state, 'dormant');
    assert.equal(locked.gateOpen, false);
    assert.equal(locked.gateKills, KORUS_GATE_KILLS);
    assert.equal(KORUS_GATE_KILLS, 40);
    const open = korusLifeFor(createKorus(true), T0, { totalKills: 40 });
    assert.equal(open.gateOpen, true);
  });

  it('Ghorrum never dies: non-hostile, excluded from combat and the hunt', () => {
    assert.equal(WATCHER.nonHostile, true);
    assert.equal(WATCHER.excludedFromCombat, true);
    assert.equal(WATCHER.excludedFromHunt, true);
    const life = watcherLifeFor(T0 + 100 * 365.25 * 86400000);
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, null);
    assert.equal(life.line, `${WATCHER.name} · Watching · never hostile`);
  });
});

describe('user-hunt branch (applies) vs corpse fight (does not)', () => {
  it('a spotted monster hunts the user; an unspotted one roams or waits', () => {
    const hunter = createMonster({ id: 'm-1', type: 'slot-01', element: 'fire', x: 0, z: 0 }, () => 0.5);
    hunter.spotted = true;
    hunter.state = 'stalk';
    assert.equal(lifeFor(hunter, T0).feeding, 'hunt-user');
    const roamer = createMonster({ id: 'm-2', type: 'slot-01', element: 'fire', x: 0, z: 0 }, () => 0.5);
    assert.equal(lifeFor(roamer, T0).feeding, 'roam');
    const ambusher = createMonster({ id: 'm-3', type: 'slot-07', element: 'shadow', x: 0, z: 0 }, () => 0.5);
    // slot-07's attitude comes from its family entry.
    assert.ok(['ambush-wait', 'roam'].includes(lifeFor(ambusher, T0).feeding));
  });

  it('monsters never report a territory duel or a corpse contest', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'fire', x: 0, z: 0 }, () => 0.5);
    m.spotted = true;
    const life = lifeFor(m, T0);
    assert.equal(life.territory, 'none');
    assert.equal(life.duel, null);
  });

  it('a wounded monster spots its hunter (pain wakes it)', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'fire', x: 0, z: 0 }, () => 0.5);
    assert.equal(m.spotted, false);
    damageMonster(m, 10);
    assert.equal(m.spotted, true);
    assert.equal(m.dead, false);
  });
});

describe('population rule (Merlin Nov 14 ~22:57)', () => {
  it('spawnField PASS 1 already guarantees 2 of every placed family', () => {
    const { records, audit } = fieldPopulation(77701, { habitatAt });
    assert.equal(audit.meetsRule, true);
    assert.equal(audit.total, records.length);
    for (const [key, f] of Object.entries(audit.families)) {
      if (f.placed) {
        assert.ok(f.count >= MIN_COPIES_PER_FAMILY, `${key}: only ${f.count}`);
        assert.equal(f.meetsMin, true);
      } else {
        assert.equal(f.count, 0);
      }
    }
  });

  it('dragons: exactly 3 Stormwings (placed); Cinder and Muse are model-gated at zero', () => {
    const { audit } = fieldPopulation(77701, { habitatAt });
    assert.equal(audit.dragons['sky-dragon'].count, MIN_COPIES_PER_DRAGON);
    assert.equal(audit.dragons['sky-dragon'].placed, true);
    assert.equal(audit.dragons['cinder-dragon'].count, 0);
    assert.equal(audit.dragons['cinder-dragon'].placed, false);
    assert.equal(audit.dragons['muse-dragon'].count, 0);
    assert.equal(audit.dragons['muse-dragon'].placed, false);
    assert.equal(isPlacedFamily('sky-dragon'), true);
    assert.equal(isPlacedFamily('cinder-dragon'), false);
  });

  it('model-gated families are reported, never silently counted as failures', () => {
    const { audit } = fieldPopulation(77701, { habitatAt });
    assert.ok(audit.modelGated.length > 0);
    for (const key of audit.modelGated) {
      assert.equal(audit.families[key].placed, false);
      assert.equal(audit.families[key].meetsMin, true);
    }
    // 48 types total: 37 slot + 11 extra.
    assert.equal(Object.keys(MONSTER_FAMILIES).length, 37);
    assert.equal(Object.keys(EXTRA_FAMILIES).length, 11);
    assert.equal(Object.keys(audit.families).length, 48);
    assert.equal(PLACED_FIELD_KEYS.length, 24);
  });

  it('populationAudit is deterministic for the same field', () => {
    const r1 = spawnField(77701, { habitatAt });
    const r2 = spawnField(77701, { habitatAt });
    assert.deepEqual(populationAudit(r1), populationAudit(r2));
  });

  it('Korus and Ghorrum are singletons by design', () => {
    const { audit } = fieldPopulation(77701, { habitatAt });
    assert.equal(audit.korus.count, 1);
    assert.equal(audit.watcher.count, 1);
  });
});

describe('tap-card life line', () => {
  it('monster: name · roaming/hunting · element', () => {
    const m = createMonster({ id: 'm-1', type: 'slot-01', element: 'acid', x: 0, z: 0 }, () => 0.5);
    const line = lifeFor(m, T0).line;
    assert.match(line, new RegExp(`^${MONSTER_TYPES['slot-01'].name} · (Young|Juvenile|Adult|Elder) · Roaming · acid$`));
    m.spotted = true;
    assert.match(lifeFor(m, T0).line, /Hunting you/);
  });

  it('boss: dormant line names the gate', () => {
    assert.match(korusLifeFor(createKorus(false), T0, { totalKills: 0 }).line, /Dormant · gate opens at 40 kills/);
  });

  it('backpack law is untouched: caps 1 / 4, growth 1 d / 7 d', () => {
    assert.deepEqual(canHatchMore([], false, []), { ok: true, cap: 1, raised: 0 });
    assert.deepEqual(canHatchMore([], true, []), { ok: true, cap: 4, raised: 0 });
    assert.equal(growthStage(T0, T0 + 8 * 86400000), 'adult');
  });
});
