// tests/patron-forge.test.mjs
// PATRON SMITHS (Merlin, 2026-10-24): Hammond, Dracula, the
// Dwarven Smith, and the Kyber Smith commission AI-created
// weapons at the Weapons Forge. Tests cover the pure module
// (lib/backpack/patrons.js) — persona prompt shaping, the hard
// validation gates, sanitization, provenance + reticle stamping,
// the daily guard — plus source pins for the route, the forge
// page, and the four venue link-backs.
//
// Run: node --test tests/patron-forge.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PATRONS,
  PATRON_IDS,
  patronById,
  buildPatronPrompt,
  AI_WEAPON_CONTRACT,
  AI_WEAPON_DAMAGE_MIN,
  AI_WEAPON_DAMAGE_MAX,
  AI_WEAPON_RARITIES,
  sanitizeAiText,
  validateAiWeaponSpec,
  aiWeaponItemFor,
  commissionDateKey,
  commissionGuardKey,
  hasCommissionedToday,
  shelveAiWeapon,
} from '../lib/backpack/patrons.js';
import {
  emptyBackpackRecord,
  sanitizeBackpackRecord,
  RETICLE_BY_CLASS,
} from '../lib/backpack/backpack.js';
import { cgiForClass, FIRING_KINDS } from '../lib/weapons/cgi.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const goodSpec = {
  name: 'Emberfang Blade',
  weaponClass: 'blade',
  damage: 24,
  rarity: 'rare',
  description: 'A blade that remembers every fire it has seen.',
};

describe('the roster', () => {
  it('carries exactly four patrons', () => {
    assert.deepEqual([...PATRON_IDS].sort(), ['dracula', 'dwarf', 'hammond', 'kyber']);
    for (const id of PATRON_IDS) {
      const p = patronById(id);
      assert.ok(p.name && p.title && p.glyph && p.seat && p.line);
      assert.ok(Array.isArray(p.favours) && p.favours.length > 0);
      assert.ok(Array.isArray(p.markers) && p.markers.length > 0);
    }
  });

  it('seats the smiths where Merlin put them', () => {
    assert.match(PATRONS.hammond.seat, /Tyrrell/);
    assert.match(PATRONS.dracula.seat, /Transylvania/);
    assert.match(PATRONS.dwarf.seat, /Gondor/);
    assert.match(PATRONS.kyber.seat, /Jedi Temple/);
  });

  it('rejects unknown patrons', () => {
    assert.equal(patronById('saruman'), null);
    assert.equal(buildPatronPrompt('saruman', ''), null);
    assert.equal(validateAiWeaponSpec(goodSpec, 'saruman').ok, false);
  });
});

describe('prompt shaping', () => {
  it('carries every persona marker in its own system prompt', () => {
    for (const id of PATRON_IDS) {
      const prompt = buildPatronPrompt(id, '');
      const system = prompt.system.toLowerCase();
      for (const marker of PATRONS[id].markers) {
        assert.ok(system.includes(marker), `${id} system prompt lacks marker "${marker}"`);
      }
      assert.ok(prompt.system.includes(AI_WEAPON_CONTRACT));
    }
  });

  it('keeps the four personas distinct', () => {
    const systems = PATRON_IDS.map((id) => buildPatronPrompt(id, '').system);
    for (let i = 0; i < systems.length; i++) {
      for (let j = i + 1; j < systems.length; j++) {
        assert.notEqual(systems[i], systems[j]);
      }
    }
  });

  it('passes a sanitized theme through, and surprises without one', () => {
    const themed = buildPatronPrompt('dwarf', 'a hammer <b>bold</b> idea');
    assert.ok(themed.user.includes('hammer'));
    assert.ok(!themed.user.includes('<') && !themed.user.includes('>'));
    const plain = buildPatronPrompt('kyber', '');
    assert.match(plain.user, /Surprise/);
  });
});

describe('validation gates', () => {
  it('accepts a clean spec from any patron', () => {
    for (const id of PATRON_IDS) {
      const v = validateAiWeaponSpec(goodSpec, id);
      assert.equal(v.ok, true, `${id} rejected a clean spec`);
      assert.deepEqual(v.spec, goodSpec);
    }
  });

  it('rejects an unknown weapon class — never stores a bad class', () => {
    const v = validateAiWeaponSpec({ ...goodSpec, weaponClass: 'lightsaber' }, 'kyber');
    assert.equal(v.ok, false);
    assert.match(v.error, /class/);
  });

  it('rejects an unknown rarity', () => {
    assert.equal(validateAiWeaponSpec({ ...goodSpec, rarity: 'mythic' }, 'hammond').ok, false);
  });

  it('rejects a missing name or non-numeric damage', () => {
    assert.equal(validateAiWeaponSpec({ ...goodSpec, name: '   ' }, 'dracula').ok, false);
    assert.equal(validateAiWeaponSpec({ ...goodSpec, damage: 'lots' }, 'dwarf').ok, false);
    assert.equal(validateAiWeaponSpec(null, 'hammond').ok, false);
  });

  it('clamps damage to the catalogue band', () => {
    assert.equal(validateAiWeaponSpec({ ...goodSpec, damage: 999 }, 'hammond').spec.damage, AI_WEAPON_DAMAGE_MAX);
    assert.equal(validateAiWeaponSpec({ ...goodSpec, damage: 1 }, 'hammond').spec.damage, AI_WEAPON_DAMAGE_MIN);
    assert.equal(AI_WEAPON_DAMAGE_MIN, 5);
    assert.equal(AI_WEAPON_DAMAGE_MAX, 40);
  });

  it('accepts every law class and every table rarity', () => {
    for (const cls of Object.keys(RETICLE_BY_CLASS)) {
      assert.equal(validateAiWeaponSpec({ ...goodSpec, weaponClass: cls }, 'kyber').ok, true, cls);
    }
    for (const rarity of AI_WEAPON_RARITIES) {
      assert.equal(validateAiWeaponSpec({ ...goodSpec, rarity }, 'dracula').ok, true, rarity);
    }
  });

  it('sanitizes name and description (no markup survives)', () => {
    const v = validateAiWeaponSpec({
      ...goodSpec,
      name: 'Blade <script>alert(1)</script> of Doom',
      description: 'A <b>fine</b> blade & friend.',
    }, 'dracula');
    assert.equal(v.ok, true);
    assert.ok(!v.spec.name.includes('<'));
    assert.ok(!v.spec.description.includes('<'));
    assert.ok(!v.spec.description.includes('&'));
  });
});

describe('provenance + reticle law', () => {
  it('stamps provenance and the class reticle, never the model\'s', () => {
    for (const cls of Object.keys(RETICLE_BY_CLASS)) {
      const item = aiWeaponItemFor({ ...goodSpec, weaponClass: cls }, 'kyber', '2026-10-24T00:00:00.000Z');
      assert.equal(item.kind, 'weapon');
      assert.equal(item.meta.weaponClass, cls);
      assert.equal(item.meta.reticle.style, RETICLE_BY_CLASS[cls]);
      assert.equal(item.meta.aiGenerated, true);
      assert.equal(item.meta.forgedBy, 'kyber');
      assert.equal(item.meta.source, 'patron-forge');
      assert.equal(item.meta.commissionedAt, '2026-10-24T00:00:00.000Z');
    }
  });

  it('survives the record sanitizer with reticle + provenance intact', () => {
    let rec = emptyBackpackRecord();
    const item = aiWeaponItemFor(goodSpec, 'dwarf', '2026-10-24T00:00:00.000Z');
    rec = { ...rec, items: [item] };
    const clean = sanitizeBackpackRecord(rec);
    assert.equal(clean.items.length, 1);
    assert.equal(clean.items[0].meta.reticle.style, 'dot');
    assert.equal(clean.items[0].meta.aiGenerated, true);
    assert.equal(clean.items[0].meta.forgedBy, 'dwarf');
  });
});

describe('the daily guard', () => {
  const day = new Date('2026-10-24T12:00:00.000Z');
  const nextDay = new Date('2026-10-25T12:00:00.000Z');

  it('keys the guard per patron per UTC day', () => {
    assert.equal(commissionDateKey(day), '2026-10-24');
    assert.notEqual(commissionGuardKey('hammond', day), commissionGuardKey('dracula', day));
    assert.notEqual(commissionGuardKey('hammond', day), commissionGuardKey('hammond', nextDay));
  });

  it('shelves once per patron per day, then refuses', () => {
    let rec = emptyBackpackRecord();
    const first = shelveAiWeapon(rec, goodSpec, 'hammond', day);
    assert.equal(first.ok, true);
    assert.equal(first.record.items.length, 1);
    assert.equal(hasCommissionedToday(first.record, 'hammond', day), true);
    assert.equal(hasCommissionedToday(first.record, 'dracula', day), false);
    const second = shelveAiWeapon(first.record, goodSpec, 'hammond', day);
    assert.equal(second.ok, false);
    assert.equal(second.record.items.length, 1);
    // Another patron the same day is still open.
    const other = shelveAiWeapon(first.record, goodSpec, 'dracula', day);
    assert.equal(other.ok, true);
    // Tomorrow the guard resets.
    assert.equal(hasCommissionedToday(first.record, 'hammond', nextDay), false);
  });

  it('lets all four patrons forge on the same day (four at most)', () => {
    let rec = emptyBackpackRecord();
    for (const id of PATRON_IDS) {
      const r = shelveAiWeapon(rec, goodSpec, id, day);
      assert.equal(r.ok, true, id);
      rec = r.record;
    }
    assert.equal(rec.items.length, 4);
    for (const id of PATRON_IDS) assert.equal(hasCommissionedToday(rec, id, day), true);
  });
});

describe('route + page + venue source pins', () => {
  it('the commission route reuses Artemis plumbing and fails honestly', () => {
    const src = read('app/api/weapons-forge/commission/route.js');
    assert.ok(src.includes("from '@/lib/artemis/server'"));
    assert.ok(src.includes('geminiGenerate'));
    assert.ok(src.includes('requireGeminiKey'));
    assert.ok(src.includes("The forge's AI is unavailable right now."));
    assert.ok(src.includes('validateAiWeaponSpec'));
    assert.ok(src.includes('hasCommissionedToday'));
    // The mint path runs after validation in the file.
    assert.ok(src.indexOf('validateAiWeaponSpec') < src.indexOf('shelveAiWeapon'));
  });

  it('the forge page carries a Patron Smiths section for all four', () => {
    const src = read('app/weapons-forge/page.jsx');
    assert.ok(src.includes('Patron Smiths'));
    assert.ok(src.includes('PATRON_IDS.map'));
    assert.ok(src.includes('api/weapons-forge/commission'));
  });

  it('the profile shows who forged an AI weapon', () => {
    const src = read('components/profile/BackpackSection.jsx');
    assert.ok(src.includes('aiGenerated'));
    assert.ok(src.includes('the Dwarven Smith'));
    assert.ok(src.includes('the Kyber Smith'));
  });

  it('all four venue link-backs exist', () => {
    assert.ok(read('components/earth2/Earth2World.jsx').includes('Commission a weapon from Hammond at the Weapons Forge'));
    assert.ok(read('app/earth-2/page.jsx').includes('Commission a weapon from the Count'));
    // Middle-earth: the forge seat + the Gondor card link.
    assert.ok(read('app/middle-earth/landmarks.js').includes("'dwarf-forge'"));
    assert.ok(read('app/middle-earth/data.js').includes("type: 'dwarf-forge'"));
    assert.ok(read('app/middle-earth/page.jsx').includes('The Dwarven Smith keeps a forge'));
    // Saga: the forge seat + the Coruscant card link.
    assert.ok(read('app/star-wars/landmarks.js').includes("'kyber-forge'"));
    assert.ok(read('app/star-wars/data.js').includes("type: 'kyber-forge'"));
    assert.ok(read('app/star-wars/page.jsx').includes('The Kyber Smith keeps a forge'));
  });
});

describe('the CGI stamping (Merlin, 2026-11-15)', () => {
  it('a commissioned weapon carries meta.cgi derived from its actual class', () => {
    for (const cls of Object.keys(RETICLE_BY_CLASS)) {
      const spec = { ...goodSpec, weaponClass: cls };
      const item = aiWeaponItemFor(spec, 'kyber', '2026-10-24T00:00:00.000Z');
      assert.ok(item.meta.cgi, cls);
      // Commissions are known only by class: procedural model, never a GLB.
      assert.equal(item.meta.cgi.model.kind, 'procedural', cls);
      assert.ok(item.meta.cgi.firing && FIRING_KINDS.includes(item.meta.cgi.firing.kind), cls);
      assert.equal(item.meta.cgi.firing.kind, cgiForClass(cls).firing.kind, cls);
      assert.ok(JSON.stringify(item.meta).length < 2400, `${cls}: meta fits the law`);
    }
  });

  it('an unknown class defaults to the blade CGI, never an invented one', () => {
    assert.deepEqual(cgiForClass('no-such-class'), cgiForClass('blade'));
    assert.equal(cgiForClass('staff').firing.kind, 'blast');
    assert.equal(cgiForClass('firearm').firing.kind, 'bullet');
  });

  it('shelveAiWeapon shelves the item with its CGI intact', () => {
    const shelved = shelveAiWeapon(emptyBackpackRecord(), goodSpec, 'dwarf', new Date('2026-10-24T00:00:00Z'));
    assert.equal(shelved.ok, true);
    assert.ok(shelved.item.meta.cgi, 'shelved item carries cgi');
    assert.equal(shelved.item.meta.cgi.model.build, 'blade');
    assert.equal(shelved.item.meta.reticle.style, 'dot', 'reticle untouched');
  });

  it('the commission route returns the cgi spec with the weapon', () => {
    const src = read('app/api/weapons-forge/commission/route.js');
    assert.ok(src.includes('cgiForClass'), 'route imports the shared spec');
    assert.ok(src.includes('cgi: cgiForClass'), 'response carries cgi');
  });
});
