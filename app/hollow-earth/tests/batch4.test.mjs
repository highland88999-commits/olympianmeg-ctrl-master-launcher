// Batch-4 Hollow Earth wiring: new families, placements, behavior,
// Ghorrum. Pure-data checks; no network, no GLB loads. GLB-ONLY
// rework: there are no procedural figure builders anymore —
// families without a placed GLB simply do not spawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MONSTER_FAMILIES, EXTRA_FAMILIES, EXTRA_FAMILY_KEYS, FAMILY_KEYS,
  FAMILIES_BY_HABITAT,
} from '../families.js';
import {
  MONSTER_TYPES, MONSTER_MODELS, DRAGON_TYPES, ARCHETYPES, ELEMENTS,
  spawnField, KORUS_MODEL,
} from '../spawns.js';
import { BIOME_IDS, biomeAt } from '../biomes.js';
import {
  BATCH4_PLACEMENTS, TRUNCATED_AWAITING_RESEND, GHORRUM_MODEL,
  PLACED_FIELD_KEYS,
  placementFor, placementStatus, modelUrlFor, RAINFOREST_STAGED,
} from '../models.js';
import {
  breatheScale, blinkOpen, clothSway, expressionFor, RUN_STYLES,
  MONSTER_RUN_STYLE_TBD, WEAPON_BY_ARCHETYPE, weaponForArchetype,
  COMBAT_STYLES, combatStylesFor, RELATIVE_VARIANTS, variantFor,
  ROAR_TONES, roarToneFor, GHORRUM_LAUGH_TONE, seedFor,
} from '../behavior.js';
import {
  WATCHER, watcherGazeYaw, watcherBlinkOpen,
  watcherLaughing,
} from '../watcher.js';
import * as SpawnsModule from '../spawns.js';
import * as WatcherModule from '../watcher.js';

test('extra families are valid under the same rules as slot families', () => {
  assert.equal(EXTRA_FAMILY_KEYS.length, 11);
  for (const key of EXTRA_FAMILY_KEYS) {
    const f = EXTRA_FAMILIES[key];
    assert.equal(f.key, key);
    assert.ok(f.name && f.name.length > 0);
    assert.ok(ELEMENTS.includes(f.element), `${key} element ${f.element}`);
    assert.ok(['stalk', 'charge', 'ambush'].includes(f.attitude));
    assert.ok(f.archetype in ARCHETYPES);
    assert.ok(BIOME_IDS.includes(f.habitat), `${key} habitat ${f.habitat} is not a band`);
    assert.ok(['beast', 'vortex'].includes(f.form));
    assert.ok(f.hp >= 100 && f.hp <= 200, `${key} hp ${f.hp} outside 100–200`);
    assert.ok(f.dmg > 0 && f.speed > 0 && f.scaleM > 0 && f.footprintR > 0);
    assert.ok(MONSTER_TYPES[key], `${key} missing from MONSTER_TYPES`);
    assert.equal(MONSTER_MODELS[key].url, `/models/hollow-earth/${key}.glb`);
    assert.ok(FAMILIES_BY_HABITAT[f.habitat].includes(key));
  }
  // Slot families untouched: still exactly 37, keys still slot keys.
  assert.equal(FAMILY_KEYS.length, 37);
  for (const key of FAMILY_KEYS) assert.match(key, /^slot-\d\d$/);
});

test('spawn field: every PLACED extra family spawns in its own band, field stays sane', () => {
  const field = spawnField(77701, { habitatAt: (x, z) => biomeAt(x, z).dominant });
  assert.equal(field.length, 303, `field has ${field.length} records, expected 303`);
  assert.ok(field.length <= 400, `field has ${field.length} records — too many for performance`);
  const seen = new Set(field.map((r) => r.type));
  const placed = new Set(PLACED_FIELD_KEYS);
  for (const key of EXTRA_FAMILY_KEYS) {
    if (placed.has(key)) assert.ok(seen.has(key), `placed extra family ${key} never spawns`);
    else assert.ok(!seen.has(key), `unplaced extra family ${key} spawns`);
  }
  for (const rec of field) {
    const band = biomeAt(rec.x, rec.z).dominant;
    assert.equal(band, MONSTER_TYPES[rec.type].habitat, `${rec.type} sits in ${band}, not ${MONSTER_TYPES[rec.type].habitat}`);
  }
  assert.equal(field.filter((r) => r.type === 'sky-dragon').length, 3);
  assert.equal(field.filter((r) => r.type === 'cinder-dragon').length, 0);
  assert.equal(field.filter((r) => r.type === 'muse-dragon').length, 0);
});

test('placements: unique keys and artifact ids, urls follow the slot scheme', () => {
  const keys = BATCH4_PLACEMENTS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate placement key');
  const ids = BATCH4_PLACEMENTS.map((p) => p.artifactId);
  assert.equal(new Set(ids).size, ids.length, 'duplicate artifact id');
  assert.equal(BATCH4_PLACEMENTS.length, 37); // 20 re-sends + 6 batch-3 seats + 11 new families (Ghorrum excluded: own watcher seat)
  for (const p of BATCH4_PLACEMENTS) {
    assert.equal(modelUrlFor(p.key), p.key === 'korus' ? KORUS_MODEL.url : `/models/hollow-earth/${p.key}.glb`);
    assert.ok(placementFor(p.key), `no placement for ${p.key}`);
  }
  // Truncated twelve are exactly the staged ones; everything else placed.
  assert.equal(TRUNCATED_AWAITING_RESEND.length, 12);
  for (const t of TRUNCATED_AWAITING_RESEND) {
    assert.ok(placementFor(t.key), `${t.key} truncated but unplaced in plan`);
    assert.equal(placementStatus(t.key), 'staged-truncated');
    assert.ok(t.missingBytes > 0);
  }
  assert.equal(placementStatus('slot-10'), 'placed');
});

test('Ghorrum is wired once, and only once', () => {
  const ghorrumPlacements = BATCH4_PLACEMENTS.filter((p) => p.artifactId === 42);
  assert.equal(ghorrumPlacements.length, 0, 'Ghorrum is not a monster placement — he has his own watcher seat');
  assert.equal(GHORRUM_MODEL.url, '/models/hollow-earth/ghorrum.glb');
  assert.ok(!Object.keys(MONSTER_MODELS).includes('ghorrum'), 'Ghorrum must not be a spawnable monster type');
  assert.equal(WATCHER.artifactId, 42);
  assert.equal(WATCHER.model.url, GHORRUM_MODEL.url);
  assert.equal(WATCHER.nonHostile, true);
  assert.equal(WATCHER.excludedFromCombat, true);
  assert.equal(WATCHER.excludedFromHunt, true);
  assert.equal(WATCHER.colliderR, 0);
});

test('procedural figure builders are gone: no stand-in, vortex, or watcher figure exists', () => {
  assert.equal(SpawnsModule.buildMonsterFigure, undefined, 'buildMonsterFigure must be removed');
  assert.equal(SpawnsModule.buildKorusFigure, undefined, 'buildKorusFigure must be removed');
  assert.equal(WatcherModule.buildWatcherFigure, undefined, 'buildWatcherFigure must be removed');
});

test('watcher gaze + blink + laugh helpers behave', () => {
  // Gaze: observer due east of the watcher faces +x => yaw ~+90°.
  const yaw = watcherGazeYaw({ x: 0, z: 0 }, { x: 10, z: 0 });
  assert.ok(Math.abs(yaw - Math.PI / 2) < 0.001, `east gaze yaw ${yaw}`);
  assert.equal(watcherGazeYaw({ x: 0, z: 0 }, { x: 0, z: 0 }), null);
  for (const t of [0, 1, 3, 5, 9]) {
    const open = watcherBlinkOpen(t);
    assert.ok(open >= 0.15 && open <= 1, `watcher blink ${open} at t=${t}`);
  }
  assert.equal(watcherLaughing(1), true, 'laugh window opens at period start');
  assert.equal(watcherLaughing(10), false);
});

test('roar tones: distinct (baseHz, waveform) per monster, every type covered', () => {
  const pairs = new Set();
  for (const [key, tone] of Object.entries(ROAR_TONES)) {
    const pair = `${tone.baseHz}/${tone.waveform}`;
    assert.ok(!pairs.has(pair), `roar collision on ${pair} at ${key}`);
    pairs.add(pair);
    assert.ok(tone.seconds > 0 && tone.character);
  }
  for (const key of Object.keys(MONSTER_TYPES)) {
    assert.ok(ROAR_TONES[key], `no explicit roar tone for ${key}`);
    assert.equal(roarToneFor(key).baseHz, ROAR_TONES[key].baseHz);
  }
  assert.ok(ROAR_TONES.korus);
  assert.ok(GHORRUM_LAUGH_TONE.baseHz < 40, 'Ghorrum laugh must be deep');
});

test('behavior primitives stay in range and are deterministic', () => {
  for (const t of [0, 0.5, 2, 7.3]) {
    const br = breatheScale(t, 0.25);
    assert.ok(br.x >= 1 && br.x <= 1.02 && br.y >= 1 && br.y <= 1.03);
    const bl = blinkOpen(t, 0.25);
    assert.ok(bl >= 0.15 && bl <= 1);
    const sw = clothSway(t, 0.5, 0.25);
    assert.ok(Math.abs(sw.swayX) <= 0.05 && Math.abs(sw.swayZ) <= 0.05);
    assert.equal(breatheScale(t, 0.25).y, br.y, 'breathe must be deterministic');
    assert.equal(blinkOpen(t, 0.25), bl, 'blink must be deterministic');
  }
  assert.ok(['idle', 'fighting', 'talking', 'laughing', 'hunting'].every((s) => expressionFor(s).label));
  assert.ok(seedFor('m-1') >= 0 && seedFor('m-1') < 1);
  assert.equal(seedFor('m-1'), seedFor('m-1'));
});

test('combat is the full set, weapons are archetype weapons, run styles flagged', () => {
  assert.deepEqual(combatStylesFor().sort(), ['gun-shooting', 'martial-arts', 'spell-casting', 'sword-fighting'].sort());
  assert.equal(weaponForArchetype('knight'), 'sword');
  assert.equal(weaponForArchetype('hunter'), 'blaster');
  assert.equal(weaponForArchetype('ranger'), 'bow');
  assert.equal(weaponForArchetype('wizard'), 'staff');
  assert.ok(WEAPON_BY_ARCHETYPE.knight && WEAPON_BY_ARCHETYPE.hunter);
  assert.equal(RUN_STYLES.character.style, 'wick');
  assert.ok(RUN_STYLES.character.leanForward > RUN_STYLES.monster.leanForward);
  assert.equal(RUN_STYLES.monster.style, 'neutral');
  assert.equal(MONSTER_RUN_STYLE_TBD, true, 'monster run style is TBD — Hulk idea not locked');
});

test('relatives are cosmetic only: no stat, footprint, or spawn change', () => {
  for (const id of ['m-0', 'm-1', 'm-2', 'm-3', 'm-4', 'm-5']) {
    const v = variantFor(id);
    assert.ok(RELATIVE_VARIANTS.includes(v));
    assert.ok(v.scaleMul > 0 && v.scaleMul <= 1.2);
    assert.ok(!('hp' in v) && !('dmg' in v) && !('speed' in v) && !('footprintR' in v));
  }
  assert.equal(variantFor('m-7'), variantFor('m-7'), 'variant must be stable per monster');
  // All three kin appear across a spread of ids.
  const labels = new Set(['m-0', 'm-1', 'm-2', 'm-3', 'm-4', 'm-5', 'm-6', 'm-7', 'm-8', 'm-9'].map((id) => variantFor(id).label));
  assert.ok(labels.size >= 2, 'kin variants must actually vary');
});

test('rainforest five are staged-ready, not wired into Hollow Earth', () => {
  assert.equal(RAINFOREST_STAGED.length, 5);
  for (const r of RAINFOREST_STAGED) {
    assert.ok(!placementFor(r.optimized), `${r.optimized} must not be a Hollow Earth placement`);
    assert.ok(!Object.keys(MONSTER_TYPES).some((k) => k.includes('panther') || k.includes('toucan') || k.includes('sloth')));
  }
  assert.deepEqual(RAINFOREST_STAGED.map((r) => r.artifactId).sort((a, b) => a - b), [69, 73, 75, 77, 82]);
});
