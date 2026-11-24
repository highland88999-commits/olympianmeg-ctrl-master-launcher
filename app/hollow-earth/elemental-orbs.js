// app/hollow-earth/elemental-orbs.js — ELEMENTAL ORB DROPS + TRADE
// (Merlin, Nov 16 ~01:52, MonsterVerse round phase 2 — DROPS + TRADE).
//
// Merlin's decision: "Hollow Earth YES, gets J2's orb drop AND
// trade (full loop, replaces the device-local-only drops design)."
// This is the MonsterVerse flavour of lib/jupiter2/elemental-orbs.js
// — read in full first, shapes mirrored, keyed by the 7 ELEMENTS
// (spawns.js:51) instead of J2's three lightning kinds.
//
//   * A monster killed by the USER drops one orb of its family
//     element (dragons drop their element too). Monster-vs-monster
//     kills drop NOTHING — mirrors J2 and the existing Hollow Earth
//     law that monster kills pay no hunter reward (spawns.js).
//     Korus drops nothing extra (his reward is already Stormfang);
//     Ghorrum is never killed.
//   * Collect by walking over: 3.0 m radius, path-segment check,
//     so a fast walker cannot step over a drop between ticks.
//   * Despawn 120 s; max 32 live orbs (oldest despawns first).
//   * TRADE (the J2 loop, Hollow Earth flavour): orbs buy SHIELD
//     tiers/recharge + RANGED-WEAPON (bolt) tiers. Hollow Earth
//     has no speeder, so the "blaster" is the hunter's ranged
//     attack (bolt-visual.js firearm/bow/spell — the bolt the
//     hunter already throws). Shield is the existing HE shield
//     (applyDamage shield-first); the trade adds tiers/recharge
//     on top, following J2's shield-tier shape.
//   * COST RULE (worker's call): ANY orbs pay, in fixed spend
//     order acid → fire → lightning → shadow → sand → frost →
//     poison — common elements drain first, the rarest (poison,
//     which has no live source today) drains last. No
//     element-specific prices: with poison at 0 placed families
//     and frost at 1, element-locked costs would make the trade
//     unusable until Tripo re-sends land.
//   * PERSISTENCE — device-local localStorage, key
//     'monsterverse-elemental-orbs-v1', per-world and separate
//     from J2's 'jupiter2-elemental-orbs-v1'; orbs do not transfer
//     between worlds. No server table, no SQL — nothing here needs
//     Merlin's green light. The shield CHARGE itself is NOT stored
//     here: the campaign already owns it (data.js setShield), so
//     this progress stores only { orbs, shieldTier, weaponTier }.
//   * NOT a currency: no aether, no gold, no conversion, no
//     wallet credit, no redemption. Orbs buy shield/weapon only.
//
// NUMBERS — all the worker's call, stated plainly (Merlin ordered
// the features, not the numbers):
//   * COLLECT 3.0 m (J2's number), DESPAWN 120 s, CAP 32 (J2's).
//   * TRADE LADDER 5 / 10 / 15 orbs per track (J2's ladder —
//     30 orbs to max one track, 60 both; one orb per user kill).
//   * SHIELD tiers 25 / 50 / 100, recharge 2 orbs (J2's values:
//     the 30-kill shield is 50, so tier 2 matches the earned
//     shield and tier 3 beats it). Buying a tier never lowers
//     the shield: the charge becomes max(current, tier max).
//   * BOLT tiers — calibrated against monster HP 100–200
//     (spawns.js HP band rule) and the stock bolt (WEAPONS.bolt:
//     28 dmg / 0.8 s / 30 m): stock 28 = 4 shots on a 100 HP
//     monster; tier 1, 36 dmg / 0.7 s / 35 m; tier 2, 45 dmg /
//     0.6 s / 40 m; tier 3, 60 dmg / 0.5 s / 45 m = 2 shots on
//     100 HP. Range stays inside the 59 m lightning aura — the
//     bolt never out-ranges the danger, unlike J2's 60 m blaster.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly; the scene only calls it.

import { ELEMENTS } from './spawns.js';

/** localStorage key for the MonsterVerse orb wallet + upgrades. */
export const ORB_STORAGE_KEY = 'monsterverse-elemental-orbs-v1';

/** Orb definitions, keyed by the 7 family elements. `hex` is the
 * THREE number (spawns.js ELEMENT_COLORS); `color` is its CSS hex. */
export const ORB_ELEMENTS = Object.freeze({
  acid: Object.freeze({ element: 'acid', label: 'Acid', icon: '🧪', color: '#8fd43a', hex: 0x8fd43a }),
  fire: Object.freeze({ element: 'fire', label: 'Fire', icon: '🔥', color: '#ff6a22', hex: 0xff6a22 }),
  lightning: Object.freeze({ element: 'lightning', label: 'Lightning', icon: '⚡', color: '#ffe14d', hex: 0xffe14d }),
  poison: Object.freeze({ element: 'poison', label: 'Poison', icon: '☠️', color: '#c06ae0', hex: 0xc06ae0 }),
  shadow: Object.freeze({ element: 'shadow', label: 'Shadow', icon: '🌑', color: '#8a8a9a', hex: 0x8a8a9a }),
  sand: Object.freeze({ element: 'sand', label: 'Sand', icon: '🏜️', color: '#e8c87a', hex: 0xe8c87a }),
  frost: Object.freeze({ element: 'frost', label: 'Frost', icon: '❄️', color: '#9fd8e8', hex: 0x9fd8e8 }),
});

/** Drop render size (zone.js syncOrbDrops): the shell radius +
 * core radius of a live orb on the field. Bone-drop scale
 * (Merlin, Nov 24 ~08:05 — orbs smaller than the user and the
 * monsters, comparable to the Earth 2 bone drops): Earth 2's
 * bone pile (components/earth2/Earth2World.jsx spawnBones) is
 * four 0.9 m bones, 0.14 m thick, in a ~0.3 m footprint — so
 * the orb shell is 0.22 m radius (0.44 m across), smaller than
 * the longest bone and far under the shortest hero (1.15 m
 * halfling) and every monster (scaleM 2.5+). */
export const ORB_DROP_SHELL_R = 0.22;
export const ORB_DROP_CORE_R = 0.10;

/** Spend order for any-mix costs: common elements drain first,
 * the rarest (poison — no live source today) drains last. */
export const SPEND_ORDER = Object.freeze(['acid', 'fire', 'lightning', 'shadow', 'sand', 'frost', 'poison']);

/** The orb definition for an element, or null. */
export function orbFor(element) {
  return ORB_ELEMENTS[element] || null;
}

/**
 * The element a monster record drops, or null when it drops
 * nothing. Korus (type 'korus' / kind 'boss') and Ghorrum (kind
 * 'watcher') are EXEMPT — they are never monster records, and
 * this refuses their shapes outright anyway. Mounted monsters
 * are the rider's own and are never strike targets. Unknown
 * elements drop nothing.
 */
export function elementForMonster(monster) {
  if (!monster) return null;
  if (monster.type === 'korus' || monster.kind === 'boss') return null;
  if (monster.kind === 'watcher' || monster.watcher === true) return null;
  if (monster.mounted) return null;
  const element = monster.element || (monster.stats && monster.stats.element) || null;
  return ORB_ELEMENTS[element] ? element : null;
}

// ── Drops + collection ──────────────────────────────────────────

/** Walk-over collect radius (m) — J2's number, same law. */
export const ORB_COLLECT_RADIUS_M = 3.0;
/** An uncollected orb fades after this long (ms). */
export const ORB_DESPAWN_MS = 120000;
/** At most this many live orbs — the oldest despawns first. */
export const ORB_MAX_LIVE = 32;

/**
 * One dropped orb: the creature's family element, its death
 * point, and when it dropped. User-kill ONLY: killerId must be
 * 'user' (the page passes 'user' at the damageMonster kill site;
 * monster-vs-monster kills never reach this call). Returns null
 * when nothing drops. `id` is unique per drop (element +
 * monster id + diedAtMs).
 */
export function createOrbDrop({ monster, killerId = 'user', position, nowMs = Date.now() }) {
  if (killerId !== 'user') return null;
  const element = elementForMonster(monster);
  if (!element) return null;
  const pos = position || monster;
  if (!pos || pos.x == null || pos.z == null) return null;
  const monsterId = (monster && monster.id) || 'unknown';
  return {
    id: `orb-${element}-${monsterId}-${nowMs}`,
    element,
    x: pos.x || 0,
    y: pos.y || 0,
    z: pos.z || 0,
    droppedAtMs: nowMs,
  };
}

/** True when the orb has outlived its despawn window. */
export function orbExpired(orb, nowMs = Date.now()) {
  if (!orb) return true;
  return nowMs - (orb.droppedAtMs || 0) > ORB_DESPAWN_MS;
}

/** Drop the expired orbs and enforce the live cap (oldest first out). Returns a new array. */
export function pruneOrbs(orbs, nowMs = Date.now()) {
  const live = (Array.isArray(orbs) ? orbs : []).filter((o) => !orbExpired(o, nowMs));
  if (live.length <= ORB_MAX_LIVE) return live;
  return live.slice(live.length - ORB_MAX_LIVE);
}

function distPointToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 0) {
    t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

/**
 * The orbs the walker collects on this tick: within the collect
 * radius of the path segment from `prevPos` to `pos` (3D — the
 * walker rides a sphere, so y matters). `prevPos` may equal `pos`
 * (standing still); pass null for either and the check uses the
 * other as a point. Returns { collected, remaining } — new arrays.
 */
export function collectOrbs(orbs, prevPos, pos, radiusM = ORB_COLLECT_RADIUS_M) {
  const list = Array.isArray(orbs) ? orbs : [];
  const a = prevPos || pos;
  const b = pos || prevPos;
  if (!a || !b) return { collected: [], remaining: list.slice() };
  const collected = [];
  const remaining = [];
  for (const orb of list) {
    if (distPointToSegment(orb, a, b) <= radiusM) collected.push(orb);
    else remaining.push(orb);
  }
  return { collected, remaining };
}

// ── Wallet ──────────────────────────────────────────────────────

/** Fresh empty wallet: one count per orb element. */
export function createWallet() {
  const wallet = {};
  for (const el of ELEMENTS) wallet[el] = 0;
  return wallet;
}

/** Total orbs in a wallet, any mix. */
export function totalOrbs(wallet) {
  if (!wallet) return 0;
  let total = 0;
  for (const el of ELEMENTS) total += Math.max(0, Math.floor(wallet[el]) || 0);
  return total;
}

/** A wallet with one more orb of `element` (unknown elements are ignored). Returns a new wallet. */
export function addOrb(wallet, element) {
  const next = { ...createWallet(), ...(wallet || {}) };
  if (ORB_ELEMENTS[element]) next[element] = Math.max(0, Math.floor(next[element]) || 0) + 1;
  return next;
}

/**
 * Spend `cost` orbs from a wallet, draining in SPEND_ORDER
 * (any mix pays). Returns the new wallet, or null when the
 * wallet cannot cover the cost.
 */
export function spendOrbs(wallet, cost) {
  const n = Math.max(0, Math.floor(Number(cost) || 0));
  if (n === 0) return { ...createWallet(), ...(wallet || {}) };
  if (totalOrbs(wallet) < n) return null;
  const next = { ...createWallet(), ...(wallet || {}) };
  let left = n;
  for (const el of SPEND_ORDER) {
    const take = Math.min(next[el] || 0, left);
    next[el] -= take;
    left -= take;
    if (left <= 0) break;
  }
  return next;
}

// ── Shields (bought capacity — the Hollow Earth shield-first law) ──

/** Shield tiers: bought max absorb + cost in orbs. Tier 0 is no bought shield. */
export const SHIELD_TIERS = Object.freeze([
  Object.freeze({ tier: 0, max: 0, cost: 0, label: 'No shield' }),
  Object.freeze({ tier: 1, max: 25, cost: 5, label: 'Hollowguard 25' }),
  Object.freeze({ tier: 2, max: 50, cost: 10, label: 'Hollowguard 50' }),
  Object.freeze({ tier: 3, max: 100, cost: 15, label: 'Hollowguard 100' }),
]);

/** Orbs to recharge a part-broken shield back to full (any tier above 0). */
export const SHIELD_RECHARGE_COST = 2;

/** The shield tier definition for a tier number (clamped 0..3). */
export function shieldTierFor(tier) {
  const t = Math.max(0, Math.min(SHIELD_TIERS.length - 1, Math.floor(Number(tier) || 0)));
  return SHIELD_TIERS[t];
}

/**
 * Buy a shield tier with a wallet. Returns { ok, wallet, tier,
 * shield } — ok false with reason 'already-owned' (tier not
 * above the current one) or 'need-orbs'. Buying never lowers
 * the shield: the charge becomes max(currentShield, tier max)
 * — so a 50-point 30-kill shield is never downgraded by buying
 * tier 1 (25). The caller applies the returned shield.
 */
export function buyShieldTier(wallet, currentTier, tier, currentShield = 0) {
  const cur = Math.max(0, Math.floor(Number(currentTier) || 0));
  const target = shieldTierFor(tier);
  if (target.tier <= cur) {
    return { ok: false, reason: 'already-owned', wallet, tier: cur, shield: Math.max(0, Number(currentShield) || 0) };
  }
  const next = spendOrbs(wallet, target.cost);
  if (!next) return { ok: false, reason: 'need-orbs', wallet, tier: cur, shield: Math.max(0, Number(currentShield) || 0) };
  return { ok: true, wallet: next, tier: target.tier, shield: Math.max(Number(currentShield) || 0, target.max) };
}

/**
 * Recharge a part-broken bought shield back to its tier max.
 * Returns { ok, wallet, shield } — ok false with reason
 * 'no-shield' (no tier owned), 'already-full', or 'need-orbs'.
 * The 30-kill shield is NOT rechargeable here: it has no tier,
 * and its next grant comes at the next 30-kill milestone.
 */
export function rechargeShield(wallet, tier, shield) {
  const t = shieldTierFor(tier);
  const cur = Math.max(0, Number(shield) || 0);
  if (t.tier <= 0 || t.max <= 0) return { ok: false, reason: 'no-shield', wallet, shield: cur };
  if (cur >= t.max) return { ok: false, reason: 'already-full', wallet, shield: cur };
  const next = spendOrbs(wallet, SHIELD_RECHARGE_COST);
  if (!next) return { ok: false, reason: 'need-orbs', wallet, shield: cur };
  return { ok: true, wallet: next, shield: t.max };
}

/**
 * Route incoming damage through a shield first (Hollow Earth
 * applyDamage, spawns.js): the shield absorbs what it can, the
 * rest is the damage that reaches HP.
 */
export function absorbDamage(shield, dmg) {
  const s = Math.max(0, Number(shield) || 0);
  const d = Math.max(0, Number(dmg) || 0);
  const absorbed = Math.min(s, d);
  return {
    absorbed,
    remaining: d - absorbed,
    shield: s - absorbed,
    shieldBroken: absorbed > 0 && s - absorbed === 0,
  };
}

// ── Ranged weapon (bolt) ────────────────────────────────────────

/**
 * Bolt tiers: damage per shot, cooldown, range, cost in orbs.
 * Stock is WEAPONS.bolt (spawns.js): 28 dmg / 0.8 s / 30 m.
 * Tier 3 (60 dmg) kills a 100 HP monster in 2 shots; range
 * stays inside the 59 m lightning aura.
 */
export const WEAPON_TIERS = Object.freeze([
  Object.freeze({ tier: 0, dmg: 28, cooldownMs: 800, rangeM: 30, cost: 0, label: 'Stock bolt' }),
  Object.freeze({ tier: 1, dmg: 36, cooldownMs: 700, rangeM: 35, cost: 5, label: 'Bolt Mk II' }),
  Object.freeze({ tier: 2, dmg: 45, cooldownMs: 600, rangeM: 40, cost: 10, label: 'Bolt Mk III' }),
  Object.freeze({ tier: 3, dmg: 60, cooldownMs: 500, rangeM: 45, cost: 15, label: 'Bolt Mk IV' }),
]);

/** The bolt tier definition for a tier number (clamped 0..3). */
export function weaponTierFor(tier) {
  const t = Math.max(0, Math.min(WEAPON_TIERS.length - 1, Math.floor(Number(tier) || 0)));
  return WEAPON_TIERS[t];
}

/** True when the bolt may fire now (cooldown open). */
export function weaponReady(lastShotMs, nowMs, tier = 0) {
  if (lastShotMs == null) return true;
  return nowMs - lastShotMs >= weaponTierFor(tier).cooldownMs;
}

/**
 * Buy a bolt tier with a wallet. Returns { ok, wallet, tier }
 * — ok false with reason 'already-owned' or 'need-orbs'.
 */
export function buyWeaponTier(wallet, currentTier, tier) {
  const cur = Math.max(0, Math.floor(Number(currentTier) || 0));
  const target = weaponTierFor(tier);
  if (target.tier <= cur) {
    return { ok: false, reason: 'already-owned', wallet, tier: cur };
  }
  const next = spendOrbs(wallet, target.cost);
  if (!next) return { ok: false, reason: 'need-orbs', wallet, tier: cur };
  return { ok: true, wallet: next, tier: target.tier };
}

// ── Persistence (device-local localStorage — the J2 pattern) ────

/** Fresh progress: empty wallet, no upgrades. The shield charge
 * lives in the campaign (data.js), never here. */
export function createProgress() {
  return { orbs: createWallet(), shieldTier: 0, weaponTier: 0, boltElement: null };
}

/**
 * Arm the hunter's bolt with an element (or disarm with null).
 * A free loadout choice — arming costs no orbs; it only decides
 * which element the next ranged strikes carry, so the bolt has
 * a secondary where an element applies and stays flat where
 * none does. Unknown elements disarm (null), never throw.
 * Returns a new progress object.
 */
export function armBoltElement(progress, element) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  return { ...base, boltElement: ORB_ELEMENTS[element] ? element : null };
}

/**
 * Load saved progress from a storage (defaults to global
 * localStorage when present). Corrupt or partial saves fall back
 * to the sane parts, never throw.
 */
export function loadProgress(storage) {
  const fallback = createProgress();
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return fallback;
    const raw = store.getItem(ORB_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const orbs = { ...createWallet(), ...((parsed.orbs && typeof parsed.orbs === 'object') ? parsed.orbs : {}) };
    for (const el of ELEMENTS) orbs[el] = Math.max(0, Math.floor(Number(orbs[el]) || 0));
    const shieldTier = shieldTierFor(parsed.shieldTier).tier;
    const weaponTier = weaponTierFor(parsed.weaponTier).tier;
    const boltElement = ORB_ELEMENTS[parsed.boltElement] ? parsed.boltElement : null;
    return { orbs, shieldTier, weaponTier, boltElement };
  } catch {
    return fallback;
  }
}

/** Save progress to a storage (defaults to global localStorage when present). Never throws. */
export function saveProgress(progress, storage) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    const p = progress || createProgress();
    store.setItem(ORB_STORAGE_KEY, JSON.stringify({
      orbs: { ...createWallet(), ...(p.orbs || {}) },
      shieldTier: shieldTierFor(p.shieldTier).tier,
      weaponTier: weaponTierFor(p.weaponTier).tier,
      boltElement: ORB_ELEMENTS[p.boltElement] ? p.boltElement : null,
    }));
    return true;
  } catch {
    return false;
  }
}
