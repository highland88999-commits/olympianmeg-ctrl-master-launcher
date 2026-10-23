// tests/backpack.test.mjs
// THE BACKPACK (Merlin, 2026-10-23): the pure record module
// (lib/backpack/backpack.js) — item stacks, the style shelf, and
// above all THE RETICLE LAW ("all weapons have a reticle"): no
// code path may produce a weapon entry without meta.reticle.
// Plus the Earth 2 bridge (lib/backpack/earth2-bridge.js): the
// blood-sac state adapter, fossil mapping, and the one-way
// migration of the old device tallies.
//
// Run: node --test tests/backpack.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKPACK_STYLES,
  DEFAULT_BACKPACK_STYLE,
  RETICLE_STYLES,
  backpackStyleById,
  createItem,
  emptyBackpackRecord,
  sanitizeBackpackRecord,
  addItem,
  removeItem,
  removeEntry,
  countItem,
  itemsOfKind,
  setBackpackStyle,
  weaponReticle,
  defaultReticleForClass,
} from '../lib/backpack/backpack.js';
import {
  bloodStateFromRecord,
  withBloodState,
  collectSacInRecord,
  offerSacInRecord,
  applyFossilExchangeInRecord,
  fossilItemsFromRecord,
  addFossilsToRecord,
  removeFossilFromRecord,
  migrateEarth2Tallies,
  sacCount,
} from '../lib/backpack/earth2-bridge.js';

describe('the record', () => {
  it('an empty record is valid and wears the default style', () => {
    const rec = emptyBackpackRecord();
    assert.equal(rec.style, DEFAULT_BACKPACK_STYLE);
    assert.deepEqual(rec.items, []);
    assert.deepEqual(rec.tallies, { gold: 0, aether: 0 });
    assert.equal(rec.migratedE2, false);
  });

  it('sanitize coerces junk into an empty record, never null', () => {
    for (const junk of [null, undefined, 42, 'pack', [], { items: 'no' }]) {
      const rec = sanitizeBackpackRecord(junk);
      assert.ok(rec && Array.isArray(rec.items));
    }
  });

  it('sanitize drops malformed items and keeps good ones', () => {
    const rec = sanitizeBackpackRecord({
      items: [
        { id: 'blood-sac', kind: 'material', name: 'Blood sac', qty: 2, meta: {} },
        { id: 7, kind: 'material', name: 'bad id' },
        { kind: 'weapon', name: 'no id' },
        null,
      ],
    });
    assert.equal(rec.items.length, 1);
    assert.equal(rec.items[0].qty, 2);
  });
});

describe('items: stacking and removal', () => {
  const sac = { id: 'blood-sac', kind: 'material', name: 'Blood sac', meta: {} };

  it('plain materials stack by id', () => {
    let rec = addItem(emptyBackpackRecord(), sac, 2);
    rec = addItem(rec, sac, 3);
    assert.equal(rec.items.length, 1);
    assert.equal(countItem(rec, 'blood-sac'), 5);
  });

  it('removeItem peels a stack and refuses an overdraw', () => {
    let rec = addItem(emptyBackpackRecord(), sac, 4);
    rec = removeItem(rec, 'blood-sac', 3);
    assert.equal(countItem(rec, 'blood-sac'), 1);
    const same = removeItem(rec, 'blood-sac', 5);
    assert.equal(countItem(same, 'blood-sac'), 1);
    rec = removeItem(rec, 'blood-sac', 1);
    assert.equal(countItem(rec, 'blood-sac'), 0);
    assert.equal(rec.items.length, 0);
  });

  it('helpers never mutate the input record', () => {
    const before = addItem(emptyBackpackRecord(), sac, 2);
    const frozen = JSON.stringify(before);
    addItem(before, sac, 1);
    removeItem(before, 'blood-sac', 1);
    assert.equal(JSON.stringify(before), frozen);
  });

  it('itemsOfKind groups by kind', () => {
    let rec = addItem(emptyBackpackRecord(), sac, 1);
    rec = addItem(rec, { id: 'pebble', kind: 'collectible', name: 'Lucky pebble', meta: {} });
    assert.equal(itemsOfKind(rec, 'material').length, 1);
    assert.equal(itemsOfKind(rec, 'collectible').length, 1);
    assert.equal(itemsOfKind(rec, 'weapon').length, 0);
  });
});

describe('THE RETICLE LAW', () => {
  it('a weapon created without a reticle is stamped with its class default', () => {
    const rifle = createItem({ id: 'w1', kind: 'weapon', name: 'Rifle', meta: { weaponClass: 'firearm' } });
    assert.deepEqual(rifle.meta.reticle, { style: 'crosshair' });
    const bow = createItem({ id: 'w2', kind: 'weapon', name: 'Bow', meta: { weaponClass: 'bow' } });
    assert.deepEqual(bow.meta.reticle, { style: 'chevron' });
    const club = createItem({ id: 'w3', kind: 'weapon', name: 'Club', meta: { weaponClass: 'blunt' } });
    assert.deepEqual(club.meta.reticle, { style: 'dot' });
  });

  it('every class in the law’s table maps to a real style', () => {
    for (const cls of ['firearm', 'bow', 'spear', 'blade', 'blunt', 'cane', 'staff', 'mystery']) {
      assert.ok(RETICLE_STYLES.includes(defaultReticleForClass(cls)), cls);
    }
  });

  it('an explicit valid reticle is kept; an invalid one is coerced to the class default', () => {
    const kept = createItem({ id: 'w', kind: 'weapon', name: 'W', meta: { weaponClass: 'blade', reticle: { style: 'chevron' } } });
    assert.equal(kept.meta.reticle.style, 'chevron');
    const coerced = createItem({ id: 'w', kind: 'weapon', name: 'W', meta: { weaponClass: 'blade', reticle: { style: 'laser-grid' } } });
    assert.equal(coerced.meta.reticle.style, 'dot');
    const bare = createItem({ id: 'w', kind: 'weapon', name: 'W', meta: { weaponClass: 'blade', reticle: 'crosshair' } });
    assert.equal(bare.meta.reticle.style, 'dot');
  });

  it('sanitize forces a reticle onto a weapon that arrives without one', () => {
    const rec = sanitizeBackpackRecord({
      items: [{ id: 'w', kind: 'weapon', name: 'Old Blade', qty: 1, meta: { weaponClass: 'blade' } }],
    });
    assert.equal(rec.items[0].meta.reticle.style, 'dot');
    assert.deepEqual(weaponReticle(rec.items[0]), { style: 'dot' });
  });

  it('weapons never stack — two of the same weapon are two entries', () => {
    const w = { id: 'flint-shiv', kind: 'weapon', name: 'Flint Shiv', meta: { weaponClass: 'blade' } };
    let rec = addItem(emptyBackpackRecord(), w);
    rec = addItem(rec, w);
    const weapons = itemsOfKind(rec, 'weapon');
    assert.equal(weapons.length, 2);
    assert.ok(weapons.every((e) => e.qty === 1));
    assert.notEqual(weapons[0].uid, weapons[1].uid);
  });

  it('weaponReticle is null for non-weapons', () => {
    const item = createItem({ id: 'x', kind: 'material', name: 'X', meta: {} });
    assert.equal(weaponReticle(item), null);
  });
});

describe('styles', () => {
  it('the GTA packs lead the shelf', () => {
    assert.ok(BACKPACK_STYLES.length >= 5);
    assert.ok(BACKPACK_STYLES.slice(0, 3).every((s) => s.id.startsWith('gta-')));
    for (const s of BACKPACK_STYLES) {
      assert.ok(s.shell && s.trim && s.accent && s.name && s.blurb, s.id);
    }
  });

  it('setBackpackStyle validates against the shelf', () => {
    const rec = setBackpackStyle(emptyBackpackRecord(), 'gta-vice');
    assert.equal(rec.style, 'gta-vice');
    const same = setBackpackStyle(rec, 'not-a-style');
    assert.equal(same.style, 'gta-vice');
    assert.equal(backpackStyleById('olympus-aegis').name, 'Aegis Field Pack');
  });
});

describe('the Earth 2 bridge', () => {
  const fossil = {
    id: 'fossil-t-rex-tooth-abc', species: 'tyrannosaurus-rex', speciesName: 'Tyrannosaurus Rex',
    type: 'T. rex tooth', condition: 'complete', baseGold: 110, goldValue: 110,
  };

  it('blood state round-trips through the record', () => {
    let rec = emptyBackpackRecord();
    rec = collectSacInRecord(collectSacInRecord(rec));
    assert.equal(sacCount(rec), 2);
    const state = bloodStateFromRecord(rec);
    assert.equal(state.sacs, 2);
    const back = withBloodState(rec, { ...state, gold: 40, aether: 3 });
    assert.equal(back.tallies.gold, 40);
    assert.equal(back.tallies.aether, 3);
    assert.equal(sacCount(back), 2);
  });

  it('offerSacInRecord consumes a sac and shelves a gifted weapon — with a reticle', () => {
    let rec = collectSacInRecord(emptyBackpackRecord());
    const gift = { id: 'weapon-silverfang', kind: 'weapon', label: 'Silverfang Dagger', rarity: 'rare', gold: 0, aether: 0, weapon: 'Silverfang Dagger' };
    const res = offerSacInRecord(rec, gift, 1234);
    assert.equal(res.ok, true);
    assert.equal(sacCount(res.record), 0);
    const weapons = itemsOfKind(res.record, 'weapon');
    assert.equal(weapons.length, 1);
    assert.equal(weapons[0].name, 'Silverfang Dagger');
    assert.equal(weapons[0].meta.reticle.style, 'dot'); // blade default
    assert.equal(res.record.history[0].label, 'Silverfang Dagger');
    // No sacs left: the offer is refused and the record untouched.
    const refused = offerSacInRecord(res.record, gift, 1235);
    assert.equal(refused.ok, false);
  });

  it('a gold gift lands on the field tallies, not the items', () => {
    let rec = collectSacInRecord(emptyBackpackRecord());
    const res = offerSacInRecord(rec, { id: 'gold-100', kind: 'gold', label: '100 gold', rarity: 'common', gold: 100, aether: 0, weapon: null }, 1);
    assert.equal(res.record.tallies.gold, 100);
    assert.equal(itemsOfKind(res.record, 'weapon').length, 0);
  });

  it('applyFossilExchangeInRecord settles a Hammond trade into the tallies', () => {
    const rec = emptyBackpackRecord();
    const record = {
      fossilId: fossil.id, species: fossil.species, speciesName: fossil.speciesName,
      type: fossil.type, condition: 'complete', goldValue: 110,
      currencyChoice: 'gold', outcome: 'gold', amount: 110,
      weapon: null, weaponId: null, weaponRarity: null, substitutionRoll: 0.5, refinedFallback: false,
    };
    const next = applyFossilExchangeInRecord(rec, record, 99);
    assert.equal(next.tallies.gold, 110);
    assert.equal(next.history[0].kind, 'gold');
  });

  it('fossils are individual specimens in the pack', () => {
    let rec = addFossilsToRecord(emptyBackpackRecord(), [fossil]);
    assert.equal(fossilItemsFromRecord(rec).length, 1);
    assert.equal(fossilItemsFromRecord(rec)[0].id, fossil.id);
    // The same specimen cannot be added twice.
    rec = addFossilsToRecord(rec, [fossil]);
    assert.equal(fossilItemsFromRecord(rec).length, 1);
    rec = removeFossilFromRecord(rec, fossil.id);
    assert.equal(fossilItemsFromRecord(rec).length, 0);
    // Removing an unheld fossil is a no-op.
    assert.equal(removeFossilFromRecord(rec, 'nope').items.length, 0);
  });
});

describe('the one-way migration', () => {
  it('folds the device tallies in once — sacs, tallies, weapons, fossils', () => {
    const bloodRaw = JSON.stringify({
      sacs: 3, gold: 250, aether: 4,
      weapons: ['Nightreaver Bow'],
      history: [{ at: 1, giftId: 'g', label: '100 gold', rarity: 'common', kind: 'gold', gold: 100, aether: 0, weapon: null }],
    });
    const fossilsRaw = JSON.stringify([{
      id: 'fossil-tri-horn-x', species: 'triceratops', speciesName: 'Triceratops',
      type: 'Triceratops horn', condition: 'partial', baseGold: 85, goldValue: 51,
    }]);
    const rec = migrateEarth2Tallies(emptyBackpackRecord(), { bloodRaw, fossilsRaw });
    assert.equal(rec.migratedE2, true);
    assert.equal(sacCount(rec), 3);
    assert.equal(rec.tallies.gold, 250);
    assert.equal(rec.tallies.aether, 4);
    const weapons = itemsOfKind(rec, 'weapon');
    assert.equal(weapons.length, 1);
    assert.equal(weapons[0].name, 'Nightreaver Bow');
    assert.equal(weapons[0].meta.reticle.style, 'chevron'); // bow default — the law holds through migration
    assert.equal(fossilItemsFromRecord(rec).length, 1);
    assert.equal(rec.history.length, 1);
    // Second run: flag set, nothing doubles.
    const again = migrateEarth2Tallies(rec, { bloodRaw, fossilsRaw });
    assert.equal(sacCount(again), 3);
    assert.equal(fossilItemsFromRecord(again).length, 1);
  });

  it('survives corrupt device data and still marks the migration done', () => {
    const rec = migrateEarth2Tallies(emptyBackpackRecord(), { bloodRaw: '{nope', fossilsRaw: '[]' });
    assert.equal(rec.migratedE2, true);
    assert.equal(rec.items.length, 0);
  });
});
