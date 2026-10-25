// Content data: clusters, modes, hero persistence, campaign gate, return point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD, CLUSTERS, CLUSTER_ORDER, INTRO,
  createProgress, heroOf, setHero, isMissionDone, clusterMissionsDone, completeMission,
  createCampaign, gateOpen, gateProgress, recordKill, setShield, completeKorus,
  entrySpawn, markVisited, rewardItemInput, KORUS_REWARD,
} from '../data.js';
import { DEFAULT_HERO } from '../characters.js';
import { KORUS_GATE_KILLS } from '../spawns.js';

test('world def: one ever-expansive disc, spawn and Haven landmarks present', () => {
  assert.equal(WORLD.id, 'monsterverse');
  assert.ok(WORLD.worldRadius >= 300);
  const types = WORLD.landmarks.map((l) => l.type);
  assert.ok(types.includes('haven'), 'no Haven landmark');
  assert.ok(types.includes('korus-throne'), 'no Korus throne');
});

test('mode contract: 3 clusters, 2–3 missions each, every mission has an objective', () => {
  assert.deepEqual(CLUSTER_ORDER, ['wilds', 'stormlands', 'dark-reaches']);
  for (const cid of CLUSTER_ORDER) {
    const c = CLUSTERS[cid];
    assert.ok(c.missions.length >= 2 && c.missions.length <= 3, `${cid} has ${c.missions.length} missions`);
    for (const m of c.missions) {
      assert.ok(m.title && m.objective && m.difficulty >= 1 && m.difficulty <= 3);
      assert.ok(m.target || m.hunt, `${m.id} has neither target nor hunt`);
    }
  }
});

test('intro panel: gold title, elemental orbs for all seven elements', () => {
  assert.equal(INTRO.title, 'OLYMPIAN MONSTERVERSE');
  assert.equal(INTRO.orbs.length, 7);
  for (const o of INTRO.orbs) assert.ok(o.element && o.color);
  assert.ok(INTRO.orbs.some((o) => o.element === 'frost'), 'no frost orb');
});

test('hero persistence: default is the Monster Hunter, setHero validates', () => {
  assert.equal(DEFAULT_HERO, 'monster-hunter');
  const p = createProgress();
  assert.equal(heroOf(p), 'monster-hunter');
  assert.equal(heroOf(setHero(p, 'dwarf')), 'dwarf');
  assert.equal(heroOf(setHero(p, 'nope')), 'monster-hunter');
});

test('mission completion marks the cluster beat only for the first mission', () => {
  let p = createProgress();
  const first = CLUSTERS.wilds.missions[0];
  const second = CLUSTERS.wilds.missions[1];
  assert.equal(isMissionDone(p, 'wilds', first), false);
  p = completeMission(p, 'wilds', second.id);
  assert.equal(isMissionDone(p, 'wilds', second), true);
  assert.equal(clusterMissionsDone(p, 'wilds'), 1);
  p = completeMission(p, 'wilds', first.id);
  assert.equal(p.beatsDone.wilds, true);
  assert.equal(clusterMissionsDone(p, 'wilds'), 2);
});

test('Korus gate opens at the documented kill count, progress counts down', () => {
  let c = createCampaign();
  assert.equal(gateOpen(c), false);
  for (let i = 0; i < KORUS_GATE_KILLS; i++) c = recordKill(c);
  assert.equal(gateOpen(c), true);
  assert.equal(gateProgress(c).remaining, 0);
  assert.equal(gateProgress(createCampaign()).needed, KORUS_GATE_KILLS);
});

test('shield persists in the campaign record', () => {
  const c = setShield(createCampaign(), 50);
  assert.equal(c.shield, 50);
});

test('return point: first entry spawns on arrival ground, later entries at The Haven', () => {
  const fresh = createProgress();
  assert.deepEqual(entrySpawn(fresh), { x: 0, z: 95 });
  assert.deepEqual(entrySpawn(markVisited(fresh)), { x: 0, z: 155 });
});

test('Korus reward is a legendary blade with a backpack-safe item input', () => {
  assert.equal(KORUS_REWARD.rarity, 'legendary');
  const input = rewardItemInput();
  assert.equal(input.kind, 'weapon');
  assert.equal(input.meta.weaponClass, 'blade');
  assert.equal(input.meta.rarity, 'legendary');
  const c = completeKorus(createCampaign(), 1234);
  assert.equal(c.korusDone, true);
  assert.equal(c.korusAt, 1234);
});
