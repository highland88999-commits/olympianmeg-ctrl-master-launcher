// tests/particle-sprites.test.mjs — PARTICLE + WEATHER GRAPHICS
// (Merlin, Nov 15 ~15:54): every light particle and weather element in
// the ecosystem wears a GRAPHIC that resonates with its realm — a sprite
// with light bleed (bright core, soft radial falloff to transparent),
// drawn procedurally in lib/particles/sprites.js.
//
// Audit (verified in code, see ~/workspace/particle-audit/PLAN.md):
// 55 worlds contain light particles; 68 world particle/weather systems;
// 4 worlds contain none (Earth 4, Middle-earth, Hollow Earth, Sun base).
// This suite asserts the library, the afterlife kind map, and that every
// wired system references its sprite (source-level — the textures are
// canvas-drawn at runtime, so node asserts the wiring, not pixels).
// Run: node tests/particle-sprites.test.mjs (repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AFTERLIFE_PARTICLE_SPRITE,
  PARTICLE_SPRITE_KINDS,
  getParticleTexture,
  spriteKindForAfterlife,
} from '../lib/particles/sprites.js';
import { REALM_SURFACE_KEYS } from '../lib/portal/realm-surfaces.js';

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

// ── Library ──────────────────────────────────────────────────────────

test('library exports all 14 sprite kinds', () => {
  assert.deepEqual([...PARTICLE_SPRITE_KINDS].sort(), [
    'ash', 'bubble', 'drop', 'ember', 'firefly', 'flake', 'glow', 'grain',
    'mist', 'petal', 'shard', 'spark', 'star', 'wisp',
  ]);
});

test('afterlife kind map covers all 25 afterlife realms', () => {
  const keys = Object.keys(AFTERLIFE_PARTICLE_SPRITE);
  assert.equal(keys.length, 25);
  // All 13 nether keys (the surface registry) are in the map.
  for (const k of REALM_SURFACE_KEYS) {
    assert.ok(keys.includes(k), `map missing nether realm ${k}`);
  }
  // The 11 higher realms + Ghost Rider.
  for (const k of [
    'heaven', 'elysium', 'valhalla', 'aaru', 'svarga', 'takamagahara',
    'tiangong', 'tir-na-nog', 'tlalocan', 'maya-sky', 'vyraj',
    'ghost-rider',
  ]) {
    assert.ok(keys.includes(k), `map missing realm ${k}`);
  }
  // Every mapped kind is a real kind.
  for (const [realm, kind] of Object.entries(AFTERLIFE_PARTICLE_SPRITE)) {
    assert.ok(
      PARTICLE_SPRITE_KINDS.includes(kind),
      `${realm} maps to unknown kind ${kind}`,
    );
  }
});

test('spriteKindForAfterlife reads the map', () => {
  assert.equal(spriteKindForAfterlife('hades'), 'ember');
  assert.equal(spriteKindForAfterlife('helheim'), 'flake');
  assert.equal(spriteKindForAfterlife('orun'), 'firefly');
  assert.equal(spriteKindForAfterlife('maya-sky'), 'star');
  assert.equal(spriteKindForAfterlife('vyraj'), 'petal');
  assert.equal(spriteKindForAfterlife('no-such-realm'), undefined);
});

test('getParticleTexture is SSR-safe: null without a document, never throws', () => {
  assert.equal(getParticleTexture('glow'), null);
  assert.equal(getParticleTexture('flake'), null);
  assert.equal(getParticleTexture('not-a-kind'), null);
});

// ── Afterlife wiring (25 files, one points system each) ──────────────

const AFTERLIFE_FILES = {
  hades: 'app/nether-realm/world3d.js',
  hell: 'app/hell/world3d.js',
  helheim: 'app/helheim/world3d.js',
  diyu: 'app/diyu/world3d.js',
  duat: 'app/duat/world3d.js',
  naraka: 'app/naraka/world3d.js',
  mictlan: 'app/mictlan/world3d.js',
  xibalba: 'app/xibalba/world3d.js',
  kur: 'app/kur/world3d.js',
  annwn: 'app/annwn/world3d.js',
  yomi: 'app/yomi/world3d.js',
  nav: 'app/nav/world3d.js',
  orun: 'app/orun/world3d.js',
  'ghost-rider': 'app/ghost-rider/world3d.js',
  heaven: 'app/heaven/world3d.js',
  elysium: 'app/elysium/world3d.js',
  valhalla: 'app/valhalla/world3d.js',
  aaru: 'app/aaru/world3d.js',
  svarga: 'app/svarga/world3d.js',
  takamagahara: 'app/takamagahara/world3d.js',
  tiangong: 'app/tiangong/world3d.js',
  'tir-na-nog': 'app/tir-na-nog/world3d.js',
  tlalocan: 'app/tlalocan/world3d.js',
  'maya-sky': 'app/maya-sky/world3d.js',
  vyraj: 'app/vyraj/world3d.js',
};

test('all 25 afterlife particle systems wear their mapped sprite', () => {
  assert.equal(Object.keys(AFTERLIFE_FILES).length, 25);
  for (const [realm, file] of Object.entries(AFTERLIFE_FILES)) {
    const text = src(file);
    const kind = AFTERLIFE_PARTICLE_SPRITE[realm];
    assert.ok(
      text.includes("from '@/lib/particles/sprites'"),
      `${realm}: missing sprite import`,
    );
    assert.ok(
      text.includes(`getParticleTexture('${kind}')`),
      `${realm}: not wired to kind ${kind}`,
    );
    assert.ok(
      text.includes('map={tex ?? undefined}'),
      `${realm}: missing map with plain-points fallback`,
    );
    assert.equal(
      countOccurrences(text, '<pointsMaterial'),
      1,
      `${realm}: expected exactly one points system`,
    );
  }
});

// ── Shared helpers ───────────────────────────────────────────────────

test('makeDustField takes a sprite and defaults to glow', () => {
  const text = src('lib/planet-cgi/motion.js');
  assert.ok(text.includes("sprite = 'glow'"), 'missing sprite default');
  assert.ok(
    text.includes('map: getParticleTexture(sprite) || undefined'),
    'dust material has no sprite map',
  );
});

test('makeSandField takes a sprite and defaults to grain', () => {
  const text = src('lib/mars2/weather.js');
  assert.ok(text.includes("sprite = 'grain'"), 'missing sprite default');
  assert.ok(text.includes('getParticleTexture(sprite)'), 'sand has no sprite map');
});

test('weather-builder maps one sprite per weather type', () => {
  const text = src('lib/world-engine/weather-builder.js');
  for (const [type, kind] of Object.entries({
    clear: 'grain', rain: 'drop', snow: 'flake',
    fog: 'mist', storm: 'drop', ash: 'ash',
  })) {
    assert.ok(text.includes(`${type}: '${kind}'`), `missing ${type} -> ${kind}`);
  }
});

test('environment particleField takes a sprite; starPoints wear star', () => {
  const text = src('lib/worlds/environment.js');
  assert.ok(text.includes("sprite = 'glow'"), 'particleField missing sprite param');
  assert.ok(
    text.includes('map: getParticleTexture(sprite) || undefined'),
    'particleField has no sprite map',
  );
});

// ── Planets, hub, Earth 2 ────────────────────────────────────────────

test('Moon, Mars, Mars 2, Jupiter 2 systems wear their sprites', () => {
  assert.ok(src('lib/moon.js').includes("sprite: 'grain'"), 'moon dust not grain');
  const mars = src('components/mars/MarsScene.jsx');
  assert.ok(mars.includes("sprite: 'grain'"), 'mars dust not grain');
  assert.ok(mars.includes("getParticleTexture('star')"), 'mars stars not star');
  const mars2 = src('components/mars2/Mars2Scene.jsx');
  assert.ok(mars2.includes("sprite: 'grain'"), 'mars2 dust not grain');
  assert.ok(mars2.includes("getParticleTexture('star')"), 'mars2 stars not star');
  const j2 = src('components/jupiter2/Jupiter2Scene.jsx');
  assert.ok(j2.includes("getParticleTexture('drop')"), 'j2 rain not drop');
  assert.ok(j2.includes("sprite: 'mist'"), 'j2 haze/murk not mist');
});

test('hub nanites wear glow; hub starfield wears star', () => {
  const portals = src('components/HubPortals.jsx');
  assert.ok(portals.includes("getParticleTexture('glow')"), 'nanites not glow');
  assert.ok(portals.includes('map={glowTex}'), 'nanites missing map');
  const solar = src('components/olympus/SolarSystem.jsx');
  assert.ok(solar.includes("getParticleTexture('star')"), 'starfield not star');
});

test('Earth 2 precip swaps drop/flake; Earth 2 stars wear star', () => {
  const text = src('components/earth2/Earth2World.jsx');
  assert.ok(text.includes("getParticleTexture('drop')"), 'rain not drop');
  assert.ok(text.includes("getParticleTexture('flake')"), 'snow not flake');
  assert.ok(
    text.includes("precipKind === 'snow' ? snowTex : rainTex"),
    'precip kind-swap broken',
  );
  assert.ok(text.includes("getParticleTexture('star')"), 'earth2 stars not star');
});

test('Earth 3 rise column keeps its soft radial texture (already wrapped)', () => {
  assert.ok(
    src('app/new-earth/scene.js').includes('map: ctx.tex.soft'),
    'rise column lost its texture',
  );
});

// ── Dutchman, Star Wars, Aethelgard, Erebus/Myriad, seasonal ───────

test('Dutchman stars wear star; Dutchman rain wears drop', () => {
  const text = src('app/flying-dutchman/sea3d.js');
  assert.ok(text.includes("getParticleTexture('star')"), 'dutchman stars not star');
  assert.ok(text.includes("getParticleTexture('drop')"), 'dutchman rain not drop');
});

test('all 17 Star Wars motes configs carry a sprite; zone starfield wears star', () => {
  const cgi = src('app/star-wars/cgi.js');
  assert.equal(countOccurrences(cgi, 'sprite:'), 17);
  assert.ok(cgi.includes("getParticleTexture(cfg.sprite || 'glow')"));
  const zone = src('app/star-wars/zone.js');
  assert.ok(zone.includes("getParticleTexture('star')"), 'zone stars not star');
});

test('Aethelgard rain wears drop; fireflies wear firefly', () => {
  assert.ok(
    src('components/aethelgard/Atmosphere.jsx').includes("getParticleTexture('drop')"),
    'aethelgard rain not drop',
  );
  assert.ok(
    src('components/aethelgard/Wildlife.jsx').includes("getParticleTexture('firefly')"),
    'fireflies not firefly',
  );
});

test('Erebus/Myriad starfields wear star; Myriad sparks wear spark', () => {
  assert.ok(
    src('app/erebus/page.jsx').includes("getParticleTexture('star')"),
    'erebus stars not star',
  );
  assert.ok(
    src('app/myriad/page.jsx').includes("getParticleTexture('star')"),
    'myriad stars not star',
  );
  assert.ok(
    src('components/myriad/MyriadExtras.jsx').includes("getParticleTexture('spark')"),
    'myriad sparks not spark',
  );
});

test('Erebus has exactly one glowTexture (duplicate removed)', () => {
  assert.equal(
    countOccurrences(src('app/erebus/page.jsx'), 'function glowTexture'),
    1,
  );
});

test('seasonal snow wears flake; firework bursts wear spark', () => {
  const text = src('lib/seasonal/decorations.js');
  assert.ok(text.includes("getParticleTexture('flake')"), 'snow not flake');
  assert.ok(text.includes("getParticleTexture('spark')"), 'bursts not spark');
});
