// tests/dino-companion.test.mjs
// THE DINO COMPANION (Merlin, 2026-11-14): a raised dino rides
// the backpack and spawns next to its user in ANY realm the
// backpack lives in. The handle helpers are pure (stub handles,
// no three.js); the realm wiring is pinned by source assertion,
// in the repo's style — Middle-earth and Hollow Earth pass the
// summon/recall callbacks and step the companions every frame.
//
// Run: node --test tests/dino-companion.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  updateCompanions,
  removeCompanion,
  hasCompanion,
} from '../lib/dino-companion.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

describe('companion handles (pure)', () => {
  const stub = (dinoId) => {
    let updates = 0;
    let disposed = false;
    return {
      dinoId,
      update() { updates += 1; },
      dispose() { disposed = true; },
      get updates() { return updates; },
      get disposed() { return disposed; },
    };
  };

  it('updateCompanions steps every live handle', () => {
    const a = stub('dino-a');
    const b = stub('dino-b');
    const list = [a, b];
    updateCompanions(list, 0.016);
    assert.equal(a.updates, 1);
    assert.equal(b.updates, 1);
    assert.equal(list.length, 2);
  });

  it('removeCompanion disposes exactly one dino by id', () => {
    const a = stub('dino-a');
    const b = stub('dino-b');
    const list = [a, b];
    const removed = removeCompanion(list, 'dino-a');
    assert.equal(removed, a);
    assert.equal(a.disposed, true);
    assert.equal(b.disposed, false);
    assert.equal(list.length, 1);
    assert.equal(removeCompanion(list, 'dino-missing'), null);
    assert.equal(list.length, 1);
  });

  it('hasCompanion finds a walking dino by id', () => {
    const list = [stub('dino-a')];
    assert.equal(hasCompanion(list, 'dino-a'), true);
    assert.equal(hasCompanion(list, 'dino-b'), false);
    assert.equal(hasCompanion([], 'dino-a'), false);
    assert.equal(hasCompanion(null, 'dino-a'), false);
  });

  it('dead handles drop out of the step list', () => {
    const list = [stub('dino-a'), null, { dinoId: 'dino-b' }];
    updateCompanions(list, 0.016);
    assert.equal(list.length, 1);
    assert.equal(list[0].dinoId, 'dino-a');
  });
});

describe('the companion spawns beside the walker (source)', () => {
  const mod = read('lib/dino-companion.js');

  it('spawns at the walker + 2 m, on the realm ground', () => {
    assert.ok(mod.includes('walker.pos'), 'reads the shared walker shape');
    assert.ok(mod.includes('wx + 2'), 'spawns beside the walker, not on it');
    assert.ok(mod.includes('groundHeight(sx, sz)'), 'feet on the realm ground');
  });

  it('follows with the breeding law, never a second mover', () => {
    assert.ok(mod.includes('allyMoveDecision'), 'follow/idle/return come from the law');
    assert.ok(mod.includes('growthT(bornAt, Date.now())'), 'growth comes from the birth moment');
    assert.ok(mod.includes('uniformScaleAt'), 'same uniform hatch size as Earth 2');
  });

  it('loads the baby GLB first, the adult second, meshopt-aware', () => {
    assert.ok(mod.includes('babyModelPath(species)'), 'baby model first');
    assert.ok(mod.includes('entry.file'), 'adult fallback');
    assert.ok(mod.includes('MeshoptDecoder'), 'meshopt GLBs decode');
  });
});

describe('realms wire summon + recall through the backpack', () => {
  it('Middle-earth passes both callbacks and steps companions', () => {
    const me = read('app/middle-earth/page.jsx');
    assert.ok(me.includes('onDinoSummon='), 'Middle-earth summons from the pack');
    assert.ok(me.includes('onDinoRecall='), 'Middle-earth sends back to the pack');
    assert.ok(me.includes('updateCompanions(companions, dt, {'), 'companions step every frame with the hunt context');
    assert.ok(me.includes('dinoApiRef'), 'the HUD reaches the zone through a ref');
    assert.ok(me.includes('DINO_STATE_OUT'), 'out dinos restore on entry');
  });

  it('Hollow Earth passes both callbacks and steps companions', () => {
    const he = read('app/hollow-earth/page.jsx');
    assert.ok(he.includes('onDinoSummon='), 'Hollow Earth summons from the pack');
    assert.ok(he.includes('onDinoRecall='), 'Hollow Earth sends back to the pack');
    assert.ok(he.includes('updateCompanions(companions, dt)'), 'companions step every frame');
    assert.ok(he.includes('dinoApiRef'), 'the HUD reaches the world through a ref');
    assert.ok(he.includes('DINO_STATE_OUT'), 'out dinos restore on entry');
  });

  it('the backpack HUD shows dinos with their state and both taps', () => {
    const hud = read('components/backpack/BackpackHud.jsx');
    // The dino group lives in the ONE canonical list
    // (lib/backpack/groups.js) and the HUD orders it first —
    // dinos are the only entries you summon.
    const groups = read('lib/backpack/groups.js');
    assert.ok(groups.includes("kind: 'dino', label: 'Raised dinos'"), 'dinos have their own group');
    assert.ok(hud.includes('HUD_GROUP_ORDER'), 'the HUD orders its groups from the canonical list');
    assert.ok(hud.includes("'dino', 'material'"), 'dinos ride first in the HUD order');
    assert.ok(hud.includes('onDinoRecall'), 'the HUD takes a recall callback');
    assert.ok(hud.includes('— with you'), 'out dinos read as with you');
    assert.ok(hud.includes('— in your pack'), 'pack dinos read as in the pack');
    assert.ok(!hud.includes('— at home on'), 'no dino is sent to live on the land any more');
    assert.ok(hud.includes('tap to send to pack'), 'an out dino taps back to the pack');
    assert.ok(hud.includes('tap to summon'), 'a pack dino taps to summon');
  });

  it('the backpack HUD hatches eggs on tap — no wait', () => {
    const hud = read('components/backpack/BackpackHud.jsx');
    assert.ok(hud.includes('onEggHatch'), 'the HUD takes a hatch callback');
    assert.ok(hud.includes('tap to hatch'), 'an egg row taps to hatch');
    const scene = read('components/earth2/Earth2World.jsx');
    assert.ok(scene.includes('onEggHatch='), 'Earth 2 wires the egg tap');
    assert.ok(!scene.includes('EGG_HATCH_MS'), 'the 10-minute timer is gone');
  });
});
