// Hollow Earth elemental orbs: user-kill drops + trade.
// Run: node app/hollow-earth/tests/elemental-orbs.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORB_STORAGE_KEY, ORB_ELEMENTS, SPEND_ORDER,
  ORB_COLLECT_RADIUS_M, ORB_DESPAWN_MS, ORB_MAX_LIVE,
  ORB_DROP_SHELL_R, ORB_DROP_CORE_R,
  orbFor, elementForMonster, createOrbDrop, orbExpired, pruneOrbs, collectOrbs,
  createWallet, totalOrbs, addOrb, spendOrbs,
  SHIELD_TIERS, SHIELD_RECHARGE_COST, shieldTierFor, buyShieldTier, rechargeShield, absorbDamage,
  WEAPON_TIERS, weaponTierFor, weaponReady, buyWeaponTier, armBoltElement,
  createProgress, loadProgress, saveProgress,
} from '../elemental-orbs.js';
import { ELEMENTS } from '../spawns.js';

function memStore(initial) {
  const data = initial ? { ...initial } : {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}
function mon(id, element, extra = {}) {
  return { id, type: `t-${id}`, element, x: 10, z: 20, ...extra };
}
function richWallet() {
  // 10 of every element = 70 orbs.
  const w = createWallet();
  for (const el of ELEMENTS) w[el] = 10;
  return w;
}

test('orb numbers are pinned: 3.0 m collect, 120 s despawn, 32 cap, ladder 5/10/15', () => {
  assert.equal(ORB_COLLECT_RADIUS_M, 3.0);
  assert.equal(ORB_DESPAWN_MS, 120000);
  assert.equal(ORB_MAX_LIVE, 32);
  assert.equal(ORB_STORAGE_KEY, 'monsterverse-elemental-orbs-v1');
  assert.deepEqual(SHIELD_TIERS.map((t) => t.cost), [0, 5, 10, 15]);
  assert.deepEqual(SHIELD_TIERS.map((t) => t.max), [0, 25, 50, 100]);
  assert.deepEqual(WEAPON_TIERS.map((t) => t.cost), [0, 5, 10, 15]);
  assert.equal(SHIELD_RECHARGE_COST, 2);
});

test('orb table keys the 7 family elements, not J2 kinds', () => {
  assert.deepEqual(Object.keys(ORB_ELEMENTS).sort(), [...ELEMENTS].sort());
  for (const el of ELEMENTS) {
    const row = orbFor(el);
    assert.ok(row && row.color && row.hex != null && row.icon && row.label);
  }
  assert.equal(orbFor('storm'), null);
  assert.equal(orbFor('dragon'), null);
  assert.equal(orbFor('demobat'), null);
});

test('user-kill drop element matches the family; dragons drop their element too', () => {
  const drop = createOrbDrop({ monster: mon('m-1', 'fire'), killerId: 'user', nowMs: 1000 });
  assert.equal(drop.element, 'fire');
  assert.equal(drop.x, 10);
  assert.equal(drop.z, 20);
  assert.equal(drop.id, 'orb-fire-m-1-1000');
  const dragon = createOrbDrop({
    monster: { id: 'm-9', type: 'sky-dragon', element: 'lightning', x: 5, z: 6, stats: { element: 'lightning', dragon: true } },
    killerId: 'user', nowMs: 2000,
  });
  assert.equal(dragon.element, 'lightning');
  // Element may come from stats when the record carries none.
  const statsOnly = createOrbDrop({ monster: { id: 'm-2', type: 'slot-10', x: 1, z: 2, stats: { element: 'frost' } }, killerId: 'user', nowMs: 3000 });
  assert.equal(statsOnly.element, 'frost');
});

test('monster-kill drops nothing; Korus and Ghorrum drop nothing', () => {
  assert.equal(createOrbDrop({ monster: mon('m-1', 'fire'), killerId: 'm-7', nowMs: 1000 }), null);
  assert.equal(createOrbDrop({ monster: mon('m-1', 'fire'), killerId: null, nowMs: 1000 }), null);
  assert.equal(elementForMonster({ id: 'k', type: 'korus', kind: 'boss', x: 0, z: 0 }), null);
  assert.equal(elementForMonster({ id: 'k', type: 'korus', x: 0, z: 0 }), null);
  assert.equal(elementForMonster({ id: 'g', kind: 'watcher', x: 0, z: 0 }), null);
  assert.equal(elementForMonster({ id: 'g', watcher: true, x: 0, z: 0 }), null);
  assert.equal(elementForMonster(mon('m-3', 'fire', { mounted: true })), null);
  assert.equal(elementForMonster(mon('m-4', 'not-an-element')), null);
  assert.equal(elementForMonster(null), null);
});

test('segment collect: endpoint, midpoint, and the fast-walker case', () => {
  const orb = { id: 'o1', element: 'acid', x: 10, y: 0, z: 0, droppedAtMs: 0 };
  // Standing on it.
  assert.deepEqual(collectOrbs([orb], { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }).collected, [orb]);
  // Stepping over it between ticks: endpoints 14 m apart, orb mid-path.
  const fast = collectOrbs([orb], { x: 3, y: 0, z: 0 }, { x: 17, y: 0, z: 0 });
  assert.deepEqual(fast.collected, [orb]);
  assert.deepEqual(fast.remaining, []);
  // Just outside the radius on the whole segment.
  const miss = collectOrbs([orb], { x: 3, y: 0, z: 3.1 }, { x: 17, y: 0, z: 3.1 });
  assert.deepEqual(miss.collected, []);
  assert.deepEqual(miss.remaining, [orb]);
  // Null positions: no crash, nothing collected.
  assert.deepEqual(collectOrbs([orb], null, null).collected, []);
});

test('120 s expiry and the 32 cap (oldest first out)', () => {
  const fresh = { id: 'f', element: 'fire', x: 0, y: 0, z: 0, droppedAtMs: 1000 };
  assert.equal(orbExpired(fresh, 1000 + 120000), false);
  assert.equal(orbExpired(fresh, 1000 + 120001), true);
  assert.equal(orbExpired(null, 5000), true);
  const many = Array.from({ length: 35 }, (_, i) => ({ id: `o${i}`, element: 'sand', x: i, y: 0, z: 0, droppedAtMs: i * 1000 }));
  const pruned = pruneOrbs(many, 35000);
  assert.equal(pruned.length, 32);
  assert.equal(pruned[0].id, 'o3');
  assert.equal(pruned[31].id, 'o34');
  const mixed = [fresh, { ...fresh, id: 'old', droppedAtMs: 0 }];
  assert.deepEqual(pruneOrbs(mixed, 200000).map((o) => o.id), []);
});

test('wallet round-trips: add, total, any-mix spend in fixed order', () => {
  const w0 = createWallet();
  assert.equal(totalOrbs(w0), 0);
  const w1 = addOrb(addOrb(addOrb(w0, 'fire'), 'fire'), 'frost');
  assert.equal(w1.fire, 2);
  assert.equal(w1.frost, 1);
  assert.equal(totalOrbs(w1), 3);
  assert.equal(addOrb(w1, 'storm').fire, 2); // unknown element ignored
  // Spend drains acid first, poison last.
  const w2 = { acid: 2, fire: 2, lightning: 2, poison: 2, shadow: 2, sand: 2, frost: 2 };
  const spent = spendOrbs(w2, 5);
  assert.deepEqual([spent.acid, spent.fire, spent.lightning, spent.shadow, spent.sand, spent.frost, spent.poison], [0, 0, 1, 2, 2, 2, 2]);
  assert.equal(spendOrbs(w2, 15), null); // cannot cover
  assert.deepEqual(SPEND_ORDER, ['acid', 'fire', 'lightning', 'shadow', 'sand', 'frost', 'poison']);
  const zero = spendOrbs(w2, 0);
  assert.equal(totalOrbs(zero), 14);
});

test('trade ladder: 5/10/15 per track, 30 to max one, 60 both; already-owned and need-orbs', () => {
  const w = richWallet();
  const s1 = buyShieldTier(w, 0, 1);
  assert.equal(s1.ok, true);
  assert.equal(s1.tier, 1);
  assert.equal(totalOrbs(s1.wallet), 65);
  assert.equal(s1.shield, 25);
  // Buying never lowers the shield: a 50-point kill shield survives a tier-1 buy.
  const s1b = buyShieldTier(w, 0, 1, 50);
  assert.equal(s1b.shield, 50);
  assert.deepEqual(buyShieldTier(w, 1, 1), { ok: false, reason: 'already-owned', wallet: w, tier: 1, shield: 0 });
  assert.equal(buyShieldTier(createWallet(), 0, 1).reason, 'need-orbs');
  const b1 = buyWeaponTier(w, 0, 1);
  assert.equal(b1.ok, true);
  assert.equal(b1.tier, 1);
  assert.equal(totalOrbs(b1.wallet), 65);
  assert.equal(buyWeaponTier(w, 2, 1).reason, 'already-owned');
  assert.equal(buyWeaponTier(createWallet(), 0, 3).reason, 'need-orbs');
  // Full ladder: 5 + 10 + 15 = 30 per track, 60 both.
  let wallet = richWallet();
  wallet = spendOrbs(wallet, 5); wallet = spendOrbs(wallet, 10); wallet = spendOrbs(wallet, 15);
  assert.equal(totalOrbs(wallet), 70 - 30);
  // Tier tables.
  assert.deepEqual(WEAPON_TIERS.map((t) => t.dmg), [28, 36, 45, 60]);
  assert.deepEqual(WEAPON_TIERS.map((t) => t.cooldownMs), [800, 700, 600, 500]);
  assert.deepEqual(WEAPON_TIERS.map((t) => t.rangeM), [30, 35, 40, 45]);
  assert.equal(shieldTierFor(99).tier, 3);
  assert.equal(weaponTierFor(-1).tier, 0);
});

test('shield recharge: 2 orbs to full, never without a tier, never when full', () => {
  const w = richWallet();
  const full = rechargeShield(w, 2, 50);
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'already-full');
  const part = rechargeShield(w, 2, 20);
  assert.equal(part.ok, true);
  assert.equal(part.shield, 50);
  assert.equal(totalOrbs(part.wallet), 68);
  assert.equal(rechargeShield(w, 0, 0).reason, 'no-shield');
  assert.equal(rechargeShield(createWallet(), 2, 20).reason, 'need-orbs');
});

test('shield-first routing: shield eats the hit, the rest hits HP', () => {
  assert.deepEqual(absorbDamage(50, 30), { absorbed: 30, remaining: 0, shield: 20, shieldBroken: false });
  assert.deepEqual(absorbDamage(50, 80), { absorbed: 50, remaining: 30, shield: 0, shieldBroken: true });
  assert.deepEqual(absorbDamage(0, 10), { absorbed: 0, remaining: 10, shield: 0, shieldBroken: false });
  assert.deepEqual(absorbDamage(25, 0), { absorbed: 0, remaining: 0, shield: 25, shieldBroken: false });
});

test('weapon cooldown gates fire by tier', () => {
  assert.equal(weaponReady(null, 1000, 0), true);
  assert.equal(weaponReady(1000, 1000 + 799, 0), false);
  assert.equal(weaponReady(1000, 1000 + 800, 0), true);
  assert.equal(weaponReady(1000, 1000 + 499, 3), false);
  assert.equal(weaponReady(1000, 1000 + 500, 3), true);
});

test('progress round-trips through storage; corrupt saves fall back clean', () => {
  const store = memStore();
  assert.deepEqual(loadProgress(store), createProgress());
  const p = { orbs: { ...createWallet(), fire: 7, frost: 2 }, shieldTier: 2, weaponTier: 1, boltElement: null };
  assert.equal(saveProgress(p, store), true);
  assert.deepEqual(loadProgress(store), p);
  const bad = memStore({ [ORB_STORAGE_KEY]: 'not json{' });
  assert.deepEqual(loadProgress(bad), createProgress());
  const partial = memStore({ [ORB_STORAGE_KEY]: JSON.stringify({ orbs: { fire: 3 }, shieldTier: 99 }) });
  const loaded = loadProgress(partial);
  assert.equal(loaded.orbs.fire, 3);
  assert.equal(loaded.orbs.acid, 0);
  assert.equal(loaded.shieldTier, 3); // clamped
  assert.equal(loaded.weaponTier, 0);
  assert.equal(saveProgress(null, null), false); // no storage anywhere: never throws
});

test('orb drop render size is bone-drop scale: shell 0.22 m, core 0.10 m', () => {
  assert.equal(ORB_DROP_SHELL_R, 0.22);
  assert.equal(ORB_DROP_CORE_R, 0.10);
  // Smaller than Earth 2's longest bone (0.9 m), far under the
  // shortest hero (1.15 m halfling) and every monster (scaleM 2.5+).
  assert.ok(ORB_DROP_SHELL_R * 2 < 0.9, 'shell diameter under the longest bone');
  assert.ok(ORB_DROP_SHELL_R * 2 < 1.15, 'shell diameter under the shortest hero');
});

test('bolt arming: free loadout choice, round-trips, unknown disarms', () => {
  const p = createProgress();
  assert.equal(p.boltElement, null, 'a fresh wallet arms nothing');
  assert.equal(armBoltElement(p, 'fire').boltElement, 'fire');
  assert.equal(armBoltElement(p, 'storm').boltElement, null, 'unknown element disarms, never throws');
  assert.equal(armBoltElement(p, null).boltElement, null);
  assert.equal(armBoltElement(null, 'frost').boltElement, 'frost', 'null progress still arms');
  for (const el of ELEMENTS) assert.equal(armBoltElement(p, el).boltElement, el);
  // Round-trip through storage, and old saves without the field load unarmed.
  const store = memStore();
  assert.equal(saveProgress(armBoltElement(p, 'acid'), store), true);
  assert.equal(loadProgress(store).boltElement, 'acid');
  const old = memStore({ [ORB_STORAGE_KEY]: JSON.stringify({ orbs: { fire: 3 }, shieldTier: 1, weaponTier: 0 }) });
  assert.equal(loadProgress(old).boltElement, null, 'pre-arm saves load unarmed');
  const bad = memStore({ [ORB_STORAGE_KEY]: JSON.stringify({ orbs: {}, boltElement: 'storm' }) });
  assert.equal(loadProgress(bad).boltElement, null, 'an unknown saved element loads unarmed');
});
