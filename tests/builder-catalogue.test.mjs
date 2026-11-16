// tests/builder-catalogue.test.mjs
// World Engine builder catalogues (Merlin, Nov 15 ~17:35): every builder
// must SHOW what exists (presets + the user's saved creations) and the
// cost shown must be the real cost from the economy map.
//
// Run: node --test tests/builder-catalogue.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

import { SECTORS, validateSectorConfig } from '../lib/world-engine/sectors.js';
import { COST_MAP, costFor } from '../lib/world-engine/economy.js';

const FORGE = read('components/world-engine/ForgeSector.jsx');
const SECTORS_SRC = read('lib/world-engine/sectors.js');

const SECTOR_KEYS = ['architect', 'characters', 'weapons', 'vehicles', 'weather', 'objects', 'uplink'];

function jsxFilesUnder(relDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.jsx?$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(ROOT, relDir));
  return out;
}

describe('per-sector preset presence (runtime, via sectors.js)', () => {
  it('all 7 ForgeSector builders exist', () => {
    assert.deepEqual(Object.keys(SECTORS).sort(), [...SECTOR_KEYS].sort());
  });

  it('every sector carries a non-empty presets list', () => {
    for (const key of SECTOR_KEYS) {
      const presets = SECTORS[key].presets;
      assert.ok(Array.isArray(presets) && presets.length > 0, `${key}: expected presets`);
    }
  });

  it('preset counts match the datasheets', () => {
    assert.equal(SECTORS.architect.presets.length, 6); // WORLD_PRESETS
    assert.equal(SECTORS.characters.presets.length, 5); // CHARACTER_PRESETS
    assert.equal(SECTORS.characters.creaturePresets.length, 6); // CREATURE_PRESETS
    assert.equal(SECTORS.weapons.presets.length, 4); // WEAPON_PRESETS
    assert.equal(SECTORS.vehicles.presets.length, 6); // VEHICLE_PRESETS
    assert.equal(SECTORS.weather.presets.length, 8); // WEATHER_PRESETS
    assert.equal(SECTORS.objects.presets.length, 5); // OBJECT_PRESETS
    assert.equal(SECTORS.uplink.presets.length, 3); // UPLINK_PRESETS
  });

  it('every preset has id/name/description and a params object, ids unique per sector', () => {
    for (const key of SECTOR_KEYS) {
      const lists = [SECTORS[key].presets, SECTORS[key].creaturePresets].filter(Boolean);
      for (const list of lists) {
        const ids = new Set();
        for (const p of list) {
          assert.ok(p.id && typeof p.id === 'string', `${key}: preset missing id`);
          assert.ok(p.name && typeof p.name === 'string', `${key}.${p.id}: missing name`);
          assert.ok(p.description && typeof p.description === 'string', `${key}.${p.id}: missing description`);
          assert.ok(p.params && typeof p.params === 'object', `${key}.${p.id}: missing params object`);
          assert.ok(!ids.has(p.id), `${key}: duplicate preset id ${p.id}`);
          ids.add(p.id);
        }
      }
    }
  });

  it('sector configs still validate clean (presets included)', () => {
    for (const key of SECTOR_KEYS) {
      assert.deepEqual(validateSectorConfig(key, SECTORS[key]), []);
    }
  });
});

describe('preset shapes per sector', () => {
  it('world presets fold lifeType into params', () => {
    for (const p of SECTORS.architect.presets) {
      assert.ok(typeof p.params.lifeType === 'string' && p.params.lifeType.length > 0, `${p.id}: missing lifeType`);
      assert.ok(typeof p.params.terrainType === 'string', `${p.id}: missing terrainType`);
    }
  });

  it('weapon presets are forge prompts: prompt text + name + numeric length/damage', () => {
    for (const p of SECTORS.weapons.presets) {
      assert.ok(typeof p.promptText === 'string' && p.promptText.length > 10, `${p.id}: missing promptText`);
      assert.ok(typeof p.nameText === 'string' && p.nameText.length > 0, `${p.id}: missing nameText`);
      assert.ok(Number.isFinite(p.params.length), `${p.id}: length not numeric`);
      assert.ok(Number.isFinite(p.params.damage), `${p.id}: damage not numeric`);
    }
    const portalGun = SECTORS.weapons.presets.find((p) => p.id === 'portal-gun');
    assert.ok(portalGun, 'portal-gun preset present');
    assert.equal(portalGun.params.damage, 0); // damage 0 by design — it opens, it does not wound
    assert.equal(portalGun.params.length, 0.9);
  });

  it('creature presets carry sizeClass/aggression beside params', () => {
    for (const p of SECTORS.characters.creaturePresets) {
      assert.ok(typeof p.params.sizeClass === 'string', `${p.id}: missing sizeClass`);
      assert.ok(typeof p.params.aggression === 'number', `${p.id}: missing aggression`);
      assert.ok(p.params.bauplan && typeof p.params.bauplan === 'object', `${p.id}: missing bauplan`);
    }
  });

  it('vehicle presets carry vehicleClass in params', () => {
    for (const p of SECTORS.vehicles.presets) {
      assert.ok(['ground', 'air', 'space'].includes(p.params.vehicleClass), `${p.id}: bad vehicleClass`);
    }
  });

  it('uplink presets carry the (placeholder) URL as assetUrlText', () => {
    for (const p of SECTORS.uplink.presets) {
      assert.ok(typeof p.assetUrlText === 'string' && p.assetUrlText.startsWith('https://'), `${p.id}: missing assetUrlText`);
      assert.equal(p.params.url, p.assetUrlText);
    }
  });
});

describe('ForgeSector preset UI + saved list (source level)', () => {
  it('renders a "Start from a preset" row wired to applyPreset', () => {
    assert.ok(FORGE.includes('Start from a preset'), 'preset row label missing');
    assert.ok(FORGE.includes('presets.map((preset)'), 'preset buttons missing');
    assert.ok(FORGE.includes('onClick={() => applyPreset(preset)}'), 'preset tap handler missing');
    assert.ok(FORGE.includes('presets, creaturePresets'), 'presets not destructured from config');
  });

  it('preset application is free and updates the store (no synthesis, no charge)', () => {
    assert.ok(FORGE.includes('if (preset.params) setParams(preset.params);'), 'params not applied to store');
    assert.ok(FORGE.includes('nothing is charged and nothing is saved until you generate'), 'free copy missing');
    // applyPreset must not call the synthesize path.
    const applyBlock = FORGE.slice(FORGE.indexOf('const applyPreset'), FORGE.indexOf('const applyCreaturePreset'));
    assert.ok(!applyBlock.includes('executeForgeSynthesis'), 'applyPreset must not synthesize');
    assert.ok(!applyBlock.includes('world_engine_assets'), 'applyPreset must not save');
  });

  it('renders a creature preset row for the characters sector', () => {
    assert.ok(FORGE.includes('Start from a creature'), 'creature row label missing');
    assert.ok(FORGE.includes('creaturePresets.map((preset)'), 'creature buttons missing');
    assert.ok(FORGE.includes('setCreatureParams(preset.params)'), 'creature params not applied to creature slice');
  });

  it('uplink preset row warns the URLs are placeholders', () => {
    assert.ok(FORGE.includes("Preset URLs are example shapes, not real assets"), 'uplink placeholder warning missing');
  });

  it('saved list fetches this user + category, newest first, limited', () => {
    assert.ok(FORGE.includes("from('world_engine_assets')"), 'saved list does not read world_engine_assets');
    assert.ok(FORGE.includes(".eq('user_id', session.user.id)"), 'saved list not scoped to the signed-in user');
    assert.ok(FORGE.includes(".eq('category', category)"), 'saved list not scoped to the sector category');
    assert.ok(FORGE.includes(".order('created_at', { ascending: false })"), 'saved list not newest-first');
    assert.ok(FORGE.includes('.limit(6)'), 'saved list not limited');
  });

  it('signed-out shows a plain sign-in line, not a dead list', () => {
    assert.ok(FORGE.includes('Sign in from the launcher to see your saved creations.'), 'signed-out line missing');
    assert.ok(FORGE.includes('savedSignedOut'), 'signed-out state missing');
  });

  it('loading a saved creation restores its stored params (and prompt/URL/name)', () => {
    assert.ok(FORGE.includes('applyParams(category, row.generation_params)'), 'saved params not applied to store');
    assert.ok(FORGE.includes("if (row.prompt) setPrompt(row.prompt);"), 'saved prompt not restored');
    assert.ok(FORGE.includes("row.asset_url !== 'procedural_generation'"), 'procedural_generation sentinel not skipped');
    assert.ok(FORGE.includes('onClick={() => loadSavedItem(row)}'), 'Load button missing');
  });

  it('saved list refreshes after a successful generation', () => {
    const saveBlock = FORGE.slice(FORGE.indexOf('setSavedName(displayName);'));
    assert.ok(saveBlock.slice(0, 200).includes('loadSaved();'), 'loadSaved not called after save');
  });

  it('saved list loads on mount for the sector', () => {
    assert.ok(FORGE.includes('useEffect(() => { loadSaved(); }, [category]);'), 'load-on-mount effect missing');
  });
});

describe('cost verification', () => {
  it('economy map is the stated law (do not change prices)', () => {
    assert.deepEqual(COST_MAP, {
      world: 500, weather: 300, character: 200, creature: 200,
      vehicle: 200, object: 100, weapon: 100, asset_link: 50,
    });
    assert.equal(costFor('world'), 500);
    assert.equal(costFor('weather'), 300);
    assert.equal(costFor('character'), 200);
    assert.equal(costFor('vehicle'), 200);
    assert.equal(costFor('object'), 100);
    assert.equal(costFor('weapon'), 100);
    assert.equal(costFor('asset_link'), 50);
  });

  it('ForgeSector cost line reads the shared cost map, not a hard-coded number', () => {
    assert.ok(FORGE.includes('AI generation costs {costFor(category)} Aether'), 'cost line must use costFor(category)');
    assert.ok(!/costs \d+ Aether/.test(FORGE), 'ForgeSector must not hard-code a cost number');
  });

  it('credits page cost sentence matches the economy map exactly', () => {
    const credits = read('app/world-engine/credits/page.jsx');
    assert.ok(credits.includes('worlds 500, weather 300, characters / creatures / vehicles 200,'), 'credits page cost sentence drifted');
    assert.ok(credits.includes('objects / weapons 100, asset uploads 50.'), 'credits page cost sentence drifted');
  });

  it('no stale "5 Aether" / "2 Aether" cost is stated anywhere in the engine UI', () => {
    const files = [
      ...jsxFilesUnder('app/world-engine'),
      ...jsxFilesUnder('components/world-engine'),
      'lib/world-engine/sectors.js',
    ];
    const stale = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (/(^|[^0-9])(5|2) Aether/.test(src)) stale.push(path.relative(ROOT, file));
    }
    assert.deepEqual(stale, [], `stale cost statements found: ${stale.join(', ')}`);
  });

  it('dashboard + engine landing state no numeric cost (generic free-tier copy only)', () => {
    const dashboard = read('app/world-engine/dashboard/page.jsx');
    assert.ok(dashboard.includes('20 free monthly generations'), 'dashboard free-tier copy missing');
    assert.ok(!/\d+ Aether/.test(dashboard), 'dashboard must not state a numeric cost');
    assert.ok(!/\d+ Aether/.test(read('app/world-engine/page.jsx')), 'engine landing must not state a numeric cost');
  });
});

describe('save-path verification (source level)', () => {
  it('insert carries the full field set into world_engine_assets', () => {
    const start = FORGE.indexOf("from('world_engine_assets').insert");
    const end = FORGE.indexOf('if (error) throw error;', start);
    const insert = FORGE.slice(start, end);
    for (const field of ['user_id: session.user.id', 'name:', 'display_name: displayName', 'category,', 'asset_url:', 'generation_params: finalParams', 'prompt:']) {
      assert.ok(insert.includes(field), `insert missing field: ${field}`);
    }
  });

  it('world generations are seed-stamped when the synthesis carries no seed', () => {
    assert.ok(FORGE.includes("if (category === 'world' && !readSeed(finalParams))"), 'world seed guard missing');
    assert.ok(FORGE.includes('finalParams = stampSeed(finalParams, mintWorldSeed());'), 'world seed stamp missing');
  });

  it('weapon generations mint to the backpack via mintForgeWeapon (weapon sector only)', () => {
    assert.ok(FORGE.includes("if (category === 'weapon')"), 'weapon mint guard missing');
    assert.ok(FORGE.includes('mintForgeWeapon(rec,'), 'mintForgeWeapon call missing');
    assert.ok(FORGE.includes('weaponType:'), 'mint must carry weaponType');
  });

  it('asset_link generations save the pasted URL (not the procedural sentinel)', () => {
    assert.ok(FORGE.includes("asset_url: assetUrl || 'procedural_generation'"), 'asset_url passthrough missing');
  });

  it('sectors.js attaches presets without touching the synthesize/economy paths', () => {
    assert.ok(!SECTORS_SRC.includes('executeForgeSynthesis'), 'sectors.js must not touch synthesis');
    assert.ok(!SECTORS_SRC.includes('COST_MAP'), 'sectors.js must not touch pricing');
  });
});
