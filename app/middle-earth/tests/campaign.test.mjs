// Headless tests for app/middle-earth/campaign.js — kills, the gate,
// the finale, the hunt meter's persistence, and the backpack bridge
// (real backpack addItem: loot and reward items wear lawful reticles).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../campaign.js');
const BP = await import('../../../lib/backpack/backpack.js');

test('recordKill counts per pod and in total, immutably', () => {
  const c0 = C.createCampaign();
  const c1 = C.recordKill(c0, 'rohan');
  const c2 = C.recordKill(c1, 'rohan');
  const c3 = C.recordKill(c2, 'shire');
  assert.equal(c0.totalKills, 0, 'original untouched');
  assert.equal(c3.totalKills, 3);
  assert.equal(c3.killsByPod.rohan, 2);
  assert.equal(c3.killsByPod.shire, 1);
});

test('the gate flips at exactly 30 kills', () => {
  let c = C.createCampaign();
  for (let i = 0; i < 29; i++) c = C.recordKill(c, 'mordor');
  assert.equal(C.gateOpen(c), false);
  assert.deepEqual(C.gateProgress(c), { total: 29, needed: 30, open: false });
  c = C.recordKill(c, 'mordor');
  assert.equal(C.gateOpen(c), true);
  assert.equal(C.gateProgress(c).open, true);
});

test('finale: completeSaruman + claimReward, once', () => {
  let c = C.createCampaign();
  c = C.completeSaruman(c, 12345);
  assert.equal(c.saruman, 'dead');
  assert.equal(c.sarumanKilledAt, 12345);
  assert.equal(c.rewardClaimed, false);
  c = C.claimReward(c);
  assert.equal(c.rewardClaimed, true);
});

test('heat: set/heatOf clamp, death cuts to 35%, persistence sanitizes', () => {
  let c = C.createCampaign();
  assert.equal(C.heatOf(c, 'rohan'), 0);
  c = C.setHeat(c, 'rohan', 80);
  assert.equal(C.heatOf(c, 'rohan'), 80);
  c = C.setHeat(c, 'rohan', 140);
  assert.equal(C.heatOf(c, 'rohan'), 100, 'clamped');
  c = C.setHeat(c, 'rohan', -5);
  assert.equal(C.heatOf(c, 'rohan'), 0, 'clamped');
  c = C.setHeat(c, 'rohan', 80);
  c = C.cutHeatOnDeath(c, 'rohan');
  assert.ok(Math.abs(C.heatOf(c, 'rohan') - 28) < 1e-9, 'death cut');
  // persistence round-trip
  C.saveCampaign(c);
  const loaded = C.loadCampaign();
  assert.ok(Math.abs(C.heatOf(loaded, 'rohan') - 28) < 1e-9);
  assert.equal(loaded.totalKills, c.totalKills);
  store.set(C.CAMPAIGN_KEY, JSON.stringify({ heat: { rohan: 'hot', mordor: 250, shire: 40 } }));
  const sanitized = C.loadCampaign();
  assert.equal(C.heatOf(sanitized, 'rohan'), 0, 'non-numeric heat dropped');
  assert.equal(C.heatOf(sanitized, 'mordor'), 100, 'over-range heat clamped');
  assert.equal(C.heatOf(sanitized, 'shire'), 40);
});

test('loot inputs: materials stack, weapons carry class + source', () => {
  const inputs = C.lootItemInputs([
    { id: 'orcish-scrap', name: 'Orcish Scrap', qty: 3 },
    { weapon: { id: 'orc-cleaver', name: 'Orcish Cleaver', class: 'blade' } },
    { weapon: { id: 'gondorian-shortbow', name: 'Gondorian Shortbow', class: 'bow' } },
  ]);
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].kind, 'material');
  assert.equal(inputs[0].qty, 3);
  assert.equal(inputs[1].kind, 'weapon');
  assert.equal(inputs[1].meta.weaponClass, 'blade');
  assert.equal(inputs[1].meta.source, 'middle-earth-hunt');
  assert.equal(inputs[2].meta.weaponClass, 'bow');
});

test('backpack bridge: loot and reward land with lawful reticles, weapons qty 1', () => {
  let rec = BP.createBackpackRecord ? BP.createBackpackRecord() : null;
  // fall back to the sanitizer's empty shape if the factory name differs
  if (!rec) rec = BP.sanitizeBackpackRecord(null);
  const loot = [
    { id: 'orcish-scrap', name: 'Orcish Scrap', qty: 3 },
    { weapon: { id: 'gondorian-shortbow', name: 'Gondorian Shortbow', class: 'bow' } },
  ];
  rec = C.applyLootToRecord(rec, loot);
  const scrap = rec.items.find((i) => i.id === 'orcish-scrap');
  assert.ok(scrap && scrap.qty === 3, 'materials stack');
  const bow = rec.items.find((i) => i.id === 'gondorian-shortbow');
  assert.ok(bow && bow.qty === 1, 'weapons qty forced 1');
  assert.equal(bow.meta.reticle.style, 'chevron', 'bow wears the chevron');
  assert.equal(bow.meta.weaponClass, 'bow');
  rec = C.applyRewardToRecord(rec);
  const staff = rec.items.find((i) => i.id === 'staff-of-the-white-wizard');
  assert.ok(staff, 'finale staff lands');
  assert.equal(staff.meta.reticle.style, 'dot', 'staff wears the dot');
  assert.equal(staff.meta.rarity, 'legendary');
});
