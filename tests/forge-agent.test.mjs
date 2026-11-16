// tests/forge-agent.test.mjs
// THE FORGE AGENT (Merlin, Nov 15, 2026): the single handler for
// forge prompts (lib/world-engine/forge-agent.js). Tests cover the
// pure layer — prompt validation, sanitization clamps, the
// prompt-keyword safety nets, the damage mapping, the backpack
// mint (reticle law + forgedBy + CGI) — the portal-gun prompt's
// validity as a forge prompt, the forge links, and the two
// execution paths (patron commission + AI synthesis) against stub
// fetches (no network, no AI, no billing).
//
// Run: node --test tests/forge-agent.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PORTAL_GUN_FORGE_PROMPT,
  portalGunForgePrompt,
  portalGunForgeParams,
  validateForgePrompt,
  sanitizeForgePrompt,
  forgePromptToWeaponParams,
  applyPromptKeywordNets,
  damageForBackpack,
  isPortalGunForgePrompt,
  mintForgeWeapon,
  forgeCommissionUrl,
  patronFromForgeUrl,
  executePatronCommission,
  loadPatronCommissions,
  executeForgeSynthesis,
} from '../lib/world-engine/forge-agent.js';
import {
  emptyBackpackRecord,
  itemsOfKind,
} from '../lib/backpack/backpack.js';
import { PATRON_IDS } from '../lib/backpack/patrons.js';

const cleanPrompt = {
  name: 'Test Rifle',
  description: 'A reliable rifle in the standard dark finish.',
  assetUrl: '',
  length: 1.2,
  damage: 24,
  weaponType: 'rifle',
  finishColor: '#1c1f26',
  opticType: 'iron',
  stockType: 'telescoping',
  patron: null,
  presenter: 'traveller',
};

const stubFetch = (data, ok = true) => async () => ({ ok, json: async () => data });

describe('the portal-gun prompt', () => {
  it('is a valid forge prompt as-is', () => {
    const v = validateForgePrompt(PORTAL_GUN_FORGE_PROMPT);
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    assert.equal(v.prompt.name, 'Portal Gun');
    assert.equal(v.prompt.damage, 0);
    assert.equal(v.prompt.length, 0.9);
    assert.equal(v.prompt.assetUrl, '');
    assert.equal(v.prompt.presenter, 'portal-system');
    assert.equal(v.prompt.patron, null);
  });

  it('names the portal system as presenter, not a patron', () => {
    assert.equal(PORTAL_GUN_FORGE_PROMPT.presenter, 'portal-system');
    assert.equal(PORTAL_GUN_FORGE_PROMPT.patron, null);
    assert.match(PORTAL_GUN_FORGE_PROMPT.description, /portal system, not by any smith/);
    assert.match(PORTAL_GUN_FORGE_PROMPT.description, /Damage 0 by design/);
    assert.match(PORTAL_GUN_FORGE_PROMPT.description, /it opens, it does not wound/);
  });

  it('maps onto the closest procedural base: smg, 0.9 m, near-white, no optic', () => {
    const params = portalGunForgeParams();
    assert.equal(params.weaponType, 'smg');
    assert.equal(params.barrelLength, 0.9);
    assert.equal(params.finishColor, '#f2f0ea');
    assert.equal(params.opticType, 'none');
    assert.equal(params.stockType, 'wire');
    assert.equal(params.damageRating, 0);
    // A fresh copy each time — callers never mutate the original.
    const copy = portalGunForgePrompt();
    assert.notEqual(copy, PORTAL_GUN_FORGE_PROMPT);
    assert.deepEqual(copy, PORTAL_GUN_FORGE_PROMPT);
  });

  it('mints the gun with damage 0 kept, source portal-system, id portal-gun', () => {
    const rec = emptyBackpackRecord();
    const res = mintForgeWeapon(rec, PORTAL_GUN_FORGE_PROMPT, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(res.ok, true);
    assert.equal(res.item.id, 'portal-gun');
    assert.equal(res.item.kind, 'weapon');
    assert.equal(res.item.meta.weaponClass, 'firearm');
    assert.equal(res.item.meta.damage, 0);
    assert.equal(res.item.meta.source, 'portal-system');
    assert.equal(res.item.meta.reticle.style, 'crosshair');
    assert.equal(res.item.meta.forgedBy, undefined);
    assert.ok(res.item.meta.cgi);
    // The input record was not mutated.
    assert.equal(itemsOfKind(rec, 'weapon').length, 0);
    assert.equal(itemsOfKind(res.record, 'weapon').length, 1);
  });

  it('refuses a second portal gun — the award path and the forge path never duplicate it', () => {
    const first = mintForgeWeapon(emptyBackpackRecord(), PORTAL_GUN_FORGE_PROMPT, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(first.ok, true);
    const second = mintForgeWeapon(first.record, PORTAL_GUN_FORGE_PROMPT, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'already-held');
    assert.equal(itemsOfKind(second.record, 'weapon').length, 1);
  });

  it('mints the gun from the forge form\'s shape — no presenter, name + canonical description only', () => {
    // ForgeSector mints with exactly these fields: the form carries
    // no presenter input, so the prompt itself must carry the
    // identity. This is the shape Merlin's gun was forged with.
    const forgeForm = {
      name: 'Portal Gun',
      description: PORTAL_GUN_FORGE_PROMPT.description,
      assetUrl: '',
      length: 0.9,
      damage: 0,
      weaponType: 'smg',
    };
    assert.equal(isPortalGunForgePrompt(forgeForm), true);
    const res = mintForgeWeapon(emptyBackpackRecord(), forgeForm, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(res.ok, true);
    assert.equal(res.item.id, 'portal-gun');
    assert.equal(res.item.meta.damage, 0);
    assert.equal(res.item.meta.source, 'portal-system');
  });

  it('a weapon merely named Portal Gun with any other description mints as a generic weapon', () => {
    const impostor = {
      name: 'Portal Gun',
      description: 'A chunky sci-fi hand cannon that shoots glowing plasma bolts.',
      assetUrl: '',
      length: 0.9,
      damage: 20,
      weaponType: 'smg',
    };
    assert.equal(isPortalGunForgePrompt(impostor), false);
    const res = mintForgeWeapon(emptyBackpackRecord(), impostor, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(res.ok, true);
    assert.match(res.item.id, /^world-engine-weapon-/);
    assert.notEqual(res.item.id, 'portal-gun');
  });

  it('the canonical description under another name mints as a generic weapon', () => {
    const renamed = {
      name: 'My Portal Blaster',
      description: PORTAL_GUN_FORGE_PROMPT.description,
      assetUrl: '',
      length: 0.9,
      damage: 0,
      weaponType: 'smg',
    };
    assert.equal(isPortalGunForgePrompt(renamed), false);
    const res = mintForgeWeapon(emptyBackpackRecord(), renamed, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(res.ok, true);
    assert.match(res.item.id, /^world-engine-weapon-/);
  });

  it('a one-word change to the canonical description mints as a generic weapon', () => {
    const altered = {
      name: 'Portal Gun',
      description: PORTAL_GUN_FORGE_PROMPT.description.replace('never projectiles', 'sometimes projectiles'),
      assetUrl: '',
      length: 0.9,
      damage: 0,
      weaponType: 'smg',
    };
    assert.equal(isPortalGunForgePrompt(altered), false);
    const res = mintForgeWeapon(emptyBackpackRecord(), altered, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(res.ok, true);
    assert.match(res.item.id, /^world-engine-weapon-/);
  });

  it('refuses a second gun from the forge-form shape when already held', () => {
    const forgeForm = {
      name: 'Portal Gun',
      description: PORTAL_GUN_FORGE_PROMPT.description,
      assetUrl: '',
      length: 0.9,
      damage: 0,
      weaponType: 'smg',
    };
    const first = mintForgeWeapon(emptyBackpackRecord(), forgeForm, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(first.ok, true);
    const second = mintForgeWeapon(first.record, forgeForm, new Date('2026-11-15T00:00:01.000Z'));
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'already-held');
    assert.equal(itemsOfKind(second.record, 'weapon').length, 1);
  });
});

describe('prompt validation', () => {
  it('accepts a clean prompt', () => {
    const v = validateForgePrompt(cleanPrompt);
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    assert.deepEqual(v.errors, []);
    assert.equal(v.prompt.name, 'Test Rifle');
    assert.equal(v.prompt.length, 1.2);
    assert.equal(v.prompt.damage, 24);
  });

  it('rejects an empty name or description', () => {
    assert.equal(validateForgePrompt({ ...cleanPrompt, name: '   ' }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, description: '' }).ok, false);
    assert.equal(validateForgePrompt(null).ok, false);
    assert.equal(validateForgePrompt('a rifle').ok, false);
  });

  it('rejects a non-http asset URL, and caps it at 500 chars', () => {
    assert.equal(validateForgePrompt({ ...cleanPrompt, assetUrl: 'ftp://example.com/a.glb' }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, assetUrl: 'https://example.com/a.glb' }).ok, true);
    assert.equal(validateForgePrompt({ ...cleanPrompt, assetUrl: '' }).ok, true);
  });

  it('rejects length outside 0.1–5 m and damage outside 0–100', () => {
    assert.equal(validateForgePrompt({ ...cleanPrompt, length: 0.05 }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, length: 5.1 }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, damage: 101 }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, damage: -1 }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, damage: 10.5 }).ok, false);
    // Damage 0 is legal: it opens, it does not wound.
    assert.equal(validateForgePrompt({ ...cleanPrompt, damage: 0 }).ok, true);
    assert.equal(validateForgePrompt({ ...cleanPrompt, length: 5 }).ok, true);
  });

  it('rejects unknown patrons and presenter/patron mismatches', () => {
    assert.equal(validateForgePrompt({ ...cleanPrompt, patron: 'saruman' }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, patron: 'kyber' }).ok, true);
    assert.equal(validateForgePrompt({ ...cleanPrompt, presenter: 'patron' }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, presenter: 'patron', patron: 'kyber' }).ok, true);
    assert.equal(validateForgePrompt({ ...cleanPrompt, presenter: 'portal-system', patron: 'kyber' }).ok, false);
    assert.equal(validateForgePrompt({ ...cleanPrompt, presenter: 'muse' }).ok, false);
  });

  it('names every bad field in its errors', () => {
    const v = validateForgePrompt({ name: '', description: '', length: 99, damage: 999 });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.startsWith('name')), JSON.stringify(v.errors));
    assert.ok(v.errors.some((e) => e.startsWith('description')), JSON.stringify(v.errors));
    assert.ok(v.errors.some((e) => e.startsWith('length')), JSON.stringify(v.errors));
    assert.ok(v.errors.some((e) => e.startsWith('damage')), JSON.stringify(v.errors));
  });
});

describe('sanitization clamps', () => {
  it('clamps hostile values into the safe shape, never throws', () => {
    const clean = sanitizeForgePrompt({
      name: 'Blade <script>alert(1)</script> of Doom',
      description: 'A <b>fine</b> rifle & friend.',
      length: 99,
      damage: 999,
      weaponType: 'laser',
      finishColor: 'red',
      opticType: 'thermal',
      stockType: 'banana',
      patron: 'saruman',
    });
    assert.ok(!clean.name.includes('<'));
    assert.ok(!clean.description.includes('<') && !clean.description.includes('&'));
    assert.equal(clean.length, 5);
    assert.equal(clean.damage, 100);
    assert.equal(clean.weaponType, 'rifle');
    assert.equal(clean.finishColor, '#1c1f26');
    assert.equal(clean.opticType, 'iron');
    assert.equal(clean.stockType, 'telescoping');
    assert.equal(clean.patron, null);
  });

  it('caps name at 60 and description at 2000', () => {
    const clean = sanitizeForgePrompt({
      ...cleanPrompt,
      name: 'x'.repeat(200),
      description: 'y'.repeat(5000),
    });
    assert.equal(clean.name.length, 60);
    assert.equal(clean.description.length, 2000);
  });

  it('maps the form length onto the builder barrel (0.3–2.0 m)', () => {
    assert.equal(forgePromptToWeaponParams({ ...cleanPrompt, length: 0.9 }).barrelLength, 0.9);
    assert.equal(forgePromptToWeaponParams({ ...cleanPrompt, length: 5 }).barrelLength, 2.0);
    assert.equal(forgePromptToWeaponParams({ ...cleanPrompt, length: 0.1 }).barrelLength, 0.3);
  });
});

describe('prompt-keyword safety nets', () => {
  it('honours an explicit optic in plain words', () => {
    const base = { weaponType: 'rifle', opticType: 'iron' };
    assert.equal(applyPromptKeywordNets(base, 'a rifle with a scope', 'weapon').opticType, 'scope');
    assert.equal(applyPromptKeywordNets(base, 'a rifle with a red-dot sight', 'weapon').opticType, 'red-dot');
    assert.equal(applyPromptKeywordNets(base, 'a plain rifle', 'weapon').opticType, 'iron');
  });

  it('keeps the old precedence: scope beats red-dot', () => {
    const out = applyPromptKeywordNets({ weaponType: 'rifle', opticType: 'iron' }, 'scope and red-dot', 'weapon');
    assert.equal(out.opticType, 'scope');
  });

  it('promotes a long-range rifle to precision with a scope — unless a red-dot was asked', () => {
    const sniper = applyPromptKeywordNets({ weaponType: 'rifle', opticType: 'iron' }, 'a long-range sniper rifle', 'weapon');
    assert.equal(sniper.weaponType, 'precision');
    assert.equal(sniper.opticType, 'scope');
    const dot = applyPromptKeywordNets({ weaponType: 'rifle', opticType: 'iron' }, 'a sniper rifle with a red-dot', 'weapon');
    assert.equal(dot.weaponType, 'precision');
    assert.equal(dot.opticType, 'red-dot');
    // A non-rifle stays what it is.
    assert.equal(applyPromptKeywordNets({ weaponType: 'smg', opticType: 'red-dot' }, 'long-range smg', 'weapon').weaponType, 'smg');
  });

  it('maps weather words to the weather system, first match wins', () => {
    assert.equal(applyPromptKeywordNets({}, 'a blizzard over the ridge', 'weather').weatherType, 'snow');
    assert.equal(applyPromptKeywordNets({}, 'thunder and lightning', 'weather').weatherType, 'storm');
    assert.equal(applyPromptKeywordNets({}, 'a clear sunny day', 'weather').weatherType, 'clear');
    assert.equal(applyPromptKeywordNets({}, 'a rifle', 'weather').weatherType, undefined);
    assert.equal(applyPromptKeywordNets({ opticType: 'iron' }, 'a blizzard', 'weapon').weatherType, undefined);
  });

  it('maps vehicle class words — space, then air, then ground', () => {
    assert.equal(applyPromptKeywordNets({}, 'a spaceship for the void', 'vehicle').vehicleClass, 'space');
    assert.equal(applyPromptKeywordNets({}, 'a rocket to orbit', 'vehicle').vehicleClass, 'space');
    assert.equal(applyPromptKeywordNets({}, 'a jet plane', 'vehicle').vehicleClass, 'air');
    assert.equal(applyPromptKeywordNets({}, 'a helicopter with rotors', 'vehicle').vehicleClass, 'air');
    // "flying car" reads as air, not ground — air is checked first.
    assert.equal(applyPromptKeywordNets({}, 'a flying car', 'vehicle').vehicleClass, 'air');
    assert.equal(applyPromptKeywordNets({}, 'a survey rover for rough ground', 'vehicle').vehicleClass, 'ground');
    assert.equal(applyPromptKeywordNets({}, 'a truck', 'vehicle').vehicleClass, 'ground');
    // Class words do not leak into other categories.
    assert.equal(applyPromptKeywordNets({}, 'a spaceship', 'weapon').vehicleClass, undefined);
    assert.equal(applyPromptKeywordNets({}, 'a spaceship', 'character').vehicleClass, undefined);
  });

  it('maps creature archetype / size / temper words', () => {
    const stalker = applyPromptKeywordNets({}, 'a fierce predator stalking the herd', 'creature');
    assert.equal(stalker.archetype, 'stalker');
    assert.equal(stalker.aggression, 0.9);
    const grazer = applyPromptKeywordNets({}, 'a calm herd herbivore', 'creature');
    assert.equal(grazer.archetype, 'grazer');
    assert.equal(grazer.aggression, 0.1);
    assert.equal(applyPromptKeywordNets({}, 'a giant leviathan', 'creature').archetype, 'leviathan');
    assert.equal(applyPromptKeywordNets({}, 'a giant leviathan', 'creature').sizeClass, 'huge');
    assert.equal(applyPromptKeywordNets({}, 'a tiny darting mimic', 'creature').sizeClass, 'tiny');
    assert.equal(applyPromptKeywordNets({}, 'a tiny darting mimic', 'creature').archetype, 'darter');
    assert.equal(applyPromptKeywordNets({}, 'a camouflaged ambusher', 'creature').archetype, 'mimic');
    // Creature words do not leak into other categories.
    assert.equal(applyPromptKeywordNets({}, 'a fierce predator', 'vehicle').archetype, undefined);
    assert.equal(applyPromptKeywordNets({}, 'a fierce predator', 'vehicle').aggression, undefined);
  });

  it('character, object and asset_link get no net — relative words have no number', () => {
    assert.deepEqual(applyPromptKeywordNets({ height: 1.8 }, 'a tall giant guardian', 'character'), { height: 1.8 });
    assert.deepEqual(applyPromptKeywordNets({ scale: { x: 1, y: 1, z: 1 } }, 'a big dense monolith', 'object'), { scale: { x: 1, y: 1, z: 1 } });
    assert.deepEqual(applyPromptKeywordNets({ url: 'https://example.com/x.glb' }, 'a glb model', 'asset_link'), { url: 'https://example.com/x.glb' });
  });

  it('never mutates its input', () => {
    const params = { weaponType: 'rifle', opticType: 'iron' };
    const out = applyPromptKeywordNets(params, 'a rifle with a scope', 'weapon');
    assert.equal(params.opticType, 'iron');
    assert.equal(out.opticType, 'scope');
  });
});

describe('damage: prompt -> backpack', () => {
  it('keeps 0, clamps 1–100 into [5, 40], unset for no rating', () => {
    assert.equal(damageForBackpack(0), 0);
    assert.equal(damageForBackpack(1), 5);
    assert.equal(damageForBackpack(10), 10);
    assert.equal(damageForBackpack(24), 24);
    assert.equal(damageForBackpack(100), 40);
    assert.equal(damageForBackpack(undefined), undefined);
    assert.equal(damageForBackpack('lots'), undefined);
    assert.equal(damageForBackpack(-5), undefined);
  });
});

describe('minting', () => {
  it('mints a forge weapon with the reticle law, CGI, and provenance', () => {
    const res = mintForgeWeapon(emptyBackpackRecord(), cleanPrompt, new Date('2026-11-15T00:00:00.000Z'));
    assert.equal(res.ok, true);
    assert.equal(res.item.kind, 'weapon');
    assert.equal(res.item.name, 'Test Rifle');
    assert.equal(res.item.meta.weaponClass, 'firearm');
    assert.equal(res.item.meta.reticle.style, 'crosshair');
    assert.equal(res.item.meta.source, 'world-engine-weapon-builder');
    assert.equal(res.item.meta.aiGenerated, true);
    assert.equal(res.item.meta.weaponBuilderType, 'rifle');
    assert.equal(res.item.meta.damage, 24);
    assert.equal(res.item.meta.createdAt, '2026-11-15T00:00:00.000Z');
    assert.ok(res.item.meta.cgi);
    assert.equal(res.item.meta.cgi.firing.kind, 'bullet');
    assert.match(res.item.id, /^world-engine-weapon-/);
  });

  it('carries forgedBy when a patron presented it', () => {
    const res = mintForgeWeapon(emptyBackpackRecord(), { ...cleanPrompt, patron: 'kyber', presenter: 'patron' });
    assert.equal(res.ok, true);
    assert.equal(res.item.meta.forgedBy, 'kyber');
  });

  it('leaves damage unset when the prompt carries no usable rating', () => {
    const res = mintForgeWeapon(emptyBackpackRecord(), { ...cleanPrompt, damage: undefined });
    assert.equal(res.ok, true);
    assert.equal(res.item.meta.damage, undefined);
  });
});

describe('forge links', () => {
  it('builds the patron-preselected forge link, plain forge otherwise', () => {
    assert.equal(forgeCommissionUrl('kyber'), '/world-engine/weapons?patron=kyber');
    assert.equal(forgeCommissionUrl('hammond'), '/world-engine/weapons?patron=hammond');
    assert.equal(forgeCommissionUrl('saruman'), '/world-engine/weapons');
    assert.equal(forgeCommissionUrl(''), '/world-engine/weapons');
    assert.equal(forgeCommissionUrl(null), '/world-engine/weapons');
    for (const id of PATRON_IDS) {
      assert.equal(forgeCommissionUrl(id), `/world-engine/weapons?patron=${id}`);
    }
  });

  it('reads the patron back out of a forge URL', () => {
    assert.equal(patronFromForgeUrl('/world-engine/weapons?patron=dwarf'), 'dwarf');
    assert.equal(patronFromForgeUrl('/world-engine/weapons?patron=saruman'), null);
    assert.equal(patronFromForgeUrl('/world-engine/weapons'), null);
    assert.equal(patronFromForgeUrl('https://olympusverse.com/world-engine/weapons?patron=kyber'), 'kyber');
  });
});

describe('execution: patron commissions', () => {
  it('returns the route’s weapon + backpack on success', async () => {
    const weapon = { name: 'Emberfang Blade', weaponClass: 'blade', damage: 24, rarity: 'rare' };
    const res = await executePatronCommission({
      patron: 'kyber',
      theme: 'a crystal blade',
      fetchImpl: stubFetch({ ok: true, weapon, backpack: { v: 1 } }),
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.weapon, weapon);
    assert.deepEqual(res.backpack, { v: 1 });
  });

  it('passes alreadyCommissioned through on a 409', async () => {
    const res = await executePatronCommission({
      patron: 'hammond',
      fetchImpl: stubFetch({ ok: false, error: 'already forged today', alreadyCommissioned: true, backpack: { v: 1 } }, false),
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.ok, false);
    assert.equal(res.alreadyCommissioned, true);
    assert.deepEqual(res.backpack, { v: 1 });
  });

  it('never calls fetch for an unknown patron', async () => {
    let called = false;
    const res = await executePatronCommission({
      patron: 'saruman',
      fetchImpl: async () => { called = true; return { ok: false, json: async () => ({}) }; },
    });
    assert.equal(res.ok, false);
    assert.equal(called, false);
  });

  it('answers honestly when the forge cannot be reached', async () => {
    const res = await executePatronCommission({
      patron: 'dracula',
      fetchImpl: async () => { throw new Error('down'); },
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /could not be reached/);
  });

  it('loads the daily guard state per patron', async () => {
    const res = await loadPatronCommissions({
      fetchImpl: stubFetch({ signedIn: true, commissions: { hammond: true, dracula: false, dwarf: false, kyber: false } }),
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.signedIn, true);
    assert.deepEqual(res.commissions, { hammond: true, dracula: false, dwarf: false, kyber: false });
  });
});

describe('execution: AI synthesis', () => {
  it('returns parameters + billing on success', async () => {
    const res = await executeForgeSynthesis({
      prompt: 'a rifle',
      category: 'weapon',
      fetchImpl: stubFetch({ success: true, parameters: { weaponType: 'rifle' }, billing: { paymentType: 'free_tier', cost: 0 } }),
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.parameters, { weaponType: 'rifle' });
    assert.equal(res.billing.paymentType, 'free_tier');
  });

  it('passes the route’s error through (e.g. 402 insufficient Aether)', async () => {
    const res = await executeForgeSynthesis({
      prompt: 'a rifle',
      category: 'weapon',
      fetchImpl: stubFetch({ success: false, error: 'Not enough Aether.' }, false),
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /Not enough Aether/);
  });

  it('refuses an empty prompt with no asset URL before any fetch', async () => {
    let called = false;
    const res = await executeForgeSynthesis({
      prompt: '   ',
      assetUrl: '',
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    assert.equal(res.ok, false);
    assert.equal(called, false);
  });

  it('answers honestly when synthesis cannot be reached', async () => {
    const res = await executeForgeSynthesis({
      prompt: 'a rifle',
      fetchImpl: async () => { throw new Error('down'); },
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /Synthesis failed/);
  });
});
