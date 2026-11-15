// tests/world-engine-datasheets-weapons.test.mjs
// Datasheets — WEAPON BUILDER / THE FORGE (Merlin, Nov 15, 2026):
// the weapons sheet (lib/world-engine/datasheets/weapons.js) holds
// everything the forge reads — archetypes, vocabularies, sliders,
// store defaults, finishes, the catalogue, the presenter roster,
// the cost + damage rules — and every entry traces to code that
// already carries it. The forge agent owns the behaviour; the
// sheet owns the data. The other 8 sheets live in
// tests/world-engine-datasheets.test.mjs.
//
// Run: node --test tests/world-engine-datasheets-weapons.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BUILDER,
  VALID_WEAPON_TYPES,
  VALID_STOCK_TYPES,
  VALID_OPTIC_TYPES,
  DEFAULT_WEAPON_PARAMS,
  WEAPON_ARCHETYPES,
  PARAM_RANGES,
  WEAPON_SLIDERS,
  WEAPON_STORE_DEFAULTS,
  FINISHES,
  FORGE_CATALOGUE,
  PATRON_ROSTER,
  FORGE_COST,
  DAMAGE_RULES,
  WEAPON_PRESETS,
} from '../lib/world-engine/datasheets/weapons.js';
import { FORGE_WEAPONS } from '../lib/backpack/weapons.js';
import { PATRON_IDS } from '../lib/backpack/patrons.js';
import { PORTAL_GUN_FORGE_PROMPT, validateForgePrompt } from '../lib/world-engine/forge-agent.js';
import {
  VALID_WEAPON_TYPES as AESTHETIC_WEAPON_TYPES,
  VALID_STOCK_TYPES as AESTHETIC_STOCK_TYPES,
  VALID_OPTIC_TYPES as AESTHETIC_OPTIC_TYPES,
  DEFAULT_WEAPON_PARAMS as AESTHETIC_DEFAULT_WEAPON_PARAMS,
} from '../lib/world-engine/aesthetic.js';
import { SECTORS } from '../lib/world-engine/sectors.js';
import { costFor, FREE_GENERATIONS_PER_MONTH } from '../lib/world-engine/economy.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('the weapons sheet', () => {
  it('names the builder: the forge, gold, 100 Aether', () => {
    assert.equal(BUILDER.id, 'weapons');
    assert.equal(BUILDER.route, '/world-engine/weapons');
    assert.equal(BUILDER.name, 'Weapon Builder');
    assert.equal(BUILDER.category, 'weapon');
    assert.equal(BUILDER.accent, '#ffd700');
    assert.equal(BUILDER.costAether, 100);
    assert.equal(BUILDER.costAether, costFor('weapon'));
    assert.equal(BUILDER.storeKey, 'weapon');
    assert.equal(BUILDER.storeSetter, 'setWeaponParams');
  });

  it('vocabularies match the aesthetic clamps + the builder', () => {
    assert.deepEqual(VALID_WEAPON_TYPES, ['rifle', 'smg', 'precision']);
    assert.deepEqual(VALID_STOCK_TYPES, ['telescoping', 'wire', 'precision', 'none']);
    assert.deepEqual(VALID_OPTIC_TYPES, ['iron', 'red-dot', 'scope', 'none']);
    assert.deepEqual(DEFAULT_WEAPON_PARAMS, {
      weaponType: 'rifle',
      barrelLength: 0.9,
      stockType: 'telescoping',
      opticType: 'iron',
      finishColor: '#1c1f26',
      damageRating: 10,
    });
    // The sheet is the source the aesthetic layer re-exports.
    assert.ok(read('lib/world-engine/aesthetic.js').includes("from './datasheets/weapons.js'"));
    // ...and the re-export carries the same values at runtime.
    assert.deepEqual(AESTHETIC_WEAPON_TYPES, VALID_WEAPON_TYPES);
    assert.deepEqual(AESTHETIC_STOCK_TYPES, VALID_STOCK_TYPES);
    assert.deepEqual(AESTHETIC_OPTIC_TYPES, VALID_OPTIC_TYPES);
    assert.deepEqual(AESTHETIC_DEFAULT_WEAPON_PARAMS, DEFAULT_WEAPON_PARAMS);
  });

  it('carries the three archetypes with their per-type defaults', () => {
    assert.deepEqual(WEAPON_ARCHETYPES.map((a) => a.weaponType), ['rifle', 'smg', 'precision']);
    const byType = Object.fromEntries(WEAPON_ARCHETYPES.map((a) => [a.weaponType, a]));
    assert.equal(byType.rifle.defaultOptic, 'iron');
    assert.equal(byType.rifle.defaultStock, 'telescoping');
    assert.equal(byType.smg.defaultOptic, 'red-dot');
    assert.equal(byType.smg.defaultStock, 'wire');
    assert.equal(byType.precision.defaultOptic, 'scope');
    assert.equal(byType.precision.defaultStock, 'precision');
    for (const a of WEAPON_ARCHETYPES) {
      assert.equal(a.barrelLength, 0.9);
      assert.ok(a.blurb.includes('gold Omega mark'));
    }
  });

  it('sliders match the forge form: Length 0.1–5, Damage 1–100', () => {
    assert.equal(WEAPON_SLIDERS.length, 2);
    assert.deepEqual(
      WEAPON_SLIDERS.map((s) => [s.key, s.min, s.max, s.default]),
      [['length', 0.1, 5, 1.0], ['damage', 1, 100, 10]]
    );
    // ...and the sector reads them from the sheet (sectors.js attaches
    // the parse functions, so compare field-by-field, not by identity).
    const got = SECTORS.weapons.sliders;
    assert.equal(got.length, WEAPON_SLIDERS.length);
    for (let idx = 0; idx < WEAPON_SLIDERS.length; idx++) {
      for (const field of ['key', 'label', 'min', 'max', 'step', 'default']) {
        assert.equal(got[idx][field], WEAPON_SLIDERS[idx][field], `weapons.${WEAPON_SLIDERS[idx].key}.${field}`);
      }
      assert.equal(typeof got[idx].parse, 'function', 'weapons parse');
      assert.equal(typeof got[idx].format, 'function', 'weapons format');
    }
    assert.equal(got[0].format(1.0), '1.0 m');
    assert.equal(got[1].format(10), '10 AP');
  });

  it('store defaults match the engine store', () => {
    assert.deepEqual(WEAPON_STORE_DEFAULTS, {
      scale: { x: 1, y: 1, z: 1 },
      length: 1.0,
      damage: 10,
      material: 'metal',
      color: '#ffd700',
    });
    assert.ok(read('lib/world-engine/useEngineStore.js').includes("from './datasheets/weapons.js'"));
    assert.ok(read('lib/world-engine/useEngineStore.js').includes('const defaultWeapon = WEAPON_STORE_DEFAULTS;'));
  });

  it('finishes are the three the code already names', () => {
    assert.deepEqual(FINISHES.map((f) => f.hex), ['#1c1f26', '#ffd700', '#f2f0ea']);
    assert.ok(FINISHES.every((f) => /^#[0-9A-F]{6}$/i.test(f.hex)));
  });

  it('catalogue is the forge catalogue: all 13, costs intact', () => {
    assert.equal(FORGE_CATALOGUE.length, 13);
    assert.deepEqual(FORGE_CATALOGUE, FORGE_WEAPONS.map((w) => ({
      id: w.id, name: w.name, weaponClass: w.weaponClass,
      damage: w.damage, rarity: w.rarity, cost: w.cost, blurb: w.blurb,
    })));
  });

  it('roster is the four patrons + the portal system', () => {
    assert.equal(PATRON_ROSTER.length, 5);
    assert.deepEqual([...PATRON_ROSTER.slice(0, 4).map((p) => p.id)].sort(), [...PATRON_IDS].sort());
    const portal = PATRON_ROSTER[4];
    assert.equal(portal.id, 'portal-system');
    assert.equal(portal.presenter, 'portal-system');
    assert.ok(PATRON_ROSTER.slice(0, 4).every((p) => p.presenter === 'patron'));
  });

  it('cost + damage rules match the economy and the mint law', () => {
    assert.equal(FORGE_COST.aetherPerGeneration, 100);
    assert.equal(FORGE_COST.freeGenerationsPerMonth, FREE_GENERATIONS_PER_MONTH);
    assert.equal(FORGE_COST.freeGenerationsPerMonth, 20);
    assert.equal(FORGE_COST.patronCommissionCost, 0);
    assert.deepEqual(
      [DAMAGE_RULES.promptMin, DAMAGE_RULES.promptMax, DAMAGE_RULES.backpackMin, DAMAGE_RULES.backpackMax],
      [0, 100, 5, 40]
    );
    assert.match(DAMAGE_RULES.zeroMeans, /opens, it does not wound/);
  });

  it('every preset is a valid forge prompt, and the Portal Gun preset IS the agent prompt', () => {
    const gun = WEAPON_PRESETS.find((p) => p.id === 'portal-gun');
    assert.ok(gun);
    assert.deepEqual(gun.prompt, PORTAL_GUN_FORGE_PROMPT);
    for (const preset of WEAPON_PRESETS) {
      const v = validateForgePrompt(preset.prompt);
      assert.equal(v.ok, true, `${preset.id}: ${JSON.stringify(v.errors)}`);
    }
    assert.deepEqual(WEAPON_PRESETS.map((p) => p.id), ['portal-gun', 'assault-rifle', 'smg', 'precision-rifle']);
  });

  it('ranges pin the builder clamps', () => {
    assert.deepEqual(PARAM_RANGES.barrelLength, { min: 0.3, max: 2.0, fallback: 0.9 });
    assert.deepEqual(PARAM_RANGES.damageRating, { min: 1, max: 100, fallback: 10 });
    assert.deepEqual(PARAM_RANGES.length, { min: 0.1, max: 5, fallback: 1.0 });
    assert.deepEqual(PARAM_RANGES.promptDamage, { min: 0, max: 100, fallback: 10 });
  });
});
