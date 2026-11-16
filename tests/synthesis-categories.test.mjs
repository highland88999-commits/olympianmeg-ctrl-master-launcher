// tests/synthesis-categories.test.mjs
// Per-category AI synthesis (World Engine Gap 1, Merlin Nov 15 2026):
// prompt -> synthesizeWithGemini (STUBBED fetch — no network, no AI,
// no billing, no money) -> applyAestheticEngine -> applySynthesizedParams
// -> the store slice's real fields move, and no environment junk lands.
//
// What was broken before this work: the synthesis AI got ONE generic
// environment instruction for every non-weapon category, and
// applyAestheticEngine returned only the 10 environment keys — so a
// character synthesis merged sunColor/terrainType/... into the
// character slice and never touched `height`. Weather was the one
// exception: verified Nov 15 that its three keys already moved the
// weather slice (with 7 junk keys riding along), so weather keeps the
// generic instruction and only gains a 3-key aesthetic branch.
//
// Run: node --test tests/synthesis-categories.test.mjs   (from the repo root)

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage stub + zustand resolver, same pattern as
// tests/world-engine-datasheets.test.mjs (zustand/persist needs
// localStorage; the hook maps bare 'zustand' imports to this repo's
// node_modules copy).
globalThis.localStorage = (() => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
})();
import { register } from 'node:module';
register('./datasheets-zustand-hooks.mjs', import.meta.url);

import {
  synthesizeWithGemini, systemInstructionFor, buildInputQuery,
  SYSTEM_INSTRUCTION,
} from '../lib/world-engine/gemini.js';
import { applyAestheticEngine, diagnoseParams } from '../lib/world-engine/aesthetic.js';
import { useEngineStore } from '../lib/world-engine/useEngineStore.js';

/** Stub fetch returning the given params as a Gemini payload; captures the request body. */
function stubGemini(params) {
  const captured = {};
  const fetchImpl = async (_url, opts) => {
    captured.body = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(params) }] } }] }),
    };
  };
  return { fetchImpl, captured };
}

/** Full pipeline for one category: stubbed AI -> clamp -> store slice. */
async function synthesizeToStore(category, params, prompt = 'test prompt') {
  const { fetchImpl, captured } = stubGemini(params);
  const raw = await synthesizeWithGemini({ apiKey: 'test-key', prompt, category, fetchImpl });
  const clamped = applyAestheticEngine(raw, category);
  useEngineStore.getState().applySynthesizedParams(category, clamped);
  return { raw, clamped, captured };
}

const ENV_JUNK_KEYS = [
  'sunColor', 'atmosphereDensity', 'ambientLightIntensity', 'terrainRoughness',
  'rotationSpeed', 'terrainType', 'objectDensity',
];

beforeEach(() => {
  useEngineStore.getState().resetAll();
});

describe('systemInstructionFor — one instruction per category', () => {
  it('character asks for height/proportions, never environment keys', () => {
    const text = systemInstructionFor('character');
    assert.match(text, /height/);
    assert.match(text, /proportions/);
    assert.doesNotMatch(text, /sunColor/);
    assert.doesNotMatch(text, /terrainType/);
  });

  it('creature asks for archetype/bauplan/sizeClass/aggression', () => {
    const text = systemInstructionFor('creature');
    assert.match(text, /archetype/);
    assert.match(text, /bauplan/);
    assert.match(text, /sizeClass/);
    assert.match(text, /aggression/);
    assert.match(text, /leviathan/);
  });

  it('vehicle asks for vehicleClass/speed/handling', () => {
    const text = systemInstructionFor('vehicle');
    assert.match(text, /vehicleClass/);
    assert.match(text, /speed/);
    assert.match(text, /handling/);
    assert.match(text, /ground, air, space/);
  });

  it('object asks for scale/density/material', () => {
    const text = systemInstructionFor('object');
    assert.match(text, /scale/);
    assert.match(text, /density/);
    assert.match(text, /material/);
  });

  it('asset_link asks for url/type/scale and names the URL as the asset', () => {
    const text = systemInstructionFor('asset_link');
    assert.match(text, /url/);
    assert.match(text, /glb/);
    assert.match(text, /scale/);
    assert.equal(systemInstructionFor('assetlink'), text);
    assert.equal(systemInstructionFor('uplink'), text);
  });

  it('weather and world keep the generic environment instruction', () => {
    assert.equal(systemInstructionFor('weather'), SYSTEM_INSTRUCTION);
    assert.equal(systemInstructionFor('world'), SYSTEM_INSTRUCTION);
    assert.equal(systemInstructionFor('something-else'), SYSTEM_INSTRUCTION);
  });
});

describe('buildInputQuery — URL-only prompts name the right thing', () => {
  it('names the category for URL-only synthesis', () => {
    assert.match(buildInputQuery('', 'https://example.com/x.glb', 'asset_link'), /3D asset link/);
    assert.match(buildInputQuery('', 'https://example.com/x', 'character'), /humanoid character/);
    assert.match(buildInputQuery('', 'https://example.com/x', 'creature'), /creature/);
    assert.match(buildInputQuery('', 'https://example.com/x', 'vehicle'), /vehicle/);
    assert.match(buildInputQuery('', 'https://example.com/x', 'object'), /3D object/);
    assert.match(buildInputQuery('', 'https://example.com/x', 'world'), /3D world ecosystem/);
  });

  it('a real prompt wins over the URL', () => {
    assert.equal(buildInputQuery('  a tall guardian  ', 'https://example.com/x', 'character'), 'a tall guardian');
  });
});

describe('character — end to end (head of the order)', () => {
  it('a guardian prompt moves height/proportions/color and lands no env junk', async () => {
    const { clamped, captured } = await synthesizeToStore('character', {
      height: 2.6, proportions: { head: 0.9, torso: 1.4, limbs: 1.1 },
      color: '#c9a86a', animationSet: 'idle',
    }, 'a tall guardian');
    // The AI was actually asked for character keys.
    assert.match(captured.body.system_instruction.parts[0].text, /height/);
    assert.deepEqual(Object.keys(clamped).sort(), ['animationSet', 'color', 'height', 'proportions']);
    const char = useEngineStore.getState().character;
    assert.equal(char.height, 2.6);
    assert.deepEqual(char.proportions, { head: 0.9, torso: 1.4, limbs: 1.1 });
    assert.equal(char.color, '#c9a86a');
    assert.equal(char.animationSet, 'idle');
    for (const key of ENV_JUNK_KEYS) assert.equal(key in char, false, `${key} leaked into the character slice`);
    assert.equal('weatherType' in char, false);
    assert.equal('precipitationIntensity' in char, false);
    assert.equal('windSpeed' in char, false);
  });

  it('clamps height into 0.5–5 and proportions into 0.5–2, defaults the rest', () => {
    const high = applyAestheticEngine({ height: 99, proportions: { head: 9, torso: 0, limbs: 1 }, color: 'not-a-hex', animationSet: 'dance' }, 'character');
    assert.equal(high.height, 5);
    assert.deepEqual(high.proportions, { head: 2, torso: 0.5, limbs: 1 });
    assert.equal(high.color, '#ffffff');
    assert.equal(high.animationSet, 'idle');
    const empty = applyAestheticEngine({}, 'character');
    assert.deepEqual(empty, { height: 1.8, proportions: { head: 1, torso: 1, limbs: 1 }, color: '#ffffff', animationSet: 'idle' });
    const junk = applyAestheticEngine({ height: 2, sunColor: '#ff0000', terrainType: 'desert' }, 'character');
    assert.equal('sunColor' in junk, false);
    assert.equal('terrainType' in junk, false);
  });

  it('diagnoseParams flags a bad height and passes a good one', () => {
    const bad = diagnoseParams({ height: 9 }, 'character');
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(' '), /height/);
    assert.equal(bad.clamped.height, 5);
    const good = diagnoseParams({ height: 2.6, proportions: { head: 0.9, torso: 1.4, limbs: 1.1 }, color: '#c9a86a', animationSet: 'idle' }, 'character');
    assert.equal(good.ok, true);
    assert.deepEqual(good.errors, []);
  });
});

describe('creature — end to end', () => {
  it('a stalker prompt moves archetype/bauplan/size/aggression and lands no env junk', async () => {
    await synthesizeToStore('creature', {
      archetype: 'stalker',
      bauplan: { bodyLength: 2.2, bodyWidth: 0.7, limbCount: 4, limbLength: 1.1, stance: 0.3, surface: 'armored' },
      sizeClass: 'large', aggression: 0.9, color: '#2b2f36',
    }, 'a shadow stalker');
    const creature = useEngineStore.getState().creature;
    assert.equal(creature.archetype, 'stalker');
    assert.deepEqual(creature.bauplan, { bodyLength: 2.2, bodyWidth: 0.7, limbCount: 4, limbLength: 1.1, stance: 0.3, surface: 'armored' });
    assert.equal(creature.sizeClass, 'large');
    assert.equal(creature.aggression, 0.9);
    assert.equal(creature.color, '#2b2f36');
    for (const key of [...ENV_JUNK_KEYS, 'weatherType', 'precipitationIntensity', 'windSpeed']) {
      assert.equal(key in creature, false, `${key} leaked into the creature slice`);
    }
  });

  it('clamps unknown archetype/surface to defaults and bauplan into range', () => {
    const out = applyAestheticEngine({
      archetype: 'dragon', bauplan: { bodyLength: 99, limbCount: 99, surface: 'spiky' },
      sizeClass: 'colossal', aggression: 2, color: '#00ff00',
    }, 'creature');
    assert.equal(out.archetype, 'grazer');
    assert.equal(out.bauplan.bodyLength, 2.5);
    assert.equal(out.bauplan.limbCount, 8);
    assert.equal(out.bauplan.surface, 'smooth');
    assert.equal(out.sizeClass, 'medium');
    assert.equal(out.aggression, 1);
  });

  it('diagnoseParams flags a bad archetype and a bad bauplan surface', () => {
    const bad = diagnoseParams({ archetype: 'dragon', bauplan: { surface: 'spiky' } }, 'creature');
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(' '), /archetype/);
    assert.match(bad.errors.join(' '), /bauplan\.surface/);
    assert.equal(bad.clamped.archetype, 'grazer');
  });
});

describe('vehicle — end to end', () => {
  it('a sky skiff prompt moves speed/handling/class and lands no env junk', async () => {
    await synthesizeToStore('vehicle', {
      vehicleClass: 'air', speed: 220, handling: 0.8, color: '#7fd4ff',
    }, 'a light air craft');
    const vehicle = useEngineStore.getState().vehicle;
    assert.equal(vehicle.vehicleClass, 'air');
    assert.equal(vehicle.speed, 220);
    assert.equal(vehicle.handling, 0.8);
    assert.equal(vehicle.color, '#7fd4ff');
    for (const key of [...ENV_JUNK_KEYS, 'weatherType', 'precipitationIntensity', 'windSpeed']) {
      assert.equal(key in vehicle, false, `${key} leaked into the vehicle slice`);
    }
  });

  it('clamps speed into 10–300, handling into 0.1–1, unknown class to ground', () => {
    const out = applyAestheticEngine({ vehicleClass: 'hover', speed: 999, handling: 9, color: 'red' }, 'vehicle');
    assert.deepEqual(out, { vehicleClass: 'ground', speed: 300, handling: 1, color: '#ff5500' });
    assert.deepEqual(applyAestheticEngine({}, 'vehicle'), { vehicleClass: 'ground', speed: 50, handling: 0.7, color: '#ff5500' });
  });
});

describe('object — end to end', () => {
  it('a monolith prompt moves scale/density and lands no env junk', async () => {
    await synthesizeToStore('object', {
      scale: { x: 2, y: 6, z: 1 }, density: 0.1, material: 'standard', color: '#2b2f36',
    }, 'a huge dark slab');
    const object = useEngineStore.getState().object;
    assert.deepEqual(object.scale, { x: 2, y: 6, z: 1 });
    assert.equal(object.density, 0.1);
    assert.equal(object.material, 'standard');
    assert.equal(object.color, '#2b2f36');
    for (const key of [...ENV_JUNK_KEYS, 'weatherType', 'precipitationIntensity', 'windSpeed']) {
      assert.equal(key in object, false, `${key} leaked into the object slice`);
    }
  });

  it('accepts a uniform scale number, clamps density and scale axes', () => {
    const out = applyAestheticEngine({ scale: 3, density: 2, material: 'marble', color: '#00ffcc' }, 'object');
    assert.deepEqual(out.scale, { x: 3, y: 3, z: 3 });
    assert.equal(out.density, 1);
    assert.equal(out.material, 'standard');
    const over = applyAestheticEngine({ scale: { x: 99, y: 0, z: 1 } }, 'object');
    assert.deepEqual(over.scale, { x: 10, y: 0.1, z: 1 });
  });
});

describe('asset_link — end to end', () => {
  it('a GLB url prompt sets url/type/scale and lands no env junk', async () => {
    await synthesizeToStore('asset_link', {
      url: 'https://example.com/models/monument.glb', type: 'glb', scale: { x: 5, y: 5, z: 5 },
    }, '');
    const link = useEngineStore.getState().assetLink;
    assert.equal(link.url, 'https://example.com/models/monument.glb');
    assert.equal(link.type, 'glb');
    assert.deepEqual(link.scale, { x: 5, y: 5, z: 5 });
    for (const key of [...ENV_JUNK_KEYS, 'weatherType', 'precipitationIntensity', 'windSpeed']) {
      assert.equal(key in link, false, `${key} leaked into the assetLink slice`);
    }
  });

  it('a URL-only prompt sends the URL to the AI as the thing to analyse', async () => {
    const { fetchImpl, captured } = stubGemini({ url: 'https://example.com/models/hero-prop.glb', type: 'glb', scale: 1 });
    const raw = await synthesizeWithGemini({
      apiKey: 'test-key', prompt: '', targetUrl: 'https://example.com/models/hero-prop.glb',
      category: 'asset_link', fetchImpl,
    });
    assert.match(captured.body.contents[0].parts[0].text, /https:\/\/example\.com\/models\/hero-prop\.glb/);
    assert.match(captured.body.contents[0].parts[0].text, /3D asset link/);
    const clamped = applyAestheticEngine(raw, 'asset_link');
    assert.equal(clamped.url, 'https://example.com/models/hero-prop.glb');
    assert.deepEqual(clamped.scale, { x: 1, y: 1, z: 1 });
  });

  it('drops a non-http URL and an unknown type to the datasheet defaults', () => {
    const out = applyAestheticEngine({ url: 'ftp://example.com/x.glb', type: 'fbx', scale: 99 }, 'asset_link');
    assert.deepEqual(out, { url: '', type: 'glb', scale: { x: 10, y: 10, z: 10 } });
    const bad = diagnoseParams({ url: 'not-a-url' }, 'asset_link');
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(' '), /url/);
  });
});

describe('weather — round-trip (already worked; now junk-free)', () => {
  it('the generic 10-key AI answer moves the weather slice and nothing else', async () => {
    // What the generic environment prompt returns today: all 10 keys.
    await synthesizeToStore('weather', {
      sunColor: '#ff9a5c', terrainRoughness: 0.6, rotationSpeed: 0.004,
      atmosphereDensity: 0.4, ambientLightIntensity: 0.9, terrainType: 'desert',
      weatherType: 'storm', precipitationIntensity: 0.9, windSpeed: 80, objectDensity: 0.3,
    }, 'a tempest over the ridge');
    const weather = useEngineStore.getState().weather;
    assert.equal(weather.weatherType, 'storm');
    assert.equal(weather.precipitationIntensity, 0.9);
    assert.equal(weather.windSpeed, 80);
    for (const key of ENV_JUNK_KEYS) {
      assert.equal(key in weather, false, `${key} leaked into the weather slice`);
    }
  });

  it('applyAestheticEngine for weather returns exactly the three weather keys', () => {
    const out = applyAestheticEngine({
      sunColor: '#ff9a5c', terrainType: 'desert', weatherType: 'snow',
      precipitationIntensity: 0.85, windSpeed: 70, objectDensity: 0.3,
    }, 'weather');
    assert.deepEqual(Object.keys(out).sort(), ['precipitationIntensity', 'weatherType', 'windSpeed']);
    assert.deepEqual(out, { weatherType: 'snow', precipitationIntensity: 0.85, windSpeed: 70 });
    assert.deepEqual(applyAestheticEngine({}, 'weather'), { weatherType: 'clear', precipitationIntensity: 0, windSpeed: 0 });
  });
});

describe('world — round-trip unchanged', () => {
  it('the generic 10-key AI answer still moves the world slice', async () => {
    await synthesizeToStore('world', {
      sunColor: '#ff9a5c', terrainRoughness: 0.6, rotationSpeed: 0.004,
      atmosphereDensity: 0.4, ambientLightIntensity: 0.9, terrainType: 'desert',
      weatherType: 'ash', precipitationIntensity: 0.4, windSpeed: 25, objectDensity: 0.3,
    }, 'a crimson desert');
    const world = useEngineStore.getState().world;
    assert.equal(world.terrainType, 'desert');
    assert.equal(world.sunColor, '#ff9a5c');
    assert.equal(world.weatherType, 'ash');
    assert.equal(world.windSpeed, 25);
  });
});
