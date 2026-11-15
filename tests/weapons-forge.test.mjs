// tests/weapons-forge.test.mjs
// THE WEAPONS FORGE (Merlin, 2026-10-23) — REMOVED Nov 15, 2026:
// the /weapons-forge page is gone, replaced with the real forge's
// functions at /world-engine/weapons (redirect in next.config.js);
// the catalogue till route is retired with it. What stays: the
// catalogue itself (lib/backpack/weapons.js — Earth 2 gifts read
// it), the reticle each weapon wears, the forge cost math —
// affordability, material debits, idempotency — the CGI stamping,
// and the removal itself: no registry entry, no god-menu claim,
// no locale titles, one fewer Portal Room seat (215 → 214).
//
// Run: node --test tests/weapons-forge.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  cgiForWeapon,
  cgiForClass,
  firingForClass,
  MODEL_BY_ID,
  FIRING_KINDS,
  PROCEDURAL_BUILDS,
} from '../lib/weapons/cgi.js';

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

describe('the removal (Merlin, Nov 15, 2026)', () => {
  it('the registry no longer seats weapons-forge anywhere', () => {
    assert.equal(SATELLITES.find((s) => s.key === 'weapons-forge'), undefined);
    assert.equal(SATELLITES.find((s) => s.route === '/weapons-forge'), undefined);
  });

  it('no god claims it', () => {
    const claims = GOD_MENUS.flatMap((g) => g.satellites.filter((k) => k === 'weapons-forge').map(() => g.god));
    assert.deepEqual(claims, []);
    const hep = GOD_MENUS.find((g) => g.god === 'HEPHAESTUS');
    assert.ok(hep.satellites.length <= 24, 'within the per-god cap');
  });

  it('no locale carries a weapons-forge title any more (34 files)', () => {
    const files = readdirSync(join(repo, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.equal(dict['sat.weapons-forge.title'], undefined, `${f} title`);
      assert.equal(dict['sat.weapons-forge.subtitle'], undefined, `${f} subtitle`);
    }
  });

  it('the Portal Room roster drops one seat: 215 → 214, no forge seat', () => {
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    assert.equal(roster.length, 214); // Monsterverse seat adcdb3cd: roster 174→175; Social Media Cheat Code seat: 175→176; Dodgeball seat: 176→177; Request a Billboard seat: 177→178; Collapse Run seat: 178→179; Quidditch seat: 179→180; Omega 500 seat: 194→195 (the old 180 pin was stale); Hades seats: 195→197; nether-realms homes: 197→209 (Nov 12, 2026); Earth 4 seat: 209→210 (Nov 14, 2026); Moon + Sun Base seats: 210→212 (Nov 14, 2026); Jupiter 2 + Mars 2 seats: 212→214 (Nov 15, 2026); Ghost Rider seat: 214→215 (Nov 15, 2026); Weapons Forge seat removed: 215→214 (Nov 15, 2026)
    assert.equal(roster.find((p) => p.key === 'weapons-forge'), undefined);
  });

  it('the page and the till route are gone; the redirect points at the real forge', () => {
    assert.equal(existsSync(join(repo, 'app/weapons-forge/page.jsx')), false);
    assert.equal(existsSync(join(repo, 'app/api/weapons-forge/route.js')), false);
    const nextConfig = read('next.config.js');
    assert.ok(nextConfig.includes("source: '/weapons-forge'"), 'redirect source');
    assert.ok(nextConfig.includes("destination: '/world-engine/weapons'"), 'redirect destination');
  });

  it('the commission route survives as the forge agent’s backend', () => {
    assert.ok(existsSync(join(repo, 'app/api/weapons-forge/commission/route.js')));
    const src = read('app/api/weapons-forge/commission/route.js');
    assert.ok(src.includes('validateAiWeaponSpec'));
    assert.ok(src.includes('shelveAiWeapon'));
  });
});

describe('the CGI stamping (Merlin, 2026-11-15)', () => {
  it('the shared spec covers every catalogue weapon: model + firing', () => {
    assert.equal(Object.keys(MODEL_BY_ID).length, 13, 'one model per catalogue weapon');
    for (const w of FORGE_WEAPONS) {
      const spec = cgiForWeapon({ id: w.id, weaponClass: w.weaponClass });
      assert.ok(spec.model && spec.firing, w.id);
      assert.ok(FIRING_KINDS.includes(spec.firing.kind), `${w.id}: firing kind`);
      assert.ok(Number.isFinite(spec.firing.speedMps) && spec.firing.speedMps > 0, `${w.id}: speed`);
      assert.ok(Number.isFinite(spec.firing.rangeM) && spec.firing.rangeM > 0, `${w.id}: range`);
      if (spec.model.kind === 'glb') {
        assert.ok(spec.model.src.startsWith('/models/weapons/'), `${w.id}: glb under weapons`);
        assert.ok(existsSync(join(repo, 'public', spec.model.src)), `${w.id}: ${spec.model.src} on disk`);
      } else {
        assert.equal(spec.model.kind, 'procedural');
        assert.ok(PROCEDURAL_BUILDS.includes(spec.model.build), `${w.id}: known build`);
      }
    }
  });

  it('the revolver shows the real revolver GLB', () => {
    const spec = cgiForWeapon({ id: 'ember-revolver', weaponClass: 'firearm' });
    assert.deepEqual(spec.model, { kind: 'glb', src: '/models/weapons/revolver-handgun.glb' });
    assert.equal(spec.firing.kind, 'bullet');
  });

  it('the Flint Shiv is the one procedural catalogue weapon', () => {
    const spec = cgiForWeapon({ id: 'flint-shiv', weaponClass: 'blade' });
    assert.deepEqual(spec.model, { kind: 'procedural', build: 'blade' });
    assert.equal(spec.firing.kind, 'swing');
  });

  it('unknown ids fall back to the class procedural model; unknown classes default to blade', () => {
    assert.deepEqual(
      cgiForWeapon({ id: 'no-such-weapon', weaponClass: 'bow' }).model,
      { kind: 'procedural', build: 'bow' }
    );
    assert.deepEqual(firingForClass('no-such-class'), firingForClass('blade'));
    assert.deepEqual(cgiForClass('no-such-class'), cgiForClass('blade'));
  });

  it('every forged item carries meta.cgi beside the reticle — and survives sanitize', () => {
    for (const w of FORGE_WEAPONS) {
      const item = weaponItemFor(w, 'test');
      assert.ok(item.meta.cgi, w.id);
      assert.deepEqual(item.meta.cgi, cgiForWeapon({ id: w.id, weaponClass: w.weaponClass }), w.id);
      assert.ok(RETICLE_STYLES.includes(item.meta.reticle.style), `${w.id}: reticle untouched`);
      // The meta-size law: cgi must not push the meta over 2400
      // chars, or sanitize would wipe the whole meta (reticle too).
      assert.ok(JSON.stringify(item.meta).length < 2400, `${w.id}: meta fits the law`);
      const clean = sanitizeBackpackRecord({ ...emptyBackpackRecord(), items: [item] });
      assert.deepEqual(clean.items[0].meta.cgi, item.meta.cgi, `${w.id}: cgi survives sanitize`);
    }
  });

  it('a forged weapon shelved by applyForgeToRecord carries its CGI', () => {
    const res = applyForgeToRecord(stockedRecord(), forgeWeaponById('ember-revolver'), 'cgi-key-1');
    assert.equal(res.ok, true);
    const weapons = itemsOfKind(res.record, 'weapon');
    assert.equal(weapons.length, 1);
    assert.deepEqual(weapons[0].meta.cgi.model, { kind: 'glb', src: '/models/weapons/revolver-handgun.glb' });
    assert.equal(weapons[0].meta.cgi.firing.kind, 'bullet');
    assert.equal(weapons[0].meta.reticle.style, 'crosshair');
  });

  it('a weapon known only by name still gets a blade CGI', () => {
    const item = weaponItemForName('Mystery Blade of Testing', 'gift');
    assert.deepEqual(item.meta.cgi, { model: { kind: 'procedural', build: 'blade' }, firing: firingForClass('blade') });
  });

  it('the forge agent’s mint carries the cgi spec with the forged weapon', () => {
    const src = read('lib/world-engine/forge-agent.js');
    assert.ok(src.includes('cgiForClass'), 'agent imports the shared spec');
    assert.ok(src.includes("cgi: cgiForClass('firearm')"), 'minted weapons carry cgi');
    assert.ok(src.includes('mintForgeWeapon'), 'the mint lives in the agent');
  });

  it('the forge page mounts the ForgeSector + PatronCommissions, not the old shelf', () => {
    const src = read('app/world-engine/weapons/page.jsx');
    assert.ok(src.includes('ForgeSector'), 'the forge builder');
    assert.ok(src.includes('PatronCommissions'), 'the patron commissions');
    assert.ok(src.includes('patronFromForgeUrl'), 'patron preselect from ?patron=');
    const commissions = read('components/world-engine/PatronCommissions.jsx');
    assert.ok(commissions.includes('Patron Smiths'), 'commission section');
    assert.ok(commissions.includes('PATRON_IDS.map'), 'all four patrons');
    assert.ok(commissions.includes('executePatronCommission'), 'commissions go through the agent');
  });
});
