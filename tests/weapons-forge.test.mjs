// tests/weapons-forge.test.mjs
// THE WEAPONS FORGE (Merlin, 2026-10-23): the catalogue (every
// named weapon from Dracula's table + Hammond's cabinet, plus the
// basic tier), the reticle each weapon wears, the forge cost math
// (lib/backpack/weapons.js) — affordability, material debits,
// idempotency — and the master-portal seating: registry entry,
// god-menu claim, locale titles in all 31 languages, Portal Room
// roster.
//
// Run: node --test tests/weapons-forge.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FORGE_WEAPONS,
  forgeWeaponById,
  forgeWeaponByName,
  forgeWeaponReticle,
  forgeAffordability,
  forgeMaterialStock,
  applyForgeToRecord,
  weaponItemFor,
  weaponItemForName,
} from '../lib/backpack/weapons.js';
import {
  emptyBackpackRecord,
  sanitizeBackpackRecord,
  itemsOfKind,
  RETICLE_STYLES,
} from '../lib/backpack/backpack.js';
import {
  addFossilsToRecord,
  collectSacInRecord,
  fossilItemsFromRecord,
} from '../lib/backpack/earth2-bridge.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';
import { GOD_MENUS } from '../lib/god-menus.js';
import { buildPortalRoster } from '../lib/portal-roster.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const fossil = (id, goldValue) => ({
  id, species: 'triceratops', speciesName: 'Triceratops',
  type: 'Triceratops horn', condition: 'complete', baseGold: goldValue, goldValue,
});

function stockedRecord() {
  let rec = emptyBackpackRecord();
  rec = addFossilsToRecord(rec, [fossil('f-cheap', 10), fossil('f-mid', 50), fossil('f-fine', 200)]);
  rec = collectSacInRecord(collectSacInRecord(rec));
  return rec;
}

describe('the catalogue', () => {
  it('shelves all eight weapons Earth 2 already names', () => {
    const named = [
      'Silverfang Dagger', 'Nightreaver Bow', 'Bloodmoon Rifle', // Dracula's gifts
      'Terrorbone Club', 'Raptorclaw Kris', 'Amberfang Spear', 'Fossilplate Maul', "Hammond's Amber Cane", // Hammond's cabinet
    ];
    for (const name of named) {
      assert.ok(forgeWeaponByName(name), name);
    }
  });

  it('adds a basic tier under them', () => {
    assert.ok(FORGE_WEAPONS.length >= 13);
    assert.ok(forgeWeaponById('flint-shiv'));
    assert.ok(forgeWeaponById('ember-revolver'));
  });

  it('every entry is complete: class, damage, rarity, a cost shape', () => {
    for (const w of FORGE_WEAPONS) {
      assert.ok(w.id && w.name && w.weaponClass && w.blurb, w.id);
      assert.ok(Number.isFinite(w.damage) && w.damage > 0, w.id);
      assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(w.rarity), w.id);
      assert.ok(Number.isInteger(w.cost.bars) && w.cost.bars >= 0, w.id);
      assert.ok(Array.isArray(w.cost.materials), w.id);
      for (const m of w.cost.materials) {
        assert.ok(['fossil', 'blood-sac'].includes(m.item), `${w.id}:${m.item}`);
        assert.ok(m.qty >= 1, w.id);
      }
    }
    const ids = FORGE_WEAPONS.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, 'catalogue ids unique');
  });

  it('every weapon wears a reticle from the law’s style set', () => {
    for (const w of FORGE_WEAPONS) {
      assert.ok(RETICLE_STYLES.includes(forgeWeaponReticle(w)), w.id);
      const item = weaponItemFor(w, 'test');
      assert.ok(RETICLE_STYLES.includes(item.meta.reticle.style), w.id);
    }
    // Class defaults read as designed: guns crosshair, bows chevron, blades dot.
    assert.equal(forgeWeaponReticle(forgeWeaponById('bloodmoon-rifle')), 'crosshair');
    assert.equal(forgeWeaponReticle(forgeWeaponById('nightreaver-bow')), 'chevron');
    assert.equal(forgeWeaponReticle(forgeWeaponById('silverfang-dagger')), 'dot');
  });

  it('a weapon known only by name still becomes a lawful entry', () => {
    const item = weaponItemForName('Mystery Blade of Testing', 'gift');
    assert.equal(item.kind, 'weapon');
    assert.ok(RETICLE_STYLES.includes(item.meta.reticle.style));
    const known = weaponItemForName('Bloodmoon Rifle', 'earth-2');
    assert.equal(known.id, 'bloodmoon-rifle');
    assert.equal(known.meta.reticle.style, 'crosshair');
  });
});

describe('the forge math', () => {
  it('material stock counts fossils and sacs', () => {
    assert.deepEqual(forgeMaterialStock(stockedRecord()), { fossils: 3, bloodSacs: 2 });
    assert.deepEqual(forgeMaterialStock(emptyBackpackRecord()), { fossils: 0, bloodSacs: 0 });
  });

  it('affordability names the whole shortfall', () => {
    const cane = forgeWeaponById('hammonds-amber-cane'); // 20 bars, 5 fossils, 1 sac
    const res = forgeAffordability(stockedRecord(), cane, 3);
    assert.equal(res.ok, false);
    const byItem = Object.fromEntries(res.missing.map((m) => [m.item, m]));
    assert.deepEqual(byItem.bars, { item: 'bars', need: 20, held: 3 });
    assert.deepEqual(byItem.fossil, { item: 'fossil', need: 5, held: 3 });
    assert.equal(byItem['blood-sac'], undefined); // 2 held ≥ 1 needed — not missing
    assert.equal(forgeAffordability(stockedRecord(), forgeWeaponById('flint-shiv'), 0).ok, true);
  });

  it('applyForge debits the cheapest fossils first and shelves the weapon', () => {
    const rec = stockedRecord();
    const gladius = forgeWeaponById('bronze-gladius'); // 3 bars, 1 fossil
    const res = applyForgeToRecord(rec, gladius, 'forge-key-1');
    assert.equal(res.ok, true);
    assert.equal(res.barsDue, 3);
    // The 10-gold specimen left; the 50 and 200 remain for Hammond.
    const remaining = fossilItemsFromRecord(res.record).map((f) => f.id);
    assert.deepEqual(remaining.sort(), ['f-fine', 'f-mid']);
    const weapons = itemsOfKind(res.record, 'weapon');
    assert.equal(weapons.length, 1);
    assert.equal(weapons[0].name, 'Bronze Gladius');
    assert.equal(weapons[0].meta.reticle.style, 'dot');
    assert.ok(res.record.forgeKeys.includes('forge-key-1'));
    // The input record was not mutated.
    assert.equal(forgeMaterialStock(rec).fossils, 3);
  });

  it('applyForge refuses when materials are short and changes nothing', () => {
    const rec = stockedRecord();
    const rifle = forgeWeaponById('bloodmoon-rifle'); // needs 3 sacs; 2 held
    const res = applyForgeToRecord(rec, rifle, 'k2');
    assert.equal(res.ok, false);
    assert.equal(JSON.stringify(sanitizeBackpackRecord(res.record)), JSON.stringify(sanitizeBackpackRecord(rec)));
  });

  it('blood-sac costs debit the sac stack', () => {
    let rec = stockedRecord();
    rec = collectSacInRecord(rec); // 3 sacs
    const res = applyForgeToRecord(rec, forgeWeaponById('bloodmoon-rifle'), 'k3');
    assert.equal(res.ok, true);
    assert.equal(forgeMaterialStock(res.record).bloodSacs, 0);
  });
});

describe('the seating (master portal rule)', () => {
  it('the registry seats weapons-forge under HEPHAESTUS / TOOLS', () => {
    const entry = SATELLITES.find((s) => s.key === 'weapons-forge');
    assert.ok(entry, 'registry entry exists');
    assert.equal(entry.route, '/weapons-forge');
    assert.equal(entry.pos, 'HEPHAESTUS');
    assert.equal(entry.section, 'TOOLS');
  });

  it('HEPHAESTUS claims it exactly once, and no other god does', () => {
    const claims = GOD_MENUS.flatMap((g) => g.satellites.filter((k) => k === 'weapons-forge').map(() => g.god));
    assert.deepEqual(claims, ['HEPHAESTUS']);
    const hep = GOD_MENUS.find((g) => g.god === 'HEPHAESTUS');
    assert.ok(hep.satellites.length <= 24, 'within the per-god cap');
  });

  it('all 31 locales carry a translated title and the house subtitle', () => {
    const files = readdirSync(join(repo, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 31);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.ok(dict['sat.weapons-forge.title'], `${f} title`);
      assert.ok(dict['sat.weapons-forge.subtitle'], `${f} subtitle`);
    }
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    assert.equal(en['sat.weapons-forge.title'], 'Weapons Forge');
    const fr = JSON.parse(read('lib/i18n/locales/fr.json'));
    assert.notEqual(fr['sat.weapons-forge.title'], 'Weapons Forge', 'fr title is a real translation');
  });

  it('the Portal Room roster includes the forge (roster = registry − the room)', () => {
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    assert.equal(roster.length, 177); // Monsterverse seat adcdb3cd: roster 174→175; Social Media Cheat Code seat: 175→176; Dodgeball seat: 176→177
    const seat = roster.find((p) => p.key === 'weapons-forge');
    assert.ok(seat);
    assert.equal(seat.title, 'Weapons Forge');
  });

  it('the route file and page exist where the registry points', () => {
    assert.ok(read('app/weapons-forge/page.jsx').includes('Weapons Forge'));
    assert.ok(read('app/api/weapons-forge/route.js').includes('merge_account_preferences'));
  });
});
