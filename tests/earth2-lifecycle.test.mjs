// Earth 2 — death & respawn (Wave A): the lifecycle manager
// and its far-anchor chooser. Merlin's law: "When one animal
// dies, it should respawn somewhere else on the map." These
// tests pin the far side of the map, the walker's elbow room,
// the same-biome preference, the carcass clock — and the
// fossil hook the future hunt build attaches to.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLifecycle, chooseRespawnAnchor, carcassSink, carcassFossilDrops,
} from '../lib/earth2/lifecycle.js';

const anchorsGrid = () => {
  const out = [];
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) out.push({ x: -630 + i * 140, z: -630 + j * 140, family: i < 5 ? 'Fields' : 'Steppe' });
  }
  return out;
};

describe('the respawn anchor chooser', () => {
  it('sends the dead to the far side of the map, away from the walker', () => {
    const death = { x: -600, z: -600 };
    const player = { x: -560, z: -560 };
    let rngState = 12345;
    const rng = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
    const pick = chooseRespawnAnchor(anchorsGrid(), { deathPos: death, playerPos: player, rng });
    assert.ok(Math.hypot(pick.x - death.x, pick.z - death.z) >= 380, 'far from the death');
    assert.ok(Math.hypot(pick.x - player.x, pick.z - player.z) >= 240, 'away from the walker');
  });

  it('prefers the same biome family when the family is known', () => {
    const pick = chooseRespawnAnchor(anchorsGrid(), {
      deathPos: { x: -600, z: 600 }, playerPos: { x: 0, z: 0 }, family: 'Steppe', rng: () => 0.5,
    });
    assert.equal(pick.family, 'Steppe');
  });

  it('when nothing is far enough, the farthest from the death still wins', () => {
    const tight = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 90, z: 0 }];
    const pick = chooseRespawnAnchor(tight, { deathPos: { x: 0, z: 0 }, playerPos: { x: 0, z: 0 }, rng: () => 0.5 });
    assert.equal(pick.x, 90);
  });

  it('no anchors, no answer — never a fabricated spot', () => {
    assert.equal(chooseRespawnAnchor([], { deathPos: { x: 0, z: 0 } }), null);
    assert.equal(chooseRespawnAnchor(null, {}), null);
  });
});

describe('the lifecycle manager', () => {
  it('a kill makes a carcass with the fossil hook riding on it', () => {
    const life = createLifecycle({ seed: 5 });
    life.register('triceratops#0', 'triceratops');
    assert.equal(life.isAlive('triceratops#0'), true);
    const carcass = life.kill('triceratops#0', 100, { x: 10, z: 20 });
    assert.equal(carcass.slug, 'triceratops');
    assert.equal(carcass.fossilHook, true);
    assert.ok(Array.isArray(carcass.fossilDrops), 'huntable species roll their drops at death');
    assert.equal(life.isAlive('triceratops#0'), false);
    // A death is never double-counted.
    assert.equal(life.kill('triceratops#0', 101, { x: 10, z: 20 }), null);
    assert.equal(life.kill('ghost#9', 101, { x: 0, z: 0 }), null);
  });

  it('the giant mosquito leaves no fossils — the sac is its only drop', () => {
    assert.equal(carcassFossilDrops('giant-mosquito', () => 0.5), null);
    const life = createLifecycle({ seed: 5 });
    life.register('mosquito#0', 'giant-mosquito');
    const carcass = life.kill('mosquito#0', 0, { x: 0, z: 0 }, 6);
    assert.equal(carcass.fossilDrops, null);
  });

  it('respawns come due after the delay, exactly once each', () => {
    const life = createLifecycle({ seed: 5, respawnDelayS: 40 });
    life.register('a#0', 'triceratops');
    life.register('b#0', 'triceratops');
    life.kill('a#0', 100, { x: 0, z: 0 });
    life.kill('b#0', 100, { x: 0, z: 0 }, 6); // the mosquito-fast override
    assert.deepEqual(life.dueRespawns(120).map((d) => d.id), ['b#0']);
    assert.deepEqual(life.dueRespawns(120), [], 'handed out once');
    assert.deepEqual(life.dueRespawns(141).map((d) => d.id), ['a#0']);
    life.completeRespawn('a#0');
    assert.equal(life.isAlive('a#0'), true);
    assert.equal(life.status('b#0'), 'pending', 'until the scene confirms it');
    life.completeRespawn('b#0');
    assert.equal(life.isAlive('b#0'), true);
  });

  it('forgetting a streamed-out creature lets it re-register clean', () => {
    const life = createLifecycle({ seed: 5 });
    life.register('a#0', 'triceratops');
    life.kill('a#0', 0, { x: 0, z: 0 });
    life.forget('a#0');
    assert.equal(life.status('a#0'), null);
    life.register('a#0', 'triceratops');
    assert.equal(life.isAlive('a#0'), true);
  });
});

describe('the carcass clock', () => {
  it('a carcass rests, then sinks smoothly to gone', () => {
    const c = { diedAt: 100, lingerS: 50 };
    assert.equal(carcassSink(c, 100), 0);
    assert.equal(carcassSink(c, 129), 0, 'still resting at 58%');
    const mid = carcassSink(c, 140);
    assert.ok(mid > 0 && mid < 1);
    assert.equal(carcassSink(c, 150), 1);
    assert.equal(carcassSink(c, 999), 1);
  });
});

describe('the E2-0680 streamer set (Merlin’s “exploded shards” glance)', () => {
  // The dark shards in the walk video near E2-0680 were chased
  // to ground truth: the stream set at that parcel, the bind
  // poses of every flyer that streams there, and a flap
  // simulation — see the Wave A report. The shards are the
  // meteor crater's own rock silhouettes against the sky. This
  // test pins the set so the finding stays checkable.
  it('the meteor crater sits ON E2-0680 and the flyers there are the ordinary wing', async () => {
    const { streamEntryUnits } = await import('../lib/earth2/streaming.js');
    const { parcelById } = await import('../lib/earth2/parcels.js');
    const { parcelCenterWorld, worldLandforms } = await import('../lib/earth2/world.js');
    const e20680 = parcelById('E2-0680');
    const c = parcelCenterWorld(e20680);
    const units = streamEntryUnits(c.x, c.z);
    const slugs = new Set(units.flatMap((u) => u.slugs || (u.slug ? [u.slug] : [])));
    assert.ok(units.some((u) => u.kind === 'landform'), 'a landform streams at the parcel');
    const crater = worldLandforms().find((l) => l.slug === 'meteor-crater');
    const dCrater = Math.hypot(crater.x - c.x, crater.z - c.z);
    assert.ok(dCrater < 30, `the crater is on the parcel (${dCrater.toFixed(1)} m)`);
    for (const flyer of ['quetzalcoatlus', 'hatzegopteryx', 'pteranodon']) {
      assert.ok(slugs.has(flyer), `${flyer} streams at E2-0680`);
    }
  });
});
