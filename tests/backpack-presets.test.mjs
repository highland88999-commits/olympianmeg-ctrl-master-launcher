// tests/backpack-presets.test.mjs
// THE TRIPO PRESETS (Merlin, 2026-10-24): the seven Tripo-forged
// starter weapons seed EVERY backpack — new packs start with them,
// existing packs gain them exactly once. Guards: one per class,
// reticle law intact, no duplication on re-load, the 600-item cap
// respected, and a deliberately removed preset stays removed.
//
// Run: node --test tests/backpack-presets.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIPO_PRESET_WEAPONS,
  addItem,
  createItem,
  emptyBackpackRecord,
  sanitizeBackpackRecord,
  seedPresetWeapons,
} from '../lib/backpack/backpack.js';

const EXPECTED_RETICLE = {
  firearm: 'crosshair',
  bow: 'chevron',
  spear: 'chevron',
  blade: 'dot',
  blunt: 'dot',
  cane: 'dot',
  staff: 'dot',
};

describe('the Tripo preset seeding', () => {
  it('defines exactly seven presets, one per weapon class', () => {
    assert.equal(TRIPO_PRESET_WEAPONS.length, 7);
    const classes = TRIPO_PRESET_WEAPONS.map((p) => p.weaponClass).sort();
    assert.deepEqual(classes, ['blade', 'blunt', 'bow', 'cane', 'firearm', 'spear', 'staff']);
    for (const p of TRIPO_PRESET_WEAPONS) {
      assert.ok(Number.isInteger(p.damage) && p.damage >= 5 && p.damage <= 40, `${p.id} damage in [5,40]`);
      assert.ok(p.model.startsWith('/models/weapons/') && p.model.endsWith('.glb'), `${p.id} model path`);
    }
    // The crystal sniper is the Redwater claim prize, never a preset.
    assert.ok(!TRIPO_PRESET_WEAPONS.some((p) => p.id.includes('sniper')));
  });

  it('a brand-new pack starts with all seven presets', () => {
    const rec = seedPresetWeapons(emptyBackpackRecord());
    assert.equal(rec.items.length, 7);
    assert.equal(rec.presetsSeeded, true);
    for (const preset of TRIPO_PRESET_WEAPONS) {
      const entry = rec.items.find((e) => e.id === preset.id);
      assert.ok(entry, `${preset.id} present`);
      assert.equal(entry.kind, 'weapon');
      assert.equal(entry.qty, 1);
      assert.equal(entry.name, preset.name);
      assert.equal(entry.meta.weaponClass, preset.weaponClass);
      assert.equal(entry.meta.damage, preset.damage);
      assert.equal(entry.meta.source, 'tripo-preset');
      assert.equal(entry.meta.model, preset.model);
      assert.ok(typeof entry.meta.createdAt === 'string' && entry.meta.createdAt);
      // The reticle law: every preset wears its class default.
      assert.deepEqual(entry.meta.reticle, { style: EXPECTED_RETICLE[preset.weaponClass] });
    }
  });

  it('an existing pack gains only the presets it lacks, keeping its own items', () => {
    const own = createItem({ kind: 'material', id: 'fossil', name: 'Fossil', qty: 3 });
    const haveBow = createItem({
      kind: 'weapon', id: 'preset-bow', name: 'Recurve Bow',
      meta: { weaponClass: 'bow', damage: 14, source: 'tripo-preset' },
    });
    let rec = emptyBackpackRecord();
    rec = addItem(rec, own);
    rec = { ...rec, items: [...rec.items, haveBow] };
    const beforeUids = rec.items.map((e) => e.uid);
    const seeded = seedPresetWeapons(rec);
    assert.equal(seeded.items.length, 8); // 2 held + 6 missing presets
    assert.equal(seeded.presetsSeeded, true);
    // The pre-held bow is untouched (same uid, not duplicated).
    const bows = seeded.items.filter((e) => e.id === 'preset-bow');
    assert.equal(bows.length, 1);
    assert.equal(bows[0].uid, haveBow.uid);
    // The pack's own items survive, uids intact.
    for (const uid of beforeUids) {
      assert.ok(seeded.items.some((e) => e.uid === uid), `uid ${uid} kept`);
    }
    // The original record is untouched (pure function).
    assert.equal(rec.items.length, 2);
    assert.equal(rec.presetsSeeded, false);
  });

  it('re-seeding never duplicates, even across many loads', () => {
    const once = seedPresetWeapons(emptyBackpackRecord());
    const twice = seedPresetWeapons(once);
    assert.strictEqual(twice, once, 'already-seeded record returns unchanged');
    const thrice = seedPresetWeapons(sanitizeBackpackRecord(JSON.parse(JSON.stringify(once))));
    assert.equal(thrice.items.length, 7);
    const ids = thrice.items.map((e) => e.id);
    assert.equal(new Set(ids).size, 7, 'no duplicate ids after a serialize round-trip');
  });

  it('a deliberately removed preset stays removed once the flag is set', () => {
    const seeded = seedPresetWeapons(emptyBackpackRecord());
    const removed = {
      ...seeded,
      items: seeded.items.filter((e) => e.id !== 'preset-cane'),
    };
    assert.equal(removed.presetsSeeded, true);
    const again = seedPresetWeapons(removed);
    assert.strictEqual(again, removed, 'flag set: no resurrection');
    assert.ok(!again.items.some((e) => e.id === 'preset-cane'));
  });

  it('the 600-item cap is respected and the flag stays false when blocked', () => {
    const filler = Array.from({ length: 599 }, (_, i) => ({
      kind: 'material', id: `filler-${i}`, name: `Filler ${i}`, qty: 1,
    }));
    const full = sanitizeBackpackRecord({ ...emptyBackpackRecord(), items: filler });
    assert.equal(full.items.length, 599);
    const seeded = seedPresetWeapons(full);
    assert.equal(seeded.items.length, 600, 'one preset fits, the rest are refused');
    assert.equal(seeded.items.filter((e) => e.id.startsWith('preset-')).length, 1);
    assert.equal(seeded.presetsSeeded, false, 'incomplete set retries on a later load');
  });
});
