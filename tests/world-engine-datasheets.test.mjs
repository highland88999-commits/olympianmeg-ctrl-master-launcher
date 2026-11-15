// tests/world-engine-datasheets.test.mjs
// Datasheets for the 8 non-weapon World Engine builders: every sheet's
// contents match what the builders already expect, and the wiring (sheet
// -> lib/page) is real, not aspirational.
//
// Run: node --test tests/world-engine-datasheets.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// localStorage stub + zustand resolver, same pattern as
// lib/world-engine/test-store.mjs (zustand/persist needs localStorage).
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
  VALID_TERRAIN, VALID_WEATHER, DEFAULT_PARAMS, PARAM_RANGES,
  TERRAIN_PALETTES, WATER_TERRAIN_TYPES, TERRAIN_PEAKS,
  WORLD_STORE_DEFAULTS, WORLD_SLIDERS, WORLD_PRESETS,
} from '../lib/world-engine/datasheets/world.js';
import {
  CHARACTER_KINDS, ANIMATION_SETS, BAUPLAN_RANGES,
  CHARACTER_STORE_DEFAULTS, CREATURE_STORE_DEFAULTS,
  CHARACTER_SLIDERS, CHARACTER_PRESETS, CREATURE_PRESETS,
  FAUNA_ARCHETYPES,
} from '../lib/world-engine/datasheets/characters.js';
import {
  VEHICLE_CLASSES, VEHICLE_SLIDERS, VEHICLE_STORE_DEFAULTS,
  VEHICLE_PREVIEW, VEHICLE_PRESETS,
} from '../lib/world-engine/datasheets/vehicles.js';
import {
  WEAPON_SLIDERS, WEAPON_STORE_DEFAULTS,
} from '../lib/world-engine/datasheets/weapons.js';
import {
  WEATHER_TYPES, WEATHER_SPRITE, WEATHER_SYSTEMS,
  WEATHER_SLIDERS, WEATHER_STORE_DEFAULTS, WEATHER_PRESETS,
} from '../lib/world-engine/datasheets/weather.js';
import {
  MATERIALS, OBJECT_SLIDERS, OBJECT_STORE_DEFAULTS,
  OBJECT_DENSITY_RULES, OBJECT_PRESETS,
} from '../lib/world-engine/datasheets/objects.js';
import {
  ASSET_FORMATS, URL_RULES, UPLINK_SLIDERS,
  ASSET_LINK_STORE_DEFAULTS, UPLINK_PRESETS,
} from '../lib/world-engine/datasheets/uplink.js';
import {
  STUDIO_DEFAULTS, STUDIO_SLIDERS, STUDIO_LIMITS,
  STUDIO_PRESETS, buildHologramSchema, hologramPreviewStyle,
} from '../lib/world-engine/datasheets/studio.js';
import {
  ENGINE_RENDER, ENGINE_SCENES, ENGINE_CONTROLS_HINT,
} from '../lib/world-engine/datasheets/engine.js';
import { DATASHEET_BUILDERS } from '../lib/world-engine/datasheets/index.js';
import {
  VALID_TERRAIN as AESTHETIC_TERRAIN,
  VALID_WEATHER as AESTHETIC_WEATHER,
  DEFAULT_PARAMS as AESTHETIC_DEFAULTS,
  applyAestheticEngine,
} from '../lib/world-engine/aesthetic.js';
import { COST_MAP, costFor, FREE_GENERATIONS_PER_MONTH } from '../lib/world-engine/economy.js';
import { SECTORS } from '../lib/world-engine/sectors.js';
import { WEATHER_TYPES as BUILDER_WEATHER_TYPES } from '../lib/world-engine/weather-builder.js';

const { useEngineStore } = await import('../lib/world-engine/useEngineStore.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const sliderByKey = (sliders) => Object.fromEntries(sliders.map((s) => [s.key, s]));

describe('world sheet', () => {
  it('vocabularies are the code\'s own lists (5 terrains, 6 weather)', () => {
    assert.deepEqual(VALID_TERRAIN, ['plains', 'mountains', 'desert', 'ocean', 'alien']);
    assert.deepEqual(VALID_WEATHER, ['clear', 'rain', 'snow', 'fog', 'storm', 'ash']);
    assert.deepEqual(WEATHER_TYPES, VALID_WEATHER);
  });

  it('aesthetic.js re-exports the sheet (same references, no drift)', () => {
    assert.equal(AESTHETIC_TERRAIN, VALID_TERRAIN);
    assert.equal(AESTHETIC_WEATHER, VALID_WEATHER);
    assert.equal(AESTHETIC_DEFAULTS, DEFAULT_PARAMS);
  });

  it('every preset survives applyAestheticEngine() unchanged', () => {
    for (const p of WORLD_PRESETS) {
      assert.equal(p.lifeType && typeof p.lifeType, 'string');
      assert.deepEqual(applyAestheticEngine(p.params), p.params, `${p.id} preset changed by clamps`);
    }
  });

  it('palettes cover every terrain with 4 hex numbers; peaks match the engine', () => {
    assert.deepEqual(Object.keys(TERRAIN_PALETTES).sort(), [...VALID_TERRAIN].sort());
    for (const [t, pal] of Object.entries(TERRAIN_PALETTES)) {
      assert.equal(pal.length, 4, t);
      for (const c of pal) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `${t} color ${c}`);
    }
    assert.deepEqual(TERRAIN_PEAKS, { mountains: 14, desert: 5, plains: 3, ocean: 3, alien: 3 });
    assert.deepEqual(WATER_TERRAIN_TYPES, ['ocean', 'plains', 'alien']);
  });

  it('slider defaults sit inside the aesthetic clamp ranges', () => {
    for (const s of WORLD_SLIDERS) {
      const r = PARAM_RANGES[s.key];
      assert.ok(s.default >= r.min && s.default <= r.max, `${s.key} default ${s.default}`);
      assert.ok(s.max <= r.max, `${s.key} max`);
    }
    // KNOWN MISMATCH (pre-existing in code, behavior kept as-is): the
    // terrainRoughness slider starts at 0 but the aesthetic clamp starts
    // at 0.1 — a 0 from the slider is clamped to 0.1 downstream.
    const rough = WORLD_SLIDERS.find((s) => s.key === 'terrainRoughness');
    assert.equal(rough.min, 0);
    assert.equal(PARAM_RANGES.terrainRoughness.min, 0.1);
  });

  it('cost is the economy cost (500 Aether)', () => {
    assert.equal(COST_MAP.world, 500);
    assert.equal(costFor('world'), 500);
  });

  it('store defaults are the sheet defaults', () => {
    assert.deepEqual(useEngineStore.getState().world, WORLD_STORE_DEFAULTS);
  });
});

describe('characters sheet', () => {
  it('humanoid presets stay inside the height slider (0.5–5 m)', () => {
    const s = sliderByKey(CHARACTER_SLIDERS).height;
    assert.equal(CHARACTER_KINDS.length, 2);
    for (const p of CHARACTER_PRESETS) {
      assert.ok(p.params.height >= s.min && p.params.height <= s.max, p.id);
      assert.ok(ANIMATION_SETS.includes(p.params.animationSet), p.id);
    }
  });

  it('creature presets use only life-seed archetypes and bauplan ranges', () => {
    for (const p of CREATURE_PRESETS) {
      assert.ok(FAUNA_ARCHETYPES.includes(p.params.archetype), p.id);
      const b = p.params.bauplan;
      for (const [k, r] of Object.entries(BAUPLAN_RANGES)) {
        if (k in b) assert.ok(b[k] >= r.min && b[k] <= r.max, `${p.id}.${k}=${b[k]}`);
      }
      assert.ok(p.aggression >= 0 && p.aggression <= 1, p.id);
    }
  });

  it('only "idle" is an evidenced animation set', () => {
    assert.deepEqual(ANIMATION_SETS, ['idle']);
    assert.equal(CHARACTER_STORE_DEFAULTS.animationSet, 'idle');
  });

  it('costs match the economy (character 200, creature 200)', () => {
    assert.equal(costFor('character'), 200);
    assert.equal(costFor('creature'), 200);
  });

  it('store defaults are the sheet defaults', () => {
    assert.deepEqual(useEngineStore.getState().character, CHARACTER_STORE_DEFAULTS);
    assert.deepEqual(useEngineStore.getState().creature, CREATURE_STORE_DEFAULTS);
  });
});

describe('vehicles sheet', () => {
  it('presets stay inside the speed/handling sliders', () => {
    const s = sliderByKey(VEHICLE_SLIDERS);
    assert.deepEqual(VEHICLE_CLASSES.map((c) => c.id), ['ground', 'air', 'space']);
    for (const p of VEHICLE_PRESETS) {
      assert.ok(p.params.speed >= s.speed.min && p.params.speed <= s.speed.max, p.id);
      assert.ok(p.params.handling >= s.handling.min && p.params.handling <= s.handling.max, p.id);
      assert.ok(VEHICLE_CLASSES.some((c) => c.id === p.vehicleClass), p.id);
    }
  });

  it('preview length grows with speed exactly as MiniViewport does', () => {
    assert.equal(VEHICLE_PREVIEW.lengthScale(50), 1.25);
    assert.equal(VEHICLE_PREVIEW.lengthScale(300), 2.5);
    assert.deepEqual(VEHICLE_PREVIEW.dimensions, { x: 2, y: 0.8, z: 4 });
  });

  it('cost matches the economy (200 Aether)', () => {
    assert.equal(costFor('vehicle'), 200);
  });

  it('store defaults are the sheet defaults', () => {
    assert.deepEqual(useEngineStore.getState().vehicle, VEHICLE_STORE_DEFAULTS);
  });
});

describe('weather sheet', () => {
  it('weather-builder reads the sheet vocabulary', () => {
    assert.deepEqual(BUILDER_WEATHER_TYPES, WEATHER_TYPES);
    assert.deepEqual(Object.keys(WEATHER_SYSTEMS).sort(), [...WEATHER_TYPES].sort());
  });

  it('particle counts follow the builder formulas', () => {
    assert.equal(WEATHER_SYSTEMS.rain.count(0), 400);
    assert.equal(WEATHER_SYSTEMS.rain.count(1), 1800);
    assert.equal(WEATHER_SYSTEMS.snow.count(1), 1300);
    assert.equal(WEATHER_SYSTEMS.storm.count(1), 1800);
    assert.equal(WEATHER_SYSTEMS.fog.count(0), 26);
    assert.equal(WEATHER_SYSTEMS.clear.count(), 120);
  });

  it('sprites are real particle kinds from lib/particles/sprites.js', () => {
    const kinds = ['grain', 'drop', 'flake', 'mist', 'ash'];
    for (const v of Object.values(WEATHER_SPRITE)) assert.ok(kinds.includes(v), v);
  });

  it('presets use only the weather vocabulary and the 0–1 / 0–100 ranges', () => {
    for (const p of WEATHER_PRESETS) {
      assert.ok(WEATHER_TYPES.includes(p.params.weatherType), p.id);
      assert.ok(p.params.precipitationIntensity >= 0 && p.params.precipitationIntensity <= 1, p.id);
      assert.ok(p.params.windSpeed >= 0 && p.params.windSpeed <= 100, p.id);
    }
  });

  it('cost matches the economy (300 Aether); store keeps particleLimit/fogDensity', () => {
    assert.equal(costFor('weather'), 300);
    assert.equal(WEATHER_STORE_DEFAULTS.particleLimit, 5000);
    assert.equal(WEATHER_STORE_DEFAULTS.fogDensity, 0.0);
    assert.deepEqual(useEngineStore.getState().weather, WEATHER_STORE_DEFAULTS);
  });
});

describe('objects sheet', () => {
  it('presets use the evidenced material and the 0–1 density slider', () => {
    assert.deepEqual(MATERIALS, ['standard']);
    for (const p of OBJECT_PRESETS) {
      assert.ok(MATERIALS.includes(p.params.material), p.id);
      assert.ok(p.params.density >= 0 && p.params.density <= 1, p.id);
    }
  });

  it('density rules reproduce the renderers\' counts', () => {
    assert.equal(OBJECT_DENSITY_RULES.seedlessWorldPropCount(0.5), 30);
    assert.equal(OBJECT_DENSITY_RULES.seededWorldFloraPerKind(0.5), 30);
    assert.equal(OBJECT_DENSITY_RULES.seededWorldFloraPerKind(1), 48);
  });

  it('cost matches the economy (100 Aether)', () => {
    assert.equal(costFor('object'), 100);
    assert.deepEqual(useEngineStore.getState().object, OBJECT_STORE_DEFAULTS);
  });
});

describe('uplink sheet', () => {
  it('URL rules accept https, reject ftp', () => {
    assert.ok(URL_RULES.pattern.test('https://example.com/model.glb'));
    assert.ok(!URL_RULES.pattern.test('ftp://example.com/model.glb'));
    assert.equal(URL_RULES.maxUrlChars, 500);
    assert.equal(URL_RULES.maxPromptChars, 2000);
  });

  it('only glb is evidenced; presets stay inside the 0.1–10 scale slider', () => {
    assert.deepEqual(ASSET_FORMATS, ['glb']);
    const s = sliderByKey(UPLINK_SLIDERS).scale;
    for (const p of UPLINK_PRESETS) {
      assert.equal(p.params.type, 'glb');
      assert.ok(p.params.scale.x >= s.min && p.params.scale.x <= s.max, p.id);
    }
  });

  it('cost matches the economy (50 Aether — cheapest synthesis)', () => {
    assert.equal(costFor('asset_link'), 50);
    assert.deepEqual(useEngineStore.getState().assetLink, ASSET_LINK_STORE_DEFAULTS);
  });
});

describe('studio sheet', () => {
  it('the default schema is exactly what the page exported', () => {
    assert.deepEqual(buildHologramSchema({}), {
      assetType: 'HolographicMesh',
      parameters: {
        content: 'WORLD ENGINE',
        emissiveColor: '#00ffcc',
        scaleMultiplier: 4,
        bloomIntensity: 1.5,
        rotation: { x: 0, y: 0, z: 0 },
      },
    });
  });

  it('preview glow caps at 3 (5 glow -> 24px blur, same as the page)', () => {
    const style = hologramPreviewStyle({ glowIntensity: 5 });
    assert.equal(style.textShadow, '0 0 24px #00ffcc');
    assert.equal(hologramPreviewStyle({}).fontSize, '4rem');
  });

  it('slider defaults match the page defaults; text limit is 60', () => {
    for (const s of STUDIO_SLIDERS) {
      assert.equal(s.default, STUDIO_DEFAULTS[s.key], s.key);
    }
    assert.equal(STUDIO_LIMITS.maxTextLength, 60);
    assert.equal(STUDIO_PRESETS.length, 5);
  });
});

describe('engine sheet', () => {
  it('render constants are the PrecisionEngine literals', () => {
    assert.equal(ENGINE_RENDER.camera.fov, 55);
    assert.deepEqual(ENGINE_RENDER.camera.position, [0, 16, 34]);
    assert.equal(ENGINE_RENDER.stars.count, 900);
    assert.equal(ENGINE_RENDER.terrain.size, 160);
    assert.equal(ENGINE_RENDER.terrain.segments, 96);
    assert.deepEqual(ENGINE_RENDER.terrain.peaks, { mountains: 14, desert: 5, plains: 3, ocean: 3, alien: 3 });
    assert.equal(ENGINE_RENDER.weather.baseParticles, 2500);
    assert.equal(ENGINE_RENDER.controls.maxPolarAngleFactor, 0.495);
  });

  it('engine scenes render as-is through the aesthetic clamps', () => {
    for (const s of ENGINE_SCENES) {
      const { seed, lifeType, ...env } = s.params;
      assert.deepEqual(applyAestheticEngine(env), {
        sunColor: env.sunColor, atmosphereDensity: env.atmosphereDensity,
        ambientLightIntensity: env.ambientLightIntensity, terrainRoughness: env.terrainRoughness,
        rotationSpeed: 0.005, terrainType: env.terrainType, weatherType: env.weatherType,
        precipitationIntensity: env.precipitationIntensity, windSpeed: env.windSpeed,
        objectDensity: env.objectDensity,
      }, s.id);
    }
  });

  it('controls hint is the page footer text', () => {
    assert.equal(ENGINE_CONTROLS_HINT, 'Drag to orbit · Scroll to zoom · Press I for your library');
  });
});

describe('wiring: sectors + index + sources', () => {
  it('sector sliders match the sheet specs (ranges, defaults, formats)', () => {
    const pairs = [
      ['architect', WORLD_SLIDERS], ['characters', CHARACTER_SLIDERS],
      ['vehicles', VEHICLE_SLIDERS], ['weapons', WEAPON_SLIDERS],
      ['weather', WEATHER_SLIDERS],
      ['objects', OBJECT_SLIDERS], ['uplink', UPLINK_SLIDERS],
    ];
    for (const [key, specs] of pairs) {
      const got = SECTORS[key].sliders;
      assert.equal(got.length, specs.length, key);
      for (let idx = 0; idx < specs.length; idx++) {
        for (const field of ['key', 'label', 'min', 'max', 'step', 'default']) {
          assert.equal(got[idx][field], specs[idx][field], `${key}.${specs[idx].key}.${field}`);
        }
        assert.equal(typeof got[idx].parse, 'function', `${key} parse`);
        assert.equal(typeof got[idx].format, 'function', `${key} format`);
      }
    }
  });

  it('the index lists exactly the 9 builders with the right routes', () => {
    assert.equal(DATASHEET_BUILDERS.length, 9);
    assert.deepEqual(DATASHEET_BUILDERS.map((b) => b.route), [
      '/world-engine/architect', '/world-engine/characters', '/world-engine/vehicles',
      '/world-engine/weapons',
      '/world-engine/weather', '/world-engine/objects', '/world-engine/uplink',
      '/world-engine/studio', '/world-engine/engine',
    ]);
  });

  it('the libs actually import their sheets (source-level wiring guard)', () => {
    assert.ok(read('lib/world-engine/aesthetic.js').includes("from './datasheets/world.js'"));
    assert.ok(read('lib/world-engine/world-builder.js').includes("from './datasheets/world.js'"));
    assert.ok(read('lib/world-engine/weather-builder.js').includes("from './datasheets/weather.js'"));
    assert.ok(read('lib/world-engine/sectors.js').includes("from './datasheets/world.js'"));
    assert.ok(read('lib/world-engine/sectors.js').includes("from './datasheets/weapons.js'"));
    assert.ok(read('lib/world-engine/aesthetic.js').includes("from './datasheets/weapons.js'"));
    assert.ok(read('lib/world-engine/useEngineStore.js').includes("from './datasheets/weapons.js'"));
    assert.ok(read('lib/world-engine/useEngineStore.js').includes("from './datasheets/weather.js'"));
    assert.ok(read('lib/world-engine/PrecisionEngine.js').includes("from './datasheets/engine.js'"));
    assert.ok(read('app/world-engine/studio/page.jsx').includes("from '@/lib/world-engine/datasheets/studio'"));
    // No sheet file may mention the weapons sheet or forge agent
    // (the weapons sheet itself is the 9th sheet; the other eight
    // stay independent of it).
    for (const f of ['world', 'characters', 'vehicles', 'weather', 'objects', 'uplink', 'studio', 'engine']) {
      const src = read(`lib/world-engine/datasheets/${f}.js`);
      assert.ok(!src.includes('forge-agent'), `${f}.js touches the forge agent`);
      assert.ok(!src.includes('weapons'), `${f}.js touches weapons`);
    }
  });

  it('free tier is 20 generations/month across all builders', () => {
    assert.equal(FREE_GENERATIONS_PER_MONTH, 20);
  });
});
