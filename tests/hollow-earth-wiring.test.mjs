// tests/hollow-earth-wiring.test.mjs
// HOLLOW EARTH — OPERATOR WIRING (Nov 14): BUILD 3 is VERIFY,
// NOT FIX — the zone's real spawn path is audited here and
// nothing is wired for population (spawnField PASS 1 already
// guarantees 2 of every placed family in-band, 3 Stormwings).
// BUILD 4: monsters / Korus report their life line on the
// strike notice in page.jsx — the pure helpers are tested here,
// no DOM. Tap is still strike.
//
// The call below replicates the zone's call EXACTLY (zone.js):
//   spawnField(def.seed || 77701, { habitatAt: (x, z) => biomeAt(x, z).dominant })
// and the page passes DATA.WORLD (seed 77701) as def.
// fieldPopulation runs that call through populationAudit.
//
// Run: node --test tests/hollow-earth-wiring.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WORLD } from '../app/hollow-earth/data.js';
import { biomeAt } from '../app/hollow-earth/biomes.js';
import { MONSTER_FAMILIES, EXTRA_FAMILIES } from '../app/hollow-earth/families.js';
import { PLACED_FIELD_KEYS } from '../app/hollow-earth/models.js';
import {
  MONSTER_TYPES,
  createMonster,
  damageMonster,
  createKorus,
  damageKorus,
} from '../app/hollow-earth/spawns.js';
import * as HEOP from '../app/hollow-earth/operators.js';
import {
  fieldPopulation,
  monsterLifeFor,
  korusLifeFor,
  watcherLifeFor,
} from '../app/hollow-earth/operators.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

// The zone's call, replicated exactly: the world seed the page
// passes, with the biome field's dominant band as the reader.
function zoneField() {
  return fieldPopulation(WORLD.seed, { habitatAt: (x, z) => biomeAt(x, z).dominant });
}

describe('BUILD 3 — population verified on the real spawn path, not fixed', () => {
  it('the page passes the world seed the zone reads', () => {
    assert.equal(WORLD.seed, 77701, 'DATA.WORLD.seed is the zone seed');
  });

  it('the field audit passes on the zone’s real call', () => {
    const { records, audit } = zoneField();
    assert.ok(audit.meetsRule, 'population rule holds on the real field');
    assert.ok(records.length >= 150, `field filled (${records.length})`);
    const placed = Object.entries(audit.families).filter(([, f]) => f.placed);
    assert.equal(placed.length, 23, '23 placed families on the field');
    for (const [key, f] of placed) {
      assert.ok(f.meetsMin, `${key} meets the 2-copy minimum (${f.count})`);
    }
    assert.equal(audit.dragons['sky-dragon'].count, 3, '3 Stormwings');
    assert.ok(audit.dragons['sky-dragon'].meetsMin, 'Stormwing meets the 3-copy minimum');
    // Unplaced dragons spawn zero by design (no GLB — model-gated).
    assert.equal(audit.dragons['cinder-dragon'].count, 0, 'Cinder Maw: no GLB, zero');
    assert.equal(audit.dragons['muse-dragon'].count, 0, 'Muse: no GLB, zero');
    assert.equal(audit.modelGated.length, 25, '25 families model-gated');
  });

  it('the guarantee is in-band, not the anchor fallback', () => {
    const { records } = zoneField();
    const famHab = {};
    for (const [k, f] of Object.entries({ ...MONSTER_FAMILIES, ...EXTRA_FAMILIES })) famHab[k] = f.habitat;
    const inBand = {};
    for (const r of records) {
      if (biomeAt(r.x, r.z).dominant === famHab[r.type]) inBand[r.type] = (inBand[r.type] || 0) + 1;
    }
    for (const key of PLACED_FIELD_KEYS) {
      if (key === 'sky-dragon' || key === 'cinder-dragon' || key === 'muse-dragon') continue;
      assert.ok((inBand[key] || 0) >= 2, `${key} has ${(inBand[key] || 0)} in-band copies`);
    }
    const stormwings = records.filter((r) => r.type === 'sky-dragon');
    assert.equal(
      stormwings.filter((r) => biomeAt(r.x, r.z).dominant === 'mountain').length,
      3, 'all 3 Stormwings sit in the mountain band',
    );
  });

  it('no placedCreatureExtras exists for Hollow Earth — by design, nothing to wire', () => {
    assert.equal(typeof HEOP.placedCreatureExtras, 'undefined');
  });
});

describe('BUILD 4 — life lines (pure helpers the page notices)', () => {
  // A real placed family, so the line carries its true name.
  const TYPE = PLACED_FIELD_KEYS.find((k) => k !== 'sky-dragon');
  const NAME = MONSTER_TYPES[TYPE].name;

  it('monster: roaming line, hunting line once spotted, Remains line when dead', () => {
    const m = createMonster(
      { id: 'm-1', type: TYPE, element: MONSTER_TYPES[TYPE].element, x: 10, z: 20 },
      () => 0.5,
    );
    assert.match(monsterLifeFor(m, T0).line, new RegExp(`^${NAME} · (Young|Juvenile|Adult|Elder) · Roaming`), 'roaming line');
    m.spotted = true;
    m.state = 'stalk';
    assert.match(monsterLifeFor(m, T0).line, /Hunting you/);
    assert.equal(damageMonster(m, 99999), true, 'killing blow');
    assert.match(
      monsterLifeFor(m, T0).line,
      new RegExp(`^Remains — ${NAME} · slain by the hunter · returns in \\d+s$`),
    );
  });

  it('Korus: dormant names the gate, combat names HP, dead is Remains', () => {
    const dormant = createKorus(false);
    assert.equal(
      korusLifeFor(dormant, T0, { totalKills: 0 }).line,
      'Korus · Dormant · gate opens at 40 kills',
    );
    const ready = createKorus(true);
    assert.equal(korusLifeFor(ready, T0, { totalKills: 40 }).line, 'Korus · Waiting · approach within 30 m to wake him');
    ready.awake = true; // the wake stepBoss-equivalent: stepKorus flips this on approach
    assert.equal(korusLifeFor(ready, T0, { totalKills: 40 }).line, 'Korus · Combat · 1000/1000 HP');
    const slain = createKorus(true);
    slain.awake = true;
    assert.equal(damageKorus(slain, 99999), true);
    assert.equal(korusLifeFor(slain, T0, { totalKills: 40 }).line, 'Remains — Korus — the throne stands empty');
  });

  it('Ghorrum: the watcher line exists — but no surface in the page ever shows it', () => {
    assert.match(watcherLifeFor(T0).line, /Watching · never hostile/);
  });
});
